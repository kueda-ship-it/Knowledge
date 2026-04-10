import {
    PublicClientApplication,
    Configuration,
    LogLevel,
    AccountInfo,
    InteractionRequiredAuthError,
    InteractionType,
} from "@azure/msal-browser";
import { Client } from "@microsoft/microsoft-graph-client";
import { AuthCodeMSALBrowserAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/authCodeMsalBrowser";

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID?.trim();
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID?.trim();
const redirectUri = window.location.origin;

if (!clientId || !tenantId) {
    console.error("VITE_AZURE_CLIENT_ID or VITE_AZURE_TENANT_ID is missing");
}

const msalConfig: Configuration = {
    auth: {
        clientId: clientId || "",
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri,
    },
    cache: { cacheLocation: "localStorage" },
    system: {
        loggerOptions: {
            loggerCallback: (level, message, containsPii) => {
                if (containsPii) return;
                if (level === LogLevel.Error) console.error(message);
                if (level === LogLevel.Warning) console.warn(message);
            },
            logLevel: LogLevel.Warning,
        },
    },
};

export const loginRequest = {
    scopes: ["User.Read", "Files.ReadWrite"],
};

export const msalInstance = new PublicClientApplication(msalConfig);

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export const initializeMsal = async () => {
    if (isInitialized) return;
    if (!initPromise) {
        initPromise = (async () => {
            await msalInstance.initialize();
            try {
                const response = await msalInstance.handleRedirectPromise();
                if (response) msalInstance.setActiveAccount(response.account);
            } catch (e: any) {
                if (!e.errorCode?.includes("no_token_request_cache_error")) {
                    console.error("Redirect handle error:", e);
                }
            }
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
                msalInstance.setActiveAccount(accounts[0]);
            }
            isInitialized = true;
        })();
    }
    await initPromise;
};

let isLoggingIn = false;
export const signIn = async (prompt: "select_account" | "consent" = "select_account"): Promise<AccountInfo | null> => {
    if (isLoggingIn) return null;
    await initializeMsal();
    const active = msalInstance.getActiveAccount();
    if (active && prompt !== "consent") return active;
    try {
        isLoggingIn = true;
        const result = await msalInstance.loginPopup({ ...loginRequest, prompt });
        msalInstance.setActiveAccount(result.account);
        return result.account;
    } catch (e: any) {
        if (e.errorCode !== "interaction_in_progress") {
            try {
                await msalInstance.loginRedirect({ ...loginRequest, prompt });
            } catch (re) {
                console.error("Redirect login failed:", re);
            }
        }
        return null;
    } finally {
        isLoggingIn = false;
    }
};

export const ssoLogin = async (email: string): Promise<AccountInfo | null> => {
    if (!email) return null;
    await initializeMsal();
    const active = msalInstance.getActiveAccount();
    if (active && active.username.toLowerCase() === email.toLowerCase()) return active;
    try {
        const accounts = msalInstance.getAllAccounts();
        const existing = accounts.find(a => a.username.toLowerCase() === email.toLowerCase());
        if (existing) { msalInstance.setActiveAccount(existing); return existing; }
        const result = await msalInstance.ssoSilent({ ...loginRequest, loginHint: email });
        msalInstance.setActiveAccount(result.account);
        return result.account;
    } catch {
        return null;
    }
};

export const getToken = async (): Promise<string | null> => {
    await initializeMsal();
    const account = msalInstance.getActiveAccount();
    if (!account) return null;
    try {
        const res = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
        return res.accessToken;
    } catch (e) {
        if (e instanceof InteractionRequiredAuthError) return null;
        return null;
    }
};

export const getGraphClient = async () => {
    await initializeMsal();
    const account = msalInstance.getActiveAccount();
    if (!account) throw new Error("User not signed in to Microsoft");
    const authProvider = new AuthCodeMSALBrowserAuthenticationProvider(msalInstance, {
        account,
        scopes: loginRequest.scopes,
        interactionType: InteractionType.Popup,
    });
    return Client.initWithMiddleware({ authProvider });
};
