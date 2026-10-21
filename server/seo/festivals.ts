// 전국 축제 프리렌더(2026-10-21) — /festivals(허브: 지금 · 곧 열리는 축제 + 달마다) · /festivals/<번호>(축제 한 곳).
// 글은 shared/festivals 로 화면(client/src/festivals)과 같다. 소개 · 장소 · 시간 · 요금은 한국관광공사 자료 그대로 + 출처.
// 사진은 공공누리 제3유형 — 크기를 적지 않고 원본 그대로 싣는다(자르지 않는다).
// prerender.ts 와 서로 import 하는 모양이라 page · esc · hubNav 는 함수 안에서만 부른다(최상위에서 호출하지 말 것).
import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import {
    FESTIVALS_H1, FESTIVALS_PATH, FESTIVALS_TAGLINE, FESTIVAL_CREDIT, FESTIVAL_SOURCE, festivalBadge, festivalCatName, festivalPath, festivalPeriod, festivalPhotoCredit, festivalSeo,
    festivalState, festivalsHubSeo, liveFestivals, overlaps, thisWeekend, type FestivalDetail, type FestivalRow,
} from "../../shared/festivals.js";
import { hikingMountainPath, HIKING_HUB_PATH } from "../../shared/hikingMountains.js";
import { coursePath } from "../../shared/golfCourse.js";
import { fishingSpotPath } from "../../shared/fishingPlaces.js";
import { festivalCardUrl } from "../../shared/ogCards.js";

const ORIGIN = "https://www.rankue.co.kr";
export interface FestivalRender { status: 200; tag: string; html: string }
/** 축제의 주소인가 — vercel.json 봇 라우트에도 같은 경로가 있어야 한다 */
export const FESTIVALS_RE = /^\/festivals(?:\/\d{1,12})?\/?$/;

type Around = {
    mountains: { slug: string; name: string; heightM: number | null; km: number }[];
    golf: { slug: string; name: string; km: number }[];
    fishing: { id: string; name: string; kind: string | null; km: number }[];
    festivals: (FestivalRow & { km: number })[];
};

const crumbs = (...tail: [string, string][]) => ({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["랭큐", "/"], [FESTIVALS_H1, FESTIVALS_PATH], ...tail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })),
});
const isoDay = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
const line = (f: FestivalRow, today: string) =>
    `      <li><a href="${festivalPath(f.id)}">${esc(f.title)}</a> — ${esc([festivalPeriod(f, true), f.region, festivalBadge(f, today)].filter(Boolean).join(" · "))}</li>`;
const nav = () => `  <nav aria-label="둘러보기">
    <a href="${FESTIVALS_PATH}">${esc(FESTIVALS_H1)}</a>
    <a href="${HIKING_HUB_PATH}">전국 명산</a>
    <a href="/golf/courses">전국 골프장</a>
    <a href="/fishing/spots">전국 낚시터</a>
  </nav>`;

function hub(all: readonly FestivalRow[], today: string): FestivalRender {
    const live = liveFestivals(all, today, 45);
    const { sat, sun } = thisWeekend(today);
    // 화면과 같이 짧은 축제 먼저(두 달짜리 정원 · 전시가 '이번 주말' 맨 앞에 오지 않게)
    const len = (f: FestivalRow) => Date.UTC(+f.end.slice(0, 4), +f.end.slice(4, 6) - 1, +f.end.slice(6, 8)) - Date.UTC(+f.start.slice(0, 4), +f.start.slice(4, 6) - 1, +f.start.slice(6, 8));
    const weekend = live.filter((f) => overlaps(f, sat, sun)).sort((a, b) => len(a) - len(b) || a.start.localeCompare(b.start));
    const seo = festivalsHubSeo({ live: live.length, weekend: weekend.length });
    const year = today.slice(0, 4);
    // 달마다 — 올해 열린(열릴) 축제를 시작한 달로. 지난 축제는 올해 날짜 그대로(다음 해 날짜가 나오면 바뀐다)
    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => ({ m, items: all.filter((f) => f.start.slice(0, 6) === `${year}${m}`) })).filter((x) => x.items.length);
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › ${esc(FESTIVALS_H1)}</nav>
  <h1>${esc(FESTIVALS_H1)}</h1>
  <p>${esc(FESTIVALS_TAGLINE)}</p>
  <p>${esc(seo.desc)}</p>
${weekend.length ? `  <section>
    <h2>${esc(`이번 주말 열리는 축제 ${weekend.length}곳`)}</h2>
    <ul>
${weekend.map((f) => line(f, today)).join("\n")}
    </ul>
  </section>` : ""}
  <section>
    <h2>${esc(`지금 · 곧 열리는 축제 ${live.length}곳`)}</h2>
    <ul>
${live.map((f) => line(f, today)).join("\n")}
    </ul>
  </section>
  <section>
    <h2>${esc(`${year}년 달마다 축제`)}</h2>
${months.map((x) => `    <h3>${Number(x.m)}월 — ${x.items.length}곳</h3>
    <ul>
${x.items.map((f) => line(f, today)).join("\n")}
    </ul>`).join("\n")}
  </section>
  <p>${esc(FESTIVAL_CREDIT)}</p>
${nav()}
</main>
${hubNav("ko")}`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: "지금 · 곧 열리는 축제", numberOfItems: live.length, itemListElement: live.slice(0, 100).map((f, i) => ({ "@type": "ListItem", position: i + 1, name: f.title, url: `${ORIGIN}${festivalPath(f.id)}` })) };
    return { status: 200, tag: "festivals:hub", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [list, crumbs()] }) };
}

function one(f: FestivalDetail, around: Around, today: string): FestivalRender {
    const seo = festivalSeo(f, { mountains: around.mountains.length, golf: around.golf.length, fishing: around.fishing.length });
    const st = festivalState(f, today);
    const facts: [string, string | null][] = [
        ["기간", festivalPeriod(f, true)], ["장소", f.place], ["주소", f.addr], ["시간", f.playtime], ["요금", f.fee], ["주최", f.host], ["문의", f.tel ?? f.hostTel], ["종류", festivalCatName(f.cat)],
    ];
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="${FESTIVALS_PATH}">${esc(FESTIVALS_H1)}</a> › ${esc(f.title)}</nav>
  <h1>${esc(f.title)}</h1>
  <p>${esc([festivalPeriod(f, true), f.region, st.state === "ended" ? "올해 축제는 끝났어요 — 다음 날짜가 나오면 이 페이지가 바뀌어요" : festivalBadge(f, today)].filter(Boolean).join(" · "))}</p>
${f.image ? `  <figure><img src="${esc(f.image)}" alt="${esc(`${f.title} 사진`)}" loading="eager"><figcaption>${esc(festivalPhotoCredit(f.lic))}</figcaption></figure>` : ""}
  <section>
    <h2>축제 정보</h2>
    <dl>
${facts.filter(([, v]) => v).map(([k, v]) => `      <dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("\n")}
${f.homepage ? `      <dt>홈페이지</dt><dd><a href="${esc(f.homepage)}" rel="nofollow noopener">${esc(f.homepage)}</a></dd>` : ""}
    </dl>
  </section>
${f.overview ? `  <section>
    <h2>소개</h2>
${f.overview.split(/\n+/).map((p) => `    <p>${esc(p)}</p>`).join("\n")}
    <p>${esc(`소개 글 ${FESTIVAL_SOURCE}`)}</p>
  </section>` : ""}
${around.mountains.length ? `  <section>
    <h2>가는 길에 오를 산</h2>
    <ul>
${around.mountains.map((m) => `      <li><a href="${hikingMountainPath(m.slug)}">${esc(m.name)}</a> — ${esc([m.heightM ? `${m.heightM.toLocaleString("en-US")}m` : "", `${m.km}km`].filter(Boolean).join(" · "))}</li>`).join("\n")}
    </ul>
  </section>` : ""}
${around.golf.length ? `  <section>
    <h2>근처 골프장</h2>
    <ul>
${around.golf.map((g) => `      <li><a href="${coursePath(g.slug)}">${esc(g.name)}</a> — ${esc(`${g.km}km`)}</li>`).join("\n")}
    </ul>
  </section>` : ""}
${around.fishing.length ? `  <section>
    <h2>근처 낚시터</h2>
    <ul>
${around.fishing.map((p) => `      <li><a href="${fishingSpotPath(p.id)}">${esc(p.name)}</a> — ${esc([p.kind, `${p.km}km`].filter(Boolean).join(" · "))}</li>`).join("\n")}
    </ul>
  </section>` : ""}
${around.festivals.length ? `  <section>
    <h2>근처 다른 축제</h2>
    <ul>
${around.festivals.map((x) => line(x, today)).join("\n")}
    </ul>
  </section>` : ""}
  <p>${esc(FESTIVAL_CREDIT)}</p>
${nav()}
</main>
${hubNav("ko")}`;
    // 행사 구조화 자료 — 받은 날짜 · 장소 · 사진 그대로. 끝난 축제도 그 해의 행사로 남긴다(다음 해 날짜가 나오면 바뀐다)
    const event = {
        "@context": "https://schema.org", "@type": "Event", name: f.title, startDate: isoDay(f.start), endDate: isoDay(f.end),
        eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: f.place ?? f.title, address: { "@type": "PostalAddress", streetAddress: f.addr ?? undefined, addressRegion: f.region ?? undefined, addressCountry: "KR" }, geo: { "@type": "GeoCoordinates", latitude: f.lat, longitude: f.lng } },
        ...(f.image ? { image: [f.image] } : {}),
        ...(f.overview ? { description: f.overview.slice(0, 300) } : {}),
        ...(f.host ? { organizer: { "@type": "Organization", name: f.host, ...(f.homepage ? { url: f.homepage } : {}) } } : {}),
        url: `${ORIGIN}${seo.path}`,
    };
    // 미리보기 카드 — 우리 그림 위에 이름 · 기간 · 자리(server/services/festivalCard). 관광공사 사진은 카드에 얹지 않는다
    const card = { url: festivalCardUrl(ORIGIN, f.id), width: 1200, height: 1200, alt: `${f.title} — ${festivalPeriod(f, true)}` };
    return { status: 200, tag: "festivals:one", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [event, crumbs([f.title, seo.path])], image: card }) };
}

export async function renderFestivals(path: string, all: readonly FestivalRow[], today: string, detail: (id: string) => Promise<{ f: FestivalDetail; around: Around } | null>): Promise<FestivalRender | null> {
    const p = path.replace(/\/+$/, "") || "/";
    if (p === FESTIVALS_PATH) return all.length ? hub(all, today) : null;
    const m = /^\/festivals\/(\d{1,12})$/.exec(p);
    if (!m) return null;
    const d = await detail(m[1]);
    return d ? one(d.f, d.around, today) : null;
}

/** 사이트맵 — 허브 + 축제마다(고친 날 · 사진) */
export function festivalSitemapParts(all: readonly FestivalRow[], today: string): string[] {
    if (!all.length) return [];
    const day = (ymd: string | null) => (ymd ? isoDay(ymd) : null);
    return [
        entry(`${ORIGIN}${FESTIVALS_PATH}`, { changefreq: "daily", priority: "0.7", lastmod: isoDay(today) }),
        ...all.map((f) => entry(`${ORIGIN}${festivalPath(f.id)}`, { changefreq: "weekly", priority: f.end >= today ? "0.6" : "0.4", lastmod: day(f.mod), image: festivalCardUrl(ORIGIN, f.id), ...(f.image ? { images: [f.image] } : {}) })),
    ];
}
