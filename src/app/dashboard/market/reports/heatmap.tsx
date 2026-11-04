import { formatMoney } from "@/lib/money";

const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** خريطة حرارية: صف لكل يوم، عمود لكل ساعة (7ص لـ 1 بالليل). الشدة = نسبة من أعلى خانة */
export function Heatmap({ heat }: { heat: number[][] }) {
  const hours = [...Array.from({ length: 17 }, (_, i) => i + 7), 0, 1];
  const max = Math.max(1, ...heat.flat());
  return (
    <div className="overflow-x-auto px-3 pb-4" tabIndex={0} role="region" aria-label="ساعات الذروة">
      <table className="w-full border-separate border-spacing-0.5 text-[10px]" aria-label="المبيعات حسب اليوم والساعة">
        <thead><tr><th className="sr-only">اليوم</th>{hours.map((h) => <th key={h} scope="col" className="font-normal text-muted">{h}</th>)}</tr></thead>
        <tbody>
          {[6, 0, 1, 2, 3, 4, 5].map((d) => (
            <tr key={d}>
              <th scope="row" className="whitespace-nowrap pe-1 text-start font-normal text-muted">{DAYS[d]}</th>
              {hours.map((h) => {
                const v = heat[d]?.[h] ?? 0;
                return <td key={h} title={`${DAYS[d]} ${h}:00 — ${formatMoney(v)}`} className="h-6 min-w-5 rounded-sm" style={{ backgroundColor: v ? `color-mix(in oklab, var(--color-teal) ${Math.round(15 + (v / max) * 85)}%, transparent)` : "var(--color-surface-2)" }}><span className="sr-only">{formatMoney(v)}</span></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
