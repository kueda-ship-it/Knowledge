import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  signInWithMicrosoft: () => void
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signInWithMicrosoft: () => {},
  signInWithEmail: async () => ({ error: null }),
  signUpWithEmail: async () => ({ error: null }),
  signOut: () => {},
})

async function fetchProfile(session: Session): Promise<User | null> {
  const sessionEmail = (session.user.email ?? '').toLowerCase()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, knl_role, email, avatar_url')
    .eq('id', session.user.id)
    .maybeSingle()

  if (data && !error) {
    return {
      id: data.id,
      name: data.display_name ?? session.user.email ?? '不明',
      email: data.email ?? session.user.email,
      role: (data.knl_role as User['role']) ?? 'viewer',
      avatarUrl: data.avatar_url ?? undefined,
      categories: [],
    }
  }

  // id 一致なし → email でadmin事前登録行を探して claim する（id を差し替え）
  if (sessionEmail) {
    const { data: byEmail } = await supabase
      .from('profiles')
      .select('id, display_name, knl_role, email, avatar_url')
      .ilike('email', sessionEmail)
      .maybeSingle()

    if (byEmail) {
      console.log('[Auth] Claiming pre-seeded profile by email:', sessionEmail)
      const { data: claimed, error: claimErr } = await supabase
        .from('profiles')
        .update({
          id: session.user.id,
          display_name: byEmail.display_name || session.user.user_metadata?.full_name || sessionEmail.split('@')[0],
          avatar_url: byEmail.avatar_url ?? session.user.user_metadata?.avatar_url ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', byEmail.id)
        .select()
        .single()

      if (!claimErr && claimed) {
        return {
          id: claimed.id,
          name: claimed.display_name ?? session.user.email ?? '不明',
          email: claimed.email ?? session.user.email,
          role: (claimed.knl_role as User['role']) ?? 'viewer',
          avatarUrl: claimed.avatar_url ?? undefined,
          categories: [],
        }
      }
      console.error('[Auth] Claim by email failed, falling back to insert:', claimErr)
    }
  }

  console.log('[Auth] Profile not found, creating new profile for:', session.user.email)

  const { data: inserted, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: session.user.id,
      email: sessionEmail || session.user.email,
      display_name: session.user.user_metadata?.full_name || sessionEmail.split('@')[0] || '新規ユーザー',
      avatar_url: session.user.user_metadata?.avatar_url || null,
      knl_role: 'viewer'
    })
    .select()
    .single()

  if (insertError) {
    console.error('[Auth] Initial registration failed:', insertError)
    return null
  }

  return {
    id: inserted.id,
    name: inserted.display_name ?? session.user.email ?? '不明',
    email: inserted.email ?? session.user.email,
    role: (inserted.knl_role as User['role']) ?? 'viewer',
    avatarUrl: inserted.avatar_url ?? undefined,
    categories: [],
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const fallback = setTimeout(() => {
      if (mounted) setIsLoading(false)
    }, 5000)

    // 旧 localStorage 保管の token を sessionStorage に一度だけ移行（XSS 持ち出し対策）
    const legacyToken = localStorage.getItem('microsoft_graph_token')
    if (legacyToken) {
      if (!sessionStorage.getItem('microsoft_graph_token')) {
        sessionStorage.setItem('microsoft_graph_token', legacyToken)
      }
      localStorage.removeItem('microsoft_graph_token')
    }

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        setSession(data.session)
        if (data.session?.provider_token) {
          sessionStorage.setItem('microsoft_graph_token', data.session.provider_token)
        }
        if (data.session) {
          const profile = await fetchProfile(data.session).catch((e) => {
            console.error('[Auth] fetchProfile error:', e)
            return null
          })
          if (mounted) setUser(profile)
        }
      } catch (e) {
        console.error('[Auth] init error:', e)
      } finally {
        clearTimeout(fallback)
        if (mounted) setIsLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session) {
        if (session.provider_token) {
          sessionStorage.setItem('microsoft_graph_token', session.provider_token)
        }
        const profile = await fetchProfile(session).catch(() => null)
        setUser(profile)
      } else {
        sessionStorage.removeItem('microsoft_graph_token')
        localStorage.removeItem('microsoft_graph_token') // 旧保管先の掃除
        setUser(null)
      }
    })

    return () => {
      mounted = false
      clearTimeout(fallback)
      subscription.unsubscribe()
    }
  }, [])

  const signInWithMicrosoft = () => {
    supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'email profile openid Files.ReadWrite User.Read',
        redirectTo: window.location.origin,
        queryParams: { response_type: 'code' },
      },
    })
  }

  const signInWithEmail = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { error: 'メールアドレスまたはパスワードが正しくありません。' }
      }
      return { error: error.message }
    }
    return { error: null }
  }

  const signUpWithEmail = async (email: string, password: string): Promise<{ error: string | null }> => {
    // ホワイトリスト照合
    const { data: wl, error: wlError } = await supabase
      .from('whitelist')
      .select('email')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (wlError) {
      return { error: 'ホワイトリストの確認中にエラーが発生しました。' }
    }
    if (!wl) {
      return { error: 'このメールアドレスは登録が許可されていません。管理者にお問い合わせください。' }
    }

    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      if (error.message.includes('already registered')) {
        return { error: 'このメールアドレスはすでに登録されています。ログインしてください。' }
      }
      return { error: error.message }
    }
    return { error: null }
  }

  // supabase-js の auth ロックが詰まっているとサインアウト含む全操作が返ってこなくなる。
  // ローカルのセッションストレージを同期的に消してから再読み込みすることで、
  // どんな状態からでも確実にログイン画面に戻れるようにする。
  const signOut = () => {
    try {
      // sb-<ref>-auth-token など supabase 由来の localStorage キーを全消し
      const keys = Object.keys(localStorage)
      for (const k of keys) {
        if (k.startsWith('sb-') || k === 'supabase.auth.token') localStorage.removeItem(k)
      }
      sessionStorage.removeItem('microsoft_graph_token')
      localStorage.removeItem('microsoft_graph_token')
    } catch { /* noop */ }

    // サインアウトを fire-and-forget でサーバーにも通知 (失敗しても気にしない)
    supabase.auth.signOut().catch(() => { /* noop */ })

    // React 状態を介さずハードリロードで画面遷移
    window.location.replace(window.location.origin)
  }

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signInWithMicrosoft, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
