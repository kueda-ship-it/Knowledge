# Supabase OAuth x Microsoft Graph連携手順書

このドキュメントは、React/Vite アプリケーションなどにおいて、**Supabaseのログイン機能** と **Microsoft Graph API（OneDriveなど）の連携** を、ユーザーに二重の認証の手間（ポップアップ等）をかけず、シームレスに統合するための手法をまとめた手順書です。

## 概要

従来は、アプリへのログインをSupabaseで、Graph APIへのアクセスを `@azure/msal-browser` などを経由して個別に行うケースがありました。
しかし、サードパーティCookieの制限などによる「サイレント認証（Iframe経由でのトークン取得）の失敗」や、「ポップアップを再度出す必要があることのUX悪化」を防ぐために、**Supabaseログイン時にGraph API用のトークン（provider_token）を同時に横取りして取得・再利用する** アプローチが最も確実です。

## 統合のメリット
- MSAL (`@azure/msal-browser`) などの重い別ライブラリが完全に不要になります。
- ユーザーにポップアップ表示を複数回出す必要がなくなります（最初のアプリログイン時のMicrosoft認証1回のみ）。
- サードパーティCookieブロックの影響を受けず、100%確実にトークンが引き継がれます。

---

## 導入手順

### 1. Azure AD側 (Entra ID) の権限設定
Supabaseに設定しているAzureのアプリ登録（App Registration）において、API のアクセス許可を追加します。
- **追加する権限例**: `Files.ReadWrite` (OneDrive連携の場合), `User.Read`
- 管理者の同意が必要な場合は、事前にポータルから「管理者の同意を与えて」おきます。

### 2. Supabaseログイン時に必要なスコープ(権限)を要求する

SupabaseでMicrosoftログインを呼ぶ `signInWithOAuth` のオプションにおいて、`scopes` プロパティに作成したアプリアクセス許可（手順1）と同じスコープを指定します。

```typescript
const signInWithMicrosoft = () => {
  supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile openid Files.ReadWrite User.Read', // ここにOneDrive等の権限を追加！
      redirectTo: window.location.origin,
      queryParams: { response_type: 'code' },
    },
  });
};
```

### 3. auth sessionから provider_token をキャプチャして保管

Supabaseはログインの**直後のみ**、レスポンスの中にプロバイダ側（Microsoft）から振り出された生アクセストークンである `provider_token` を返します。
これを localStorage 等に保存します。

```typescript
// AuthContext.tsx など、セッションを監視している場所で実施

// 初回ページロード時のセッション取得
const { data } = await supabase.auth.getSession();
if (data.session?.provider_token) {
  localStorage.setItem('microsoft_graph_token', data.session.provider_token);
}

// 認証ステータスの変更監視時
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session) {
    if (session.provider_token) {
      localStorage.setItem('microsoft_graph_token', session.provider_token);
    }
  } else {
    // ログアウト時は確実にお掃除
    localStorage.removeItem('microsoft_graph_token');
  }
});
```

### 4. Graph APIクライアントを初期化する
`@microsoft/microsoft-graph-client` を用いて、初期化する際に先ほど保存した localStorage の文字列をただ返すだけの Custom AuthProvider を作成します。

```typescript
// microsoftGraph.ts などのライブラリファイル
import { Client, AuthenticationProvider } from "@microsoft/microsoft-graph-client";

class SupabaseTokenAuthProvider implements AuthenticationProvider {
    public async getAccessToken(): Promise<string> {
        const token = localStorage.getItem('microsoft_graph_token');
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
    return localStorage.getItem('microsoft_graph_token');
};
```

### 5. トークン有効期限切れのハンドリング

Microsoftの `provider_token` は通常60分程度で有効期限が切れます（Supabaseのセッション期限とは別軸です）。
使用時に `401 Unauthorized` や `InvalidAuthenticationToken` などのエラーが出た場合は、以下のように処理してユーザーに再ログインを促してください。

```typescript
try {
    const client = await getGraphClient();
    // ここで何か通信処理 (例: client.api('/me/drive').get() など)
} catch (e: any) {
    const errorStr = JSON.stringify(e);
    // 期限切れか不正なトークンの場合の判定
    if (errorStr.includes("invalid_grant") || e.code === "InvalidAuthenticationToken" || e.message === "LoginRequired") {
        // トークンを消して強制ログアウト状態とし、アラートを出す
        localStorage.removeItem('microsoft_graph_token');
        alert("Microsoft認証の期限が切れました。一度ログアウトし、再度ログインしてください。");
        // アプリとしてログアウト処理( supabase.auth.signOut() )を呼ぶのも有効です
    }
    throw e;
}
```

以上で実装は完了です。他のアプリを作成した際でも、Graph APIにアクセスしたい場合はこのパターンを踏襲することで、最もシンプルで堅牢なUXを提供することができます。
