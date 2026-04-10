export interface User {
    id: string;        // profiles.id (uuid)
    name: string;      // profiles.full_name
    email?: string;    // profiles.email
    role: 'viewer' | 'user' | 'manager' | 'master';  // profiles.knl_role
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
