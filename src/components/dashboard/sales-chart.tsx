import { formatDayShort } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";

/** رسم أعمدة للمبيعات اليومية (SVG بدون مكتبات) */
export function SalesChart({ data }: { data: { dayStart: number; total: number; orders: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const W = 560, H = 140;
  const gap = Math.min(16, W / (data.length * 4)); // فراغ يضيق مع كثرة الأعمدة علشان العرض ما يصيرش سالب
  const bw = (W - gap * (data.length - 1)) / data.length;
  const sum = data.reduce((s, d) => s + d.total, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 26}`} role="img" aria-label={`مبيعات الفترة: ${formatMoney(sum)}`} className="h-auto w-full max-h-64">
        {data.map((d, i) => {
          const h = Math.max(d.total > 0 ? 4 : 2, (d.total / max) * H);
          const x = W - (i + 1) * bw - i * gap; // RTL: أقدم يوم على اليمين
          const last = i === data.length - 1;
          return (
            <g key={d.dayStart}>
              <title>{`${formatDayShort(d.dayStart)}: ${formatMoney(d.total)} (${d.orders} طلبية)`}</title>
              <rect x={x} y={H - h} width={bw} height={h} rx={4} className={last ? "fill-(--color-gold)" : "fill-(--color-teal)"} opacity={d.total > 0 ? 1 : 0.25} />
              {data.length <= 12 && <text x={x + bw / 2} y={H + 19} textAnchor="middle" className="fill-(--color-muted)" fontSize="13">{formatDayShort(d.dayStart).split(" ")[0]}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
