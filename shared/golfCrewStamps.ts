/**
 * 크루 도장깨기(2026-10-12 — 기획서 7장. 오너: "크루끼리 도장깨기 하러 가듯").
 *
 * 크루 도장 — **같은 라운드에서 크루원 둘 이상이 현장 인증**하면 그 골프장이 크루의 도장첩에 찍힌다.
 *   혼자 다니는 사람이 크루의 수를 올릴 수 없다. 넷이 한 조를 채운 라운드가 있으면 그 도장은 풀조(금테).
 *   **크루에 들어온 뒤의 라운드만** 센다(가입 전에 깬 것을 들고 오지 못하게) — 라운드를 끝낸 때가 그 크루원의 가입한 때보다 뒤여야 한다.
 *   한 사람이 골프 크루 여러 곳에 들어 있으면 한 라운드가 그 크루들에 다 찍힌다(막지 않는다 — 조건이 크루마다 '둘 이상'이라 혼자서는 못 올린다).
 *
 * 깃발 — 크루가 도장첩 한 권을 다 채우면 받는다. 다섯 가지:
 *   기본(초록)     '누구나' 권을 다 채움
 *   초대장(보라)   초대장 권을 다 채움
 *   누구나 36(금)  '누구나' 일곱 권을 전부
 *   풀조(남색)     그 권의 도장이 전부 풀조(넷이 한 조로) — 기본 깃발 위에 하나 더
 *   1호(진홍)      그 권을 **처음** 다 채운 크루 — 받은 순번이 1 인 깃발은 진홍으로 그린다(따로 적지 않는다)
 *
 * 크루 순위는 없다(크루가 열 팀쯤 모이기 전에는 켜지 않는다). 상금 · 경품을 걸지 않는다.
 * 순수 함수만(서버 · 화면이 같이 쓴다). ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { STAMP_ALL_OPEN, STAMP_BOOKS, bookStates, slotForStamp, type BookState } from "./golfStampBooks.js";

/** 크루 도장이 되는 최소 인원 · 풀조의 인원 */
export const CREW_STAMP_MIN = 2;
export const CREW_STAMP_FULL = 4;

const ms = (v: Date | string | number): number => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime());

/** 크루원 한 사람 — 승인 대기는 넘기지 않는다 */
export interface CrewStampMember { memberId: string; joinedAt: Date | string | number }
/** 인증 라운드의 한 줄(한 사람의 기록) — 넘기는 쪽이 인증된 것만 준다 */
export interface CrewRoundRow {
    sessionId: string;
    memberId: string;
    /** 끝낸 때 */
    at: Date | string | number;
    clubId: string | null;
    /** 기록에 적힌 골프장 이름 */
    name: string;
}

/** 크루 도장 하나(골프장당 하나) */
export interface CrewStamp {
    /** 골프장 원장 번호. 번호 없는 옛 기록이면 이름으로 만든 열쇠("name:…") */
    clubKey: string;
    clubId: string | null;
    name: string;
    /** 처음 찍은 때(ms) */
    firstAt: number;
    /** 크루 도장이 된 라운드 수 */
    rounds: number;
    /** 풀조(넷이 한 조)로 돈 적이 있는가 · 그때(ms) */
    full: boolean;
    fullAt: number | null;
    /** 가장 많이 같이 간 인원 */
    most: number;
}

const squash = (v: string) => v.replace(/\s+/g, "").toLowerCase();
export const crewClubKey = (clubId: string | null, name: string) => (clubId ? clubId : `name:${squash(name)}`);

/**
 * 크루원의 인증 라운드 줄들 → 크루 도장(얻은 순서).
 * 같은 경기(sessionId)에 가입한 뒤의 크루원이 둘 이상이면 그 골프장의 크루 도장이다.
 */
export function crewStampsFrom(rows: readonly CrewRoundRow[], members: readonly CrewStampMember[]): CrewStamp[] {
    const joined = new Map(members.map((m) => [m.memberId, ms(m.joinedAt)]));
    const bySession = new Map<string, { at: number; clubId: string | null; name: string; who: Set<string> }>();
    for (const r of rows) {
        const t = ms(r.at), j = joined.get(r.memberId);
        if (!r.sessionId || !Number.isFinite(t) || j == null || !(t >= j)) continue;
        if (!r.clubId && !r.name) continue;
        const s = bySession.get(r.sessionId) ?? { at: t, clubId: r.clubId, name: r.name, who: new Set<string>() };
        s.who.add(r.memberId);
        // 한 경기의 줄들은 같은 골프장이다 — 번호가 있는 줄을 믿는다. 끝낸 때는 가장 늦은 줄
        if (!s.clubId && r.clubId) { s.clubId = r.clubId; s.name = r.name || s.name; }
        s.at = Math.max(s.at, t);
        bySession.set(r.sessionId, s);
    }
    const out = new Map<string, CrewStamp>();
    const sessions = Array.from(bySession.values()).filter((s) => s.who.size >= CREW_STAMP_MIN).sort((a, b) => a.at - b.at);
    for (const s of sessions) {
        const key = crewClubKey(s.clubId, s.name);
        const cur = out.get(key) ?? { clubKey: key, clubId: s.clubId, name: s.name, firstAt: s.at, rounds: 0, full: false, fullAt: null, most: 0 };
        cur.rounds++;
        cur.most = Math.max(cur.most, s.who.size);
        if (!cur.full && s.who.size >= CREW_STAMP_FULL) { cur.full = true; cur.fullAt = s.at; }
        out.set(key, cur);
    }
    return Array.from(out.values()).sort((a, b) => a.firstAt - b.firstAt || a.name.localeCompare(b.name));
}

export type CrewFlagKind = "flag" | "full";
export interface CrewFlagDue { kind: CrewFlagKind; key: string; earnedAt: number }
/** 깃발의 이름표 — "flag:gangwon" · "flag:all-open" · "full:gangwon" */
export const crewFlagId = (kind: CrewFlagKind, key: string) => `${kind}:${key}`;

/** 크루 도장 → 도장첩마다의 상태(개인 도장첩과 같은 칸 규칙) */
export function crewBookStates(stamps: readonly CrewStamp[]): BookState<CrewStamp>[] {
    return bookStates(stamps);
}

/** 크루 도장 → 받았어야 할 깃발(받은 순서). 받은 때는 그 권의 마지막 칸을 채운 때 */
export function crewFlagsDue(stamps: readonly CrewStamp[]): CrewFlagDue[] {
    const states = crewBookStates([...stamps].sort((a, b) => a.firstAt - b.firstAt));
    const out: CrewFlagDue[] = [];
    for (const st of states) {
        if (!st.done) continue;
        out.push({ kind: "flag", key: st.book.id, earnedAt: Math.max(...st.slots.map((s) => s.stamp!.firstAt)) });
        // 풀조 깃발 — 그 권의 도장이 전부 풀조. 초대장 권에는 없다(회원제를 넷이 가라고 재촉하지 않는다)
        if (st.book.kind === "open" && st.slots.every((s) => s.stamp!.full)) out.push({ kind: "full", key: st.book.id, earnedAt: Math.max(...st.slots.map((s) => s.stamp!.fullAt!)) });
    }
    const open = states.filter((s) => s.book.kind === "open");
    if (open.length > 0 && open.every((s) => s.done)) out.push({ kind: "flag", key: STAMP_ALL_OPEN, earnedAt: Math.max(...open.flatMap((s) => s.slots.map((x) => x.stamp!.firstAt))) });
    return out.sort((a, b) => a.earnedAt - b.earnedAt);
}

export type CrewFlagLook = "green" | "crimson" | "navy" | "purple" | "gold";
/** 깃발의 색 — 1호(받은 순번 1)는 진홍, 풀조는 남색, 초대장은 보라, 누구나 전부는 금, 나머지는 초록 */
export function crewFlagLook(kind: CrewFlagKind, key: string, serial?: number | null): CrewFlagLook {
    if (kind === "full") return "navy";
    if (serial === 1) return "crimson";
    if (key === STAMP_ALL_OPEN) return "gold";
    return STAMP_BOOKS.find((b) => b.id === key)?.kind === "invite" ? "purple" : "green";
}
/** 깃발의 이름 — "강원 깃발" · "강원 풀조 깃발" · "누구나 36 깃발" */
export function crewFlagName(kind: CrewFlagKind, key: string, openTotal: number): string {
    const base = key === STAMP_ALL_OPEN ? `누구나 ${openTotal}` : STAMP_BOOKS.find((b) => b.id === key)?.name ?? key;
    return kind === "full" ? `${base} 풀조 깃발` : `${base} 깃발`;
}

/** 크루 도장이 도장첩의 골프장인가 */
export const crewStampIsElite = (s: Pick<CrewStamp, "clubId" | "name">) => !!slotForStamp(s);

/** 크루 도장의 한 줄 요약 — 화면 맨 위 */
export function crewStampSummary(stamps: readonly CrewStamp[]): { total: number; elite: number; full: number; books: number } {
    const states = crewBookStates(stamps);
    return {
        total: stamps.length,
        elite: states.reduce((a, s) => a + s.got, 0),
        full: stamps.filter((s) => s.full).length,
        books: states.filter((s) => s.done).length,
    };
}
