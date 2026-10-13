// 등산 프리렌더(2026-10-13) — /hiking(허브) · /hiking/regions/<권역> · /hiking/lists/<목록> · /hiking/mountains/<산> · /hiking/stamps(도장첩) · /hiking/pack(등급 · 와펜 · 핀)
// · /hiking/terms(용어 사전) · /hiking/terms/<말> · /hiking/checklist(준비물).
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
    COURSE_SOURCE_NOTE, COURSE_TIME_NOTE, HIKING_CTA, HIKING_GRADE_NOTE, HIKING_H1, HIKING_HUB_PATH, HIKING_NAV_LABEL, HIKING_PACK_INTRO, HIKING_PACK_LABEL, HIKING_PACK_PATH, HIKING_PACK_SEO,
    HIKING_PIN_NOTE, HIKING_STAMPS_INTRO, HIKING_STAMPS_PATH, HIKING_STAMPS_SEO, HIKING_TAGLINE, MOUNTAIN_LABEL, MOUNTAIN_PATCH_NOTE, OSM_NOTE,
    courseFacts, courseShape, courseViaNote, hikingHubSeo, hikingListPath, hikingListSeo, hikingMountainPath, hikingRegionPath, hikingRegionSeo, kmRange, listNames, mountainSeo,
} from "../../shared/hikingPage.js";
import { HIKING_GRADES } from "../../shared/hikingGrade.js";
import { MOUNTAIN_AROUND_LABEL } from "../../shared/hikingAround.js";
import { bearingDeg, compass8 } from "../../shared/hikingNear.js";
import { hubCard } from "../../shared/ogCards.js";
import {
    HIKING_CHECKLIST, HIKING_CHECKLIST_H1, HIKING_CHECKLIST_LEAD, HIKING_CHECKLIST_NOTE, HIKING_CHECKLIST_PATH, HIKING_CHECKLIST_SEO, HIKING_TERMS, HIKING_TERMS_H1, HIKING_TERMS_LEAD, HIKING_TERMS_PATH,
    HIKING_TERMS_SEO, HIKING_TERM_GROUPS, hikingTerm, hikingTermPath, hikingTermSeo, type HikingTerm,
} from "../../shared/hikingTerms.js";
import { HIKING_GRANDS, HIKING_PINS, HIKING_SERIES, hikingBooks, type HikingBookKind } from "../../shared/hikingStamps.js";

const ORIGIN = "https://www.rankue.co.kr";
export interface HikingRender { status: 200; tag: string; html: string }
/** 등산의 주소인가 — 라우트의 정규식. vercel.json 봇 라우트에도 같은 경로가 있어야 한다 */
export const HIKING_RE = /^\/hiking(?:\/(?:regions|lists|mountains)\/[^/]+|\/stamps|\/pack|\/terms(?:\/[^/]+)?|\/checklist)?\/?$/;

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
    <a href="${HIKING_STAMPS_PATH}">등산 도장첩</a>
    <a href="${HIKING_PACK_PATH}">산행 등급 · 와펜</a>
    <a href="${HIKING_TERMS_PATH}">${esc(HIKING_TERMS_H1)}</a>
    <a href="${HIKING_CHECKLIST_PATH}">${esc(HIKING_CHECKLIST_H1)}</a>
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
        return `      <li><strong>${esc(`코스 ${c.seq}`)}</strong> — ${esc(bits.join(" · "))}${c.via ? ` ${esc(courseViaNote(c.via))}` : ""}</li>`;
    });
    // 위치 — 화면의 '위치 · 들머리' 구역과 같은 말(시도 · 시군구 · 동)
    const where = [d.sido, d.sigungu, d.dong].filter(Boolean).join(" ");
    // 가까운 산의 방향 — 화면의 판(가운데가 이 산)이 보여 주는 것을 글로
    const dirOf = (m: { lat: number | null; lng: number | null }) => (d.lat != null && d.lng != null && m.lat != null && m.lng != null ? `${compass8(bearingDeg(d.lat, d.lng, m.lat, m.lng))}쪽 ` : "");
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
  </section>\n` : ""}${where ? `  <section>
    <h2>${esc(MOUNTAIN_AROUND_LABEL.map)}</h2>
    <p>${esc([where, heightText(d.heightM) ? `정상 높이 ${heightText(d.heightM)}` : ""].filter(Boolean).join(" · "))}</p>
    <p>${esc(d.courseList.length ? `들머리는 코스가 시작되는 곳이에요 — 코스 ${d.courseList.length}개의 들머리를 지도에서 보고 길을 찾을 수 있어요.` : MOUNTAIN_AROUND_LABEL.noCourse)}</p>
  </section>\n` : ""}${nearby.length ? `  <section>
    <h2>${esc(MOUNTAIN_LABEL.nearby)}</h2>
    <ul>
${nearby.map((m) => `      <li><a href="${hikingMountainPath(m.slug)}">${esc(m.name)}</a> — ${esc([heightText(m.heightM), `${dirOf(m)}${m.km}km`].filter(Boolean).join(" · "))}</li>`).join("\n")}
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
    // 공유 · 검색 카드는 그 산이 있는 권역의 카드(화면의 useSeo 와 같다) — 산마다의 카드는 없다
    const card = region ? hubCard(ORIGIN, hikingRegionPath(region.id)) : null;
    return { status: 200, tag: `hiking:mountain:${d.id}`, html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd, ...(card ? { image: { ...card, alt: `${d.name} — 랭큐 등산` } } : {}) }) };
}

/** 도장첩 — 묶음마다의 권과 칸 수. 화면(StampShelf)의 방문자 모습과 같은 글 */
const SHELF_ORDER: readonly HikingBookKind[] = ["kfs", "season", "theme", "plus"];
function stamps(all: readonly MountainSummary[]): HikingRender {
    const books = hikingBooks(all);
    const seo = HIKING_STAMPS_SEO;
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a> › 도장첩</nav>
  <h1>등산 도장첩</h1>
  <p>${esc(HIKING_STAMPS_INTRO)}</p>
  <p>${esc(seo.desc)}</p>
${SHELF_ORDER.map((kind) => {
        const mine = books.filter((b) => b.kind === kind);
        if (mine.length === 0) return "";
        const grand = HIKING_GRANDS.find((g) => g.kind === kind);
        return `  <section>
    <h2>${esc(HIKING_SERIES[kind])}</h2>
    <ul>
${mine.map((b) => `      <li>${b.region ? `<a href="${hikingRegionPath(b.region)}">${esc(b.name)}</a>` : `<a href="${hikingListPath(b.id)}">${esc(b.name)}</a>`} — ${esc(b.note)}</li>`).join("\n")}
    </ul>${grand ? `\n    <p>${esc(`${grand.name} — ${grand.how} 채우면 받는 큰 와펜`)}</p>` : ""}
  </section>`;
    }).filter(Boolean).join("\n")}
  <p><a href="${HIKING_PACK_PATH}">${esc(`${HIKING_PACK_LABEL.grade} · ${HIKING_PACK_LABEL.mountainPatch} · ${HIKING_PACK_LABEL.pin} 보기`)}</a></p>
${cta()}
${nav()}
</main>
${hubNav("ko")}`;
    return { status: 200, tag: "hiking:stamps", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [crumbs(["도장첩", seo.path])] }) };
}

/** 배낭 — 산행 등급 여덟 · 산 와펜(100대 명산, 권역별) · 핀. 화면(PackPage)의 방문자 모습과 같은 글 */
function pack(all: readonly MountainSummary[]): HikingRender {
    const kfs = all.filter((m) => m.lists.includes("kfs100"));
    const seo = HIKING_PACK_SEO;
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a> › 배낭</nav>
  <h1>배낭 — ${esc(`${HIKING_PACK_LABEL.grade} · ${HIKING_PACK_LABEL.mountainPatch} · ${HIKING_PACK_LABEL.pin}`)}</h1>
  <p>${esc(HIKING_PACK_INTRO)}</p>
  <section>
    <h2>${esc(HIKING_PACK_LABEL.grade)}</h2>
    <ol>
${HIKING_GRADES.map((g) => `      <li>${esc(`${g.name} — ${g.min === 0 ? "시작" : `산 ${g.min}곳`} · ${g.line}`)}</li>`).join("\n")}
    </ol>
    <p>${esc(HIKING_GRADE_NOTE)}</p>
  </section>
  <section>
    <h2>${esc(`${HIKING_PACK_LABEL.mountainPatch} — 100대 명산 ${kfs.length}장`)}</h2>
${HIKING_REGIONS.map((r) => {
        const list = kfs.filter((m) => m.region === r.id).sort((a, b) => (b.heightM ?? 0) - (a.heightM ?? 0));
        return list.length ? `    <h3>${esc(`${r.name} ${list.length}곳`)}</h3>
    <ul>
${list.map((m) => `      <li><a href="${hikingMountainPath(m.slug)}">${esc(m.name)}</a>${m.heightM ? ` — ${esc(heightText(m.heightM))}` : ""}</li>`).join("\n")}
    </ul>` : "";
    }).filter(Boolean).join("\n")}
    <p>${esc(MOUNTAIN_PATCH_NOTE)}</p>
  </section>
  <section>
    <h2>${esc(HIKING_PACK_LABEL.pin)}</h2>
    <ul>
${HIKING_PINS.map((p) => `      <li>${esc(`${p.name} — ${p.how}`)}</li>`).join("\n")}
    </ul>
    <p>${esc(HIKING_PIN_NOTE)}</p>
  </section>
  <p><a href="${HIKING_STAMPS_PATH}">등산 도장첩 보기</a></p>
${cta()}
${nav()}
</main>
${hubNav("ko")}`;
    return { status: 200, tag: "hiking:pack", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [crumbs(["배낭", seo.path])] }) };
}

/** 용어 사전 — 묶음별로 말과 한 줄 뜻. 화면(TermsPage)과 같은 글(shared/hikingTerms) */
function terms(): HikingRender {
    const seo = HIKING_TERMS_SEO;
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a> › ${esc(HIKING_TERMS_H1)}</nav>
  <h1>${esc(HIKING_TERMS_H1)}</h1>
  <p>${esc(HIKING_TERMS_LEAD)}</p>
${HIKING_TERM_GROUPS.map((g) => `  <section>
    <h2>${esc(g.name)}</h2>
    <dl>
${HIKING_TERMS.filter((t) => t.group === g.id).map((t) => `      <dt><a href="${hikingTermPath(t.id)}">${esc(t.term)}</a></dt><dd>${esc(t.short)}</dd>`).join("\n")}
    </dl>
  </section>`).join("\n")}
  <p><a href="${HIKING_CHECKLIST_PATH}">${esc(HIKING_CHECKLIST_H1)} 보기</a></p>
${cta()}
${nav()}
</main>
${hubNav("ko")}`;
    const set = { "@context": "https://schema.org", "@type": "DefinedTermSet", name: HIKING_TERMS_H1, url: `${ORIGIN}${seo.path}`, hasDefinedTerm: HIKING_TERMS.map((t) => ({ "@type": "DefinedTerm", name: t.term, description: t.short, url: `${ORIGIN}${hikingTermPath(t.id)}` })) };
    return { status: 200, tag: "hiking:terms", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [set, crumbs([HIKING_TERMS_H1, seo.path])] }) };
}
function term(t: HikingTerm): HikingRender {
    const seo = hikingTermSeo(t);
    const see = (t.see ?? []).map((id) => hikingTerm(id)).filter((x): x is HikingTerm => !!x);
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a> › <a href="${HIKING_TERMS_PATH}">${esc(HIKING_TERMS_H1)}</a> › ${esc(t.term)}</nav>
  <h1>${esc(t.term)}</h1>${t.also?.length ? `\n  <p>${esc(t.also.join(" · "))}</p>` : ""}
  <p><strong>${esc(t.short)}</strong></p>
  <p>${esc(t.body)}</p>${see.length ? `
  <section>
    <h2>함께 보면 좋은 말</h2>
    <ul>
${see.map((x) => `      <li><a href="${hikingTermPath(x.id)}">${esc(x.term)}</a> — ${esc(x.short)}</li>`).join("\n")}
    </ul>
  </section>` : ""}
  <p><a href="${HIKING_TERMS_PATH}">${esc(`용어 ${HIKING_TERMS.length}가지 다 보기`)}</a></p>
${cta()}
${nav()}
</main>
${hubNav("ko")}`;
    const ld = { "@context": "https://schema.org", "@type": "DefinedTerm", name: t.term, ...(t.also?.length ? { alternateName: t.also } : {}), description: `${t.short} ${t.body}`, url: `${ORIGIN}${seo.path}`, inDefinedTermSet: `${ORIGIN}${HIKING_TERMS_PATH}` };
    return { status: 200, tag: `hiking:term:${t.id}`, html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [ld, crumbs([HIKING_TERMS_H1, HIKING_TERMS_PATH], [t.term, seo.path])] }) };
}
/** 준비물 — 묶음별로 무엇을 · 왜. 화면(ChecklistPage)과 같은 글 */
function checklist(): HikingRender {
    const seo = HIKING_CHECKLIST_SEO;
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a> › ${esc(HIKING_CHECKLIST_H1)}</nav>
  <h1>${esc(HIKING_CHECKLIST_H1)}</h1>
  <p>${esc(HIKING_CHECKLIST_LEAD)}</p>
${HIKING_CHECKLIST.map((g) => `  <section>
    <h2>${esc(`${g.name} — ${g.note}`)}</h2>
    <ul>
${g.items.map((it) => `      <li><strong>${esc(it.name)}</strong> — ${esc(it.why)}</li>`).join("\n")}
    </ul>
  </section>`).join("\n")}
  <p>${esc(HIKING_CHECKLIST_NOTE)}</p>
  <p><a href="${HIKING_TERMS_PATH}">${esc(HIKING_TERMS_H1)} 보기</a></p>
${cta()}
${nav()}
</main>
${hubNav("ko")}`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: HIKING_CHECKLIST_H1, itemListElement: HIKING_CHECKLIST[0].items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name })) };
    return { status: 200, tag: "hiking:checklist", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [list, crumbs([HIKING_CHECKLIST_H1, seo.path])] }) };
}

/**
 * 주소 → 검색용 화면. 등산의 주소가 아니거나 없는 권역 · 목록 · 산이면 null(다음 라우트로 — 화면이 '없는 산이에요'를 그린다).
 * detail 은 산 화면일 때만 부른다(산 한 곳의 글 · 코스 · 지점).
 */
export async function renderHiking(path: string, all: readonly MountainSummary[], detail: (slug: string) => Promise<{ d: MountainDetail; nearby: (MountainSummary & { km: number })[] } | null>): Promise<HikingRender | null> {
    const p = path.replace(/\/+$/, "") || "/";
    if (p === HIKING_HUB_PATH) return all.length ? hub(all) : null;
    if (p === HIKING_STAMPS_PATH) return all.length ? stamps(all) : null;
    if (p === HIKING_PACK_PATH) return all.length ? pack(all) : null;
    // 글만으로 서는 화면 — 산 자료가 없어도 낸다
    if (p === HIKING_TERMS_PATH) return terms();
    if (p === HIKING_CHECKLIST_PATH) return checklist();
    const tm = /^\/hiking\/terms\/([^/]+)$/.exec(p);
    if (tm) { const t = hikingTerm(decodeURIComponent(tm[1])); return t ? term(t) : null; }
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
        entry(`${ORIGIN}${HIKING_STAMPS_PATH}`, { changefreq: "monthly", priority: "0.6" }),
        entry(`${ORIGIN}${HIKING_PACK_PATH}`, { changefreq: "monthly", priority: "0.6" }),
        entry(`${ORIGIN}${HIKING_TERMS_PATH}`, { changefreq: "monthly", priority: "0.6" }),
        entry(`${ORIGIN}${HIKING_CHECKLIST_PATH}`, { changefreq: "monthly", priority: "0.6" }),
        ...HIKING_TERMS.map((t) => entry(`${ORIGIN}${hikingTermPath(t.id)}`, { changefreq: "monthly", priority: "0.5" })),
        ...HIKING_REGIONS.map((r) => entry(`${ORIGIN}${hikingRegionPath(r.id)}`, { changefreq: "weekly", priority: "0.6" })),
        ...HIKING_GROUPS.map((l) => entry(`${ORIGIN}${hikingListPath(l.id)}`, { changefreq: "weekly", priority: l.kind === "list" ? "0.7" : "0.5" })),
        ...all.filter((m) => m.courses > 0 || m.hasGuide).map((m) => entry(`${ORIGIN}${hikingMountainPath(m.slug)}`, { changefreq: "monthly", priority: m.tier === 1 ? "0.7" : m.tier === 2 ? "0.5" : "0.4" })),
    ];
}
