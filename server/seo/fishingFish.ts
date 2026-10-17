// 낚시 어종 프리렌더(2026-10-18) — /fishing/fish(허브) · /fishing/fish/<어종 이름>. 글은 shared/fishingFishPages 로 화면(client/src/fishing/spots/FishPages)과 같다.
// 도감 글 · 금어기 표는 오너가 준 자료(server/assets/fishing/fish-pages.json — server/scripts/fishing-fish-pages.ts 가 옮긴 것) 그대로, 출처 · 라이선스와 함께.
// 어종 정보를 지어 쓰지 않는다. prerender.ts 와 서로 import 하는 모양이라 page · esc 는 함수 안에서만 부른다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { page, esc } from "../prerender.js";
import { entry } from "../sitemap.js";
import { fishValueText, type FishKind } from "../../shared/fishingFish.js";
import { FISHING_SPOTS_LABEL, FISHING_SPOTS_PATH, fishingSpotPath, placeWhere, type PublicPlace } from "../../shared/fishingPlaces.js";
import { FISHING_FISH_LABEL, FISHING_FISH_PATH, FISH_PAGES, fishBySlug, fishHubSeo, fishPageSeo, fishSpotCounts, fishingFishPath, spotsOfFish, tierLine, waterWord } from "../../shared/fishingFishPages.js";
import { fishingFishCardUrl } from "../../shared/ogCards.js";

const ORIGIN = "https://www.rankue.co.kr";
export interface FishingFishRender { status: 200; tag: string; html: string }
/** 어종의 주소인가 — vercel.json 봇 라우트에도 같은 경로가 있어야 한다 */
export const FISHING_FISH_RE = /^\/fishing\/fish(?:\/[^/]+)?\/?$/;

interface FishAsset { basis: string; fish: Record<string, { guide: { key: string; name: string; intro: string; sections: { h: string; b: string }[]; sources: { name: string; title?: string; url?: string; license?: string | null }[] } | null; regs: { kind: string; name: string; rule: string }[] }> }
let asset: FishAsset | null = null;
export function fishAsset(): FishAsset {
    if (asset) return asset;
    const candidates = [path.join(process.cwd(), "server/assets/fishing/fish-pages.json"), path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/fishing/fish-pages.json")];
    for (const c of candidates) if (fs.existsSync(c)) { asset = JSON.parse(fs.readFileSync(c, "utf8")) as FishAsset; return asset; }
    return { basis: "", fish: {} };
}

const crumbs = (...tail: [string, string][]) => ({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["랭큐", "/"], [FISHING_FISH_LABEL, FISHING_FISH_PATH], ...tail].map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${p}` })),
});
const signup = () => `  <p><a href="/?login=1">가입하고 조과 기록 · 어탁 모으기</a> · <a href="${FISHING_SPOTS_PATH}">${esc(FISHING_SPOTS_LABEL)}</a></p>`;

function hub(all: readonly PublicPlace[]): FishingFishRender {
    const seo = fishHubSeo();
    const n = fishSpotCounts(all);
    const group = (water: "sea" | "fresh") => FISH_PAGES.filter((f) => f.water === water).map((f) => `      <li><a href="${fishingFishPath(f.name)}">${esc(f.name)}</a> — ${esc(tierLine(f))}${n.get(f.id) ? ` · 낚시터 ${n.get(f.id)}곳` : ""}</li>`).join("\n");
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › ${esc(FISHING_FISH_LABEL)}</nav>
  <h1>${esc(seo.h1)}</h1>
  <p>${esc(seo.description)}</p>
  <section>
    <h2>바다 낚시 어종</h2>
    <ul>
${group("sea")}
    </ul>
  </section>
  <section>
    <h2>민물 낚시 어종</h2>
    <ul>
${group("fresh")}
    </ul>
  </section>
  <p>크기의 이름(월척 · 4짜 · 런커 …)은 낚시꾼이 부르는 관행이에요 — 법의 기준(금지체장)은 어종마다 따로 적어요.</p>
${signup()}
</main>`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: seo.h1, numberOfItems: FISH_PAGES.length, itemListElement: FISH_PAGES.map((f, i) => ({ "@type": "ListItem", position: i + 1, name: `${f.name} 낚시`, url: `${ORIGIN}${fishingFishPath(f.name)}` })) };
    return { status: 200, tag: "fishing:fish", html: page({ lang: "ko", title: seo.title, desc: seo.description, canonical: `${ORIGIN}${FISHING_FISH_PATH}`, body, jsonLd: [list, crumbs()] }) };
}

function one(f: FishKind, all: readonly PublicPlace[]): FishingFishRender {
    const spots = spotsOfFish(all, f.id);
    const seo = fishPageSeo(f, spots.length);
    const a = fishAsset(), info = a.fish[f.id];
    const g = info?.guide ?? null, regs = info?.regs ?? [];
    const others = FISH_PAGES.filter((x) => x.water === f.water && x.id !== f.id);
    const card = { url: fishingFishCardUrl(ORIGIN, f.id), width: 1200, height: 1200, alt: `${f.name} 어탁 — ${waterWord(f)} 낚시` };
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${FISHING_FISH_PATH}">${esc(FISHING_FISH_LABEL)}</a> › ${esc(f.name)}</nav>
  <h1>${esc(seo.h1)}</h1>
  <img src="${esc(card.url)}" width="1200" height="1200" alt="${esc(card.alt)}" loading="eager">
  <p>${esc(seo.description)}</p>
  <section>
    <h2>낚시꾼이 부르는 크기</h2>
    <ul>
${f.tiers.map((t) => `      <li>${esc(t.name)} — ${esc(fishValueText(f.unit, t.min))}부터</li>`).join("\n")}
    </ul>
    <p>낚시계의 관행이에요. 법의 기준이 아니에요.</p>
  </section>
${regs.length ? `  <section>\n    <h2>금어기 · 금지체장</h2>\n    <ul>\n${regs.map((r) => `      <li>${r.kind === "closed" ? "금어기" : "금지체장"}${r.name !== f.name ? `(${esc(r.name)})` : ""} — ${esc(r.rule)}</li>`).join("\n")}\n    </ul>\n    <p>${esc(a.basis)}. 지역 · 해역 고시가 따로 있을 수 있어요.</p>\n  </section>` : ""}
${spots.length ? `  <section>\n    <h2>${esc(f.name)} 낚시터 ${spots.length}곳</h2>\n    <ul>\n${spots.slice(0, 30).map((p) => `      <li><a href="${fishingSpotPath(p.id)}">${esc(p.name)}</a>${placeWhere(p) ? ` — ${esc(placeWhere(p))}` : ""}</li>`).join("\n")}\n    </ul>\n  </section>` : ""}
${g ? `  <section>\n    <h2>${esc(g.name)} 이야기</h2>\n    <p>${esc(g.intro)}</p>\n${g.sections.map((s) => `    <h3>${esc(s.h)}</h3>\n    <p>${esc(s.b)}</p>`).join("\n")}\n    <p>출처: ${g.sources.map((s) => esc([s.name, s.title, s.license].filter(Boolean).join(" · "))).join(" / ")}</p>\n  </section>` : ""}
  <nav aria-label="다른 어종">
${others.map((x) => `    <a href="${fishingFishPath(x.name)}">${esc(x.name)} 낚시</a>`).join("\n")}
  </nav>
${signup()}
</main>`;
    return { status: 200, tag: `fishing:fish:${f.id}`, html: page({ lang: "ko", title: seo.title, desc: seo.description, canonical: `${ORIGIN}${fishingFishPath(f.name)}`, body, image: card, jsonLd: [crumbs([seo.h1, fishingFishPath(f.name)])] }) };
}

export async function renderFishingFish(p0: string, places: () => Promise<readonly PublicPlace[]>): Promise<FishingFishRender | null> {
    const p = p0.replace(/\/+$/, "") || "/";
    if (p === FISHING_FISH_PATH) return hub(await places().catch(() => []));
    const m = /^\/fishing\/fish\/([^/]+)$/.exec(p);
    if (!m) return null;
    let name: string;
    try { name = decodeURIComponent(m[1]); } catch { return null; }
    const f = fishBySlug(name);
    return f ? one(f, await places().catch(() => [])) : null;
}

/** 사이트맵 — 허브 · 22종. 그림은 어종 카드(/og/fishing-fish) */
export function fishingFishSitemapParts(updated: string | null): string[] {
    return [
        entry(`${ORIGIN}${FISHING_FISH_PATH}`, { changefreq: "weekly", priority: "0.7", lastmod: updated }),
        ...FISH_PAGES.map((f) => entry(`${ORIGIN}${fishingFishPath(f.name)}`, { changefreq: "weekly", priority: "0.6", lastmod: updated, image: fishingFishCardUrl(ORIGIN, f.id) })),
    ];
}
