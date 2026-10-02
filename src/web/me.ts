// Quién está usando Rumbo en este dispositivo (lo llena App al entrar).
export type Me = { id: number; login: string; name: string; role: 'admin' | 'user'; has_password: number };
let current: Me | null = null;
export const setMe = (m: Me | null) => { current = m; };
export const me = () => current;
export const isAdmin = () => current?.role === 'admin';
