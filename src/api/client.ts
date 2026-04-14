import { supabase } from '../lib/supabase';
import { supabaseEquipment } from '../lib/supabaseEquipment';
import { KnowledgeItem, MasterData, User, Attachment, EditHistory, AppNotification } from '../types';

// DB行 → KnowledgeItem の変換
export function toItem(row: Record<string, unknown>): KnowledgeItem {
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
            // Get current ones to see if we need to do anything
            const { data: currentIncidents } = await supabase.from('master_incidents').select('name');
            const currentNames = (currentIncidents ?? []).map(r => r.name);
            
            // Delete all and re-insert is risky but simple for this scale. 
            // Better: Delete only those NOT in the new list.
            const { error: delErr } = await supabase.from('master_incidents').delete().filter('name', 'in', `(${currentNames.map(n => `"${n}"`).join(',') || '""'})`);
            if (delErr) console.warn("Incident delete error (non-fatal if table empty):", delErr);
            
            if (data.incidents.length > 0) {
                const { error: insErr } = await supabase.from('master_incidents').insert(data.incidents.map(name => ({ name })));
                if (insErr) throw insErr;
            }
        } catch (e) {
            console.error("Failed to sync incidents:", e);
            throw e;
        }

        // 2. Sync Categories
        try {
            const { data: currentCats } = await supabase.from('master_categories').select('name');
            const currentCatNames = (currentCats ?? []).map(r => r.name);
            
            const { error: delErr } = await supabase.from('master_categories').delete().filter('name', 'in', `(${currentCatNames.map(n => `"${n}"`).join(',') || '""'})`);
            if (delErr) console.warn("Category delete error:", delErr);
            
            if (data.categories.length > 0) {
                const { error: insErr } = await supabase.from('master_categories').insert(data.categories.map(name => ({ name })));
                if (insErr) throw insErr;
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
                    upsertData.id = self.crypto.randomUUID();
                } else {
                    upsertData.id = u.id;
                }

                const { error: userErr } = await supabase.from('profiles').upsert(upsertData, { onConflict: 'id' });
                if (userErr) {
                    console.error(`Failed to upsert user ${u.name}:`, userErr);
                    throw userErr;
                }
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
    }
};
