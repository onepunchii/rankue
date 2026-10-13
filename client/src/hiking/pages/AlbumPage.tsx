/**
 * /hiking/album — 내 사진첩(2026-10-13 오너: "도장첩에 사진첩 버튼이 있어서 … 사진첩이 있으면 내가 사진으로 해당 산을 볼 수 있어야 되지 않을까").
 *
 * 산마다 들어가야 보이던 내 산행 사진을 한 곳에 모은다. 도장첩 책장 · 도장첩 한 권 · 배낭에서 들어온다.
 *   산마다(기본)  산 한 곳이 한 권 — 가장 새 사진이 표지, 산 이름 · 높이 · 사진 수 · 마지막으로 올린 날. 누르면 그 산의 사진이 펼쳐진다.
 *   전체          모든 사진을 새 것부터, 달마다("2026년 10월").
 *   ?m=<산의 주소>  그 산의 사진만 — 주소에 두어 뒤로 가기 · 링크가 된다(도장첩의 칸이 여기로 온다).
 * **보는 곳이다.** 올리기 · 공개/비공개 · 지우기 · 이의제기는 산 화면에 그대로 있고(photos/MyPhotos), 여기서는 그리로 가는 길만 둔다.
 * 내 사진만 모인다(비공개 · 가려진 것까지) — 남이 무엇을 했는지는 이 화면에 없다. 좌표도 없다(shared/hikingAlbum).
 * 등산을 쓸 수 있는 회원의 화면이다 — 검색용 화면 · 사이트맵에 싣지 않는다. 그 밖의 사람에게는 가입 안내만.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronRight } from "@/lib/icons";
import {
    HIKING_ALBUM_LABEL, HIKING_ALBUM_PATH, albumAllPhotos, albumCountLine, albumCover, albumMonths, albumPhotoCount, hikingAlbumMountainPath,
    type HikingAlbum, type HikingAlbumMountain,
} from "@shared/hikingAlbum";
import { HIKING_HUB_PATH, duplicateNames, heightText, mountainLabel } from "@shared/hikingMountains";
import { AlbumPhotoGrid, mountainPhotosPath } from "../album/AlbumParts";
import { useHikingAlbum } from "../album/useHikingAlbum";
import { HikingShell, HkSkel } from "../components/HikingShell";
import { HikingCta } from "../components/MountainParts";
import { stampDate } from "../lib/date";
import { HIKING_STAMPS_PATH } from "../stamps/StampParts";
import { HIKING_ALBUM_COVER, HIKING_ALBUM_EMPTY } from "../theme";

type AlbumView = "mountains" | "all";
const coral = "inline-flex h-11 items-center rounded-full bg-[#F28C6A] px-5 text-[14.5px] font-semibold text-[#2A1208] active:bg-[#E67C59]";
const quiet = "flex h-12 w-full items-center justify-center gap-1 rounded-xl bg-[#FFFFFF14] px-3 text-[14.5px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]";

/** 산 한 곳의 한 줄 — "1,708m · 사진 12장 · 최근 2026.10.03" */
const mountainFacts = (m: HikingAlbumMountain, withDate: boolean) =>
    [heightText(m.heightM), albumPhotoCount(m.count), withDate && stampDate(m.latestAt) ? `최근 ${stampDate(m.latestAt)}` : ""].filter(Boolean).join(" · ");

/** 산마다 — 표지의 판. 두 칸씩(넓은 화면은 세 칸) */
function MountainCovers({ album, labelOf }: { album: HikingAlbum; labelOf: (m: HikingAlbumMountain) => string }) {
    return (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-6 pt-3 sm:grid-cols-3" data-testid="hk-album-mountains" data-count={album.mountains.length}>
            {album.mountains.map((m) => {
                const cover = albumCover(m.photos);
                const label = labelOf(m);
                return (
                    <li key={`mt:${m.mountainId}`} className="min-w-0">
                        <Link href={hikingAlbumMountainPath(m.slug)} className="block active:opacity-80" data-testid={`hk-album-mt-${m.slug}`} data-track-as="hiking-album-mountain"
                            aria-label={`${label} 사진첩 열기 · ${albumPhotoCount(m.count)}`}>
                            {/* 여러 장이면 뒤에 겹친 장이 살짝 보인다 */}
                            <span className="relative block aspect-square overflow-hidden rounded-2xl bg-[#FFFFFF0F]" style={{ boxShadow: m.count > 1 ? "0 -5px 0 -2px #1F5560, 0 -10px 0 -5px #1F556099" : undefined }}>
                                {cover && <img src={cover.thumbUrl} alt="" loading="lazy" decoding="async" draggable={false} className={`h-full w-full object-cover ${cover.hidden ? "opacity-50" : ""}`} />}
                            </span>
                            <span className="mt-2 block truncate text-[15px] font-semibold text-[#F4EFE3]">{label}</span>
                            <span className="mt-0.5 block truncate text-[12.5px] tabular-nums text-[#F4EFE399]">{mountainFacts(m, false)}</span>
                            <span className="block truncate text-[12px] tabular-nums text-[#F4EFE373]">{stampDate(m.latestAt)}</span>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}

/** 전체 — 모든 사진을 새 것부터, 달마다. 크게 보기는 그 달의 사진 안에서 넘긴다 */
function AllPhotos({ album, labelOf }: { album: HikingAlbum; labelOf: (m: HikingAlbumMountain) => string }) {
    const months = useMemo(() => albumMonths(albumAllPhotos(album)), [album]);
    const by = useMemo(() => new Map(album.mountains.map((m) => [m.mountainId, { name: labelOf(m), slug: m.slug }])), [album, labelOf]);
    const mountainOf = (id: string) => by.get(id);
    return (
        <div data-testid="hk-album-all">
            {months.map((g) => (
                <section key={`month:${g.month}`} className="pt-6 first:pt-1" data-month={g.month}>
                    <div className="mb-2.5 flex items-baseline justify-between gap-3">
                        <h2 className="text-[16px] font-semibold tracking-tight text-[#F4EFE3]">{g.month}</h2>
                        <span className="shrink-0 text-[12.5px] tabular-nums text-[#F4EFE38C]">{g.photos.length.toLocaleString("en-US")}장</span>
                    </div>
                    <AlbumPhotoGrid photos={g.photos} mountainOf={mountainOf} seeMountain />
                </section>
            ))}
        </div>
    );
}

/** 산 한 곳을 펼친 화면 — 그 산의 사진과, 올리기 · 관리가 있는 산 화면으로 가는 길 */
function MountainAlbum({ m, label }: { m: HikingAlbumMountain; label: string }) {
    const mountainOf = () => ({ name: label, slug: m.slug });
    return (
        <div className="px-5 pt-5" data-testid="hk-album-mountain" data-count={m.count}>
            <p className="text-[13px] text-[#F6D9A8]">{HIKING_ALBUM_LABEL.title}</p>
            <h1 className="mt-0.5 truncate text-[25px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{label}</h1>
            <p className="mt-1 truncate text-[13px] tabular-nums text-[#F4EFE399]">{mountainFacts(m, true)}</p>
            <Link href={mountainPhotosPath(m.slug)} className={`mt-3.5 ${quiet}`} data-testid="hk-album-manage" data-track-as="hiking-album-manage">
                <span className="truncate">{HIKING_ALBUM_LABEL.manage}</span><LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F6D9A8]" aria-hidden />
            </Link>
            <div className="mt-4"><AlbumPhotoGrid photos={m.photos} mountainOf={mountainOf} /></div>
        </div>
    );
}

export default function AlbumPage() {
    const { isLoading: authLoading } = useAuth();
    const { mine, album, isLoading, isError, refetch } = useHikingAlbum();
    const slug = new URLSearchParams(useSearch()).get("m");
    const [view, setView] = useState<AlbumView>("mountains");
    // 산을 펼치면 맨 위에서 시작한다(아래쪽 표지를 눌러도). 뒤로 돌아올 때는 손대지 않는다 — 보던 자리는 브라우저가 되돌린다
    useEffect(() => { if (slug) window.scrollTo(0, 0); }, [slug]);
    useSeo({ title: `${HIKING_ALBUM_LABEL.title} | 랭큐 등산`, description: HIKING_ALBUM_LABEL.empty, path: HIKING_ALBUM_PATH });

    const dup = useMemo(() => duplicateNames(album?.mountains ?? []), [album]);
    const labelOf = useMemo(() => (m: HikingAlbumMountain) => mountainLabel(m, dup), [dup]);
    const picked = slug ? album?.mountains.find((m) => m.slug === slug) ?? null : null;
    const seg = (active: boolean) => `flex h-10 items-center justify-center rounded-[11px] text-[14.5px] ${active ? "bg-[#F4EFE3] font-semibold text-[#0E2A33]" : "text-[#F4EFE3B3] active:bg-[#FFFFFF14]"}`;

    let body;
    if (!mine) {
        // 등산을 쓸 수 없는 사람(방문자 · 아직 열리지 않은 회원) — 사진첩이 없다. 로그인 확인이 끝나기 전에는 자리만 잡아 둔다
        body = authLoading
            ? <div className="space-y-3 px-5 pt-6" aria-busy="true"><HkSkel className="h-40" /><HkSkel className="h-64" /></div>
            : <div className="px-5 pt-8" data-testid="hk-album-closed"><HikingCta /></div>;
    } else if (isLoading) {
        body = <div className="space-y-3 px-5 pt-6" aria-busy="true"><HkSkel className="h-40" /><HkSkel className="h-11" /><HkSkel className="h-64" /></div>;
    } else if (isError || !album) {
        body = (
            <div className="px-5 pt-16 text-center" data-testid="hk-album-failed">
                <p className="text-[15px] leading-relaxed text-[#F4EFE3B3] break-keep">{HIKING_ALBUM_LABEL.failed}</p>
                <button type="button" onClick={refetch} className={`mt-4 ${coral}`} data-testid="hk-album-retry">{HIKING_ALBUM_LABEL.retry}</button>
            </div>
        );
    } else if (slug) {
        body = picked ? <MountainAlbum m={picked} label={labelOf(picked)} /> : (
            <div className="px-5 pt-16 text-center" data-testid="hk-album-none-here">
                <p className="text-[15px] leading-relaxed text-[#F4EFE3B3] break-keep">{HIKING_ALBUM_LABEL.noneHere}</p>
                <Link href={HIKING_ALBUM_PATH} className={`mt-4 ${coral}`} data-testid="hk-album-back" data-track-as="hiking-album-back">{HIKING_ALBUM_LABEL.backToAlbum}</Link>
                <Link href={mountainPhotosPath(slug)} className={`mt-3 ${quiet}`} data-testid="hk-album-manage" data-track-as="hiking-album-manage"><span className="truncate">{HIKING_ALBUM_LABEL.manage}</span></Link>
            </div>
        );
    } else if (album.total === 0) {
        body = (
            <div className="px-5 pt-10 text-center" data-testid="hk-album-empty">
                <img src={HIKING_ALBUM_EMPTY} alt="" width={220} height={220} decoding="async" draggable={false} className="mx-auto h-[220px] w-[220px] max-w-full rounded-3xl object-cover" />
                <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-[#F4EFE3]">{HIKING_ALBUM_LABEL.title}</h1>
                <p className="mx-auto mt-2 max-w-[300px] text-[14.5px] leading-relaxed text-[#F4EFE3B3] break-keep">{HIKING_ALBUM_LABEL.empty}</p>
                <Link href={HIKING_HUB_PATH} className={`mt-5 ${coral}`} data-testid="hk-album-find" data-track-as="hiking-album-find">{HIKING_ALBUM_LABEL.emptyButton}</Link>
            </div>
        );
    } else {
        body = (
            <>
                <div className="relative h-[164px] overflow-hidden" style={{ background: "linear-gradient(135deg,#1F5560,#0E2A33)" }}>
                    <img src={HIKING_ALBUM_COVER} alt="" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 55%" }} />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 20%,#0B1F26F5 97%)" }} aria-hidden />
                    <div className="absolute inset-x-5 bottom-3.5">
                        <h1 className="text-[27px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{HIKING_ALBUM_LABEL.title}</h1>
                        <p className="mt-1 text-[13px] tabular-nums text-[#F6D9A8]" data-testid="hk-album-count">{albumCountLine(album.mountains.length, album.total)}</p>
                    </div>
                </div>
                <div className="px-5 pt-4">
                    <div role="tablist" aria-label="사진첩 보기" className="grid grid-cols-2 gap-1 rounded-[14px] bg-[#FFFFFF14] p-1" data-testid="hk-album-view" data-view={view}>
                        <button type="button" role="tab" aria-selected={view === "mountains"} onClick={() => setView("mountains")} className={seg(view === "mountains")} data-testid="hk-album-view-mountains" data-track-as="hiking-album-view-mountains">{HIKING_ALBUM_LABEL.viewMountains}</button>
                        <button type="button" role="tab" aria-selected={view === "all"} onClick={() => setView("all")} className={seg(view === "all")} data-testid="hk-album-view-all" data-track-as="hiking-album-view-all">{HIKING_ALBUM_LABEL.viewAll}</button>
                    </div>
                    <div className="pt-4">
                        {view === "mountains" ? <MountainCovers album={album} labelOf={labelOf} /> : <AllPhotos album={album} labelOf={labelOf} />}
                    </div>
                    <p className="mt-6 text-[12.5px] leading-snug text-[#F4EFE373] break-keep">{HIKING_ALBUM_LABEL.onlyMine}</p>
                    {album.capped && <p className="mt-1 text-[12.5px] leading-snug text-[#F4EFE373] break-keep" data-testid="hk-album-capped">{HIKING_ALBUM_LABEL.capped}</p>}
                </div>
            </>
        );
    }

    return (
        <HikingShell title={picked ? labelOf(picked) : HIKING_ALBUM_LABEL.title} backTo={slug ? HIKING_ALBUM_PATH : HIKING_STAMPS_PATH}>
            <div data-testid="hk-album" data-mine={mine ? "1" : "0"} data-open={slug ? "1" : "0"}>{body}</div>
        </HikingShell>
    );
}
