// البطولات: خروج المغلوب (شجرة بأدوار، والفراغات bye) أو دوري (كل واحد مع الكل) وجدول الترتيب.

export type Slot = { round: number; slot: number; player1Id: string | null; player2Id: string | null; score1: number | null; score2: number | null; winnerId: string | null };

const nextPow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return p; };

/** شجرة خروج المغلوب: الدور الأول مرتب (seed)، والـ bye يأهل اللاعب وحده. الأدوار اللاحقة فاضية */
export function knockoutBracket(playerIds: string[]): Slot[] {
  const size = Math.max(2, nextPow2(playerIds.length));
  const rounds = Math.log2(size);
  const seeded: (string | null)[] = [...playerIds, ...Array(size - playerIds.length).fill(null)];
  // نوزعوا الفراغات: لاعب مقابل فراغ بدل فراغين مع بعض
  const pairs: [string | null, string | null][] = [];
  const half = size / 2;
  for (let i = 0; i < half; i++) pairs.push([seeded[i]!, seeded[size - 1 - i]!]);
  const out: Slot[] = pairs.map(([a, b], i) => ({ round: 1, slot: i, player1Id: a, player2Id: b, score1: null, score2: null, winnerId: a && !b ? a : !a && b ? b : null }));
  for (let r = 2; r <= rounds; r++) for (let i = 0; i < size / 2 ** r; i++) out.push({ round: r, slot: i, player1Id: null, player2Id: null, score1: null, score2: null, winnerId: null });
  return propagate(out);
}

/** يرفّع الفايزين للدور الجاي (يتنادى بعد كل نتيجة) */
export function propagate(slots: Slot[]): Slot[] {
  const by = (r: number, s: number) => slots.find((x) => x.round === r && x.slot === s);
  const maxRound = Math.max(...slots.map((s) => s.round));
  for (let r = 1; r < maxRound; r++) {
    for (const m of slots.filter((x) => x.round === r)) {
      const next = by(r + 1, Math.floor(m.slot / 2));
      if (!next) continue;
      const key = m.slot % 2 === 0 ? "player1Id" : "player2Id";
      if (next[key] !== m.winnerId) {
        next[key] = m.winnerId;
        next.score1 = null; next.score2 = null; next.winnerId = null;
      }
    }
    // bye في الأدوار اللاحقة: لو واحد بس وصل والثاني جاي من bye فاضي نهائياً
    for (const m of slots.filter((x) => x.round === r + 1)) {
      const a = by(r, m.slot * 2), b = by(r, m.slot * 2 + 1);
      const deadA = a && !a.player1Id && !a.player2Id, deadB = b && !b.player1Id && !b.player2Id;
      if (!m.winnerId && m.player1Id && !m.player2Id && deadB) m.winnerId = m.player1Id;
      if (!m.winnerId && m.player2Id && !m.player1Id && deadA) m.winnerId = m.player2Id;
    }
  }
  return slots;
}

/** يسجل نتيجة ماتش (التعادل ممنوع في خروج المغلوب) */
export function setResult(slots: Slot[], round: number, slot: number, score1: number, score2: number): { ok: true; slots: Slot[] } | { ok: false; error: string } {
  const m = slots.find((x) => x.round === round && x.slot === slot);
  if (!m || !m.player1Id || !m.player2Id) return { ok: false, error: "الماتش لسه ما اكتملش لاعبيه." };
  if (score1 === score2) return { ok: false, error: "التعادل ممنوع في خروج المغلوب: دخّل نتيجة الترجيح." };
  m.score1 = score1; m.score2 = score2; m.winnerId = score1 > score2 ? m.player1Id : m.player2Id;
  return { ok: true, slots: propagate(slots) };
}

export const championOf = (slots: Slot[]) => {
  const maxRound = Math.max(...slots.map((s) => s.round));
  return slots.find((s) => s.round === maxRound)?.winnerId ?? null;
};

/** دوري: كل واحد مع الكل (طريقة الدائرة). round = الجولة */
export function leagueSchedule(playerIds: string[]): Slot[] {
  const ids: (string | null)[] = [...playerIds];
  if (ids.length % 2) ids.push(null);
  const n = ids.length, out: Slot[] = [];
  for (let r = 0; r < n - 1; r++) {
    let slot = 0;
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i]!, b = ids[n - 1 - i]!;
      if (a && b) out.push({ round: r + 1, slot: slot++, player1Id: a, player2Id: b, score1: null, score2: null, winnerId: null });
    }
    ids.splice(1, 0, ids.pop()!);
  }
  return out;
}

export type Standing = { playerId: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number };

/** ترتيب الدوري: فوز 3، تعادل 1، وبعدها فرق الأهداف ثم الأهداف */
export function standings(playerIds: string[], slots: Slot[]): Standing[] {
  const t = new Map(playerIds.map((id) => [id, { playerId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }]));
  for (const m of slots) {
    if (m.score1 === null || m.score2 === null || !m.player1Id || !m.player2Id) continue;
    const a = t.get(m.player1Id), b = t.get(m.player2Id);
    if (!a || !b) continue;
    a.played++; b.played++;
    a.goalsFor += m.score1; a.goalsAgainst += m.score2; b.goalsFor += m.score2; b.goalsAgainst += m.score1;
    if (m.score1 > m.score2) { a.won++; b.lost++; a.points += 3; }
    else if (m.score1 < m.score2) { b.won++; a.lost++; b.points += 3; }
    else { a.drawn++; b.drawn++; a.points++; b.points++; }
  }
  return [...t.values()].sort((x, y) => y.points - x.points || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor);
}
