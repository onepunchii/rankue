/**
 * 골프장 목록 · 지역 · 시군 · 부킹/조인/긴급 허브(2026-09-24) — **로그인 없이** 열린다(검색 유입 페이지).
 *
 *   /golf/courses[/:region[/:city]]              골프장 목록
 *   /golf/{booking|join|urgent}[/:region[/:city]] 그 의도의 글 + 골프장 목록
 *
 * 주소·제목·설명은 shared/golfCourse 의 함수로만 만든다 — 서버 프리렌더·사이트맵과 같은 글이어야 한다.
 * 지역·의도·시군을 바꾸는 것은 전부 <a>(wouter Link)다: 검색엔진이 허브 사이를 따라다녀야 한다.
 *
 * ⚠️ 색은 리터럴만(CourseShell 주석). 비로그인은 당구 테마라 bg-white·토큰이 밝게 풀린다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { kstDateKey } from "@/lib/kst";
import { useSeo } from "@/hooks/useSeo";
import { useAuth } from "@/hooks/useAuth";
import { useGolfAccess } from "@/hooks/useGolfAccess";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { goLogin } from "@/components/hiq/LoginGate";
import { LucideSearch, LucideX, LucideChevronRight } from "@/lib/icons";
import {
    GOLF_REGIONS, ORIGIN, REGION_LABEL, cityShort, listDescription, listPath, listTitle, type GolfIntent,
} from "@shared/golfCourse";
import { distanceKm, isKoreaCoord } from "@shared/golfJoin";
import { useCourseList, useCourseRegions, useHubListings, useMyWatches, type CourseListItem, type HubListing, type WatchFilters } from "../lib/courseApi";
import { CourseShell } from "../components/course/CourseShell";
import { CourseDotMap, type MapDot } from "../components/course/list/CourseDotMap";
import { CourseRow, CourseRowSkeleton, matchesCourseQuery } from "../components/course/list/CourseRow";
import { HubListingRow } from "../components/course/list/HubListingRow";

const PAGE = 60;
const LISTING_PAGE = 8;

const INTENT_TABS: { intent: GolfIntent | null; label: string; color: string }[] = [
    { intent: null, label: "전체 골프장", color: "#FFFFFF" },
    { intent: "booking", label: "부킹", color: "#64DD17" },
    { intent: "join", label: "조인", color: "#FF6B00" },
    { intent: "urgent", label: "긴급", color: "#FF3B30" },
];
/** "지금 올라온 ___이 없어요" 에 들어갈 말 */
const INTENT_NOUN: Record<GolfIntent, string> = { booking: "부킹", join: "조인", urgent: "긴급 조인" };

type Sort = "rec" | "near" | "price" | "name";

const safeDecode = (s: string | undefined) => {
    if (!s) return null;
    try { return decodeURIComponent(s).normalize("NFC"); } catch { return s; }
};

/**
 * 주소에서 의도·지역·시군을 읽는다. wouter 3 의 useLocation 이 이미 decodeURI 를 한 번 거친 값을 준다 —
 * 한글 조각에는 % 가 남지 않아 한 번 더 decodeURIComponent 해도 그대로다(잘못된 % 가 있으면 safeDecode 가 원문을 돌려준다).
 */
function parsePath(path: string): { intent: GolfIntent | null; region: string | null; city: string | null } {
    const seg = path.split("?")[0].split("/").filter(Boolean); // ["golf", "courses"|intent, region?, city?]
    const head = seg[1];
    const intent = head === "booking" || head === "join" || head === "urgent" ? head : null;
    return { intent, region: safeDecode(seg[2]), city: safeDecode(seg[3]) };
}

const inScope = (c: { region: string; city: string | null }, region: string | null, city: string | null) =>
    (!region || c.region === region) && (!city || c.city === city || cityShort(c.city) === city);

export default function GolfCourseHub() {
    const [path, setLocation] = useLocation();
    const { intent, region, city } = useMemo(() => parsePath(path), [path]);
    const { member } = useAuth();
    const golfOk = useGolfAccess();

    const list = useCourseList({ region, city, intent });
    const all = useCourseList({});             // 지도는 늘 전국 점을 그린다(지역을 고르면 그쪽으로 당겨 들어간다)
    const regions = useCourseRegions();
    const hub = useHubListings({ region, city, intent });
    // 목록 줄의 별이 켜져 있는지 — 목록 응답엔 '내 관심'이 없다(공개·60초 캐시라 사람마다 다른 값을 못 싣는다).
    const mine = useMyWatches(!!member);
    const watchOf = useMemo(() => new Map((mine.data ?? []).map((w) => [w.slug, { filters: w.filters as WatchFilters }])), [mine.data]);

    // 30초마다 시각을 새로 — '긴급 · 2시간 10분 뒤' 가 멈춰 있으면 안 된다.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(id); }, []);

    // 위치 — 앱 회원이거나 브라우저에서 이미 허락한 사람만 조용히 한 번 받는다.
    // 검색으로 막 들어온 방문자에게 첫 화면부터 위치 권한 창을 띄우면 그대로 나간다(2026-09-24 검토) — 그 사람은 '가까운 순'을 누를 때 묻는다.
    const { location, requestLocation, locationStatus } = useNativeBridge();
    const asked = useRef(false);
    useEffect(() => {
        if (asked.current || location || locationStatus) return;
        const auto = () => { asked.current = true; void requestLocation().catch(() => { /* 거리를 안 적을 뿐이다 */ }); };
        if (golfOk) { auto(); return; }
        const perms = typeof navigator !== "undefined" ? (navigator as any).permissions : null;
        perms?.query?.({ name: "geolocation" }).then((st: { state: string }) => { if (st.state === "granted") auto(); }).catch(() => {});
    }, [location, locationStatus, requestLocation, golfOk]);
    const me = location && isKoreaCoord(location.lat, location.lng) ? location : null;
    const askNear = () => { asked.current = true; void requestLocation().catch(() => {}); };

    // ── 숫자 ──
    const items = list.data ?? [];
    const sums = useMemo(() => {
        const s = { booking: 0, join: 0, urgent: 0 };
        for (const c of items) { s.booking += c.counts.booking; s.join += c.counts.join; s.urgent += c.counts.urgent; }
        return s;
    }, [items]);
    const courseCount = items.length;
    const listingCount = intent ? sums[intent] : sums.booking + sums.join; // 긴급은 조인 안에 이미 들어 있다

    // ── 제목·검색엔진 ──
    const seoOpts = { intent, region, city };
    const fullTitle = listTitle(seoOpts);
    const heading = fullTitle.replace(/ \| 랭큐 골프$/, "");
    const [headMain, headSub] = heading.split(" — ");
    const canonical = listPath(seoOpts);
    const regionLabel = region ? (REGION_LABEL[region] ?? region) : null;
    const crumbs = useMemo(() => {
        const out = [{ name: intent ? `전국 ${INTENT_TABS.find((t) => t.intent === intent)!.label}` : "전국 골프장", path: listPath({ intent }) }];
        if (region) out.push({ name: regionLabel!, path: listPath({ intent, region }) });
        if (region && city) out.push({ name: cityShort(city), path: listPath({ intent, region, city }) });
        return out;
    }, [intent, region, city, regionLabel]);
    const jsonLd = useMemo(() => (crumbs.length > 1 ? {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: ORIGIN + c.path })),
    } : null), [crumbs]);
    useSeo(list.isSuccess ? {
        title: fullTitle,
        description: listDescription({ ...seoOpts, courseCount, listingCount }),
        path: canonical,
        jsonLd,
    } : null);

    // ── 지도 ──
    const dots: MapDot[] = useMemo(() => (all.data ?? []).filter((c) => c.lat != null && c.lng != null).map((c) => {
        const on = inScope(c, region, city);
        const k = c.counts;
        const tone: MapDot["tone"] = !on ? "dim"
            : intent ? (k[intent] > 0 ? intent : "on")
            : k.urgent > 0 ? "urgent" : k.join > 0 ? "join" : k.booking > 0 ? "booking" : "on";
        return { key: c.slug, lat: c.lat!, lng: c.lng!, tone };
    }), [all.data, region, city, intent]);
    const focus = useMemo(() => (region ? dots.filter((d) => d.tone !== "dim") : null), [dots, region]);

    // ── 목록: 검색·정렬·쪽 ──
    const [q, setQ] = useState("");
    const [sort, setSort] = useState<Sort>("rec");
    const [limit, setLimit] = useState(PAGE);
    const [listingLimit, setListingLimit] = useState(LISTING_PAGE);
    useEffect(() => { setLimit(PAGE); setListingLimit(LISTING_PAGE); }, [intent, region, city, q, sort]);
    // '가까운 순'은 위치가 올 때까지 기다린다(누르면 묻는다) — 거부되면 추천으로 돌아간다.
    useEffect(() => { if (sort === "near" && !me && locationStatus && locationStatus !== "granted") setSort("rec"); }, [sort, me, locationStatus]);
    // 특징 필터(오너가 준 자료 — 더블이글 칩처럼): 노캐디·2인·3인 가능·잔디. 여러 개면 전부 만족(AND).
    const [feats, setFeats] = useState<string[]>([]);
    const [onlyWatched, setOnlyWatched] = useState(false);
    useEffect(() => { setLimit(PAGE); }, [feats, onlyWatched]);

    const kmOf = useMemo(() => {
        const m = new Map<string, number>();
        if (me) for (const c of items) if (c.lat != null && c.lng != null) m.set(c.slug, distanceKm(me.lat, me.lng, c.lat, c.lng));
        return m;
    }, [items, me]);

    const shown: CourseListItem[] = useMemo(() => {
        const rows = items.filter((c) => matchesCourseQuery(c, q)
            && feats.every((f) => (c.play ?? []).includes(f) || (c.grass ?? []).includes(f))
            && (!onlyWatched || watchOf.has(c.slug)));
        if (sort === "near") rows.sort((a, b) => (kmOf.get(a.slug) ?? 1e9) - (kmOf.get(b.slug) ?? 1e9));
        else if (sort === "price") rows.sort((a, b) => (b.price?.price ?? -1) - (a.price?.price ?? -1) || a.name.localeCompare(b.name, "ko"));
        else if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name, "ko"));
        return rows;
    }, [items, q, sort, kmOf, feats, onlyWatched, watchOf]);

    const cities = useMemo(() => (region ? regions.data?.find((r) => r.region === region)?.cities ?? [] : []), [regions.data, region]);
    const regionCount = (r: string) => regions.data?.find((x) => x.region === r)?.courses;
    const totalCourses = regions.data?.reduce((n, r) => n + r.courses, 0);

    const openListing = (l: HubListing) => {
        // 목록 화면은 그날 하루치만 불러온다 — 날짜를 붙여야 그 글이 보인다(상세의 TeeTimes 와 같은 주소).
        const to = `/golf/booking-list/${encodeURIComponent(l.id)}?date=${kstDateKey(l.datetime)}&view=${l.listingType === "JOIN" ? "JOIN" : "BOOKING"}`;
        if (golfOk) setLocation(to);
        else if (!member) goLogin(setLocation, to);
        else setLocation(`/golf/course/${encodeURIComponent(l.slug)}`); // 골프를 안 쓰는 회원 — 글 목록은 닫혀 있으니 골프장 페이지로
    };

    const backTo = city ? listPath({ intent, region }) : region ? listPath({ intent }) : intent ? "/golf/courses" : member ? "/dashboard" : "/";
    const hubRows = hub.data ?? [];
    const tabColor = INTENT_TABS.find((t) => t.intent === intent)!.color;

    return (
        <CourseShell backTo={backTo}>
            {/* ── 머리 ── */}
            <div className="px-4 pt-4 pb-4">
                {crumbs.length > 1 && (
                    <nav aria-label="위치" className="mb-2 flex items-center gap-1 text-[13px] text-[#FFFFFF73] min-w-0">
                        {crumbs.map((c, i) => (
                            <span key={c.path} className="flex items-center gap-1 min-w-0">
                                {i > 0 && <LucideChevronRight className="w-3.5 h-3.5 shrink-0 text-[#FFFFFF40]" />}
                                {i < crumbs.length - 1
                                    ? <Link href={c.path} className="truncate active:text-[#FFFFFF]">{c.name}</Link>
                                    : <span className="truncate text-[#FFFFFFB3]">{c.name}</span>}
                            </span>
                        ))}
                    </nav>
                )}
                <h1 className="leading-tight tracking-tight">
                    <span className="block text-[26px] font-bold text-[#FFFFFF]">{headMain}</span>
                    {headSub && <span className="mt-1 block text-[14px] font-medium text-[#FFFFFF8C]">{headSub}</span>}
                </h1>
                <p className="mt-2 text-[13px] text-[#FFFFFF73] tabular-nums h-[18px]">
                    {list.isSuccess && (
                        <>골프장 {courseCount.toLocaleString()}곳 · 지금 올라온 {intent ? INTENT_NOUN[intent] : "글"} <span style={{ color: listingCount ? tabColor === "#FFFFFF" ? "#8BE84A" : tabColor : undefined }}>{listingCount}</span></>
                    )}
                </p>
            </div>

            {/* ── 지도 + 의도 ── 점 하나가 골프장 한 곳, 색이 들어온 점이 지금 글이 있는 곳 */}
            <section className="mx-4 rounded-3xl border border-[#FFFFFF14] bg-[#FFFFFF08] overflow-hidden flex">
                <div className="w-[132px] sm:w-[172px] shrink-0 border-r border-[#FFFFFF0F] bg-[#FFFFFF05] relative">
                    <CourseDotMap dots={dots} focus={focus} aspect={0.62} className="absolute inset-0 w-full h-full" />
                    {regionLabel && (
                        <span className="absolute left-2.5 top-2.5 text-[12px] font-medium text-[#FFFFFF8C]">
                            {city ? cityShort(city) : regionLabel}
                        </span>
                    )}
                </div>
                <nav aria-label="보기" className="flex-1 min-w-0 p-2 flex flex-col gap-1">
                    {INTENT_TABS.map((t) => {
                        const active = t.intent === intent;
                        const n = t.intent ? sums[t.intent] : courseCount;
                        return (
                            <Link
                                key={t.label}
                                href={listPath({ intent: t.intent, region, city })}
                                aria-current={active ? "page" : undefined}
                                className={cn("h-12 rounded-2xl px-3 flex items-center gap-2.5 transition-colors", !active && "active:bg-[#FFFFFF0A]")}
                                style={active ? { backgroundColor: `${t.color}1F` } : undefined}
                            >
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.intent ? t.color : "#FFFFFF8C" }} />
                                <span className={cn("text-[14px] truncate", active ? "font-semibold" : "font-medium text-[#FFFFFFB3]")} style={active ? { color: t.intent ? t.color : "#FFFFFF" } : undefined}>
                                    {t.label}
                                </span>
                                <span className={cn("ml-auto text-[19px] font-semibold tabular-nums", n ? "text-[#FFFFFF]" : "text-[#FFFFFF40]")}>
                                    {list.isSuccess ? n.toLocaleString() : "·"}
                                </span>
                            </Link>
                        );
                    })}
                </nav>
            </section>

            {/* ── 지역 · 시군 ── */}
            <div className="mt-4 flex gap-1.5 overflow-x-auto scrollbar-hide px-4">
                <Chip href={listPath({ intent })} active={!region} label="전국" n={totalCourses} />
                {GOLF_REGIONS.map((r) => (
                    <Chip key={r} href={listPath({ intent, region: r })} active={region === r} label={r} n={regionCount(r)} />
                ))}
            </div>
            {region && cities.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide px-4">
                    <Chip small href={listPath({ intent, region })} active={!city} label={`${region} 전체`} />
                    {cities.map((c) => (
                        <Chip
                            key={c.city} small href={listPath({ intent, region, city: c.short })}
                            active={city === c.short || city === c.city} label={c.short} n={c.courses}
                            live={(intent ? c.counts[intent] : c.counts.booking + c.counts.join) > 0 ? (intent ? INTENT_TABS.find((t) => t.intent === intent)!.color : "#64DD17") : undefined}
                        />
                    ))}
                </div>
            )}

            {/* ── 지금 올라온 글(의도 허브만) ── */}
            {intent && (
                <section className="mt-6">
                    <h2 className="px-4 mb-2 flex items-center gap-2 text-[16px] font-semibold text-[#FFFFFF]">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tabColor }} />
                        지금 올라온 {INTENT_NOUN[intent]}
                        {hubRows.length > 0 && <span className="text-[#FFFFFF73] font-medium tabular-nums">{Math.max(listingCount, hubRows.length)}</span>}
                    </h2>
                    {hub.isPending ? (
                        <div className="mx-4 h-[68px] rounded-2xl bg-[#FFFFFF08] animate-pulse" />
                    ) : hubRows.length === 0 ? (
                        <p className="mx-4 rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF08] px-4 py-3.5 text-[13px] leading-relaxed text-[#FFFFFF8C]">
                            지금 올라온 {INTENT_NOUN[intent]}이 없어요. 골프장 옆 <span className="text-[#FFFFFF]">☆</span>을 눌러 두면 올라올 때 알려 드려요.
                        </p>
                    ) : (
                        <>
                            <ul className="mx-4 rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF08] overflow-hidden divide-y divide-[#FFFFFF0F]">
                                {hubRows.slice(0, listingLimit).map((l) => <HubListingRow key={l.id} l={l} now={now} onOpen={openListing} />)}
                            </ul>
                            {hubRows.length > listingLimit && (
                                <MoreButton onClick={() => setListingLimit((n) => n + 20)} rest={hubRows.length - listingLimit} unit="건" />
                            )}
                        </>
                    )}
                </section>
            )}

            {/* ── 골프장 목록 ── */}
            <section className="mt-6 pb-6">
                <div className="px-4 flex items-baseline gap-2 mb-2">
                    <h2 className="text-[16px] font-semibold text-[#FFFFFF]">{city ? `${cityShort(city)} 골프장` : regionLabel ? `${regionLabel} 골프장` : "전국 골프장"}</h2>
                    {list.isSuccess && <span className="text-[14px] text-[#FFFFFF73] tabular-nums">{q ? `${shown.length} / ${courseCount}` : courseCount}</span>}
                </div>

                <div className="px-4">
                    <label className="h-11 rounded-xl bg-[#FFFFFF0D] border border-[#FFFFFF14] flex items-center gap-2 px-3 focus-within:border-[#64DD1766]">
                        <LucideSearch className="w-[18px] h-[18px] text-[#FFFFFF66] shrink-0" />
                        <input
                            value={q} onChange={(e) => setQ(e.target.value)}
                            placeholder="골프장 이름"
                            enterKeyHint="search"
                            className="flex-1 min-w-0 bg-transparent outline-none text-[16px] text-[#FFFFFF] placeholder:text-[#FFFFFF59]"
                        />
                        {q && (
                            <button type="button" onClick={() => setQ("")} aria-label="지우기" className="w-7 h-7 -mr-1 rounded-full flex items-center justify-center active:bg-[#FFFFFF14]">
                                <LucideX className="w-4 h-4 text-[#FFFFFF8C]" />
                            </button>
                        )}
                    </label>
                    <div className="mt-2 flex gap-1 overflow-x-auto scrollbar-hide">
                        {([["rec", "추천"], ["near", "가까운 순"], ["price", "시세 높은 순"], ["name", "이름순"]] as [Sort, string][]).map(([k, label]) => (
                            <button
                                key={k} type="button" onClick={() => { if (k === "near" && !me) askNear(); setSort(k); }} aria-pressed={sort === k}
                                className={cn(
                                    "h-8 px-3 rounded-full text-[13px] whitespace-nowrap shrink-0 transition-colors",
                                    sort === k ? "bg-[#FFFFFF] text-[#0A0A0A] font-semibold" : "text-[#FFFFFF99] font-medium active:bg-[#FFFFFF0F]",
                                )}
                            >{label}</button>
                        ))}
                    </div>
                    <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
                        {member && (
                            <FeatChip on={onlyWatched} onClick={() => setOnlyWatched((v) => !v)} label="☆ 내 관심" />
                        )}
                        {FEATURES.map(([k, label]) => (
                            <FeatChip key={k} on={feats.includes(k)} onClick={() => setFeats((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]))} label={label} />
                        ))}
                    </div>
                </div>

                <ul className="mt-3 mx-4 rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF08] overflow-hidden">
                    {list.isPending ? (
                        Array.from({ length: 6 }, (_, i) => <CourseRowSkeleton key={i} />)
                    ) : list.isError ? (
                        <li className="px-4 py-5 text-[13px] text-[#FFFFFF8C]">불러오지 못했어요.</li>
                    ) : shown.length === 0 ? (
                        <li className="px-4 py-5 text-[13px] text-[#FFFFFF8C]">{q ? `'${q}' 골프장이 없어요.` : feats.length || onlyWatched ? "조건에 맞는 골프장이 없어요." : "이 지역엔 골프장이 없어요."}</li>
                    ) : (
                        shown.slice(0, limit).map((c) => <CourseRow key={c.slug} c={c} km={kmOf.get(c.slug) ?? null} myWatch={watchOf.get(c.slug) ?? null} />)
                    )}
                </ul>
                {shown.length > limit && <MoreButton onClick={() => setLimit((n) => n + PAGE)} rest={shown.length - limit} unit="곳" />}
            </section>
        </CourseShell>
    );
}

/** 특징 필터 — 자료의 태그 이름 그대로 걸러 낸다(골프장 줄의 play·grass). */
const FEATURES: [string, string][] = [["노캐디", "노캐디"], ["2인가능", "2인 가능"], ["3인가능", "3인 가능"], ["양잔디", "양잔디"], ["한국잔디", "한국잔디"], ["벤트그라스", "벤트그라스"]];

function FeatChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button" onClick={onClick} aria-pressed={on}
            className={cn(
                "h-8 px-3 rounded-full border text-[13px] whitespace-nowrap shrink-0 transition-colors",
                on ? "bg-[#64DD171F] border-[#64DD1766] text-[#8BE84A] font-semibold" : "border-[#FFFFFF1A] text-[#FFFFFF99] font-medium active:bg-[#FFFFFF0F]",
            )}
        >{label}</button>
    );
}

function Chip({ href, active, label, n, small, live }: { href: string; active: boolean; label: string; n?: number; small?: boolean; live?: string }) {
    return (
        <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
                "shrink-0 rounded-full border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors",
                small ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-[14px]",
                active ? "bg-[#FFFFFF] border-[#FFFFFF] text-[#0A0A0A] font-semibold" : "border-[#FFFFFF1A] text-[#FFFFFFB3] font-medium active:bg-[#FFFFFF0F]",
            )}
        >
            {live && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: live }} />}
            {label}
            {n != null && <span className={cn("tabular-nums", active ? "text-[#0A0A0A8C]" : "text-[#FFFFFF59]")}>{n}</span>}
        </Link>
    );
}

function MoreButton({ onClick, rest, unit }: { onClick: () => void; rest: number; unit: string }) {
    return (
        <button
            type="button" onClick={onClick}
            className="mt-2 mx-4 w-[calc(100%-2rem)] h-11 rounded-xl border border-[#FFFFFF14] text-[14px] font-medium text-[#FFFFFFB3] active:bg-[#FFFFFF0A]"
        >
            더 보기 <span className="text-[#FFFFFF66] tabular-nums">{rest.toLocaleString()}{unit}</span>
        </button>
    );
}
