import { supabase } from '../lib/supabase';
import { KnowledgeItem, MasterData, User } from '../types';

// DB行 → KnowledgeItem の変換
function toItem(row: Record<string, unknown>): KnowledgeItem {
    return {
        id: row.id as string,
        title: row.title as string,
        machine: row.machine as string,
        property: row.property as string,
        req_num: row.req_num as string,
        category: row.category as string,
        incidents: (row.incidents as string[]) ?? [],
        tags: (row.tags as string[]) ?? [],
        content: row.content as string,
        status: row.status as 'solved' | 'unsolved',
        updatedAt: row.updated_at as string,
        author: row.author as string,
    };
}

export const apiClient = {
    async fetchAll(): Promise<KnowledgeItem[]> {
        const { data, error } = await supabase
            .from('knowledge')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return (data ?? []).map(toItem);
    },

    async fetchMasters(): Promise<MasterData> {
        const [{ data: incidents }, { data: categories }, { data: profiles }] = await Promise.all([
            supabase.from('master_incidents').select('name').order('name'),
            supabase.from('master_categories').select('name').order('name'),
            supabase.from('profiles').select('id, display_name, knl_role').order('display_name'),
        ]);

        return {
            incidents: (incidents ?? []).map((r: { name: string }) => r.name),
            categories: (categories ?? []).map((r: { name: string }) => r.name),
            users: (profiles ?? []).map((p: { id: string; display_name: string; knl_role: string }) => ({
                id: p.id,
                name: p.display_name ?? '',
                role: (p.knl_role as User['role']) ?? 'viewer',
            })),
        };
    },

    async save(item: KnowledgeItem): Promise<void> {
        const { error } = await supabase
            .from('knowledge')
            .upsert({
                id: item.id,
                title: item.title,
                machine: item.machine,
                property: item.property,
                req_num: item.req_num,
                category: item.category,
                incidents: item.incidents,
                tags: item.tags,
                content: item.content,
                status: item.status,
                updated_at: item.updatedAt,
                author: item.author,
            });

        if (error) throw error;
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('knowledge')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async updateMasters(data: { incidents: string[]; categories: string[]; users: User[] }): Promise<void> {
        // インシデント・区分を全置換
        const [incDel, catDel] = await Promise.all([
            supabase.from('master_incidents').delete().neq('name', ''),
            supabase.from('master_categories').delete().neq('name', ''),
        ]);
        if (incDel.error) throw incDel.error;
        if (catDel.error) throw catDel.error;

        if (data.incidents.length > 0) {
            const { error } = await supabase.from('master_incidents').insert(data.incidents.map(name => ({ name })));
            if (error) throw error;
        }
        if (data.categories.length > 0) {
            const { error } = await supabase.from('master_categories').insert(data.categories.map(name => ({ name })));
            if (error) throw error;
        }

        // ユーザーは profiles.knl_role のみ更新（SSO管理のためユーザー追加・削除はしない）
        for (const u of data.users) {
            const { error } = await supabase.from('profiles').update({ knl_role: u.role }).eq('id', u.id);
            if (error) throw error;
        }
    },
};
