/**
 * 등산 — 산행 사진(2026-10-13 오너: "트래킹 체크 및 사진을 업로드 … 골프 라운딩 중 사진 넣는 그런 느낌").
 *
 * 같은 날 오너 결정: **"사진 공개가 기본인데 본인이 공개 비공개 할 수 있게, 골프에 골프장 목록에 사진 올리는 것처럼."**
 *  - 올린 사진은 그 산의 화면('이 산의 사진')에 **바로** 보인다(사전 승인 없음). 올린 사람은 사진마다 언제든 공개 · 비공개를 바꾼다.
 *  - 바로 보이는 만큼 신고 · 차단 · 자동 가림(서로 다른 3명) · 이의제기 · 운영자 큐가 한 벌로 붙는다(신고 대상 이름 HIKING_PHOTO_REPORT_TARGET).
 *  - 공개로 바뀌기 **전에** 올린 사진은 비공개로 남는다 — "내 사진첩에만 담겨요"라고 적힌 화면에서 올린 것이다(migrations/hiking_photos_public.sql).
 *    같은 까닭으로 서버는 공개 여부가 실려 오지 않은 요청(옛 화면)을 비공개로 적는다. 새 화면은 늘 실어 보낸다(HIKING_PHOTO_DEFAULT_PUBLIC).
 *
 * 남에게 나가는 것은 사진 · 올린 사람의 이름 · **달까지의 날짜**뿐이다(정확한 날 · 시각은 그날 거기 있었다는 위치 기록이 된다).
 *  - 올리는 길: 화면이 캔버스로 다시 그려(긴 변 1600 · 썸네일 400) POST /api/hiq/upload 로 올리고, 받은 주소 둘을 POST /hiking/photos 로 적는다.
 *    캔버스를 거치며 사진의 위치 정보(EXIF)는 사라지고, 서버가 한 번 더 걷는다(utils/imageMeta).
 *  - **어디서 찍었는지(좌표)는 저장하지 않는다** — 어느 산의 사진인지와 올린 때만.
 *  - 하루 · 산마다 올릴 수 있는 수에 끝이 있다(저장소를 지킨다).
 * 골프의 사진 규칙(shared/golfPhoto)을 가져다 쓰지 않는다 — 같은 행동을 등산의 것으로 다시 적는다.
 * 순수 값 · 함수만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
export const HIKING_PHOTO_CATEGORY = "hiking-photo";
export const HIKING_THUMB_CATEGORY = "hiking-thumb";
/** 업로드 API 가 '알아볼 수 있는 이미지'만 받는 폴더 — 사진 정보를 걷었다고 장담할 수 있는 것만 */
export const HIKING_PHOTO_CATEGORIES: ReadonlySet<string> = new Set([HIKING_PHOTO_CATEGORY, HIKING_THUMB_CATEGORY]);
export const HIKING_PHOTO_LONG = 1600;
export const HIKING_THUMB_LONG = 400;
/** 한 사람이 하루에 올릴 수 있는 수 · 한 산에 둘 수 있는 수 */
export const HIKING_PHOTO_DAILY_MAX = 40;
export const HIKING_PHOTO_PER_MOUNTAIN_MAX = 120;
/** 산 화면 '이 산의 사진'에 싣는 수(새 것부터) · 한 번에 줄 수 있는 끝 */
export const HIKING_GALLERY_LIMIT = 12;
export const HIKING_GALLERY_MAX = 48;
/** 새로 올리는 사진의 공개 여부 — 공개가 기본이다. 화면이 이 값을 실어 보낸다 */
export const HIKING_PHOTO_DEFAULT_PUBLIC = true;
/** 신고 대상의 이름 — 신고(community) · 운영자 큐(reportQueue)가 같은 값을 쓴다 */
export const HIKING_PHOTO_REPORT_TARGET = "hiking_photo";
/** 서로 다른 몇 사람이 신고하면 저절로 가려지는가 — 실제 판정은 신고 저장소(community.repo report)의 것이고, 여기는 그 수를 적어 둔 것이다(시험이 둘을 맞춘다) */
export const HIKING_PHOTO_AUTO_HIDE_REPORTERS = 3;
/** 산 화면에서 내 사진 구역의 자리 — 알림이 여기로 데려온다 */
export const HIKING_PHOTOS_ANCHOR = "sec-photos";

/** 내 사진첩의 한 장 — **올린 사람에게만** 나간다(비공개 · 가려진 것까지) */
export interface HikingPhoto {
    id: string; mountainId: string; url: string; thumbUrl: string; width: number; height: number;
    /** 올린 때(ISO) — 올린 사람만 날까지 본다 */
    takenAt: string;
    isPublic: boolean;
    /** 신고가 쌓였거나 운영자가 가렸다 — 공개여도 남에게 보이지 않는다 */
    hidden: boolean;
    /** 지금의 가림에 이의제기를 냈다 */
    appealed: boolean;
}
/** 산 화면의 공개 사진 한 장 — 누구에게나 나간다. 날짜는 달까지만, 좌표 · 연락처는 없다 */
export interface MountainPhoto { id: string; memberId: string; credit: string; month: string; url: string; thumbUrl: string; width: number; height: number }

const BLOB_HOST_RE = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i;
/**
 * 우리 업로드 API 가 **이 회원에게** 만들어 준 등산 사진 주소인가.
 * 업로드 경로가 `hiq/<category>/<memberId>-<무작위>.<ext>` 다(routes/modules/member.ts POST /upload — 이름은 회원 id, 무작위 꼬리는 저장소가 붙인다).
 * 그래서 주소만 보고 남의 사진 · 다른 폴더 · 바깥 주소를 내 산행 사진으로 적는 것을 막는다. 우리 저장소인지(호스트)는 서버가 한 번 더 본다(utils/blob isOnOwnBlobHost).
 */
export function isOwnHikingPhotoUrl(url: unknown, memberId: string, category: string): url is string {
    if (typeof url !== "string" || url.length > 400 || !HIKING_PHOTO_CATEGORIES.has(category)) return false;
    let u: URL;
    try { u = new URL(url); } catch { return false; }
    if (u.protocol !== "https:" || !BLOB_HOST_RE.test(u.hostname) || u.search || u.hash) return false;
    if (!/^[0-9a-f-]{8,40}$/i.test(memberId)) return false;
    return new RegExp(`^/hiq/${category}/${memberId}-[A-Za-z0-9]{6,64}\\.(webp|jpg|png)$`, "i").test(u.pathname);
}
/** 적을 만한 크기인가 */
export const validPhotoSize = (w: unknown, h: unknown): boolean => Number.isInteger(w) && Number.isInteger(h) && (w as number) >= 16 && (h as number) >= 16 && (w as number) <= 4096 && (h as number) <= 4096;

/** 남에게 보이는 날짜 — **달까지만**("2026년 10월", 한국 시각). 정확한 날 · 시각은 그날 그 산에 있었다는 기록이 된다 */
export function hikingPhotoMonth(at: Date | string): string {
    const t = typeof at === "string" ? new Date(at) : at;
    if (Number.isNaN(t.getTime())) return "";
    const k = new Date(t.getTime() + 9 * 3600_000);
    return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월`;
}
/** 올린 사람의 이름 — 비었거나 탈퇴한 회원이면 이름을 싣지 않는다 */
export function hikingPhotoCredit(name: string | null | undefined): string {
    const n = (name ?? "").trim();
    return !n || n === "탈퇴회원" ? "랭큐 회원" : n.slice(0, 20);
}

/** 얼굴 이야기 — 올리기 단추 밑과 공개 사진의 한 줄이 같은 말을 쓴다 */
const FACE = "같이 간 사람의 얼굴이 나온 사진은 비공개로 두세요.";
export const HIKING_PHOTO_LABEL = {
    title: "내 산행 사진",
    aside: "사진마다 공개 · 비공개",
    add: "사진 올리기",
    empty: "이 산에서 찍은 사진을 올려 보세요. 올린 사진은 이 산의 화면에 보이고, 사진마다 비공개로 돌릴 수 있어요.",
    /** 올리기 단추 밑 — 어디에 보이는지와 거두는 길 */
    where: "올린 사진은 이 산의 화면에 보여요. 사진을 눌러 비공개로 돌릴 수 있어요.",
    note: "사진의 위치 정보는 올릴 때 지워요. 어디서 찍었는지는 저장하지 않아요.",
    /** 올리기 단추 밑 — 올리는 순간 공개이므로 올리기 전에 말한다 */
    faceShort: FACE,
    /** 공개인 동안 늘 보이는 한 줄 — 어디에 보이는지와 얼굴 이야기 */
    face: `공개 사진은 이 산의 화면에 보여요. ${FACE}`,
    full: "이 산에 담을 수 있는 사진을 다 채웠어요. 지우고 다시 올려 주세요.",
    daily: "오늘 올릴 수 있는 사진을 다 올렸어요. 내일 다시 올려 주세요.",
    public: "공개",
    private: "비공개",
    privateNow: "나만 볼 수 있어요. 공개로 바꾸면 이 산의 화면에 보여요.",
    hidden: "신고가 쌓여 가려진 사진이에요. 지금은 나만 볼 수 있어요.",
    appeal: "이의제기",
    appealed: "이의제기가 접수됐어요. 운영자가 다시 보고 알려 드려요.",
    galleryTitle: "이 산의 사진",
    galleryAside: "랭큐 회원이 올렸어요",
    galleryNote: "문제가 있는 사진은 사진을 열어 신고할 수 있어요.",
} as const;
