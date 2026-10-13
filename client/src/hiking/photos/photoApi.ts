/**
 * 등산 — 산행 사진의 화면 쪽 한 곳(2026-10-13): 줄여 올리기 · 내 사진 · 이 산의 사진 · 공개/비공개 · 이의제기 · 지우기. 규칙은 shared/hikingPhotos.
 *
 * 올리는 길: 파일 → 캔버스로 두 벌(긴 변 1600 · 썸네일 400) → POST /api/hiq/upload 두 번 → 받은 주소 둘을 POST /api/hiq/hiking/photos 로 적는다.
 * 캔버스로 다시 그리므로 사진의 위치 정보(EXIF · GPS)는 따라오지 않고, 서버가 한 번 더 걷는다. **좌표는 어디에도 보내지 않는다.**
 * 공개 여부는 늘 실어 보낸다(기본은 공개 — HIKING_PHOTO_DEFAULT_PUBLIC). 서버는 실려 오지 않은 요청을 옛 화면의 것으로 보고 비공개로 적는다.
 *
 * 캐시 열쇠: 이 산의 사진은 앞자리가 "hiking-photos" 다 — 차단하면 신고 창(ReportDialog invalidateAfterBlock)이 이 앞자리로 다시 받게 한다.
 * 끝에 **보는 사람**을 붙인다: 답이 사람마다 다르고(차단한 회원의 사진이 빠진다) 캐시는 기기에 남는다.
 * 골프의 사진 코드(golf/lib/photoApi)를 가져다 쓰지 않는다 — 등산은 등산의 것으로.
 */
import type { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
    HIKING_GALLERY_LIMIT, HIKING_PHOTO_CATEGORY, HIKING_PHOTO_DEFAULT_PUBLIC, HIKING_PHOTO_LONG, HIKING_THUMB_CATEGORY, HIKING_THUMB_LONG,
    type HikingPhoto, type MountainPhoto,
} from "@shared/hikingPhotos";

const MY_PHOTOS_URL = "/api/hiq/hiking/me/photos";
export const myPhotosKey = (mountainId: string) => [`${MY_PHOTOS_URL}?mountainId=${encodeURIComponent(mountainId)}`] as const;
/** 내 사진첩(산마다 묶은 내 사진 전부 — shared/hikingAlbum). 사진 하나가 바뀌면 같이 다시 받는다(refreshHikingPhotos) */
const MY_ALBUM_URL = "/api/hiq/hiking/me/album";
export const HIKING_ALBUM_KEY = [MY_ALBUM_URL] as const;
/** 내 사진에서 나온 답인가 — 산마다의 내 사진과 사진첩 */
const isMyPhotosKey = (key: unknown): boolean => typeof key === "string" && (key.startsWith(MY_PHOTOS_URL) || key.startsWith(MY_ALBUM_URL));
export const HIKING_PHOTOS_KEY = "hiking-photos";
export const mountainPhotosKey = (slug: string, viewer: string) => [HIKING_PHOTOS_KEY, "mountain", slug, viewer] as const;
export class HikingPhotoError extends Error {}

/** 이 산의 사진(누구나) — 공개 · 안 가려진 것, 새 것부터 */
export const fetchMountainPhotos = (slug: string): Promise<{ photos: MountainPhoto[] }> =>
    apiRequest(`/api/hiq/hiking/mountains/${encodeURIComponent(slug)}/photos?limit=${HIKING_GALLERY_LIMIT}`);

/** 사진 하나가 바뀐 뒤 — 내 사진(어느 산이든) · 내 사진첩과 이 산의 사진을 다시 받는다 */
export function refreshHikingPhotos(qc: QueryClient) {
    void qc.invalidateQueries({ predicate: (q) => isMyPhotosKey(q.queryKey[0]) });
    void qc.invalidateQueries({ queryKey: [HIKING_PHOTOS_KEY] });
}

/** HEIC · HEIF(휴대폰의 '고효율 사진') — 안드로이드 웹뷰는 풀지 못한다 */
const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

function loadImage(file: File): Promise<{ img: HTMLImageElement; done: () => void }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve({ img, done: () => URL.revokeObjectURL(url) });
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new HikingPhotoError(isHeic(file) ? "고효율(HEIC) 사진은 이 기기에서 열 수 없어요. 카메라로 바로 찍거나 JPG 사진을 골라 주세요." : "이 사진은 열 수 없어요. 다른 사진을 골라 주세요."));
        };
        img.src = url;
    });
}

/** 긴 변을 long 으로 줄여 webp(안 되면 JPEG) 데이터 주소로 */
function encode(img: HTMLImageElement, long: number, quality: number) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, long / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * scale)), height = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new HikingPhotoError("사진을 줄이지 못했어요.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    let dataUrl = canvas.toDataURL("image/webp", quality);
    // webp 인코더가 없는 웹뷰(iOS)는 PNG 를 돌려준다 — 사진에서는 몇 배 크니 JPEG 로
    if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", quality);
    canvas.width = 0; canvas.height = 0;
    return { dataUrl, width, height };
}

async function putBlob(dataUrl: string, category: string): Promise<string> {
    const r = await apiRequest("/api/hiq/upload", { method: "POST", body: JSON.stringify({ dataUrl, category }) });
    const url = r?.url ?? r?.data?.url;
    if (!url) throw new HikingPhotoError("사진을 올리지 못했어요.");
    return url;
}

/** 한 장 올리기 — 끝나면 적힌 사진. 공개 여부를 주지 않으면 기본값(공개)이다 */
export async function uploadHikingPhoto(mountainId: string, file: File, isPublic: boolean = HIKING_PHOTO_DEFAULT_PUBLIC): Promise<HikingPhoto> {
    if (!file.type.startsWith("image/") && !isHeic(file)) throw new HikingPhotoError("사진 파일을 골라 주세요.");
    const { img, done } = await loadImage(file);
    try {
        const big = encode(img, HIKING_PHOTO_LONG, 0.82), small = encode(img, HIKING_THUMB_LONG, 0.72);
        const [url, thumbUrl] = await Promise.all([putBlob(big.dataUrl, HIKING_PHOTO_CATEGORY), putBlob(small.dataUrl, HIKING_THUMB_CATEGORY)]);
        const r: { photo: HikingPhoto } = await apiRequest("/api/hiq/hiking/photos", { method: "POST", body: JSON.stringify({ mountainId, url, thumbUrl, width: big.width, height: big.height, isPublic }) });
        return r.photo;
    } finally {
        done();
    }
}

/** 내 사진의 공개 · 비공개 — 바뀐 사진을 돌려준다 */
export const setHikingPhotoPublic = (id: string, isPublic: boolean): Promise<{ photo: HikingPhoto }> =>
    apiRequest(`/api/hiq/hiking/photos/${id}`, { method: "PATCH", body: JSON.stringify({ isPublic }) });
/** 가려진 내 사진에 이의제기 — 한 번 누르기 */
export const appealHikingPhoto = (id: string): Promise<{ appealed: boolean }> =>
    apiRequest(`/api/hiq/hiking/photos/${id}/appeal`, { method: "POST", body: JSON.stringify({}) });
export const deleteHikingPhoto = (id: string): Promise<{ removed: boolean }> => apiRequest(`/api/hiq/hiking/photos/${id}`, { method: "DELETE" });
