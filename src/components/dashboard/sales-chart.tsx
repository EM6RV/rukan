import { formatDayShort } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";

/** رسم أعمدة للمبيعات اليومية (SVG بدون مكتبات) */
export function SalesChart({ data }: { data: { dayStart: number; total: number; orders: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const W = 280, H = 120, gap = 10, bw = (W - gap * (data.length - 1)) / data.length;
  const sum = data.reduce((s, d) => s + d.total, 0);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H + 22}`} role="img" aria-label={`مبيعات آخر 7 أيام: ${formatMoney(sum)}`} className="h-auto w-full">
        {data.map((d, i) => {
          const h = Math.max(d.total > 0 ? 4 : 2, (d.total / max) * H);
          const x = W - (i + 1) * bw - i * gap; // RTL: أقدم يوم على اليمين
          const last = i === data.length - 1;
          return (
            <g key={d.dayStart}>
              <title>{`${formatDayShort(d.dayStart)}: ${formatMoney(d.total)} (${d.orders} طلبية)`}</title>
              <rect x={x} y={H - h} width={bw} height={h} rx={4} className={last ? "fill-(--color-gold)" : "fill-(--color-teal)"} opacity={d.total > 0 ? 1 : 0.25} />
              <text x={x + bw / 2} y={H + 15} textAnchor="middle" className="fill-(--color-muted)" fontSize="9">{formatDayShort(d.dayStart).split(" ")[0]}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
