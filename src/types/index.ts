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
    updatedAt: string;
    author: string;
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
