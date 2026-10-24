/**
 * 당구대 로고 · 광고(2026-10-24 오너: "이 로고를 투명도 있게 온라인게임 당구대에 · 어드민에서 사진 교체해서 광고" → "니 추천대로").
 * 온라인게임 당구대 천(대대 파랑 · 중대 초록)에 인쇄한 것처럼 옅게 깔린다. 공은 그 위를 지나가고 그림자도 그 위에 진다 — 물리와는 상관없다.
 *
 * 줄(sim_table_brands) 하나 = 캠페인 하나. 지금 걸리는 것은 테이블마다 하나: 켜져 있고 기간 안인 줄 가운데
 * **기간이 있는 줄(협찬 캠페인) 먼저 → 시작이 늦은 것 → 나중에 만든 것**. 기간 없는 '랭큐 기본' 줄이 마이그레이션으로 들어 있다.
 * 협찬 이름(sponsor)이 있으면 화면에 '○○ 협찬'을 적는다(광고라는 것을 밝힌다).
 * ⚠️ 서버도 부른다 — 상대 임포트는 ./x.js.
 */

export type BrandTableId = "DAEDAE" | "JUNGDAE_KR";
export const BRAND_TABLES: readonly BrandTableId[] = ["DAEDAE", "JUNGDAE_KR"];
/** center = 가운데 크게 하나 · ends = 양 끝(헤드 · 풋 쪽)에 작게 둘 */
export type BrandPlace = "center" | "ends";
/** original = 그림 색 그대로 · cloth = 천 색에 녹인 각인(밝은 실루엣) */
export type BrandTone = "original" | "cloth";

/** 화면이 받는 것 — 그리는 데 필요한 것만 */
export interface TableBrandView {
    readonly id: string;
    readonly image: string;
    /** 0.04~0.5 — 천 위에 얼마나 진하게 */
    readonly opacity: number;
    /** 테이블 짧은 변(폭)에 대한 로고 폭의 비율 0.2~0.9 */
    readonly scale: number;
    readonly place: BrandPlace;
    readonly tone: BrandTone;
    /** 협찬 표시 이름(없으면 표시 없음 — 우리 로고) */
    readonly sponsor: string | null;
}

/** 관리자가 고치는 한 줄 */
export interface TableBrandRow extends TableBrandView {
    readonly title: string;
    readonly tables: readonly BrandTableId[];
    readonly startsAt: number | null;
    readonly endsAt: number | null;
    readonly enabled: boolean;
    readonly createdAt: number;
    readonly updatedAt: number;
}

export const BRAND_OPACITY = { min: 0.04, max: 0.5, def: 0.16 } as const;
export const BRAND_SCALE = { min: 0.2, max: 0.9, def: 0.6 } as const;
/** 우리 기본 로고(마이그레이션이 넣는 '랭큐 기본' 줄과 같은 그림) */
export const DEFAULT_BRAND_IMAGE = "/billiards/table/rankue-logo.webp";
/** 올린 그림이 놓이는 저장소 폴더 · 긴 변 · 크기 상한(화면이 PNG 로 다시 그려 올린다) */
export const BRAND_FOLDER = "hiq/table-brand";
export const BRAND_MAX_PX = 1024;
export const BRAND_MAX_BYTES = 1536 * 1024;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const UPLOADED_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/hiq\/table-brand\/[\w.-]+\.png$/i;
/** 그림 주소로 받는 것 — 우리 정적 파일(/billiards/table/…) 또는 우리 저장소의 table-brand 폴더 PNG 만 */
export function isBrandImage(v: unknown): v is string {
    return typeof v === "string" && (/^\/billiards\/table\/[\w.-]+\.(webp|png)$/.test(v) || UPLOADED_RE.test(v));
}
export const isUploadedBrandImage = (v: unknown): v is string => typeof v === "string" && UPLOADED_RE.test(v);

/** 지금 걸리는가 — 켜져 있고 기간 안(끝은 그 시각 전까지) */
export function brandLive(r: Pick<TableBrandRow, "enabled" | "startsAt" | "endsAt">, now: number): boolean {
    return r.enabled && (r.startsAt === null || r.startsAt <= now) && (r.endsAt === null || now < r.endsAt);
}

/** 테이블마다 지금 걸 것 — 기간 있는 줄(협찬) 먼저 → 시작이 늦은 것 → 나중에 만든 것. 없으면 null(로고 없음) */
export function pickBrands(rows: readonly TableBrandRow[], now: number): Record<BrandTableId, TableBrandView | null> {
    const live = rows.filter((r) => brandLive(r, now)).sort((a, b) =>
        (a.startsAt === null ? 1 : 0) - (b.startsAt === null ? 1 : 0) || (b.startsAt ?? 0) - (a.startsAt ?? 0) || b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
    const out = { DAEDAE: null, JUNGDAE_KR: null } as Record<BrandTableId, TableBrandView | null>;
    for (const t of BRAND_TABLES) {
        const r = live.find((x) => x.tables.includes(t));
        out[t] = r ? viewOf(r) : null;
    }
    return out;
}
export const viewOf = (r: TableBrandView): TableBrandView => ({ id: r.id, image: r.image, opacity: r.opacity, scale: r.scale, place: r.place, tone: r.tone, sponsor: r.sponsor });

/** 서버의 답 → 화면 값. 모양이 틀리면 null(로고를 안 그린다) */
export function parseBrandView(v: unknown): TableBrandView | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== "string" || !isBrandImage(o.image)) return null;
    const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
    return {
        id: o.id, image: o.image,
        opacity: clamp(num(o.opacity, BRAND_OPACITY.def), BRAND_OPACITY.min, BRAND_OPACITY.max),
        scale: clamp(num(o.scale, BRAND_SCALE.def), BRAND_SCALE.min, BRAND_SCALE.max),
        place: o.place === "ends" ? "ends" : "center",
        tone: o.tone === "cloth" ? "cloth" : "original",
        sponsor: typeof o.sponsor === "string" && o.sponsor.trim() ? o.sponsor.trim().slice(0, 30) : null,
    };
}
export function parseBrands(v: unknown): Record<BrandTableId, TableBrandView | null> {
    const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    return { DAEDAE: parseBrandView(o.DAEDAE), JUNGDAE_KR: parseBrandView(o.JUNGDAE_KR) };
}

/** 관리자가 보낸 값 검사 — 고칠 칸만. 틀리면 이유 글자 */
export function cleanBrandInput(raw: unknown, partial: boolean): { ok: true; value: Partial<Omit<TableBrandRow, "id" | "createdAt" | "updatedAt">> } | { ok: false; error: string } {
    if (!raw || typeof raw !== "object") return { ok: false, error: "값이 없습니다" };
    const o = raw as Record<string, unknown>;
    const v: Record<string, unknown> = {};
    const need = (k: string) => !partial && !(k in o);
    if ("title" in o || need("title")) {
        if (typeof o.title !== "string" || !o.title.trim() || o.title.trim().length > 40) return { ok: false, error: "이름은 1~40자입니다" };
        v.title = o.title.trim();
    }
    if ("image" in o || need("image")) {
        if (!isBrandImage(o.image)) return { ok: false, error: "그림은 올린 그림이나 기본 로고만 쓸 수 있습니다" };
        v.image = o.image;
    }
    if ("opacity" in o) { if (typeof o.opacity !== "number" || !Number.isFinite(o.opacity)) return { ok: false, error: "투명도가 숫자가 아닙니다" }; v.opacity = clamp(o.opacity, BRAND_OPACITY.min, BRAND_OPACITY.max); }
    if ("scale" in o) { if (typeof o.scale !== "number" || !Number.isFinite(o.scale)) return { ok: false, error: "크기가 숫자가 아닙니다" }; v.scale = clamp(o.scale, BRAND_SCALE.min, BRAND_SCALE.max); }
    if ("place" in o) { if (o.place !== "center" && o.place !== "ends") return { ok: false, error: "자리는 가운데 · 양 끝입니다" }; v.place = o.place; }
    if ("tone" in o) { if (o.tone !== "original" && o.tone !== "cloth") return { ok: false, error: "색은 그대로 · 천 색입니다" }; v.tone = o.tone; }
    if ("tables" in o) {
        if (!Array.isArray(o.tables) || !o.tables.length || !o.tables.every((t) => BRAND_TABLES.includes(t as BrandTableId))) return { ok: false, error: "테이블을 하나 이상 고르세요" };
        v.tables = [...new Set(o.tables as BrandTableId[])];
    }
    if ("sponsor" in o) {
        if (o.sponsor !== null && (typeof o.sponsor !== "string" || o.sponsor.trim().length > 30)) return { ok: false, error: "협찬 이름은 30자까지입니다" };
        v.sponsor = typeof o.sponsor === "string" && o.sponsor.trim() ? o.sponsor.trim() : null;
    }
    for (const k of ["startsAt", "endsAt"] as const) {
        if (k in o) {
            if (o[k] !== null && (typeof o[k] !== "number" || !Number.isFinite(o[k]))) return { ok: false, error: "기간이 날짜가 아닙니다" };
            v[k] = o[k];
        }
    }
    if (typeof v.startsAt === "number" && typeof v.endsAt === "number" && v.endsAt <= v.startsAt) return { ok: false, error: "끝나는 때가 시작보다 뒤여야 합니다" };
    if ("enabled" in o) { if (typeof o.enabled !== "boolean") return { ok: false, error: "켜기/끄기 값이 틀립니다" }; v.enabled = o.enabled; }
    return { ok: true, value: v as Partial<Omit<TableBrandRow, "id" | "createdAt" | "updatedAt">> };
}
