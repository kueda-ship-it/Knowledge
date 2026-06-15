import { supabase } from '../lib/supabase';
import { supabaseRealtime } from '../lib/supabaseRealtime';
import { supabaseEquipment } from '../lib/supabaseEquipment';
import { KnowledgeItem, MasterData, User, Attachment, EditHistory, AppNotification, KnowledgeGroup, ChatAction, OperationalProposal, ProposalProblem, ReactionType, KnowledgeComment, ActivityEvent } from '../types';

// localStorage から JWT と有効期限を直接読む (supabase-js の auth ロック待ち回避)。
// supabase-js v2 の保存形式は access_token / expires_at(秒) を持つ。
function readStoredAuth(): { token: string | null; expiresAtMs: number | null } {
    const url = (import.meta as any).env.VITE_SUPABASE_URL as string;
    try {
        const ref = url.match(/https?:\/\/([^.]+)\./)?.[1];
        if (ref) {
            const raw = localStorage.getItem(`sb-${ref}-auth-token`);
            if (raw) {
                const p = JSON.parse(raw);
                const token = p?.access_token ?? p?.currentSession?.access_token ?? null;
                const expSec = p?.expires_at ?? p?.currentSession?.expires_at ?? null;
                return { token, expiresAtMs: typeof expSec === 'number' ? expSec * 1000 : null };
            }
        }
    } catch {
        /* fall through */
    }
    return { token: null, expiresAtMs: null };
}

function timeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);
}

// 「叩く前に」有効なトークンを用意する。タブを長時間放置した後の初回操作で、
// supabase-js の自動更新が非同期で間に合わず、期限切れトークンのまま PostgREST を
// 叩いて 401 になる事例 (= 最初に開くと保存できない) を防ぐための先回り更新。
// auth ロックで詰まらないよう全てタイムアウト付き + single-flight (同時多発で更新 1 回に相乗り)。
let validTokenInFlight: Promise<string | null> | null = null;
async function getValidAccessToken(): Promise<string | null> {
    const { token, expiresAtMs } = readStoredAuth();
    // 期限まで 60 秒以上あるなら手元のトークンで即叩く (通常パス)
    if (token && expiresAtMs && expiresAtMs > Date.now() + 60_000) return token;

    // 期限切れ/間近 or 未取得 → supabase-js で更新/復元を待つ
    if (!validTokenInFlight) {
        validTokenInFlight = (async () => {
            try {
                if (token) {
                    const { data } = await supabase.auth.refreshSession();
                    return data.session?.access_token ?? token;
                }
                const { data } = await supabase.auth.getSession();
                return data.session?.access_token ?? null;
            } catch {
                return token;
            } finally {
                validTokenInFlight = null;
            }
        })();
    }
    // 更新が詰まった場合は手元のトークンで賭ける (後段の 401 リトライが拾う)
    return timeout(validTokenInFlight, 8000, token);
}

// 401 を見てからの強制リフレッシュ (最後の砦)。端末時計が遅れていて事前判定が
// 「まだ有効」と誤判定したケースなどを救済する。single-flight + タイムアウト。
let forceRefreshInFlight: Promise<string | null> | null = null;
async function forceRefresh(): Promise<string | null> {
    if (!forceRefreshInFlight) {
        forceRefreshInFlight = (async () => {
            try {
                const { data } = await supabase.auth.refreshSession();
                return data.session?.access_token ?? null;
            } catch {
                return null;
            } finally {
                forceRefreshInFlight = null;
            }
        })();
    }
    return timeout(forceRefreshInFlight, 8000, null);
}

// supabase-js の auth ロック待ちを避けるため localStorage の JWT で PostgREST を直接叩くヘルパー。
// 書き込み系で supabase.from().insert/update/delete がハングする事例があるため使う。
// 二段の安全網: (1) 叩く前に期限切れトークンを先回り更新、(2) それでも 401 なら強制更新して 1 回再試行。
async function rawRest(
    path: string,
    init: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; prefer?: string }
): Promise<Response> {
    const url = (import.meta as any).env.VITE_SUPABASE_URL as string;
    const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;

    const doFetch = (token: string) => {
        const headers: Record<string, string> = {
            'apikey': anonKey,
            'Authorization': `Bearer ${token}`,
        };
        if (init.body !== undefined) headers['Content-Type'] = 'application/json';
        if (init.prefer) headers['Prefer'] = init.prefer;
        return fetch(`${url}${path}`, {
            method: init.method,
            headers,
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
    };

    const token = (await getValidAccessToken()) ?? anonKey;
    let res = await doFetch(token);
    if (res.status === 401) {
        const fresh = await forceRefresh();
        if (fresh && fresh !== token) {
            console.info('[rawRest] 401 → トークンをリフレッシュして再試行:', path.split('?')[0]);
            res = await doFetch(fresh);
        }
    }
    return res;
}

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
        recordType: (row.record_type as 'trouble' | 'incident') ?? 'trouble',
        createdAt: row.created_at as string | undefined,
        updatedAt: row.updated_at as string,
        author: row.author as string,
        updatedBy: (row.updated_by as string | null) ?? undefined,
        claimLevel: typeof row.claim_level === 'number' ? row.claim_level : 0,
        attachments: (row.attachments as Attachment[]) ?? [],
    };
}

// knowledge_reactions の埋め込み行から種別ごとの集計フィールドを item に書き込む。
// 旧フィールド (likeCount 等) は Evaluation 等の互換のため併産する。
function applyReactionAggregates(
    item: KnowledgeItem,
    reactions: Array<{ type: ReactionType; user_id: string }>,
    currentUserId?: string,
): void {
    const counts: Partial<Record<ReactionType, number>> = {};
    const users: Partial<Record<ReactionType, string[]>> = {};
    for (const r of reactions) {
        counts[r.type] = (counts[r.type] ?? 0) + 1;
        (users[r.type] ??= []).push(r.user_id);
    }
    item.reactionCounts = counts;
    item.reactionUsers = users;
    item.likeCount = counts.like ?? 0;
    item.wrongCount = counts.wrong ?? 0;
    item.likeUsers = users.like ?? [];
    item.wrongUsers = users.wrong ?? [];
    if (currentUserId) {
        const my = reactions.find(r => r.user_id === currentUserId);
        item.myReaction = my ? my.type : null;
    }
}

export const apiClient = {
    async fetchAll(currentUserId?: string): Promise<KnowledgeItem[]> {
        // Fetch items and their reaction counts
        const { data, error } = await supabase
            .from('knowledge')
            .select(`
                id, title, machine, property, req_num, category,
                incidents, tags, content, phenomenon, countermeasure, status, record_type, created_at, updated_at, author, updated_by, claim_level, attachments,
                knowledge_reactions(type, user_id)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        
        return (data ?? []).map(row => {
            const item = toItem(row);
            applyReactionAggregates(item, (row.knowledge_reactions as any[]) || [], currentUserId);
            return item;
        });
    },

    async fetchOne(id: string, currentUserId?: string): Promise<KnowledgeItem | null> {
        const { data, error } = await supabase
            .from('knowledge')
            .select(`
                id, title, machine, property, req_num, category,
                incidents, tags, content, phenomenon, countermeasure, status, record_type, created_at, updated_at, author, updated_by, claim_level, attachments,
                knowledge_reactions(type, user_id)
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return null;

        const item = toItem(data);
        applyReactionAggregates(item, (data.knowledge_reactions as any[]) || [], currentUserId);
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
        // supabase-js が内部の auth ロックでハングする事例が発生しているため、
        // 保存パスは raw fetch で PostgREST を直接叩く。token は localStorage から直接取得。
        const row = {
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
            record_type: item.recordType ?? 'trouble',
            updated_at: item.updatedAt,
            author: item.author,
            updated_by: item.updatedBy ?? item.author,
            claim_level: Math.max(0, Math.min(10, Math.round(item.claimLevel ?? 0))),
            attachments: item.attachments ?? [],
        };

        // rawRest 経由 (localStorage の JWT 直読み + 401 時の強制リフレッシュ再試行)
        if (oldItem) {
            // 既存更新: PATCH
            const res = await rawRest(`/rest/v1/knowledge?id=eq.${encodeURIComponent(item.id)}`, {
                method: 'PATCH',
                body: row,
                prefer: 'return=minimal',
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`保存に失敗 (${res.status}): ${text}`);
            }
        } else {
            // 新規: POST
            const res = await rawRest('/rest/v1/knowledge', {
                method: 'POST',
                body: row,
                prefer: 'return=minimal',
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`保存に失敗 (${res.status}): ${text}`);
            }
        }

        // 2. 付随処理 (履歴・通知) はメインの保存完了後に fire-and-forget で実行。
        //    profiles は FDW foreign table で 1 クエリ 1秒以上かかる / 接続不安定時はハングするため、
        //    ここで await すると保存がタイムアウトする。保存は既に成功しているので背景処理に回す。
        if (oldItem && (oldItem.content !== item.content || oldItem.title !== item.title || oldItem.status !== item.status)) {
            const authorChanged = oldItem.author !== item.author;
            const self = this;
            (async () => {
                try {
                    const { error: histErr } = await supabase.from('knowledge_history').insert({
                        knowledge_id: item.id,
                        changed_by: item.author,
                        old_content: oldItem.content,
                        new_content: item.content,
                        comment: oldItem.status !== item.status ? `Status changed to ${item.status}` : 'Content updated'
                    });
                    if (histErr) console.warn('[save/bg] 履歴記録に失敗:', histErr.message);

                    if (authorChanged) {
                        // FDW profiles は遅いので 3秒でタイムアウト
                        const lookupP = supabase.from('profiles').select('id').eq('display_name', oldItem.author).maybeSingle();
                        const timeoutP = new Promise<{ data: null }>(resolve => setTimeout(() => resolve({ data: null }), 3000));
                        const { data: authorProf } = await Promise.race([lookupP, timeoutP]) as any;
                        if (authorProf?.id) {
                            await self.createNotification(authorProf.id, item.author, 'edited', item.id);
                        }
                    }
                } catch (e) {
                    console.warn('[save/bg] 付随処理エラー (保存自体は成功済み):', e);
                }
            })();
        }
    },

    // リアクション (いいね / 助かった / なるほど / すごい / 違うよ) のトグル。
    // supabase-js の write は auth ロックでハングする事例があるため rawRest (PostgREST 直叩き) を使う。
    // 呼び出し側でタイムアウトを付ける。1人1種の排他選択。
    // 通知 (profiles 結合・FDW で遅い) は本処理の後に fire-and-forget で実行し、
    // 通知が詰まってもリアクション自体は完了させる。
    async toggleReaction(knowledgeId: string, userId: string, type: ReactionType, comment?: string): Promise<void> {
        // 既存判定
        const existRes = await rawRest(
            `/rest/v1/knowledge_reactions?knowledge_id=eq.${encodeURIComponent(knowledgeId)}&user_id=eq.${encodeURIComponent(userId)}&type=eq.${type}&select=id`,
            { method: 'GET' },
        );
        if (!existRes.ok) throw new Error(`リアクション確認に失敗 (${existRes.status}): ${await existRes.text().catch(() => '')}`);
        const existing = (await existRes.json()) as Array<{ id: string }>;

        if (existing.length > 0) {
            // 同じ種別を再度押した → 取り消し (削除)
            const delRes = await rawRest(
                `/rest/v1/knowledge_reactions?knowledge_id=eq.${encodeURIComponent(knowledgeId)}&user_id=eq.${encodeURIComponent(userId)}&type=eq.${type}`,
                { method: 'DELETE', prefer: 'return=minimal' },
            );
            if (!delRes.ok) throw new Error(`リアクション削除に失敗 (${delRes.status}): ${await delRes.text().catch(() => '')}`);
            return;
        }

        // 別種別が付いていれば先に消す (排他選択)
        const clearRes = await rawRest(
            `/rest/v1/knowledge_reactions?knowledge_id=eq.${encodeURIComponent(knowledgeId)}&user_id=eq.${encodeURIComponent(userId)}`,
            { method: 'DELETE', prefer: 'return=minimal' },
        );
        if (!clearRes.ok) throw new Error(`リアクション整理に失敗 (${clearRes.status}): ${await clearRes.text().catch(() => '')}`);

        // 追加
        const insRes = await rawRest('/rest/v1/knowledge_reactions', {
            method: 'POST',
            body: { knowledge_id: knowledgeId, user_id: userId, type, comment },
            prefer: 'return=minimal',
        });
        if (!insRes.ok) throw new Error(`リアクション登録に失敗 (${insRes.status}): ${await insRes.text().catch(() => '')}`);

        // 投稿者への通知は背景で (profiles FDW が遅い / 詰まってもリアクションは成立済み)
        const self = this;
        (async () => {
            try {
                const { data: knl } = await supabase.from('knowledge').select('author').eq('id', knowledgeId).maybeSingle();
                if (knl?.author) {
                    const { data: authorProf } = await supabase.from('profiles').select('id').eq('display_name', knl.author).maybeSingle();
                    if (authorProf?.id && authorProf.id !== userId) {
                        const { data: me } = await supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle();
                        await self.createNotification(authorProf.id, me?.display_name || 'Someone', type, knowledgeId);
                    }
                }
            } catch (e) {
                console.warn('[toggleReaction/bg] 通知に失敗 (リアクションは成功済み):', e);
            }
        })();
    },

    // ---- ナレッジのコメント (SNS 化) ----
    // 書き込みは全て rawRest (supabase-js の auth ロックハング回避)。呼び出し側でタイムアウトを付ける。
    // 表示用の名前解決はページ側の usersMaster で行う (profiles FDW を叩かない)。
    async fetchKnowledgeComments(knowledgeId: string): Promise<KnowledgeComment[]> {
        const path = `/rest/v1/knowledge_comments?knowledge_id=eq.${encodeURIComponent(knowledgeId)}&select=id,knowledge_id,author_id,body,created_at,updated_at&order=created_at.asc`;
        const res = await rawRest(path, { method: 'GET' });
        if (!res.ok) throw new Error(`コメントの取得に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        return (await res.json()) as KnowledgeComment[];
    },

    // 一覧カードのコメント数バッジ用: 全コメントを knowledge_id ごとに集計 (id のみ取得で軽量)
    async fetchAllCommentCounts(): Promise<Record<string, number>> {
        const res = await rawRest(`/rest/v1/knowledge_comments?select=knowledge_id`, { method: 'GET' });
        if (!res.ok) throw new Error(`コメント数の取得に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        const rows = (await res.json()) as Array<{ knowledge_id: string }>;
        const map: Record<string, number> = {};
        for (const r of rows) map[r.knowledge_id] = (map[r.knowledge_id] ?? 0) + 1;
        return map;
    },

    async createKnowledgeComment(knowledgeId: string, body: string, userId: string, userName?: string): Promise<void> {
        const res = await rawRest('/rest/v1/knowledge_comments', {
            method: 'POST',
            body: { knowledge_id: knowledgeId, author_id: userId, body },
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`コメントの送信に失敗 (${res.status}): ${await res.text().catch(() => '')}`);

        // 投稿者への通知は背景で (profiles FDW が遅い / 詰まってもコメントは成立済み)
        const self = this;
        (async () => {
            try {
                const { data: knl } = await supabase.from('knowledge').select('author').eq('id', knowledgeId).maybeSingle();
                if (knl?.author) {
                    // FDW profiles は遅いので 3秒でタイムアウト
                    const lookupP = supabase.from('profiles').select('id').eq('display_name', knl.author).maybeSingle();
                    const timeoutP = new Promise<{ data: null }>(resolve => setTimeout(() => resolve({ data: null }), 3000));
                    const { data: authorProf } = await Promise.race([lookupP, timeoutP]) as any;
                    if (authorProf?.id && authorProf.id !== userId) {
                        await self.createNotification(authorProf.id, userName || 'Someone', 'comment', knowledgeId);
                    }
                }
            } catch (e) {
                console.warn('[createKnowledgeComment/bg] 通知に失敗 (コメントは成功済み):', e);
            }
        })();
    },

    async updateKnowledgeComment(commentId: string, body: string): Promise<void> {
        const res = await rawRest(`/rest/v1/knowledge_comments?id=eq.${encodeURIComponent(commentId)}`, {
            method: 'PATCH',
            body: { body, updated_at: new Date().toISOString() },
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`コメントの更新に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
    },

    async deleteKnowledgeComment(commentId: string): Promise<void> {
        const res = await rawRest(`/rest/v1/knowledge_comments?id=eq.${encodeURIComponent(commentId)}`, {
            method: 'DELETE',
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`コメントの削除に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
    },

    // ---- 閲覧記録 (knowledge_views) ----
    // 同一ユーザー・同一日の重複は PK + ignore-duplicates で黙殺。呼び出し側は fire-and-forget。
    // 延べ閲覧が節目 (10/30/50/100 回) に達したら投稿者へ milestone 通知を背景で送る。
    // 重複時はカウントが増えないので milestone 判定をスキップ → 同じ節目で二重通知しない。
    async recordView(knowledgeId: string, userId: string): Promise<void> {
        const res = await rawRest(`/rest/v1/knowledge_views?on_conflict=knowledge_id,user_id,viewed_on`, {
            method: 'POST',
            body: { knowledge_id: knowledgeId, user_id: userId },
            prefer: 'resolution=ignore-duplicates,return=representation',
        });
        if (!res.ok) throw new Error(`閲覧記録に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        let insertedRows: unknown[] = [];
        try { insertedRows = await res.json(); } catch { /* 空ボディ */ }
        if (!Array.isArray(insertedRows) || insertedRows.length === 0) return;

        const self = this;
        (async () => {
            try {
                const cntRes = await rawRest(
                    `/rest/v1/knowledge_view_counts?knowledge_id=eq.${encodeURIComponent(knowledgeId)}&select=total_views`,
                    { method: 'GET' },
                );
                if (!cntRes.ok) return;
                const rows = (await cntRes.json()) as Array<{ total_views: number }>;
                const total = rows[0]?.total_views ?? 0;
                if (![10, 30, 50, 100].includes(total)) return;
                const { data: knl } = await supabase.from('knowledge').select('author').eq('id', knowledgeId).maybeSingle();
                if (!knl?.author) return;
                // FDW profiles は遅いので 3秒でタイムアウト
                const lookupP = supabase.from('profiles').select('id').eq('display_name', knl.author).maybeSingle();
                const timeoutP = new Promise<{ data: null }>(resolve => setTimeout(() => resolve({ data: null }), 3000));
                const { data: authorProf } = await Promise.race([lookupP, timeoutP]) as any;
                if (authorProf?.id) {
                    await self.createNotification(authorProf.id, `延べ${total}回`, 'viewed_milestone', knowledgeId);
                }
            } catch (e) {
                console.warn('[recordView/bg] milestone 通知に失敗 (記録は成功済み):', e);
            }
        })();
    },

    // ---- アクティビティフィード ----
    // 専用テーブルは持たず、既存 3 テーブルの直近行を rawRest 並列 GET してマージする。
    // 片方が失敗しても残りで描画できるよう、失敗テーブルは黙ってスキップ。
    async fetchRecentActivity(limit = 30): Promise<ActivityEvent[]> {
        const [postRes, reactRes, commentRes] = await Promise.all([
            rawRest(`/rest/v1/knowledge?select=id,title,author,created_at&order=created_at.desc.nullslast&limit=${limit}`, { method: 'GET' }).catch(() => null),
            rawRest(`/rest/v1/knowledge_reactions?select=id,knowledge_id,user_id,type,created_at&order=created_at.desc&limit=${limit}`, { method: 'GET' }).catch(() => null),
            rawRest(`/rest/v1/knowledge_comments?select=id,knowledge_id,author_id,body,created_at&order=created_at.desc&limit=${limit}`, { method: 'GET' }).catch(() => null),
        ]);

        const events: ActivityEvent[] = [];
        if (postRes?.ok) {
            const rows = (await postRes.json()) as Array<{ id: string; title: string; author: string; created_at: string | null }>;
            for (const r of rows) {
                if (!r.created_at) continue;
                events.push({ kind: 'post', id: `post-${r.id}`, knowledgeId: r.id, title: r.title, actorName: r.author, createdAt: r.created_at });
            }
        }
        if (reactRes?.ok) {
            const rows = (await reactRes.json()) as Array<{ id: string; knowledge_id: string; user_id: string; type: ReactionType; created_at: string }>;
            for (const r of rows) {
                events.push({ kind: 'reaction', id: `react-${r.id}`, knowledgeId: r.knowledge_id, actorId: r.user_id, reactionType: r.type, createdAt: r.created_at });
            }
        }
        if (commentRes?.ok) {
            const rows = (await commentRes.json()) as Array<{ id: string; knowledge_id: string; author_id: string; body: string; created_at: string }>;
            for (const r of rows) {
                events.push({ kind: 'comment', id: `comment-${r.id}`, knowledgeId: r.knowledge_id, actorId: r.author_id, body: r.body, createdAt: r.created_at });
            }
        }
        events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return events.slice(0, limit * 2);
    },

    // フィードのタイトル解決用: 全ナレッジの id / title / author だけ軽量取得
    async fetchKnowledgeTitles(): Promise<Record<string, { title: string; author: string }>> {
        const res = await rawRest(`/rest/v1/knowledge?select=id,title,author`, { method: 'GET' });
        if (!res.ok) throw new Error(`タイトルの取得に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        const rows = (await res.json()) as Array<{ id: string; title: string; author: string }>;
        const map: Record<string, { title: string; author: string }> = {};
        for (const r of rows) map[r.id] = { title: r.title, author: r.author };
        return map;
    },

    // 全ナレッジの延べ閲覧数 (knowledge_id → total_views)
    async fetchViewCounts(): Promise<Record<string, number>> {
        const res = await rawRest(`/rest/v1/knowledge_view_counts?select=knowledge_id,total_views`, { method: 'GET' });
        if (!res.ok) throw new Error(`閲覧数の取得に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        const rows = (await res.json()) as Array<{ knowledge_id: string; total_views: number }>;
        const map: Record<string, number> = {};
        for (const r of rows) map[r.knowledge_id] = r.total_views;
        return map;
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
        const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        if (error) throw error;
    },

    async createNotification(recipientId: string, senderName: string, type: string, knowledgeId: string): Promise<void> {
        const { error } = await supabase.from('notifications').insert({
            recipient_id: recipientId,
            sender_name: senderName,
            type: type,
            knowledge_id: knowledgeId
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
        console.log("Updating masters with data:", data);
        
        // 1. Sync Incidents
        try {
            const { data: currentIncidents, error: curIncErr } = await supabase.from('master_incidents').select('name');
            if (curIncErr) throw curIncErr;
            const currentNames = (currentIncidents ?? []).map(r => r.name);
            
            // 削除対象: 現在のリストにあるが、新しいデータにはないもの
            const toDelete = currentNames.filter(n => !data.incidents.includes(n));
            // 追加対象: 新しいデータにあるが、現在のリストにはないもの
            const toAdd = data.incidents.filter(n => !currentNames.includes(n));

            if (toDelete.length > 0) {
                const { error } = await supabase.from('master_incidents').delete().in('name', toDelete);
                if (error) throw error;
            }
            if (toAdd.length > 0) {
                const { error } = await supabase.from('master_incidents').insert(toAdd.map(name => ({ name })));
                if (error) throw error;
            }
        } catch (e) {
            console.error("Failed to sync incidents:", e);
            throw e;
        }

        // 2. Sync Categories
        try {
            const { data: currentCats, error: curCatErr } = await supabase.from('master_categories').select('name');
            if (curCatErr) throw curCatErr;
            const currentCatNames = (currentCats ?? []).map(r => r.name);
            
            const toDeleteCat = currentCatNames.filter(n => !data.categories.includes(n));
            const toAddCat = data.categories.filter(n => !currentCatNames.includes(n));

            if (toDeleteCat.length > 0) {
                const { error } = await supabase.from('master_categories').delete().in('name', toDeleteCat);
                if (error) throw error;
            }
            if (toAddCat.length > 0) {
                const { error } = await supabase.from('master_categories').insert(toAddCat.map(name => ({ name })));
                if (error) throw error;
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
                const normalizedEmail = (u.email ?? '').trim().toLowerCase();
                const payload: any = {
                    email: normalizedEmail,
                    display_name: u.name,
                    knl_role: u.role,
                    updated_at: new Date().toISOString(),
                };

                if (isNew) {
                    // 既に同じメールの事前登録行があるなら UPDATE（claim 前提）、無ければ INSERT
                    const { data: existing } = await supabase
                        .from('profiles')
                        .select('id')
                        .ilike('email', normalizedEmail)
                        .maybeSingle();

                    if (existing) {
                        const { error: updErr } = await supabase
                            .from('profiles')
                            .update(payload)
                            .eq('id', existing.id);
                        if (updErr) throw updErr;
                    } else {
                        const cryptoObj: Crypto | undefined = (globalThis as any).crypto ?? (self as any).crypto;
                        if (!cryptoObj?.randomUUID) throw new Error('crypto.randomUUID unavailable');
                        payload.id = cryptoObj.randomUUID();
                        const { error: insErr } = await supabase.from('profiles').insert(payload);
                        if (insErr) throw insErr;
                    }
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
        // supabase-js 経由だと auth ロック詰まりでステータス更新が固まることがあるため rawRest で直叩き
        const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
        if (userId) patch.updated_by = userId;
        const res = await rawRest(`/rest/v1/operational_proposals?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: patch,
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`ステータス更新に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
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

    // 競合検知用: 現在の updated_at を軽量に取得 (rawRest 直叩き)。
    // 保存前に「開いた時点の updated_at」と照合し、他者更新があれば上書きを止める。
    async fetchProposalUpdatedAt(id: string): Promise<string | null> {
        const res = await rawRest(
            `/rest/v1/operational_proposals?id=eq.${encodeURIComponent(id)}&select=updated_at`,
            { method: 'GET' },
        );
        if (!res.ok) throw new Error(`更新確認に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        const rows = (await res.json()) as Array<{ updated_at: string | null }>;
        return rows[0]?.updated_at ?? null;
    },

    // 改善提案 / 決定事項などのフィールド更新 (updated_by / updated_at を同時に書く)
    async updateProposalContent(
        id: string,
        patch: Partial<{ proposal: string; problem: string; decision: string; title: string; priority: string; category: string; visible_groups: string[] | null }>,
        userId?: string,
    ): Promise<void> {
        const payload: Record<string, any> = { ...patch, updated_at: new Date().toISOString() };
        if (userId) payload.updated_by = userId;
        const res = await rawRest(`/rest/v1/operational_proposals?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: payload,
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`更新に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
    },

    // 合議コメント: 一覧取得
    // 旧実装は profiles (FDW foreign table、1リクエスト1秒近く) を結合していたため
    // モーダルを開くたびに数秒待たされていた。表示用の名前解決はページ側の
    // usersMaster で行うので、ここではコメント行だけ rawRest で取って即返す
    // (supabase-js の auth ロック競合も回避)。
    async fetchProposalComments(proposalId: string): Promise<any[]> {
        const path = `/rest/v1/operational_proposal_comments?proposal_id=eq.${encodeURIComponent(proposalId)}&select=id,proposal_id,author_id,body,created_at,updated_at&order=created_at.asc`;
        const res = await rawRest(path, { method: 'GET' });
        if (!res.ok) throw new Error(`合議の取得に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        return (await res.json()) as any[];
    },

    // 合議コメントの追記。supabase-js の insert は auth ロックでハングする事例が
    // あるため rawRest (PostgREST 直叩き) を使う。送信操作なので呼び出し側で
    // タイムアウトを付ける (開いている間のアイドルにはタイムアウトを付けない)。
    async createProposalComment(proposalId: string, body: string, userId: string): Promise<void> {
        const res = await rawRest('/rest/v1/operational_proposal_comments', {
            method: 'POST',
            body: { proposal_id: proposalId, author_id: userId, body },
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`合議の追記に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
    },

    async updateProposalComment(commentId: string, body: string): Promise<void> {
        const res = await rawRest(`/rest/v1/operational_proposal_comments?id=eq.${encodeURIComponent(commentId)}`, {
            method: 'PATCH',
            body: { body, updated_at: new Date().toISOString() },
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`合議の更新に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
    },

    async deleteProposalComment(commentId: string): Promise<void> {
        const res = await rawRest(`/rest/v1/operational_proposal_comments?id=eq.${encodeURIComponent(commentId)}`, {
            method: 'DELETE',
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`合議の削除に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
    },

    // ---- 問題点の項目 (進捗管理) ----
    // 書き込みは全て rawRest (supabase-js の auth ロックハング回避)。呼び出し側で TO を付ける。
    async fetchProposalProblems(proposalId: string): Promise<ProposalProblem[]> {
        const path = `/rest/v1/operational_proposal_problems?proposal_id=eq.${encodeURIComponent(proposalId)}&select=id,proposal_id,body,done,sort_order,created_by,created_at,updated_at&order=sort_order.asc,created_at.asc`;
        const res = await rawRest(path, { method: 'GET' });
        if (!res.ok) throw new Error(`問題点の取得に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        return (await res.json()) as ProposalProblem[];
    },

    // 作成行を返す (return=representation)。一覧へ楽観追加するため。
    async createProposalProblem(proposalId: string, body: string, sortOrder: number, userId?: string): Promise<ProposalProblem | null> {
        const res = await rawRest('/rest/v1/operational_proposal_problems', {
            method: 'POST',
            body: { proposal_id: proposalId, body, sort_order: sortOrder, created_by: userId ?? null },
            prefer: 'return=representation',
        });
        if (!res.ok) throw new Error(`問題点の追加に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        try {
            const rows = (await res.json()) as ProposalProblem[];
            return rows?.[0] ?? null;
        } catch {
            return null;
        }
    },

    async updateProposalProblem(
        id: string,
        patch: Partial<{ body: string; done: boolean; sort_order: number }>,
    ): Promise<void> {
        const res = await rawRest(`/rest/v1/operational_proposal_problems?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: { ...patch, updated_at: new Date().toISOString() },
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`問題点の更新に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
    },

    async deleteProposalProblem(id: string): Promise<void> {
        const res = await rawRest(`/rest/v1/operational_proposal_problems?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`問題点の削除に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
    },

    // 一覧カードの進捗バッジ用: 全提議の問題点を一括取得し proposal_id ごとに集計。
    // 件数が多くなければ十分軽量 (proposal_id, done のみ取得)。
    async fetchAllProblemProgress(): Promise<Record<string, { done: number; total: number }>> {
        const res = await rawRest(
            `/rest/v1/operational_proposal_problems?select=proposal_id,done`,
            { method: 'GET' },
        );
        if (!res.ok) throw new Error(`進捗の取得に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        const rows = (await res.json()) as Array<{ proposal_id: string; done: boolean }>;
        const map: Record<string, { done: number; total: number }> = {};
        for (const r of rows) {
            const e = map[r.proposal_id] ?? { done: 0, total: 0 };
            e.total += 1;
            if (r.done) e.done += 1;
            map[r.proposal_id] = e;
        }
        return map;
    },

    async getNextProposalNo(category: string): Promise<string> {
        // supabase-js 経由だと auth ロック詰まりで追加処理が止まるため rawRest で直叩き
        const res = await rawRest(
            `/rest/v1/operational_proposals?select=source_no&category=eq.${encodeURIComponent(category)}`,
            { method: 'GET' },
        );
        if (!res.ok) throw new Error(`採番に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        const rows = (await res.json()) as Array<{ source_no: string | null }>;
        const maxNo = rows.reduce((max, row) => {
            const n = parseInt(row.source_no || '0', 10);
            return n > max ? n : max;
        }, 0);
        return String(maxNo + 1);
    },

    async deleteProposal(id: string): Promise<void> {
        const res = await rawRest(`/rest/v1/operational_proposals?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            prefer: 'return=minimal',
        });
        if (!res.ok) throw new Error(`削除に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
    },

    // 作成した行をそのまま返す (return=representation)。
    // 呼び出し側はこれを一覧へ楽観追加でき、Realtime / refetch の取りこぼしに依存しない。
    async createProposal(proposal: Partial<any>): Promise<OperationalProposal | null> {
        // source_no が未指定なら種別ごとに自動採番
        const record = { ...proposal };
        if (!record.source_no && record.category) {
            record.source_no = await apiClient.getNextProposalNo(record.category);
        }

        const res = await rawRest('/rest/v1/operational_proposals', {
            method: 'POST',
            body: record,
            prefer: 'return=representation',
        });
        if (!res.ok) throw new Error(`作成に失敗 (${res.status}): ${await res.text().catch(() => '')}`);
        try {
            const rows = (await res.json()) as OperationalProposal[];
            return rows?.[0] ?? null;
        } catch {
            return null;
        }
    },

    // Master Data Realtime
    // Realtime 基盤不安定時のキルスイッチ: VITE_ENABLE_REALTIME=true の場合のみ購読。
    // Realtime 専用クライアントを使い、再接続ループが REST/Auth をハングさせないように分離。
    subscribeMasters(_callback: () => void) {
        const enabled = (import.meta as any).env?.VITE_ENABLE_REALTIME === 'true';
        if (!enabled) return null;
        const channel = supabaseRealtime.channel('master-data-sync');
        channel
            .on('postgres_changes', { event: '*', schema: 'public', table: 'master_categories' }, _callback)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'master_incidents' }, _callback)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, _callback)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profile_categories' }, _callback)
            .subscribe();
        return channel;
    },

    unsubscribeMasters(channel: any) {
        if (channel) {
            supabaseRealtime.removeChannel(channel);
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
    ): Promise<{ message: string; knowledgeIds: string[]; proposalIds: string[]; action?: ChatAction }> {
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
            recordType: k.recordType,
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
        // action は LLM が返した時のみ含まれる。形式チェックは UI 側で実施。
        const action = d.action && typeof d.action === 'object' ? (d.action as ChatAction) : undefined;
        return {
            message: String(d.message ?? ''),
            knowledgeIds: Array.isArray(d.knowledgeIds) ? d.knowledgeIds.map(String) : [],
            proposalIds: Array.isArray(d.proposalIds) ? d.proposalIds.map(String) : [],
            action,
        };
    }
};
