// الميزان عبر Web Serial (اختياري، كروم على الكمبيوتر): نقرا السطر اللي يبعته الميزان ونطلع الوزن بالجرام.
// أغلب الموازين تبعت الوزن باستمرار بصيغة مثل "ST,GS,+0.250kg" أو "  1250 g". اللي يحتاج طلب نبعتله "W".

type Port = {
  open(o: { baudRate: number }): Promise<void>; readable: ReadableStream<Uint8Array> | null; writable: WritableStream<Uint8Array> | null;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
};
type Nav = Navigator & { serial?: { requestPort(): Promise<Port>; getPorts(): Promise<Port[]> } };

const KEY = "rukn-scale-port";
let port: Port | null = null;

export const scaleSupported = () => typeof navigator !== "undefined" && !!(navigator as Nav).serial;
export const scaleConnected = () => !!port;

const infoKey = (p: Port) => { const i = p.getInfo?.() ?? {}; return `${i.usbVendorId ?? "?"}:${i.usbProductId ?? "?"}`; };
/** منفذ الميزان المحفوظ (باش الطابعة ما تاخذوش بالغلط) */
export function isScalePort(p: { getInfo?(): { usbVendorId?: number; usbProductId?: number } }): boolean {
  try { return localStorage.getItem(KEY) === infoKey(p as Port); } catch { return false; }
}

async function open(p: Port) {
  try { await p.open({ baudRate: 9600 }); } catch { /* مفتوح من قبل */ }
  port = p;
}

export async function connectScale(): Promise<void> {
  const p = await (navigator as Nav).serial!.requestPort();
  await open(p);
  try { localStorage.setItem(KEY, infoKey(p)); } catch { /* التخزين مقفول */ }
}

export async function reconnectScale(): Promise<boolean> {
  try {
    const ports = (await (navigator as Nav).serial?.getPorts()) ?? [];
    const p = ports.find(isScalePort);
    if (!p) return false;
    await open(p);
    return true;
  } catch { return false; }
}

/** يطلع الوزن بالجرام من سطر الميزان (null = مش وزن صالح) */
export function parseScaleLine(line: string): number | null {
  const m = line.replace(",", ".").match(/([-+]?\d+(?:\.\d+)?)\s*(kg|g)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2]?.toLowerCase();
  const grams = unit === "g" ? n : unit === "kg" || m[1]!.includes(".") ? n * 1000 : n;
  return grams >= 1 && grams <= 1_000_000 ? Math.round(grams) : null;
}

/** يقرا وزن ثابت من الميزان (نفس القراءة مرتين ورا بعض) خلال المهلة */
export async function readWeight(timeoutMs = 3000): Promise<number | null> {
  if (!port?.readable) return null;
  try {
    const w = port.writable?.getWriter();
    if (w) { await w.write(new TextEncoder().encode("W\r\n")).catch(() => {}); w.releaseLock(); }
  } catch { /* الميزان ما يحتاجش طلب */ }
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let buf = "", last: number | null = null;
  const timer = setTimeout(() => void reader.cancel().catch(() => {}), timeoutMs);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split(/\r?\n|\r/);
      buf = parts.pop() ?? "";
      for (const line of parts) {
        const g = parseScaleLine(line);
        if (g === null) continue;
        if (g === last && !/US|unstable/i.test(line)) return g;
        last = g;
      }
    }
    return last;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
