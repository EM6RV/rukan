"use client";

// مسح الباركود بالكاميرا: BarcodeDetector (كروم/أندرويد) وإلا zxing (سفاري/آيفون) يتحمل وقت الحاجة بس.
// يقرا باستمرار، ونفس الكود ما يتكررش قبل ثانية ونص (باش ما يدخلش مرتين).
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";

type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats?(): Promise<string[]> };
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

export function CameraScanner({ open, onClose, onCode, title = "امسح بالكاميرا", hint }: { open: boolean; onClose: () => void; onCode: (code: string) => void; title?: string; hint?: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const cb = useRef(onCode);
  useEffect(() => { cb.current = onCode; }, [onCode]);

  useEffect(() => {
    if (!open) return;
    const el = video.current;
    let stop = false, stream: MediaStream | null = null, timer: ReturnType<typeof setTimeout> | null = null;
    let zxingControls: { stop(): void } | null = null;
    const seen = new Map<string, number>();
    const emit = (code: string) => {
      const now = Date.now();
      if ((seen.get(code) ?? 0) > now - 1500) return;
      seen.set(code, now);
      setLast(code);
      try { navigator.vibrate?.(60); } catch { /* ما يدعمش */ }
      cb.current(code);
    };
    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
        if (Ctor) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
          if (stop || !video.current) return;
          video.current.srcObject = stream;
          await video.current.play();
          const supported = (await Ctor.getSupportedFormats?.()) ?? FORMATS;
          const det = new Ctor({ formats: FORMATS.filter((f) => supported.includes(f)) });
          const tick = async () => {
            if (stop || !video.current) return;
            try { for (const r of await det.detect(video.current)) if (r.rawValue) emit(r.rawValue); } catch { /* إطار مش جاهز */ }
            timer = setTimeout(tick, 180);
          };
          void tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          if (stop || !video.current) return;
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video.current, (res) => { if (res) emit(res.getText()); });
        }
      } catch (e) {
        const name = (e as { name?: string }).name;
        setError(name === "NotAllowedError" ? "لازم تسمح للمتصفح يستعمل الكاميرا." : name === "NotFoundError" ? "ما لقيناش كاميرا في الجهاز." : "ما قدرناش نشغلوا الكاميرا. استعمل قارئ الباركود.");
      }
    })();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (el) el.srcObject = null;
    };
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="الكاميرا" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-gold/80" aria-hidden />
        </div>
        {error ? <p role="alert" className="text-sm text-danger-fg">{error}</p> : <p className="text-sm text-muted" aria-live="polite">{hint ?? (last ? `آخر مسح: ${last}` : "قرّب الباركود من الكاميرا.")}</p>}
      </div>
    </Modal>
  );
}
