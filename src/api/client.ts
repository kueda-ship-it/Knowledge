import { KnowledgeItem, MasterData, User } from '../types';

// ↓↓↓ 【重要】URLを書き換えてください ↓↓↓
const API_URL = "https://script.google.com/macros/s/AKfycbwPK_-4Qs39p96zc_VqkSc_yJn3YJodN71eirv7_qjitjTc9wNPpTL-eQzWY68J_sRu_g/exec";

export const apiClient = {
    async login(id: string): Promise<{ status: string, message?: string, user?: User }> {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'login', id })
        });
        return res.json();
    },

    async fetchAll(): Promise<KnowledgeItem[]> {
        const res = await fetch(API_URL);
        return res.json();
    },

    async fetchMasters(): Promise<MasterData> {
        const res = await fetch(`${API_URL}?action=getAllMasters`);
        return res.json();
    },

    async save(item: KnowledgeItem): Promise<any> {
        const postData = {
            action: 'save',
            data: item
        };
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(postData)
        });
        return res.json(); // GAS returns something simpler usually
    },

    async delete(id: string): Promise<any> {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'delete', id })
        });
        return res.json();
    },

    async updateMasters(data: { incidents: string[], categories: string[], users: User[] }): Promise<any> {
        const res = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'updateMaster', ...data })
        });
        return res.json();
    }
};
