/**
 * 등산 — 산행 사진(2026-10-13 오너: "트래킹 체크 및 사진을 업로드 … 골프 라운딩 중 사진 넣는 그런 느낌").
 *
 * 첫 걸음은 **내 사진첩**이다 — 올린 사람에게만 목록이 보인다(산 화면의 '내 사진' · 산행 중 화면).
 * 남에게 보이는 자리(산의 공개 사진 · 산악회)는 신고 · 차단 · 가리기까지 한 벌로 갖춘 뒤에 연다(골프 라운드 사진이 그렇게 열렸다).
 * 그래서 여기에는 공개 · 신고의 규칙이 없다. 골프의 사진 규칙(shared/golfPhoto)을 가져다 쓰지 않는다.
 *
 *  - 올리는 길: 화면이 캔버스로 다시 그려(긴 변 1600 · 썸네일 400) POST /api/hiq/upload 로 올리고, 받은 주소 둘을 POST /hiking/photos 로 적는다.
 *    캔버스를 거치며 사진의 위치 정보(EXIF)는 사라지고, 서버가 한 번 더 걷는다(utils/imageMeta).
 *  - **어디서 찍었는지(좌표)는 저장하지 않는다** — 어느 산의 사진인지와 올린 때만.
 *  - 하루 · 산마다 올릴 수 있는 수에 끝이 있다(저장소를 지킨다).
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

export interface HikingPhoto { id: string; mountainId: string; url: string; thumbUrl: string; width: number; height: number; takenAt: string }

/** 그 주소가 그 폴더(hiq/<category>/)에 올린 것인가 — 호스트가 우리 저장소인지는 서버가 따로 본다 */
export function isHikingPhotoPath(url: unknown, category: string): url is string {
    if (typeof url !== "string" || url.length > 600) return false;
    try { const u = new URL(url); return u.protocol === "https:" && u.pathname.startsWith(`/hiq/${category}/`); } catch { return false; }
}
/** 적을 만한 크기인가 */
export const validPhotoSize = (w: unknown, h: unknown): boolean => Number.isInteger(w) && Number.isInteger(h) && (w as number) >= 16 && (h as number) >= 16 && (w as number) <= 4096 && (h as number) <= 4096;

export const HIKING_PHOTO_LABEL = {
    title: "내 산행 사진",
    aside: "내 사진첩에만 담겨요",
    add: "사진 올리기",
    empty: "이 산에서 찍은 사진을 담아 두세요. 내 사진첩에만 담기고, 사진의 위치 정보는 올릴 때 지워요.",
    note: "사진의 위치 정보는 올릴 때 지워요. 어디서 찍었는지는 저장하지 않아요.",
    full: "이 산에 담을 수 있는 사진을 다 채웠어요. 지우고 다시 올려 주세요.",
    daily: "오늘 올릴 수 있는 사진을 다 올렸어요. 내일 다시 올려 주세요.",
} as const;
