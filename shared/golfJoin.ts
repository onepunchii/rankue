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
 * 자리 목록을 정리한다. 2~4자리, 모집(OPEN) 자리 1개 이상.
 * HOST(만든 사람)는 **있으면 첫 자리에만** 둔다. 나머지는 GUEST(동반자)·OPEN(모집) 자유.
 *
 * 2026-09-23 오너("확정 되었다 취소 했는데 조인돌리기시 해당 인원이 포함되어있는거 같음"): 예전 규칙은
 * `(i === 0) !== (role === "HOST")` 로 **첫 칸을 반드시 HOST 로** 못 박았다. 그래서 OPEN 은 최대 3이었고,
 * 부킹을 조인으로 전환하는 시트는 한 자리도 안 팔린 티타임조차 "1자리는 이미 팔렸다"고 적어야 했다 —
 * 매장 매니저는 자기가 파는 팀에서 치지 않으니 그 HOST 는 **아무도 안 앉는 유령 자리**였다.
 * 이제 호스트 없는 구성(OPEN 넷 = 전부 모집)도 통과한다. 넓히는 방향이라 기존 HOST-첫칸 글은 전부 그대로 통과한다.
 * HOST 둘, HOST 가 둘째 칸 이후에 오는 것은 여전히 거부한다(만든 사람은 한 명이고 자리 그림의 첫 칸이다).
 *
 * 잘못된 값은 null — 서버는 400, 화면은 게시 버튼을 잠근다.
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
        if (role === "HOST" && i !== 0) return null;         // HOST 는 있으면 첫 자리에만(둘도 안 된다). 첫 자리가 HOST 가 아닌 건 괜찮다
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
 * 앱이 아는 '팔린 자리' — 승인된 신청의 **인원 합**이다. 행 수가 아니다.
 *
 * 2026-09-24 오너: "국수맘이 2명 신청했는데 왜 부킹에서는 조인으로 전환 버튼이 사라졌지?
 *   부킹매니져가 판단해서 2명이니깐 2명을 더 조인으로 전환해도되고 해야되는데."
 * 부킹 신청은 '팀 통째'라 한 행이 1~4 명이다(apply 라우트). 그걸 count(*) 로 세면 2명짜리 신청 하나가
 * '1자리'가 되어, 네 자리 중 두 자리만 팔린 티타임이 '다 팔림'으로 잠겼다.
 *
 * 조인 신청은 늘 1명이라(apply 라우트가 강제) 조인 글에서는 이 값이 예전의 행 수와 **정확히 같다**.
 * 그래서 이 함수로 갈아끼워도 조인 쪽 숫자는 한 톨도 안 바뀐다.
 */
export function seatsTaken(rows: readonly { headcount?: number | null }[]): number {
    let n = 0;
    for (const r of rows) n += Math.max(1, Math.floor(Number(r.headcount) || 1));
    return n;
}

/** 아직 조인으로 돌릴 수 있는 자리 수. 0이면 네 자리가 다 팔린 티타임이다. */
export function convertibleSeats(sold: number): number {
    return Math.max(0, MAX_SLOTS - Math.max(0, Math.floor(Number(sold) || 0)));
}

/**
 * 부킹을 조인으로 돌릴 때 만들어지는 **자리 넷**. 서버가 만든다 — 화면이 보낸 배열을 믿으면
 * 매니저가 "2자리 팔렸는데 4자리 남았다"고 적어 한 팀에 여섯 명을 받게 된다(2026-09-24 검토).
 *
 *   sold   앱에서 팔린 자리(승인된 신청의 인원 합). 그 사람들은 **OPEN 자리에 앉은 사람**이다.
 *   more   이제부터 더 받을 자리. 매니저가 고른다. 1 ~ (4 - sold).
 *   나머지 = 4 - sold - more 는 **앱 밖에서 판 자리**라 GUEST 다.
 *
 * 왜 팔린 자리를 GUEST 로 접지 않나: 접으면 같은 사람이 GUEST 칸으로도, 승인된 신청 행으로도
 * 두 번 세어진다. 그리고 그 사람이 취소해도 GUEST 칸은 고정이라 자리가 돌아오지 않는다.
 * OPEN 에 앉혀 두면 '정원 = OPEN 수 · 찬 자리 = 승인 인원' 한 식으로 끝나고, 취소하면 저절로 빈다.
 *
 * GUEST 는 이로써 뜻이 하나다 — **앱에 신청 행이 없는 사람의 자리**(호스트의 동반자 / 앱 밖 판매).
 *
 * sold 가 0이면 결과가 예전(화면이 만들던 것)과 똑같다: GUEST×(4-more) + OPEN×more.
 * 잘못된 값이면 null — 서버는 400.
 */
export function conversionSlots(sold: number, more: number, genders: readonly SlotGender[] = []): JoinSlot[] | null {
    const s = Math.max(0, Math.min(MAX_SLOTS, Math.floor(Number(sold) || 0)));
    const m = Math.floor(Number(more));
    if (!Number.isFinite(m) || m < 1 || m > MAX_SLOTS - s) return null;
    const offApp = MAX_SLOTS - s - m;
    return [
        ...Array.from({ length: offApp }, (): JoinSlot => ({ role: "GUEST", gender: "ANY" })),
        // 이미 팔린 자리도 OPEN 이다 — 성별은 모른다(앱 밖에서 정해진 팀이 아니라 앱으로 산 사람들이다).
        ...Array.from({ length: s }, (): JoinSlot => ({ role: "OPEN", gender: "ANY" })),
        ...Array.from({ length: m }, (_, i): JoinSlot => ({ role: "OPEN", gender: isGender(genders[i]) ? genders[i] : "ANY" })),
    ];
}

/** 모집 조건 요약("남성"·"여성"·"성별무관") — **이제부터 받을** 자리만 본다. 이미 팔린 OPEN 칸(무관)이 섞이면 늘 '성별무관'이 된다. */
export function recruitCondition(genders: readonly SlotGender[]): string {
    const g = genders.filter(isGender);
    if (g.length > 0 && g.every((x) => x === "M")) return "남성";
    if (g.length > 0 && g.every((x) => x === "F")) return "여성";
    return "성별무관";
}

/**
 * 글의 정원 — 조인은 모집 자리 수(사람), 부킹은 1(팀). 서버 라우트(golf.ts joinCapacity)와
 * 공개 골프장 페이지(golfCourses.ts)가 같은 값을 쓰게 여기 둔다.
 */
export function listingCapacity(b: { listingType?: string | null; slots?: unknown; joinHeadcount?: number | null; joinCondition?: string | null }): number {
    if (b.listingType !== "JOIN") return 1;
    const slots = Array.isArray(b.slots) ? normalizeSlots(b.slots) : null;
    if (slots) return openSlotCount(slots);
    return Number(b.joinHeadcount) > 0 ? Math.min(MAX_SLOTS - 1, Number(b.joinHeadcount)) : openSlotCount(slotsFromLegacy(b.joinHeadcount, b.joinCondition));
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

/**
 * 긴급 조인(2026-09-23 오너): "오늘인데 사람이 안 구해져서 10만원짜리 그린피를 천원이나 만원에 올리는 것."
 * 한 명만 채우면 카트비·캐디피를 N빵하니까 그린피를 던지는 것이다 — 부킹의 '핫딜'(isHotDeal, 파는 사람이 직접 켜는 체크)과는 다르다.
 *
 * 저장하지 않고 **계산한다**: 값이 컬럼으로 굳으면 시간이 지나 티오프가 내일이 돼도 '긴급' 배지가 그대로 남고,
 * 그걸 지우는 크론이 또 필요해진다. 서버(전체 푸시 방송)와 화면(배지)이 이 한 함수를 같이 본다.
 */

/** 이보다 싸면 그린피를 '던지는' 가격이다(오너: 천원~만원). 2만원은 포함. */
export const URGENT_MAX_FEE = 30000;
/** 지금부터 이만큼은 남아야 골프장까지 갈 수 있다 — 30분 뒤 티오프를 전 회원에게 푸시하면 소음이다. */
export const URGENT_MIN_LEAD_MS = 2 * 3600_000;

export interface UrgentJoinLike {
    listingType?: string | null;
    joinType?: string | null;
    costMode?: string | null;
    greenFee?: number | string | null;
    datetime?: Date | string | number | null;
}

/** 한국 날짜(YYYYMMDD 정수). 기존 관례대로 +9시간 뒤의 UTC 필드를 읽는다 — 서버 기기 시간대에 기대지 않는다. */
function kstDayKey(ms: number): number {
    const k = new Date(ms + 9 * 3600_000);
    return k.getUTCFullYear() * 10000 + (k.getUTCMonth() + 1) * 100 + k.getUTCDate();
}

/** 한국 시각의 시(0~23). 조용한 시간(밤) 판정에 쓴다. */
export function kstHour(ms: number): number {
    return new Date(ms + 9 * 3600_000).getUTCHours();
}

/**
 * 당일 떨이 조인인가 — 오늘 티오프 · 필드 · 고정가 · 2만원 이하 · 2시간 이상 남음(전부 AND).
 * 스크린·파크는 원래 싸서 2만원 이하가 '떨이'가 아니고(늘 긴급이 돼 버린다), SPLIT(1/N)은 그린피 숫자가 0이라 뜻이 없다.
 */
export function isUrgentJoin(b: UrgentJoinLike, nowMs: number): boolean {
    if (b.listingType !== "JOIN") return false;
    if (b.joinType !== "FIELD") return false;
    if (b.costMode !== "FIXED") return false;
    // 값이 비어 있으면 긴급이 아니다. Number(null) 은 0 이라 그냥 Number() 로 넘기면 **그린피 미입력 글이 전 회원 푸시**가 된다.
    if (b.greenFee === null || b.greenFee === undefined || b.greenFee === "") return false;
    const fee = Number(b.greenFee);
    if (!Number.isFinite(fee) || fee < 0 || fee > URGENT_MAX_FEE) return false;
    const t = b.datetime instanceof Date ? b.datetime.getTime() : new Date((b.datetime ?? NaN) as string | number).getTime();
    if (!Number.isFinite(t)) return false;
    if (t - nowMs < URGENT_MIN_LEAD_MS) return false;
    return kstDayKey(t) === kstDayKey(nowMs);
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
