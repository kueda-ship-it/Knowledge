/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// ビルド版数 (build id) を確定する。
// 優先: Vercel のコミット SHA → git rev-parse → ビルド時刻 (フォールバック)。
// この値を __BUILD_ID__ として埋め込み、同時に /version.json として配信する。
// クライアントは起動時の __BUILD_ID__ と最新 version.json を照合して
// 「古いタブが新デプロイに気づけない」問題 (SPA で index.html を読み直さない) を防ぐ。
function resolveBuildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  if (sha) return sha.slice(0, 12)
  try {
    return execSync('git rev-parse --short=12 HEAD').toString().trim()
  } catch {
    return `t${Date.now()}`
  }
}

const BUILD_ID = resolveBuildId()

// /version.json を本番ビルドで出力し、dev サーバーでも同じ内容を返す。
function versionPlugin(buildId: string): Plugin {
  const body = JSON.stringify({ buildId })
  return {
    name: 'app-version-json',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body })
    },
  }
}

export default defineConfig({
  plugins: [react(), versionPlugin(BUILD_ID)],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 5177,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
