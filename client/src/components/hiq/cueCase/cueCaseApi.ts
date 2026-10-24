/**
 * 큐 케이스 — 서버의 답을 읽는 곳(2026-10-16). GET /api/hiq/cue-case[?memberId=] · POST /api/hiq/cue-case/hero.
 * 화면 주소는 /cue-case[?m=<회원 id>][&sec=cue|shaft|ball|chalk|glove|medals]. 옛 장식장 주소(/online-game?shelf=1)는 여기로 돌려보낸다.
 */
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CASE_ITEMS, WORN_NONE, caseImage, caseItem } from "@shared/cueCase";
import type { Bar } from "@shared/cueCaseRules";

/** 상대 · 공(2026-10-24)은 큐 바로 뒤 — 온라인 대전에 입는 것끼리 */
export type CaseSection = "cue" | "shaft" | "ball" | "chalk" | "glove" | "medals";
export const CASE_SECTIONS: readonly CaseSection[] = ["cue", "shaft", "ball", "chalk", "glove", "medals"];
export interface CaseItemView { done: boolean; at: number | null; got: number | null; bars: Bar[]; soon: boolean; holders: number; /** 내가 몇 번째 주인인가(받은 것만) */ serial: number | null }
export interface CueCaseView {
    member: { id: string; name: string; country: string | null; mine: boolean };
    hero: string | null;
    /** 온라인 대전에 입은 상대 · 공(null = 기본 — 메이플 상대 · 빨간 점) */
    heroShaft: string | null;
    heroBall: string | null;
    items: Record<string, CaseItemView>;
    month: { key: string; cells: number; need: number };
    people: number;
    online: boolean;
    handi: { "3c": number | null; "4c": number | null };
    /** 친구 초대(내 것만) — 초대한 수 · 한정 큐 고르기 */
    invite: { count: number; picks: { total: number; left: number } } | null;
}

export const CUE_CASE_QUERY_KEY = ["cue-case"] as const;
export const cueCaseUrl = (memberId?: string | null) => (memberId ? `/api/hiq/cue-case?memberId=${encodeURIComponent(memberId)}` : "/api/hiq/cue-case");
export function cueCasePath(o: { m?: string | null; sec?: CaseSection } = {}): string {
    const q = new URLSearchParams();
    if (o.m) q.set("m", o.m);
    if (o.sec && o.sec !== "cue") q.set("sec", o.sec);
    const s = q.toString();
    return s ? `/cue-case?${s}` : "/cue-case";
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const bar = (v: unknown): Bar | null => {
    const b = rec(v), side = b.side === "real" || b.side === "online" || b.side === "all" ? b.side : null;
    const have = num(b.have), need = num(b.need);
    return side && have !== null && need !== null && need > 0 ? { side, have: Math.max(0, Math.min(have, need)), need } : null;
};

/** 모르는 id · 모양이 틀린 칸은 버린다 — 목록(shared/cueCase)에 있는 것만 그린다 */
export function parseCueCase(raw: unknown): CueCaseView {
    const o = rec(raw), m = rec(o.member), items = rec(o.items), month = rec(o.month), handi = rec(o.handi);
    const out: Record<string, CaseItemView> = {};
    for (const x of CASE_ITEMS) {
        const v = rec(items[x.id]);
        out[x.id] = {
            done: v.done === true, at: num(v.at), got: num(v.got),
            bars: (Array.isArray(v.bars) ? v.bars.map(bar) : []).filter((b): b is Bar => b !== null),
            soon: v.soon === true, holders: Math.max(0, num(v.holders) ?? 0), serial: v.done === true ? num(v.serial) : null,
        };
    }
    const hero = typeof o.hero === "string" && out[o.hero]?.done ? o.hero : null;
    const worn = (v: unknown, kind: "shaft" | "ball") => (typeof v === "string" && out[v]?.done && caseItem(v)?.kind === kind ? v : null);
    return {
        member: { id: typeof m.id === "string" ? m.id : "", name: typeof m.name === "string" ? m.name : "", country: typeof m.country === "string" && /^[A-Z]{2}$/.test(m.country) ? m.country : null, mine: m.mine === true },
        hero, heroShaft: worn(o.heroShaft, "shaft"), heroBall: worn(o.heroBall, "ball"), items: out,
        month: { key: typeof month.key === "string" ? month.key : "", cells: Math.max(0, num(month.cells) ?? 0), need: num(month.need) ?? 12 },
        people: Math.max(0, num(o.people) ?? 0),
        online: o.online === true,
        handi: { "3c": num(handi["3c"]), "4c": num(handi["4c"]) },
        invite: (() => {
            const v = rec(o.invite), p = rec(v.picks);
            return o.invite && typeof o.invite === "object" ? { count: Math.max(0, num(v.count) ?? 0), picks: { total: Math.max(0, num(p.total) ?? 0), left: Math.max(0, num(p.left) ?? 0) } } : null;
        })(),
    };
}

export const fetchCueCase = async (memberId?: string | null): Promise<CueCaseView> => parseCueCase(await apiRequest(cueCaseUrl(memberId)));
export const saveHero = (itemId: string) => apiRequest("/api/hiq/cue-case/hero", { method: "POST", body: JSON.stringify({ itemId }) });
/** 상대 · 공을 기본(메이플 · 빨간 점)으로 — 아무것도 안 고른 것(가장 최근에 받은 것)과 다르다 */
export const saveWornNone = (kind: "shaft" | "ball") => apiRequest("/api/hiq/cue-case/hero", { method: "POST", body: JSON.stringify({ itemId: WORN_NONE, kind }) });

/* ── '새로 받음' — 이 기기에서 내 큐 케이스를 마지막으로 연 때(받은 기록을 적은 때가 그보다 뒤면 새것) ── */
export const CASE_SEEN_KEY = "rankue.cueCase.seen";
export function readCaseSeen(): number {
    try { const v = Number(localStorage.getItem(CASE_SEEN_KEY)); return Number.isFinite(v) ? v : 0; } catch { return 0; }
}
export function writeCaseSeen(ms: number): void {
    try { if (ms > readCaseSeen()) localStorage.setItem(CASE_SEEN_KEY, String(ms)); } catch { /* 저장소를 못 쓰는 기기 */ }
}

/* ── 홈 입구 띠 · 게임 큐대 — 받은 수와 대표 큐(GET /cue-case/summary, 받은 기록만 읽는다) ── */
export interface CaseSummary { opened: boolean; cue: number; chalk: number; glove: number; shaft: number; ball: number; hero: string | null; heroShaft: string | null; heroBall: string | null; latest: number | null }
export const CASE_SUMMARY_KEY = ["cue-case-summary"] as const;
const n0 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export async function fetchCaseSummary(): Promise<CaseSummary> {
    const r = rec(await apiRequest("/api/hiq/cue-case/summary"));
    const hero = typeof r.hero === "string" && caseItem(r.hero)?.kind === "cue" ? r.hero : null;
    const worn = (v: unknown, kind: "shaft" | "ball") => (typeof v === "string" && caseItem(v)?.kind === kind ? v : null);
    return {
        opened: r.opened === true, cue: n0(r.cue), chalk: n0(r.chalk), glove: n0(r.glove), shaft: n0(r.shaft), ball: n0(r.ball), hero,
        heroShaft: worn(r.heroShaft, "shaft"), heroBall: worn(r.heroBall, "ball"),
        latest: typeof r.latest === "number" && Number.isFinite(r.latest) ? r.latest : null,
    };
}
export const useCaseSummary = (enabled: boolean) => useQuery({ queryKey: CASE_SUMMARY_KEY, queryFn: fetchCaseSummary, enabled, staleTime: 60_000, retry: false });
/** 큐 id → 큐대 손잡이 그림 주소(목록에 없으면 null) */
export const cueSkinUrl = (id: string | null | undefined): string | null => { const x = id ? caseItem(id) : null; return x && x.kind === "cue" ? caseImage(x) : null; };

/** 번호 글자 — "No.007"(천 넘으면 그대로) */
export const serialText = (n: number): string => `No.${n < 1000 ? String(n).padStart(3, "0") : String(n)}`;
