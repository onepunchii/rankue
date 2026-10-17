// 전국 낚시터 프리렌더(2026-10-18) — /fishing/spots(허브) · /fishing/spots/region/<시도> · /fishing/spots/type/<종류> · /fishing/spot/<id>.
// 본문은 shared/fishingPlaces 로 화면(client/src/fishing/spots)과 같은 글을 쓴다. 받은 칸만 적는다(지어 넣지 않는다).
// prerender.ts 와 서로 import 하는 모양이 되지만, 이 파일은 page · esc 를 함수 안에서만 부른다(최상위에서 호출하지 말 것).
import { page, esc } from "../prerender.js";
import { entry } from "../sitemap.js";
import { FISHING_PLACE_SOURCE, fishingSidoShort } from "../../shared/fishing.js";
import {
    FISHING_SPOTS_LABEL, FISHING_SPOTS_PATH, PLACE_KINDS, fishingRegionPath, fishingSpotPath, fishingTypePath, isPlaceId, nearbyPlaces, placeCounts, placeFeeText, placeKind, placeKindById,
    placeSeo, placeWhere, spotsHubSeo, spotsRegionSeo, spotsTypeSeo, type PublicPlace,
} from "../../shared/fishingPlaces.js";

import { fishingSpotCardUrl } from "../../shared/ogCards.js";
import { FISHING_PORTS } from "../../shared/fishingStations.js";
import { FISHING_SEA_LABEL, FISHING_SEA_PATH, fishingPortPath } from "../../shared/fishingSeaPages.js";
import { nearestPort } from "../../shared/fishingPlaces.js";
import { fishingFishPath, placeFishId } from "../../shared/fishingFishPages.js";
import { FISH } from "../../shared/fishingFish.js";

const ORIGIN = "https://www.rankue.co.kr";
export interface FishingRender { status: 200; tag: string; html: string }
/** 낚시터의 주소인가 — vercel.json 봇 라우트에도 같은 경로가 있어야 한다 */
export const FISHING_SPOTS_RE = /^\/fishing\/(?:spots(?:\/(?:region|type)\/[^/]+)?|spot\/[^/]+)\/?$/;

const crumbs = (...tail: [string, string][]) => ({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["랭큐", "/"], [FISHING_SPOTS_LABEL, FISHING_SPOTS_PATH], ...tail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })),
});
const line = (p: PublicPlace, km?: number | null) => {
    const bits = [placeWhere(p), placeKind(p.kind).short, p.species.length ? p.species.slice(0, 4).join(" · ") : "", placeFeeText(p.fee) ?? "", km != null ? `${km}km` : ""].filter(Boolean).join(" · ");
    return `      <li><a href="${fishingSpotPath(p.id)}">${esc(p.name)}</a>${bits ? ` — ${esc(bits)}` : ""}</li>`;
};
const nav = (all: readonly PublicPlace[]) => {
    const c = placeCounts(all);
    return `  <nav aria-label="낚시터 종류">
${PLACE_KINDS.filter((k) => c.kind.some(([id]) => id === k.id)).map((k) => `    <a href="${fishingTypePath(k.id)}">${esc(k.label)}</a>`).join("\n")}
  </nav>
  <nav aria-label="지역">
${c.sido.map(([s, n]) => `    <a href="${fishingRegionPath(s)}">${esc(s)} 낚시터(${n})</a>`).join("\n")}
  </nav>`;
};
const source = () => `  <p>자료: ${esc(FISHING_PLACE_SOURCE)}. 대상 어종 · 요금은 등록된 그대로이고 바뀌었을 수 있어요.</p>
  <p><a href="/?login=1">가입하고 조과 기록 · 어탁 모으기</a></p>`;

function listing(tag: string, path: string, seo: { title: string; description: string; h1: string }, lead: string, items: readonly PublicPlace[], all: readonly PublicPlace[], tail: [string, string][]): FishingRender {
    // 시군으로 묶어 적는다(지역 · 종류 페이지가 이름만 늘어선 목록이 되지 않게)
    const bySig = new Map<string, PublicPlace[]>();
    for (const p of items) { const k = placeWhere(p) || "기타"; if (!bySig.has(k)) bySig.set(k, []); bySig.get(k)!.push(p); }
    const fish = placeCounts(items).species.slice(0, 12);
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${FISHING_SPOTS_PATH}">${esc(FISHING_SPOTS_LABEL)}</a>${tail.length ? ` › ${esc(seo.h1)}` : ""}</nav>
  <h1>${esc(seo.h1)}</h1>
  <p>${esc(lead)}</p>
${fish.length ? `  <section>\n    <h2>많이 노리는 어종</h2>\n    <p>${fish.map(([f, n]) => `${esc(f)}(${n}곳)`).join(" · ")}</p>\n  </section>` : ""}
${[...bySig].map(([where, list]) => `  <section>
    <h2>${esc(where)} 낚시터 ${list.length}곳</h2>
    <ul>
${list.map((p) => line(p)).join("\n")}
    </ul>
  </section>`).join("\n")}
${nav(all)}
${source()}
</main>`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: seo.h1, numberOfItems: items.length, itemListElement: items.slice(0, 100).map((p, i) => ({ "@type": "ListItem", position: i + 1, name: p.name, url: `${ORIGIN}${fishingSpotPath(p.id)}` })) };
    return { status: 200, tag, html: page({ lang: "ko", title: seo.title, desc: seo.description, canonical: `${ORIGIN}${path}`, body, jsonLd: [list, crumbs(...tail)] }) };
}

export async function renderFishingSpots(path: string, all: readonly PublicPlace[]): Promise<FishingRender | null> {
    const p = path.replace(/\/+$/, "") || "/";
    if (p === FISHING_SPOTS_PATH) {
        const seo = spotsHubSeo(all.length);
        return listing("fishing:spots", p, seo, `전국 낚시터 ${all.length.toLocaleString("ko-KR")}곳을 지역 · 종류 · 어종으로 모았어요. 낚시터마다 대상 어종 · 요금 · 주소와 가까운 낚시터를 보여 줘요.`, all, all, []);
    }
    const reg = /^\/fishing\/spots\/region\/([^/]+)$/.exec(p);
    if (reg) {
        const s = decodeURIComponent(reg[1]);
        const items = all.filter((x) => fishingSidoShort(x.sido) === s);
        if (!items.length) return null;
        const seo = spotsRegionSeo(s, items.length);
        return listing(`fishing:region:${s}`, fishingRegionPath(s), seo, seo.description, items, all, [[seo.h1, fishingRegionPath(s)]]);
    }
    const typ = /^\/fishing\/spots\/type\/([^/]+)$/.exec(p);
    if (typ) {
        const k = placeKindById(typ[1]);
        if (!k) return null;
        const items = all.filter((x) => x.kind === k.raw);
        if (!items.length) return null;
        const seo = spotsTypeSeo(k.id, items.length);
        return listing(`fishing:type:${k.id}`, fishingTypePath(k.id), seo, seo.description, items, all, [[seo.h1, fishingTypePath(k.id)]]);
    }
    const one = /^\/fishing\/spot\/([^/]+)$/.exec(p);
    if (one) {
        const id = decodeURIComponent(one[1]);
        const pl = isPlaceId(id) ? all.find((x) => x.id === id) : null;
        if (!pl) return null;
        const seo = placeSeo(pl), k = placeKind(pl.kind), fee = placeFeeText(pl.fee), sido = fishingSidoShort(pl.sido);
        const near = nearbyPlaces(all, pl, 6);
        // 바다 낚시터는 가까운 항구의 물때표로 잇는다(화면의 '오늘 물때'와 같은 항구 — 40km 안)
        const port = nearestPort(FISHING_PORTS, pl);
        const same = all.filter((x) => x.id !== pl.id && x.sido === pl.sido && x.sigungu === pl.sigungu).slice(0, 10);
        const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${FISHING_SPOTS_PATH}">${esc(FISHING_SPOTS_LABEL)}</a> › <a href="${fishingRegionPath(sido)}">${esc(sido)} 낚시터</a> › ${esc(pl.name)}</nav>
  <h1>${esc(pl.name)}</h1>
  <p>${esc(`${placeWhere(pl)}의 ${k.label}`)}${pl.address ? ` · ${esc(pl.address)}` : ""}</p>
  <section>
    <h2>한눈에</h2>
    <dl>
      <dt>대상 어종</dt><dd>${pl.species.length ? pl.species.map((s) => { const id = placeFishId(s); const f = id ? FISH.find((x) => x.id === id) : null; return f ? `<a href="${fishingFishPath(f.name)}">${esc(s)}</a>` : esc(s); }).join(" · ") : "등록된 어종이 없어요"}</dd>
      <dt>요금</dt><dd>${esc(fee ?? "등록 안 됨")}</dd>
      <dt>종류</dt><dd><a href="${fishingTypePath(k.id)}">${esc(k.label)}</a></dd>
${pl.tel ? `      <dt>연락처</dt><dd>${esc(pl.tel)}</dd>\n` : ""}${pl.address ? `      <dt>주소</dt><dd>${esc(pl.address)}</dd>\n` : ""}    </dl>
  </section>
${near.length ? `  <section>\n    <h2>가까운 낚시터</h2>\n    <ul>\n${near.map((x) => line(x, x.km)).join("\n")}\n    </ul>\n  </section>` : ""}
${port ? `  <section>\n    <h2>오늘 물때</h2>\n    <p>가장 가까운 항구(${port.km}km): <a href="${fishingPortPath(port.name)}">${esc(port.name)} 물때표</a> · <a href="${FISHING_SEA_PATH}">${esc(FISHING_SEA_LABEL)}</a></p>\n  </section>` : ""}
${same.length && !near.length ? `  <section>\n    <h2>${esc(placeWhere(pl))}의 다른 낚시터</h2>\n    <ul>\n${same.map((x) => line(x)).join("\n")}\n    </ul>\n  </section>` : ""}
  <p><a href="${fishingRegionPath(sido)}">${esc(sido)} 낚시터 모두 보기</a> · <a href="${FISHING_SPOTS_PATH}">${esc(FISHING_SPOTS_LABEL)}</a></p>
${source()}${pl.dataDate ? `\n  <p>${esc(pl.dataDate)} 기준 자료</p>` : ""}
</main>`;
        const ld: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Place", name: pl.name, url: `${ORIGIN}${fishingSpotPath(pl.id)}`, ...(pl.address ? { address: { "@type": "PostalAddress", streetAddress: pl.address, addressRegion: pl.sido ?? undefined, addressLocality: pl.sigungu ?? undefined, addressCountry: "KR" } } : {}), ...(pl.lat != null && pl.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: pl.lat, longitude: pl.lng } } : {}), ...(pl.tel ? { telephone: pl.tel } : {}) };
        // 낚시터 카드 — 머리의 og:image 와 본문 제목 밑 그림이 같은 한 장(산 · 골프장의 검색용 화면과 같은 꼴)
        const card = { url: fishingSpotCardUrl(ORIGIN, pl.id), width: 1200, height: 1200, alt: `${pl.name} — ${placeWhere(pl)} ${k.label}` };
        const withCard = body.replace("</h1>", `</h1>\n  <img src="${esc(card.url)}" width="1200" height="1200" alt="${esc(card.alt)}" loading="eager">`);
        return { status: 200, tag: `fishing:spot:${pl.id}`, html: page({ lang: "ko", title: seo.title, desc: seo.description, canonical: `${ORIGIN}${fishingSpotPath(pl.id)}`, body: withCard, image: card, jsonLd: [{ ...ld, image: card.url }, crumbs([`${sido} 낚시터`, fishingRegionPath(sido)], [pl.name, fishingSpotPath(pl.id)])] }) };
    }
    return null;
}

export function fishingSitemapParts(all: readonly PublicPlace[], updated: string | null): string[] {
    if (!all.length) return [];
    const c = placeCounts(all);
    const at = (path: string, changefreq: string, priority: string) => entry(`${ORIGIN}${path}`, { changefreq, priority, lastmod: updated });
    return [
        at(FISHING_SPOTS_PATH, "weekly", "0.8"),
        ...PLACE_KINDS.filter((k) => c.kind.some(([id]) => id === k.id)).map((k) => at(fishingTypePath(k.id), "weekly", "0.6")),
        ...c.sido.map(([s]) => at(fishingRegionPath(s), "weekly", "0.6")),
        ...all.map((p) => entry(`${ORIGIN}${fishingSpotPath(p.id)}`, { changefreq: "monthly", priority: p.species.length ? "0.5" : "0.4", lastmod: updated, image: fishingSpotCardUrl(ORIGIN, p.id) })),
    ];
}
