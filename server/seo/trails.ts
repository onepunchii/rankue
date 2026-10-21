// 코리아둘레길 프리렌더(2026-10-21) — /hiking/trails(허브) · /hiking/trails/<길> · /hiking/trails/<길>/<코스>.
// 글은 shared/koreaTrails 로 화면(client/src/hiking/trails)과 같다. 코스 소개 · 볼거리 · 가는 길은 두루누비 글 그대로 + 출처.
// prerender.ts 와 서로 import 하는 모양이라 page · esc · hubNav 는 함수 안에서만 부른다(최상위에서 호출하지 말 것).
import { TRAIL_SPOT_CREDIT, type TrailSpot } from "../../shared/trailSpots.js";
import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import {
    TRAILS_H1, TRAILS_PATH, TRAILS_SOURCE, TRAILS_TAGLINE, TRAIL_LEVEL_NAME, TRAIL_ROUTES, TRAIL_TOTAL_COURSES, trailCoursePath, trailCourseSeo, trailRouteOf, trailRoutePath, trailRouteSeo,
    trailTimeText, trailsHubSeo, type TrailCourseDetail, type TrailRouteMeta,
} from "../../shared/koreaTrails.js";
import { HIKING_HUB_PATH } from "../../shared/hikingMountains.js";
import { hubCard, trailCardUrl } from "../../shared/ogCards.js";

/** 본문 제목 바로 밑에 그 화면의 미리보기 그림(등산 · 골프장 검색용 화면과 같은 꼴 — og:image 와 같은 한 장) */
const withCard = (body: string, card: { url: string; width: number; height: number; alt: string } | null | undefined): string =>
    card ? body.replace("</h1>", `</h1>\n  <img src="${esc(card.url)}" width="${card.width}" height="${card.height}" alt="${esc(card.alt)}" loading="eager">`) : body;

const ORIGIN = "https://www.rankue.co.kr";
export interface TrailsRender { status: 200; tag: string; html: string }
/** 둘레길의 주소인가 — vercel.json 봇 라우트에도 같은 경로가 있어야 한다 */
export const TRAILS_RE = /^\/hiking\/trails(?:\/(?:haeparang|namparang|seohaerang|dmz)(?:\/[^/]+)?)?\/?$/;

const crumbs = (...tail: [string, string][]) => ({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["랭큐", "/"], ["랭큐 등산", HIKING_HUB_PATH], [TRAILS_H1, TRAILS_PATH], ...tail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })),
});
const bits = (c: TrailCourseDetail) => [`${c.km}km`, trailTimeText(c.minutes), c.level ? TRAIL_LEVEL_NAME[c.level] : "", c.sigun ?? "", ...c.tags].filter(Boolean).join(" · ");
const line = (c: TrailCourseDetail) => `      <li><a href="${trailCoursePath(c.route, c.key)}">${esc(c.name)}</a> — ${esc(bits(c))}</li>`;
const nav = () => `  <nav aria-label="코리아둘레길">
    <a href="${TRAILS_PATH}">${esc(TRAILS_H1)}</a>
${TRAIL_ROUTES.map((r) => `    <a href="${trailRoutePath(r.id)}">${esc(r.name)}</a>`).join("\n")}
    <a href="${HIKING_HUB_PATH}">전국 명산</a>
    <a href="/festivals">전국 축제</a>
  </nav>`;
const paras = (t: string) => t.split(/\n+/).map((p) => `    <p>${esc(p.replace(/^-\s*/, ""))}</p>`).join("\n");

function hub(all: readonly TrailCourseDetail[], meta: readonly TrailRouteMeta[]): TrailsRender {
    const seo = trailsHubSeo({ courses: all.length });
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${HIKING_HUB_PATH}">랭큐 등산</a> › ${esc(TRAILS_H1)}</nav>
  <h1>${esc(TRAILS_H1)}</h1>
  <p>${esc(TRAILS_TAGLINE)}</p>
  <p>${esc(seo.desc)}</p>
${TRAIL_ROUTES.map((r) => {
        const cs = all.filter((c) => c.route === r.id);
        const m = meta.find((x) => x.id === r.id);
        return `  <section>
    <h2><a href="${trailRoutePath(r.id)}">${esc(r.name)}</a> — ${esc(`${r.from} → ${r.to} · ${r.total}개 코스 · ${r.km.toLocaleString("en-US")}km`)}</h2>
${m?.line ? `    <p>${esc(m.line)}</p>\n` : ""}    <ul>
${cs.map(line).join("\n")}
    </ul>
  </section>`;
    }).join("\n")}
  <p>${esc(`자료 ${TRAILS_SOURCE} · 전체 ${TRAIL_TOTAL_COURSES}개 코스 중 두루누비 공개 코스 ${all.length}개`)}</p>
${nav()}
</main>
${hubNav("ko")}`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: "코리아둘레길", numberOfItems: TRAIL_ROUTES.length, itemListElement: TRAIL_ROUTES.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: r.name, url: `${ORIGIN}${trailRoutePath(r.id)}` })) };
    const card = hubCard(ORIGIN, TRAILS_PATH);
    return { status: 200, tag: "trails:hub", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, card), jsonLd: [list, crumbs()], ...(card ? { image: card } : {}) }) };
}

function route(id: string, all: readonly TrailCourseDetail[], meta: readonly TrailRouteMeta[]): TrailsRender | null {
    const r = trailRouteOf(id);
    if (!r) return null;
    const cs = all.filter((c) => c.route === r.id);
    const m = meta.find((x) => x.id === r.id);
    const seo = trailRouteSeo(r, { courses: cs.length, km: cs.reduce((a, c) => a + c.km, 0) });
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${TRAILS_PATH}">${esc(TRAILS_H1)}</a> › ${esc(r.name)}</nav>
  <h1>${esc(r.name)}</h1>
  <p>${esc(`${r.from} → ${r.to} · ${r.total}개 코스 · ${r.km.toLocaleString("en-US")}km`)}</p>
${m?.line ? `  <p>${esc(m.line)}</p>\n` : ""}${m?.desc ? `  <section>
    <h2>소개</h2>
${paras(m.desc)}
    <p>${esc(`글 ${TRAILS_SOURCE}`)}</p>
  </section>\n` : ""}  <section>
    <h2>${esc(`코스 ${cs.length}개(두루누비 공개)`)}</h2>
    <ul>
${cs.map(line).join("\n")}
    </ul>
  </section>
${nav()}
</main>
${hubNav("ko")}`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: r.name, numberOfItems: cs.length, itemListElement: cs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, url: `${ORIGIN}${trailCoursePath(c.route, c.key)}` })) };
    const card = hubCard(ORIGIN, trailRoutePath(r.id));
    return { status: 200, tag: "trails:route", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, card), jsonLd: [list, crumbs([r.name, trailRoutePath(r.id)])], ...(card ? { image: card } : {}) }) };
}

function course(c: TrailCourseDetail, prev: TrailCourseDetail | null, next: TrailCourseDetail | null, spots: readonly TrailSpot[] = []): TrailsRender {
    const r = trailRouteOf(c.route)!;
    const seo = trailCourseSeo(c);
    const facts: [string, string | null][] = [["길", r.name], ["거리", `${c.km}km`], ["걸리는 시간", trailTimeText(c.minutes) || null], ["난이도", c.level ? TRAIL_LEVEL_NAME[c.level] : null],
        ["오르막", `${c.gainM.toLocaleString("en-US")}m`], ["코스", c.loop ? "순환 코스" : "한 방향 코스"], ["시작", c.startName], ["끝", c.endName], ["지역", c.sigun], ["알림", c.tags.join(" · ") || null]];
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${TRAILS_PATH}">${esc(TRAILS_H1)}</a> › <a href="${trailRoutePath(r.id)}">${esc(r.name)}</a> › ${esc(c.name)}</nav>
  <h1>${esc(c.name)}</h1>
  <p>${esc(bits(c))}</p>
  <section>
    <h2>코스 정보</h2>
    <dl>
${facts.filter(([, v]) => v).map(([k, v]) => `      <dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("\n")}
    </dl>
  </section>
${c.summary || c.contents ? `  <section>
    <h2>코스 소개</h2>
${c.summary ? paras(c.summary) : ""}
${c.contents ? paras(c.contents) : ""}
    <p>${esc(`글 ${TRAILS_SOURCE}`)}</p>
  </section>` : ""}
${c.tour ? `  <section>
    <h2>볼거리</h2>
${paras(c.tour)}
  </section>` : ""}
${spots.length ? `  <section>
    <h2>코스 근처 볼거리</h2>
    <ul>
${spots.map((x) => `      <li>${esc(x.title)} — ${esc(x.dist < 0.5 ? "코스 바로 옆" : `코스에서 ${x.dist}km`)}${x.addr ? ` · ${esc(x.addr)}` : ""}</li>`).join("\n")}
    </ul>
    <p>${esc(TRAIL_SPOT_CREDIT)}</p>
  </section>` : ""}
${c.traveler ? `  <section>
    <h2>가는 길 · 편의</h2>
${paras(c.traveler)}
  </section>` : ""}
  <section>
    <h2>이어 걷기</h2>
    <ul>
${prev ? `      <li>앞 코스 <a href="${trailCoursePath(prev.route, prev.key)}">${esc(prev.name)}</a></li>` : ""}
${next ? `      <li>다음 코스 <a href="${trailCoursePath(next.route, next.key)}">${esc(next.name)}</a></li>` : ""}
      <li><a href="${trailRoutePath(r.id)}">${esc(`${r.name} 코스 전체`)}</a></li>
    </ul>
  </section>
${nav()}
</main>
${hubNav("ko")}`;
    const place = { "@context": "https://schema.org", "@type": "TouristAttraction", name: c.name, description: (c.summary ?? c.contents ?? "").slice(0, 300) || undefined, geo: { "@type": "GeoCoordinates", latitude: c.start[0], longitude: c.start[1] }, isAccessibleForFree: !c.tags.some((t) => t.includes("예약")) || undefined, url: `${ORIGIN}${seo.path}` };
    // 코스 카드 — 우리 그림 위에 코스 이름 · 거리 · 시간 · 난이도 + 그 코스의 선(server/services/trailCard)
    const card = { url: trailCardUrl(ORIGIN, c.route, c.key), width: 1200, height: 1200, alt: `${c.name} — ${bits(c)}` };
    return { status: 200, tag: "trails:course", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body: withCard(body, card), jsonLd: [{ ...place, image: card.url }, crumbs([r.name, trailRoutePath(r.id)], [c.name, seo.path])], image: card }) };
}

export function renderTrails(path: string, all: readonly TrailCourseDetail[], meta: readonly TrailRouteMeta[], find: (route: string, key: string) => { course: TrailCourseDetail; prev: TrailCourseDetail | null; next: TrailCourseDetail | null } | null, spotsOf: (courseId: string) => readonly TrailSpot[] = () => []): TrailsRender | null {
    const p = path.replace(/\/+$/, "") || "/";
    if (p === TRAILS_PATH) return hub(all, meta);
    const m = /^\/hiking\/trails\/([a-z]+)(?:\/([^/]+))?$/.exec(p);
    if (!m) return null;
    if (!m[2]) return route(m[1], all, meta);
    let key = m[2];
    try { key = decodeURIComponent(key); } catch { return null; }
    const hit = find(m[1], key);
    return hit ? course(hit.course, hit.prev, hit.next, spotsOf(hit.course.id)) : null;
}

/** 사이트맵 — 허브 · 길 넷 · 코스마다(받은 자료를 만든 날) */
export function trailsSitemapParts(all: readonly TrailCourseDetail[], made: string): string[] {
    if (!all.length) return [];
    return [
        // 허브 · 길은 허브 카드, 코스는 코스 카드(코스 선이 그려진 한 장) — 등산 사이트맵과 같은 꼴
        entry(`${ORIGIN}${TRAILS_PATH}`, { changefreq: "monthly", priority: "0.6", lastmod: made, image: hubCard(ORIGIN, TRAILS_PATH)?.url }),
        ...TRAIL_ROUTES.map((r) => entry(`${ORIGIN}${trailRoutePath(r.id)}`, { changefreq: "monthly", priority: "0.6", lastmod: made, image: hubCard(ORIGIN, trailRoutePath(r.id))?.url })),
        ...all.map((c) => entry(`${ORIGIN}${trailCoursePath(c.route, c.key)}`, { changefreq: "monthly", priority: "0.5", lastmod: made, image: trailCardUrl(ORIGIN, c.route, c.key) })),
    ];
}
