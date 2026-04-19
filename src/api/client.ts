import { supabase } from '../lib/supabase';
import { supabaseEquipment } from '../lib/supabaseEquipment';
import { KnowledgeItem, MasterData, User, Attachment, EditHistory, AppNotification, KnowledgeGroup } from '../types';

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
                incidents, tags, content, phenomenon, countermeasure, status, updated_at, author, attachments,
                knowledge_reactions(type, user_id)
            `)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        
        return (data ?? []).map(row => {
            const item = toItem(row);
            const reactions = (row.knowledge_reactions as any[]) || [];
            item.likeCount = reactions.filter(r => r.type === 'like').length;
            item.wrongCount = reactions.filter(r => r.type === 'wrong').length;
            item.likeUsers = reactions.filter(r => r.type === 'like').map(r => r.user_id);
            item.wrongUsers = reactions.filter(r => r.type === 'wrong').map(r => r.user_id);

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
        item.likeUsers = reactions.filter(r => r.type === 'like').map(r => r.user_id);
        item.wrongUsers = reactions.filter(r => r.type === 'wrong').map(r => r.user_id);
        if (currentUserId) {
            const my = reactions.find(r => r.user_id === currentUserId);
            item.myReaction = my ? my.type : null;
        }
        return item;
    },

    async fetchMasters(): Promise<MasterData> {
        // profiles は FDW foreign table で category を持てないため、
        // category は public.profile_categories (ローカル) を別取得してマージする。
        const [incRes, catRes, profRes, profCatRes] = await Promise.all([
            supabase.from('master_incidents').select('name').order('name'),
            supabase.from('master_categories').select('name').order('name'),
            supabase.from('profiles').select('id, email, display_name, knl_role, avatar_url').order('display_name'),
            supabase.from('profile_categories').select('user_id, category'),
        ]);
        const firstErr = incRes.error || catRes.error || profRes.error || profCatRes.error;
        if (firstErr) throw firstErr;
        const incidents = incRes.data;
        const categories = catRes.data;
        const profiles = profRes.data;
        const profCats = profCatRes.data;

        const catsByUser = new Map<string, string[]>();
        for (const row of (profCats ?? []) as Array<{ user_id: string; category: string | null }>) {
            if (!row.category) continue;
            const arr = catsByUser.get(row.user_id) ?? [];
            arr.push(row.category);
            catsByUser.set(row.user_id, arr);
        }

        return {
            incidents: (incidents ?? []).map((r: { name: string }) => r.name),
            categories: (categories ?? []).map((r: { name: string }) => r.name),
            users: (profiles ?? []).map((p: any) => ({
                id: p.id,
                name: p.display_name ?? '',
                email: p.email ?? '',
                avatarUrl: p.avatar_url ?? '',
                role: (p.knl_role as User['role']) ?? 'viewer',
                categories: catsByUser.get(p.id) ?? [],
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
        // profiles は FDW foreign table のため ON CONFLICT 非対応。UPDATE/INSERT を分岐。
        try {
            for (const u of data.users) {
                const isNew = u.id.startsWith('new-');
                const payload: any = {
                    email: u.email,
                    display_name: u.name,
                    knl_role: u.role,
                    updated_at: new Date().toISOString(),
                };

                if (isNew) {
                    payload.id = self.crypto.randomUUID();
                    const { error: insErr } = await supabase.from('profiles').insert(payload);
                    if (insErr) throw insErr;
                } else {
                    const { error: updErr } = await supabase.from('profiles').update(payload).eq('id', u.id);
                    if (updErr) throw updErr;
                }

                // グループ所属は GroupsManager 側で個別に扱うため、ここでは触らない
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

    async updateProposalStatus(id: string, status: string, userId?: string): Promise<void> {
        const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
        if (userId) patch.updated_by = userId;
        const { error } = await supabase
            .from('operational_proposals')
            .update(patch)
            .eq('id', id);

        if (error) throw error;
    },

    // 指定カテゴリへの所属を追加 (既に所属していれば no-op)
    async addUserToCategory(userId: string, category: string): Promise<void> {
        const { data, error } = await supabase
            .from('profile_categories')
            .upsert({ user_id: userId, category, updated_at: new Date().toISOString() }, { onConflict: 'user_id,category' })
            .select('user_id');
        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error('グループ追加が反映されませんでした（RLS/スキーマキャッシュを確認してください）');
        }
    },

    // 指定カテゴリからの所属を外す (その行のみ削除)
    async removeUserFromCategory(userId: string, category: string): Promise<void> {
        const { error } = await supabase
            .from('profile_categories')
            .delete()
            .eq('user_id', userId)
            .eq('category', category);
        if (error) throw error;
    },

    // 改善提案 / 決定事項などのフィールド更新 (updated_by / updated_at を同時に書く)
    async updateProposalContent(
        id: string,
        patch: Partial<{ proposal: string; problem: string; decision: string; title: string; priority: string; category: string; visible_groups: string[] | null }>,
        userId?: string,
    ): Promise<void> {
        const payload: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
        if (userId) payload.updated_by = userId;
        const { error } = await supabase
            .from('operational_proposals')
            .update(payload)
            .eq('id', id);

        if (error) throw error;
    },

    // 合議コメント: 一覧取得 (author 名を profiles から結合)
    async fetchProposalComments(proposalId: string): Promise<any[]> {
        const { data, error } = await supabase
            .from('operational_proposal_comments')
            .select('id, proposal_id, author_id, body, created_at, updated_at')
            .eq('proposal_id', proposalId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const rows = data ?? [];
        if (rows.length === 0) return [];

        const ids = Array.from(new Set(rows.map(r => r.author_id).filter(Boolean)));
        const { data: profs } = await supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', ids);
        const nameById = new Map<string, string>((profs ?? []).map((p: any) => [p.id, p.display_name]));

        return rows.map(r => ({ ...r, author_name: nameById.get(r.author_id) ?? '' }));
    },

    async createProposalComment(proposalId: string, body: string, userId: string): Promise<void> {
        const { error } = await supabase
            .from('operational_proposal_comments')
            .insert({ proposal_id: proposalId, author_id: userId, body });

        if (error) throw error;
    },

    async updateProposalComment(commentId: string, body: string): Promise<void> {
        const { error } = await supabase
            .from('operational_proposal_comments')
            .update({ body })
            .eq('id', commentId);

        if (error) throw error;
    },

    async deleteProposalComment(commentId: string): Promise<void> {
        const { error } = await supabase
            .from('operational_proposal_comments')
            .delete()
            .eq('id', commentId);

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
    },

    // Knowledge Groups
    async fetchGroups(): Promise<KnowledgeGroup[]> {
        const { data, error } = await supabase
            .from('knowledge_groups')
            .select('id, name, description, created_at, updated_at, knowledge_group_members(user_id)')
            .order('name');
        if (error) throw error;
        return (data ?? []).map(row => ({
            id: row.id as string,
            name: row.name as string,
            description: (row.description as string) || undefined,
            createdAt: row.created_at as string,
            updatedAt: row.updated_at as string,
            memberIds: ((row.knowledge_group_members as any[]) || []).map(m => m.user_id as string),
        }));
    },

    async upsertGroup(group: { id?: string; name: string; description?: string }, creatorId?: string): Promise<KnowledgeGroup> {
        const payload: any = { name: group.name, description: group.description ?? null, updated_at: new Date().toISOString() };
        if (group.id) payload.id = group.id;
        else if (creatorId) payload.created_by = creatorId;
        const { data, error } = await supabase
            .from('knowledge_groups')
            .upsert(payload, { onConflict: 'id' })
            .select('id, name, description, created_at, updated_at')
            .single();
        if (error) throw error;
        return {
            id: data.id,
            name: data.name,
            description: data.description || undefined,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            memberIds: [],
        };
    },

    async deleteGroup(id: string): Promise<void> {
        const { error } = await supabase.from('knowledge_groups').delete().eq('id', id);
        if (error) throw error;
    },

    async setGroupMembers(groupId: string, userIds: string[], actorId?: string): Promise<void> {
        const { error: delErr } = await supabase
            .from('knowledge_group_members')
            .delete()
            .eq('group_id', groupId);
        if (delErr) throw delErr;
        if (userIds.length === 0) return;
        const rows = userIds.map(uid => ({ group_id: groupId, user_id: uid, added_by: actorId ?? null }));
        const { error: insErr } = await supabase.from('knowledge_group_members').insert(rows);
        if (insErr) throw insErr;
    },

    async chatWithGemini(
        query: string,
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        knowledge: KnowledgeItem[],
        proposals: any[],
    ): Promise<{ message: string; knowledgeIds: string[]; proposalIds: string[] }> {
        const kSlim = knowledge.map(k => ({
            id: k.id,
            title: k.title,
            machine: k.machine,
            category: k.category,
            tags: k.tags,
            incidents: k.incidents,
            phenomenon: k.phenomenon,
            countermeasure: k.countermeasure,
            status: k.status,
            updatedAt: k.updatedAt,
        }));
        const pSlim = proposals.map((p: any) => ({
            id: p.id,
            title: p.title,
            problem: p.problem,
            proposal: p.proposal,
            category: p.category,
            status: p.status,
            priority: p.priority,
            proposed_at: p.proposed_at ?? p.created_at,
        }));

        // 30秒でタイムアウト（ハング防止）
        const invokeP = supabase.functions.invoke('gemini-chat', {
            body: { query, history, knowledge: kSlim, proposals: pSlim },
        });
        const timeoutP = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('GEMINI_TIMEOUT')), 30000)
        );
        const { data, error } = await Promise.race([invokeP, timeoutP]) as any;
        if (error) throw error;
        const d = (data ?? {}) as any;
        return {
            message: String(d.message ?? ''),
            knowledgeIds: Array.isArray(d.knowledgeIds) ? d.knowledgeIds.map(String) : [],
            proposalIds: Array.isArray(d.proposalIds) ? d.proposalIds.map(String) : [],
        };
    }
};
