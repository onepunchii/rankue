/**
 * 골프장 페이지 '라운드 사진'(2026-09-30) — 회원이 공개로 돌린 라운드 사진. 사전 승인 없이 바로 뜬다(오너 결정),
 * 그래서 사진마다 ⋯ [신고] [차단]이 붙는다(Apple 1.2 / Play UGC). 서로 다른 3명이 신고하면 서버가 가린다.
 * 크레딧은 "사진 · 닉네임" 과 **달까지만** — 정확한 날짜·시각은 그날 거기 있었다는 위치 기록이 된다.
 *
 * v2(같은 날 오너: "사진첩(그리드)보다 이거 쓸까? — React Bits CircularCarousel"):
 *   4장 이상  → 3D 링(CircularCarousel, 평평한 카드·화면보다 넓게 그려 앞 카드 ≈170px). 링엔 400px 썸네일만(카드가 앞뒤로
 *              한꺼번에 그려져 원본이면 무겁다). 4~5장은 두 바퀴로 채운다(네모 링은 옆 카드가 모서리로 서서 빈 원 같다).
 *              앞 카드를 누르면 전체 화면, 옆 카드를 누르면 앞으로 돌아온다. 밑 한 줄 = 앞 사진의 크레딧 + ⋯(신고·차단 한 번에).
 *   1~3장    → 큰 첫 장 + 옆으로 넘기는 카드(다음 장이 살짝 보인다). 3장까지는 원본 사진(큰 카드에 썸네일은 흐리다).
 *   자동 회전은 끈다(드래그·스냅·관성만). 움직임 줄이기를 켠 사람에겐 등장 애니메이션도 없다(컴포넌트가 스스로 지킨다).
 * 로그아웃 방문자도 보는 페이지다(당구 테마) — 리터럴 색만. 봇 HTML(server/prerender.ts figure)은 따로다.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { LucideChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useGolfAccess } from "@/hooks/useGolfAccess";
import { useCoursePhotos, invalidatePhotos, type CoursePhoto } from "../../lib/photoApi";
import { SCROLL_MARGIN } from "../course/detail/ui";
import { PhotoViewer, PhotoUgcButton, ROUND_PHOTOS_ANCHOR, type ViewerPhoto } from "./PhotoViewer";

// 링은 무겁다(3D 변환·카드 조각) — 4장 이상일 때만 불러온다
const CircularCarousel = lazy(() => import("@/components/reactbits/CircularCarousel/CircularCarousel"));

/** 이 장수부터 링. 그 밑은 큰 카드 가로 넘김 */
const RING_MIN = 4;
/** 이 장수 밑(4~5장)은 링을 두 바퀴로 채운다 */
const RING_FULL = 6;
/** 페이지 바탕 — 링 뒤쪽 카드가 이 색으로 스며든다 */
const PAGE_BG = "#0A0A0A";
/** 링 양끝을 화면 가장자리에서 부드럽게 지운다 */
const RING_EDGE_MASK = "linear-gradient(to right, transparent, #000 9%, #000 91%, transparent)";

/** "사진 · 닉네임 · 2026년 9월" — 닉네임만 밝게 */
function Credit({ p, className }: { p: CoursePhoto; className?: string }) {
    return (
        <p className={cn("min-w-0 truncate text-[13px] text-[#FFFFFF8C]", className)}>
            사진 · <span className="font-medium text-[#ffffff]">{p.credit}</span>
            {p.month && <span className="tabular-nums"> · {p.month}</span>}
        </p>
    );
}

/** 1~3장 — 큰 카드 가로 넘김. 한 장이면 폭 전체, 여러 장이면 다음 장이 살짝 보인다 */
function PeekRow({ photos, name, onOpen, onBlocked }: { photos: CoursePhoto[]; name: string; onOpen: (i: number) => void; onBlocked: () => void }) {
    const single = photos.length === 1;
    return (
        <div className={cn("-mx-5 px-5 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-5 scrollbar-hide", single && "overflow-visible")}>
            {photos.map((p, i) => (
                <figure key={p.id} className={cn("m-0 shrink-0 snap-start", single ? "w-full" : "w-[84%]")}>
                    <button type="button" onClick={() => onOpen(i)} aria-label={`${name} 라운드 사진 크게 보기 · ${p.credit}`}
                        className="block w-full aspect-[4/3] rounded-[20px] overflow-hidden bg-[#FFFFFF0A] ring-1 ring-inset ring-[#FFFFFF0F] active:opacity-90">
                        {/* 큰 카드라 썸네일(400px)은 흐리다 — 3장까지는 원본을 쓴다 */}
                        <img src={p.url} alt={`${name} 라운드 사진`} loading="lazy" decoding="async"
                            className="w-full h-full object-cover" style={{ backgroundImage: `url("${p.thumbUrl}")`, backgroundSize: "cover" }} />
                    </button>
                    <figcaption className="mt-2 flex items-center gap-1">
                        <Credit p={p} className="flex-1" />
                        <span className="-mr-2 shrink-0"><PhotoUgcButton photo={{ id: p.id, memberId: p.memberId, name: p.credit }} onBlocked={onBlocked} /></span>
                    </figcaption>
                </figure>
            ))}
        </div>
    );
}

/** 4장 이상 — 3D 링. 앞 카드 누르면 전체 화면, 옆 카드 누르면 앞으로 */
function Ring({ photos, name, onOpen, onBlocked }: { photos: CoursePhoto[]; name: string; onOpen: (i: number) => void; onBlocked: () => void }) {
    const [active, setActive] = useState(0);
    const activeRef = useRef(0);
    const n = photos.length;
    // 4~5장은 링이 네모·오각형이라 옆 카드가 모서리로 서서 빈 원처럼 보인다 — 두 바퀴(8~10칸)로 채운다. 번호는 n 으로 접는다
    const reps = n < RING_FULL ? 2 : 1;
    const items = useMemo(
        () => Array.from({ length: n * reps }, (_, i) => ({ src: photos[i % n].thumbUrl, alt: `${name} 라운드 사진 · ${photos[i % n].credit}` })),
        [photos, name, n, reps],
    );
    const cur = photos[active % n];
    return (
        <div>
            {/* 링을 화면보다 넓게(200%) 그리고 가장자리를 잘라 낸다 — 컴포넌트는 링 전체가 들어가게 줄이는데, 폰 폭에선
                12장이면 카드가 손톱만 해진다. 넓게 그리면 앞 카드가 제 크기(≈170px)를 지키고 양옆은 화면 밖으로 이어진다. */}
            <div className="relative -mx-5 h-[264px] overflow-hidden"
                style={{ WebkitMaskImage: RING_EDGE_MASK, maskImage: RING_EDGE_MASK }}>
                <div className="absolute inset-y-0 left-[-50%] w-[200%]">
                <Suspense fallback={<div className="h-full" aria-hidden />}>
                    <CircularCarousel
                        items={items}
                        preset="cylinder"
                        // 기본 -5° 면 링 건너편 카드 등이 앞 카드 위로 비친다 — 조금만 내려다본다
                        tilt={-3}
                        // 굽은 카드(curve>0)는 한 장을 세로 조각 8개(앞뒤 16장)로 그린다 — 12장이면 이미지 192개. 평평한 카드로 가볍게
                        curve={0}
                        intro="rise"
                        cardWidth={176}
                        aspectRatio={0.8}
                        gap={16}
                        autoplay="off"
                        draggable
                        momentum={0.55}
                        snap
                        focusOnClick
                        parallax={0.15}
                        stretch={0.3}
                        depthFade={0.82}
                        fadeColor={PAGE_BG}
                        innerShade={0.72}
                        cornerRadius={20}
                        onChange={(i) => { activeRef.current = i; setActive(i); }}
                        // 옆 카드를 누르면 컴포넌트가 앞으로 돌려 준다(focusOnClick) — 이미 앞에 있던 카드일 때만 연다
                        onItemClick={(_item, i) => { if (i === activeRef.current) onOpen(i % n); }}
                    />
                </Suspense>
                </div>
            </div>
            {cur && (
                <div className="mt-1 flex items-center gap-2">
                    <Credit p={cur} className="flex-1" />
                    <span className="shrink-0 text-[12px] text-[#FFFFFF59] tabular-nums">{(active % n) + 1} / {n}</span>
                    <span className="-mr-2 shrink-0"><PhotoUgcButton photo={{ id: cur.id, memberId: cur.memberId, name: cur.credit }} onBlocked={onBlocked} /></span>
                </div>
            )}
        </div>
    );
}

export function CoursePhotoGallery({ slug, name }: { slug: string; name: string }) {
    const qc = useQueryClient();
    const { data } = useCoursePhotos(slug);
    const { member } = useAuth();
    const golfOk = useGolfAccess();
    const [viewer, setViewer] = useState<number | null>(null);
    const photos = data ?? [];
    const viewerPhotos = useMemo<ViewerPhoto[]>(() => photos.map((p) => {
        const mine = !!member && member.id === p.memberId;
        return {
            id: p.id, url: p.url, thumbUrl: p.thumbUrl, memberId: p.memberId, name: p.credit, month: p.month, mine,
            // 내 사진이면 여기서도 비공개로 돌리거나 지울 수 있게 — 이 페이지에 뜬 사진은 늘 '공개·안 가려짐'이다.
            // '보러 가기'는 지금 이 페이지라 뺀다(courseSlug 없음).
            ...(mine ? { isPublic: true, hasCoursePage: true, hidden: false, courseName: name, courseSlug: null, dateLabel: p.month } : {}),
        };
    }), [photos, member, name]);

    // 뷰어의 '보러 가기'(#round-photos)로 들어오면 사진이 뜬 뒤 이 칸으로 내려온다 — 페이지는 들어올 때 맨 위로 올린다
    const scrolled = useRef(false);
    useEffect(() => {
        if (scrolled.current || !photos.length || window.location.hash !== `#${ROUND_PHOTOS_ANCHOR}`) return;
        scrolled.current = true;
        requestAnimationFrame(() => document.getElementById(ROUND_PHOTOS_ANCHOR)?.scrollIntoView({ block: "start" }));
    }, [photos.length]);

    if (!photos.length) return null;
    const refresh = () => { void invalidatePhotos(qc); };

    return (
        <section id={ROUND_PHOTOS_ANCHOR} className="px-5 pt-10" style={{ scrollMarginTop: SCROLL_MARGIN }} aria-labelledby="round-photos-title">
            <div className="mb-4">
                <div className="flex items-center justify-between gap-3 min-h-8">
                    <h2 id="round-photos-title" className="min-w-0 text-[19px] font-bold tracking-tight text-white leading-tight">
                        라운드 사진<span className="ml-1.5 text-[15px] font-semibold text-[#FFFFFF59] tabular-nums">{photos.length}</span>
                    </h2>
                    {member && golfOk && (
                        // 사진은 라운드 앨범에서 올린다(라운딩 리포트 → 라운드 → 앨범 · 사진 추가). 라운드 중이면 점수판 📷
                        <Link href="/history" className="shrink-0 h-8 pl-3 pr-2 rounded-full bg-[#FFFFFF0D] inline-flex items-center gap-0.5 text-[12.5px] font-medium text-[#C8F7A0] active:bg-[#FFFFFF1A]">
                            내 라운드 사진 올리기<LucideChevronRight weight="bold" className="w-3.5 h-3.5" />
                        </Link>
                    )}
                </div>
                <p className="mt-1 text-[13px] text-[#FFFFFF80]">랭큐 회원이 이 골프장에서 직접 찍었어요</p>
            </div>

            {photos.length >= RING_MIN
                ? <Ring photos={photos} name={name} onOpen={setViewer} onBlocked={refresh} />
                : <PeekRow photos={photos} name={name} onOpen={setViewer} onBlocked={refresh} />}

            <p className="mt-3 text-[12px] text-[#FFFFFF4D]">문제가 있는 사진은 ⋯ 에서 신고할 수 있어요</p>
            <PhotoViewer photos={viewerPhotos} index={viewer} onClose={() => setViewer(null)} />
        </section>
    );
}
