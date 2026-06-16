import type { User } from '../types';

/**
 * ロール別カラー・ラベルの単一の真実。
 * Admin / Header / バッジ表示はすべてここを参照する。
 *
 * 注: 最上位ロールは他アプリ(employee-master / dialpad / equipment / schedule)に合わせて
 * 'admin' を正規値とする。旧称 'master' は後方互換として admin と同義に扱う
 * (employee-master 側がまだ 'master' を書き込む可能性があるため)。
 */

export type Role = User['role'];

export interface RoleMeta {
    value: Role;
    /** 画面表示用ラベル (フル) */
    label: string;
    /** 画面表示用ラベル (ショート、バッジ等) */
    short: string;
    /** ベースカラー (hex) */
    color: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
    viewer:  { value: 'viewer',  label: '閲覧者 (VIEWER)',   short: 'VIEWER',  color: '#94a3b8' }, // slate-400
    user:    { value: 'user',    label: '編集者 (USER)',     short: 'USER',    color: '#3b82f6' }, // blue-500
    manager: { value: 'manager', label: '管理者 (MANAGER)',  short: 'MANAGER', color: '#8b5cf6' }, // violet-500
    admin:   { value: 'admin',   label: 'Admin (管理者)',    short: 'ADMIN',   color: '#f59e0b' }, // amber-500
    master:  { value: 'master',  label: 'Admin (管理者)',    short: 'ADMIN',   color: '#f59e0b' }, // 旧称。admin と同義(後方互換)
};

/**
 * セレクトで選べるロール。最上位は表示「Admin」だが、保存値は profiles(外部テーブル=employee-master)
 * の CHECK 制約に通る 'master' を使う。employee-master 側で制約に 'admin' が追加されたら
 * ここを ROLE_META.admin に差し替える。
 */
export const ROLE_OPTIONS: RoleMeta[] = [
    ROLE_META.viewer,
    ROLE_META.user,
    ROLE_META.manager,
    ROLE_META.master, // 表示は「Admin」、保存値は 'master' (制約互換)
];

export const roleColor = (role: Role): string => (ROLE_META[role] ?? ROLE_META.user).color;
export const roleLabel = (role: Role): string => (ROLE_META[role] ?? ROLE_META.user).label;
export const roleShort = (role: Role): string => (ROLE_META[role] ?? ROLE_META.user).short;

// 権限判定ヘルパー (master は admin の旧称として同等に扱う)。
export const isAdminRole = (role?: Role | string | null): boolean => role === 'admin' || role === 'master';
export const isManagerOrAbove = (role?: Role | string | null): boolean => role === 'manager' || isAdminRole(role);
