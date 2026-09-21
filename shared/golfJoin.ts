/**
 * 골프 조인의 순수 규칙(2026-09-21 오너: "조인 모집을 더 심플하고 누구나 만들기 쉽게, 남녀 구별도 되게" + 스크린 조인).
 *
 * 왜 자리(slot) 모델인가: 예전 조인은 글 하나에 "모집 n명 · 조건(남성/여성/부부/무관)" 이 전부라
 * "나랑 아내는 있고 남자 둘 더" 같은 실제 상황을 적을 수 없었다. 자리 넷을 그려 놓고 하나씩 채우면
 * 만드는 사람은 고를 게 줄고, 보는 사람은 한눈에 안다(🔵🔴＋＋).
 *
 * 서버와 화면이 같은 함수로 자리를 검증·집계한다 — 한쪽이 4자리, 다른 쪽이 3자리로 세면 "자리가 찼어요"가 어긋난다.
 */

export type JoinType = "FIELD" | "SCREEN" | "PARK";
export const JOIN_TYPES: readonly JoinType[] = ["FIELD", "SCREEN", "PARK"];
export const JOIN_TYPE_LABEL: Readonly<Record<JoinType, string>> = { FIELD: "필드", SCREEN: "스크린", PARK: "파크골프" };

export type SlotGender = "M" | "F" | "ANY";
export type SlotRole = "HOST" | "GUEST" | "OPEN";

export interface JoinSlot {
    readonly role: SlotRole;
    /** HOST·GUEST 는 그 사람의 성별(모르면 ANY), OPEN 은 받고 싶은 성별. */
    readonly gender: SlotGender;
}

/** 한 팀 최대 인원. 필드·스크린·파크 모두 4인 1팀이다. */
export const MAX_SLOTS = 4;

/** 비용 표기. FIXED 는 그린피(원), SPLIT 은 "스크린비 1/N"처럼 그 자리에서 나눈다. */
export type CostMode = "FIXED" | "SPLIT";

/**
 * 만들 때 고르는 칩. id 는 golf_bookings.options 에 그대로 저장된다(기존 부킹 옵션 no_caddie 등과 같은 칸).
 * 많이 두지 않는다 — 칩이 열 개면 아무도 안 고른다.
 */
export const JOIN_OPTIONS: readonly { id: string; label: string; types: readonly JoinType[] }[] = [
    { id: "solo_ok", label: "1인 신청 가능", types: ["FIELD", "SCREEN", "PARK"] },
    { id: "three_ok", label: "3인도 진행", types: ["FIELD", "SCREEN", "PARK"] },
    { id: "beginner_ok", label: "초보 환영", types: ["FIELD", "SCREEN", "PARK"] },
    { id: "caddie_prepaid", label: "캐디피 선입", types: ["FIELD"] },
    { id: "no_caddie", label: "노캐디", types: ["FIELD"] },
];

/** 신청 상태. accepted 만 자리를 차지한다(호스트 승인제 — 2026-09-21 오너 결정). */
export type JoinRequestStatus = "applied" | "accepted" | "rejected" | "cancelled" | "noshow";

function isGender(v: unknown): v is SlotGender {
    return v === "M" || v === "F" || v === "ANY";
}

/**
 * 자리 목록을 정리한다. 첫 자리는 반드시 HOST(만든 사람) 하나, 나머지는 GUEST(내 동반자)·OPEN(모집) 자유.
 * 2~4자리. 잘못된 값은 null — 서버는 400, 화면은 게시 버튼을 잠근다.
 */
export function normalizeSlots(input: unknown): JoinSlot[] | null {
    if (!Array.isArray(input) || input.length < 2 || input.length > MAX_SLOTS) return null;
    const out: JoinSlot[] = [];
    for (let i = 0; i < input.length; i++) {
        const s = input[i] as { role?: unknown; gender?: unknown } | null;
        if (!s || typeof s !== "object") return null;
        const role = s.role;
        if (role !== "HOST" && role !== "GUEST" && role !== "OPEN") return null;
        if (!isGender(s.gender)) return null;
        if ((i === 0) !== (role === "HOST")) return null;   // HOST 는 첫 자리에만, 첫 자리는 HOST 만
        out.push({ role, gender: s.gender });
    }
    if (!out.some((s) => s.role === "OPEN")) return null;   // 모집 자리가 없으면 조인이 아니다
    return out;
}

/** 모집 자리 수(= 정원). */
export function openSlotCount(slots: readonly JoinSlot[]): number {
    return slots.filter((s) => s.role === "OPEN").length;
}

/**
 * 옛 글(자리 없음) 호환: 모집 인원과 조건 문자열로 자리를 만들어 준다.
 * 조건이 '남성'이면 모집 자리를 M, '여성'이면 F, 그 밖은 ANY. 호스트 성별은 모른다(ANY).
 */
export function slotsFromLegacy(joinHeadcount: number | null | undefined, joinCondition: string | null | undefined): JoinSlot[] {
    const n = Math.max(1, Math.min(MAX_SLOTS - 1, Number(joinHeadcount) || 3));
    const cond = joinCondition ?? "";
    const g: SlotGender = cond.includes("남성") && !cond.includes("여성") ? "M" : cond.includes("여성") && !cond.includes("남성") ? "F" : "ANY";
    return [{ role: "HOST", gender: "ANY" }, ...Array.from({ length: n }, (): JoinSlot => ({ role: "OPEN", gender: g }))];
}

/** 두 좌표 사이 거리(km). 지구 반지름 6371 km 하버사인 — 정렬·표시용이라 이 정도면 충분하다. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 거리 표시: 1 km 미만은 m, 10 km 미만은 소수 한 자리, 그 위는 정수. */
export function formatDistance(km: number): string {
    if (!Number.isFinite(km)) return "";
    if (km < 1) return `${Math.max(50, Math.round(km * 1000 / 50) * 50)}m`;
    if (km < 10) return `${km.toFixed(1)}km`;
    return `${Math.round(km)}km`;
}

/** 한국 안의 좌표인가 — 장난 값·좌표 뒤바뀜(lng, lat)을 걸러 정렬이 통째로 어긋나지 않게. */
export function isKoreaCoord(lat: unknown, lng: unknown): lat is number {
    return typeof lat === "number" && typeof lng === "number" && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}
