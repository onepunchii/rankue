// 당구 대회 프리렌더(2026-09-24).
//   /tournaments                               허브 — 다가오는 대회(PBA 일정 + UMB 공식 달력) · PBA 시즌별 우승자 · UMB 해별 대회. 늘 색인.
//   /tournaments/pba/:season                   PBA 시즌 — 자기 페이지가 있는 투어 3개 미만이면 noindex, 행이 없는 시즌은 404
//   /tournaments/pba/:season/:tourCode         PBA 대회 — 끝났고 우승자가 있어야 색인(예정·진행 중 noindex), 시즌이 틀리거나 코드에 앞자리 0 이면 301
//   /tournaments/umb/:slug                     UMB 대회 — 포인트 받은 선수 16명 미만이면 noindex, 대문자 주소는 소문자로 301
// 제목·설명·색인 기준·JSON-LD 는 shared/tournamentMeta.ts — 화면(useSeo)·사이트맵과 같은 함수다.
// 본문은 같은 주소에서 React 가 그리는 것과 같은 데이터(GET /tournaments… 와 같은 저장소 함수)만 쓴다.
// 한국어 전용(?lang= 무시, canonical 은 늘 한국어 주소). DB 예외는 그대로 던진다 — 부른 쪽이 503 으로 바꾼다.
// X-Prerender tag 는 ASCII 만(슬러그는 [a-z0-9-], 나머지는 숫자·고정 꼬리표).
//
// prerender.ts 와 서로 import 하는 모양이지만 page·esc·hubNav 는 함수 안에서만 부르므로 모듈 초기화 순서와 상관없이 안전하다.
import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import { tournamentsRepo } from "../storage/tournaments.repo.js";
import { todayKst } from "../../shared/briefingMeta.js";
import { CAT_KO, fedNameKo, num } from "../../shared/umbCountryMeta.js";
import {
    HUB_H1, HUB_TITLE, PBA_LEAGUE_KO, PBA_TOUR_LEAGUES, TOURNAMENTS_PATH, UMB_KIND_KO, UMB_OFFICIAL, UMB_OFFICIAL_CALENDAR, UMB_SLUG_RE,
    cityKo, dateRangeKo, hasTourPage, hubDescription, hubJsonLd, parseSeasonSeg, parseTourCodeSeg, pbaOfficialUrl, pbaSeasonPath,
    pbaTourPath, primarySection, prizeKo, seasonDescription, seasonH1, seasonIndexable, seasonJsonLd, seasonLabelFull, seasonTitle,
    tourDescription, tourIndexable, tourJsonLd, tourNameWithSeason, tourStatus, tourTitle, umbEventDescription, umbEventIndexable,
    umbEventJsonLd, umbEventName, umbEventPath, umbEventTitle, umbRowNameKo,
    type PbaSeasonPage, type PbaTourPage, type PbaTourRow, type TournamentHub, type UmbEventDetail, type UmbEventSection, type UpcomingEvent,
} from "../../shared/tournamentMeta.js";

const ORIGIN = "https://www.rankue.co.kr";

export interface TournamentsRender { status: 200 | 301 | 404; tag: string; html: string; location?: string }

const SEASON_RE = /^\/tournaments\/pba\/([^/]+)$/;
const TOUR_RE = /^\/tournaments\/pba\/([^/]+)\/([^/]+)$/;
const UMB_RE = /^\/tournaments\/umb\/([^/]+)$/;

const link = (href: string, text: string) => `<a href="${esc(href)}">${esc(text)}</a>`;
const outLink = (href: string, text: string) => `<a href="${esc(href)}" rel="noopener">${esc(text)}</a>`;

/** 보이는 경로 표시. 마지막 칸은 현재 페이지(링크 없음). BreadcrumbList 는 JSON-LD 쪽에 있다. */
function crumbs(items: Array<{ name: string; path?: string }>): string {
    return `<nav aria-label="경로">${items.map((c) => (c.path ? link(c.path, c.name) : esc(c.name))).join(" › ")}</nav>`;
}
const HOME = { name: "랭큐", path: "/" };
const HUB = { name: "당구 대회", path: TOURNAMENTS_PATH };

const STATUS_KO = { upcoming: "예정", live: "진행 중", finished: "종료" } as const;
const SOURCE = `<p>출처: PBA 투어 공식 기록(${outLink("https://www.pbatour.org", "pbatour.org")}) · UMB 공식 랭킹·달력(${outLink(UMB_OFFICIAL, "umb-carom.org")})</p>`;

function gone(): TournamentsRender {
    return {
        status: 404,
        tag: "tournaments:404",
        html: page({
            lang: "ko",
            title: "대회를 찾을 수 없습니다 · 당구 대회 | 랭큐",
            desc: "요청한 당구 대회 정보가 없습니다.",
            canonical: `${ORIGIN}${TOURNAMENTS_PATH}`,
            noindex: true,
            body: `<main>
  <h1>대회를 찾을 수 없습니다</h1>
  <p>요청한 당구 대회 정보가 없습니다.</p>
  <p>${link(TOURNAMENTS_PATH, "당구 대회 일정·결과 전체 보기")}</p>
</main>
${hubNav("ko")}`,
        }),
    };
}

/** 우승자 — 선수 행과 맞았으면 선수 페이지 링크 */
const winnerHtml = (r: PbaTourRow) => !r.winnerName ? "" : r.winnerMemCode
    ? link(`/pba-player/${encodeURIComponent(r.winnerMemCode)}`, r.winnerName)
    : esc(r.winnerName);
const tourTitleHtml = (r: PbaTourRow) => hasTourPage(r) ? link(pbaTourPath(r.season, r.tourCode), r.title) : esc(r.title);

/* ── 허브 ── */

function upcomingLi(e: UpcomingEvent, today: string): string {
    const live = e.startDate <= today ? "진행 중" : "";
    if (e.source === "PBA") {
        const bits = [
            esc(dateRangeKo(e.startDate, e.endDate)),
            live,
            esc(e.league ? PBA_LEAGUE_KO[e.league] : "PBA"),
            e.href ? link(e.href, e.title) : esc(e.title),
            e.place ? esc(e.place) : "",
            e.postponed ? "연기" : "",
            outLink(e.officialUrl, "공식 안내"),
        ].filter(Boolean);
        return `<li>${bits.join(" · ")}</li>`;
    }
    const where = [e.place ? `${cityKo(e.place)}` : "", e.countryCode ? fedNameKo(e.countryCode) : e.country ?? ""].filter(Boolean).join(", ");
    const bits = [
        esc(dateRangeKo(e.startDate, e.endDate)),
        live,
        "UMB",
        esc(e.title),
        where ? esc(where) : "",
        e.org ? esc(e.org) : "",
        e.postponed ? "연기(POSTPONED)" : "",
        outLink(e.officialUrl, "UMB 공식 달력"),
    ].filter(Boolean);
    return `<li>${bits.join(" · ")}</li>`;
}

function renderHub(h: TournamentHub): TournamentsRender {
    const upcoming = h.upcoming.length
        ? `<ul>\n  ${h.upcoming.map((e) => upcomingLi(e, h.today)).join("\n  ")}\n  </ul>`
        : `<p>앞으로 1년 안에 잡힌 대회 일정이 아직 없습니다.</p>`;
    const umbNote = h.umbCalendarOk ? "" : `\n  <p>UMB 공식 달력을 지금 불러오지 못했습니다 — ${outLink(UMB_OFFICIAL_CALENDAR, "umb-carom.org/calendar")}에서 확인하세요.</p>`;
    const seasons = h.pbaSeasons.map((s) => `
  <h3>${link(pbaSeasonPath(s.season), `${seasonLabelFull(s.season)} PBA 투어`)}</h3>
  <p>대회 ${s.tours}개 · 종료 ${s.finished}개</p>${s.winners.length ? `
  <ul>
  ${s.winners.map((w) => `<li>${esc(PBA_LEAGUE_KO[w.league])} · ${tourTitleHtml(w)} — 우승 ${winnerHtml(w)}</li>`).join("\n  ")}
  </ul>` : ""}`).join("");
    const umb = h.umbYears.map((y) => `
  <h3>${esc(y.year)}년</h3>
  <ul>
  ${y.events.map((e) => `<li>${link(umbEventPath(e.slug), umbEventName(e))} — ${esc(dateRangeKo(e.date, e.date))} · ${esc(fedNameKo(e.country))} · 포인트 받은 선수 ${num(e.players)}명</li>`).join("\n  ")}
  </ul>`).join("");
    const body = `<main>
  ${crumbs([HOME, { name: HUB.name }])}
  <h1>${esc(HUB_H1)}</h1>
  <p>${esc(hubDescription(h))}</p>
  <h2>다가오는 대회</h2>
  ${upcoming}${umbNote}
  <h2>PBA 투어 시즌별 대회·우승자</h2>${seasons || "\n  <p>아직 모은 PBA 대회 기록이 없습니다.</p>"}
  <h2>UMB 3쿠션 월드컵·세계선수권</h2>${umb || "\n  <p>아직 모은 UMB 대회 기록이 없습니다.</p>"}
  ${SOURCE}
  <nav>${link("/pba", "PBA 투어 랭킹")} ${link("/world-ranking", "당구 세계랭킹")}</nav>
</main>
${hubNav("ko")}`;
    return {
        status: 200,
        tag: "tournaments:hub",
        html: page({
            lang: "ko", title: HUB_TITLE, desc: hubDescription(h), canonical: `${ORIGIN}${TOURNAMENTS_PATH}`,
            jsonLd: [hubJsonLd(h)], body,
        }),
    };
}

/* ── PBA 시즌 ── */

function seasonLi(r: PbaTourRow): string {
    const bits = [
        esc(dateRangeKo(r.startDate, r.endDate)),
        tourTitleHtml(r),
        r.place ? esc(r.place) : "",
        r.totalPrize ? esc(`총상금 ${prizeKo(r.totalPrize)}`) : "",
        r.winnerName ? `우승 ${winnerHtml(r)}` : "",
    ].filter(Boolean);
    return `<li>${bits.join(" · ")}</li>`;
}

function renderSeason(p: PbaSeasonPage): TournamentsRender {
    const indexable = seasonIndexable(p);
    const groups = PBA_TOUR_LEAGUES
        .map((lg) => [lg, p.tours.filter((t) => t.league === lg)] as const)
        .filter(([, list]) => list.length)
        .map(([lg, list]) => `
  <h2>${esc(PBA_LEAGUE_KO[lg])} 대회 ${list.length}개</h2>
  <ul>
  ${list.map(seasonLi).join("\n  ")}
  </ul>`).join("");
    const others = p.seasons.filter((s) => s !== p.season);
    const body = `<main>
  ${crumbs([HOME, HUB, { name: `${seasonLabelFull(p.season)} PBA 투어` }])}
  <h1>${esc(seasonH1(p.season))}</h1>
  <p>${esc(seasonDescription(p))}</p>${groups}${others.length ? `
  <h2>다른 시즌</h2>
  <p>${others.map((s) => link(pbaSeasonPath(s), `${seasonLabelFull(s)} 시즌`)).join(" · ")}</p>` : ""}
  ${SOURCE}
  <nav>${link(TOURNAMENTS_PATH, "당구 대회 일정·결과 전체")} ${link("/pba", "PBA 투어 랭킹")}</nav>
</main>
${hubNav("ko")}`;
    return {
        status: 200,
        tag: `tournaments:pba-season:${p.season}${indexable ? "" : ":noindex"}`,
        html: page({
            lang: "ko", title: seasonTitle(p.season), desc: seasonDescription(p), canonical: `${ORIGIN}${pbaSeasonPath(p.season)}`,
            noindex: !indexable, jsonLd: [seasonJsonLd(p)], body,
        }),
    };
}

/* ── PBA 대회 ── */

function renderTour(p: PbaTourPage): TournamentsRender {
    const r = p.tour;
    const code = r.tourCode!;
    const indexable = tourIndexable(r, p.today);
    const st = tourStatus(r, p.today);
    const info = [
        `리그: ${PBA_LEAGUE_KO[r.league]} · ${seasonLabelFull(r.season)} 시즌`,
        `일정: ${dateRangeKo(r.startDate, r.endDate)} (${STATUS_KO[st]})`,
        r.place ? `장소: ${r.place}` : "",
        r.totalPrize ? `총상금: ${prizeKo(r.totalPrize)}` : "",
        r.winnerPrize ? `우승상금: ${prizeKo(r.winnerPrize)}` : "",
        r.participants ? `참가 선수: ${num(r.participants)}명` : "",
    ].filter(Boolean);
    const w = p.winner;
    const stats = w ? [
        w.average != null ? `통산 에버리지 ${w.average}` : "",
        w.highRun != null ? `하이런 ${w.highRun}` : "",
        w.bankShotRate != null ? `뱅크샷 성공률 ${w.bankShotRate}%` : "",
        w.win != null && w.lose != null ? `통산 ${w.win}승 ${w.lose}패${w.draw ? ` ${w.draw}무` : ""}` : "",
        w.careerPrize != null ? `통산 상금 ${prizeKo(w.careerPrize)}` : "",
    ].filter(Boolean) : [];
    const winner = r.winnerName ? `
  <h2>우승자</h2>
  <p>${w ? link(`/pba-player/${encodeURIComponent(w.memCode)}`, w.nameKo) : esc(r.winnerName)}${w?.nameEn ? ` (${esc(w.nameEn)})` : ""}${w?.nationCode ? ` · ${esc(fedNameKo(w.nationCode))}` : ""}</p>${stats.length ? `
  <ul>
  ${stats.map((s) => `<li>${esc(s)}</li>`).join("\n  ")}
  </ul>
  <p>위 수치는 PBA 공식 선수 기록의 통산(누적) 값이며, 이 대회만의 기록이 아닙니다.</p>` : ""}` : "";
    const history = p.history.length ? `
  <h2>같은 대회 역대 우승자</h2>
  <ul>
  ${p.history.map((h) => `<li>${esc(seasonLabelFull(h.season))} · ${h.tourCode === r.tourCode ? esc(h.title) : tourTitleHtml(h)} — ${h.winnerName ? `우승 ${winnerHtml(h)}` : esc(STATUS_KO[tourStatus(h, p.today)])}</li>`).join("\n  ")}
  </ul>` : "";
    const near = [p.prev ? `이전 대회: ${tourTitleHtml(p.prev)}` : "", p.next ? `다음 대회: ${tourTitleHtml(p.next)}` : ""].filter(Boolean);
    const body = `<main>
  ${crumbs([HOME, HUB, { name: `${seasonLabelFull(r.season)} PBA 투어`, path: pbaSeasonPath(r.season) }, { name: r.title }])}
  <h1>${esc(tourNameWithSeason(r))}</h1>
  <p>${esc(tourDescription(p))}</p>
  <h2>대회 정보</h2>
  <ul>
  ${info.map((s) => `<li>${esc(s)}</li>`).join("\n  ")}
  </ul>${winner}${history}
  <h2>같은 시즌 다른 대회</h2>
  <p>${[...near, link(pbaSeasonPath(r.season), `${seasonLabelFull(r.season)} 시즌 전체 일정`)].join(" · ")}</p>
  <p>${outLink(pbaOfficialUrl(r.officialSeq), "PBA 공식 대회 안내")}</p>
  <p>출처: PBA 투어 공식 기록</p>
  <nav>${link(TOURNAMENTS_PATH, "당구 대회 일정·결과 전체")} ${link("/pba", "PBA 투어 랭킹")}</nav>
</main>
${hubNav("ko")}`;
    return {
        status: 200,
        tag: `tournaments:pba-tour:${code}${indexable ? "" : ":noindex"}`,
        html: page({
            lang: "ko", title: tourTitle(r), desc: tourDescription(p), canonical: `${ORIGIN}${pbaTourPath(r.season, code)}`,
            noindex: !indexable, jsonLd: [tourJsonLd(p)], body,
        }),
    };
}

/* ── UMB 대회 ── */

function umbSectionHtml(s: UmbEventSection): string {
    const row = (x: UmbEventSection["rows"][number]) => {
        const name = link(`/player/${s.category}/${encodeURIComponent(x.playerUmbId)}`, umbRowNameKo(x));
        return `<tr><td>${x.fed === "KR" ? `<strong>${name}</strong>` : name}</td><td>${esc(fedNameKo(x.fed))}</td><td>${num(x.points)}</td></tr>`;
    };
    return `
  <h2>${esc(CAT_KO[s.category])} 세계랭킹 — 획득 랭킹 포인트 ${num(s.rows.length)}명</h2>
  <p>${esc(`UMB 세계랭킹 ${s.edition} 회차에 이 대회 몫으로 적힌 포인트입니다(포인트 많은 순). 대회 순위가 아닙니다.`)}</p>
  <table>
  <thead><tr><th>선수</th><th>국가</th><th>획득 랭킹 포인트</th></tr></thead>
  <tbody>
  ${s.rows.map(row).join("\n  ")}
  </tbody>
  </table>`;
}

function renderUmb(d: UmbEventDetail): TournamentsRender {
    const indexable = umbEventIndexable(d);
    const sec = primarySection(d);
    const kr = (sec?.rows ?? []).filter((x) => x.fed === "KR");
    const info = [
        `종류: 3쿠션 ${UMB_KIND_KO[d.kind]}`,
        `장소: ${cityKo(d.city)}${cityKo(d.city) !== d.city ? `(${d.city})` : ""}, ${fedNameKo(d.country)}`,
        d.org ? `주관: ${d.org}` : "",
        `대회일(UMB 랭킹 표기): ${dateRangeKo(d.date, d.date)}`,
    ].filter(Boolean);
    const body = `<main>
  ${crumbs([HOME, HUB, { name: umbEventName(d) }])}
  <h1>${esc(umbEventName(d))}</h1>
  <p>${esc(umbEventDescription(d))}</p>
  <h2>대회 정보</h2>
  <ul>
  ${info.map((s) => `<li>${esc(s)}</li>`).join("\n  ")}
  </ul>${kr.length && sec ? `
  <h2>한국 선수 ${kr.length}명</h2>
  <ul>
  ${kr.map((x) => `<li>${link(`/player/${sec.category}/${encodeURIComponent(x.playerUmbId)}`, umbRowNameKo(x))} — ${num(x.points)}점</li>`).join("\n  ")}
  </ul>` : ""}${d.sections.map(umbSectionHtml).join("")}${d.others.length ? `
  <h2>같은 대회 다른 해</h2>
  <ul>
  ${d.others.map((o) => `<li>${link(umbEventPath(o.slug), umbEventName(o))} — 포인트 받은 선수 ${num(o.players)}명</li>`).join("\n  ")}
  </ul>` : ""}
  <p>출처: UMB 공식 랭킹 — ${outLink(UMB_OFFICIAL, "umb-carom.org")}</p>
  <nav>${link(TOURNAMENTS_PATH, "당구 대회 일정·결과 전체")} ${link("/world-ranking", "당구 세계랭킹")}</nav>
</main>
${hubNav("ko")}`;
    return {
        status: 200,
        tag: `tournaments:umb:${d.slug}${indexable ? "" : ":noindex"}`,
        html: page({
            lang: "ko", title: umbEventTitle(d), desc: umbEventDescription(d), canonical: `${ORIGIN}${umbEventPath(d.slug)}`,
            noindex: !indexable, jsonLd: [umbEventJsonLd(d)], body,
        }),
    };
}

/**
 * 경로 하나를 렌더한다. pathname 은 req.path(인코딩된 그대로). 내 경로 모양이 아니면 null.
 * query 는 계약상 받지만 쓰지 않는다(언어판 없음).
 */
export async function renderTournaments(pathname: string, query: Record<string, string>): Promise<TournamentsRender | null> {
    void query;
    const path = pathname.replace(/\/+$/, "") || "/";
    if (path === TOURNAMENTS_PATH) return renderHub(await tournamentsRepo.getHub());

    let m = TOUR_RE.exec(path);
    if (m) {
        const code = parseTourCodeSeg(m[2]);
        if (!parseSeasonSeg(m[1]) || !code) return gone();
        const p = await tournamentsRepo.getPbaTourPage(code);
        if (!p) return gone();
        // 시즌 조각이 틀렸거나 코드에 앞자리 0 이 붙은 주소("…/2025/0243")는 정본으로 — 같은 대회가 두 주소로 색인되지 않게
        if (String(p.tour.season) !== m[1] || String(code) !== m[2]) {
            return { status: 301, tag: "tournaments:301", html: "", location: pbaTourPath(p.tour.season, code) };
        }
        return renderTour(p);
    }
    if ((m = SEASON_RE.exec(path))) {
        const season = parseSeasonSeg(m[1]);
        const p = season ? await tournamentsRepo.getPbaSeasonPage(season) : null;
        return p ? renderSeason(p) : gone();
    }
    if ((m = UMB_RE.exec(path))) {
        const seg = m[1];
        const slug = seg.toLowerCase();
        if (slug.length > 80 || !UMB_SLUG_RE.test(slug)) return gone();
        if (seg !== slug) return { status: 301, tag: "tournaments:301", html: "", location: umbEventPath(slug) };
        const d = await tournamentsRepo.getUmbEventDetail(slug);
        return d ? renderUmb(d) : gone();
    }
    return null;
}

/**
 * 사이트맵 "tournaments" 섹션 — 허브 + 색인 기준을 넘는 시즌·대회·UMB 대회. 판정은 프리렌더와 같은 함수다.
 * lastmod: 허브·시즌은 가장 최근에 끝난 대회의 마지막 날, 대회는 그 대회 마지막 날, UMB 는 포인트를 읽은 회차 날짜.
 */
export async function tournamentsSitemapParts(): Promise<string[]> {
    const parts: string[] = [];
    const today = todayKst();
    let latestResult: string | null = null;
    try {
        const rows = await tournamentsRepo.allPbaRows();
        const bySeason = new Map<number, PbaTourRow[]>();
        for (const r of rows) bySeason.set(r.season, [...(bySeason.get(r.season) ?? []), r]);
        for (const [season, tours] of [...bySeason.entries()].sort((a, b) => b[0] - a[0])) {
            const done = tours.filter((t) => tourStatus(t, today) === "finished").map((t) => t.endDate).sort();
            const last = done.length ? done[done.length - 1] : null;
            if (last && (!latestResult || last > latestResult)) latestResult = last;
            if (seasonIndexable({ tours })) {
                const current = tours.some((t) => tourStatus(t, today) !== "finished");
                parts.push(entry(`${ORIGIN}${pbaSeasonPath(season)}`, { changefreq: current ? "weekly" : "monthly", priority: "0.6", lastmod: last }));
            }
            for (const t of tours) {
                if (!hasTourPage(t) || !tourIndexable(t, today)) continue;
                parts.push(entry(`${ORIGIN}${pbaTourPath(t.season, t.tourCode)}`, {
                    changefreq: "yearly", priority: t.league === "PBA" || t.league === "LPBA" ? "0.5" : "0.4", lastmod: t.endDate,
                }));
            }
        }
    } catch (e) {
        console.warn("[sitemap] pba tournaments failed:", (e as Error)?.message);
    }
    try {
        const events = await tournamentsRepo.getUmbEvents();
        const detail = await tournamentsRepo.getUmbEventDates();
        for (const e of events) {
            if (e.date && (!latestResult || e.date > latestResult) && e.date <= today) latestResult = e.date;
            if (!umbEventIndexable(e)) continue;
            parts.push(entry(`${ORIGIN}${umbEventPath(e.slug)}`, { changefreq: "monthly", priority: "0.5", lastmod: detail.get(e.slug) ?? e.date }));
        }
    } catch (e) {
        console.warn("[sitemap] umb tournaments failed:", (e as Error)?.message);
    }
    // 허브는 맨 앞 — 늘 싣는다(다가오는 대회가 매일 바뀐다)
    parts.unshift(entry(`${ORIGIN}${TOURNAMENTS_PATH}`, { changefreq: "daily", priority: "0.7", lastmod: latestResult }));
    return parts;
}
