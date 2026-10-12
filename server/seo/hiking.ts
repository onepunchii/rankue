// 등산 프리렌더(2026-10-13) — /hiking(허브) · /hiking/regions/<권역> · /hiking/lists/<목록> · /hiking/mountains/<산>.
//
// 본문은 shared/hikingPage · hikingMountains · hikingGuide · hikingPois 로 화면(client/src/hiking)과 같은 글을 쓴다.
// prerender.ts 와 서로 import 하는 모양이 되지만, 이 파일은 page·esc·hubNav 를 함수 안에서만 부른다(최상위에서 호출하지 말 것).
import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import type { MountainDetail, MountainSummary } from "../storage/hiking.js";
import { HIKING_GROUPS, HIKING_LISTS, HIKING_REGIONS, HIKING_TRAITS, heightText, hikingGroup, hikingRegion, inHikingGroup, mountainPlace } from "../../shared/hikingMountains.js";
import { GUIDE_COURSE_SOURCE, GUIDE_LABEL, GUIDE_NOTE } from "../../shared/hikingGuide.js";
import { HIKING_POI_NAME, hikingPoiTitle, type HikingPoiKind } from "../../shared/hikingPois.js";
import {
    COURSE_SOURCE_NOTE, COURSE_TIME_NOTE, HIKING_CTA, HIKING_H1, HIKING_HUB_PATH, HIKING_NAV_LABEL, HIKING_TAGLINE, MOUNTAIN_LABEL, OSM_NOTE,
    courseFacts, courseShape, hikingHubSeo, hikingListPath, hikingListSeo, hikingMountainPath, hikingRegionPath, hikingRegionSeo, kmRange, listNames, mountainSeo,
} from "../../shared/hikingPage.js";

const ORIGIN = "https://www.rankue.co.kr";
export interface HikingRender { status: 200; tag: string; html: string }
/** 등산의 주소인가 — 라우트의 정규식. vercel.json 봇 라우트에도 같은 경로가 있어야 한다 */
export const HIKING_RE = /^\/hiking(?:\/(?:regions|lists|mountains)\/[^/]+)?\/?$/;

const crumbs = (...tail: [string, string][]) => ({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["랭큐", "/"], [HIKING_NAV_LABEL, HIKING_HUB_PATH], ...tail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })),
});
const line = (m: MountainSummary) => {
    const bits = [heightText(m.heightM), mountainPlace(m), m.courses > 0 ? `코스 ${m.courses}개 ${kmRange(m.minKm, m.maxKm)}` : ""].filter(Boolean).join(" · ");
    return `      <li><a href="${hikingMountainPath(m.slug)}">${esc(m.name)}</a>${bits ? ` — ${esc(bits)}` : ""}</li>`;
};
const cta = () => `  <section>
    <h2>${esc(HIKING_CTA.title)}</h2>
    <p>${esc(HIKING_CTA.body)}</p>
    <p><a href="/?login=1">${esc(HIKING_CTA.button)}</a></p>
  </section>`;
const nav = () => `  <nav aria-label="등산">
    <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a>
${HIKING_REGIONS.map((r) => `    <a href="${hikingRegionPath(r.id)}">${esc(`${r.name}의 산`)}</a>`).join("\n")}
${HIKING_GROUPS.map((l) => `    <a href="${hikingListPath(l.id)}">${esc(l.name)}</a>`).join("\n")}
  </nav>`;
/** 한 화면에 싣는 산의 수 — 권역 하나가 700곳쯤이다 */
const LIST_MAX = 1000;

function hub(all: readonly MountainSummary[]): HikingRender {
    const famous = all.filter((m) => m.tier === 1);
    const seo = hikingHubSeo({ total: all.length, famous: famous.length, courses: all.reduce((a, m) => a + m.courses, 0) });
    const kfs = all.filter((m) => m.lists.includes("kfs100"));
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › ${esc(HIKING_NAV_LABEL)}</nav>
  <h1>${esc(HIKING_H1)}</h1>
  <p>${esc(HIKING_TAGLINE)}</p>
  <p>${esc(seo.desc)}</p>
  <section>
    <h2>권역으로 찾기</h2>
    <ul>
${HIKING_REGIONS.map((r) => `      <li><a href="${hikingRegionPath(r.id)}">${esc(`${r.name}의 산`)}</a> — ${esc(`${all.filter((m) => m.region === r.id).length.toLocaleString("en-US")}곳 · 명산 ${famous.filter((m) => m.region === r.id).length}곳`)}</li>`).join("\n")}
    </ul>
  </section>
  <section>
    <h2>목록으로 찾기</h2>
    <ul>
${HIKING_LISTS.map((l) => `      <li><a href="${hikingListPath(l.id)}">${esc(l.name)}</a> — ${esc(`${all.filter((m) => m.lists.includes(l.id)).length}곳`)}</li>`).join("\n")}
    </ul>
    <ul>
${HIKING_TRAITS.map((t) => `      <li><a href="${hikingListPath(t.id)}">${esc(t.name)}</a> — ${esc(`${t.how} · ${all.filter((m) => m.traits.includes(t.id)).length.toLocaleString("en-US")}곳`)}</li>`).join("\n")}
    </ul>
  </section>
  <section>
    <h2>산림청 100대 명산</h2>
    <ul>
${kfs.map(line).join("\n")}
    </ul>
  </section>
${cta()}
  <p>${esc(OSM_NOTE)}</p>
${nav()}
</main>
${hubNav("ko")}`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: "산림청 100대 명산", numberOfItems: kfs.length, itemListElement: kfs.map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.name, url: `${ORIGIN}${hikingMountainPath(m.slug)}` })) };
    return { status: 200, tag: "hiking:hub", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [list, crumbs()] }) };
}

function listing(tag: string, seo: { path: string; title: string; desc: string }, h1: string, lead: string, items: readonly MountainSummary[], total: number): HikingRender {
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a> › ${esc(h1)}</nav>
  <h1>${esc(h1)}</h1>
  <p>${esc(lead)}</p>
  <section>
    <h2>${esc(`산 ${total.toLocaleString("en-US")}곳`)}</h2>
    <ul>
${items.slice(0, LIST_MAX).map(line).join("\n")}
    </ul>
  </section>
${cta()}
  <p>${esc(OSM_NOTE)}</p>
${nav()}
</main>
${hubNav("ko")}`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: h1, numberOfItems: total, itemListElement: items.slice(0, 100).map((m, i) => ({ "@type": "ListItem", position: i + 1, name: m.name, url: `${ORIGIN}${hikingMountainPath(m.slug)}` })) };
    return { status: 200, tag, html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [list, crumbs([h1, seo.path])] }) };
}

/** 산 화면에 이름으로 적는 지점 — 갈림길은 수만 적는다(이름이 거의 다 '갈림길'이다) */
const NAMED_KINDS: readonly HikingPoiKind[] = ["DANGER", "SHELTER", "CULTURAL", "WILD"];
const NAMED_MAX = 12;

function mountain(d: MountainDetail, nearby: readonly (MountainSummary & { km: number })[]): HikingRender {
    const seo = mountainSeo(d);
    const g = d.guide;
    const lists = listNames(d.lists);
    const region = hikingRegion(d.region);
    const facts = [heightText(d.heightM) ? `높이 ${heightText(d.heightM)}` : "", mountainPlace(d), ...lists].filter(Boolean);
    const courses = d.courseList.map((c) => {
        const f = courseFacts(c);
        const on = d.pois.filter((p) => p.courseId === c.id);
        const count = (k: HikingPoiKind) => on.filter((p) => p.kind === k).length;
        const bits = [`거리 ${f.km}`, `오르막 ${f.gain}`, `걷는 시간 ${f.time}`, courseShape(c), `해발 ${c.minM.toLocaleString("en-US")}~${c.maxM.toLocaleString("en-US")}m`,
            count("SIGN") ? `갈림길 ${count("SIGN")}곳` : "", count("DANGER") ? `위험 구간 ${count("DANGER")}곳` : "", count("SHELTER") ? `대피소 ${count("SHELTER")}곳` : ""].filter(Boolean);
        return `      <li><strong>${esc(`코스 ${c.seq}`)}</strong> — ${esc(bits.join(" · "))}</li>`;
    });
    const named = NAMED_KINDS.map((k) => ({ k, items: d.pois.filter((p) => p.kind === k).map((p) => hikingPoiTitle(p)).filter((t, i, a) => a.indexOf(t) === i).slice(0, NAMED_MAX) })).filter((x) => x.items.length > 0);
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a>${region ? ` › <a href="${hikingRegionPath(region.id)}">${esc(`${region.name}의 산`)}</a>` : ""} › ${esc(d.name)}</nav>
  <h1>${esc(d.name)}</h1>
${g?.subtitle ? `  <p>${esc(g.subtitle)}</p>\n` : ""}  <p>${esc(facts.join(" · "))}</p>
${g?.intro ? `  <p>${esc(g.intro)}</p>\n` : ""}  <section>
    <h2>${esc(MOUNTAIN_LABEL.courses)}</h2>
${courses.length ? `    <p>${esc(MOUNTAIN_LABEL.coursesAside)}</p>
    <ul>
${courses.join("\n")}
    </ul>
    <p>${esc(COURSE_TIME_NOTE)}</p>
    <p>${esc(COURSE_SOURCE_NOTE)}</p>` : `    <p>${esc(MOUNTAIN_LABEL.noCourse)}</p>`}
  </section>
${named.length ? `  <section>
    <h2>${esc(MOUNTAIN_LABEL.pois)}</h2>
${named.map((x) => `    <h3>${esc(HIKING_POI_NAME[x.k])}</h3>\n    <p>${esc(x.items.join(" · "))}</p>`).join("\n")}
  </section>\n` : ""}${g ? `  <section>
    <h2>${esc(MOUNTAIN_LABEL.about)}</h2>
${g.selectionReason ? `    <h3>${esc(GUIDE_LABEL.why)}</h3>\n    <p>${esc(g.selectionReason)}</p>\n` : ""}${g.sections.map((s) => `    <h3>${esc(s.heading)}</h3>\n    <p>${esc(s.body)}</p>`).join("\n")}
${g.highlights.length ? `    <h3>${esc(GUIDE_LABEL.highlights)}</h3>\n    <ul>\n${g.highlights.map((h) => `      <li><strong>${esc(h.name)}</strong>${h.note ? ` — ${esc(h.note)}` : ""}</li>`).join("\n")}\n    </ul>\n` : ""}${g.access ? `    <h3>${esc(GUIDE_LABEL.access)}</h3>\n    <p>${esc(g.access)}</p>\n` : ""}${g.officialCourses.length ? `    <h3>${esc(GUIDE_LABEL.officialCourses)}</h3>\n    <ul>\n${g.officialCourses.map((c) => `      <li>${esc(c.waypoints.join(" → "))}${c.duration ? ` — ${esc(c.duration)}` : ""}</li>`).join("\n")}\n    </ul>\n    <p>${esc(GUIDE_COURSE_SOURCE)}</p>\n` : ""}${g.faq.length ? `    <h3>${esc(GUIDE_LABEL.faq)}</h3>\n${g.faq.map((f) => `    <p><strong>${esc(f.q)}</strong> ${esc(f.a)}</p>`).join("\n")}\n` : ""}    <p>${esc(GUIDE_NOTE)}</p>
  </section>\n` : ""}${nearby.length ? `  <section>
    <h2>${esc(MOUNTAIN_LABEL.nearby)}</h2>
    <ul>
${nearby.map((m) => `      <li><a href="${hikingMountainPath(m.slug)}">${esc(m.name)}</a> — ${esc([heightText(m.heightM), `${m.km}km`].filter(Boolean).join(" · "))}</li>`).join("\n")}
    </ul>
  </section>\n` : ""}${cta()}
  <p>${esc(OSM_NOTE)}</p>
${nav()}
</main>
${hubNav("ko")}`;
    const jsonLd: object[] = [
        crumbs(...(region ? [[`${region.name}의 산`, hikingRegionPath(region.id)] as [string, string]] : []), [d.name, seo.path]),
        {
            "@context": "https://schema.org", "@type": "Mountain", name: d.name, url: `${ORIGIN}${seo.path}`, description: seo.desc,
            ...(d.lat != null && d.lng != null ? { geo: { "@type": "GeoCoordinates", latitude: d.lat, longitude: d.lng, ...(d.heightM ? { elevation: `${d.heightM} m` } : {}) } } : {}),
            ...(d.sido ? { address: { "@type": "PostalAddress", addressCountry: "KR", addressRegion: d.sido, ...(d.sigungu ? { addressLocality: d.sigungu } : {}) } } : {}),
        },
        ...(g?.faq.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
    ];
    return { status: 200, tag: `hiking:mountain:${d.id}`, html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd }) };
}

/**
 * 주소 → 검색용 화면. 등산의 주소가 아니거나 없는 권역 · 목록 · 산이면 null(다음 라우트로 — 화면이 '없는 산이에요'를 그린다).
 * detail 은 산 화면일 때만 부른다(산 한 곳의 글 · 코스 · 지점).
 */
export async function renderHiking(path: string, all: readonly MountainSummary[], detail: (slug: string) => Promise<{ d: MountainDetail; nearby: (MountainSummary & { km: number })[] } | null>): Promise<HikingRender | null> {
    const p = path.replace(/\/+$/, "") || "/";
    if (p === HIKING_HUB_PATH) return all.length ? hub(all) : null;
    const m = /^\/hiking\/(regions|lists|mountains)\/([^/]+)$/.exec(p);
    if (!m) return null;
    const key = decodeURIComponent(m[2]);
    if (m[1] === "regions") {
        const r = hikingRegion(key);
        if (!r) return null;
        const items = all.filter((x) => x.region === r.id);
        return listing(`hiking:region:${r.id}`, hikingRegionSeo(r, items.length), `${r.name}의 산`, `${r.name} 권역(${r.sidos.join(" · ")})의 산을 명산부터, 높은 순으로.`, items, items.length);
    }
    if (m[1] === "lists") {
        // 공식 목록이거나 특성(높이 · 섬) — 같은 주소를 쓴다
        const l = hikingGroup(key);
        if (!l) return null;
        const items = all.filter((x) => inHikingGroup(l, x)).sort((a, b) => (l.id === "kfs100" ? (a.kfsNo ?? 999) - (b.kfsNo ?? 999) : (b.heightM ?? 0) - (a.heightM ?? 0)));
        return listing(`hiking:list:${l.id}`, hikingListSeo(l, items.length), l.name, `${l.name} ${items.length.toLocaleString("en-US")}곳 — ${l.note}.`, items, items.length);
    }
    const got = await detail(key);
    return got ? mountain(got.d, got.nearby) : null;
}

/** 사이트맵 — 허브 · 권역 여덟 · 목록 다섯 · 산(코스나 글이 있는 산만 — 빈 화면을 색인에 올리지 않는다) */
export function hikingSitemapParts(all: readonly MountainSummary[]): string[] {
    if (all.length === 0) return [];
    return [
        entry(`${ORIGIN}${HIKING_HUB_PATH}`, { changefreq: "weekly", priority: "0.8" }),
        ...HIKING_REGIONS.map((r) => entry(`${ORIGIN}${hikingRegionPath(r.id)}`, { changefreq: "weekly", priority: "0.6" })),
        ...HIKING_GROUPS.map((l) => entry(`${ORIGIN}${hikingListPath(l.id)}`, { changefreq: "weekly", priority: l.kind === "list" ? "0.7" : "0.5" })),
        ...all.filter((m) => m.courses > 0 || m.hasGuide).map((m) => entry(`${ORIGIN}${hikingMountainPath(m.slug)}`, { changefreq: "monthly", priority: m.tier === 1 ? "0.7" : m.tier === 2 ? "0.5" : "0.4" })),
    ];
}
