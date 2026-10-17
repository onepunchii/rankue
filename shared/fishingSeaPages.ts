/**
 * 바다 · 항구 물때 공개 페이지(2026-10-18 — 전국 낚시터와 같은 결) — 화면 · 검색용 화면(server/seo/fishingSea) · 사이트맵이 같은 글을 쓴다.
 *
 *   /fishing/sea                오늘의 바다 — 해역 일곱 곳의 풍랑특보 · 항구 51곳
 *   /fishing/sea/<해역 id>       해역 하나 — 특보 · 반나절 해상예보 · 그 해역의 항구 · 바다 낚시터
 *   /fishing/port/<항구 이름>     항구 하나 — 오늘 만조 · 간조 · 물때 · 해 뜨고 지는 시각 · 지금 수온 · 부이 · 바다낚시지수 · 가까운 바다 낚시터
 *
 * 값은 기상청 · 국립해양조사원 · 천문연구원이 낸 그대로(받아 둔 것). '나가도 된다'고 말하지 않는다(shared/fishingSea 머리말).
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { SEA_AREAS, type SeaAreaDef } from "./fishingSea.js";
import { FISHING_PORTS, type FishingPort } from "./fishingStations.js";

export const FISHING_SEA_PATH = "/fishing/sea";
export const FISHING_SEA_LABEL = "오늘의 바다 · 물때";
export const fishingSeaAreaPath = (id: string) => `${FISHING_SEA_PATH}/${encodeURIComponent(id)}`;
export const fishingPortPath = (name: string) => `/fishing/port/${encodeURIComponent(name)}`;
export const seaAreaById = (id: string): SeaAreaDef | null => SEA_AREAS.find((a) => a.id === id) ?? null;
export const portByName = (name: string): FishingPort | null => FISHING_PORTS.find((p) => p.name === name.normalize("NFC")) ?? null;
export const portsOf = (area: string): FishingPort[] => FISHING_PORTS.filter((p) => p.area === area);
/** 해역의 표지 그림(client/public/fishing/art/sea-<해역>.webp) */
export const seaArt = (area: string) => `/fishing/art/sea-${seaAreaById(area)?.id ?? "south-west"}.webp`;

export function seaHubSeo(): { title: string; description: string; h1: string } {
    return { h1: "오늘의 바다 · 물때", title: "오늘의 바다 — 해역별 풍랑특보 · 항구 물때표 51곳 | 랭큐 낚시", description: "서해 · 남해 · 동해 · 제주 해역 일곱 곳의 풍랑특보와 반나절 해상예보, 항구 51곳의 오늘 만조 · 간조를 기상청 · 국립해양조사원 자료로 보여 줘요." };
}
export function seaAreaSeo(a: SeaAreaDef): { title: string; description: string; h1: string } {
    const ports = portsOf(a.id).map((p) => p.name);
    return { h1: `${a.name} 바다`, title: `${a.name} 바다 — 풍랑특보 · 해상예보 · 물때(${a.hint}) | 랭큐 낚시`, description: `${a.name}(${a.hint}) 바다의 지금 풍랑특보와 반나절 해상예보(물결 · 바람), 항구 ${ports.length}곳(${ports.slice(0, 5).join(" · ")})의 오늘 물때를 보여 줘요.` };
}
export function portSeo(p: FishingPort): { title: string; description: string; h1: string } {
    const a = seaAreaById(p.area);
    return { h1: `${p.name} 물때`, title: `${p.name} 물때표 — 오늘 만조 · 간조 · 수온${a ? ` · ${a.name}` : ""} | 랭큐 낚시`, description: `${p.name}의 오늘 만조 · 간조 시각과 물때, 해 뜨고 지는 시각, 지금 수온과 가까운 부이의 파고, 바다낚시지수를 국립해양조사원 자료로 보여 줘요.` };
}

/** 바다 · 항구 카드의 글(server/services/fishingSpotCard 와 같은 틀) — 우리 표에 있는 key 만, 아니면 null. 날마다 바뀌는 값은 넣지 않는다(메신저가 카드를 오래 기억한다) */
export function fishingSeaCardInput(key: string): { name: string; place: string; detail: string; kind: string; fish: null; cover: string; badge: string } | null {
    if (key === "all") return { name: "오늘의 바다 · 물때", place: `해역 ${SEA_AREAS.length}곳 · 항구 ${FISHING_PORTS.length}곳`, detail: "풍랑특보 · 해상예보 · 만조 · 간조 · 수온", kind: "sea", fish: null, cover: "sea-south-east", badge: "오늘의 바다" };
    const a = seaAreaById(key);
    if (a) return { name: `${a.name} 바다`, place: a.hint, detail: `풍랑특보 · 해상예보 · 항구 ${portsOf(a.id).length}곳 물때`, kind: "sea", fish: null, cover: `sea-${a.id}`, badge: "오늘의 바다" };
    const p = portByName(key);
    const pa = p ? seaAreaById(p.area) : null;
    if (p) return { name: `${p.name} 물때`, place: pa ? `${pa.name} · ${pa.hint}` : "조위관측소", detail: "만조 · 간조 · 물때 · 수온 · 해 뜨고 짐", kind: "sea", fish: null, cover: `sea-${pa?.id ?? "south-west"}`, badge: "물때표" };
    return null;
}
