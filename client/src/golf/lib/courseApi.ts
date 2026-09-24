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

export function useCourseList(o: { region?: string | null; city?: string | null; intent?: GolfIntent | null } = {}) {
    return useQuery<CourseListItem[]>({
        queryKey: [COURSES_KEY, "list", o.region ?? null, o.city ?? null, o.intent ?? null],
        queryFn: () => apiRequest(`${COURSES_KEY}${qs({ region: o.region, city: o.city, intent: o.intent })}`),
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
