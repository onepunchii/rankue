// 바다 · 항구 물때 프리렌더(2026-10-18) — /fishing/sea(허브) · /fishing/sea/<해역> · /fishing/port/<항구>.
// 글은 shared/fishingSeaPages 로 화면(client/src/fishing/spots/SeaPages)과 같다. 값은 받은 그대로 — 받지 못한 칸은 적지 않는다.
// 특보 · 예보 · 조석은 deps 로 받는다(못 받거나 늦으면 null — 그래도 항구 · 해역 · 낚시터 목록은 나간다).
// prerender.ts 와 서로 import 하는 모양이라 page · esc 는 함수 안에서만 부른다(최상위에서 호출하지 말 것).
import { page, esc } from "../prerender.js";
import { entry } from "../sitemap.js";
import { SEA_AREAS, SEA_CAUTION, SEA_SOURCE, seaHeadline, seaNotes, type SeaArea, type SeaNow } from "../../shared/fishingSea.js";
import { SEA_FCST_SOURCE, waveText, windText, type SeaFcst } from "../../shared/fishingSeaFcst.js";
import { FISHING_PORTS } from "../../shared/fishingStations.js";
import { hhmm, tideRange, type PortBrief } from "../../shared/fishingPort.js";
import { tideDays, tideOf, tideWeekday, TIDE_PHASE_TEXT, TIDE_SEAS } from "../../shared/fishingTide.js";
import { FISHING_SPOTS_LABEL, FISHING_SPOTS_PATH, fishingSpotPath, nearestPort, placeWhere, type PublicPlace } from "../../shared/fishingPlaces.js";
import { FISHING_SEA_LABEL, FISHING_SEA_PATH, fishingPortPath, fishingSeaAreaPath, portByName, portSeo, portsOf, seaAreaById, seaAreaSeo, seaArt, seaHubSeo } from "../../shared/fishingSeaPages.js";
import { fishingSeaCardUrl } from "../../shared/ogCards.js";
import { fishingKstDay } from "../../shared/fishing.js";

const ORIGIN = "https://www.rankue.co.kr";
export interface FishingSeaRender { status: 200; tag: string; html: string }
/** 바다 · 항구의 주소인가 — vercel.json 봇 라우트에도 같은 경로가 있어야 한다 */
export const FISHING_SEA_RE = /^\/fishing\/(?:sea(?:\/[^/]+)?|port\/[^/]+)\/?$/;

export interface FishingSeaDeps {
    sea: () => Promise<SeaNow | null>;
    fcst: (area: string) => Promise<SeaFcst | null>;
    port: (code: string) => Promise<PortBrief | null>;
    places: () => Promise<readonly PublicPlace[]>;
}

const crumbs = (...tail: [string, string][]) => ({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["랭큐", "/"], [FISHING_SEA_LABEL, FISHING_SEA_PATH], ...tail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })),
});
const portLinks = (area: string, skip?: string) => portsOf(area).filter((p) => p.code !== skip).map((p) => `<a href="${fishingPortPath(p.name)}">${esc(p.name)} 물때</a>`).join(" · ");
const spotLine = (p: PublicPlace) => {
    const bits = [placeWhere(p), p.species.slice(0, 4).join(" · ")].filter(Boolean).join(" · ");
    return `      <li><a href="${fishingSpotPath(p.id)}">${esc(p.name)}</a>${bits ? ` — ${esc(bits)}` : ""}</li>`;
};
const seaSpotsOf = (all: readonly PublicPlace[], pick: (code: string, area: string) => boolean) =>
    all.filter((p) => { if (p.kind !== "바다") return false; const n = nearestPort(FISHING_PORTS, p); return !!n && pick(n.code, n.area); });
const nowLines = (a: SeaArea | null | undefined) => (a ? [seaHeadline(a), ...seaNotes(a)] : []);
const foot = () => `  <p>자료: ${esc(SEA_SOURCE)} · ${esc(SEA_FCST_SOURCE)} · 국립해양조사원 조석 예보 · 한국천문연구원 출몰시각. 받은 그대로 보여 주고, 바뀌었을 수 있어요. ${esc(SEA_CAUTION)}</p>
  <p><a href="${FISHING_SPOTS_PATH}">${esc(FISHING_SPOTS_LABEL)}</a> · <a href="/?login=1">가입하고 조과 기록 · 어탁 모으기</a></p>`;
const cover = (area: string, alt: string) => `  <img src="${ORIGIN}${seaArt(area)}" width="640" height="640" alt="${esc(alt)}" loading="eager">`;

/** 앞으로 4주 물때(서해 · 남해 동해 제주) — 음력으로 센 것, 바깥 자료 없음. 한국 달력을 모르는 환경이면 빈 글 */
const tideCalendar = (nowMs: number) => {
    const today = fishingKstDay(nowMs);
    return TIDE_SEAS.map((x) => {
        const days = tideDays(today, x.id, 28);
        if (!days.length) return "";
        return `  <section>
    <h2>${esc(x.name)} 물때표 — 앞으로 4주(${esc(x.note)})</h2>
    <ul>
${days.map((t) => `      <li>${Number(t.ymd.slice(5, 7))}월 ${Number(t.ymd.slice(8))}일(${tideWeekday(t.ymd)}) ${esc(t.name)}${t.mark ? ` · ${t.mark}` : ""} — 음력 ${t.lunar.month}월 ${t.lunar.day}일</li>`).join("\n")}
    </ul>
  </section>`;
    }).filter(Boolean).join("\n");
};

function hub(sea: SeaNow | null, nowMs = Date.now()): FishingSeaRender {
    const seo = seaHubSeo();
    const by = new Map((sea?.areas ?? []).map((a) => [a.id, a]));
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › ${esc(FISHING_SEA_LABEL)}</nav>
  <h1>${esc(seo.h1)}</h1>
  <p>${esc(seo.description)}</p>
${SEA_AREAS.map((a) => {
        const now = nowLines(by.get(a.id));
        return `  <section>
    <h2><a href="${fishingSeaAreaPath(a.id)}">${esc(a.name)} 바다</a> — ${esc(a.hint)}</h2>
${now.length ? `    <p>${esc(now.join(" · "))}${sea?.issued ? ` (${esc(sea.issued)} 발표)` : ""}</p>\n` : ""}    <p>${portLinks(a.id)}</p>
  </section>`;
    }).join("\n")}
${tideCalendar(nowMs)}
${foot()}
</main>`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: seo.h1, numberOfItems: FISHING_PORTS.length, itemListElement: FISHING_PORTS.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: `${p.name} 물때`, url: `${ORIGIN}${fishingPortPath(p.name)}` })) };
    const card = { url: fishingSeaCardUrl(ORIGIN, "all"), width: 1200, height: 1200, alt: seo.h1 };
    return { status: 200, tag: "fishing:sea", html: page({ lang: "ko", title: seo.title, desc: seo.description, canonical: `${ORIGIN}${FISHING_SEA_PATH}`, body, image: card, jsonLd: [list, crumbs()] }) };
}

function area(id: string, sea: SeaNow | null, fc: SeaFcst | null, all: readonly PublicPlace[]): FishingSeaRender | null {
    const a = seaAreaById(id);
    if (!a) return null;
    const seo = seaAreaSeo(a);
    const now = nowLines(sea?.areas.find((x) => x.id === id));
    const slots = Array.isArray(fc?.slots) ? fc!.slots.slice(0, 6) : [];
    const spots = seaSpotsOf(all, (_c, ar) => ar === id).slice(0, 30);
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${FISHING_SEA_PATH}">${esc(FISHING_SEA_LABEL)}</a> › ${esc(a.name)}</nav>
  <h1>${esc(seo.h1)}</h1>
${cover(id, `${a.name} 바다 — ${a.hint}`)}
  <p>${esc(seo.description)}</p>
${now.length ? `  <section>\n    <h2>지금 특보</h2>\n    <p>${esc(now.join(" · "))}${sea?.issued ? ` (${esc(SEA_SOURCE)} ${esc(sea.issued)} 발표)` : ""}</p>\n  </section>` : ""}
${slots.length ? `  <section>\n    <h2>반나절 해상예보</h2>\n    <ul>\n${slots.map((x) => `      <li>${esc(x.label)} — 물결 ${esc(waveText(x))} · ${esc(windText(x))}${x.wf ? ` · ${esc(x.wf)}` : ""}</li>`).join("\n")}\n    </ul>\n    <p>${esc(SEA_FCST_SOURCE)}${fc?.issued ? ` ${esc(fc.issued)} 발표` : ""}</p>\n  </section>` : ""}
  <section>
    <h2>${esc(a.name)} 항구 물때표</h2>
    <p>${portLinks(id)}</p>
  </section>
${spots.length ? `  <section>\n    <h2>${esc(a.name)}의 바다 낚시터</h2>\n    <ul>\n${spots.map(spotLine).join("\n")}\n    </ul>\n  </section>` : ""}
  <nav aria-label="다른 바다">
${SEA_AREAS.filter((x) => x.id !== id).map((x) => `    <a href="${fishingSeaAreaPath(x.id)}">${esc(x.name)} 바다</a>`).join("\n")}
  </nav>
${foot()}
</main>`;
    const card = { url: fishingSeaCardUrl(ORIGIN, id), width: 1200, height: 1200, alt: `${a.name} 바다 — ${a.hint}` };
    return { status: 200, tag: `fishing:sea:${id}`, html: page({ lang: "ko", title: seo.title, desc: seo.description, canonical: `${ORIGIN}${fishingSeaAreaPath(id)}`, body, image: card, jsonLd: [crumbs([seo.h1, fishingSeaAreaPath(id)])] }) };
}

function port(name: string, brief: PortBrief | null, all: readonly PublicPlace[], nowMs: number): FishingSeaRender | null {
    const p = portByName(name);
    if (!p) return null;
    const a = seaAreaById(p.area);
    const seo = portSeo(p);
    const day = brief?.day ?? fishingKstDay(nowMs);
    const tide = tideOf(day, a?.tide ?? "south");
    const turns = brief?.turns ?? [];
    const range = tideRange(turns);
    const spots = seaSpotsOf(all, (c) => c === p.code).slice(0, 12);
    const sun = brief?.sun;
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${FISHING_SEA_PATH}">${esc(FISHING_SEA_LABEL)}</a>${a ? ` › <a href="${fishingSeaAreaPath(a.id)}">${esc(a.name)}</a>` : ""} › ${esc(p.name)}</nav>
  <h1>${esc(seo.h1)}</h1>
${cover(p.area, `${p.name} 바다${a ? ` — ${a.name}` : ""}`)}
  <p>${esc(seo.description)}</p>
  <section>
    <h2>${esc(day)} ${esc(p.name)} 물때</h2>
${tide ? `    <p>${esc(`${tide.name} · ${TIDE_PHASE_TEXT[tide.phase]}`)} (음력 ${tide.lunar.month}월 ${tide.lunar.day}일)</p>\n` : ""}${turns.length ? `    <ul>\n${turns.map((t) => `      <li>${t.kind === "high" ? "만조" : "간조"} ${hhmm(t.min)} · ${t.cm}cm</li>`).join("\n")}\n    </ul>\n` : ""}${range != null ? `    <p>물높이 차 ${range}cm</p>\n` : ""}${sun?.rise != null && sun.set != null ? `    <p>해 뜸 ${hhmm(sun.rise)} · 해 짐 ${hhmm(sun.set)}${sun.at ? ` (한국천문연구원 ${esc(sun.at)})` : ""}</p>\n` : ""}${brief?.now?.wtemp != null ? `    <p>지금 수온 ${brief.now.wtemp.toFixed(1)}°</p>\n` : ""}  </section>
${spots.length ? `  <section>\n    <h2>이 물때를 쓰는 바다 낚시터</h2>\n    <ul>\n${spots.map(spotLine).join("\n")}\n    </ul>\n  </section>` : ""}
${a ? `  <section>\n    <h2>${esc(a.name)}의 다른 항구</h2>\n    <p>${portLinks(a.id, p.code)}</p>\n    <p><a href="${fishingSeaAreaPath(a.id)}">${esc(a.name)} 바다 예보 보기</a></p>\n  </section>` : ""}
${foot()}
</main>`;
    const card = { url: fishingSeaCardUrl(ORIGIN, p.name), width: 1200, height: 1200, alt: `${p.name} 물때표${a ? ` — ${a.name}` : ""}` };
    const ld = { "@context": "https://schema.org", "@type": "Place", name: `${p.name} 조위관측소`, url: `${ORIGIN}${fishingPortPath(p.name)}`, geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng }, image: card.url };
    return { status: 200, tag: `fishing:port:${p.code}`, html: page({ lang: "ko", title: seo.title, desc: seo.description, canonical: `${ORIGIN}${fishingPortPath(p.name)}`, body, image: card, jsonLd: [ld, crumbs(...(a ? [[`${a.name} 바다`, fishingSeaAreaPath(a.id)] as [string, string]] : []), [seo.h1, fishingPortPath(p.name)])] }) };
}

export async function renderFishingSea(path: string, deps: FishingSeaDeps, nowMs = Date.now()): Promise<FishingSeaRender | null> {
    const p = path.replace(/\/+$/, "") || "/";
    if (p === FISHING_SEA_PATH) return hub(await deps.sea().catch(() => null), nowMs);
    const ar = /^\/fishing\/sea\/([^/]+)$/.exec(p);
    if (ar) {
        const id = decodeURIComponent(ar[1]);
        if (!seaAreaById(id)) return null;
        const [sea, fc, all] = await Promise.all([deps.sea().catch(() => null), deps.fcst(id).catch(() => null), deps.places().catch(() => [] as PublicPlace[])]);
        return area(id, sea, fc, all);
    }
    const pt = /^\/fishing\/port\/([^/]+)$/.exec(p);
    if (pt) {
        let name: string;
        try { name = decodeURIComponent(pt[1]); } catch { return null; }
        const def = portByName(name);
        if (!def) return null;
        const [brief, all] = await Promise.all([deps.port(def.code).catch(() => null), deps.places().catch(() => [] as PublicPlace[])]);
        return port(name, brief, all, nowMs);
    }
    return null;
}

/** 사이트맵 — 허브 · 해역 일곱 · 항구 51. 물때는 날마다 바뀌어 daily. 그림은 카드(/og/fishing-sea) */
export function fishingSeaSitemapParts(today: string): string[] {
    const at = (path: string, key: string, priority: string) => entry(`${ORIGIN}${path}`, { changefreq: "daily", priority, lastmod: today, image: fishingSeaCardUrl(ORIGIN, key) });
    return [
        at(FISHING_SEA_PATH, "all", "0.7"),
        ...SEA_AREAS.map((a) => at(fishingSeaAreaPath(a.id), a.id, "0.6")),
        ...FISHING_PORTS.map((p) => at(fishingPortPath(p.name), p.name, p.main ? "0.6" : "0.5")),
    ];
}
