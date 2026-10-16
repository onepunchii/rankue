/**
 * 골프 › 라운드 — 스코어카드 라운드 감사 · 공식/미인증 전환(2026-10-17 어드민 전수 조사 골프 ①).
 * 스코어카드로 올린 라운드는 골프장이 명부에 있으면 곧바로 공식이다(오너 10/13 "스코어카드도 인증 구장으로 인증").
 * 그 규칙은 그대로 두고, 운영자가 **다시 볼 것**을 고르게 돕는다 — 판정이 아니라 표시. 내리는 것(미인증으로)은 사람이 사유를 적고 한다.
 *
 * 표시(scanFlags):
 *  - many-edits: 읽은 줄과 SCAN_EDIT_FLAG 칸 넘게 다르다(처음엔 이 조건이 자동 미인증이었는데 오너의 실제 카드가 걸려 걷어냈다 — 표시로만)
 *  - many-a-day: 같은 사람이 한국 날짜 하루에 SCAN_DAY_FLAG 장 넘게 올렸다(옛 카드를 몰아 올린 것일 수도 — 사람이 본다)
 *  - old-card: 카드의 날이 올린 날보다 SCAN_OLD_DAYS 넘게 앞이다
 *  - low-score: 파 대비 SCAN_LOW_REL 이하(파를 모르면 SCAN_LOW_STROKES 타 미만)
 * 공식/미인증 전환은 그 라운드의 골프 기록 전부(동반자 규칙 — 한 판은 한 값)를 바꾸고 평균 · 등급 · 도장을 다시 센다.
 * 이미 받은 볼마커 · 트로피 · 핀은 그대로다(공식으로 올리면 새로 받을 것은 받는다 — updateGolfStats → syncStampAwards).
 */
export const SCAN_EDIT_FLAG = 4;
export const SCAN_DAY_FLAG = 5;
export const SCAN_OLD_DAYS = 365;
export const SCAN_LOW_REL = -6;
export const SCAN_LOW_STROKES = 66;

export type RoundSource = "scan" | "match";
export type ScanFlag = "many-edits" | "many-a-day" | "old-card" | "low-score";
export const SCAN_FLAG_LABEL: Readonly<Record<ScanFlag, string>> = {
    "many-edits": "읽은 값과 많이 다름",
    "many-a-day": "하루에 여러 장",
    "old-card": "1년 넘은 카드",
    "low-score": "아주 낮은 타수",
};

export interface ScanMeta { read: number[] | null; edits: number | null; cardDay: string | null; backfill: boolean }
export interface OnSiteChange { at: string; by: string; reason: string; from: boolean | null; to: boolean }

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** DB 의 scan_meta → 모양을 믿지 않고 읽는다 */
export function parseScanMeta(raw: unknown): ScanMeta | null {
    if (!raw || typeof raw !== "object") return null;
    const x = raw as Record<string, unknown>;
    const read = Array.isArray(x.read) && x.read.length === 18 ? x.read.map((v) => Math.max(0, Math.floor(Number(v) || 0))) : null;
    const edits = Number.isInteger(x.edits) && (x.edits as number) >= 0 ? (x.edits as number) : null;
    const cardDay = typeof x.cardDay === "string" && DAY.test(x.cardDay) ? x.cardDay : null;
    return { read, edits, cardDay, backfill: x.backfill === true };
}

/** DB 의 admin_onsite → 줄 목록(모르는 줄은 버린다) */
export function parseOnSiteLog(raw: unknown): OnSiteChange[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((r): OnSiteChange[] => {
        if (!r || typeof r !== "object") return [];
        const x = r as Record<string, unknown>;
        if (typeof x.at !== "string" || typeof x.to !== "boolean") return [];
        return [{ at: x.at, by: typeof x.by === "string" ? x.by : "관리자", reason: typeof x.reason === "string" ? x.reason : "", from: typeof x.from === "boolean" ? x.from : null, to: x.to }];
    });
}

/** 읽은 값과 올린 값이 다른 홀 — 1번부터 */
export function editedHoles(read: readonly number[] | null, saved: readonly number[]): { hole: number; read: number; saved: number }[] {
    if (!read) return [];
    const out: { hole: number; read: number; saved: number }[] = [];
    for (let i = 0; i < 18; i++) {
        const a = Number(read[i]) || 0, b = Number(saved[i]) || 0;
        if (a !== b) out.push({ hole: i + 1, read: a, saved: b });
    }
    return out;
}

const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function scanFlags(x: {
    edits: number | null; sameDay: number; cardDay: string | null; uploadedDay: string;
    strokes?: number | null; relative?: number | null; parKnown?: boolean;
}): ScanFlag[] {
    const out: ScanFlag[] = [];
    if (x.edits != null && x.edits > SCAN_EDIT_FLAG) out.push("many-edits");
    if (x.sameDay > SCAN_DAY_FLAG) out.push("many-a-day");
    if (x.cardDay && DAY.test(x.uploadedDay) && dayMs(x.uploadedDay) - dayMs(x.cardDay) > SCAN_OLD_DAYS * 86_400_000) out.push("old-card");
    if (x.strokes != null && x.strokes > 0) {
        if (x.parKnown && x.relative != null ? x.relative <= SCAN_LOW_REL : x.strokes < SCAN_LOW_STROKES) out.push("low-score");
    }
    return out;
}

/** 전환 사유 — 비면 안 된다, 200자까지 */
export const cleanReason = (v: unknown): string | null => {
    const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, 200) : "";
    return s.length >= 2 ? s : null;
};

/** 지금 기록의 값(한 판은 한 값) → 바꿀 수 있는 쪽. 옛 기록(null)은 공식으로 세므로 '미인증으로'만 */
export function onSiteTargets(current: boolean | null): { toOfficial: boolean; toUnverified: boolean } {
    return { toOfficial: current === false, toUnverified: current !== false };
}
