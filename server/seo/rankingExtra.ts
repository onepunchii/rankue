import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import { storage } from "../storage/index.js";
import {
  CAT_KO, COUNTRY_INDEX_MIN, MOVER_RANK_CUTOFF, MOVERS_H1, MOVERS_PATH, MOVERS_TITLE,
  countryDescription, countryH1, countryIndexable, countryPath, countryTitle, editionDateKo, fedNameKo,
  moversDescription, moversIndexable, nameFullKo, num, sectionOf,
  type UmbCat, type UmbCountryReport, type UmbCountrySection, type UmbMoveRow, type UmbMoversReport, type UmbMoversSection,
} from "../../shared/umbCountryMeta.js";

// 국가별 세계랭킹 · 순위 변동 프리렌더(2026-09-24).
//   /world-ranking/country/:fed   나라 하나 — 남자 등재 10명 미만은 noindex, 어느 부문에도 없는 코드는 404, 소문자는 대문자로 301
//   /world-ranking/movers         최신 vs 직전 회차 한 장(회차별 보관 없음) — 남자 순위 변동 20명 미만이면 noindex
// 제목·설명·색인 기준은 shared/umbCountryMeta.ts — 화면(useSeo)·사이트맵과 같은 함수다.
// 본문은 같은 주소에서 React 가 그리는 것과 같은 데이터(GET /umb/country/:fed · /umb/weekly-movers 와 같은 저장소 함수)만 쓴다.
// 언어판은 없다(한국어 전용) — ?lang= 은 무시하고 canonical 은 늘 한국어 주소다.
// DB 예외는 그대로 던진다 — 부른 쪽이 503 으로 바꾼다(404 로 내면 일시 장애 동안 색인에서 빠진다).

const ORIGIN = "https://www.rankue.co.kr";

export interface RankingExtraRender { status: 200 | 301 | 404; tag: string; html: string; location?: string }

const COUNTRY_RE = /^\/world-ranking\/country\/([^/]+)$/;

function gone(title: string, msg: string): RankingExtraRender {
  return {
    status: 404, tag: "404",
    html: `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8" /><title>${esc(title)}</title>
<meta name="robots" content="noindex, follow" /></head>
<body><main><h1>${esc(title)}</h1><p>${esc(msg)}</p>
<nav><a href="/world-ranking">당구 세계랭킹</a> <a href="/">홈으로</a></nav></main></body>
</html>
`,
  };
}

const playerHref = (cat: UmbCat, id: string) => `/player/${cat}/${encodeURIComponent(id)}`;
const playerLink = (cat: UmbCat, r: UmbMoveRow) => `<a href="${esc(playerHref(cat, r.playerUmbId))}">${esc(nameFullKo(r))}</a>`;

/** 한 줄의 변동 표기 — 직전 회차가 없으면 비교할 게 없어 아무것도 안 붙인다 */
function moveKo(r: UmbMoveRow, hasPrev: boolean): string {
  if (!hasPrev) return "";
  if (r.rank === null) return `직전 ${r.prevRank}위 → 랭킹 이탈`;
  if (r.move === null) return "신규 등재";
  if (r.move > 0) return `${r.prevRank}위 → ${r.rank}위, ▲${r.move}`;
  if (r.move < 0) return `${r.prevRank}위 → ${r.rank}위, ▼${-r.move}`;
  return "변동 없음";
}

const editionKo = (edition: string | null, date: string | null) =>
  edition ? `${edition} 회차(${editionDateKo(date)})` : "";

/* ── 국가 페이지 ── */

function countrySectionHtml(r: UmbCountryReport, s: UmbCountrySection): string {
  const cat = s.category;
  const name = fedNameKo(r.fed);
  const hasPrev = !!s.prevEdition;
  const facts = [
    s.nationRank ? `국가 순위 ${s.nationRank}위 / ${s.nationCount}개국(상위 5명 합산 ${num(s.top5Points ?? 0)}점)` : "",
    `톱 100 ${s.top100}명 · 톱 300 ${s.top300}명`,
    `${editionKo(s.edition, s.date)} 기준${hasPrev ? `, 직전 ${editionKo(s.prevEdition, s.prevDate)} 대비 변동` : ""}`,
  ].filter(Boolean).join(" · ");
  const li = (x: UmbMoveRow) => {
    const mv = moveKo(x, hasPrev);
    return `<li>세계 ${x.rank}위 ${playerLink(cat, x)} — ${x.points}점${mv ? ` · ${esc(mv)}` : ""}</li>`;
  };
  const risers = s.risers.length
    ? `\n  <h3>순위가 오른 선수 (현재 ${MOVER_RANK_CUTOFF}위 안)</h3>\n  <ul>\n  ${s.risers.map(li).join("\n  ")}\n  </ul>` : "";
  const fallers = s.fallers.length
    ? `\n  <h3>순위가 내린 선수 (직전 ${MOVER_RANK_CUTOFF}위 안)</h3>\n  <ul>\n  ${s.fallers.map(li).join("\n  ")}\n  </ul>` : "";
  return `
  <h2>${esc(CAT_KO[cat])} 세계랭킹 — ${esc(name)} 선수 ${num(s.total)}명</h2>
  <p>${esc(facts)}</p>${risers}${fallers}
  <h3>${esc(name)} ${esc(CAT_KO[cat])} 선수 전체 순위</h3>
  <ul>
  ${s.rows.map(li).join("\n  ")}
  </ul>`;
}

function renderCountry(r: UmbCountryReport): RankingExtraRender {
  const indexable = countryIndexable(r);
  const name = fedNameKo(r.fed);
  const canonical = `${ORIGIN}${countryPath(r.fed)}`;
  const men = sectionOf(r.sections, "players");
  const lead = r.sections[0];
  const best = men?.rows[0] ?? lead.rows[0];
  const bestCat: UmbCat = men ? "players" : lead.category;
  const counts = r.sections.map((s) => `${CAT_KO[s.category]} ${num(s.total)}명${s.category === "players" ? `(전체 ${num(s.worldTotal)}명 중)` : ""}`).join(" · ");
  // 다른 나라 — 색인 대상(남자 10명 이상)만 잇는다. 국가표 순서 그대로.
  const others = r.nations.filter((n) => n.fed !== r.fed && n.players >= COUNTRY_INDEX_MIN);
  const top10 = (men ?? lead).rows.slice(0, 10);
  const body = `<main>
  <h1>${esc(countryH1(r.fed))}</h1>
  <p>${esc(countryDescription(r))}</p>

  <h2>한눈에 보기</h2>
  <ul>
  ${men?.nationRank ? `<li>국가 순위(남자): ${men.nationRank}위 / ${men.nationCount}개국 — 상위 5명 합산 포인트 ${num(men.top5Points ?? 0)}점</li>` : ""}
  <li>등재 선수: ${esc(counts)}</li>
  ${men ? `<li>남자 톱 100: ${men.top100}명 · 톱 300: ${men.top300}명</li>` : ""}
  ${best ? `<li>최고 순위: ${playerLink(bestCat, best)} — ${esc(CAT_KO[bestCat])} 세계 ${best.rank}위 · ${best.points}점</li>` : ""}
  </ul>
  ${r.sections.map((s) => countrySectionHtml(r, s)).join("\n")}
  ${others.length ? `
  <h2>다른 나라 당구 선수 세계랭킹</h2>
  <ul>
  ${others.map((n) => `<li><a href="${esc(countryPath(n.fed))}">${esc(fedNameKo(n.fed))}</a> — 국가 순위 ${n.pos}위 · 남자 ${num(n.players)}명</li>`).join("\n  ")}
  </ul>` : ""}
  <p>출처: UMB 공식 랭킹 — <a href="https://www.umb-carom.org" rel="noopener">umb-carom.org</a></p>
  <nav><a href="/world-ranking">당구 세계랭킹 전체</a> <a href="${MOVERS_PATH}">이번 회차 순위 변동</a></nav>
  ${hubNav("ko")}
</main>`;
  return {
    status: 200,
    tag: `umb-country:${r.fed}${indexable ? "" : ":noindex"}`,
    html: page({
      lang: "ko",
      title: countryTitle(r.fed),
      desc: countryDescription(r),
      canonical,
      noindex: !indexable,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "당구 세계랭킹", item: `${ORIGIN}/world-ranking` },
            { "@type": "ListItem", position: 2, name: `${name} 선수`, item: canonical },
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${name} ${CAT_KO[(men ?? lead).category]} 당구 선수 세계랭킹`,
          itemListElement: top10.map((x, i) => ({
            "@type": "ListItem", position: i + 1, name: x.nativeName || x.playerName,
            url: `${ORIGIN}${playerHref((men ?? lead).category, x.playerUmbId)}`,
          })),
        },
      ],
      body,
    }),
  };
}

/* ── 순위 변동 페이지 ── */

function moversSectionHtml(s: UmbMoversSection, linkable: Set<string>): string {
  const cat = s.category;
  const fedLink = (fed: string) => linkable.has(fed)
    ? `<a href="${esc(countryPath(fed))}">${esc(fedNameKo(fed))}</a>`
    : esc(fedNameKo(fed));
  const li = (x: UmbMoveRow) =>
    `<li>${playerLink(cat, x)} (${fedLink(x.fed)}) — ${esc(moveKo(x, true))}${x.points !== null ? ` · ${x.points}점` : ""}</li>`;
  const list = (title: string, rows: UmbMoveRow[]) => rows.length
    ? `\n  <h3>${esc(title)}</h3>\n  <ul>\n  ${rows.map(li).join("\n  ")}\n  </ul>` : "";
  const kr = s.kr;
  return `
  <h2>${esc(CAT_KO[cat])} — ${esc(editionDateKo(s.date))} 회차 vs ${esc(editionDateKo(s.prevDate))} 회차</h2>
  <p>${esc(`${editionKo(s.edition, s.date)}와 직전 ${editionKo(s.prevEdition, s.prevDate)} 비교. 등재 ${num(s.total)}명 · 순위 변동 ${num(s.changed)}명(상승 ${num(s.up)} · 하락 ${num(s.down)} · 그대로 ${num(s.same)}) · 신규 등재 ${num(s.newCount)}명 · 랭킹 이탈 ${num(s.outCount)}명.`)}</p>${
    list(`가장 많이 오른 선수 (현재 ${MOVER_RANK_CUTOFF}위 안)`, s.risers)}${
    list(`가장 많이 내린 선수 (직전 ${MOVER_RANK_CUTOFF}위 안)`, s.fallers)}${
    // 신규·이탈 목록은 저장소가 30명까지만 준다 — 잘렸으면 제목에 전체 인원과 기준을 적는다
    list(`새로 등재된 선수${s.newCount > s.entries.length ? ` (${num(s.newCount)}명 중 순위 높은 ${s.entries.length}명)` : ""}`, s.entries)}${
    list(`랭킹에서 빠진 선수${s.outCount > s.dropouts.length ? ` (${num(s.outCount)}명 중 직전 순위 높은 ${s.dropouts.length}명)` : ""}`, s.dropouts)}
  <h3>한국 선수 순위 변동</h3>
  <p>${esc(`한국 선수 ${num(kr.total)}명 — 상승 ${num(kr.up)} · 하락 ${num(kr.down)} · 그대로 ${num(kr.same)}${kr.newCount ? ` · 신규 ${num(kr.newCount)}` : ""}${kr.outCount ? ` · 이탈 ${num(kr.outCount)}` : ""}. 아래는 현재 또는 직전 ${MOVER_RANK_CUTOFF}위 안 선수.`)}</p>${
    kr.rows.length ? `\n  <ul>\n  ${kr.rows.map((x) => `<li>${playerLink(cat, x)} — ${esc(x.rank !== null ? `세계 ${x.rank}위 · ` : "")}${esc(moveKo(x, true))}</li>`).join("\n  ")}\n  </ul>` : ""}`;
}

async function renderMovers(): Promise<RankingExtraRender> {
  const r: UmbMoversReport = await storage.umb.getMoversReport();
  if (!r.sections.length) return gone("순위 변동 정보가 없습니다.", "비교할 두 회차가 아직 없습니다.");
  const indexable = moversIndexable(r);
  const canonical = `${ORIGIN}${MOVERS_PATH}`;
  // 나라 이름에 거는 링크는 색인 대상 나라만 — 국가표(남자)의 등재 인원으로 판정(국가 페이지·사이트맵과 같은 기준)
  const { nations } = await storage.umb.getNations("players");
  const linkable = new Set<string>(nations.filter((n: any) => n.players >= COUNTRY_INDEX_MIN).map((n: any) => n.fed));
  const men = sectionOf(r.sections, "players");
  const body = `<main>
  <h1>${esc(MOVERS_H1)}</h1>
  <p>${esc(moversDescription(r))}</p>
  ${r.sections.map((s) => moversSectionHtml(s, linkable)).join("\n")}
  <p>출처: UMB 공식 랭킹 — <a href="https://www.umb-carom.org" rel="noopener">umb-carom.org</a></p>
  <nav><a href="/world-ranking">당구 세계랭킹 전체</a> <a href="${esc(countryPath("KR"))}">대한민국 선수 세계랭킹</a></nav>
  ${hubNav("ko")}
</main>`;
  return {
    status: 200,
    tag: indexable ? "umb-movers" : "umb-movers:noindex",
    html: page({
      lang: "ko",
      title: MOVERS_TITLE,
      desc: moversDescription(r),
      canonical,
      noindex: !indexable,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "당구 세계랭킹", item: `${ORIGIN}/world-ranking` },
            { "@type": "ListItem", position: 2, name: "순위 변동", item: canonical },
          ],
        },
        ...(men && men.risers.length ? [{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `UMB 3쿠션 남자 세계랭킹 — 가장 많이 오른 선수 (${editionDateKo(men.date)} 회차)`,
          itemListElement: men.risers.slice(0, 10).map((x, i) => ({
            "@type": "ListItem", position: i + 1, name: x.nativeName || x.playerName,
            url: `${ORIGIN}${playerHref("players", x.playerUmbId)}`,
          })),
        }] : []),
      ],
      body,
    }),
  };
}

/**
 * 경로 하나를 렌더한다. pathname 은 req.path(인코딩된 그대로). 내 경로가 아니면 null.
 * query 는 계약상 받지만 쓰지 않는다(언어판 없음).
 */
export async function renderRankingExtra(pathname: string, query: Record<string, string>): Promise<RankingExtraRender | null> {
  void query;
  const path = pathname.replace(/\/+$/, "");
  if (path === MOVERS_PATH) return renderMovers();
  const m = COUNTRY_RE.exec(path);
  if (!m) return null;
  const seg = m[1];
  if (!/^[A-Za-z]{2}$/.test(seg)) return gone("국가를 찾을 수 없습니다.", "요청한 국가의 세계랭킹 정보가 없습니다.");
  const fed = seg.toUpperCase();
  // 소문자 주소(/country/kr)는 대문자 정본으로 — 같은 페이지가 두 주소로 색인되지 않게
  if (seg !== fed) return { status: 301, tag: "umb-country:301", html: "", location: countryPath(fed) };
  const report = await storage.umb.getCountryReport(fed);
  if (!report) return gone("국가를 찾을 수 없습니다.", "이 국가의 선수가 최신 UMB 세계랭킹에 없습니다.");
  return renderCountry(report);
}

/**
 * 사이트맵 "rankings" 섹션 — 색인 기준을 넘는 나라(남자 등재 COUNTRY_INDEX_MIN 명 이상) + 순위 변동 한 장(변동 20명 이상일 때).
 * 판정은 프리렌더의 countryIndexable·moversIndexable 과 같은 숫자다(국가표의 players = 국가 보고서의 남자 등재 인원).
 */
export async function rankingExtraSitemapParts(): Promise<string[]> {
  const parts: string[] = [];
  try {
    const mv = await storage.umb.getMoversReport();
    if (moversIndexable(mv)) {
      parts.push(entry(`${ORIGIN}${MOVERS_PATH}`, { changefreq: "weekly", priority: "0.6", lastmod: sectionOf(mv.sections, "players")?.date ?? null }));
    }
  } catch (e) {
    console.warn("[sitemap] umb movers failed:", (e as Error)?.message);
  }
  try {
    const [latest] = await storage.umb.getLatestEditions("players", 1);
    const { nations } = await storage.umb.getNations("players");
    for (const n of nations as Array<{ fed: string; players: number }>) {
      if (n.players < COUNTRY_INDEX_MIN) continue;
      parts.push(entry(`${ORIGIN}${countryPath(n.fed)}`, {
        changefreq: "weekly", priority: n.players >= 100 ? "0.6" : "0.5", lastmod: latest?.editionDate ?? null,
      }));
    }
  } catch (e) {
    console.warn("[sitemap] umb countries failed:", (e as Error)?.message);
  }
  return parts;
}
