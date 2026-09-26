import { useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { uploadImage } from "@/lib/imageUtils";
import { useToast } from "@/hooks/use-toast";
import { LucideImage, LucideImagePlus, LucideLoader2, LucideMessageSquare } from "@/lib/icons";
import { PhotoDetailDialog } from "@/components/hiq/PhotoDetailDialog";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useTermsGate } from "@/components/hiq/TermsConsent";
import { CREW_BTN, CrewEmpty, CrewError, CrewTabHeader } from "@/components/hiq/crew-ui";
import { CREW_PHOTOS_FIRST_PAGE, nextCrewCursor } from "@shared/crewBoard";
import { photosKey, num } from "@/components/hiq/crew-board/postCache";

interface PhotoAuthor {
    name: string;
    profileImageUrl?: string;
}

interface Photo {
    id: string;
    crewId: string;
    uploaderId: string;
    url: string;
    caption?: string | null;
    createdAt: string;
    author?: PhotoAuthor;
    likeCount: number;
    commentCount: number;
    isLiked: boolean;
}

interface CrewGalleryTabProps {
    crewId: string;
    isMember: boolean;
    isAdmin: boolean;
    currentMemberId?: string;
}

const MORE_PAGE = 30;
/** 사진 격자 — 3칸, 2px 틈, 묶음 바깥만 둥글게 */
const GRID = "grid grid-cols-3 gap-0.5 rounded-tile overflow-hidden";
// 한 번에 고를 수 있는 장수 — 한 장씩 차례로 올리므로 너무 많으면 오래 걸린다.
const MAX_BATCH = 10;
// 사진첩은 크게 보는 곳이라 글 사진과 같은 1600px·q0.8(WebP 수백 KB, 업로드 상한 8MB 안).
const ALBUM_IMAGE_OPTS = { maxSize: 1600, quality: 0.8 };

export function CrewGalleryTab({ crewId, isMember, isAdmin, currentMemberId }: CrewGalleryTabProps) {
    const { toast } = useToast();
    const { t } = useT();
    const { needsConsent, ask } = useTermsGate();
    const fileRef = useRef<HTMLInputElement>(null);
    // id 만 들고 목록 캐시에서 다시 찾는다 — 스냅숏이면 좋아요·댓글 수가 굳는다.
    const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
    // 올리는 중: 끝낸 장수/전체 — 자리 표시 타일과 "2/5" 진행을 그린다.
    const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);

    // 쪽 나누기 — 첫 쪽 CREW_PHOTOS_FIRST_PAGE 장, '더 보기' 는 커서로 이어 받는다.
    // 열쇠 끝의 "album": 예전 배열 캐시(localStorage 에 남은 것)와 모양이 달라 섞이지 않게.
    const photosQuery = useInfiniteQuery({
        queryKey: [photosKey(crewId), "album"],
        queryFn: ({ pageParam, signal }) => apiRequest(
            pageParam
                ? `${photosKey(crewId)}?before=${encodeURIComponent(String(pageParam))}&limit=${MORE_PAGE}`
                : photosKey(crewId),
            { signal },
        ) as Promise<Photo[]>,
        initialPageParam: null as string | null,
        getNextPageParam: (last: Photo[], pages) => nextCrewCursor(last ?? [], pages.length === 1 ? CREW_PHOTOS_FIRST_PAGE : MORE_PAGE),
        enabled: !!crewId,
    });
    const photos = useMemo(() => {
        const seen = new Set<string>();
        return ((photosQuery.data?.pages ?? []).flat() as Photo[]).filter((p) => p?.id && !seen.has(p.id) && seen.add(p.id));
    }, [photosQuery.data]);

    const openPicker = () => {
        // 첫 사진이면 약관 동의부터(감사 S4). 파일 선택 창은 사용자가 누른 그 순간에만 열려서
        // 동의 뒤 자동으로 열 수 없다 — 동의했다고 알리고 한 번 더 누르게 한다.
        if (needsConsent) {
            void ask().then((ok) => { if (ok) toast({ title: t("terms.accepted"), description: t("terms.retryDesc") }); });
            return;
        }
        fileRef.current?.click();
    };

    // 여러 장 — 한 장씩 차례로(압축 → 파일 올리기 → 사진첩 행). 한 장이 실패해도 나머지는 계속하고
    // 끝에 결과를 한 번만 알린다. 예전엔 한 장만 고를 수 있었다.
    const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const all = Array.from(e.target.files ?? []);
        e.target.value = "";
        const images = all.filter((f) => f.type.startsWith("image/"));
        if (images.length < all.length) {
            toast({ title: t("crewGallery.invalidTypeTitle"), description: t("crewGallery.invalidTypeDesc"), variant: "destructive" });
        }
        if (images.length === 0) return;
        if (images.length > MAX_BATCH) toast({ title: t("crewAlbum.batchLimit").replace("{n}", String(MAX_BATCH)) });
        const batch = images.slice(0, MAX_BATCH);

        setUpload({ done: 0, total: batch.length });
        let ok = 0;
        for (let i = 0; i < batch.length; i++) {
            try {
                const url = await uploadImage(batch[i], "crew-photo", ALBUM_IMAGE_OPTS);
                await apiRequest(`/api/hiq/crews/${crewId}/photos`, { method: "POST", body: { url } });
                ok++;
            } catch (err) {
                console.error("[CrewGalleryTab] upload failed:", err);
            }
            setUpload({ done: i + 1, total: batch.length });
        }
        setUpload(null);
        await queryClient.invalidateQueries({ queryKey: [photosKey(crewId)] });
        const failed = batch.length - ok;
        if (failed === 0) toast({ title: t("crewAlbum.uploaded").replace("{n}", String(ok)) });
        else toast({
            title: ok > 0 ? t("crewAlbum.uploadedPartial").replace("{ok}", String(ok)).replace("{fail}", String(failed)) : t("crewGallery.uploadFailedTitle"),
            description: t("crewGallery.uploadFailedDesc"),
            variant: "destructive",
        });
    };

    const handlePhotoClick = (photo: Photo) => {
        if (!isMember) {
            toast({ title: t("crewGallery.accessDeniedTitle"), description: t("crewGallery.accessDeniedDesc"), variant: "destructive" });
            return;
        }
        setSelectedPhotoId(photo.id);
    };

    const pending = upload ? upload.total - upload.done : 0;

    // 달마다 묶기(올린 시각 기준, 이 기기 시간대 — 한국 사용자가 대부분이라 KST 와 같다)
    const { locale } = useT();
    const months = useMemo(() => {
        const fmt = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" });
        const out: { key: string; label: string; photos: Photo[] }[] = [];
        for (const p of photos) {
            const d = new Date(p.createdAt);
            const key = Number.isNaN(d.getTime()) ? "?" : `${d.getFullYear()}-${d.getMonth()}`;
            let g = out[out.length - 1];
            if (!g || g.key !== key) { g = { key, label: key === "?" ? "" : fmt.format(d), photos: [] }; out.push(g); }
            g.photos.push(p);
        }
        return out;
    }, [photos, locale]);

    return (
        <div className="min-h-full pb-nav flex flex-col">
            {/* 머리: 사진첩 n …… [+ 사진 올리기] — 다른 탭과 같은 한 줄 머리(2026-09-26 크루 안쪽 정리) */}
            <CrewTabHeader title={t("crewGallery.title")} count={photos.length > 0 ? photos.length : undefined}>
                {isMember && (
                    <>
                        <input
                            ref={fileRef}
                            type="file"
                            title={t("crewGallery.uploadInputTitle")}
                            aria-label={t("crewGallery.uploadInputTitle")}
                            className="hidden"
                            accept="image/*"
                            multiple
                            onChange={handleFiles}
                            disabled={!!upload}
                        />
                        <button type="button" onClick={openPicker} disabled={!!upload} className={CREW_BTN.add}>
                            {upload ? <LucideLoader2 className="animate-spin" /> : <LucideImagePlus />}
                            {upload ? <span className="rk-num">{upload.done}/{upload.total}</span> : t("crewGallery.upload")}
                        </button>
                    </>
                )}
            </CrewTabHeader>
            <div className="px-4 flex flex-col gap-3">

            {photosQuery.isLoading ? (
                <div className={GRID} aria-busy="true">
                    {Array.from({ length: 9 }).map((_, i) => <div key={i} className="aspect-square bg-surface-3 animate-pulse" />)}
                </div>
            ) : photosQuery.isError && photos.length === 0 ? (
                // 불러오기 실패를 '사진이 없어요' 로 보이지 않는다
                <CrewError onRetry={() => void photosQuery.refetch()} />
            ) : photos.length > 0 || pending > 0 ? (
                <>
                    {/* 올리는 중인 사진 자리 */}
                    {pending > 0 && (
                        <div className={GRID}>
                            {Array.from({ length: pending }, (_, i) => (
                                <div key={`pending-${i}`} className="aspect-square bg-surface-3 animate-pulse flex items-center justify-center" aria-hidden="true">
                                    <LucideLoader2 className="w-5 h-5 text-ink-3 animate-spin" />
                                </div>
                            ))}
                        </div>
                    )}
                    {/* 달마다 묶고, 그 달 첫 사진은 크게(2×2) — 같은 크기 네모만 이어지던 격자를 앨범처럼(2026-09-26 크루 안쪽 정리).
                        칸 사이 2px, 모서리는 묶음 바깥만 둥글게 — 칸마다 둥근 모서리·넓은 틈은 사진을 작게 보이게 했다. */}
                    {months.map((m) => (
                        <section key={m.key} aria-label={m.label} className="flex flex-col gap-2">
                            <header className="flex items-baseline justify-between">
                                <h3 className="text-[15px] font-semibold text-ink-1">{m.label}</h3>
                                <span className="text-[12px] font-medium text-ink-3 rk-num">{t("crewAlbum.countSuffix").replace("{n}", String(m.photos.length))}</span>
                            </header>
                            <div className={GRID} aria-label={t("crewGallery.gridAria")}>
                                {m.photos.map((photo, i) => (
                                    <button
                                        key={photo.id}
                                        type="button"
                                        onClick={() => handlePhotoClick(photo)}
                                        aria-label={`${t("crewGallery.photoDetailAria")} - ${photo.author?.name || t("crewGallery.anonymous")}`}
                                        className={cn(
                                            "relative aspect-square overflow-hidden bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
                                            i === 0 && m.photos.length >= 3 && "col-span-2 row-span-2",
                                        )}
                                    >
                                        <img
                                            src={photo.url}
                                            className="w-full h-full object-cover"
                                            alt={photo.caption || (photo.author ? photo.author.name + t("crewGallery.photoBySuffix") : t("crewGallery.crewPhotoAlt"))}
                                            loading="lazy"
                                        />
                                        {i === 0 && m.photos.length >= 3 && photo.caption && (
                                            <span className="absolute left-2 bottom-2 max-w-[80%] truncate rounded-pill bg-black/55 text-white text-[12px] font-semibold px-2.5 py-1">{photo.caption}</span>
                                        )}
                                        {num(photo.commentCount) > 0 && (
                                            <span className="absolute right-1.5 bottom-1.5 rk-chip rk-num bg-surface-1 text-ink-2 px-2 py-1">
                                                <LucideMessageSquare className="w-3 h-3" />{num(photo.commentCount)}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                    {photosQuery.isFetchNextPageError && <CrewError onRetry={() => void photosQuery.fetchNextPage()} />}
                    {photosQuery.hasNextPage && !photosQuery.isFetchNextPageError && (
                        <button
                            type="button"
                            onClick={() => void photosQuery.fetchNextPage()}
                            disabled={photosQuery.isFetchingNextPage}
                            className={cn(CREW_BTN.secondary, "w-full")}
                        >
                            {photosQuery.isFetchingNextPage && <LucideLoader2 className="w-4 h-4 animate-spin" />}
                            {t("crewPost.loadMore")}
                        </button>
                    )}
                </>
            ) : (
                <CrewEmpty
                    icon={<LucideImage />}
                    title={t("crewGallery.emptyTitle")}
                    desc={t("crewGallery.emptyDesc")}
                    action={isMember ? { label: t("crewGallery.upload"), onClick: openPicker } : undefined}
                />
            )}

            </div>

            {/* 사진 크게 보기 — 좌우로 넘기면 이웃 사진 */}
            <PhotoDetailDialog
                open={!!selectedPhotoId && photos.some((p) => p.id === selectedPhotoId)}
                onOpenChange={(o) => { if (!o) setSelectedPhotoId(null); }}
                photo={photos.find(p => p.id === selectedPhotoId) ?? null}
                photos={photos}
                onNavigate={setSelectedPhotoId}
                isAdmin={isAdmin}
                currentMemberId={currentMemberId}
            />
        </div>
    );
}
