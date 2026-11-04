"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Download, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { toCsv } from "@/lib/csv";
import { formatMoney } from "@/lib/money";
import { TEMPLATE_EXAMPLE, TEMPLATE_HEADERS } from "@/lib/import-template";
import type { ImportReport } from "@/server/catalog/import";
import { previewImportAction, runImportAction, type ImportPreview } from "../actions";

export function ImportWizard({ writable, remaining }: { writable: boolean; remaining: number | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(toCsv([TEMPLATE_HEADERS, ...TEMPLATE_EXAMPLE]))}`;

  function choose(f: File | undefined) {
    setPreview(null); setReport(null); setError(null); setFile(f ?? null);
    if (!f) return;
    const body = new FormData();
    body.set("file", f);
    startTransition(async () => {
      const r = await previewImportAction(body);
      if (!r.ok) { setError(r.error); return; }
      setPreview(r.data);
    });
  }

  function run() {
    if (!file) return;
    const body = new FormData();
    body.set("file", file);
    setError(null);
    startTransition(async () => {
      const r = await runImportAction(body);
      if (!r.ok) { setError(r.error); return; }
      setReport(r.data); setPreview(null); setFile(null);
      if (input.current) input.current.value = "";
    });
  }

  if (report) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3"><CheckCircle2 className="size-8 text-success-fg" /><div><h2 className="text-xl">تم الاستيراد: {report.created} منتج</h2>{report.categoriesCreated > 0 && <p className="text-muted">وأُنشئ {report.categoriesCreated} قسم جديد.</p>}</div></div>
          {report.limitReached && <p className="rounded-md bg-gold/20 px-3 py-2 text-sm font-medium">وصلت لحد باقتك، فتخطينا باقي المنتجات. رقّي باقتك لتضيف أكثر.</p>}
          {report.skipped.length > 0 && <SkippedList items={report.skipped} title={`تخطينا ${report.skipped.length} سطر`} />}
          <div className="flex gap-2"><Link href="/dashboard/products" className="inline-flex h-11 items-center rounded-md bg-gold px-5 font-semibold text-navy">عرض المنتجات</Link><Button variant="outline" onClick={() => setReport(null)}>استيراد ملف ثاني</Button></div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="1. جهّز ملفك" description="ملف Excel (.xlsx) أو CSV، وسطر العناوين في أول سطر." />
        <CardBody className="space-y-3 text-sm">
          <p>الأعمدة: <b>الاسم</b> و<b>السعر</b> (مطلوبين)، وبعدها اختياري: السعر قبل التخفيض، التكلفة، المخزون، القسم، الوصف، الكود، ظاهر (نعم/لا). الأسعار بالدينار.</p>
          <p className="text-muted">الأقسام الجديدة تنضاف تلقائياً. كل منتج يدخل بمتغير واحد (الخيارات تضيفها بعدين من صفحة المنتج). الحد الأقصى 500 منتج في المرة{remaining !== null && <>، وباقي لك {remaining} منتج في باقتك</>}.</p>
          <a href={templateHref} download="rukn-products-template.csv" className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 font-medium hover:bg-surface-2"><Download className="size-4" /> تحميل نموذج جاهز</a>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. ارفع الملف" />
        <CardBody className="space-y-4">
          <button type="button" disabled={!writable || pending} onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-muted transition-colors hover:border-gold hover:text-fg disabled:opacity-50">
            <FileSpreadsheet className="size-8" />
            <span className="font-medium">{file ? file.name : "اضغط لاختيار ملف"}</span>
          </button>
          <input ref={input} type="file" accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p>}
          {pending && !preview && <p className="text-sm text-muted">جاري قراءة الملف…</p>}
        </CardBody>
      </Card>

      {preview && (
        <Card>
          <CardHeader title="3. راجع واستورد" />
          <CardBody className="space-y-4">
            <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-5 text-success-fg" /> {preview.valid} منتج جاهز للاستيراد{preview.errors.length > 0 && <span className="text-danger-fg"> · {preview.errors.length} سطر فيه مشكلة</span>}</p>
            {preview.sample.length > 0 && (
              <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                {preview.sample.map((s, i) => <li key={i} className="flex items-center justify-between gap-3 px-3 py-2"><span className="truncate font-medium">{s.name}</span><span className="shrink-0 text-muted">{formatMoney(s.price)} · مخزون {s.stock}{s.category ? ` · ${s.category}` : ""}</span></li>)}
              </ul>
            )}
            {preview.errors.length > 0 && <SkippedList items={preview.errors} title="الأسطر اللي ما تتستوردش" />}
            <Button size="lg" loading={pending} disabled={preview.valid === 0 || !writable} onClick={run}>استيراد {preview.valid} منتج</Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function SkippedList({ items, title }: { items: { line: number; error: string }[]; title: string }) {
  return (
    <details className="rounded-lg border border-line text-sm" open={items.length <= 5}>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-medium"><TriangleAlert className="size-4 text-danger-fg" /> {title}</summary>
      <ul className="divide-y divide-line border-t border-line">
        {items.slice(0, 50).map((e, i) => <li key={i} className="px-3 py-1.5"><span className="text-muted">سطر {e.line}:</span> {e.error}</li>)}
        {items.length > 50 && <li className="px-3 py-1.5 text-muted">… و{items.length - 50} غيرها</li>}
      </ul>
    </details>
  );
}
