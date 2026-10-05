/**
 * 골프장 페이지의 화면 쪽 계약(2026-09-24) — 목록·상세·허브 화면이 같이 쓴다.
 * 서버: server/routes/modules/golfCourses.ts (로그인 없이 읽힌다. 관심 등록만 로그인).
 * 규칙(제목·주소·돈 표기): shared/golfCourse.ts — 서버 프리렌더와 같은 함수다.
 *
 * ⚠️ 슬러그는 한글이다. URL 에 넣을 때는 반드시 encodeURIComponent(coursePath/listPath 가 해 준다).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Fees, GolfIntent, PublicListing } from "@shared/golfCourse";
import type { CourseWeather } from "@shared/golfWeather";
import type { NearbyKind, NearbyResult } from "@shared/golfAround";

export const COURSES_KEY = "/api/hiq/golf-courses";

export interface CourseCounts { booking: number; join: number; urgent: number }
export interface CourseListItem {
    slug: string; name: string; region: string; city: string | null; kind: string | null; holes: number | null;
    lat: number | null; lng: number | null; hasFees: boolean; hasIntro: boolean;
    /** 대표 시세(만원) — '일반' → '개인' → 가장 비싼 종목 */
    price: { price: number; change: number | null; label: string } | null;
    counts: CourseCounts;
    /** 가장 가까운 티타임(ISO) */
    nextTee: string | null;
    /** 관심 등록한 사람 수 */
    watchers: number;
    /** /img/golf-logos/<id>.png — 흰 바탕 워드마크라 흰 로고판 위에 얹는다 */
    logo: string | null;
    /** 한국잔디 · 양잔디 · 벤트그라스 */
    grass: string[];
    /** 3인가능 · 2인가능 · 노캐디 */
    play: string[];
    /** 대표 그린피(원) — 그린피 표가 없는 곳의 참고값 */
    feeFrom: number | null;
    /** 옛 이름·다른 이름(구 큐로CC 등) */
    aliases: string[];
    /** 부킹·조인 글이 붙을 수 있는가(false 면 관심 알림도 오지 않는다 — 버튼을 숨긴다) */
    bookable: boolean;
}
export interface PricePoint { d: string; p: number }
export interface CoursePrice {
    itemId: string; label: string; price: number; change: number | null;
    yearHigh: number | null; yearLow: number | null; asOf: string | null; history: PricePoint[];
}
export interface WatchFilters {
    days?: ("weekday" | "weekend")[];
    /** "1"·"2"·"3" 부 */
    parts?: ("1" | "2" | "3")[];
    kinds?: GolfIntent[];
    /** 1인 그린피 상한(원) */
    maxFee?: number;
    /** 조인 최소 빈자리 */
    minSeats?: number;
}
export interface CourseDetail {
    slug: string; name: string; region: string; city: string | null; address: string | null;
    lat: number | null; lng: number | null; kind: string | null; holes: number | null;
    /** 미니 지도에 찍을 자리(2026-10-05) — 골프장 좌표가 없거나 틀렸으면 시군 중심(approx). 옛 응답엔 없다 */
    spot?: { lat: number; lng: number; approx: boolean } | null;
    parts: { courseId: number; kind: string; holes: number | null }[] | null;
    /** 랭큐매치 코스별 파 */
    courses: { name: string; par: number; holes: number }[] | null;
    /** TGM 소개문 */
    intro: string | null;
    info: { opened: string | null; members: number | null; homepage: string | null; membershipTypes: string | null; membershipNotes: string | null } | null;
    fees: Fees | null;
    courseIds: number[];
    updatedAt: string;
    prices: CoursePrice[];
    listings: PublicListing[];
    counts: CourseCounts;
    nearby: (CourseListItem & { km: number | null })[];
    /** 이 골프장에서 끝난 랭큐매치 라운드 수 */
    rounds: number;
    watchers: number;
    /** 로그인한 내가 관심 등록했으면 조건, 아니면 null */
    myWatch: { filters: WatchFilters } | null;
    /** 이 골프장에서 내가 치는 티타임(내가 올린 조인·확정된 신청, 닷새 안) — 날씨를 그 시각에 맞춘다. 비로그인은 빈 목록 */
    myTees?: { id: string; datetime: string; listingType: "BOOKING" | "JOIN" }[];
    logo: string | null;
    grass: string[];
    play: string[];
    phone: string | null;
    website: string | null;
    feeFrom: number | null;
    aliases: string[];
    bookable: boolean;
}
export interface RegionNode {
    region: string; courses: number; counts: CourseCounts;
    cities: { city: string; short: string; courses: number; counts: CourseCounts }[];
}
export type HubListing = PublicListing & { slug: string; courseName: string; region: string; city: string | null };

const qs = (o: Record<string, string | null | undefined>) => {
    const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
    const s = p.toString(); return s ? `?${s}` : "";
};

/** enabled=false 면 받지 않고 캐시에 있는 것만 쓴다 — 화면에 들어올 때 받는 작은 지도(HereMap)가 쓴다 */
export function useCourseList(o: { region?: string | null; city?: string | null; intent?: GolfIntent | null } = {}, enabled = true) {
    return useQuery<CourseListItem[]>({
        queryKey: [COURSES_KEY, "list", o.region ?? null, o.city ?? null, o.intent ?? null],
        queryFn: () => apiRequest(`${COURSES_KEY}${qs({ region: o.region, city: o.city, intent: o.intent })}`),
        enabled,
        staleTime: 30_000,
        // 지역 칩을 누를 때마다 목록·숫자가 통째로 비었다가 다시 뜨지 않게
        placeholderData: keepPreviousData,
    });
}
export function useCourseRegions() {
    return useQuery<RegionNode[]>({ queryKey: [COURSES_KEY, "regions"], queryFn: () => apiRequest(`${COURSES_KEY}/regions`), staleTime: 60_000 });
}
export function useHubListings(o: { region?: string | null; city?: string | null; intent?: GolfIntent | null }) {
    return useQuery<HubListing[]>({
        queryKey: [COURSES_KEY, "listings", o.region ?? null, o.city ?? null, o.intent ?? null],
        queryFn: () => apiRequest(`${COURSES_KEY}/listings${qs({ region: o.region, city: o.city, intent: o.intent })}`),
        staleTime: 20_000, refetchInterval: 30_000,
    });
}
export function useCourseDetail(slug: string | null | undefined) {
    return useQuery<CourseDetail>({
        queryKey: [COURSES_KEY, "detail", slug],
        queryFn: () => apiRequest(`${COURSES_KEY}/${encodeURIComponent(slug!)}`),
        enabled: !!slug, staleTime: 20_000, refetchInterval: 30_000,
        // 없는 골프장(404)은 다시 물어도 없다 — 안내가 늦게 뜨지 않게
        retry: (n, e: any) => e?.status !== 404 && n < 1,
    });
}
/** 골프장 날씨(기상청) — 세 시간에 한 번 바뀌는 자료라 상세(30초)와 따로, 10분에 한 번만 다시 받는다. 없으면 null. */
export function useCourseWeather(slug: string | null | undefined) {
    return useQuery<CourseWeather | null>({
        queryKey: [COURSES_KEY, "weather", slug],
        queryFn: async () => {
            const r: any = await apiRequest(`${COURSES_KEY}/${encodeURIComponent(slug!)}/weather`);
            return r && Array.isArray(r.days) && Array.isArray(r.hours) ? (r as CourseWeather) : null;
        },
        enabled: !!slug, staleTime: 10 * 60_000, refetchInterval: 15 * 60_000, retry: 0,
    });
}
/**
 * 근처 맛집·카페·숙소(네이버 지역 검색) — 약관상 저장·캐싱이 안 되는 자료라 브라우저에서도 1분만 들고 있는다(탭을 오갈 때 깜박이지 않을 만큼).
 * 구역이 화면에 들어온 뒤(enabled)에만 부른다.
 */
export function useCourseNearby(slug: string | null | undefined, kind: NearbyKind, enabled: boolean, dish?: string | null) {
    return useQuery<NearbyResult>({
        queryKey: [COURSES_KEY, "nearby", slug, dish ? `dish:${dish}` : kind],
        queryFn: async () => {
            // 이 동네 대표 메뉴는 ?dish= 로 — 서버가 그 시군의 사전에 있는 낱말만 받는다
            const r: any = await apiRequest(`${COURSES_KEY}/${encodeURIComponent(slug!)}/nearby?${dish ? `dish=${encodeURIComponent(dish)}` : `kind=${kind}`}`);
            return { query: String(r?.query ?? ""), items: Array.isArray(r?.items) ? r.items : [] };
        },
        enabled: !!slug && enabled, staleTime: 60_000, gcTime: 60_000, retry: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
    });
}
export function useMyWatches(enabled: boolean) {
    return useQuery<{ slug: string; name: string; region: string; city: string | null; filters: WatchFilters; counts: CourseCounts }[]>({
        queryKey: [COURSES_KEY, "watches"], queryFn: () => apiRequest(`${COURSES_KEY}/watches/mine`), enabled, staleTime: 20_000,
    });
}
/** 옛 주소(/golf/course/74) → 슬러그 */
export async function slugForCourseId(courseId: number | string): Promise<string | null> {
    try { const r: any = await apiRequest(`${COURSES_KEY}/by-id/${encodeURIComponent(String(courseId))}`); return r?.slug ?? null; }
    catch { return null; }
}

/** 관심 등록·해제. 끝나면 목록·상세·내 관심을 전부 새로 받는다(숫자가 세 군데 뜬다). */
export function useCourseWatch(slug: string) {
    const qc = useQueryClient();
    const done = () => qc.invalidateQueries({ queryKey: [COURSES_KEY] });
    const watch = useMutation({
        mutationFn: (filters: WatchFilters = {}) => apiRequest(`${COURSES_KEY}/${encodeURIComponent(slug)}/watch`, { method: "PUT", body: { filters } }),
        onSuccess: done,
    });
    const unwatch = useMutation({
        mutationFn: () => apiRequest(`${COURSES_KEY}/${encodeURIComponent(slug)}/watch`, { method: "DELETE" }),
        onSuccess: done,
    });
    return { watch, unwatch };
}

// ── 지역 알림(2026-10-05) ─────────────────────────────────────────
/** 한 회원·한 지역에 한 줄. cities 가 비면 그 지역 전체. 조건은 관심 골프장과 같은 모양. */
export interface AreaAlert { region: string; cities: string[]; filters: WatchFilters }

export function useMyAreaAlerts(enabled: boolean) {
    return useQuery<AreaAlert[]>({
        queryKey: [COURSES_KEY, "alerts"], queryFn: () => apiRequest(`${COURSES_KEY}/alerts/mine`), enabled, staleTime: 20_000,
        // 배열이 아닌 응답(오프라인 껍데기의 HTML 등 — apiRequest 는 JSON 이 아니면 Response 를 그대로 돌려준다)은 빈 목록으로.
        // 안 그러면 .some()/.find() 에서 화면이 죽는다(흰 화면 원인 '비배열').
        select: (d) => (Array.isArray(d) ? d.filter((a) => a && typeof a.region === "string").map((a) => ({ region: a.region, cities: Array.isArray(a.cities) ? a.cities : [], filters: a.filters ?? {} })) : []),
    });
}

/** 지역 알림 켜기(조건 저장)·끄기 */
export function useAreaAlert() {
    const qc = useQueryClient();
    const done = () => qc.invalidateQueries({ queryKey: [COURSES_KEY, "alerts"] });
    const save = useMutation({
        mutationFn: (a: AreaAlert) => apiRequest(`${COURSES_KEY}/alerts/${encodeURIComponent(a.region)}`, { method: "PUT", body: { cities: a.cities, filters: a.filters } }),
        onSuccess: done,
    });
    const remove = useMutation({
        mutationFn: (region: string) => apiRequest(`${COURSES_KEY}/alerts/${encodeURIComponent(region)}`, { method: "DELETE" }),
        onSuccess: done,
    });
    return { save, remove };
}
