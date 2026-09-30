/**
 * 라운드 사진(2026-09-30)의 규칙 한 곳 — 서버(업로드·저장·골프장 페이지·사이트맵)와 화면(카메라 단추·앨범)이 같은 값을 쓴다.
 * ⚠️ 서버가 이 파일을 읽는다 — 상대 임포트를 넣게 되면 반드시 './x.js' (serverless-shared-imports).
 */

/** Blob 폴더(POST /api/hiq/upload category) — 원본·썸네일 */
export const GOLF_PHOTO_CATEGORY = "golf-photo";
export const GOLF_THUMB_CATEGORY = "golf-thumb";
export const GOLF_PHOTO_CATEGORIES: ReadonlySet<string> = new Set([GOLF_PHOTO_CATEGORY, GOLF_THUMB_CATEGORY]);

/** 한 사람이 한 라운드에 올릴 수 있는 장수 */
export const GOLF_PHOTO_MAX_PER_ROUND = 20;
/**
 * 고르는 원본 파일 상한 — 휴대폰에서 줄이기 **전** 크기. 줄인 뒤 올라가는 건 1600px webp(수백 KB)라 서버 8MB 한도와는 별개다.
 * 8MB 였더니 요즘 폰 고화소 사진(48MP JPEG 10~15MB)이 막혔다(9/30). 너무 큰 파일은 웹뷰가 풀다가 멈추니 한 장씩 풀고 25MB 에서 끊는다.
 */
export const GOLF_PHOTO_MAX_RAW_BYTES = 25 * 1024 * 1024;
/** 원본 긴 변·품질, 썸네일 긴 변·품질(webp — iOS 웹뷰처럼 webp 인코딩이 없으면 JPEG 로 같은 값) */
export const GOLF_PHOTO_LONG_SIDE = 1600;
export const GOLF_PHOTO_QUALITY = 0.8;
export const GOLF_THUMB_LONG_SIDE = 400;
export const GOLF_THUMB_QUALITY = 0.72;

/** 골프장 페이지 '라운드 사진' 칸 장수, 봇 HTML figure 장수, 사이트맵 image:image 장수 */
export const COURSE_GALLERY_LIMIT = 12;
export const SITEMAP_PHOTO_LIMIT = 5;

/** 공개로 돌릴 때 한 줄 안내 — 화면 토글과 약관 설명이 같은 말을 쓴다 */
export const GOLF_PHOTO_PUBLIC_NOTICE = "공개 사진은 이 골프장 페이지에 보여요. 동반자 얼굴이 나온 사진은 비공개로 두세요.";
/**
 * 초상권 한 줄(2026-09-30 v2 — 오너: "노란 문단이 경보처럼 읽힌다"). '어디에 올라가는지'는 뷰어 상태 줄이 따로 말하므로
 * 여기엔 얼굴 얘기만 남긴다. 공개로 돌린 순간·공개 중인 동안 늘 보인다(작은 ⓘ 줄).
 */
export const GOLF_PHOTO_FACE_NOTICE = "동반자 얼굴이 나온 사진은 비공개로 두세요";

const BLOB_HOST_RE = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/i;
const EXT_RE = "(webp|jpg|png)";

/**
 * 우리 업로드 API 가 **이 회원에게** 만들어 준 사진 주소인가.
 * 업로드 경로가 `hiq/<category>/<memberId>-<무작위>.<ext>` 라(routes/modules/member.ts POST /upload) 주소만 보고
 * 남의 사진·외부 주소를 내 라운드 사진으로 등록하는 것을 막을 수 있다.
 */
export function isOwnGolfPhotoUrl(url: unknown, memberId: string, category: string): url is string {
    if (typeof url !== "string" || url.length > 400) return false;
    let u: URL;
    try { u = new URL(url); } catch { return false; }
    if (u.protocol !== "https:" || !BLOB_HOST_RE.test(u.hostname) || u.search || u.hash) return false;
    const id = memberId.replace(/[^0-9a-f-]/gi, "");
    if (!id || id !== memberId) return false;
    return new RegExp(`^/hiq/${category}/${id}-[A-Za-z0-9]{6,64}\\.${EXT_RE}$`, "i").test(u.pathname);
}

/** 사진 크레딧의 날짜 — **달까지만**(정확한 날·시각은 그날 거기 있었다는 위치 기록이 된다). KST 기준 */
export function photoMonthLabel(d: Date | string): string {
    const t = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(t.getTime())) return "";
    const k = new Date(t.getTime() + 9 * 3600_000);
    return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월`;
}

/** 회원 이름을 크레딧으로 — 비었거나 탈퇴회원이면 이름을 싣지 않는다 */
export function photoCredit(name: string | null | undefined): string {
    const n = (name ?? "").trim();
    return !n || n === "탈퇴회원" ? "랭큐 회원" : n.slice(0, 20);
}
