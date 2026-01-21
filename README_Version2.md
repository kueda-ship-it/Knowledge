# Knowledge (社内ナレッジ蓄積システム)

概要
- 社内向けナレッジ管理システム（プロトタイプ）
- 主な機能: Markdown 記事、全文検索、タグ、バージョン管理、Google Workspace SSO
- OSS 優先で運用可能な構成を目指す

目標
- 数万件のドキュメントを扱えること
- 日本語全文検索に最適化（OpenSearch + Kuromoji 等）
- Google Workspace による認証／グループ連携

このリポジトリに含まれるもの（初期テンプレ）
- README.md（このファイル）
- LICENSE (MIT)
- .gitignore
- infra/docker-compose.yml（開発用）
- docs/README-architecture.md（設計方針）
- example-app/（Next.js + FastAPI の最小雛形）

クイックスタート（ローカル、Docker を利用する場合）
1. infra/docker-compose.yml を起動:
   cd infra
   docker-compose up -d
2. example-app の frontend/backend をビルドして起動:
   docker-compose build
   docker-compose up -d frontend backend
3. ブラウザで http://localhost:3000 を開く（フロントエンドのデフォルト）

将来の拡張アイデア
- 埋め込み検索（pgvector / 専用ベクタDB）を追加して意味検索を実装
- Google Drive / Docs からのインポート
- 承認ワークフロー・監査ログ・ロールベースアクセス制御
- 自動要約・FAQ生成（LLM を利用）

貢献
- OSS 方式で開発します。まずは Issues / PR で議論してください。