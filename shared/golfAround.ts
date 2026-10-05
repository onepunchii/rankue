/**
 * 골프장 '근처'(먹거리·카페·숙소) — 네이버 지역 검색(2026-10-05 오너: "순서대로 하자"의 2번).
 *
 * 골프장 이름에 붙여 찾는 말 2위가 '맛집'이다(네이버 검색량: 날씨 100 · 맛집 30).
 * 검색어는 실측으로 골랐다(골프장 12곳): "{골프장 이름} 근처 맛집" 정확도순이 12곳 전부 5건 · 전부 10km 안(중앙 2.2km).
 * "이름 맛집"은 2곳이 0건, "시군 맛집"은 13km 밖이었다. 카페 6/6 · 숙소 5/6 도 같은 꼴로 잘 나온다.
 *
 * 메뉴 칩(같은 날 저녁 — 오너: "사진이 아니더라도 이모지 및 아이콘을 활용하자" → 제안 → "순서대로"의 1번):
 *   사진 없이 메뉴의 느낌을 내려고 탭 셋(맛집·카페·숙소)을 이모지 칩으로 넓혔다. 낱말도 실측으로 골랐다
 *   (골프장 8곳 × 다섯 곳씩, 10km 안에 든 비율): 빵집 98 · 삼겹살 98 · 한우 95 · 중국집 92 · 칼국수 90 · 치킨 88 · 해장국 86 · 한정식 86 · 냉면 85.
 *   뺀 낱말 — '국수'(돼지고기구이가 섞인다 → 칼국수), '고기집'(오리·백숙이 섞인다 → 한우·삼겹살), '파전' 62, '아침식사' 72(건수도 모자란다),
 *   '횟집'(내륙에서는 멀리 간다 — 춘천 0/5). 낱말을 보태려면 같은 식으로 재고 넣을 것.
 *   · 이모지는 **우리 칩의 것**이다. 결과 줄 앞의 그림도 손님이 누른 칩의 그림이지 네이버 분류값에서 뽑은 게 아니다 — 결과 글자는 그대로 둔다.
 *   · 이모지는 2017년 이전 것만 — 오래된 안드로이드에서 빈 네모가 안 나오게. 그래서 냉면은 🧊(2019)이 아니라 ❄️.
 *   · 날씨가 첫 칩을 고른다(menuForBrief) — 라운드 브리핑의 한 줄 평(shared/golfRoundBrief)에서. 규칙이지 추천 점수가 아니다.
 *     술을 권하는 말은 쓰지 않는다(다들 차를 몰고 온다).
 *
 * 네이버 검색 API 특약(2026-09-07 시행 — 기사 요약으로 확인) 때문에 지키는 것 — 바꾸기 전에 약관 원문을 볼 것:
 *   · 저장·캐싱 금지 → 열 때마다 실시간으로 부른다. DB·CDN·검색엔진용 화면에 두지 않는다.
 *   · 가공 금지 → 순서·낱말 그대로. 거리로 거르거나 다시 줄 세우지 않고, 거리 표시도 얹지 않는다.
 *   · 결과가 나오는 화면에 광고 금지 · AI 활용(요약 등) 금지.
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙).
 */
import { partOfHour, type RoundBrief } from "./golfRoundBrief.js";

/** 칩 하나 — key 는 주소에 실리는 값(?kind=), word 는 검색어에 붙는 낱말이자 칩 글자 */
export const NEARBY_MENUS = [
    { key: "food", word: "맛집", emoji: "🍽️" },
    { key: "haejang", word: "해장국", emoji: "🍲" },
    { key: "kalguksu", word: "칼국수", emoji: "🍜" },
    { key: "hanwoo", word: "한우", emoji: "🥩" },
    { key: "pork", word: "삼겹살", emoji: "🥓" },
    { key: "chicken", word: "치킨", emoji: "🍗" },
    { key: "hanjeongsik", word: "한정식", emoji: "🍚" },
    { key: "chinese", word: "중국집", emoji: "🥟" },
    { key: "naengmyeon", word: "냉면", emoji: "❄️" },
    { key: "bakery", word: "빵집", emoji: "🥐" },
    { key: "cafe", word: "카페", emoji: "☕" },
    { key: "stay", word: "숙소", emoji: "🛏️" },
] as const;
export type NearbyMenu = (typeof NEARBY_MENUS)[number];
export type NearbyKind = NearbyMenu["key"];
export const NEARBY_KINDS: readonly NearbyKind[] = NEARBY_MENUS.map((m) => m.key);
const BY_KEY = new Map<string, NearbyMenu>(NEARBY_MENUS.map((m) => [m.key, m]));
export const NEARBY_WORD = Object.fromEntries(NEARBY_MENUS.map((m) => [m.key, m.word])) as Record<NearbyKind, string>;
export const isNearbyKind = (v: unknown): v is NearbyKind => typeof v === "string" && BY_KEY.has(v);
export const nearbyMenu = (kind: NearbyKind): NearbyMenu => BY_KEY.get(kind) ?? NEARBY_MENUS[0];

/** 네이버에 보내는 검색어 — 화면의 '네이버 지도에서 더 보기'도 같은 말로 연다 */
export const nearbyQuery = (courseName: string, kind: NearbyKind) => `${courseName} 근처 ${NEARBY_WORD[kind]}`;

/** 화면에 까는 칩 — 냉면은 여름(6~8월)이거나 지금 골라져 있을 때만(겨울에 냉면 칩은 뜬금없다) */
export function menuChips(current: NearbyKind, month: number): NearbyMenu[] {
    const summer = month >= 6 && month <= 8;
    return NEARBY_MENUS.filter((m) => m.key !== "naengmyeon" || summer || current === "naengmyeon");
}

/** 날씨가 고른 첫 칩과 그 까닭 한 줄 */
export interface MenuPick { kind: NearbyKind; line: string }
/**
 * 라운드 브리핑 → 첫 칩. 한 줄 평의 갈래(tone)를 그대로 따른다:
 * 눈·추위는 해장국, 비·바람은 칼국수, 더위는 냉면, 라베 날씨는 고기. 별일 없는 날은 부에 맞춰(1부는 치기 전 한 그릇).
 */
export function menuForBrief(b: Pick<RoundBrief, "tone" | "teeHour" | "minTmp" | "pop">): MenuPick {
    switch (b.tone) {
        case "snow": return { kind: "haejang", line: "눈 오는 날엔 뜨끈한 국물" };
        case "rain": return { kind: "kalguksu", line: "비 오는 날엔 칼국수 한 그릇" };
        case "cold":
            if (b.minTmp != null && b.minTmp <= 0) return { kind: "haejang", line: "언 몸 녹이는 뜨끈한 국물" };
            return { kind: "haejang", line: b.teeHour < 10 ? "쌀쌀한 새벽 티, 뜨끈한 국물부터" : "쌀쌀한 날엔 뜨끈한 국물" };
        case "wind": return { kind: "kalguksu", line: "바람 맞은 날엔 따뜻한 국물" };
        case "heat": return { kind: "naengmyeon", line: "더운 날엔 시원한 냉면" };
        case "night": return { kind: "food", line: "야간 라운드, 치기 전에 든든하게" };
        case "good": return { kind: "hanwoo", line: "라베 날씨, 끝나고 고기 한 판" };
        default: {
            if ((b.pop ?? 0) >= 30) return { kind: "kalguksu", line: "비 소식 있는 날엔 따뜻한 칼국수" };
            const part = partOfHour(b.teeHour);
            if (part === 1) return { kind: "haejang", line: "티오프 전에 든든하게 한 그릇" };
            return { kind: "food", line: part === 2 ? "점심 먹고 여유 있게 티오프" : "라운드 전에 이른 저녁" };
        }
    }
}

/** 네이버 지도 검색 주소(앱이 있으면 앱으로 넘어간다). 결과에 가게 주소(link)는 대개 비어 있어 이름으로 찾아 준다. */
export const naverMapSearchUrl = (query: string) => `https://map.naver.com/p/search/${encodeURIComponent(query)}`;

/** 한 곳 — 네이버가 준 글 그대로(강조 태그만 뗀다) */
export interface NearbyPlace { name: string; category: string; address: string }
export interface NearbyResult { query: string; items: NearbyPlace[] }

/** 응답의 강조 태그(<b>)를 떼고 HTML 엔티티를 글자로 — 낱말은 건드리지 않는다 */
export function plainText(s: unknown): string {
    return String(s ?? "").replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();
}
