/**
 * 매장 사진(2026-11-06 오너: 사장님 도구 '추천대로' — 바로 고칠 것 3번).
 * 사장님이 '매장 정보 수정'에서 올리고, 공개 매장 페이지(/stores/<code>)의 맨 위 사진 줄에 뜬다. 매장 페이지의 가장 큰 빈칸이었다.
 *
 *  · 올리는 길은 회원 공용 업로드(POST /api/hiq/upload, category store-photo) — 서버가 EXIF · 위치 정보를 걷고, 알아볼 수 있는 그림만 받는다.
 *  · 저장은 hiq_stores.images(주소 목록 — 예전부터 있던 빈 칸을 쓴다, 더한 열 없음). 우리 Blob 의 store-photo 폴더 주소만 받는다(남의 사이트 그림 · 다른 폴더를 끼워 넣지 못하게).
 * ⚠️ 서버가 임포트하는 shared 파일 — 이 파일은 아무것도 임포트하지 않는다.
 */
export const STORE_PHOTO_CATEGORY = "store-photo";
export const STORE_PHOTO_MAX = 8;

const BLOB_STORE_PHOTO = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/hiq\/store-photo\/[A-Za-z0-9._-]+$/;

export function isStorePhotoUrl(v: unknown): v is string {
    return typeof v === "string" && v.length <= 300 && BLOB_STORE_PHOTO.test(v);
}

/** 사장님이 보낸 사진 목록 — 꼴이 틀리면 null(저장하지 않는다). 겹친 것은 하나로, 최대 STORE_PHOTO_MAX 장 */
export function cleanStorePhotos(v: unknown): string[] | null {
    if (!Array.isArray(v)) return null;
    if (!v.every(isStorePhotoUrl)) return null;
    return [...new Set(v as string[])].slice(0, STORE_PHOTO_MAX);
}

/** 읽은 값(jsonb) → 화면에 보낼 목록. 꼴이 틀린 줄은 버린다 */
export function storePhotosOf(v: unknown): string[] {
    return Array.isArray(v) ? (v as unknown[]).filter(isStorePhotoUrl).slice(0, STORE_PHOTO_MAX) : [];
}
