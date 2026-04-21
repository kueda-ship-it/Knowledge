import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Realtime 専用 Supabase クライアント。
 *
 * メインクライアント (supabase) と同じプロジェクトに接続するが、
 * auth 状態（persistSession / autoRefreshToken / detectSessionInUrl）は持たない。
 * これにより Realtime の再接続ループが GoTrue の lockInternals を占有し
 * REST 側の保存処理をハングさせる問題を回避する。
 *
 * RLS に必要な JWT は、メインクライアントの auth 状態から
 * setAuth() で同期する。
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseRealtime = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storageKey: 'sb-realtime-isolated',
  },
})

// 起動時に現セッションの access_token を Realtime に反映
void supabase.auth.getSession().then(({ data }) => {
  const token = data.session?.access_token ?? null
  supabaseRealtime.realtime.setAuth(token)
})

// セッション変化（サインイン/サインアウト/リフレッシュ）を追従
supabase.auth.onAuthStateChange((_event, session) => {
  supabaseRealtime.realtime.setAuth(session?.access_token ?? null)
})
