// 등산 프리렌더(2026-10-13) — /hiking(허브) · /hiking/regions/<권역> · /hiking/lists/<목록> · /hiking/mountains/<산> · /hiking/stamps(도장첩) · /hiking/pack(등급 · 와펜 · 핀)
// · /hiking/terms(용어 사전) · /hiking/terms/<말> · /hiking/checklist(준비물).
//
// 본문은 shared/hikingPage · hikingMountains · hikingGuide · hikingPois 로 화면(client/src/hiking)과 같은 글을 쓴다.
// prerender.ts 와 서로 import 하는 모양이 되지만, 이 파일은 page·esc·hubNav 를 함수 안에서만 부른다(최상위에서 호출하지 말 것).
import { page, esc, hubNav } from "../prerender.js";

/**
 * 본문의 제목 바로 밑에 그 화면의 미리보기 그림을 싣는다(2026-10-13 — 골프장 · 도장깨기의 검색용 화면과 같은 꼴).
 * 산은 그 산의 카드(이름 · 높이 · 자리가 그림에 있다), 그 밖은 허브 · 묶음 · 권역의 카드. 그림 검색과 미리보기가 본문의 그림을 같이 본다.
 * 사람이 보는 화면에는 이 그림이 없다(공유할 때 붙는 카드다) — 글은 화면과 같고, 그림은 머리의 og:image 와 같은 한 장이다.
 */
const withCard = (body: string, card: { url: string; width: number; height: number; alt: string } | null | undefined): string =>
    card ? body.replace("</h1>", `</h1>\n  <img src="${esc(card.url)}" width="${card.width}" height="${card.height}" alt="${esc(card.alt)}" loading="eager">`) : body;
import { entry } from "../sitemap.js";
import type { MountainDetail, MountainSummary } from "../storage/hiking.js";
import { HIKING_GROUPS, HIKING_LISTS, HIKING_REGIONS, HIKING_TRAITS, heightText, hikingGroup, hikingRegion, inHikingGroup, mountainPlace, sigunguText } from "../../shared/hikingMountains.js";
import { GUIDE_COURSE_SOURCE, GUIDE_LABEL, GUIDE_NOTE } from "../../shared/hikingGuide.js";
import { HIKING_POI_NAME, hikingPoiTitle, type HikingPoiKind } from "../../shared/hikingPois.js";
import { SURFACE_COPY, surfaceShares } from "../../shared/hikingSurface.js";
import {
    COURSE_SOURCE_NOTE, COURSE_TIME_NOTE, HIKING_CTA, mountainCardAlt, HIKING_GRADE_NOTE, HIKING_H1, HIKING_HUB_PATH, HIKING_NAV_LABEL, HIKING_PACK_INTRO, HIKING_PACK_LABEL, HIKING_PACK_PATH, HIKING_PACK_SEO,
    HIKING_PIN_NOTE, HIKING_STAMPS_INTRO, HIKING_STAMPS_PATH, HIKING_STAMPS_SEO, HIKING_TAGLINE, MOUNTAIN_LABEL, MOUNTAIN_PATCH_NOTE, OSM_NOTE,
    courseFacts, courseShape, courseViaNote, hikingHubSeo, hikingListPath, hikingListSeo, hikingMountainPath, hikingRegionPath, hikingRegionSeo, kmRange, listNames, mountainSeo,
} from "../../shared/hikingPage.js";
import { HIKING_GRADES } from "../../shared/hikingGrade.js";
import { MOUNTAIN_AROUND_LABEL } from "../../shared/hikingAround.js";
import { bearingDeg, compass8 } from "../../shared/hikingNear.js";
import { HUB_CARD_SIZE, hikingMountainCardUrl, hubCard } from "../../shared/ogCards.js";
import {
    HIKING_CHECKLIST, HIKING_CHECKLIST_H1, HIKING_CHECKLIST_LEAD, HIKING_CHECKLIST_NOTE, HIKING_CHECKLIST_PATH, HIKING_CHECKLIST_SEO, HIKING_TERMS, HIKING_TERMS_H1, HIKING_TERMS_LEAD, HIKING_TERMS_PATH,
    HIKING_TERMS_SEO, HIKING_TERM_GROUPS, hikingTerm, hikingTermPath, hikingTermSeo, type HikingTerm,
} from "../../shared/hikingTerms.js";
import {
    ABROAD_ALTITUDE_NAME, ABROAD_LEVEL_NAME, ABROAD_REGIONS, HIKING_ABROAD, HIKING_ABROAD_CHECKED_ON, HIKING_ABROAD_H1, HIKING_ABROAD_LEAD, HIKING_ABROAD_NOTE, HIKING_ABROAD_PATH,
    HIKING_ABROAD_SEO, abroadHeightText, hikingAbroad, hikingAbroadPath, hikingAbroadSeo, type AbroadCourse, type AbroadFact,
} from "../../shared/hikingAbroad.js";
import { HIKING_GRANDS, HIKING_PINS, HIKING_SERIES, hikingBooks, type HikingBookKind } from "../../shared/hikingStamps.js";

const ORIGIN = "https://www.rankue.co.kr";
export interface HikingRender { status: 200; tag: string; html: string }
/** 등산의 주소인가 — 라우트의 정규식. vercel.json 봇 라우트에도 같은 경로가 있어야 한다 */
export const HIKING_RE = /^\/hiking(?:\/(?:regions|lists|mountains)\/[^/]+|\/stamps|\/pack|\/terms(?:\/[^/]+)?|\/checklist|\/abroad(?:\/[^/]+)?)?\/?$/;

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
    <a href="${HIKING_ABROAD_PATH}">${esc(HIKING_ABROAD_H1)}</a>
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
    return { status: 200, tag: "hiking:hub", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, hubCard(ORIGIN, seo.path)), jsonLd: [list, crumbs()] }) };
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
    return { status: 200, tag, html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, hubCard(ORIGIN, seo.path)), jsonLd: [list, crumbs([h1, seo.path])] }) };
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
            count("SIGN") ? `갈림길 ${count("SIGN")}곳` : "", count("DANGER") ? `위험 구간 ${count("DANGER")}곳` : "", count("SHELTER") ? `대피소 ${count("SHELTER")}곳` : "",
            // 화면의 칩과 같은 것 — 채비에 쓰는 지점(산림청 100대 명산 코스 파일에서 온 코스에만 있다)
            ...(["PARK", "TOILET", "WATER", "VIEW"] as const).map((k) => (count(k) ? `${HIKING_POI_NAME[k]} ${count(k)}곳` : "")),
            // 화면의 '어떤 길을 걷나' 막대와 같은 숫자
            ...(() => { const s = surfaceShares(c.surface); return s.length ? [`${SURFACE_COPY.title}: ${s.map((x) => `${x.label} ${x.pct}%`).join(", ")}(${SURFACE_COPY.source})`] : []; })()].filter(Boolean);
        return `      <li><strong>${esc(`코스 ${c.seq}`)}</strong> — ${esc(bits.join(" · "))}${c.via ? ` ${esc(courseViaNote(c.via))}` : ""}</li>`;
    });
    // 위치 — 화면의 '위치 · 들머리' 구역과 같은 말(시도 · 시군구 · 동)
    const where = [d.sido, sigunguText(d.sigungu), d.dong].filter(Boolean).join(" ");
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
    // 공유 · 검색 카드는 이 산의 카드(화면의 useSeo · 사이트맵과 같은 주소 — shared/ogCards). 권역의 표지 위에 이 산의 이름 · 높이 · 자리 · 코스
    const card = { url: hikingMountainCardUrl(ORIGIN, d.slug), width: HUB_CARD_SIZE, height: HUB_CARD_SIZE, alt: mountainCardAlt(d) };
    return { status: 200, tag: `hiking:mountain:${d.id}`, html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, card), jsonLd, image: card }) };
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
    return { status: 200, tag: "hiking:stamps", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, hubCard(ORIGIN, seo.path)), jsonLd: [crumbs(["도장첩", seo.path])] }) };
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
    return { status: 200, tag: "hiking:pack", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, hubCard(ORIGIN, seo.path)), jsonLd: [crumbs(["배낭", seo.path])] }) };
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
    return { status: 200, tag: "hiking:terms", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, hubCard(ORIGIN, seo.path)), jsonLd: [set, crumbs([HIKING_TERMS_H1, seo.path])] }) };
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
    return { status: 200, tag: `hiking:term:${t.id}`, html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, hubCard(ORIGIN, seo.path)), jsonLd: [ld, crumbs([HIKING_TERMS_H1, HIKING_TERMS_PATH], [t.term, seo.path])] }) };
}
/** 해외 명산 투어판 — 화면(AbroadPage)과 같은 글(shared/hikingAbroad). check 인 줄은 "(확인 필요)"를 붙인다 */
function abroad(): HikingRender {
    const seo = HIKING_ABROAD_SEO;
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a> › ${esc(HIKING_ABROAD_H1)}</nav>
  <h1>${esc(HIKING_ABROAD_H1)}</h1>
  <p>${esc(HIKING_ABROAD_LEAD)}</p>
${ABROAD_REGIONS.filter((r) => HIKING_ABROAD.some((c) => c.region === r.id)).map((r) => `  <section>
    <h2>${esc(r.name)}</h2>
    <ul>
${HIKING_ABROAD.filter((c) => c.region === r.id).map((c) => `      <li><a href="${hikingAbroadPath(c.id)}">${esc(c.name)}</a> — ${esc(`${c.country} · ${abroadHeightText(c.peakM)} · ${c.short}`)}</li>`).join("\n")}
    </ul>
  </section>`).join("\n")}
  <p>${esc(HIKING_ABROAD_NOTE)}</p>
${cta()}
${nav()}
</main>
${hubNav("ko")}`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: HIKING_ABROAD_H1, url: `${ORIGIN}${seo.path}`, itemListElement: HIKING_ABROAD.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, url: `${ORIGIN}${hikingAbroadPath(c.id)}` })) };
    return { status: 200, tag: "hiking:abroad", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, hubCard(ORIGIN, seo.path)), jsonLd: [list, crumbs([HIKING_ABROAD_H1, seo.path])] }) };
}
function abroadCourse(c: AbroadCourse): HikingRender {
    const seo = hikingAbroadSeo(c);
    const fact = (f: AbroadFact) => `      <li>${esc(f.text)}${f.check ? " (확인 필요)" : ""}</li>`;
    const sec = (title: string, facts: readonly AbroadFact[]) => `  <section>
    <h2>${esc(title)}</h2>
    <ul>
${facts.map(fact).join("\n")}
    </ul>
  </section>`;
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">${esc(HIKING_NAV_LABEL)}</a> › <a href="${HIKING_ABROAD_PATH}">${esc(HIKING_ABROAD_H1)}</a> › ${esc(c.name)}</nav>
  <h1>${esc(c.name)}</h1>
  <p>${esc(`${c.local} · ${c.country}`)}</p>
  <p>${esc(`산 높이 ${abroadHeightText(c.peakM)} · 이 코스 최고점 ${abroadHeightText(c.top.m)}(${c.top.where})${c.top.check ? " (확인 필요)" : ""} · 난이도 ${ABROAD_LEVEL_NAME[c.level]} · 고산병 ${ABROAD_ALTITUDE_NAME[c.altitude]}`)}</p>
  <p><strong>${esc(c.short)}</strong></p>
  <section>
    <h2>코스</h2>
    <p>${esc(c.course)}</p>
    <p>${esc(c.days)}</p>
    <p>${esc(c.levelNote)}</p>
  </section>
${sec("가기 좋은 때", c.season)}
${sec("허가 · 입산료", c.permits)}
${sec("가이드", [c.guide])}
${sec("가는 길", c.access)}
  <section>
    <h2>고산병</h2>
    <p>${esc(c.altitudeNote)}</p>
  </section>
${sec("볼거리", c.highlights.map((text) => ({ text })))}
${sec("조심할 것", c.cautions.map((text) => ({ text })))}
  <section>
    <h2>출처</h2>
    <ul>
${c.sources.map((s) => `      <li><a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a></li>`).join("\n")}
    </ul>
    <p>${esc(`확인한 날 ${HIKING_ABROAD_CHECKED_ON}. ${HIKING_ABROAD_NOTE}`)}</p>
  </section>
  <p><a href="${HIKING_ABROAD_PATH}">${esc(`해외 명산 ${HIKING_ABROAD.length}곳 다 보기`)}</a></p>
${cta()}
${nav()}
</main>
${hubNav("ko")}`;
    const ld = { "@context": "https://schema.org", "@type": "TouristAttraction", name: c.name, alternateName: c.local, description: c.short, url: `${ORIGIN}${seo.path}`, geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng } };
    return { status: 200, tag: `hiking:abroad:${c.id}`, html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, hubCard(ORIGIN, seo.path)), jsonLd: [ld, crumbs([HIKING_ABROAD_H1, HIKING_ABROAD_PATH], [c.name, seo.path])] }) };
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
    return { status: 200, tag: "hiking:checklist", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, hubCard(ORIGIN, seo.path)), jsonLd: [list, crumbs([HIKING_CHECKLIST_H1, seo.path])] }) };
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
    if (p === HIKING_ABROAD_PATH) return abroad();
    const am = /^\/hiking\/abroad\/([^/]+)$/.exec(p);
    if (am) { const c = hikingAbroad(decodeURIComponent(am[1])); return c ? abroadCourse(c) : null; }
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
/**
 * 사이트맵의 등산 구역. 주소마다 그 화면의 미리보기 그림을 싣는다(골프장 구역과 같은 꼴 — 검색엔진이 그림을 같이 가져간다):
 * 산은 그 산의 카드, 그 밖의 화면은 허브 카드(shared/ogCards). days 는 산마다 자료를 고친 날 — 있으면 lastmod 로 적는다
 * (목록 화면은 거기 실린 산 가운데 가장 늦은 날).
 */
export function hikingSitemapParts(all: readonly MountainSummary[], days: ReadonlyMap<string, string> = new Map()): string[] {
    if (all.length === 0) return [];
    const hubImage = (path: string) => hubCard(ORIGIN, path)?.url;
    const latest = (list: readonly MountainSummary[]) => list.reduce<string | null>((best, m) => { const d = days.get(m.id); return d && (!best || d > best) ? d : best; }, null);
    const everything = latest(all);
    const page = (path: string, opts: { changefreq: string; priority: string; lastmod?: string | null }) => entry(`${ORIGIN}${path}`, { ...opts, image: hubImage(path) });
    return [
        page(HIKING_HUB_PATH, { changefreq: "weekly", priority: "0.8", lastmod: everything }),
        page(HIKING_STAMPS_PATH, { changefreq: "monthly", priority: "0.6" }),
        page(HIKING_PACK_PATH, { changefreq: "monthly", priority: "0.6" }),
        page(HIKING_TERMS_PATH, { changefreq: "monthly", priority: "0.6" }),
        page(HIKING_CHECKLIST_PATH, { changefreq: "monthly", priority: "0.6" }),
        ...HIKING_TERMS.map((t) => page(hikingTermPath(t.id), { changefreq: "monthly", priority: "0.5" })),
        page(HIKING_ABROAD_PATH, { changefreq: "monthly", priority: "0.6" }),
        ...HIKING_ABROAD.map((c) => page(hikingAbroadPath(c.id), { changefreq: "monthly", priority: "0.5" })),
        ...HIKING_REGIONS.map((r) => page(hikingRegionPath(r.id), { changefreq: "weekly", priority: "0.6", lastmod: latest(all.filter((m) => m.region === r.id)) })),
        ...HIKING_GROUPS.map((l) => page(hikingListPath(l.id), { changefreq: "weekly", priority: l.kind === "list" ? "0.7" : "0.5", lastmod: everything })),
        ...all.filter((m) => m.courses > 0 || m.hasGuide).map((m) => entry(`${ORIGIN}${hikingMountainPath(m.slug)}`, {
            changefreq: "monthly", priority: m.tier === 1 ? "0.7" : m.tier === 2 ? "0.5" : "0.4", lastmod: days.get(m.id) ?? null, image: hikingMountainCardUrl(ORIGIN, m.slug),
        })),
    ];
}
