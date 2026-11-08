// 매장 대회 검색용 화면(2026-11-08 — 키워드 보강 P1): /store-cup/<id>. 화면(client/src/pages/store-cup.tsx)과 같은 자료.
// 참가자 이름은 싣지 않는다(공개 검색 결과에 회원 명단을 내지 않는다 — /club/:id 와 같은 원칙). 수만 센다.
// 끝난 대회도 그 매장의 기록으로 남지만, 사이트맵에는 접수 중 · 진행 중이거나 끝난 지 30일 안의 것만(storeCupInSitemap).
// prerender.ts 와 서로 import 하는 모양이라 page · esc 는 함수 안에서만 부른다.
import { page, esc } from "../prerender.js";
import { STORE_CUP_STATUS, storeCupLine, storeCupPath, feeText } from "../../shared/storeCup.js";

const ORIGIN = "https://www.rankue.co.kr";
export const STORE_CUP_RE = /^\/store-cup\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

export interface StoreCupSeoInput {
    cup: { id: string; title: string; description: string | null; status: string; gameType: string; maxPlayers: number; bestOf: number; recruitEnd: Date | string | null; startAt: Date | string | null; prize: string | null; entryFee: number | null };
    store: { name: string; listingCode: string | null; address: string | null; region: string | null };
    players: number;
    champion: string | null;
}

const KST_DAY = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
const KST_TIME = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const dayText = (d: Date | string | null) => (d ? `${KST_DAY.format(new Date(d))} ${KST_TIME.format(new Date(d))}` : null);

export function storeCupSeo(x: StoreCupSeoInput): { title: string; desc: string; h1: string } {
    const kind = x.cup.gameType === "3c" ? "3쿠션" : "4구";
    const when = x.cup.startAt ? KST_DAY.format(new Date(x.cup.startAt)) : null;
    return {
        h1: x.cup.title,
        title: `${x.cup.title} — ${x.store.name} 당구 대회${when ? ` · ${when}` : ""} | 랭큐`,
        desc: `${x.store.name}${x.store.region ? `(${x.store.region})` : ""}에서 여는 ${kind} 대회. ${storeCupLine(x.cup)} · ${STORE_CUP_STATUS[x.cup.status] ?? ""} · 참가 ${x.players}/${x.cup.maxPlayers}명. 랭큐에서 신청하고 대진표 · 점수를 봐요.`,
    };
}

export function renderStoreCup(x: StoreCupSeoInput): { status: 200; tag: string; html: string } {
    const seo = storeCupSeo(x);
    const url = `${ORIGIN}${storeCupPath(x.cup.id)}`;
    const storeHref = x.store.listingCode ? `/stores/${encodeURIComponent(x.store.listingCode)}` : null;
    const rows: [string, string][] = [
        ["매장", storeHref ? `<a href="${storeHref}">${esc(x.store.name)}</a>` : esc(x.store.name)],
        ...(x.store.address ? [["주소", esc(x.store.address)] as [string, string]] : []),
        ["종목 · 방식", esc(storeCupLine(x.cup))],
        ["상태", esc(STORE_CUP_STATUS[x.cup.status] ?? x.cup.status)],
        ["참가", `${x.players} / ${x.cup.maxPlayers}명`],
        ...(dayText(x.cup.recruitEnd) ? [["접수 마감", esc(dayText(x.cup.recruitEnd)!)] as [string, string]] : []),
        ...(dayText(x.cup.startAt) ? [["대회 날", esc(dayText(x.cup.startAt)!)] as [string, string]] : []),
        ...(x.cup.entryFee ? [["참가비", `${esc(feeText(x.cup.entryFee))}(매장에서 직접)`] as [string, string]] : []),
        ...(x.cup.prize ? [["상품", esc(x.cup.prize)] as [string, string]] : []),
        ...(x.champion ? [["우승", esc(x.champion)] as [string, string]] : []),
    ];
    const status = x.cup.status === "canceled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled";
    const event = {
        "@context": "https://schema.org", "@type": "SportsEvent", name: x.cup.title, url,
        sport: x.cup.gameType === "3c" ? "3쿠션 당구(Three-cushion billiards)" : "4구 당구(Four-ball billiards)",
        eventStatus: status, eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        ...(iso(x.cup.startAt) ? { startDate: iso(x.cup.startAt) } : {}),
        ...(x.cup.description ? { description: x.cup.description.slice(0, 300) } : {}),
        maximumAttendeeCapacity: x.cup.maxPlayers,
        location: { "@type": ["LocalBusiness", "SportsActivityLocation"], name: x.store.name, ...(storeHref ? { url: `${ORIGIN}${storeHref}` } : {}), ...(x.store.address ? { address: { "@type": "PostalAddress", streetAddress: x.store.address, addressCountry: "KR" } } : {}) },
        organizer: { "@type": "Organization", name: x.store.name, ...(storeHref ? { url: `${ORIGIN}${storeHref}` } : {}) },
        ...(x.cup.entryFee ? { offers: { "@type": "Offer", price: x.cup.entryFee, priceCurrency: "KRW", availability: x.cup.status === "recruiting" ? "https://schema.org/InStock" : "https://schema.org/SoldOut", url } } : {}),
    };
    const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [["랭큐", `${ORIGIN}/`], ...(storeHref ? [[x.store.name, `${ORIGIN}${storeHref}`]] : []), [x.cup.title, url]].map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) };
    const body = `<main>
  <nav aria-label="경로"><a href="/">랭큐 홈</a>${storeHref ? ` › <a href="${storeHref}">${esc(x.store.name)}</a>` : ""} › 매장 대회</nav>
  <h1>${esc(seo.h1)}</h1>
  <p>${esc(seo.desc)}</p>
${x.cup.description ? `  <p>${esc(x.cup.description)}</p>\n` : ""}  <section>
    <h2>대회 정보</h2>
    <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>
  </section>
  <section>
    <h2>참가 · 대진표</h2>
    <p>랭큐에 가입하면 이 대회에 참가 신청하고, 대진이 나오면 내 경기를 점수판으로 바로 칠 수 있어요. 결과는 대진표에 저절로 올라가요.</p>
    <p><a href="${url}">랭큐에서 ${esc(x.cup.title)} 보기</a></p>
  </section>
  <nav><a href="/">홈으로</a> <a href="/stores">전국 당구장</a> <a href="/tournaments">당구 대회 일정</a></nav>
</main>`;
    return { status: 200, tag: "store-cup", html: page({ title: seo.title, desc: seo.desc, canonical: url, jsonLd: [event, crumbs], body }) };
}
