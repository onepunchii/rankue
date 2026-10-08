/**
 * 골프장 상세의 '이 근처 조인·부킹' 카드 — 셈(2026-10-08 오너: "각 개별 CC 페이지에 이 [점 지도] 카드 들어가면 어때? 조인·부킹 등 숫자만
 * 나오고 해당 카드 누르면 조인 페이지로 이동되게 — 조인 활성화" → 시안 둘을 보고 "시안 1 이 좋네").
 *
 * 화면(client AroundListings)은 그리기만 하고, 무엇을 세고 어디로 보낼지는 여기서 정한다.
 *
 *  · **이 골프장의 글은 세지 않는다** — 바로 위 '지금 이 골프장'이 보여 준다. 이 카드는 '그 밖의 근처'다.
 *  · 근처 = 같은 지역 묶음(경기·강원·충청·경상·전라·제주). 누르면 가는 목록(/golf/join/충청)과 범위가 같다.
 *  · 긴급은 조인 안에 이미 들어 있다(허브와 같은 셈) — 건수는 조인 + 부킹.
 *  · 상태 셋: near(근처에 있다) · far(근처엔 없고 다른 지역엔 있다) · empty(어디에도 없다).
 *    empty 에서는 0 을 늘어놓지 않는다 — 490개 페이지마다 '0건'이 뜨면 비어 있다는 광고가 된다. 올리기·알림으로 이끈다.
 *  · 숫자 줄에 0 인 칸은 없다(홈 '전국 골프장' 카드와 같은 약속).
 *
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */
import { listPath, type GolfIntent } from "./golfCourse.js";
import { hereTone } from "./golfHereMap.js";
import type { MapDot } from "./golfDotMap.js";

export interface AroundCounts { booking: number; join: number; urgent: number }
export interface AroundRow { slug: string; region: string; lat: number | null; lng: number | null; counts: AroundCounts }

const ZERO: AroundCounts = { booking: 0, join: 0, urgent: 0 };
const add = (a: AroundCounts, b: AroundCounts): AroundCounts => ({ booking: a.booking + b.booking, join: a.join + b.join, urgent: a.urgent + b.urgent });
/** 조인 + 부킹 — 긴급은 조인 안에 이미 들어 있다 */
export const aroundTotal = (c: AroundCounts): number => c.join + c.booking;

/**
 * 지도의 점 · 당겨 볼 범위 · 글 수.
 *  near = 같은 지역의 다른 골프장, far = 다른 지역, own = 이 골프장(문구를 고를 때만 쓴다).
 *  점은 전국을 다 찍는다(틀 밖은 안 보일 뿐) — 색은 허브 지도와 같은 뜻(긴급 > 조인 > 부킹, 아니면 흰 점).
 */
export function aroundData(rows: readonly AroundRow[], here: { slug: string; region: string }) {
    const dots: MapDot[] = [];
    const focus: { lat: number; lng: number }[] = [];
    let near = ZERO, far = ZERO, own = ZERO;
    for (const r of rows) {
        if (r.slug === here.slug) own = add(own, r.counts);
        else if (r.region === here.region) near = add(near, r.counts);
        else far = add(far, r.counts);
        if (r.lat == null || r.lng == null) continue;
        dots.push({ key: r.slug, lat: r.lat, lng: r.lng, tone: hereTone(r.counts, false) ?? "on" });
        if (r.region === here.region) focus.push({ lat: r.lat, lng: r.lng });
    }
    return { dots, focus, near, far, own };
}

export type AroundStatKey = "join" | "booking" | "urgent";
export interface AroundStat { key: AroundStatKey; label: string; n: number }
/** 숫자 줄 — 조인 · 부킹 · 긴급 순, **0 인 칸은 없다** */
export function aroundStats(c: AroundCounts): AroundStat[] {
    const all: AroundStat[] = [
        { key: "join", label: "조인", n: c.join },
        { key: "booking", label: "부킹", n: c.booking },
        { key: "urgent", label: "긴급", n: c.urgent },
    ];
    return all.filter((s) => s.n > 0);
}

export type AroundState = "near" | "far" | "empty";
export interface AroundView {
    state: AroundState;
    /** 제목 옆 건수 — near 일 때만(같은 지역의 다른 골프장) */
    n: number;
    /** 숫자 줄 — near 면 근처, far 면 다른 지역. empty 면 빈 배열 */
    stats: AroundStat[];
    /** 작은 글씨 한 줄(없으면 null) */
    note: string | null;
    /** 카드를 누르면 가는 곳 — empty 면 null(카드가 링크가 아니라 단추 둘을 품는다) */
    href: string | null;
    aria: string | null;
}

/** 조인이 하나라도 있으면 조인 목록으로, 부킹뿐이면 부킹 목록으로 — 빈 목록에 떨어뜨리지 않는다 */
const intentOf = (c: AroundCounts): GolfIntent => (c.join > 0 ? "join" : "booking");

export function aroundView(region: string, near: AroundCounts, far: AroundCounts, own: AroundCounts = ZERO): AroundView {
    const nearN = aroundTotal(near), farN = aroundTotal(far);
    if (nearN > 0) {
        const others = add(near, far);
        return {
            state: "near", n: nearN, stats: aroundStats(near),
            // 전국 합계는 다른 지역에도 글이 있을 때만 — 같은 숫자를 두 번 적지 않는다
            note: farN > 0 ? `전국 조인 ${others.join} · 부킹 ${others.booking}` : null,
            href: listPath({ intent: intentOf(near), region }),
            aria: `${region} 조인·부킹 ${nearN}건 보기`,
        };
    }
    if (farN > 0) {
        return {
            state: "far", n: 0, stats: aroundStats(far),
            // 이 골프장에 글이 있으면 '충청엔 아직 없어요'는 거짓이다
            note: aroundTotal(own) > 0 ? `${region}엔 이 골프장뿐이에요` : `${region}엔 아직 없어요`,
            href: listPath({ intent: intentOf(far) }),
            aria: "다른 지역 조인·부킹 보기",
        };
    }
    return { state: "empty", n: 0, stats: [], note: null, href: null, aria: null };
}
