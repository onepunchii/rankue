/**
 * 한 산이 두 줄로 실린 것을 하나로(2026-10-13).
 *
 * 받은 산 목록에는 같은 산이 두 번 들어 있기도 하다 — 한 줄은 백과 문서에서 온 것(글은 있는데 자리 · 좌표가 없다),
 * 다른 줄은 봉우리 자료에서 온 것(자리 · 코스는 있는데 글이 없다). 그대로 실으면 화면이 둘로 갈린다:
 * "객산"(글만 · 어느 권역에도 없음 · 지도 없음)과 "객산-하남"(코스 · 지도는 있는데 소개 글이 없음).
 * 여기 적힌 쌍은 글을 자리 있는 줄(into)로 옮기고, 자리 없는 줄(from)은 싣지 않는다. 옛 주소(fromSlug)는 into 의 화면으로 이어진다.
 *
 * 쌍을 고른 기준(운영 자료로 하나씩 확인 — 추정으로 넓히지 않는다):
 *   · 이름이 같고, 글이 그 산의 시군구를 직접 말하며(또는 같은 이름의 산이 하나뿐이고), 두 줄의 높이 차가 10m 안(한쪽 높이를 모르면 통과)
 *   · 자리 있는 줄에 이미 글이 있으면 넣지 않는다(덮어쓰지 않는다)
 * 뺀 것: 높이가 10m 넘게 다른 쌍(구룡산 · 금오산 · 남산 · 비음산 · 승달산 · 월아산 · 입암산 — 한 화면에 다른 높이 둘이 나란히 적힌다),
 *        거제 산방산(같은 이름의 제주 산방산과 다른 산이다).
 *
 * 쓰는 곳: server/scripts/hiking-import.ts(적재 때 from 을 싣지 않고 글을 into 로) · server/scripts/hiking-fold-twins.ts(이미 실린 줄 정리) ·
 *          server/storage/hiking.ts(옛 주소 → into) · client/src/hiking/pages/MountainPage.tsx(주소 바꿔 끼우기).
 */
export interface HikingTwin {
    /** 싣지 않는 줄(자리 없는 쪽)의 id */
    from: string;
    /** 그 줄이 쓰던 주소 */
    fromSlug: string;
    /** 남는 줄(자리 · 코스가 있는 쪽)의 id */
    into: string;
    intoSlug: string;
}

export const HIKING_TWINS: readonly HikingTwin[] = [
    { from: "Q16179588", fromSlug: "객산", into: "Q27308409", intoSlug: "객산-하남" },
    { from: "Q10855462", fromSlug: "괘방산", into: "osm10120376930", intoSlug: "괘방산-강릉" },
    { from: "Q108760717", fromSlug: "구릉산", into: "Q27308627", intoSlug: "구릉산-중랑" },
    { from: "Q16163179", fromSlug: "구봉산-2", into: "Q27308526", intoSlug: "구봉산-춘천" },
    { from: "Q12586193", fromSlug: "귀때기청봉-2", into: "Q27331145", intoSlug: "귀때기청봉" },
    { from: "Q16170363", fromSlug: "금병산-2", into: "Q27320241", intoSlug: "금병산-세종" },
    { from: "Q16160282", fromSlug: "노고산", into: "osm10252999028", intoSlug: "노고산-마포" },
    { from: "Q16166007", fromSlug: "대덕산-2", into: "Q27267549", intoSlug: "대덕산-김천" },
    { from: "Q12595840", fromSlug: "문학산-2", into: "osm3859800550", intoSlug: "문학산" },
    { from: "Q8533751", fromSlug: "미륵산-4", into: "Q27295764", intoSlug: "미륵산-익산" },
    { from: "Q16219891", fromSlug: "반론산", into: "osm10252984852", intoSlug: "반론산-정선" },
    { from: "Q16219899", fromSlug: "법화산", into: "osm7972716228", intoSlug: "법화산-함양" },
    { from: "Q12598158", fromSlug: "벽방산-2", into: "Q27270490", intoSlug: "벽방산" },
    { from: "Q20445839", fromSlug: "봉수산-3", into: "Q27270395", intoSlug: "봉수산" },
    { from: "Q4996147", fromSlug: "불갑산-2", into: "Q27270450", intoSlug: "불갑산" },
    { from: "Q16161172", fromSlug: "비학산", into: "Q27314389", intoSlug: "비학산-포항시북" },
    { from: "Q31175418", fromSlug: "상황봉-2", into: "Q27267787", intoSlug: "상황봉" },
    { from: "Q12601683", fromSlug: "선바위산", into: "osm10252867492", intoSlug: "선바위산-영월" },
    { from: "Q16174306", fromSlug: "성주산", into: "Q27267418", intoSlug: "성주산-보령" },
    { from: "Q12602555", fromSlug: "소요산-2", into: "Q27267477", intoSlug: "소요산-고창" },
    { from: "Q4064395", fromSlug: "아미산-2", into: "Q27288888", intoSlug: "아미산-당진" },
    { from: "Q12606619", fromSlug: "엄광산", into: "osm7465315219", intoSlug: "엄광산-서구" },
    { from: "Q18551086", fromSlug: "이성산", into: "Q27307224", intoSlug: "이성산-하남" },
    { from: "Q16188612", fromSlug: "인릉산", into: "Q27300939", intoSlug: "인릉산-서초" },
    { from: "Q12614437", fromSlug: "장령산", into: "osm10250636982", intoSlug: "장령산-옥천" },
    { from: "Q623937", fromSlug: "천등산-2", into: "Q27290125", intoSlug: "천등산-충주" },
    { from: "Q16168283", fromSlug: "천마산-3", into: "osm2668331254", intoSlug: "천마산-하남" },
    { from: "Q7674735", fromSlug: "태기산", into: "Q27267106", intoSlug: "태기산-횡성" },
];

const BY_FROM_SLUG: ReadonlyMap<string, string> = new Map(HIKING_TWINS.map((t) => [t.fromSlug, t.intoSlug]));
const FROM_IDS: ReadonlySet<string> = new Set(HIKING_TWINS.map((t) => t.from));
const SOURCE_OF: ReadonlyMap<string, string> = new Map(HIKING_TWINS.map((t) => [t.into, t.from]));

/** 옛 주소면 남은 산의 주소를, 아니면 그대로 */
export function twinSlug(slug: string): string {
    return BY_FROM_SLUG.get(slug) ?? slug;
}
/** 싣지 않는 줄인가 */
export function isTwinFrom(id: string): boolean {
    return FROM_IDS.has(id);
}
/** 남는 줄(into)에 글을 넘겨주는 줄(from)의 id — 없으면 null */
export function twinGuideSource(intoId: string): string | null {
    return SOURCE_OF.get(intoId) ?? null;
}
