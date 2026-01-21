# アーキテクチャ概要

目的
- 社内向けナレッジを効率的に蓄積・検索・参照するためのシステム

主要コンポーネント
- Frontend: Next.js（React） — ユーザー向け UI、SSR/SEO と開発生産性を両立
- Backend: FastAPI（Python） — REST API、認証、ビジネスロジック
- DB: PostgreSQL — メタデータ、本文（ストレージは DB or オブジェクトストレージ）
- 検索: OpenSearch（Kuromoji） — 日本語全文検索に最適化
- ストレージ: MinIO（S3互換） — 添付ファイル格納
- 認証: Google Workspace（OIDC/SAML） — 社内シングルサインオン
- オプション: pgvector（Postgres 拡張）または専用ベクタDB（埋め込み検索）

データフロー（簡略）
1. ユーザーが記事を作成（Markdown）
2. Backend が DB に保存し、OpenSearch にインデックス
3. 検索時は OpenSearch でキーワード検索＋将来は埋め込み検索を併用
4. 添付ファイルは MinIO に保存し、メタデータを DB に保持

運用上の注意
- バックアップ: Postgres スナップショット + MinIO バケットのバックアップ
- セキュリティ: Google Workspace を ID プロバイダにしてアクセス制御を実施
- ロギング/監査: 変更履歴（誰がいつ編集したか）を保存