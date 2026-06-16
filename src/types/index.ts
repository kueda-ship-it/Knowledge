export interface User {
    id: string;        // profiles.id (uuid)
    name: string;      // profiles.full_name
    email?: string;    // profiles.email
    avatarUrl?: string; // profiles.avatar_url
    role: 'viewer' | 'user' | 'manager' | 'admin' | 'master';  // profiles.knl_role ('admin' が正規値、'master' は旧称)
    categories: string[]; // 所属グループ名 (profile_categories.category の配列、複数所属可)
    group?: string;    // profiles.group (人事上の課/グループ: After Maintenance / Construction / Construction Manager / Dispatcher 等)
    leader?: string;   // profiles.leader (役職: 主任 / 主査 / 係長代理 / 係長 / 課長 / 次長 / 専務 等)
}

// リアクション種別 (SNS 風)。like/wrong は旧来の2種、それ以外は 2026-06 拡張分。
export type ReactionType = 'like' | 'wrong' | 'helpful' | 'insight' | 'awesome';

export interface Reaction {
    knowledgeId: string;
    userId: string;
    type: ReactionType;
    comment?: string; // Added for pointing out mistakes
    userName?: string;
}

export interface EditHistory {
    id: string;
    knowledgeId: string;
    changedBy: string;
    oldContent: string;
    newContent: string;
    comment?: string;
    updatedAt: string;
}

export type NotificationType = ReactionType | 'edited' | 'comment' | 'viewed_milestone';

export interface AppNotification {
    id: string;
    recipient_id: string;
    sender_name: string;
    type: NotificationType;
    knowledge_id: string;
    is_read: boolean;
    created_at: string;
}

export interface ChatProposalRef {
    id: string;
    title: string;
    status?: string;
    category?: string;
    priority?: string;
}

export interface ChatMessage {
    id: string;
    type: 'user' | 'assistant';
    text: string;
    results?: KnowledgeItem[];
    proposalResults?: ChatProposalRef[];
    noResults?: boolean;
    action?: ChatAction;
    // ユーザーがアクションを承認 / 却下 / 実行済みの状態
    actionState?: 'pending' | 'confirmed' | 'cancelled' | 'done' | 'failed';
    actionError?: string;
}

// AI チャットからアプリ操作を呼び出すためのアクション定義。
// write 系 (create_*) は実行前にユーザー確認 UI を出す。read 系 (navigate) は即実行。
export type ChatAction =
    | {
          type: 'create_proposal';
          confirmText: string;
          draft: ProposalDraft;
      }
    | {
          type: 'create_knowledge';
          confirmText: string;
          draft: KnowledgeDraft;
      }
    | {
          type: 'navigate';
          // navigate は LLM の意図表示用に短い説明を持つ
          confirmText?: string;
          view: 'knowledge' | 'dashboard' | 'proposals' | 'evaluation' | 'filelist' | 'menu';
          params?: NavigateParams;
      };

export interface ProposalDraft {
    title: string;
    problem?: string;
    proposal?: string;
    category?: string;       // 'Engineer（障害）' | 'Engineer（施工）' | '施工管理' | '設置管理' | 'その他'
    priority?: '高' | '中' | '低';
    status?: '未着手' | '対応中' | '完了' | '保留';
    source_knowledge_id?: string; // クレームナレッジから「提議に展開」した場合に元 id を保持
}

export interface KnowledgeDraft {
    title: string;
    machine?: string;
    category?: string;
    phenomenon?: string;     // 事象
    countermeasure?: string; // 対処
    tags?: string[];
    incidents?: string[];
    status?: 'solved' | 'unsolved';
    recordType?: 'trouble' | 'incident'; // 種別 (トラブル / インシデント)
    content?: string;
}

export interface NavigateParams {
    // Knowledge 画面の検索キーワード
    search?: string;
    // Knowledge 画面の filterType
    knowledgeFilter?: 'all' | 'unsolved' | 'solved' | 'mine';
    // OperationalProposals 画面の status / category 絞り込み
    proposalStatus?: '全て' | '未着手' | '対応中' | '完了' | '保留';
    proposalCategory?: string;
    // 遷移先で「新規作成」モーダル / エディタを開く。
    // 「提議を登録したい」のように具体内容が無い意図向け (空フォームを開いて、ユーザーに記入を委ねる)
    openCreate?: boolean;
}

export interface Attachment {
    id: string;
    url: string;
    name: string;
    type: string;
    size: number;
    thumbnailUrl?: string;
}

export interface KnowledgeItem {
    id: string;
    title: string;
    machine: string;
    property: string;
    req_num: string;
    category: string;
    incidents: string[];
    tags: string[];
    content: string;
    phenomenon?: string;   // 事象
    countermeasure?: string; // 対処
    status: 'solved' | 'unsolved';
    recordType: 'trouble' | 'incident'; // 種別 (トラブル / インシデント)。既存=trouble
    createdAt?: string;
    updatedAt: string;
    author: string;       // 投稿者 (作成時に固定、編集では変更しない)
    updatedBy?: string;   // 最終更新者 (保存時に毎回上書き)
    claimLevel?: number;  // クレーム強度 0-10 (0=通常、1-10=クレーム、数値が高いほど強い)
    attachments?: Attachment[];
    // Extension
    likeCount?: number;
    wrongCount?: number;
    likeUsers?: string[];
    wrongUsers?: string[];
    myReaction?: ReactionType | null;
    // 種別ごとのリアクション集計 (likeCount/wrongCount の一般化。旧フィールドは互換のため併存)
    reactionCounts?: Partial<Record<ReactionType, number>>;
    reactionUsers?: Partial<Record<ReactionType, string[]>>;
    // 被参照数 (knowledge_views 集計、P3)
    viewCount?: number;
}

// アクティビティフィードの 1 イベント。専用テーブルは持たず、
// knowledge / knowledge_reactions / knowledge_comments の直近行から合成する。
export type ActivityEvent =
    | { kind: 'post'; id: string; knowledgeId: string; title: string; actorName: string; createdAt: string }
    | { kind: 'reaction'; id: string; knowledgeId: string; actorId: string; reactionType: ReactionType; createdAt: string }
    | { kind: 'comment'; id: string; knowledgeId: string; actorId: string; body: string; createdAt: string };

export interface KnowledgeComment {
    id: string;
    knowledge_id: string;
    author_id: string;
    author_name?: string; // usersMaster から解決して入れる (profiles FDW は叩かない)
    body: string;
    created_at: string;
    updated_at: string;
}

export interface MasterData {
    incidents: string[];
    categories: string[];
    users: User[];
}

export interface KnowledgeGroup {
    id: string;
    name: string;
    description?: string;
    memberIds: string[]; // profiles.id
    createdAt?: string;
    updatedAt?: string;
}

export interface OperationalProposal {
    id: string;
    title: string;
    description: string;
    problem?: string;   // 現状の問題点
    proposal?: string;  // 改善提案
    decision?: string;  // 決定事項
    author: string;
    proposed_at: string;
    status: '未着手' | '対応中' | '完了' | '保留';
    priority: '高' | '中' | '低';
    category?: string;
    source_no?: string;
    updated_by?: string; // profiles.id (最終更新者)
    visible_groups?: string[] | null; // 公開先グループ (NULL/空 = 全員公開)。decision があれば常に全員公開
    source_knowledge_id?: string; // 元クレームナレッジ id (「提議に展開」で起票された場合に set)
    assignee_id?: string | null;  // 担当者 (profiles.id)。未割当 = null
    assigned_at?: string | null;  // 担当割当日時。督促 (割当後N日未着手) の起点
    created_at: string;
    updated_at: string;
}

// 運用提議の「問題点」を項目分割して進捗管理する単位
export interface ProposalProblem {
    id: string;
    proposal_id: string;
    body: string;
    done: boolean;
    sort_order: number;
    created_by?: string;
    assignee_id?: string | null; // 項目ごとの担当者 (profiles.id)。未割当 = null
    created_at: string;
    updated_at: string;
}

export interface OperationalProposalComment {
    id: string;
    proposal_id: string;
    author_id: string;
    author_name?: string; // 取得時に profiles から結合して入れる
    body: string;
    created_at: string;
    updated_at: string;
}

export interface ApiResponse<T> {
    status?: 'success' | 'error';
    message?: string;
    data?: T;
    // For specific responses structure (like login)
    user?: User;
}
