export interface User {
    id: string;        // profiles.id (uuid)
    name: string;      // profiles.full_name
    email?: string;    // profiles.email
    avatarUrl?: string; // profiles.avatar_url
    role: 'viewer' | 'user' | 'manager' | 'master';  // profiles.knl_role
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

export interface ChatMessage {
    id: string;
    type: 'user' | 'assistant';
    text: string;
    results?: KnowledgeItem[];
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
    status: 'solved' | 'unsolved';
    updatedAt: string;
    author: string;
    attachments?: Attachment[];
    // Extension
    likeCount?: number;
    wrongCount?: number;
    myReaction?: 'like' | 'wrong' | null;
}

export interface MasterData {
    incidents: string[];
    categories: string[];
    users: User[];
}

export interface ApiResponse<T> {
    status?: 'success' | 'error';
    message?: string;
    data?: T;
    // For specific responses structure (like login)
    user?: User;
}
