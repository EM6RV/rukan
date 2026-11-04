// طابعة حرارية مباشرة (اختياري): ESC/POS عبر Web Serial أو WebUSB (كروم على الكمبيوتر والأندرويد).
// أغلب الطابعات ما تدعمش العربي كنص، فنرسم الفاتورة على canvas (الحروف العربية تتشكل صح) ونبعتها صورة نقطية.
// لو المتصفح ما يدعمش (سفاري/آيفون) نستعمل الطباعة العادية (window.print) بـ CSS @page.

import { isScalePort } from "./scale";

type SerialPortLike = { open(o: { baudRate: number }): Promise<void>; writable: WritableStream<Uint8Array> | null; close(): Promise<void> };
type UsbDeviceLike = {
  open(): Promise<void>; selectConfiguration(n: number): Promise<void>; claimInterface(n: number): Promise<void>;
  configuration: { interfaces: { interfaceNumber: number; alternate: { endpoints: { direction: string; type: string; endpointNumber: number }[] } }[] } | null;
  transferOut(ep: number, data: BufferSource): Promise<unknown>; opened: boolean;
};
type Nav = Navigator & {
  serial?: { requestPort(): Promise<SerialPortLike>; getPorts(): Promise<SerialPortLike[]> };
  usb?: { requestDevice(o: { filters: object[] }): Promise<UsbDeviceLike>; getDevices(): Promise<UsbDeviceLike[]> };
};

export const printerSupport = () => {
  if (typeof navigator === "undefined") return { serial: false, usb: false };
  const n = navigator as Nav;
  return { serial: !!n.serial, usb: !!n.usb };
};

export interface PrinterConn { write(bytes: Uint8Array): Promise<void>; kind: "serial" | "usb" }

let conn: PrinterConn | null = null;
export const connectedPrinter = () => conn;

async function fromSerial(port: SerialPortLike): Promise<PrinterConn> {
  try { await port.open({ baudRate: 9600 }); } catch { /* مفتوح من قبل */ }
  return {
    kind: "serial",
    async write(bytes) {
      const w = port.writable!.getWriter();
      try { await w.write(bytes); } finally { w.releaseLock(); }
    },
  };
}

async function fromUsb(dev: UsbDeviceLike): Promise<PrinterConn> {
  if (!dev.opened) await dev.open();
  if (!dev.configuration) await dev.selectConfiguration(1);
  const iface = dev.configuration!.interfaces.find((i) => i.alternate.endpoints.some((e) => e.direction === "out" && e.type === "bulk"));
  if (!iface) throw new Error("الطابعة ما فيهاش منفذ طباعة USB مناسب.");
  try { await dev.claimInterface(iface.interfaceNumber); } catch { /* محجوز من قبل */ }
  const ep = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk")!.endpointNumber;
  return { kind: "usb", async write(bytes) { for (let i = 0; i < bytes.length; i += 16_384) await dev.transferOut(ep, bytes.slice(i, i + 16_384)); } };
}

/** ربط طابعة جديدة (يحتاج ضغطة من المستخدم) */
export async function connectPrinter(kind: "serial" | "usb"): Promise<PrinterConn> {
  const n = navigator as Nav;
  conn = kind === "serial" ? await fromSerial(await n.serial!.requestPort()) : await fromUsb(await n.usb!.requestDevice({ filters: [] }));
  return conn;
}

/** إعادة الربط بالطابعة اللي وافق عليها قبل (بدون سؤال) */
export async function reconnectPrinter(): Promise<PrinterConn | null> {
  const n = navigator as Nav;
  try {
    const port = (await n.serial?.getPorts())?.find((p) => !isScalePort(p as never));
    if (port) return (conn = await fromSerial(port));
    const dev = (await n.usb?.getDevices())?.[0];
    if (dev) return (conn = await fromUsb(dev));
  } catch { /* الطابعة مفصولة */ }
  return null;
}

// ===== أوامر ESC/POS =====
const INIT = [0x1b, 0x40];
const FEED_CUT = [0x1b, 0x64, 0x04, 0x1d, 0x56, 0x42, 0x00];
const DRAWER = [0x1b, 0x70, 0x00, 0x19, 0xfa];

/** صورة 1-bit من canvas بأمر GS v 0 (على شرائح باش الطابعات الصغيرة ما يتعبوش) */
export function rasterFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height).data;
  const bytesPerRow = Math.ceil(width / 8);
  const parts: number[] = [...INIT];
  const BAND = 24;
  for (let y0 = 0; y0 < height; y0 += BAND) {
    const h = Math.min(BAND, height - y0);
    parts.push(0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8);
    for (let y = y0; y < y0 + h; y++) {
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x >= width) continue;
          const i = (y * width + x) * 4;
          const lum = 0.299 * img[i]! + 0.587 * img[i + 1]! + 0.114 * img[i + 2]!;
          if (img[i + 3]! > 128 && lum < 140) byte |= 0x80 >> bit;
        }
        parts.push(byte);
      }
    }
  }
  return new Uint8Array(parts);
}

export type ReceiptRow = { kind: "title" | "text" | "small" | "row" | "total" | "rule" | "center"; text?: string; left?: string; right?: string };

/** يرسم الفاتورة على canvas بعرض الطابعة (58mm = 384 نقطة، 80mm = 576) */
export function drawReceipt(rows: ReceiptRow[], paperWidth: 58 | 80): HTMLCanvasElement {
  const width = paperWidth === 80 ? 576 : 384;
  const pad = 8;
  const canvas = document.createElement("canvas");
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  const sizes = { title: 30, text: 22, small: 18, row: 22, total: 28, rule: 10, center: 22 } as const;
  canvas.width = width;
  canvas.height = rows.reduce((h, r) => h + sizes[r.kind] * 1.45, 40);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.direction = "rtl";
  let y = 16;
  for (const r of rows) {
    const size = sizes[r.kind];
    ctx.font = `${r.kind === "title" || r.kind === "total" ? "700" : "400"} ${size}px ${font}`;
    y += size * 1.2;
    if (r.kind === "rule") { ctx.fillRect(pad, y - size / 2, width - pad * 2, 2); continue; }
    if (r.kind === "row" || r.kind === "total") {
      ctx.textAlign = "right"; ctx.fillText(r.right ?? "", width - pad, y);
      ctx.textAlign = "left"; ctx.fillText(r.left ?? "", pad, y);
    } else if (r.kind === "title" || r.kind === "center") {
      ctx.textAlign = "center"; ctx.fillText(r.text ?? "", width / 2, y);
    } else {
      ctx.textAlign = "right"; ctx.fillText(r.text ?? "", width - pad, y);
    }
    y += size * 0.25;
  }
  return canvas;
}

export async function printRows(rows: ReceiptRow[], paperWidth: 58 | 80, opts: { openDrawer?: boolean } = {}) {
  if (!conn) throw new Error("ما فيش طابعة مربوطة.");
  const raster = rasterFromCanvas(drawReceipt(rows, paperWidth));
  await conn.write(new Uint8Array([...raster, ...FEED_CUT, ...(opts.openDrawer ? DRAWER : [])]));
}

export async function openDrawer() {
  if (!conn) throw new Error("ما فيش طابعة مربوطة.");
  await conn.write(new Uint8Array([...INIT, ...DRAWER]));
}
