import { createClient, processLock } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('環境変数 VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください')
}

// React.StrictMode の二重マウントで Web Locks API のロックが orphan 化し、
// auth セッション取得が 5 秒詰まる → REST/Realtime が雪崩式にタイムアウト、
// という問題を避けるため processLock（プロセス内限定の単純キュー）に切替。
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    lock: processLock,
  },
})
