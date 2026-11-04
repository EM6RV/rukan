// باركود SVG (EAN-13 لو صحيح، وإلا Code128) للملصقات المطبوعة. يشتغل في السيرفر بدون مكتبات.
import { barcodeModules } from "@/lib/barcode";

export function BarcodeSvg({ code, height = 40, className }: { code: string; height?: number; className?: string }) {
  let bars: { kind: string; modules: string };
  try { bars = barcodeModules(code); } catch { return <span className="text-xs">{code}</span>; }
  const quiet = 10, w = bars.modules.length + quiet * 2;
  const rects: React.ReactNode[] = [];
  for (let i = 0; i < bars.modules.length;) {
    if (bars.modules[i] !== "1") { i++; continue; }
    let j = i;
    while (bars.modules[j] === "1") j++;
    // أشرطة الحماية في EAN-13 أطول شوية
    const guard = bars.kind === "ean13" && (i < 3 || (i >= 45 && i < 50) || i >= 92);
    rects.push(<rect key={i} x={quiet + i} y={0} width={j - i} height={guard ? height + 5 : height} />);
    i = j;
  }
  return (
    <svg viewBox={`0 0 ${w} ${height + 16}`} className={className} role="img" aria-label={`باركود ${code}`} preserveAspectRatio="xMidYMid meet">
      <rect width={w} height={height + 16} fill="#fff" />
      <g fill="#000">{rects}</g>
      <text x={w / 2} y={height + 14} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#000" direction="ltr">{code}</text>
    </svg>
  );
}
