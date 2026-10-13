"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { subscribePushAction, unsubscribePushAction } from "@/app/dashboard/push-actions";

const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

type State = "loading" | "unsupported" | "denied" | "off" | "on";

/** بطاقة تفعيل إشعارات الطلبيات الجديدة على هذا الجهاز (تظهر بس لو المنصة فعّلت VAPID والمتصفح يدعم) */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const { toast } = useToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const r = await subscribePushAction(sub.toJSON());
      if (!r.ok) { await sub.unsubscribe(); return toast(r.error, "error"); }
      setState("on");
      toast("تم تفعيل إشعارات الطلبيات على هذا الجهاز");
    } catch {
      toast("ما قدرنا نفعّل الإشعارات. جرّب مرة ثانية.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await unsubscribePushAction(sub.endpoint); await sub.unsubscribe(); }
      setState("off");
      toast("تم إيقاف الإشعارات على هذا الجهاز");
    } catch {
      toast("ما قدرنا نوقف الإشعارات. جرّب مرة ثانية.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-navy dark:text-gold">{state === "on" ? <Bell className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}</span>
        <div>
          <p className="font-semibold">{state === "on" ? "إشعارات الطلبيات شغالة على هذا الجهاز" : "فعّل إشعارات الطلبيات"}</p>
          <p className="text-sm text-muted">
            {state === "denied" ? "الإشعارات محجوبة من إعدادات المتصفح. فعّلها من إعدادات الموقع وارجع جرّب." : state === "on" ? "تجيك رسالة على جوالك أول ما زبون يطلب، حتى لو اللوحة مقفولة." : "تجيك رسالة على جوالك أول ما زبون يطلب، حتى لو اللوحة مقفولة."}
          </p>
        </div>
      </div>
      {state === "off" && <Button onClick={enable} loading={busy}>فعّل الإشعارات</Button>}
      {state === "on" && <Button variant="outline" size="sm" onClick={disable} loading={busy}>إيقاف</Button>}
    </Card>
  );
}
