export interface User {
    id: string;
    name: string;
    role: 'viewer' | 'user' | 'manager' | 'master';
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
