import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_EQUIPMENT_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_EQUIPMENT_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // フォールバック（未設定の場合は動作しないがエラーで落とさない）
  console.warn('環境変数 VITE_EQUIPMENT_SUPABASE_URL と VITE_EQUIPMENT_SUPABASE_ANON_KEY が設定されていません')
}

export const supabaseEquipment = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    })
  : null;
