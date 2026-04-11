# 概要
本プロジェクト (Knowledge DB) は、ユーザーがインシデントマスタデータやナレッジデータ、OneDrive連携を用いた添付ファイル管理などを一元的に行うためのアプリケーションです。
主な技術スタック: React, Vite, TypeScript, Supabase, Microsoft Graph API

# 現在のステータス
- ナレッジのインポート機能開発およびデータ投入完了
- ユーザー認証およびOneDriveアップロードにおけるMicrosoft認証統合を完了
- 継続的にUI/UXの改善および不具合の改修を実施中

# 重要な決定事項
- **OneDrive (Microsoft) 認証の統合**
  - 【背景】元々はSupabaseによるアプリアカウント認証と、OneDriveのファイル追加時(`useOneDriveUpload.ts`)の認証(`@azure/msal-browser`)が分離しており、ユーザーは2回のログイン・ポップアップ承認が必要だった。
  - 【課題】MSALのサイレント認証(ssoSilent)は、昨今のブラウザにおけるサードパーティCookieブロックの影響でIframe内で拒否されるケースが多く、「画面真っ白」や「interaction_in_progress」などのエラーを誘発していた。
  - 【決定】`@azure/msal-browser` の依存およびポップアップ/Iframeでのトークン取得処理を完全に撤廃した。
  - 【実装】Supabase OAuthプロバイダーのスコープに `Files.ReadWrite` `User.Read` を付与し、初回ログイン時に返ってくる `provider_token` をキャプチャして `localStorage` に保持。これを用いて Microsoft Graph API クライアントを初期化する設計とした。

# UI/UXのこだわり
- （随時追記）極力ユーザーの手を煩わせない自動化されたUX設計。エラー時などはポップアップではなくアラートやUI上で適切にメッセージを出し、ログイン切れ時も適切なフィードバックを行う。

# アンチパターン/失敗の回避
- **[回避すべき手法] MSAL をサードパーティコンテキストで利用すること**
  - アプリと異なるドメイン (`login.microsoftonline.com`) の認証Cookieを裏側(Iframe等)で取得しようとすると失敗する。SupabaseとAzure ADを連携させるなら、初回のOAuth Redirectのタイミングで一括してトークンをもらうのが最も安定する。

# ユーザー設定の鏡
- 全て日本語で返す。
- プロジェクトのドキュメント・仕様書・Taskなどは常に更新し、維持する。
- 結論ファースト・率直な指摘を心がける。

# 既知の課題/技術的負債
- `provider_token` の有効期限切れ（デフォルト60分程度）ハンドリング。現状は有効期限が切れた場合にエラー（LoginRequired状態）となり、ユーザー自身に再度ログアウト・ログインを行わせることでトークンを再取得させる回避策をとっている。
