import { Client, AuthenticationProvider } from "@microsoft/microsoft-graph-client";

class SupabaseTokenAuthProvider implements AuthenticationProvider {
    public async getAccessToken(): Promise<string> {
        const token = sessionStorage.getItem('microsoft_graph_token');
        if (!token) {
            throw new Error("LoginRequired");
        }
        return token;
    }
}

export const getGraphClient = async () => {
    const authProvider = new SupabaseTokenAuthProvider();
    return Client.initWithMiddleware({ authProvider });
};

export const getToken = async (): Promise<string | null> => {
    return sessionStorage.getItem('microsoft_graph_token');
};

// 後方互換性のため（呼び出されても何もしない）
export const initializeMsal = async () => {};
export const signIn = async () => { return null; };
export const ssoLogin = async () => { return null; };
export const ssoLoginInteractive = async () => { return null; };

