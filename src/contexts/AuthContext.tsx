import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

interface AuthContextType {
  user: User | null
  session: Session | null
  isLoading: boolean
  signInWithMicrosoft: () => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signInWithMicrosoft: () => {},
  signOut: () => {},
})

async function fetchProfile(session: Session): Promise<User | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, knl_role, email')
    .eq('id', session.user.id)
    .single()

  if (!data) return null
  return {
    id: data.id,
    name: data.display_name ?? session.user.email ?? '不明',
    email: data.email ?? session.user.email,
    role: (data.knl_role as User['role']) ?? 'viewer',
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // 最大5秒でローディング解除（フォールバック）
    const fallback = setTimeout(() => {
      if (mounted) setIsLoading(false)
    }, 5000)

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        console.log('[Auth] session:', data.session?.user?.email ?? 'none')
        setSession(data.session)
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
        const profile = await fetchProfile(session).catch(() => null)
        setUser(profile)
      } else {
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
        scopes: 'email profile openid',
        redirectTo: window.location.origin,
        queryParams: { response_type: 'code' },
      },
    })
  }

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signInWithMicrosoft, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
