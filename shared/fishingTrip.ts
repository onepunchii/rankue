/**
 * 크루 정출판(2026-10-14 낚시 셋째 기둥) — 동호회가 이미 하는 방식 그대로: 정출마다 최대어 · 마릿수 · 잡어상을 가리고,
 * 한 해의 점수를 쌓아 납회에 장원을 정한다(조사: 동호회 회칙 — 정출 최대어, 잡어상, 연간 합산 점수, 납회 시상).
 * 크루끼리 겨루는 기록 판은 다른 낚시 앱에 없는 자리다(모임 앱은 일정만, 대회 앱은 개인전만).
 *
 * 규칙:
 *  - 최대어: **길이로 말하는 어종**(cm) 가운데 가장 긴 한 마리. 마릿수 · 무게 어종은 길이로 견줄 수 없어 여기 들지 않는다.
 *  - 마릿수: 그 정출에서 올린 마릿수의 합.
 *  - 잡어상: 가장 여러 어종을 만난 사람(두 어종 이상일 때만).
 *  - 같은 값이면 같이 받는다(공동). 상금 · 참가비 · 내기는 없다 — 점수와 낙관뿐이다.
 * 점수: 참석 1 · 최대어 3 · 마릿수 2 · 잡어상 1.
 *
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { fishByName } from "./fishingFish.js";

export const TRIP_POINTS = { attend: 1, biggest: 3, most: 2, variety: 1 } as const;
export type TripAward = "biggest" | "most" | "variety";
export const TRIP_AWARD_NAME: Readonly<Record<TripAward, string>> = { biggest: "최대어", most: "마릿수", variety: "잡어상" };

export interface TripCatch { memberId: string; name: string; species: string; lengthCm: number | null; count: number }
export interface TripMember {
    memberId: string;
    name: string;
    /** 올린 마릿수의 합 */
    fish: number;
    /** 만난 어종 수 */
    species: number;
    /** 길이 어종 가운데 가장 긴 한 마리 */
    best: { species: string; lengthCm: number } | null;
    awards: TripAward[];
    points: number;
}
export interface TripBoard { members: TripMember[]; awards: Record<TripAward, string[]> }

/** 한 정출의 판 — 점수 높은 순(같으면 최대어 길이 → 마릿수 → 이름) */
export function tripBoard(catches: readonly TripCatch[]): TripBoard {
    const by = new Map<string, TripMember & { kinds: Set<string> }>();
    for (const c of catches) {
        const m = by.get(c.memberId) ?? { memberId: c.memberId, name: c.name, fish: 0, species: 0, best: null, awards: [], points: 0, kinds: new Set<string>() };
        m.fish += Math.max(1, c.count || 1);
        m.kinds.add(c.species);
        // 길이로 겨루는 것은 길이 어종만(목록에 없는 이름도 길이를 적었으면 받는다 — 잡어도 고기다)
        const unit = fishByName(c.species)?.unit ?? "cm";
        if (unit === "cm" && c.lengthCm != null && c.lengthCm > 0 && (!m.best || c.lengthCm > m.best.lengthCm)) m.best = { species: c.species, lengthCm: c.lengthCm };
        by.set(c.memberId, m);
    }
    const list = [...by.values()];
    for (const m of list) m.species = m.kinds.size;
    const top = (score: (m: TripMember) => number, min: number): string[] => {
        const best = Math.max(0, ...list.map(score));
        return best >= min ? list.filter((m) => score(m) === best).map((m) => m.memberId) : [];
    };
    const awards: Record<TripAward, string[]> = {
        biggest: top((m) => m.best?.lengthCm ?? 0, 0.1),
        most: top((m) => m.fish, 1),
        variety: top((m) => m.species, 2),
    };
    const members: TripMember[] = list.map(({ kinds: _kinds, ...m }) => {
        const got = (Object.keys(awards) as TripAward[]).filter((a) => awards[a].includes(m.memberId));
        return { ...m, awards: got, points: TRIP_POINTS.attend + got.reduce((n, a) => n + TRIP_POINTS[a], 0) };
    });
    members.sort((a, b) => b.points - a.points || (b.best?.lengthCm ?? 0) - (a.best?.lengthCm ?? 0) || b.fish - a.fish || a.name.localeCompare(b.name, "ko"));
    return { members, awards };
}

export interface SeasonRow { memberId: string; name: string; points: number; trips: number; awards: Record<TripAward, number>; best: { species: string; lengthCm: number } | null }

/** 한 해의 판 — 정출마다의 점수를 더한다. 점수 높은 순(같으면 참석 수 → 최대어) */
export function seasonTable(boards: readonly TripBoard[]): SeasonRow[] {
    const by = new Map<string, SeasonRow>();
    for (const b of boards) {
        for (const m of b.members) {
            const r = by.get(m.memberId) ?? { memberId: m.memberId, name: m.name, points: 0, trips: 0, awards: { biggest: 0, most: 0, variety: 0 }, best: null };
            r.points += m.points; r.trips += 1; r.name = m.name;
            for (const a of m.awards) r.awards[a] += 1;
            if (m.best && (!r.best || m.best.lengthCm > r.best.lengthCm)) r.best = m.best;
            by.set(m.memberId, r);
        }
    }
    return [...by.values()].sort((a, b) => b.points - a.points || b.trips - a.trips || (b.best?.lengthCm ?? 0) - (a.best?.lengthCm ?? 0) || a.name.localeCompare(b.name, "ko"));
}

/** 정출 만들기에서 받는 값 */
export function cleanTrip(raw: unknown, today: string): { ok: true; value: { day: string; place: string; title: string | null } } | { ok: false; error: string } {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
    const day = text(o.day, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return { ok: false, error: "날짜를 골라 주세요" };
    // 지난 정출도 적을 수 있고(이미 다녀온 날), 앞날은 한 해 안쪽까지만
    const limit = new Date(Date.parse(`${today}T00:00:00Z`) + 366 * 86_400_000).toISOString().slice(0, 10);
    if (day < "2000-01-01" || day > limit) return { ok: false, error: "날짜를 다시 확인해 주세요" };
    const place = text(o.place, 40);
    if (place.length < 2) return { ok: false, error: "출조지를 적어 주세요" };
    return { ok: true, value: { day, place, title: text(o.title, 30) || null } };
}
