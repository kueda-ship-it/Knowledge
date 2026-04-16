import { supabase } from '../lib/supabase';
import { supabaseEquipment } from '../lib/supabaseEquipment';
import { KnowledgeItem, MasterData, User, Attachment, EditHistory, AppNotification } from '../types';

// DB行 → KnowledgeItem の変換
export function toItem(row: Record<string, unknown>): KnowledgeItem {
    const rawContent = (row.content as string) ?? '';
    const rawPhenomenon = (row.phenomenon as string) ?? '';
    const rawCountermeasure = (row.countermeasure as string) ?? '';

    return {
        id: row.id as string,
        title: row.title as string,
        machine: row.machine as string,
        property: row.property as string,
        req_num: row.req_num as string,
        category: row.category as string,
        incidents: (row.incidents as string[]) ?? [],
        tags: (row.tags as string[]) ?? [],
        content: rawContent,
        phenomenon: rawPhenomenon || rawContent, // phenomenonが空ならcontentをセット
        countermeasure: rawCountermeasure || (rawPhenomenon ? rawContent : ''), // phenomenonがあった上でのcontentなら対処とする(旧形式互換)
        status: row.status as 'solved' | 'unsolved',
        updatedAt: row.updated_at as string,
        author: row.author as string,
        attachments: (row.attachments as Attachment[]) ?? [],
    };
}

export const apiClient = {
    async fetchAll(currentUserId?: string): Promise<KnowledgeItem[]> {
        // Fetch items and their reaction counts
        const { data, error } = await supabase
            .from('knowledge')
            .select(`
                id, title, machine, property, req_num, category,
                incidents, tags, status, updated_at, author, attachments,
                knowledge_reactions(type, user_id)
            `)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        
        return (data ?? []).map(row => {
            const item = toItem(row);
            const reactions = (row.knowledge_reactions as any[]) || [];
            item.likeCount = reactions.filter(r => r.type === 'like').length;
            item.wrongCount = reactions.filter(r => r.type === 'wrong').length;
            
            if (currentUserId) {
                const my = reactions.find(r => r.user_id === currentUserId);
                item.myReaction = my ? my.type : null;
            }
            return item;
        });
    },

    async fetchOne(id: string, currentUserId?: string): Promise<KnowledgeItem | null> {
        const { data, error } = await supabase
            .from('knowledge')
            .select(`
                id, title, machine, property, req_num, category,
                incidents, tags, content, phenomenon, countermeasure, status, updated_at, author, attachments,
                knowledge_reactions(type, user_id)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return null;

        const item = toItem(data);
        const reactions = (data.knowledge_reactions as any[]) || [];
        item.likeCount = reactions.filter(r => r.type === 'like').length;
        item.wrongCount = reactions.filter(r => r.type === 'wrong').length;
        if (currentUserId) {
            const my = reactions.find(r => r.user_id === currentUserId);
            item.myReaction = my ? my.type : null;
        }
        return item;
    },

    async fetchMasters(): Promise<MasterData> {
        const [{ data: incidents }, { data: categories }, { data: profiles }] = await Promise.all([
            supabase.from('master_incidents').select('name').order('name'),
            supabase.from('master_categories').select('name').order('name'),
            supabase.from('profiles').select('id, email, display_name, knl_role, avatar_url').order('display_name'),
        ]);

        return {
            incidents: (incidents ?? []).map((r: { name: string }) => r.name),
            categories: (categories ?? []).map((r: { name: string }) => r.name),
            users: (profiles ?? []).map((p: any) => ({
                id: p.id,
                name: p.display_name ?? '',
                email: p.email ?? '',
                avatarUrl: p.avatar_url ?? '',
                role: (p.knl_role as User['role']) ?? 'viewer',
            })),
        };
    },

    async save(item: KnowledgeItem, oldItem?: KnowledgeItem): Promise<void> {
        // 1. Save knowledge
        const { data: saved, error } = await supabase
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
                phenomenon: item.phenomenon ?? '',
                countermeasure: item.countermeasure ?? '',
                status: item.status,
                updated_at: item.updatedAt,
                author: item.author,
                attachments: item.attachments ?? [],
            })
            .select('id');

        if (error) throw error;
        // RLSによるサイレント失敗を検出（エラーなしで書き込まれない場合）
        if (!saved || saved.length === 0) {
            throw new Error('Supabaseへの保存が権限により拒否されました（RLSポリシーを確認してください）');
        }

        // 2. Record history if there's a change in content or title
        if (oldItem && (oldItem.content !== item.content || oldItem.title !== item.title || oldItem.status !== item.status)) {
            await supabase.from('knowledge_history').insert({
                knowledge_id: item.id,
                changed_by: item.author,
                old_content: oldItem.content,
                new_content: item.content,
                comment: oldItem.status !== item.status ? `Status changed to ${item.status}` : 'Content updated'
            });
            
            // 3. Notify author if someone else edited
            if (oldItem.author !== item.author) {
                // Find author profile to get ID
                const { data: authorProf } = await supabase.from('profiles').select('id').eq('display_name', oldItem.author).maybeSingle();
                if (authorProf) {
                    await this.createNotification(authorProf.id, item.author, 'edited', item.id);
                }
            }
        }
    },

    async toggleReaction(knowledgeId: string, userId: string, type: 'like' | 'wrong', comment?: string): Promise<void> {
        // Check if exists
        const { data: existing } = await supabase
            .from('knowledge_reactions')
            .select('*')
            .eq('knowledge_id', knowledgeId)
            .eq('user_id', userId)
            .eq('type', type)
            .maybeSingle();

        if (existing) {
            // Delete
            await supabase.from('knowledge_reactions').delete().eq('id', existing.id);
        } else {
            // Remove other types of reactions from this user for this item first (exclusive choice)
            await supabase.from('knowledge_reactions').delete().eq('knowledge_id', knowledgeId).eq('user_id', userId);
            
            // Insert
            const { error } = await supabase.from('knowledge_reactions').insert({
                knowledge_id: knowledgeId,
                user_id: userId,
                type: type,
                comment: comment
            });
            if (error) throw error;
            
            // Notify author if someone else reacted
            const { data: knl } = await supabase.from('knowledge').select('author').eq('id', knowledgeId).single();
            if (knl && knl.author) {
                const { data: authorProf } = await supabase.from('profiles').select('id').eq('display_name', knl.author).maybeSingle();
                if (authorProf && authorProf.id !== userId) {
                    // Fetch sender name
                    const { data: me } = await supabase.from('profiles').select('display_name').eq('id', userId).single();
                    await this.createNotification(authorProf.id, me?.display_name || 'Someone', type, knowledgeId);
                }
            }
        }
    },

    async fetchHistory(knowledgeId: string): Promise<EditHistory[]> {
        const { data, error } = await supabase
            .from('knowledge_history')
            .select('*')
            .eq('knowledge_id', knowledgeId)
            .order('updated_at', { ascending: false });
        
        if (error) throw error;
        return (data ?? []).map(row => ({
            id: row.id,
            knowledgeId: row.knowledge_id,
            changedBy: row.changed_by,
            oldContent: row.old_content,
            newContent: row.new_content,
            comment: row.comment,
            updatedAt: row.updated_at
        }));
    },

    async fetchNotifications(userId: string): Promise<AppNotification[]> {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('recipient_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        return (data ?? []).map(row => ({
            id: row.id,
            recipient_id: row.recipient_id,
            sender_name: row.sender_name,
            type: row.type as any,
            knowledge_id: row.knowledge_id,
            is_read: row.is_read,
            created_at: row.created_at
        }));
    },

    async markNotificationAsRead(id: string): Promise<void> {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    },

    async createNotification(recipientId: string, senderName: string, type: string, knowledgeId: string): Promise<void> {
        await supabase.from('notifications').insert({
            recipient_id: recipientId,
            sender_name: senderName,
            type: type,
            knowledge_id: knowledgeId
        });
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('knowledge')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async updateMasters(data: { incidents: string[]; categories: string[]; users: User[] }): Promise<void> {
        console.log("Updating masters with data:", data);
        
        // 1. Sync Incidents
        try {
            const { data: currentIncidents } = await supabase.from('master_incidents').select('name');
            const currentNames = (currentIncidents ?? []).map(r => r.name);
            
            // 削除対象: 現在のリストにあるが、新しいデータにはないもの
            const toDelete = currentNames.filter(n => !data.incidents.includes(n));
            // 追加対象: 新しいデータにあるが、現在のリストにはないもの
            const toAdd = data.incidents.filter(n => !currentNames.includes(n));

            if (toDelete.length > 0) {
                await supabase.from('master_incidents').delete().in('name', toDelete);
            }
            if (toAdd.length > 0) {
                await supabase.from('master_incidents').insert(toAdd.map(name => ({ name })));
            }
        } catch (e) {
            console.error("Failed to sync incidents:", e);
            throw e;
        }

        // 2. Sync Categories
        try {
            const { data: currentCats } = await supabase.from('master_categories').select('name');
            const currentCatNames = (currentCats ?? []).map(r => r.name);
            
            const toDeleteCat = currentCatNames.filter(n => !data.categories.includes(n));
            const toAddCat = data.categories.filter(n => !currentCatNames.includes(n));

            if (toDeleteCat.length > 0) {
                await supabase.from('master_categories').delete().in('name', toDeleteCat);
            }
            if (toAddCat.length > 0) {
                await supabase.from('master_categories').insert(toAddCat.map(name => ({ name })));
            }
        } catch (e) {
            console.error("Failed to sync categories:", e);
            throw e;
        }

        // 3. Sync Users (Profiles)
        try {
            for (const u of data.users) {
                const isNew = u.id.startsWith('new-');
                const upsertData: any = {
                    email: u.email,
                    display_name: u.name,
                    knl_role: u.role,
                    updated_at: new Date().toISOString()
                };
                
                if (isNew) {
                    // ID競合を避けるため、新規ユーザーのみID生成
                    upsertData.id = self.crypto.randomUUID();
                } else {
                    upsertData.id = u.id;
                }

                const { error: userErr } = await supabase.from('profiles').upsert(upsertData, { onConflict: 'id' });
                if (userErr) throw userErr;
            }
        } catch (e) {
            console.error("Failed to sync users:", e);
            throw e;
        }
    },

    async fetchPropertyNameByMachine(gouki: string): Promise<string | null> {
        if (!supabaseEquipment) return null;
        
        try {
            const { data, error } = await supabaseEquipment
                .from('cc_properties')
                .select('name')
                .eq('gouki', gouki)
                .maybeSingle();
            
            if (error) {
                console.error("Failed to fetch property name from equipment DB:", error);
                return null;
            }
            
            return data?.name || null;
        } catch (e) {
            console.error("External DB Error:", e);
            return null;
        }
    },

    // Operational Proposals (運用提議)
    async fetchProposals(): Promise<any[]> {
        let { data, error } = await supabase
            .from('operational_proposals')
            .select('*')
            .order('proposed_at', { ascending: false });

        // proposed_at カラムがない場合は created_at でフォールバック
        if (error && error.message?.includes('proposed_at')) {
            console.warn('[fetchProposals] proposed_at column missing, falling back to created_at');
            const result = await supabase
                .from('operational_proposals')
                .select('*')
                .order('created_at', { ascending: false });
            data = result.data;
            error = result.error;
        }

        if (error) {
            console.error('[fetchProposals] error:', error.message, error.details, error.hint);
            throw error;
        }
        console.log('[fetchProposals] loaded:', data?.length ?? 0, 'proposals');
        return data ?? [];
    },

    async updateProposalStatus(id: string, status: string): Promise<void> {
        const { error } = await supabase
            .from('operational_proposals')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);
        
        if (error) throw error;
    },

    async getNextProposalNo(category: string): Promise<string> {
        const { data, error } = await supabase
            .from('operational_proposals')
            .select('source_no')
            .eq('category', category);

        if (error) throw error;

        const maxNo = (data ?? []).reduce((max, row) => {
            const n = parseInt(row.source_no || '0', 10);
            return n > max ? n : max;
        }, 0);

        return String(maxNo + 1);
    },

    async createProposal(proposal: Partial<any>): Promise<void> {
        // source_no が未指定なら種別ごとに自動採番
        const record = { ...proposal };
        if (!record.source_no && record.category) {
            record.source_no = await apiClient.getNextProposalNo(record.category);
        }

        const { error } = await supabase
            .from('operational_proposals')
            .insert(record);

        if (error) throw error;
    },

    // Master Data Realtime
    subscribeMasters(callback: () => void) {
        const channel = supabase.channel('master-data-sync');
        
        channel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'master_categories' }, callback)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'master_incidents' }, callback)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, callback)
            .subscribe();

        return channel;
    },

    unsubscribeMasters(channel: any) {
        if (channel) {
            supabase.removeChannel(channel);
        }
    }
};
