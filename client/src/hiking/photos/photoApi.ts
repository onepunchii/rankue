/**
 * 등산 — 산행 사진 올리기(2026-10-13). 규칙은 shared/hikingPhotos.
 *
 * 올리는 길: 파일 → 캔버스로 두 벌(긴 변 1600 · 썸네일 400) → POST /api/hiq/upload 두 번 → 받은 주소 둘을 POST /api/hiq/hiking/photos 로 적는다.
 * 캔버스로 다시 그리므로 사진의 위치 정보(EXIF · GPS)는 따라오지 않고, 서버가 한 번 더 걷는다. **좌표는 어디에도 보내지 않는다.**
 * 골프의 사진 코드(golf/lib/photoApi)를 가져다 쓰지 않는다 — 등산은 등산의 것으로.
 */
import { apiRequest } from "@/lib/queryClient";
import { HIKING_PHOTO_CATEGORY, HIKING_PHOTO_LONG, HIKING_THUMB_CATEGORY, HIKING_THUMB_LONG, type HikingPhoto } from "@shared/hikingPhotos";

export const myPhotosKey = (mountainId: string) => [`/api/hiq/hiking/me/photos?mountainId=${encodeURIComponent(mountainId)}`] as const;
export class HikingPhotoError extends Error {}

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

/** 한 장 올리기 — 끝나면 적힌 사진 */
export async function uploadHikingPhoto(mountainId: string, file: File): Promise<HikingPhoto> {
    if (!file.type.startsWith("image/") && !isHeic(file)) throw new HikingPhotoError("사진 파일을 골라 주세요.");
    const { img, done } = await loadImage(file);
    try {
        const big = encode(img, HIKING_PHOTO_LONG, 0.82), small = encode(img, HIKING_THUMB_LONG, 0.72);
        const [url, thumbUrl] = await Promise.all([putBlob(big.dataUrl, HIKING_PHOTO_CATEGORY), putBlob(small.dataUrl, HIKING_THUMB_CATEGORY)]);
        const r: { photo: HikingPhoto } = await apiRequest("/api/hiq/hiking/photos", { method: "POST", body: JSON.stringify({ mountainId, url, thumbUrl, width: big.width, height: big.height }) });
        return r.photo;
    } finally {
        done();
    }
}

export const deleteHikingPhoto = (id: string): Promise<{ removed: boolean }> => apiRequest(`/api/hiq/hiking/photos/${id}`, { method: "DELETE" });
