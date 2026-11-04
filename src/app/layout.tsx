import type { Metadata, Viewport } from "next";
import { Alexandria, IBM_Plex_Sans_Arabic } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// الخطوط: نحمّل مسبقاً (preload) الحروف العربية بس. اللاتينية والأرقام تتحمل لما تحتاجها الصفحة (unicode-range)،
// و swap يخلي النص يبان فوراً بخط النظام لين يوصل الخط.
const alexandria = Alexandria({ subsets: ["arabic"], variable: "--font-alexandria", display: "swap" });
const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "رُكن — ركنك في السوق… أونلاين.",
  description: "افتح متجرك الإلكتروني في دقيقتين: دفع عند الاستلام، مندوبين، مرتجعات، ومدن ليبيا جاهزة.",
  applicationName: "رُكن",
  appleWebApp: { capable: true, title: "رُكن", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0D263E",
  width: "device-width",
  initialScale: 1,
};

// يحدد الوضع (فاتح/داكن) قبل الرسم لتجنب الوميض. التفضيل يتخزن في localStorage.
const themeScript = `try{var t=localStorage.getItem("rukn-theme");if(!t||t==="system")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${alexandria.variable} ${plex.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
