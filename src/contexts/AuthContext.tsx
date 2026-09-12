import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { claimProfile, describeWriteError } from '../api/client'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  profileError: string | null
  retryProfile: () => Promise<void>
  signInWithMicrosoft: () => void
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  profileError: null,
  retryProfile: async () => {},
  signInWithMicrosoft: () => {},
  signInWithEmail: async () => ({ error: null }),
  signUpWithEmail: async () => ({ error: null }),
  signOut: () => {},
})

type ProfileResult = { user: User | null; error: string | null }

async function fetchProfile(session: Session): Promise<ProfileResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, knl_role, email, avatar_url')
    .eq('id', session.user.id)
    .maybeSingle()

  if (data && !error) {
    return {
      user: {
        id: data.id,
        name: data.display_name ?? session.user.email ?? '不明',
        email: data.email ?? session.user.email,
        role: (data.knl_role as User['role']) ?? 'viewer',
        avatarUrl: data.avatar_url ?? undefined,
        categories: [],
      },
      error: null,
    }
  }

  // id 一致なし → RPC で事前登録行（メール完全一致）を claim するか、viewer で新規作成する
  try {
    const claimed = await claimProfile()
    if (!claimed) {
      return { user: null, error: 'プロフィールを準備できませんでした。もう一度お試しください。' }
    }
    return {
      user: {
        id: claimed.id,
        name: claimed.display_name ?? session.user.email ?? '不明',
        email: claimed.email ?? session.user.email,
        role: (claimed.knl_role as User['role']) ?? 'viewer',
        avatarUrl: claimed.avatar_url ?? undefined,
        categories: [],
      },
      error: null,
    }
  } catch (e) {
    console.error('[Auth] claimProfile failed:', e)
    return { user: null, error: describeWriteError(e, 'プロフィールの準備') }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  const applyProfile = useCallback(async (s: Session) => {
    const result = await fetchProfile(s).catch((e): ProfileResult => {
      console.error('[Auth] fetchProfile error:', e)
      return { user: null, error: describeWriteError(e, 'プロフィールの読み込み') }
    })
    setUser(result.user)
    setProfileError(result.error)
  }, [])

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
        if (data.session && mounted) {
          await applyProfile(data.session)
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
        await applyProfile(session)
      } else {
        sessionStorage.removeItem('microsoft_graph_token')
        localStorage.removeItem('microsoft_graph_token') // 旧保管先の掃除
        setUser(null)
        setProfileError(null)
      }
    })

    return () => {
      mounted = false
      clearTimeout(fallback)
      subscription.unsubscribe()
    }
  }, [applyProfile])

  const retryProfile = useCallback(async () => {
    if (!session) return
    await applyProfile(session)
  }, [session, applyProfile])

  // セッションを「新鮮」に保つ。タブを開いた/復帰した時点で access token が
  // 期限切れ/間近なら先回りで更新しておく。これにより「最初に開いて最初の保存」で
  // 期限切れトークンを送って PostgREST が 401 を返す窓 (= 最初に開くと提議が保存できない)
  // を塞ぐ。rawRest 側の 401 リトライに頼り切らず、操作前にトークンを整えておくのが狙い。
  useEffect(() => {
    let running = false
    const keepSessionFresh = async () => {
      if (running) return
      running = true
      try {
        const { data } = await supabase.auth.getSession()
        const s = data.session
        if (!s) return
        const expMs = (s.expires_at ?? 0) * 1000
        // 期限まで 2 分未満なら先回りで更新 (頻発防止のため near-expiry のときだけ)
        if (expMs && expMs < Date.now() + 120_000) {
          await supabase.auth.refreshSession()
        }
      } catch (e) {
        console.warn('[Auth] keepSessionFresh failed:', e)
      } finally {
        running = false
      }
    }

    // 初回マウント + タブ復帰 (visibility) + ウィンドウフォーカス時に整える
    keepSessionFresh()
    const onVisible = () => { if (document.visibilityState === 'visible') keepSessionFresh() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', keepSessionFresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', keepSessionFresh)
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
    <AuthContext.Provider value={{ user, session, isLoading, profileError, retryProfile, signInWithMicrosoft, signInWithEmail, signUpWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
