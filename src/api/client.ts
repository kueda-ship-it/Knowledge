import { supabase } from '../lib/supabase';
import { supabaseEquipment } from '../lib/supabaseEquipment';
import { KnowledgeItem, MasterData, User, Attachment, EditHistory, AppNotification } from '../types';

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
        attachments: (row.attachments as Attachment[]) ?? [],
    };
}

export const apiClient = {
    async fetchAll(currentUserId?: string): Promise<KnowledgeItem[]> {
        // Fetch items and their reaction counts
        const { data, error } = await supabase
            .from('knowledge')
            .select(`
                *,
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
                attachments: item.attachments ?? [],
            });

        if (error) throw error;

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
            recipientId: row.recipient_id,
            senderName: row.sender_name,
            type: row.type as any,
            knowledgeId: row.knowledge_id,
            isRead: row.is_read,
            createdAt: row.created_at
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
        // ...Existing update logic...
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
