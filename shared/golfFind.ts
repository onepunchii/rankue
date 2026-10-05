/**
 * 조건으로 찾는 골프장 목록 — 2인 플레이 · 노캐디 · 3인 플레이
 * (2026-10-05 오너: "이모지 및 아이콘을 활용하자 … 우리만의 콘텐츠" → 제안 → "순서대로"의 3번).
 *
 * 왜: '2인 골프'(2인 라운딩·2인 골프·2인 플레이 골프장·2인 골프장) 검색이 '골프 조인'의 두 배다
 *   (네이버 검색어 트렌드 2025-10~2026-09, '골프장 날씨'=100 일 때 2인 80 · 조인 37 · 노캐디 32 · 3인 10).
 *   자료는 이미 있다 — golf_course_pages.play(오너가 준 304곳 자료, server/scripts/golf-course-dbegl.ts).
 *   허브에 필터 칩은 있었지만 화면 안 상태라 자기 주소가 없었다. 그리고 둘이 치려는 사람이 곧 조인 손님이다.
 *
 * 화면(client/src/golf/pages/GolfFind.tsx)과 검색엔진용 화면(server/prerender.ts renderGolfFind)이 같은 글을 쓴다.
 *  · 표시가 있는 곳만 싣는다(자료가 있는 골프장은 전체의 삼분의 일쯤이다). 없는 곳을 "안 된다"고 말하지 않는다.
 *  · 되는 요일·시간대·요금은 골프장마다 달라 적지 않는다 — "예약 전에 골프장에 확인"으로만.
 *  · 주소는 전국·지역까지만(/golf/find/:key[/:region]). 시군은 한두 곳이라 얇다.
 *  · 조인 설명은 실제 서비스 그대로(shared/golfGuide 머리말): 호스트 승인제 · 수수료 없음.
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */
import { GOLF_REGIONS, REGION_LABEL } from "./golfCourse.js";

export interface FindFeature {
    /** 주소에 실리는 값 */
    key: "2people" | "nocaddie" | "3people";
    /** 자료의 태그(golf_course_pages.play) */
    tag: string;
    /** 칩 글자 */
    label: string;
    /** 목록의 이름 — "…골프장" */
    noun: string;
    /** 같은 뜻으로 찾는 말(설명에만 쓴다) */
    alias: string;
    lead: string;
    /** 알아 둘 것 */
    points: readonly string[];
    /** 조인으로 잇는 한마디(없으면 잇지 않는다) */
    join?: string;
}

/** 순서 = 찾는 사람이 많은 순(2인 → 노캐디 → 3인) */
export const FIND_FEATURES: readonly FindFeature[] = [
    {
        key: "2people", tag: "2인가능", label: "2인 플레이", noun: "2인 플레이 가능 골프장", alias: "2인 라운딩",
        lead: "둘이서도 한 팀으로 티오프할 수 있는 골프장이에요. 보통은 서너 명이 한 팀이라, 둘이 가려면 2인 플레이를 받는 곳을 찾아야 해요.",
        points: [
            "2인 플레이를 받는 요일과 시간대는 골프장마다 달라요. 예약 전에 꼭 확인해요.",
            "카트비와 캐디피는 팀 단위예요. 둘이 나누면 한 사람 몫이 커져요.",
            "가려는 날 2인 플레이가 안 된다면, 조인으로 남는 자리를 채우는 방법이 있어요.",
        ],
        join: "둘이 가는데 자리가 남나요? 조인으로 두 자리를 채워 보세요.",
    },
    {
        key: "nocaddie", tag: "노캐디", label: "노캐디", noun: "노캐디 골프장", alias: "셀프 라운드",
        lead: "캐디 없이 치는 셀프 라운드가 되는 골프장이에요. 캐디피가 들지 않는 대신 거리 확인과 클럽 선택, 카트 운전을 직접 해요.",
        points: [
            "노캐디가 되는 요일과 시간대, 코스는 골프장마다 달라요. 예약 전에 꼭 확인해요.",
            "카트를 직접 몰아요. 카트 길을 지키고 앞 팀과의 간격을 맞추는 게 중요해요.",
            "거리측정기와 볼마커, 그립 닦을 수건을 챙기면 편해요.",
        ],
    },
    {
        key: "3people", tag: "3인가능", label: "3인 플레이", noun: "3인 플레이 가능 골프장", alias: "3인 라운딩",
        lead: "세 명이 한 팀으로 티오프할 수 있는 골프장이에요. 네 명을 다 못 채웠을 때 찾게 돼요.",
        points: [
            "3인 플레이를 받는 요일과 시간대는 골프장마다 달라요. 추가 요금을 받는 곳도 있으니 예약 전에 확인해요.",
            "카트비와 캐디피는 팀 단위예요. 셋이 나누면 한 사람 몫이 조금 늘어요.",
            "한 자리가 비었다면 조인으로 채울 수도 있어요.",
        ],
        join: "한 자리가 비었나요? 조인으로 채워 보세요.",
    },
];
export type FindKey = FindFeature["key"];
const BY_KEY = new Map<string, FindFeature>(FIND_FEATURES.map((f) => [f.key, f]));
export const isFindKey = (v: unknown): v is FindKey => typeof v === "string" && BY_KEY.has(v);
export const findFeature = (key: FindKey): FindFeature => BY_KEY.get(key)!;
export const hasFindTag = (c: { play?: readonly string[] | null }, f: FindFeature): boolean => (c.play ?? []).includes(f.tag);
export const isFindRegion = (v: unknown): v is string => typeof v === "string" && (GOLF_REGIONS as readonly string[]).includes(v);

export function findPath(key: FindKey, region?: string | null): string {
    return `/golf/find/${key}${region ? `/${encodeURIComponent(region)}` : ""}`;
}
const whereOf = (region?: string | null) => (region ? (REGION_LABEL[region] ?? region) : "전국");

/** 큰 제목 — "전국 2인 플레이 가능 골프장" */
export function findHeading(key: FindKey, region?: string | null): string {
    return `${whereOf(region)} ${findFeature(key).noun}`;
}
export function findTitle(o: { key: FindKey; region?: string | null; count: number }): string {
    return `${findHeading(o.key, o.region)} ${o.count}곳${o.region ? "" : " — 지역별 목록"} | 랭큐 골프`;
}
export function findDescription(o: { key: FindKey; region?: string | null; count: number }): string {
    const f = findFeature(o.key);
    return `${whereOf(o.region)}에서 ${f.label}(${f.alias})가 되는 골프장 ${o.count}곳. 그린피와 지금 올라온 부킹·조인까지 한 번에. 되는 요일과 시간대는 예약 전에 골프장에 확인해요.`;
}

/** 목록 아래의 안내 — 자료의 한계를 그대로 말한다 */
export const FIND_NOTE = "랭큐가 확인한 곳만 실었어요. 여기 없는 골프장도 될 수 있으니, 가려는 곳은 직접 확인해 주세요.";
export const FIND_JOIN_LABEL = "조인 찾기";

/** 자주 묻는 것 — 숫자는 지금 목록에서 센 값 */
export function findFaq(o: { key: FindKey; count: number; byRegion: readonly { region: string; count: number }[] }): { q: string; a: string }[] {
    const f = findFeature(o.key);
    const regions = o.byRegion.filter((r) => r.count > 0).map((r) => `${REGION_LABEL[r.region] ?? r.region} ${r.count}곳`).join(", ");
    const where = { q: `${f.label}${o.key === "nocaddie" ? "로 칠 수 있는" : "가 되는"} 골프장은 어디인가요?`, a: `랭큐가 확인한 ${f.noun}은 전국 ${o.count}곳이에요${regions ? `(${regions})` : ""}. 되는 요일과 시간대는 골프장마다 달라서 예약 전에 확인이 필요해요.` };
    const joinA = "랭큐 골프의 조인으로 남는 자리를 채울 수 있어요. 티타임을 잡은 사람이 글을 올리면 신청이 오고, 올린 사람이 보고 승인해요. 수수료는 없어요.";
    if (o.key === "2people") return [where, { q: "둘이서 골프 치러 가는데 2인 플레이가 안 되면 어떻게 하나요?", a: joinA }];
    if (o.key === "3people") return [where, { q: "세 명인데 한 자리를 채우고 싶으면 어떻게 하나요?", a: joinA }];
    return [where, { q: "노캐디 라운드에는 뭘 더 챙기나요?", a: "거리측정기와 볼마커, 여분의 공, 그립 닦을 수건을 챙겨요. 클럽 선택과 카트 운전을 직접 하니 처음 가는 코스라면 코스 안내도 미리 봐 두면 좋아요." }];
}

/** 지역별 개수 — 지역 순서대로(0곳도 싣는다; 화면은 0곳을 흐리게, 사이트맵·링크는 0곳을 뺀다) */
export function findRegionCounts<T extends { region: string }>(matched: readonly T[]): { region: string; count: number }[] {
    return GOLF_REGIONS.map((region) => ({ region, count: matched.filter((c) => c.region === region).length }));
}
