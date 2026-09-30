/**
 * 경기 화면의 사진(2026-09-30 오너: "스코어 등록 시 사진 업로드 버튼").
 *
 *   머리의 📷 단추 → 사진 고르기(카메라·앨범) → 지금 적는 홀로 태그해 올린다. 방장이 아니어도 **자기 사진**은 올린다.
 *   머리 밑 작은 줄 → 이번 라운드 사진(최신부터). 누르면 전체 화면.
 *   방금 올린 사진 카드 → '골프장 페이지에 공개' 스위치(기본 꺼짐). 켜면 한 줄 안내.
 *
 * 화면에 셋을 따로 놓아야 해서(머리·줄·겹침) 훅이 조각 셋을 돌려준다. 머리 높이를 늘리지 않으려고 단추는 동그라미 하나다
 * (4명이 한 화면에 드는 점수판 — 2026-09-24 오너 요구).
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LucideCamera, LucideImage, LucideLoader2, LucideX, LucideGlobe, LucideLock } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useTermsGate } from "@/components/hiq/TermsConsent";
import { GOLF_PHOTO_MAX_PER_ROUND } from "@shared/golfPhoto";
import { useSessionPhotos, uploadRoundPhoto, useSetPhotoPublic, PHOTO_KEY, roundDayLabel, type AlbumPhoto } from "../../lib/photoApi";
import { PhotoViewer, PublicSwitch, FaceNotice, type ViewerPhoto } from "./PhotoViewer";

export const toViewer = (p: AlbumPhoto): ViewerPhoto => ({
    id: p.id, url: p.url, thumbUrl: p.thumbUrl, memberId: p.memberId, name: p.uploaderName, holeNo: p.holeNo,
    mine: p.mine, isPublic: p.isPublic, hasCoursePage: p.hasCoursePage, hidden: p.hidden, appealed: p.appealed,
    // 맥락 줄 — "동강시스타 CC · 7번 홀 · 9월 28일"(앨범은 참가자만 보니 날까지)
    courseName: p.courseName ?? null, courseSlug: p.courseSlug ?? null, dateLabel: roundDayLabel(p.playedAt ?? p.createdAt),
});

/**
 * 사진 올리기 한 벌 — 경기 화면·라운드 앨범이 같이 쓴다. pick(holeNo, "camera" | "gallery") 로 연다.
 * 한 장씩 차례로 올린다: 큰 사진 둘을 동시에 캔버스로 풀면 휴대폰 웹뷰가 메모리 부족으로 죽는다.
 *
 * 카메라(2026-09-30 오너: "갤러리밖에 안 된다 — 카메라가 먼저"): `capture="environment"` 가 붙은 입력은 바로 후면 카메라를 연다.
 *  - 안드로이드: 앱 1.2.0 Manifest 의 <queries> IMAGE_CAPTURE 덕에 카메라 앱이 뜬다(CAMERA 권한은 일부러 선언 안 함).
 *    그 전 앱(1.0.x)은 capture 를 모르고 파일 선택기로 떨어진다 — 그래도 사진은 올라간다.
 *  - iOS: Info.plist NSCameraUsageDescription 이 있어 바로 카메라. capture 가 없으면 iOS 는 '사진 보관함/사진 찍기' 시트를 띄운다.
 *  - 찍은 사진은 JPEG(수 MB) → 아래 uploadRoundPhoto 가 긴 변 1600px webp(안 되면 JPEG)·400px 썸네일로 줄여 올린다.
 *    EXIF 방향은 브라우저가 그릴 때 적용하고(이미지 방향 기본값 from-image), EXIF·GPS 는 캔버스를 거치며 빠진다.
 *  - ⚠️ 웹 카메라로 찍은 원본은 폰 앨범에 따로 저장되지 않는다(안드로이드 카메라 앱은 앱 캐시에, iOS 는 저장 안 함) —
 *    원본까지 폰에 남기려면 다음 앱 업데이트에 네이티브 카메라 플러그인(saveToGallery)이 필요하다.
 */
export function usePhotoUploader(sessionId: string | null | undefined) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const { data } = useSessionPhotos(sessionId);
    const max = data?.max ?? GOLF_PHOTO_MAX_PER_ROUND;
    const mineCount = data?.mineCount ?? 0;
    const [pending, setPending] = useState(0);
    const [fresh, setFresh] = useState<{ ids: string[]; hole: number | null; hasPage: boolean } | null>(null);
    const input = useRef<HTMLInputElement>(null);
    const cameraInput = useRef<HTMLInputElement>(null);
    const holeAtPick = useRef<number | null>(null);

    const { needsConsent, ask } = useTermsGate();

    const pick = (holeNo: number | null, source: "camera" | "gallery" = "gallery") => {
        if (!sessionId) return;
        // 사진도 UGC — 첫 사진이면 약관 동의부터(서버도 막는다). 파일 창은 누른 그 순간에만 열려서 동의 뒤 한 번 더 누르게 한다
        // (크루 사진첩과 같은 동선, CrewGalleryTab openPicker).
        if (needsConsent) {
            void ask().then((ok) => { if (ok) toast({ title: "동의했어요", description: "카메라를 한 번 더 눌러 주세요" }); });
            return;
        }
        if (mineCount + pending >= max) { toast({ title: `한 라운드에 ${max}장까지 올릴 수 있어요` }); return; }
        holeAtPick.current = holeNo;
        (source === "camera" ? cameraInput : input).current?.click();
    };

    const onFiles = async (files: FileList | null) => {
        if (!files?.length || !sessionId) return;
        const room = Math.max(0, max - mineCount - pending);
        const list = Array.from(files).slice(0, room);
        if (files.length > list.length) toast({ title: `한 라운드에 ${max}장까지 올릴 수 있어요`, description: `${list.length}장만 올릴게요` });
        if (!list.length) return;
        const hole = holeAtPick.current;
        setPending((n) => n + list.length);
        const ids: string[] = [];
        let hasPage = false;
        for (const file of list) {
            try {
                const r = await uploadRoundPhoto({ sessionId, file, holeNo: hole });
                ids.push(r.id);
                hasPage = hasPage || !!r.courseSlug;
            } catch (e: any) {
                toast({ variant: "destructive", title: e?.message || "사진을 올리지 못했어요" });
            } finally {
                setPending((n) => n - 1);
                void qc.invalidateQueries({ queryKey: [PHOTO_KEY, "session", sessionId] }); // 앞자리 — 키 끝의 보는 사람 id 와 무관하게
            }
        }
        if (ids.length) {
            setFresh({ ids, hole, hasPage });
            void qc.invalidateQueries({ queryKey: [PHOTO_KEY, "mine"] });
        }
    };

    const inputEl = (
        <>
            <input
                ref={input} type="file" accept="image/*" multiple className="hidden" aria-hidden tabIndex={-1}
                onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }}
            />
            {/* 카메라 — 한 장씩. multiple 과 같이 두면 일부 웹뷰가 capture 를 무시한다 */}
            <input
                ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1}
                onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }}
            />
        </>
    );
    // 카드의 자동 닫기 타이머가 이 함수에 걸려 있다 — 렌더마다 새 함수면 타이머가 계속 다시 시작해 안 닫힌다
    const clearFresh = useCallback(() => setFresh(null), []);
    return { pick, inputEl, pending, fresh, clearFresh, max, mineCount, photos: data?.photos ?? [] };
}

/** 방금 올린 사진 — 공개 스위치 한 줄(기본 비공개). 만지지 않으면 잠시 뒤 스스로 닫힌다 */
function FreshCard({ fresh, photos, onClose, bottom, onMore }: {
    fresh: { ids: string[]; hole: number | null; hasPage: boolean };
    photos: AlbumPhoto[];
    onClose: () => void;
    bottom: string;
    /** 한 장 더 찍기 — 같은 홀로 카메라를 다시 연다 */
    onMore?: () => void;
}) {
    const { toast } = useToast();
    const setPublic = useSetPhotoPublic();
    const mine = photos.filter((p) => fresh.ids.includes(p.id));
    const on = mine.length > 0 && mine.every((p) => p.isPublic);
    const [touched, setTouched] = useState(0);
    useEffect(() => {
        const t = setTimeout(onClose, touched ? 7000 : 9000);
        return () => clearTimeout(t);
    }, [touched, onClose]);
    const thumb = mine[mine.length - 1]?.thumbUrl;

    const toggle = async (v: boolean) => {
        setTouched((n) => n + 1);
        try {
            for (const p of mine) if (p.isPublic !== v) await setPublic.mutateAsync({ id: p.id, isPublic: v });
        } catch (e: any) { toast({ variant: "destructive", title: e?.message || "바꾸지 못했어요" }); }
    };

    return (
        <div className="fixed inset-x-0 z-[45] px-3" style={{ bottom }} role="status">
            <div className="max-w-md mx-auto rounded-2xl bg-[#1C1C1E] ring-1 ring-inset ring-[#FFFFFF1A] shadow-[0_12px_40px_rgba(0,0,0,0.5)] px-3.5 py-3" onPointerDown={() => setTouched((n) => n + 1)}>
                <div className="flex items-center gap-3">
                    <span className="shrink-0 w-11 h-11 rounded-xl overflow-hidden bg-[#FFFFFF14]">
                        {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold text-[#ffffff] truncate">
                            {fresh.hole ? `${fresh.hole}번 홀 ` : ""}사진{fresh.ids.length > 1 ? ` ${fresh.ids.length}장` : ""}을 올렸어요 📸
                        </span>
                        <span className="flex items-center gap-1 text-[12.5px] text-[#FFFFFF99]">
                            {on ? <LucideGlobe className="w-3.5 h-3.5 text-[#9BEF5C]" /> : <LucideLock className="w-3.5 h-3.5" />}
                            {fresh.hasPage ? (on ? "골프장 페이지에 공개" : "나와 동반자만 봐요") : "앨범에만 보여요"}
                        </span>
                    </span>
                    {onMore && (
                        <button type="button" onClick={() => { onClose(); onMore(); }} aria-label="한 장 더 찍기"
                            className="shrink-0 h-8 px-2.5 rounded-full bg-[#FFFFFF14] text-[12.5px] font-semibold text-[#ffffff] flex items-center gap-1 active:bg-[#FFFFFF24]">
                            <LucideCamera className="w-4 h-4" />한 장 더
                        </button>
                    )}
                    {fresh.hasPage && mine.length > 0 && <PublicSwitch on={on} busy={setPublic.isPending} onChange={toggle} label="골프장 페이지에 공개" />}
                    <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-[#FFFFFF80] active:bg-[#FFFFFF14]">
                        <LucideX weight="bold" className="w-4 h-4" />
                    </button>
                </div>
                {on && <FaceNotice className="mt-2" />}
            </div>
        </div>
    );
}

/**
 * 경기 화면용. holeNo = 지금 적는 홀(1~18). freshBottom = 방금 올린 사진 카드를 띄울 높이(아래 단추 줄 위).
 * 돌려주는 것: button(머리에), strip(머리 밑에), overlay(화면 끝에 — 고르기 창·카드·전체 화면).
 */
export function useRoundPhotos(sessionId: string | null | undefined, holeNo: number | null, freshBottom: string) {
    const up = usePhotoUploader(sessionId);
    const [viewer, setViewer] = useState<number | null>(null);
    const viewerPhotos = useMemo(() => up.photos.map(toViewer), [up.photos]);
    const total = up.photos.length;

    const button = (
        <button
            type="button" onClick={() => up.pick(holeNo, "camera")} aria-label={`사진 찍기${total ? ` (이번 라운드 ${total}장)` : ""}`}
            className="relative shrink-0 w-9 h-9 rounded-full bg-[#FFFFFF0F] text-[#FFFFFFCC] flex items-center justify-center active:bg-[#FFFFFF1F]"
        >
            {up.pending > 0 ? <LucideLoader2 className="w-[18px] h-[18px] animate-spin text-[#9BEF5C]" /> : <LucideCamera className="w-[19px] h-[19px]" />}
            {total > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#64DD17] text-[#051907] text-[11px] font-bold leading-[18px] text-center tabular-nums">{total}</span>
            )}
        </button>
    );

    // 최신부터 — 앨범 순서(찍은 순서)와 반대라 전체 화면 번호를 뒤집어 연다
    const strip = total + up.pending > 0 ? (
        <div className="px-4 pt-3">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide" aria-label="이번 라운드 사진">
                {/* 앨범에서 고르기 — 경기 중엔 카메라가 먼저(머리 📷), 미리 찍어 둔 사진은 여기서 */}
                <button type="button" onClick={() => up.pick(holeNo, "gallery")} aria-label="앨범에서 사진 고르기"
                    className="shrink-0 w-11 h-11 rounded-xl border border-dashed border-[#FFFFFF33] text-[#FFFFFFB3] flex flex-col items-center justify-center gap-0.5 active:bg-[#FFFFFF0F]">
                    <LucideImage className="w-4 h-4" />
                    <span className="text-[10px] font-semibold leading-none">앨범</span>
                </button>
                {Array.from({ length: up.pending }, (_, i) => (
                    <span key={`p${i}`} className="shrink-0 w-11 h-11 rounded-xl bg-[#FFFFFF0F] flex items-center justify-center">
                        <LucideLoader2 className="w-4 h-4 animate-spin text-[#FFFFFF80]" />
                    </span>
                ))}
                {[...up.photos].reverse().map((p, i) => (
                    <button
                        key={p.id} type="button" onClick={() => setViewer(total - 1 - i)}
                        aria-label={`${p.holeNo ? `${p.holeNo}번 홀 ` : ""}사진 보기`}
                        className={cn("relative shrink-0 w-11 h-11 rounded-xl overflow-hidden ring-1 ring-inset", p.holeNo === holeNo ? "ring-[#64DD17]" : "ring-[#FFFFFF14]")}
                    >
                        <img src={p.thumbUrl} alt="" loading="lazy" className={cn("w-full h-full object-cover", p.hidden && "opacity-50")} />
                        {p.isPublic && <span aria-hidden className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-[#9BEF5C] ring-2 ring-[#000000]" />}
                    </button>
                ))}
            </div>
        </div>
    ) : null;

    const overlay = (
        <>
            {up.inputEl}
            {up.fresh && <FreshCard fresh={up.fresh} photos={up.photos} onClose={up.clearFresh} bottom={freshBottom} onMore={() => up.pick(up.fresh?.hole ?? holeNo, "camera")} />}
            <PhotoViewer photos={viewerPhotos} index={viewer} onClose={() => setViewer(null)} />
        </>
    );
    return { button, strip, overlay };
}
