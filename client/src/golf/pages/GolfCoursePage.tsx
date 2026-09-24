/**
 * 골프장 상세 /golf/course/:slug (2026-09-24) — 이 기능의 얼굴. **로그인 없이** 열린다(검색으로 들어온 사람이 본다).
 *
 *   머리        이름 · 지역·종류 칩 · 내 위치에서 거리 · 한눈 숫자(지금 티타임·주중 그린피·회원권) · 관심 단추(주 행동)
 *   지금 이 골프장   앞으로의 부킹·조인·긴급(오늘/내일/이번 주/그 뒤). 비었으면 관심 단추로 넘긴다.
 *   회원권 시세 · 그린피 · 코스 · 소개 · 위치 · 랭큐 라운드 · 가까운 골프장(작은 지도) · 지역 링크 — 데이터가 있는 것만.
 *
 * 옛 주소(/golf/course/74 — 패스포트·엘리트60 의 링크)는 숫자다. 슬러그를 받아 **replace** 로 갈아탄다(뒤로 가기에 안 남게).
 * 목록에서 들어오면 목록 캐시로 머리가 먼저 뜬다(prefill) — 느린 폰에서 빈 화면을 오래 보지 않게.
 *
 * ⚠️ 색은 리터럴만(CourseShell 머리말). 제목·설명·주소는 shared/golfCourse 의 함수 — 서버 프리렌더와 같은 글이어야 한다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { LucideChevronRight, LucideGolf, LucideShare2 } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import { useToast } from "@/hooks/use-toast";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { hasPlugin, isNative } from "@shared/nativeCaps";
import { distanceKm, formatDistance, isKoreaCoord } from "@shared/golfJoin";
import { ORIGIN, REGION_LABEL, cityShort, courseDescription, coursePath, courseTitle, distinctAliases, listPath } from "@shared/golfCourse";
import { COURSES_KEY, slugForCourseId, useCourseDetail, type CourseDetail, type CourseListItem } from "@/golf/lib/courseApi";
import { CourseShell } from "@/golf/components/course/CourseShell";
import { CourseHeader, type HeaderData } from "@/golf/components/course/detail/CourseHeader";
import { TeeTimes } from "@/golf/components/course/detail/TeeTimes";
import { MembershipPrices, topPrice } from "@/golf/components/course/detail/MembershipPrices";
import { GreenFees } from "@/golf/components/course/detail/GreenFees";
import { CourseLayout } from "@/golf/components/course/detail/CourseLayout";
import { AboutInfo } from "@/golf/components/course/detail/AboutInfo";
import { LocationCard } from "@/golf/components/course/detail/LocationCard";
import { NearbyCourses } from "@/golf/components/course/detail/NearbyCourses";
import { SectionNav, jumpTo } from "@/golf/components/course/detail/SectionNav";
import { Card, Section, Skel, type SectionId } from "@/golf/components/course/detail/ui";

function decodeSlug(raw: string | undefined): string {
    if (!raw) return "";
    try { return decodeURIComponent(raw).normalize("NFC"); } catch { return raw; }
}

/** 목록·다른 골프장의 '가까운 곳'에 이미 받아 둔 한 줄 — 머리를 먼저 그린다. */
function usePrefill(slug: string): HeaderData | null {
    const qc = useQueryClient();
    return useMemo(() => {
        if (!slug) return null;
        for (const [, data] of qc.getQueriesData<unknown>({ queryKey: [COURSES_KEY] })) {
            const pool: any[] = Array.isArray(data) ? data : (data as any)?.nearby ?? [];
            const hit = pool.find((x) => x?.slug === slug && typeof x?.name === "string" && typeof x?.region === "string") as Partial<CourseListItem> | undefined;
            if (hit) return {
                slug, name: hit.name!, region: hit.region!, city: hit.city ?? null, kind: hit.kind ?? null, holes: hit.holes ?? null, watchers: hit.watchers ?? 0,
                logo: hit.logo ?? null, aliases: hit.aliases ?? [], grass: hit.grass ?? [], play: hit.play ?? [], feeFrom: hit.feeFrom ?? null, bookable: hit.bookable ?? true,
            };
        }
        return null;
    }, [qc, slug]);
}

/**
 * 내 위치 — 앱(네이티브 권한 창)이거나 웹에서 이미 허락한 사람은 조용히 한 번 받는다(BookingList 와 같은 규칙: 두 번 묻지 않는다).
 * 웹에서 아직 안 물어본 사람(검색으로 막 들어온 방문자)에게는 **들어오자마자 권한 창을 띄우지 않는다** —
 * 첫 화면에 위치 권한 창이 뜨면 그대로 나간다. 대신 머리에 "내 위치에서 거리" 한 줄을 두고 누르면 묻는다.
 */
function useMyLocation() {
    const { location, requestLocation, locationStatus } = useNativeBridge();
    const [askable, setAskable] = useState(false);
    const asked = useRef(false);
    useEffect(() => {
        if (asked.current || location || locationStatus) return;
        const auto = () => { asked.current = true; void requestLocation().catch(() => { /* 거리를 안 적을 뿐이다 */ }); };
        if (isNative() || hasPlugin("Geolocation")) { auto(); return; }
        const perms = typeof navigator !== "undefined" ? (navigator as any).permissions : null;
        if (!perms?.query) { setAskable(true); return; }
        perms.query({ name: "geolocation" })
            .then((st: { state: string }) => { if (st.state === "granted") auto(); else if (st.state === "prompt") setAskable(true); })
            .catch(() => setAskable(true));
    }, [location, locationStatus, requestLocation]);
    const ask = () => { asked.current = true; setAskable(false); void requestLocation().catch(() => {}); };
    return { location, ask: askable && !locationStatus ? ask : null };
}

function NotFound() {
    return (
        <div className="px-4 pt-16 pb-10 text-center">
            <p className="text-[16px] text-[#FFFFFFCC]">골프장을 찾을 수 없어요</p>
            <Link href="/golf/courses" className="mt-4 inline-flex h-11 px-5 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-white items-center gap-1 active:bg-[#FFFFFF1F]">
                전체 골프장<LucideChevronRight className="w-4 h-4" />
            </Link>
        </div>
    );
}

function BodySkeleton() {
    return (
        <div className="px-4 pt-8 space-y-8" aria-hidden>
            <div><Skel className="h-6 w-32 mb-3" /><Skel className="h-[148px] rounded-2xl" /></div>
            <div><Skel className="h-6 w-28 mb-3" /><Skel className="h-[260px] rounded-2xl" /></div>
        </div>
    );
}

export default function GolfCoursePage() {
    const [, params] = useRoute("/golf/course/:slug");
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const slug = decodeSlug(params?.slug);
    const legacy = /^\d+$/.test(slug);

    // 옛 숫자 주소 → 슬러그
    const [legacyMissing, setLegacyMissing] = useState(false);
    useEffect(() => {
        if (!legacy) return;
        let alive = true;
        setLegacyMissing(false);
        void slugForCourseId(slug).then((s) => {
            if (!alive) return;
            if (s) setLocation(coursePath(s), { replace: true }); else setLegacyMissing(true);
        });
        return () => { alive = false; };
    }, [legacy, slug, setLocation]);

    const q = useCourseDetail(legacy ? null : slug);
    const d = q.data;
    const prefill = usePrefill(legacy ? "" : slug);
    const notFound = legacyMissing || (q.error as any)?.status === 404;

    // 다른 골프장으로 건너가면 맨 위에서 시작한다
    useEffect(() => { window.scrollTo(0, 0); }, [slug]);

    // 머리의 이름이 위로 지나가면 상단 바에 이름이 뜬다(처음부터 띄우면 같은 이름이 두 번 보인다)
    const [past, setPast] = useState(false);
    useEffect(() => {
        const on = () => setPast(window.scrollY > 96);
        on(); window.addEventListener("scroll", on, { passive: true });
        return () => window.removeEventListener("scroll", on);
    }, []);

    const { location, ask } = useMyLocation();
    const hasCoord = !!d && isKoreaCoord(d.lat, d.lng);
    const distKm = hasCoord && location ? distanceKm(location.lat, location.lng, d!.lat!, d!.lng!) : null;
    const distance = distKm != null ? { text: formatDistance(distKm) } : hasCoord && ask ? { ask } : null;

    const top = d ? topPrice(d.prices) : null;

    // 검색: 제목·설명은 서버 프리렌더와 같은 함수. JSON-LD 는 참조가 바뀌면 다시 심으므로 memo.
    const seo = useMemo(() => {
        if (!d) return null;
        // 서버 프리렌더(renderGolfCourse)와 **같은 사실**을 넣어야 제목·설명이 같은 글이 된다
        const facts = {
            name: d.name, region: d.region, city: d.city, kind: d.kind, holes: d.holes, fees: d.fees, topPrice: top?.price ?? null, listingCount: d.listings.length,
            feeFrom: d.feeFrom, grass: d.grass, play: d.play, aliases: d.aliases,
        };
        const url = ORIGIN + coursePath(d.slug);
        // addressRegion 은 넣지 않는다 — 우리 지역은 '경상·전라' 같은 묶음이라 행정구역으로 적으면 거짓이다(2026-09-24 검토).
        const jsonLd: Record<string, unknown> = {
            "@context": "https://schema.org", "@type": "GolfCourse", name: d.name, url,
            ...(distinctAliases(d.name, d.aliases).length ? { alternateName: distinctAliases(d.name, d.aliases) } : {}),
            ...(d.logo ? { logo: ORIGIN + d.logo, image: ORIGIN + d.logo } : {}),
            ...(d.phone ? { telephone: d.phone } : {}),
            ...(d.website ? { sameAs: [d.website] } : {}),
            address: {
                "@type": "PostalAddress", addressCountry: "KR",
                ...(d.city ? { addressLocality: d.city } : {}), ...(d.address ? { streetAddress: d.address } : {}),
            },
            ...(d.lat != null && d.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: d.lat, longitude: d.lng } } : {}),
        };
        return { title: courseTitle(facts), description: courseDescription(facts), path: coursePath(d.slug), jsonLd };
    }, [d, top?.price]);
    useSeo(seo);

    const share = async () => {
        const name = d?.name ?? prefill?.name ?? "골프장";
        const url = ORIGIN + coursePath(d?.slug ?? slug);
        try {
            if (navigator.share) { await navigator.share({ title: `${name} | 랭큐 골프`, url }); return; }
        } catch (e: any) { if (e?.name === "AbortError") return; }
        try { await navigator.clipboard.writeText(url); toast({ title: "주소를 복사했어요" }); }
        catch { toast({ title: url }); }
    };
    const shareBtn = (
        <button type="button" onClick={share} aria-label="공유" className="w-10 h-10 rounded-full flex items-center justify-center active:bg-[#FFFFFF14]">
            <LucideShare2 className="w-[22px] h-[22px]" />
        </button>
    );

    const base: HeaderData | null = d
        ? {
            slug: d.slug, name: d.name, region: d.region, city: d.city, kind: d.kind, holes: d.holes, watchers: d.watchers,
            logo: d.logo, aliases: d.aliases, grass: d.grass, play: d.play, feeFrom: d.feeFrom, bookable: d.bookable,
        }
        : prefill;

    // 있는 섹션만 — 섹션 줄과 본문이 같은 판단을 쓴다
    const has = (d ? {
        // 글이 붙을 수 없는 골프장(자료로만 만든 새 페이지)은 '지금 이 골프장'도 관심 단추도 없다 — 약속할 수 없는 알림이다.
        tee: d.bookable,
        price: d.prices.length > 0,
        fee: !!d.fees?.rows?.some((r) => r.nonMember || r.member || r.family),
        course: !!d.courses?.some((c) => c.holes > 0) || (d.parts?.filter((p) => p.holes).length ?? 0) >= 2,
        about: !!d.intro || !!d.grass?.length || !!(d.info && (d.info.opened || d.info.members || d.info.membershipTypes)),
        map: true,
        near: d.nearby.length > 0,
    } : null) as Record<SectionId, boolean> | null;
    const ids = has ? (Object.keys(has) as SectionId[]).filter((k) => has[k]) : [];

    return (
        <CourseShell hideBottomCta={!!d?.bookable} title={<span className={`transition-opacity duration-200 ${past ? "opacity-100" : "opacity-0"}`}>{d?.name ?? prefill?.name ?? ""}</span>} right={shareBtn} backTo={d ? listPath({ region: d.region, city: d.city }) : "/golf/courses"}>
            {notFound ? <NotFound /> : (
                <>
                    {base ? (
                        <CourseHeader
                            base={base} loaded={!!d} fees={d?.fees} top={top} counts={d?.counts} listingCount={d?.listings.length}
                            myWatch={d?.myWatch} distance={distance} onJump={jumpTo}
                        />
                    ) : (
                        <div className="px-4 pt-5" aria-hidden>
                            <div className="flex gap-1.5"><Skel className="h-7 w-12 rounded-full" /><Skel className="h-7 w-12 rounded-full" /><Skel className="h-7 w-16 rounded-full" /></div>
                            <Skel className="mt-3 h-8 w-3/4" />
                            <div className="mt-5 grid grid-cols-3 gap-2"><Skel className="h-[74px] rounded-2xl" /><Skel className="h-[74px] rounded-2xl" /><Skel className="h-[74px] rounded-2xl" /></div>
                            <Skel className="mt-4 h-[52px] rounded-2xl" />
                        </div>
                    )}

                    {!d ? (
                        q.isError ? (
                            <div className="px-4 pt-10 text-center">
                                <p className="text-[14px] text-[#FFFFFF99]">불러오지 못했어요</p>
                                <button type="button" onClick={() => q.refetch()} className="mt-3 h-10 px-4 rounded-xl bg-[#FFFFFF14] text-[14px] font-medium text-white">다시 시도</button>
                            </div>
                        ) : <BodySkeleton />
                    ) : (
                        <Body d={d} ids={ids} distance={distKm != null ? formatDistance(distKm) : null} />
                    )}
                </>
            )}
        </CourseShell>
    );
}

function Body({ d, ids, distance }: { d: CourseDetail; ids: SectionId[]; distance: string | null }) {
    const city = cityShort(d.city);
    const tgm = d.prices.length > 0 || !!d.fees || !!d.intro;
    return (
        <>
            <SectionNav ids={ids} />
            {ids.includes("tee") && <TeeTimes slug={d.slug} name={d.name} listings={d.listings} counts={d.counts} myWatch={d.myWatch} watchers={d.watchers} />}
            {ids.includes("price") && <MembershipPrices key={d.slug} prices={d.prices} />}
            {ids.includes("fee") && d.fees && <GreenFees fees={d.fees} />}
            {ids.includes("course") && <CourseLayout courses={d.courses} parts={d.parts} holes={d.holes} />}
            {ids.includes("about") && <AboutInfo key={d.slug} intro={d.intro} info={d.info} grass={d.grass} />}
            <LocationCard name={d.name} address={d.address} lat={d.lat} lng={d.lng} distance={distance} phone={d.phone} website={d.website || d.info?.homepage || null} />

            {d.rounds > 0 && (
                <Section title="랭큐 라운드">
                    <Card className="px-4 py-3.5 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-[#64DD171F] flex items-center justify-center shrink-0">
                            <LucideGolf className="w-5 h-5 text-[#64DD17]" />
                        </span>
                        <p className="text-[14px] text-[#FFFFFFCC] break-keep">
                            이 골프장에서 끝난 랭큐매치 <span className="text-white font-semibold tabular-nums">{d.rounds.toLocaleString("ko-KR")}라운드</span>
                        </p>
                    </Card>
                </Section>
            )}

            <NearbyCourses items={d.nearby} lat={d.lat} lng={d.lng} />

            <nav className="px-4 pt-8 flex flex-wrap gap-2" aria-label="지역 골프장">
                <Link href={listPath({ region: d.region })} className="h-10 px-4 rounded-full border border-[#FFFFFF1F] text-[14px] text-[#FFFFFFCC] inline-flex items-center gap-1 active:bg-[#FFFFFF0F]">
                    {REGION_LABEL[d.region] ?? d.region} 골프장 전체<LucideChevronRight className="w-4 h-4 text-[#FFFFFF66]" />
                </Link>
                {city && (
                    <Link href={listPath({ region: d.region, city: d.city })} className="h-10 px-4 rounded-full border border-[#FFFFFF1F] text-[14px] text-[#FFFFFFCC] inline-flex items-center gap-1 active:bg-[#FFFFFF0F]">
                        {city} 골프장<LucideChevronRight className="w-4 h-4 text-[#FFFFFF66]" />
                    </Link>
                )}
            </nav>

            {/* 날짜는 적지 않는다 — updated_at 은 적재한 시각이지 자료의 날짜가 아니다. 시세 기준일은 시세 칸에 있다. */}
            {tgm && <p className="px-4 pt-6 pb-4 text-[12px] text-[#FFFFFF4D]">시세·그린피·소개 TGM</p>}
        </>
    );
}
