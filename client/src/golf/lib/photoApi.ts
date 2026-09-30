/**
 * 라운드 사진(2026-09-30) — 화면 쪽 한 곳: 줄이기·올리기·목록 훅·공개/삭제.
 *
 * 올리는 길: 파일 → 캔버스로 두 벌(원본 긴 변 1600 · 썸네일 400, webp) → POST /api/hiq/upload 두 번(Blob, 서버가 EXIF 한 번 더 걷음)
 *           → POST /api/hiq/golf/match/:id/photos 로 경기에 붙인다. 기본은 **비공개**(나와 동반자만).
 * 캔버스로 다시 그리면 EXIF(GPS 포함)는 원래 따라오지 않는다. iOS 웹뷰처럼 webp 인코딩이 없는 곳은 PNG 가 나와
 * 용량이 몇 배가 되므로 JPEG 로 다시 뽑는다.
 *
 * 캐시 키는 앞자리 "golf-photos" 하나 — 차단하면 골프장 페이지·앨범·사진첩이 한 번에 다시 받는다(ReportDialog invalidateAfterBlock).
 */
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { kstDateKey } from "@/lib/kst";
import {
    GOLF_PHOTO_CATEGORY, GOLF_THUMB_CATEGORY, GOLF_PHOTO_LONG_SIDE, GOLF_PHOTO_QUALITY, GOLF_THUMB_LONG_SIDE, GOLF_THUMB_QUALITY,
    GOLF_PHOTO_MAX_RAW_BYTES, COURSE_GALLERY_LIMIT,
} from "@shared/golfPhoto";

export interface AlbumPhoto {
    id: string;
    sessionId: string;
    memberId: string;
    uploaderName: string;
    holeNo: number | null;
    url: string;
    thumbUrl: string;
    width: number | null;
    height: number | null;
    isPublic: boolean;
    hasCoursePage: boolean;
    /** 공개 사진이 붙는 골프장 페이지 슬러그·경기 골프장 이름·라운드 날(ISO) — 뷰어의 맥락 줄과 '보러 가기'.
     *  2026-09-30 v2 에 붙었다 — 기기에 남은 옛 캐시엔 없을 수 있어 선택으로 둔다 */
    courseSlug?: string | null;
    courseName?: string | null;
    playedAt?: string;
    hidden: boolean;
    /** 지금 가림에 이의제기를 냈나 */
    appealed: boolean;
    mine: boolean;
    createdAt: string;
}
export interface MinePhoto extends AlbumPhoto { courseName: string | null; playedAt: string }
export interface CoursePhoto { id: string; memberId: string; credit: string; month: string; url: string; thumbUrl: string; width: number | null; height: number | null }
export interface SessionPhotos { photos: AlbumPhoto[]; mineCount: number; max: number }

export const PHOTO_KEY = "golf-photos";
/**
 * 키 끝에 **보는 사람 id** — 응답이 사람마다 다르다(내 사진 표시·가려진 내 사진·차단 필터). 캐시는 localStorage 에 7일 남고
 * 로그아웃해도 지워지지 않아서, 한 폰에서 계정을 바꾸면 앞사람의 '내 사진' 단추가 뜰 뻔했다. 무효화는 앞자리 하나로.
 */
export const photoKeys = {
    all: [PHOTO_KEY] as const,
    session: (id: string, viewer: string) => [PHOTO_KEY, "session", id, viewer] as const,
    mine: (viewer: string) => [PHOTO_KEY, "mine", viewer] as const,
    course: (slug: string, viewer: string) => [PHOTO_KEY, "course", slug, viewer] as const,
};
const useViewer = () => useAuth().member?.id ?? "guest";

export function useSessionPhotos(sessionId: string | null | undefined) {
    const viewer = useViewer();
    return useQuery<SessionPhotos>({
        queryKey: photoKeys.session(sessionId ?? "", viewer),
        queryFn: () => apiRequest(`/api/hiq/golf/match/${sessionId}/photos`),
        enabled: !!sessionId && viewer !== "guest",
        staleTime: 20_000,
    });
}

export function useMyPhotos(enabled = true) {
    const viewer = useViewer();
    return useQuery<MinePhoto[]>({
        queryKey: photoKeys.mine(viewer),
        queryFn: () => apiRequest("/api/hiq/golf/photos/mine"),
        enabled: enabled && viewer !== "guest",
        staleTime: 60_000,
    });
}

export function useCoursePhotos(slug: string | null | undefined) {
    const { member, isLoading } = useAuth();
    return useQuery<CoursePhoto[]>({
        queryKey: photoKeys.course(slug ?? "", member?.id ?? "guest"),
        queryFn: () => apiRequest(`/api/hiq/golf-courses/${encodeURIComponent(slug!)}/photos?limit=${COURSE_GALLERY_LIMIT}`),
        // 로그인 확인이 끝난 뒤에 — 확인 중에 받으면 차단 필터 없는 목록이 '로그아웃' 칸에 잘못 들어간다
        enabled: !!slug && !isLoading,
        staleTime: 60_000,
    });
}

/** 라운드 날 "9월 28일"(한국 날짜) — 앨범 뷰어의 맥락 줄. 골프장 페이지(누구나)는 달까지만 쓴다(photoMonthLabel) */
export function roundDayLabel(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const key = kstDateKey(iso);
    const [, m, d] = key.split("-").map(Number);
    return m && d ? `${m}월 ${d}일` : null;
}

/** 사진 하나를 바꾼 뒤 — 그 경기 앨범·사진첩·골프장 페이지를 다시 받는다 */
export function invalidatePhotos(qc: ReturnType<typeof useQueryClient>) {
    return qc.invalidateQueries({ queryKey: photoKeys.all });
}

export function useSetPhotoPublic() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
            apiRequest(`/api/hiq/golf/photos/${id}`, { method: "PATCH", body: { isPublic } }),
        // 누르자마자 앨범에서 바뀐 것처럼 — 실패하면 되돌린다
        onMutate: async ({ id, isPublic }) => {
            const snap = qc.getQueriesData<any>({ queryKey: photoKeys.all });
            qc.setQueriesData<any>({ queryKey: photoKeys.all }, (old: any) => patchPhoto(old, id, (p) => ({ ...p, isPublic })));
            return { snap };
        },
        onError: (_e, _v, ctx) => ctx?.snap.forEach(([k, v]) => qc.setQueryData(k, v)),
        onSettled: () => invalidatePhotos(qc),
    });
}

/** 가려진 내 사진 이의제기 — 원탭(커뮤니티와 같은 문구). 성공하면 그 자리에 '접수됨'이 뜬다 */
export function useAppealPhoto() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/golf/photos/${id}/appeal`, { method: "POST", body: { text: "이의제기합니다" } }),
        onSuccess: (_d, id) => { qc.setQueriesData<any>({ queryKey: photoKeys.all }, (old: any) => patchPhoto(old, id, (p) => ({ ...p, appealed: true }))); },
        onSettled: () => invalidatePhotos(qc),
    });
}

export function useDeletePhoto() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/golf/photos/${id}`, { method: "DELETE" }),
        onSuccess: (_d, id) => { qc.setQueriesData<any>({ queryKey: photoKeys.all }, (old: any) => patchPhoto(old, id, () => null)); },
        onSettled: () => invalidatePhotos(qc),
    });
}

/** 캐시 모양 셋(배열 · {photos}) 어디에 있든 그 사진 하나를 바꾸거나(null 이면) 뺀다 */
function patchPhoto(old: any, id: string, fn: (p: any) => any) {
    const map = (arr: any[]) => arr.map((p) => (p?.id === id ? fn(p) : p)).filter(Boolean);
    if (Array.isArray(old)) return map(old);
    if (old && Array.isArray(old.photos)) {
        const photos = map(old.photos);
        return { ...old, photos, mineCount: photos.filter((p: any) => p.mine).length };
    }
    return old;
}

// ── 줄이기·올리기 ──────────────────────────────────────────────────

export class PhotoError extends Error {}

/** HEIC·HEIF(아이폰·갤럭시 '고효율 사진') — 안드로이드 웹뷰(크롬)는 풀지 못한다. iOS 는 고를 때 JPEG 로 바꿔 준다 */
const isHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

function loadImage(file: File): Promise<{ img: HTMLImageElement; done: () => void }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve({ img, done: () => URL.revokeObjectURL(url) });
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new PhotoError(isHeic(file)
                ? "고효율(HEIC) 사진은 이 기기에서 열 수 없어요 · 카메라로 바로 찍거나 JPG 사진을 골라 주세요"
                : "이 사진은 열 수 없어요. 다른 사진을 골라 주세요"));
        };
        img.src = url;
    });
}

/** 긴 변을 longSide 로 줄여 webp(안 되면 JPEG) 데이터 주소로. 캔버스로 다시 그리므로 EXIF·GPS 는 따라오지 않는다 */
function encode(img: HTMLImageElement, longSide: number, quality: number) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const scale = Math.min(1, longSide / Math.max(w0, h0));
    const width = Math.max(1, Math.round(w0 * scale)), height = Math.max(1, Math.round(h0 * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PhotoError("사진을 줄이지 못했어요");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    let dataUrl = canvas.toDataURL("image/webp", quality);
    // webp 인코더가 없으면 PNG 를 돌려준다(iOS 웹뷰) — PNG 는 사진에서 몇 배 크다
    if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", quality);
    canvas.width = 0; canvas.height = 0; // 큰 캔버스 메모리를 바로 놓는다(휴대폰 웹뷰)
    return { dataUrl, width, height };
}

async function putBlob(dataUrl: string, category: string): Promise<string> {
    const r = await apiRequest("/api/hiq/upload", { method: "POST", body: { dataUrl, category } });
    const url = r?.url ?? r?.data?.url;
    if (!url) throw new PhotoError("사진을 올리지 못했어요");
    return url;
}

/** 한 장 올리기 — 끝나면 새 사진 id */
export async function uploadRoundPhoto(p: { sessionId: string; file: File; holeNo: number | null }): Promise<{ id: string; courseSlug: string | null }> {
    if (!p.file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(p.file.name)) throw new PhotoError("사진 파일만 올릴 수 있어요");
    if (p.file.size > GOLF_PHOTO_MAX_RAW_BYTES) throw new PhotoError(`사진이 너무 커요 (${Math.round(GOLF_PHOTO_MAX_RAW_BYTES / 1024 / 1024)}MB까지)`);
    const { img, done } = await loadImage(p.file);
    let big: ReturnType<typeof encode>, small: ReturnType<typeof encode>;
    try {
        big = encode(img, GOLF_PHOTO_LONG_SIDE, GOLF_PHOTO_QUALITY);
        small = encode(img, GOLF_THUMB_LONG_SIDE, GOLF_THUMB_QUALITY);
    } finally { done(); }
    const [url, thumbUrl] = await Promise.all([putBlob(big.dataUrl, GOLF_PHOTO_CATEGORY), putBlob(small.dataUrl, GOLF_THUMB_CATEGORY)]);
    return apiRequest(`/api/hiq/golf/match/${p.sessionId}/photos`, {
        method: "POST",
        body: { url, thumbUrl, width: big.width, height: big.height, holeNo: p.holeNo, isPublic: false },
    });
}
