"use client";

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useStore } from "./store-context";

/** زر واتساب عائم (يظهر لو البياع حط رقمه) */
export function WhatsAppFloat() {
  const { whatsapp, name } = useStore();
  // في صفحة المنتج بالموبايل يغطي السعر وزر الشراء، فنخفيه هناك (يرجع على الشاشات الكبيرة)
  const onProduct = /\/product\//.test(usePathname() ?? "");
  if (!whatsapp) return null;
  const text = encodeURIComponent(`السلام عليكم، عندي استفسار من متجر ${name}`);
  return (
    <a
      href={`https://wa.me/${whatsapp}?text=${text}`} target="_blank" rel="noopener noreferrer" aria-label="تواصل معنا على واتساب"
      className={cn("fixed bottom-20 start-4 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lift transition-transform hover:scale-105 active:scale-95 lg:bottom-6", onProduct && "max-lg:hidden")}
    >
      <MessageCircle className="size-7" aria-hidden />
    </a>
  );
}
