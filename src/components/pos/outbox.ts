// طابور العمليات: كل عملية تتسجل محلياً أول (حتى بدون نت)، وتتبعت للسيرفر بالترتيب لما يرجع النت.
// السيرفر يطبق كل clientId مرة وحدة، فالإعادة آمنة دايماً.
import type { OpResult, PosOp } from "@/lib/pos-ops";
import { del, getAll, put } from "./local-db";

export type OutboxItem = PosOp & { seq?: number; attempts: number; lastError?: string | null; status?: "pending" | "blocked" };

export const newId = (): string => (typeof globalThis.crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

export async function enqueue(op: PosOp) {
  await put("outbox", { ...op, attempts: 0, status: "pending" } satisfies OutboxItem);
}

export const pending = () => getAll<OutboxItem>("outbox");

export type FlushResult = { sent: number; applied: OpResult[]; rejected: OpResult[]; blocked: boolean; offline: boolean; unauthorized?: boolean };

let flushing: Promise<FlushResult> | null = null;

/** يبعت الطابور بالترتيب (دفعات 50). يشيل اللي اتطبق/مكرر/مرفوض، ويخلي retry وblocked للمرة الجاية. */
export function flush(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const out: FlushResult = { sent: 0, applied: [], rejected: [], blocked: false, offline: false };
    try {
      for (;;) {
        const items = (await pending()).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)).slice(0, 50);
        if (!items.length) break;
        let res: Response;
        try {
          res = await fetch("/api/pos/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops: items.map(({ kind, payload }) => ({ kind, payload })) }) });
        } catch {
          out.offline = true;
          break;
        }
        if (res.status === 401) { out.unauthorized = true; break; }
        if (!res.ok) { out.offline = res.status >= 500 || res.status === 429; break; }
        const { results } = (await res.json()) as { results: OpResult[] };
        let stop = false;
        for (const [i, r] of results.entries()) {
          const item = items[i]!;
          out.sent++;
          if (r.status === "applied" || r.status === "duplicate") { out.applied.push(r); await del("outbox", item.seq!); }
          else if (r.status === "rejected") { out.rejected.push(r); await del("outbox", item.seq!); }
          else {
            await put("outbox", { ...item, attempts: item.attempts + 1, lastError: r.error ?? null, status: r.status === "blocked" ? "blocked" : "pending" });
            if (r.status === "blocked") out.blocked = true;
            stop = true;
          }
        }
        if (stop || results.length < items.length) break;
      }
    } finally {
      flushing = null;
    }
    return out;
  })();
  return flushing;
}
