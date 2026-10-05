// 골프 읽을거리 프리렌더(2026-10-05) — /golf/checklist(라운딩 준비물 체크리스트).
//
// 본문은 shared/golfPack.ts 로 화면(client/src/golf/pages/GolfChecklist.tsx)과 같은 글을 쓴다.
// 봇에게만 있는 문장을 만들지 않는다(클로킹 금지) — 화면의 '눌러서 지우기' 조작만 빠진다.
// 한국어 전용. 본문이 코드에 있어 DB 를 타지 않으므로 던지지 않는다.
//
// prerender.ts 와 서로 import 하는 모양이 되지만, 이 파일은 page·esc·hubNav 를 함수 안에서만 부르므로
// 모듈 초기화 순서와 상관없이 안전하다(최상위에서 호출하지 말 것).
import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import {
    PACK_BASE, PACK_DESC, PACK_FAQ, PACK_FIRST, PACK_H1, PACK_INTRO, PACK_NAV_LABEL, PACK_PATH, PACK_SEASONS, PACK_TITLE, PACK_UPDATED,
    PACK_WEATHER, PACK_WEATHER_NOTE, gearEmoji, packJsonLd, type PackItem,
} from "../../shared/golfPack.js";

const ORIGIN = "https://www.rankue.co.kr";
const GOLF_IMAGE = { url: `${ORIGIN}/og-golf.png`, width: 1200, height: 630, alt: "랭큐 골프" };

export interface GolfGuideRender { status: 200; tag: string; html: string }

const item = (i: PackItem) => `      <li>${esc(`${i.emoji} ${i.label}`)}${i.note ? ` — ${esc(i.note)}` : ""}</li>`;

export function renderGolfChecklist(): GolfGuideRender {
    const seasons = PACK_SEASONS.map((s) => `  <section>
    <h2>${esc(`${s.emoji} ${s.title}`)}</h2>
    <p>${esc(s.lead)}</p>
    <ul>
${s.items.map(item).join("\n")}
    </ul>
  </section>`).join("\n");
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a> › <a href="/golf/courses">전국 골프장</a> › ${esc(PACK_NAV_LABEL)}</nav>
  <h1>${esc(PACK_H1)}</h1>
  <p>${esc(PACK_INTRO)}</p>
  <section>
    <h2>늘 챙기는 것</h2>
    <ul>
${PACK_BASE.map(item).join("\n")}
    </ul>
  </section>
  <section>
    <h2>날씨에 따라</h2>
    <dl>
${PACK_WEATHER.map((w) => `      <dt>${esc(w.when)}</dt>\n      <dd>${esc(w.gear.map((g) => `${gearEmoji(g)} ${g}`).join(" · "))}</dd>`).join("\n")}
    </dl>
    <p><a href="/golf/courses">${esc(PACK_WEATHER_NOTE)}</a></p>
  </section>
${seasons}
  <section>
    <h2>처음 가는 날이라면</h2>
    <ul>
${PACK_FIRST.map((t) => `      <li>${esc(t)}</li>`).join("\n")}
    </ul>
  </section>
  <section>
    <h2>자주 묻는 것</h2>
    <dl>
${PACK_FAQ.map((f) => `      <dt>${esc(f.q)}</dt>\n      <dd>${esc(f.a)}</dd>`).join("\n")}
    </dl>
  </section>
  <nav aria-label="더 보기"><a href="/golf/courses">전국 골프장 · 날씨</a> · <a href="/golf/join">조인 찾기</a></nav>
</main>
${hubNav("ko")}`;
    const crumbs = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        itemListElement: [
            { "@type": "ListItem", position: 1, name: "랭큐", item: `${ORIGIN}/` },
            { "@type": "ListItem", position: 2, name: "전국 골프장", item: `${ORIGIN}/golf/courses` },
            { "@type": "ListItem", position: 3, name: PACK_NAV_LABEL, item: `${ORIGIN}${PACK_PATH}` },
        ],
    };
    return {
        status: 200, tag: "golf:checklist",
        html: page({ lang: "ko", title: PACK_TITLE, desc: PACK_DESC, canonical: `${ORIGIN}${PACK_PATH}`, image: GOLF_IMAGE, body, jsonLd: [packJsonLd(ORIGIN), crumbs] }),
    };
}

/** 사이트맵(골프 허브 섹션에 얹는다) — lastmod 는 글을 고친 날 */
export function golfGuideSitemapParts(): string[] {
    return [entry(`${ORIGIN}${PACK_PATH}`, { changefreq: "monthly", priority: "0.6", lastmod: PACK_UPDATED })];
}
