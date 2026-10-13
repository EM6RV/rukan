export type Result<T = void> = { ok: true; data: T } | { ok: false; error: string };
export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
export const ok = <T>(data: T): { ok: true; data: T } => ({ ok: true, data });
