import { page, esc, hubNav } from "../prerender.js";
import { entry } from "../sitemap.js";
import { storage } from "../storage/index.js";
import { PBA_INCOME_NOTE_KO } from "../../shared/pbaMeta.js";
import {
    LEAGUE_KO, PBA_RECORDS_H1, PBA_RECORDS_PATH, PBA_RECORDS_RULE_KO, PBA_RECORDS_TITLE, PBA_RECORDS_TOP, PBA_RECORD_DEFS,
    cutKo, eligibleKo, leagueFactsKo, pbaRecordsDescription, pbaRecordsEmpty, pbaRecordsIndexable, pbaRecordsLdNodes, pbaRecordsUpdated,
    recordLineKo, recordValue, type PbaRecordSection, type PbaRecordsLeague, type PbaRecordsReport,
} from "../../shared/pbaRecordsMeta.js";

// PBA·LPBA 통산 기록 순위 프리렌더(2026-09-24) — /pba/records 한 장.
// 제목·설명·순위·표기는 shared/pbaRecordsMeta.ts — 화면(useSeo)·API(GET /pba/records)와 같은 함수·같은 저장소 값이다.
// 화면은 리그·기록을 단추로 고르지만 봇 문서에는 두 리그 × 다섯 기록을 모두 펼친다(같은 데이터, 조작 요소만 없음).
// 언어판은 없다(한국어 전용) — ?lang= 은 무시하고 canonical 은 늘 한국어 주소다.
// 선수가 한 명도 없으면 404, 두 리그 중 하나라도 30경기 이상 선수가 톱 20 을 못 채우면 noindex·사이트맵 제외.
// DB 예외는 그대로 던진다 — 부른 쪽이 503 으로 바꾼다(404 로 내면 일시 장애 동안 색인에서 빠진다).
// prerender.ts 와 서로 import 하는 모양이지만 page·esc·hubNav 는 함수 안에서만 부르므로 초기화 순서와 상관없다.

const ORIGIN = "https://www.rankue.co.kr";

export interface PbaRecordsRender { status: 200 | 301 | 404; tag: string; html: string; location?: string }

const playerHref = (memCode: string) => `/pba-player/${encodeURIComponent(memCode)}`;

function sectionHtml(l: PbaRecordsLeague, s: PbaRecordSection): string {
    const def = PBA_RECORD_DEFS[s.key];
    if (!s.rows.length) {
        return `
  <h3>${esc(l.league)} ${esc(def.label)} 순위</h3>
  <p>${esc(def.desc)}</p>
  <p>아직 순위에 들 선수가 없습니다.</p>`;
    }
    const li = s.rows.map((r) =>
        `<li>${r.rank}위 <a href="${esc(playerHref(r.memCode))}">${esc(r.nameKo)}</a>${r.nameEn ? ` (${esc(r.nameEn)})` : ""} — ${esc(def.label)} ${esc(recordValue(s.key, r.value))} · ${esc(recordLineKo(r))}</li>`);
    return `
  <h3>${esc(l.league)} ${esc(def.label)} 순위 톱 ${PBA_RECORDS_TOP}</h3>
  <p>${esc(def.desc)} ${esc(eligibleKo(s.key, s.eligible))} 상위 ${s.rows.length}명.</p>
  <ul>
  ${li.join("\n  ")}
  </ul>${s.cut ? `
  <p>${esc(cutKo(s.cut))}</p>` : ""}`;
}

function leagueHtml(l: PbaRecordsLeague): string {
    return `
  <h2>${esc(LEAGUE_KO[l.league])} 통산 기록</h2>
  <p>${esc(leagueFactsKo(l))}</p>
  ${l.sections.map((s) => sectionHtml(l, s)).join("\n")}`;
}

function gone(): PbaRecordsRender {
    return {
        status: 404,
        tag: "pba-records:404",
        html: page({
            lang: "ko",
            title: "통산 기록이 없습니다 · 랭큐",
            desc: "PBA·LPBA 선수 통산 기록을 아직 불러오지 못했습니다.",
            canonical: `${ORIGIN}${PBA_RECORDS_PATH}`,
            noindex: true,
            body: `<main>
  <h1>통산 기록이 없습니다</h1>
  <p>PBA·LPBA 선수 통산 기록을 아직 불러오지 못했습니다.</p>
  <nav><a href="/pba">PBA 투어 랭킹</a></nav>
  ${hubNav("ko")}
</main>`,
        }),
    };
}

function renderReport(r: PbaRecordsReport): PbaRecordsRender {
    const indexable = pbaRecordsIndexable(r);
    const canonical = `${ORIGIN}${PBA_RECORDS_PATH}`;
    const leagues = r.leagues.filter((l) => l.players > 0);
    const body = `<main>
  <nav aria-label="경로"><a href="/pba">PBA 투어 랭킹</a> › 통산 기록 순위</nav>
  <h1>${esc(PBA_RECORDS_H1)}</h1>
  <p>${esc(pbaRecordsDescription(r))}</p>
  <p>${esc(PBA_RECORDS_RULE_KO)}</p>
  ${leagues.map(leagueHtml).join("\n")}
  <p>${esc(PBA_INCOME_NOTE_KO)}</p>
  <p>출처: PBA 투어 공식 기록 — <a href="https://www.pbatour.org" rel="noopener">pbatour.org</a></p>
  <nav><a href="/pba">PBA 투어 시즌 랭킹</a></nav>
  ${hubNav("ko")}
</main>`;
    return {
        status: 200,
        tag: indexable ? "pba-records" : "pba-records:noindex",
        html: page({
            lang: "ko",
            title: PBA_RECORDS_TITLE,
            desc: pbaRecordsDescription(r),
            canonical,
            noindex: !indexable,
            jsonLd: pbaRecordsLdNodes(r).map((n) => ({ "@context": "https://schema.org", ...n })),
            body,
        }),
    };
}

/**
 * 경로 하나를 렌더한다. pathname 은 req.path. 내 경로가 아니면 null.
 * query 는 계약상 받지만 쓰지 않는다(언어판 없음).
 */
export async function renderPbaRecords(pathname: string, query: Record<string, string>): Promise<PbaRecordsRender | null> {
    void query;
    const path = pathname.replace(/\/+$/, "");
    if (path !== PBA_RECORDS_PATH) return null;
    const report = await storage.pba.getRecords();
    if (pbaRecordsEmpty(report)) return gone();
    return renderReport(report);
}

/** 사이트맵 "pba-records" 섹션 — 이 페이지 한 줄. 색인 기준(pbaRecordsIndexable)을 못 넘으면 비운다. */
export async function pbaRecordsSitemapParts(): Promise<string[]> {
    try {
        const r = await storage.pba.getRecords();
        if (pbaRecordsEmpty(r) || !pbaRecordsIndexable(r)) return [];
        return [entry(`${ORIGIN}${PBA_RECORDS_PATH}`, { changefreq: "weekly", priority: "0.6", lastmod: pbaRecordsUpdated(r) })];
    } catch (e) {
        console.warn("[sitemap] pba records failed:", (e as Error)?.message);
        return [];
    }
}
