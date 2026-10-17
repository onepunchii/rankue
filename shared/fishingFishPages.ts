/**
 * 낚시 어종 공개 페이지(2026-10-18 — 낚시터 · 바다 물때 다음 갈래) — 화면(client/src/fishing/spots/FishPages) · 검색용 화면(server/seo/fishingFish) · 사이트맵 · 카드가 같은 글을 쓴다.
 *
 *   /fishing/fish            낚시 어종 — 어탁이 있는 22종(바다 16 · 민물 6)
 *   /fishing/fish/<어종 이름>  어종 한 장 — 낚시꾼이 부르는 크기(낙관) · 금어기 · 금지체장 · 오늘 좋은 곳 · 이 어종을 노리는 낚시터 · 위판장 · 어종 이야기
 *
 * **어종 정보를 지어 쓰지 않는다.** 실리는 것은 우리 표(shared/fishingFish 의 단계 — 낚시계의 관행) · 오너가 준 도감(위키백과 CC BY-SA 를 다시 쓴 글, 출처 · 라이선스와 함께) ·
 * 수산자원관리법 시행령 별표(regs) · 낚시터 표의 대상 어종 · 국립해양조사원 낚시지수 · 위판 건수뿐이다. 없는 칸은 적지 않는다.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { FISH, fishByName, fishValueText, type FishKind } from "./fishingFish.js";
import { FISH_REG_NAMES } from "./fishingFishInfo.js";
import { speciesKey, type PublicPlace } from "./fishingPlaces.js";
import { josa } from "./briefingMeta.js";

export const FISHING_FISH_PATH = "/fishing/fish";
export const FISHING_FISH_LABEL = "낚시 어종";
export const fishingFishPath = (name: string) => `${FISHING_FISH_PATH}/${encodeURIComponent(name)}`;
/** 주소의 이름으로 — 우리 표에 있는 어종만 */
export const fishBySlug = (s: string): FishKind | null => fishByName(s.normalize("NFC"));
export const waterWord = (f: Pick<FishKind, "water">) => (f.water === "sea" ? "바다" : "민물");

/**
 * 낚시터 표의 대상 어종 이름 → 우리 어종. 이름이 꼭 같을 때와, 같은 물고기의 다른 이름일 때만(조피볼락 = 우럭, 넙치 = 광어, 베스 = 배스 표기).
 * 향어(이스라엘잉어) · 떡붕어 · 돔류 같은 것은 다른 물고기이거나 무엇인지 몰라 잇지 않는다.
 */
const PLACE_ALIAS: Readonly<Record<string, string>> = { 조피볼락: "우럭", 넙치: "광어", 베스: "배스" };
export const placeFishId = (s: string): string | null => { const k = speciesKey(s); return fishByName(PLACE_ALIAS[k] ?? k)?.id ?? null; };
export const spotsOfFish = <P extends Pick<PublicPlace, "species">>(all: readonly P[], id: string): P[] => all.filter((p) => p.species.some((s) => placeFishId(s) === id));
/** 어종마다 노리는 낚시터 수 */
export function fishSpotCounts(all: readonly Pick<PublicPlace, "species">[]): Map<string, number> {
    const m = new Map<string, number>();
    for (const p of all) for (const id of new Set(p.species.map(placeFishId).filter((x): x is string => !!x))) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
}

/** "3짜 30cm · 4짜 40cm · 5짜 50cm" */
export const tierLine = (f: FishKind) => f.tiers.map((t) => `${t.name} ${fishValueText(f.unit, t.min)}`).join(" · ");
export const hasRegs = (f: Pick<FishKind, "id">) => (FISH_REG_NAMES[f.id] ?? []).length > 0;
/** 바다 어종 먼저, 표의 차례대로 */
export const FISH_PAGES: readonly FishKind[] = [...FISH.filter((f) => f.water === "sea"), ...FISH.filter((f) => f.water === "fresh")];

export function fishHubSeo(): { title: string; description: string; h1: string } {
    const sea = FISH.filter((f) => f.water === "sea").length, fresh = FISH.length - sea;
    return { h1: "낚시 어종", title: `낚시 어종 ${FISH.length}종 — 감성돔 · 우럭 · 붕어 · 배스의 크기 기준 · 금어기 · 낚시터 | 랭큐 낚시`, description: `바다 ${sea}종 · 민물 ${fresh}종의 어탁과 낚시꾼이 부르는 크기(월척 · 4짜 · 런커 …), 금어기 · 금지체장, 그 어종을 노리는 낚시터를 모았어요.` };
}
export function fishPageSeo(f: FishKind, spots: number): { title: string; description: string; h1: string } {
    const tiers = f.tiers.slice(0, 3).map((t) => t.name).join(" · ");
    const bits = [`${tiers} 기준`, hasRegs(f) ? "금어기 · 금지체장" : null, spots > 0 ? `${f.name} 낚시터 ${spots}곳` : null].filter(Boolean).join(" · ");
    const desc = [`낚시꾼이 부르는 ${f.name}의 크기(${tierLine(f)})`, hasRegs(f) ? "금어기 · 금지체장(수산자원관리법 시행령)" : null, spots > 0 ? `${josa(f.name, "을/를")} 노리는 낚시터 ${spots}곳` : null, f.water === "sea" ? "오늘 바다낚시지수 · 위판장 소식" : null].filter(Boolean).join(", ");
    return { h1: `${f.name} 낚시`, title: `${f.name} 낚시 — ${bits} | 랭큐 낚시`, description: `${desc} — 한 장에 모았어요.` };
}

/** 카드 글(server/services/fishingSpotCard 와 같은 틀 — 표지는 바다/저수지 판화, 어탁은 그 어종) */
export function fishCardInput(f: FishKind, spots: number): { name: string; place: string; detail: string; kind: string; fish: string; badge: string } {
    return { name: f.name, place: `${waterWord(f)} 낚시 · ${f.tiers.slice(0, 3).map((t) => t.name).join(" · ")}`, detail: [hasRegs(f) ? "금어기 · 금지체장" : null, spots > 0 ? `낚시터 ${spots}곳` : null].filter(Boolean).join(" · "), kind: f.water === "sea" ? "sea" : "reservoir", fish: f.id, badge: "어종 한 장" };
}
