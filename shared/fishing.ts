/**
 * 낚시 — 네 번째 종목의 첫 뼈대(2026-10-14 오너: "낚시 카테고리도 만들 생각이야 … 낚시터 · 바다 일기도 중요하지만 더 중요한 게
 * '이런 곳에 갔다 왔다 · 이런 물고기 잡았다'일 것 같고, 우리는 크루 중심이니까 … 네비게이션에는 크루와 채팅이 들어가고 나머지는 네가 설계해 봐.
 * 배경색과 톤은 바다니까 블루 계열" · "낚시는 일단 나만 볼 수 있게 하고").
 *
 * 설계의 줄기(기획서: docs/01-plan/features/fishing-category.md):
 *  - 중심은 **조과 기록**(어디서 · 무엇을 · 얼마나) — 한 번의 출조가 한 장의 기록이고, 그것이 내 수첩 · 크루의 소식 · 어종 도감 칸을 채운다.
 *  - 하단 탭: 홈 · 크루 · 조과 · 포인트 · 채팅. 지금은 홈과 조과만 열려 있다(포인트 = 받은 낚시터 1,151곳 · 낚시어선 자료, 크루 = 낚시 크루 — 다음 단계).
 *  - 지금은 운영자(슈퍼관리자)에게만 보인다. 여는 스위치는 FISHING_PUBLIC(또는 env FISHING_PUBLIC=true) — 서버가 판단하고 화면은 /me 의 fishingAccess 만 본다.
 *
 * 지키는 것: 잡은 곳은 사람이 적은 이름만 받는다(위치를 재지 않는다) · 크기 · 마릿수는 본인이 적은 값이라 순위를 매기지 않는다(다음 단계에서 정할 일)
 * · 금어기 · 금지체장 자료가 아직 없으니 '잡아도 된다'는 말을 하지 않는다.
 *
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { cleanCoord, type CatchWeather } from "./fishingSpot.js";

/** 전면 공개 스위치 — 지금은 닫혀 있다(운영자만) */
// 2026-10-18 오너: "낚시 전체를 공개" — 회원 누구나 낚시를 쓴다(방문자는 공개 화면 '전국 낚시터')
export const FISHING_PUBLIC = true;
export const FISHING_PATH = "/fishing";

/** 바다 색 — 등산(청록 · 살구) · 골프(검정 · 라임) · 당구와 섞이지 않게 남색 바탕에 물빛 */
export const FISHING_COLORS = {
    // 2026-10-14 다시 고름(오너: "등산의 느낌이 좋아") — '새벽 바다': 짙은 바다색 바탕 · 동틀 녘의 따뜻한 강조 · 모래빛 숫자 · 종이빛 글자.
    // 등산(짙은 청록 + 산호빛)과 같은 결이고, 값은 표지 그림(client/public/fishing/art/hero.webp)에서 가져왔다. card 는 바탕 위에 얹는 옅은 판이다.
    bg: "#0B1E2D", bar: "#0B1E2D", card: "#FFFFFF0A", line: "#FFFFFF14",
    brand: "#F4A963", onBrand: "#2A1606", foam: "#F3ECDD", soft: "#F3ECDDB3", dim: "#F3ECDD80", sun: "#F8DDB0",
} as const;

/** 어디서 낚았는가 — 낚시꾼이 쓰는 갈래 */
export const FISHING_SPOTS = [
    { id: "boat", name: "선상" }, { id: "rock", name: "갯바위" }, { id: "pier", name: "방파제 · 항" }, { id: "shore", name: "해변 · 원투" },
    { id: "pay", name: "유료 낚시터" }, { id: "lake", name: "저수지 · 댐" }, { id: "river", name: "강 · 계곡" },
] as const;
export type FishingSpotId = (typeof FISHING_SPOTS)[number]["id"];
export const fishingSpotName = (id: string | null | undefined): string => FISHING_SPOTS.find((s) => s.id === id)?.name ?? "";

/**
 * 자주 적는 어종 — 낚시꾼이 부르는 이름으로(받은 낚시터 자료에 많이 적힌 순 + 바다 인기 어종). 고르기 쉽게 하는 칩일 뿐, 다른 이름도 적을 수 있다.
 * 정식 종명과 잇는 일(우럭 = 조피볼락 …)은 도감을 만들 때 사람이 한다 — 받은 자료의 '우럭'은 조개다.
 */
export const FISHING_SPECIES: readonly string[] = [
    "붕어", "잉어", "향어", "메기", "배스", "쏘가리", "송어",
    "우럭", "광어", "감성돔", "참돔", "돌돔", "농어", "볼락", "노래미", "숭어", "고등어", "전갱이", "갈치", "삼치", "방어", "학꽁치",
    "주꾸미", "갑오징어", "무늬오징어", "한치", "문어",
];

export interface FishingCatch {
    id: string;
    /** 낚은 날(YYYY-MM-DD) */
    day: string;
    /** 다녀온 곳 — 사람이 적은 이름 */
    place: string;
    spot: FishingSpotId | null;
    species: string;
    /** 가장 큰 것의 길이(cm) — 안 쟀으면 null */
    lengthCm: number | null;
    /** 마릿수 */
    count: number;
    /** 가장 큰 것의 무게(kg) — 무늬오징어 · 문어처럼 무게로 말하는 어종 */
    weightKg: number | null;
    /** 갈치의 굵기(지 — 손가락 너비) */
    ji: number | null;
    /** 놓아 줬는가 */
    released: boolean;
    /** 사진(우리 저장소의 주소) — 나만 본다 */
    photoUrl: string | null;
    thumbUrl: string | null;
    note: string | null;
    /** 그날의 물때를 어느 바다 식으로 세는가(서해 7물때 · 남해/동해/제주 8물때). 민물이거나 옛 줄이면 없다 — 물때 이름은 날짜로 그때그때 센다(shared/fishingTide) */
    tideSea?: "west" | "south" | null;
    lat?: number | null;
    lng?: number | null;
    weather?: CatchWeather | null;
    isPublic?: boolean;
    createdAt: string;
    /** 신고로 가려졌다(2026-10-17) — 랭킹 · 정출판 · 수족관에서 빠지고 내 일지에만 남는다 */
    hidden?: boolean;
    /** 가린 뒤에 이의제기를 냈다 */
    appealed?: boolean;
    /** 운영자가 랭킹에서만 뺀 까닭(값이 지나치게 큼) — 일지 · 수족관에는 그대로 */
    rankVoid?: string | null;
}
export type FishingCatchInput = Omit<FishingCatch, "id" | "createdAt" | "weather">;

const text = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** 받은 값을 다듬는다 — 꼴이 틀리면 까닭(사람에게 보일 말)을 준다. today: 한국 날짜(YYYY-MM-DD) */
const coordOf = (o: Record<string, unknown>) => { const c = cleanCoord(o.lat, o.lng); return { lat: c?.lat ?? null, lng: c?.lng ?? null }; };

export function cleanCatch(raw: unknown, today: string): { ok: true; value: FishingCatchInput } | { ok: false; error: string } {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const day = text(o.day, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) return { ok: false, error: "날짜를 골라 주세요" };
    if (day > today) return { ok: false, error: "앞날의 조과는 적을 수 없어요" };
    if (day < "2000-01-01") return { ok: false, error: "날짜를 다시 확인해 주세요" };
    const place = text(o.place, 40);
    if (place.length < 2) return { ok: false, error: "다녀온 곳을 적어 주세요" };
    const species = text(o.species, 20);
    if (!species) return { ok: false, error: "어종을 고르거나 적어 주세요" };
    const count = Math.round(Number(o.count ?? 1));
    if (!(count >= 1 && count <= 999)) return { ok: false, error: "마릿수는 1~999 로 적어 주세요" };
    const len = o.lengthCm == null || o.lengthCm === "" ? null : Math.round(Number(o.lengthCm) * 10) / 10;
    if (len != null && !(len >= 1 && len <= 400)) return { ok: false, error: "길이는 1~400cm 로 적어 주세요" };
    const spot = FISHING_SPOTS.some((s) => s.id === o.spot) ? (o.spot as FishingSpotId) : null;
    const note = text(o.note, 200) || null;
    const kg = o.weightKg == null || o.weightKg === "" ? null : Math.round(Number(o.weightKg) * 100) / 100;
    if (kg != null && !(kg >= 0.05 && kg <= 300)) return { ok: false, error: "무게는 0.05~300kg 으로 적어 주세요" };
    const ji = o.ji == null || o.ji === "" ? null : Math.round(Number(o.ji));
    if (ji != null && !(ji >= 1 && ji <= 10)) return { ok: false, error: "갈치 굵기는 1~10지로 적어 주세요" };
    const url = (v: unknown) => (typeof v === "string" && v ? v : null);
    return { ok: true, value: { day, place, spot, species, lengthCm: len, count, weightKg: kg, ji, released: o.released === true, photoUrl: url(o.photoUrl), thumbUrl: url(o.thumbUrl), note, tideSea: o.tideSea === "west" || o.tideSea === "south" ? o.tideSea : null, ...coordOf(o), isPublic: o.isPublic === true } };
}

export interface FishingSummary {
    /** 출조한 날 수(같은 날 여러 줄은 하루) */
    trips: number;
    /** 잡은 마릿수 */
    fish: number;
    /** 만난 어종 수 */
    species: number;
    /** 다녀온 곳 수 */
    places: number;
    /** 가장 큰 한 마리 */
    biggest: { species: string; lengthCm: number; day: string; place: string } | null;
}

export function fishingSummary(list: readonly FishingCatch[]): FishingSummary {
    let biggest: FishingSummary["biggest"] = null;
    for (const c of list) {
        if (c.lengthCm != null && (!biggest || c.lengthCm > biggest.lengthCm)) biggest = { species: c.species, lengthCm: c.lengthCm, day: c.day, place: c.place };
    }
    return {
        trips: new Set(list.map((c) => c.day)).size,
        fish: list.reduce((n, c) => n + c.count, 0),
        species: new Set(list.map((c) => c.species)).size,
        places: new Set(list.map((c) => c.place)).size,
        biggest,
    };
}

/** 어종별로 묶은 내 도감 — 처음 만난 날 · 마릿수 · 가장 큰 길이. 많이 잡은 순 */
export function fishingDex(list: readonly FishingCatch[]): { species: string; count: number; best: number | null; first: string }[] {
    const by = new Map<string, { species: string; count: number; best: number | null; first: string }>();
    for (const c of list) {
        const cur = by.get(c.species) ?? { species: c.species, count: 0, best: null, first: c.day };
        cur.count += c.count;
        if (c.lengthCm != null && (cur.best == null || c.lengthCm > cur.best)) cur.best = c.lengthCm;
        if (c.day < cur.first) cur.first = c.day;
        by.set(c.species, cur);
    }
    return [...by.values()].sort((a, b) => b.count - a.count || a.species.localeCompare(b.species, "ko"));
}

/** 2026-10-14 → "10월 14일"(올해가 아니면 해도) */
export function fishingDayLabel(day: string, today: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!m) return day;
    const md = `${Number(m[2])}월 ${Number(m[3])}일`;
    return m[1] === today.slice(0, 4) ? md : `${m[1]}년 ${md}`;
}

/** 낚시터 한 곳(받은 자료를 걸러 실은 것 — migrations/fishing_places.sql) */
export interface FishingPlace { id: string; name: string; kind: string | null; sido: string | null; sigungu: string | null; address: string | null; species: string[]; fee: string | null; tel: string | null; dataDate: string | null }
/** 실은 자료의 출처 — 화면에 그대로 적는다 */
export const FISHING_PLACE_SOURCE = "행정안전부 낚시터정보 · 지자체에 등록된 낚시터(유료 낚시터 중심)";

const SIDO_SHORT: Record<string, string> = { 충청북도: "충북", 충청남도: "충남", 경상북도: "경북", 경상남도: "경남", 전라남도: "전남", 전북특별자치도: "전북", 강원특별자치도: "강원", 제주특별자치도: "제주", 세종특별자치시: "세종", 전남광주통합특별시: "전남 · 광주" };
/** 시도 이름을 칩에 들어가게 — "충청북도" → "충북", "인천광역시" → "인천" */
export const fishingSidoShort = (sido: string | null | undefined): string => {
    const s = String(sido ?? "");
    return SIDO_SHORT[s] ?? s.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, "");
};

/* ── 조과 사진 — 올리는 길은 다른 사진과 같다(POST /api/hiq/upload · 기기에서 다시 그려 위치 꼬리표가 떨어진다) ── */
export const FISHING_PHOTO_CATEGORY = "fishing-photo";
export const FISHING_THUMB_CATEGORY = "fishing-thumb";
export const FISHING_PHOTO_CATEGORIES: ReadonlySet<string> = new Set([FISHING_PHOTO_CATEGORY, FISHING_THUMB_CATEGORY]);
/** 긴 변(px) · 품질 */
export const FISHING_PHOTO_LONG_SIDE = 1600;
export const FISHING_THUMB_LONG_SIDE = 480;
const FISHING_BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i;
/** 이 주소가 우리 업로드 길이 **이 회원에게** 만든 낚시 사진인가 — 남의 사진 · 바깥 주소를 내 조과에 붙이지 못하게 */
export function isOwnFishingPhotoUrl(url: unknown, memberId: string, category: string): url is string {
    if (typeof url !== "string" || url.length > 400 || !FISHING_PHOTO_CATEGORIES.has(category)) return false;
    let u: URL;
    try { u = new URL(url); } catch { return false; }
    if (u.protocol !== "https:" || !FISHING_BLOB_HOST.test(u.hostname) || u.search || u.hash) return false;
    if (!/^[0-9a-f-]{8,40}$/i.test(memberId)) return false;
    return new RegExp(`^/hiq/${category}/${memberId}-[A-Za-z0-9]{6,64}\\.(webp|jpg|png)$`, "i").test(u.pathname);
}

export const fishingKstDay = (ms: number): string => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
