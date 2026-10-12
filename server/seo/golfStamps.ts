// 골프 도장깨기 프리렌더(2026-10-12) — /golf/stamps(책장) · /golf/stamps/<권>(도장첩 한 권) · /golf/shelf(장식장).
//
// 본문은 shared/golfStampGuide · golfStampBooks · golfPins 로 화면(client/src/golf/pages/StampBooks · StampBook · GolfShelf)과 같은 글을 쓴다.
// 봇에게만 있는 문장을 만들지 않는다(클로킹 금지) — 화면의 '내 도장' · 예시 표시만 빠진다(그건 사람마다 다른 것이다).
// 도장첩 한 권은 그 권의 골프장 공개 페이지로 잇는다(엘리트 골프장으로 가는 안쪽 링크). 슬러그는 골프장 요약에서 찾고, 못 찾은 칸은 이름만 적는다.
// 한국어 전용.
//
// prerender.ts 와 서로 import 하는 모양이 되지만, 이 파일은 page·esc·hubNav 를 함수 안에서만 부른다(최상위에서 호출하지 말 것).
import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import { STAMP_ALL_OPEN, STAMP_BOOKS, STAMP_OPEN_TOTAL, STAMP_TROPHY_STEPS, stampBook, type StampBook } from "../../shared/golfStampBooks.js";
import { GOLF_PINS } from "../../shared/golfPins.js";
import { coursePath } from "../../shared/golfCourse.js";
import { hubCard } from "../../shared/ogCards.js";
import {
    SHELF_H1, SHELF_MARKER_TITLE, SHELF_PIN_TITLE, SHELF_TROPHY_TITLE, STAMPS_H1, STAMPS_HUB_PATH, STAMPS_NAV_LABEL, STAMP_GUIDE_STEPS, STAMP_GUIDE_UPDATED,
    STAMP_INVITE_ASIDE, STAMP_INVITE_NOTE, STAMP_INVITE_TITLE, STAMP_OPEN_ASIDE, STAMP_OPEN_TITLE, STAMP_SHELF_PATH, stampBookPath, stampBookSeo, stampShelfSeo, stampsHubSeo,
} from "../../shared/golfStampGuide.js";

const ORIGIN = "https://www.rankue.co.kr";

export interface GolfStampsRender { status: 200; tag: string; html: string }
/** 골프장 요약에서 쓰는 것만 — 슬러그를 찾을 정적 목록 줄 번호 */
export interface StampCoursePage { slug: string; courseIds: readonly number[] }

/** 도장첩의 주소인가(책장 · 한 권 · 장식장) — 라우트의 정규식. vercel.json 봇 라우트에도 같은 경로가 있어야 한다 */
export const GOLF_STAMPS_RE = /^\/golf\/(?:stamps(?:\/[a-z-]+)?|shelf)\/?$/;

const crumbs = (...tail: [string, string][]) => ({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [["랭큐", "/"], ["전국 골프장", "/golf/courses"], ...tail].map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${ORIGIN}${path}` })),
});
const card = (path: string) => { const c = hubCard(ORIGIN, path)!; return `<img src="${esc(c.url)}" width="${c.width}" height="${c.height}" alt="${esc(c.alt)}" />`; };
const guide = () => `  <section>
    <h2>도장은 이렇게 찍혀요</h2>
    <ol>
${STAMP_GUIDE_STEPS.map((s) => `      <li><strong>${esc(s.title)}</strong> — ${esc(s.body)}</li>`).join("\n")}
    </ol>
  </section>`;
const bookLine = (b: StampBook) => `      <li><a href="${stampBookPath(b.id)}">${esc(`${b.name} 도장첩`)}</a> — ${esc(`${b.slots.length}곳: ${b.slots.map((s) => s.name).join(" · ")}`)}</li>`;
// 함수로 둔다 — 최상위에서 esc 를 부르면 prerender.ts 와 서로 임포트하는 순서 때문에 아직 없는 함수를 부르게 된다
const nav = () => `  <nav aria-label="더 보기"><a href="${STAMPS_HUB_PATH}">${esc(STAMPS_NAV_LABEL)}</a> · <a href="${STAMP_SHELF_PATH}">${esc(SHELF_H1)}</a> · <a href="/golf/courses">전국 골프장</a> · <a href="/golf/join">조인 찾기</a></nav>`;

function hub(): GolfStampsRender {
    const seo = stampsHubSeo();
    const open = STAMP_BOOKS.filter((b) => b.kind === "open"), invite = STAMP_BOOKS.filter((b) => b.kind === "invite");
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="/golf/courses">전국 골프장</a> › ${esc(STAMPS_NAV_LABEL)}</nav>
  <h1>${esc(STAMPS_H1)}</h1>
  ${card(STAMPS_HUB_PATH)}
${guide()}
  <section>
    <h2>${esc(STAMP_OPEN_TITLE)}</h2>
    <p>${esc(STAMP_OPEN_ASIDE)}</p>
    <ul>
${open.map(bookLine).join("\n")}
    </ul>
  </section>
  <section>
    <h2>${esc(STAMP_INVITE_TITLE)}</h2>
    <p>${esc(STAMP_INVITE_ASIDE)}</p>
    <ul>
${invite.map(bookLine).join("\n")}
    </ul>
    <p>${esc(STAMP_INVITE_NOTE)}</p>
  </section>
${nav()}
</main>
${hubNav("ko")}`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: STAMPS_NAV_LABEL, itemListElement: STAMP_BOOKS.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: `${b.name} 도장첩`, url: `${ORIGIN}${stampBookPath(b.id)}` })) };
    return { status: 200, tag: "golf:stamps", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [list, crumbs([STAMPS_NAV_LABEL, STAMPS_HUB_PATH])] }) };
}

function bookPage(b: StampBook, pages: readonly StampCoursePage[]): GolfStampsRender {
    const seo = stampBookSeo(b);
    const slugOf = (ids: readonly number[]) => pages.find((p) => p.courseIds.some((id) => ids.includes(id)))?.slug ?? null;
    const slots = b.slots.map((s) => ({ name: s.name, slug: slugOf(s.courseIds) }));
    const others = STAMP_BOOKS.filter((x) => x.id !== b.id);
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="/golf/courses">전국 골프장</a> › <a href="${STAMPS_HUB_PATH}">${esc(STAMPS_NAV_LABEL)}</a> › ${esc(`${b.name} 도장첩`)}</nav>
  <h1>${esc(`${b.name} 도장첩`)}</h1>
  ${card(seo.path)}
  <section>
    <h2>${esc(`도장 ${b.slots.length}칸`)}</h2>
    <p>${esc(b.kind === "invite" ? "회원제 골프장" : "골프장에서 18홀을 끝내면 찍혀요")}</p>
    <ul>
${slots.map((s) => `      <li>${s.slug ? `<a href="${coursePath(s.slug)}">${esc(s.name)}</a>` : esc(s.name)}</li>`).join("\n")}
    </ul>
    <p>${esc(`다 채우면 받는 볼마커 — ${b.name} 볼마커`)}</p>
  </section>
${guide()}
  <section>
    <h2>다른 도장첩 보기</h2>
    <ul>
${others.map((x) => `      <li><a href="${stampBookPath(x.id)}">${esc(`${x.name} 도장첩`)}</a> — ${esc(`${x.slots.length}곳`)}</li>`).join("\n")}
    </ul>
  </section>
${nav()}
</main>
${hubNav("ko")}`;
    const list = { "@context": "https://schema.org", "@type": "ItemList", name: `${b.name} 도장첩`, numberOfItems: slots.length, itemListElement: slots.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, ...(s.slug ? { url: `${ORIGIN}${coursePath(s.slug)}` } : {}) })) };
    return { status: 200, tag: `golf:stamps:${b.id}`, html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [list, crumbs([STAMPS_NAV_LABEL, STAMPS_HUB_PATH], [`${b.name} 도장첩`, seo.path])] }) };
}

function shelf(): GolfStampsRender {
    const seo = stampShelfSeo();
    const last = STAMP_TROPHY_STEPS[STAMP_TROPHY_STEPS.length - 1];
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="/golf/courses">전국 골프장</a> › <a href="${STAMPS_HUB_PATH}">${esc(STAMPS_NAV_LABEL)}</a> › ${esc(SHELF_H1)}</nav>
  <h1>${esc(SHELF_H1)}</h1>
  ${card(STAMP_SHELF_PATH)}
  <section>
    <h2>${esc(SHELF_MARKER_TITLE)}</h2>
    <p>도장첩을 다 채우면 한 개</p>
    <ul>
${STAMP_BOOKS.map((b) => `      <li><a href="${stampBookPath(b.id)}">${esc(`${b.name} 볼마커`)}</a> — ${esc(`${b.name} 도장첩 ${b.slots.length}곳`)}</li>`).join("\n")}
      <li data-key="${STAMP_ALL_OPEN}">${esc(`누구나 ${STAMP_OPEN_TOTAL} 볼마커 — 누구나 도장첩 일곱 권 전부`)}</li>
    </ul>
  </section>
  <section>
    <h2>${esc(SHELF_TROPHY_TITLE)}</h2>
    <p>찍은 엘리트 골프장 수</p>
    <ul>
${STAMP_TROPHY_STEPS.map((n) => `      <li>${esc(n === last ? `트로피 전부 — ${n}곳` : `트로피 ${n}곳`)}</li>`).join("\n")}
    </ul>
  </section>
  <section>
    <h2>${esc(SHELF_PIN_TITLE)}</h2>
    <p>라운드를 쌓으면 붙어요</p>
    <ul>
${GOLF_PINS.map((p) => `      <li>${esc(`${p.name} — ${p.how}`)}</li>`).join("\n")}
    </ul>
    <p>골프장에서 끝낸 라운드만 세요. 타수 핀은 정규 18홀(총 파 68 이상)에서, 버디 · 이글은 파를 아는 홀에서 붙어요.</p>
  </section>
${nav()}
</main>
${hubNav("ko")}`;
    return { status: 200, tag: "golf:shelf", html: page({ lang: "ko", title: seo.title, desc: seo.desc, canonical: `${ORIGIN}${seo.path}`, body, jsonLd: [crumbs([STAMPS_NAV_LABEL, STAMPS_HUB_PATH], [SHELF_H1, STAMP_SHELF_PATH])] }) };
}

/**
 * 주소 → 검색용 화면. 도장첩의 주소가 아니거나 없는 권이면 null(다음 라우트로 — 화면이 '없는 도장첩이에요'를 그린다).
 * pages 는 골프장 요약(슬러그를 찾는 데만 쓴다) — 못 받았으면 빈 목록을 넘겨도 된다(이름만 적힌다).
 */
export function renderGolfStamps(path: string, pages: readonly StampCoursePage[] = []): GolfStampsRender | null {
    const p = path.replace(/\/+$/, "");
    if (p === STAMPS_HUB_PATH) return hub();
    if (p === STAMP_SHELF_PATH) return shelf();
    const m = /^\/golf\/stamps\/([a-z-]+)$/.exec(p);
    const b = m ? stampBook(m[1]) : undefined;
    return b ? bookPage(b, pages) : null;
}

/** 사이트맵(골프 허브 섹션에 얹는다) — 책장 · 아홉 권 · 장식장. 썸네일은 허브 카드 */
export function golfStampsSitemapParts(): string[] {
    const one = (path: string, priority: string) => entry(`${ORIGIN}${path}`, { changefreq: "monthly", priority, lastmod: STAMP_GUIDE_UPDATED, image: hubCard(ORIGIN, path)?.url });
    return [one(STAMPS_HUB_PATH, "0.7"), ...STAMP_BOOKS.map((b) => one(stampBookPath(b.id), "0.6")), one(STAMP_SHELF_PATH, "0.5")];
}
