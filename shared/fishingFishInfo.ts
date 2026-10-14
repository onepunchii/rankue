/**
 * 어종 정보의 틀(2026-10-14 오너: "내가 어종정보랑 정보는 줄 테니 니가 설계만 잘해 놔").
 *
 * 여기에는 **받은 자료만** 넣는다 — 제철 · 낚시 방법 · 금어기 같은 것을 지어 쓰지 않는다. 지금은 비어 있고,
 * 화면(어종 한 장)은 채워진 칸만 그린다. 비어 있어도 그 화면에는 우리 자료로 아는 것이 나온다:
 * 단계(짜) 표 · 내 기록 · 오늘 좋은 곳(국립해양조사원 낚시지수) · 지난 이레의 위판 건수.
 *
 * 채우는 법: 아래 FISH_INFO 에 어종 id(shared/fishingFish 의 id)마다 한 덩이를 적는다. 받은 표 · 글은 cleanFishInfo 로 걸러 넣는다
 * (달은 1~12 · 글은 길이를 자름 · **금어기와 금지체장은 출처가 있어야만** 받는다 — 법령이 바뀌는 값이라 출처 없이 싣지 않는다).
 * 받을 형식은 docs/01-plan/features/fishing-fish-info-format.md.
 * ⚠️ 서버가 부를 수 있게 상대 임포트는 ./x.js(지금은 임포트가 없다).
 */

export interface FishBan { /** 금어기 — 예: "5.1 ~ 5.31" */ period?: string; /** 금지체장(cm) — 이보다 작으면 놓아 준다 */ minCm?: number; /** 덧붙일 말(해역 예외 등) */ note?: string; /** 법령 · 고시의 이름과 기준일(꼭 있어야 한다) */ source: string }
export interface FishInfo {
    /** 다른 이름 — 사투리 · 별명 · 표준명 */
    aka?: string[];
    /** 한 줄 소개 */
    intro?: string;
    /** 제철인 달(1~12) */
    season?: number[];
    /** 사는 곳 — 갯바위 · 방파제 · 모래 바닥 … */
    habitat?: string;
    /** 많이 하는 낚시 방법 */
    methods?: string[];
    /** 미끼 · 루어 */
    bait?: string[];
    /** 물때 · 시간대 한마디 */
    timing?: string;
    /** 맛 · 먹는 법 */
    taste?: string;
    /** 요령 몇 줄 */
    tips?: string[];
    /** 금어기 · 금지체장 — 출처가 있을 때만 */
    ban?: FishBan;
    /** 자료의 출처(화면 맨 아래에 적는다) */
    sources?: string[];
}

/** 어종 id → 정보. **오너가 준 자료만** 넣는다(지금은 비어 있다) */
export const FISH_INFO: Readonly<Record<string, FishInfo>> = {};

export const fishInfoOf = (id: string | null | undefined): FishInfo | null => (id && FISH_INFO[id]) || null;

const text = (v: unknown, max: number): string | undefined => { const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max); return s || undefined; };
const list = (v: unknown, max: number, each: number): string[] | undefined => { const a = (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,·\n]/) : []).map((x) => text(x, each)).filter((x): x is string => !!x).slice(0, max); return a.length ? a : undefined; };

/** 받은 한 덩이를 걸러 틀에 맞춘다 — 모르는 칸은 버리고, 금어기 · 금지체장은 출처가 없으면 통째로 버린다 */
export function cleanFishInfo(raw: unknown): FishInfo {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: FishInfo = {};
    const put = <K extends keyof FishInfo>(k: K, v: FishInfo[K] | undefined) => { if (v !== undefined) out[k] = v; };
    put("aka", list(o.aka, 8, 16));
    put("intro", text(o.intro, 120));
    const months = [...new Set((Array.isArray(o.season) ? o.season : []).map(Number).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);
    put("season", months.length ? months : undefined);
    put("habitat", text(o.habitat, 120));
    put("methods", list(o.methods, 6, 24));
    put("bait", list(o.bait, 8, 20));
    put("timing", text(o.timing, 120));
    put("taste", text(o.taste, 120));
    put("tips", list(o.tips, 5, 100));
    const b = (o.ban && typeof o.ban === "object" ? o.ban : null) as Record<string, unknown> | null;
    const source = b ? text(b.source, 80) : undefined;
    if (b && source) {
        const minCm = Number(b.minCm);
        const ban: FishBan = { source };
        const period = text(b.period, 40), note = text(b.note, 100);
        if (period) ban.period = period;
        if (Number.isFinite(minCm) && minCm > 0 && minCm < 300) ban.minCm = Math.round(minCm * 10) / 10;
        if (note) ban.note = note;
        if (ban.period || ban.minCm != null) out.ban = ban;
    }
    put("sources", list(o.sources, 6, 80));
    return out;
}

/** 채워진 칸이 있는가 */
export const hasFishInfo = (info: FishInfo | null | undefined): boolean => !!info && Object.keys(info).some((k) => k !== "sources");
