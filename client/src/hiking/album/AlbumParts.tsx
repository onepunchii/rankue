/**
 * 내 사진첩의 조각(2026-10-13) — 사진 한 칸 · 사진 판(눌러서 크게 보기) · 도장첩 책장의 입구 · 도장첩 칸에 놓는 사진.
 *
 * 사진첩은 **보는 곳**이다: 올리기 · 공개/비공개 · 지우기 · 이의제기는 산 화면(photos/MyPhotos)에만 있고, 여기서는 그리로 가는 길만 둔다.
 * 내 사진만 그린다 — 남이 무엇을 올렸는지는 여기 없다. 비공개 사진에는 작은 자물쇠, 가려진 사진에는 '가려짐'(산 화면과 같은 표시).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useCallback, useState } from "react";
import { Link } from "wouter";
import { LucideChevronRight, LucideImage, LucideLock } from "@/lib/icons";
import { HIKING_ALBUM_LABEL, HIKING_ALBUM_PATH, albumCountLine, albumThumbs, hikingAlbumMountainPath, type AlbumSlot } from "@shared/hikingAlbum";
import { hikingMountainPath } from "@shared/hikingMountains";
import { HIKING_PHOTOS_ANCHOR, HIKING_PHOTO_LABEL, type HikingPhoto } from "@shared/hikingPhotos";
import { stampDate } from "../lib/date";
import { PhotoStage } from "../photos/PhotoStage";
import { useHikingAlbum } from "./useHikingAlbum";

/** 그 산의 화면에서 내 사진 구역 — 올리기 · 공개/비공개 · 지우기가 있는 곳 */
export const mountainPhotosPath = (slug: string) => `${hikingMountainPath(slug)}#${HIKING_PHOTOS_ANCHOR}`;
const stateText = (p: HikingPhoto) => (p.hidden ? "가려짐" : p.isPublic ? HIKING_PHOTO_LABEL.public : HIKING_PHOTO_LABEL.private);

/** 지금 상태 — 가려진 사진은 글로, 비공개 사진은 작은 자물쇠로. 공개 사진에는 아무것도 붙이지 않는다(산 화면의 내 사진과 같다) */
export function PhotoState({ photo }: { photo: Pick<HikingPhoto, "hidden" | "isPublic"> }) {
    if (photo.hidden) return <span className="absolute left-1 top-1 rounded-full bg-[#0B1F26D9] px-1.5 py-0.5 text-[12px] leading-tight text-[#FF9C8A]">가려짐</span>;
    if (photo.isPublic) return null;
    return <span className="absolute left-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#0B1F26D9] text-[#F6D9A8]" data-testid="hk-album-lock"><LucideLock weight="fill" className="h-3 w-3" aria-hidden /></span>;
}

/**
 * 사진 판 — 세 칸씩. 누르면 크게 보기(photos/PhotoStage)가 열린다. 보기만 한다.
 * seeMountain 은 여러 산의 사진이 섞인 판(전체 보기)에서 — 그 산의 사진만 모아 보는 길을 같이 둔다.
 */
export function AlbumPhotoGrid({ photos, mountainOf, seeMountain }: {
    photos: readonly HikingPhoto[];
    mountainOf: (mountainId: string) => { name: string; slug: string } | undefined;
    seeMountain?: boolean;
}) {
    // 열어 둔 사진은 id 로 기억한다 — 목록이 다시 와도 같은 사진을 가리킨다
    const [openId, setOpenId] = useState<string | null>(null);
    const close = useCallback(() => setOpenId(null), []);
    const at = openId ? photos.findIndex((p) => p.id === openId) : -1;
    const open = at >= 0 ? photos[at] : null;
    const m = open ? mountainOf(open.mountainId) : undefined;
    const link = "flex h-10 items-center rounded-full bg-[#FFFFFF14] px-3.5 text-[13.5px] text-[#F4EFE3] active:bg-[#FFFFFF24]";
    return (
        <>
            <ul className="grid grid-cols-3 gap-1.5" data-testid="hk-album-grid" data-count={photos.length}>
                {photos.map((p) => (
                    <li key={`album:${p.id}`} className="min-w-0">
                        <button type="button" onClick={() => setOpenId(p.id)} data-testid={`hk-album-photo-${p.id}`} data-track-as="hiking-album-photo" data-public={p.isPublic ? "1" : "0"} data-hidden={p.hidden ? "1" : "0"}
                            aria-label={`${mountainOf(p.mountainId)?.name ?? "산행"} 사진 크게 보기 · ${stampDate(p.takenAt)} · ${stateText(p)}`}
                            className="relative block aspect-square w-full overflow-hidden rounded-xl bg-[#FFFFFF0F] active:opacity-80">
                            <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" draggable={false} className={`h-full w-full object-cover ${p.hidden ? "opacity-50" : ""}`} />
                            <PhotoState photo={p} />
                        </button>
                    </li>
                ))}
            </ul>
            {open && (
                <PhotoStage photos={photos} index={at} onIndex={(i) => setOpenId(photos[i]?.id ?? null)} onClose={close} label={`${m?.name ?? "산행"} 내 사진첩`}>
                    <p className="truncate text-[15px] font-semibold text-[#F4EFE3]" data-testid="hk-album-open-name">{m?.name ?? ""}</p>
                    <p className="mt-0.5 text-[13px] text-[#F4EFE399]">내 사진 · {stampDate(open.takenAt)} · {stateText(open)}</p>
                    {open.hidden && <p className="mt-2 text-[13px] leading-snug text-[#FFD3C9] break-keep">{open.appealed ? HIKING_PHOTO_LABEL.appealed : HIKING_PHOTO_LABEL.hidden}</p>}
                    {m && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {seeMountain && <Link href={hikingAlbumMountainPath(m.slug)} className={link} data-testid="hk-album-open-mountain" data-track-as="hiking-album-open-mountain">{HIKING_ALBUM_LABEL.seeMountain}</Link>}
                            <Link href={mountainPhotosPath(m.slug)} className={link} data-testid="hk-album-open-manage" data-track-as="hiking-album-open-manage">{HIKING_ALBUM_LABEL.manage}</Link>
                        </div>
                    )}
                </PhotoStage>
            )}
        </>
    );
}

/**
 * 사진첩의 입구 — 도장첩 책장 · 배낭에 놓는다. 사진이 있으면 최근 석 장과 수를, 없으면 한 줄만.
 * 등산을 쓸 수 있는 회원에게만 그린다(그 밖의 사람에게는 아무것도 없다).
 */
export function AlbumEntry({ from, className }: { from: "shelf" | "pack"; className?: string }) {
    const { mine, album } = useHikingAlbum();
    if (!mine) return null;
    const thumbs = album ? albumThumbs(album, 3) : [];
    const has = !!album && album.total > 0;
    return (
        <Link href={HIKING_ALBUM_PATH} data-testid="hk-album-entry" data-track-as={`hiking-album-entry-${from}`} data-count={album?.total ?? 0}
            className={`flex min-h-[64px] items-center gap-3 rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF0A] px-3.5 py-3 active:bg-[#FFFFFF14] ${className ?? ""}`}>
            {thumbs.length > 0 ? (
                <span className="flex shrink-0 items-center" aria-hidden>
                    {thumbs.map((p, i) => (
                        <img key={`entry:${p.id}`} src={p.thumbUrl} alt="" width={40} height={40} loading="lazy" decoding="async" draggable={false}
                            className={`h-10 w-10 rounded-[10px] object-cover ${i > 0 ? "-ml-3" : ""}`} style={{ boxShadow: "0 0 0 2px #0E2A33", zIndex: thumbs.length - i, position: "relative" }} />
                    ))}
                </span>
            ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#F28C6A24] text-[#F28C6A]" aria-hidden><LucideImage className="h-5 w-5" /></span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15.5px] font-semibold text-[#F4EFE3]">{HIKING_ALBUM_LABEL.title}</span>
                <span className="mt-0.5 block truncate text-[12.5px] tabular-nums text-[#F4EFE399]">{has ? albumCountLine(album.mountains.length, album.total) : HIKING_ALBUM_LABEL.entryEmpty}</span>
            </span>
            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F6D9A8]" aria-hidden />
        </Link>
    );
}

/**
 * 도장첩의 칸에 놓는 사진 — 정상 도장과 같은 자리 · 같은 비율(100:124)에, 종이 위에 붙인 인화지처럼 흰 테를 두른다.
 * 여러 장이면 오른쪽 아래에 수를 적는다.
 */
export function SlotPhoto({ slot, tilt = 0 }: { slot: AlbumSlot; tilt?: number }) {
    return (
        <div className="relative rounded-[8px] bg-[#FFFFFF]" data-slot-photo="1"
            style={{ aspectRatio: "100 / 124", boxShadow: "0 2px 6px #0E2A3340", transform: tilt ? `rotate(${tilt}deg)` : undefined }}>
            <img src={slot.cover.thumbUrl} alt="" loading="lazy" decoding="async" draggable={false}
                className={`absolute inset-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] rounded-[6px] bg-[#0E2A331F] object-cover ${slot.cover.hidden ? "opacity-50" : ""}`} />
            {slot.count > 1 && <span className="absolute bottom-1.5 right-1.5 rounded-full bg-[#0B1F26D9] px-1.5 py-0.5 text-[12px] tabular-nums leading-tight text-[#F4EFE3]">{slot.count}</span>}
        </div>
    );
}
