/**
 * 등산 — 철 따라 묶은 산(2026-10-13 오너: "산은 각 지역으로 묶어도 되고 특성으로 묶고 다양한 스탬프를 받을 수 있게 … 여러 가지 콘텐츠 추가로").
 *
 * 높이 · 섬처럼 숫자로 판정되지 않는 특성이라, **우리가 가진 소개 글에 그 말이 나오는 산**만 넣는다 — 산림청 100대 명산 100곳의 소개 글
 * (산림청 안내 · 공개 자료를 근거로 정리한 것, hiking_mountains.guide)에서 낱말로 뽑았다(2026-10-13 · 스크립트로 뽑고 눈으로 훑음).
 * "억새로 이름난 산"이라고 우리가 순위를 매긴 것이 아니다 — 화면도 "소개 글에 억새가 나오는 100대 명산"이라고 적는다(HikingFeature.note).
 * 글이 바뀌거나 산이 늘면 다시 뽑아 이 명단을 고친다. 뽑은 낱말:
 *   철쭉 · 진달래 · 참꽃 / 단풍 / 억새 / 설경 · 눈꽃 · 상고대 · 적설 · 겨울 산행
 *
 * 산의 id(받은 자료의 번호)로 적는다 — 이름이 같은 산이 많다(백운산 셋).
 * 순수 값만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
export type HikingFeatureId = "azalea" | "maple" | "reeds" | "snow";
export interface HikingFeature {
    id: HikingFeatureId;
    /** 묶음의 이름 */
    name: string;
    /** 철 — 목록의 오른쪽 한 줄 */
    season: string;
    /** 이 묶음을 어떻게 만들었는가(목록 화면의 설명) */
    note: string;
    /** 이 철인 달(1~12) — '지금 철의 산'을 고른다 */
    months: readonly number[];
}
export const HIKING_FEATURES: readonly HikingFeature[] = [
    { id: "azalea", name: "철쭉 · 진달래 산", season: "봄", note: "소개 글에 철쭉 · 진달래가 나오는 산림청 100대 명산", months: [4, 5] },
    { id: "maple", name: "단풍 산", season: "가을", note: "소개 글에 단풍이 나오는 산림청 100대 명산", months: [10, 11] },
    { id: "reeds", name: "억새 산", season: "가을", note: "소개 글에 억새가 나오는 산림청 100대 명산", months: [9, 10, 11] },
    { id: "snow", name: "눈꽃 산", season: "겨울", note: "소개 글에 설경 · 눈꽃이 나오는 산림청 100대 명산", months: [12, 1, 2] },
];
export const hikingFeature = (id: string | null | undefined): HikingFeature | undefined => HIKING_FEATURES.find((f) => f.id === id);

const IDS: Readonly<Record<HikingFeatureId, readonly string[]>> = {
    // 명지산 축령산 북한산 소백산 민주지산 황악산 금수산 계룡산 천태산 계방산 태백산 가리왕산 두타산 가리산 공작산 팔공산 주흘산 비슬산 지리산 황매산 천성산 화왕산 미륵산 모악산 백운산 깃대봉
    azalea: ["Q8528363", "Q5116393", "Q494652", "Q625589", "Q8533668", "Q5951990", "Q27279507", "Q496427", "Q626656", "Q623665", "Q625254", "Q5523374", "Q5317235", "Q626077", "Q626966", "Q624313", "Q6305114", "Q4917297", "Q483204", "Q5952045", "Q5091685", "Q5952091", "Q6873183", "Q6886370", "Q625808", "Q5565075"],
    // 명지산 운악산 천마산 도봉산 소요산 황악산 금수산 구병산 계룡산 천태산 태백산 오대산 가리왕산 점봉산 치악산 공작산 용화산 팔공산 지리산 미륵산 장안산 적상산 내장산 강천산 선운산 추월산 두륜산
    maple: ["Q8528363", "Q8528375", "Q5091679", "Q626000", "Q623938", "Q5951990", "Q27279507", "Q5614460", "Q496427", "Q626656", "Q625254", "Q491028", "Q5523374", "Q6180125", "Q5095160", "Q626966", "Q8055011", "Q624313", "Q483204", "Q6873183", "Q6154017", "Q8533740", "Q626648", "Q5521102", "Q7451618", "Q5118414", "Q5316834"],
    // 유명산 태화산 명성산 가지산 비슬산 성인봉 운문산 황석산 신불산 재약산 황매산 천성산 금정산 무학산 화왕산 장안산 백운산 월출산 천관산
    reeds: ["Q626674", "Q7674755", "Q6947377", "Q5517618", "Q4917297", "Q7451593", "Q7897128", "Q5952055", "Q7521890", "Q6121735", "Q5952045", "Q5091685", "Q482647", "Q624473", "Q5952091", "Q6154017", "Q625808", "Q482741", "Q5091668"],
    // 명지산 천마산 설악산 계방산 태백산 오대산 백덕산 팔공산 화왕산
    snow: ["Q8528363", "Q5091679", "Q482644", "Q623665", "Q625254", "Q491028", "Q4841252", "Q624313", "Q5952091"],
};
const BY_MOUNTAIN: ReadonlyMap<string, readonly HikingFeatureId[]> = (() => {
    const m = new Map<string, HikingFeatureId[]>();
    for (const f of HIKING_FEATURES) for (const id of IDS[f.id]) m.set(id, [...(m.get(id) ?? []), f.id]);
    return m;
})();
/** 그 산이 드는 철 묶음(산의 id) */
export const hikingFeaturesOf = (mountainId: string): readonly HikingFeatureId[] => BY_MOUNTAIN.get(mountainId) ?? [];
/** 묶음에 드는 산의 수 */
export const hikingFeatureSize = (id: HikingFeatureId): number => IDS[id].length;
/** 그 달(1~12)이 철인 묶음 — 10월이면 단풍 · 억새 */
export const hikingFeaturesInMonth = (month: number): HikingFeature[] => HIKING_FEATURES.filter((f) => f.months.includes(month));
