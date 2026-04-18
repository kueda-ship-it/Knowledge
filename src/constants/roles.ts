import type { User } from '../types';

/**
 * ロール別カラー・ラベルの単一の真実。
 * Admin / Header / 今後のバッジ表示はすべてここを参照する。
 */

export type Role = User['role'];

export interface RoleMeta {
    value: Role;
    /** 画面表示用ラベル (フル) */
    label: string;
    /** 画面表示用ラベル (ショート、バッジ等) */
    short: string;
    /** ベースカラー (hex)。OKLCH コメントは将来の refinement 用の目安 */
    color: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
    viewer:  { value: 'viewer',  label: '閲覧者 (VIEWER)',       short: 'VIEWER',  color: '#94a3b8' }, // slate-400
    user:    { value: 'user',    label: '編集者 (USER)',         short: 'USER',    color: '#3b82f6' }, // blue-500
    manager: { value: 'manager', label: '管理者 (MANAGER)',      short: 'MANAGER', color: '#8b5cf6' }, // violet-500
    master:  { value: 'master',  label: '最上位権限 (MASTER)',    short: 'MASTER',  color: '#f59e0b' }, // amber-500 (a.k.a. "シアンオレンジ")
};

/** セレクト等で並び順固定で使う配列版 */
export const ROLE_OPTIONS: RoleMeta[] = [
    ROLE_META.viewer,
    ROLE_META.user,
    ROLE_META.manager,
    ROLE_META.master,
];

export const roleColor = (role: Role): string => ROLE_META[role].color;
export const roleLabel = (role: Role): string => ROLE_META[role].label;
export const roleShort = (role: Role): string => ROLE_META[role].short;
