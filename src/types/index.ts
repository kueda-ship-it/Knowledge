export interface User {
    id: string;        // profiles.id (uuid)
    name: string;      // profiles.full_name
    email?: string;    // profiles.email
    avatarUrl?: string; // profiles.avatar_url
    role: 'viewer' | 'user' | 'manager' | 'master';  // profiles.knl_role
    categories: string[]; // 所属グループ名 (profile_categories.category の配列、複数所属可)
}

export interface Reaction {
    knowledgeId: string;
    userId: string;
    type: 'like' | 'wrong';
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

export interface AppNotification {
    id: string;
    recipient_id: string;
    sender_name: string;
    type: 'like' | 'wrong' | 'edited';
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
    createdAt?: string;
    updatedAt: string;
    author: string;       // 投稿者 (作成時に固定、編集では変更しない)
    updatedBy?: string;   // 最終更新者 (保存時に毎回上書き)
    attachments?: Attachment[];
    // Extension
    likeCount?: number;
    wrongCount?: number;
    likeUsers?: string[];
    wrongUsers?: string[];
    myReaction?: 'like' | 'wrong' | null;
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
