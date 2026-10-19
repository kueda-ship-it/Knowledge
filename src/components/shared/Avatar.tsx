import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'

// 人の写真（profiles の avatar_url）。無い・読めないときは氏名の頭文字にする。
// 原本: app-template src/components/shared/Avatar.tsx（デザインキット。設計基準 M37 / 2026-10-19）
// 大きさは3段: sm 20px（行の中・氏名の横）／ md 28px（一覧・右上のログイン中の人）／ lg 36px（詳細・プロフィール）

export type AvatarSize = 'sm' | 'md' | 'lg'
const AVATAR_PX: Record<AvatarSize, number> = { sm: 20, md: 28, lg: 36 }

interface AvatarProps {
  name: string | null | undefined
  url: string | null | undefined
  size?: AvatarSize
  /** ツールチップ。氏名だけで足りるときは省略してよい */
  title?: string
}

export function Avatar({ name, url, size = 'md', title }: AvatarProps) {
  // 読めなかった URL を覚えておく（URL が変われば、また写真を試す）
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const broken = !!url && brokenUrl === url
  const px = AVATAR_PX[size]
  const initial = (name ?? '').trim().charAt(0) || '?'
  if (url && !broken) {
    return <img className="avatar" src={url} alt="" title={title} width={px} height={px} onError={() => setBrokenUrl(url)} style={{ width: px, height: px }} />
  }
  return (
    <span className="avatar avatar-initial" aria-hidden title={title} style={{ width: px, height: px, fontSize: Math.round(px * 0.45) }}>
      {initial}
    </span>
  )
}

/** 右上のログイン中の人。ツールチップに氏名とメールを出す（Knowledge は AuthContext の user を読む） */
export function ProfileAvatar() {
  const { user } = useAuth()
  const name = user?.name ?? ''
  const email = user?.email ?? ''
  const label = [name, email].filter(Boolean).join('\n') || 'ログイン中'
  return (
    <span className="profile-avatar" role="img" aria-label={label.replace('\n', ' ')} title={label} data-test="profile-avatar">
      <Avatar name={name || email} url={user?.avatarUrl} />
    </span>
  )
}
