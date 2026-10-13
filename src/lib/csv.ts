/** قارئ CSV صغير: يتعامل مع BOM وCRLF وعلامات الاقتباس والسطور داخل الاقتباس، ويكتشف الفاصل (, ; Tab). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = ([",", ";", "\t"] as const)
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0]!.d;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** يكتب CSV (UTF-8 مع BOM علشان Excel يقرا العربي صح) */
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    // حماية من حقن الصيغ في Excel: النص اللي يبدا بـ = + - @ يتحول لنص عادي (الأرقام الحقيقية ما تتأثرش)
    const s = typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}
