import { db } from "../db.js";
import { pbaTournaments, pbaPlayers } from "../../shared/schema.js";
import { asc, eq, sql } from "drizzle-orm";
import { parseEventLabel } from "../../shared/umbEventLabel.js";
import { todayKst } from "../../shared/briefingMeta.js";
import {
    hasTourPage, isJuniorEvent, pbaEventKey, pbaOfficialUrl, pbaTourPath, tourStatus, umbEventSlug, UMB_OFFICIAL_CALENDAR,
    type PbaSeasonPage, type PbaTourLeague, type PbaTourPage, type PbaTourRow, type PbaWinnerProfile, type TournamentHub,
    type UmbEventDetail, type UmbEventRow, type UmbEventSummary, type UpcomingEvent,
} from "../../shared/tournamentMeta.js";
import type { UmbCat } from "../../shared/umbCountryMeta.js";
import { getUpcomingUmbEvents } from "../services/umbCalendar.js";

// 대회 허브·시즌·대회 페이지 읽기 저장소(2026-09-24). 화면 API(routes/modules/tournaments.ts)와 프리렌더(seo/tournaments.ts)가
// 같은 함수를 불러 같은 숫자를 보여 준다. 공개 읽기 전용이라 뷰어 개인화가 없다.
//
// PBA 대회 행은 300개 남짓이라 통째로 읽어 메모리에서 나눈다(시즌·같은 대회 묶기·앞뒤 대회). 하루 한 번 바뀌므로 5분 캐시.
// UMB 대회 목록은 회차 레전드(umb_events) 전체를 훑는 집계라(≈0.3초) 10분 캐시 — 무인증 공개 경로가 Neon 을 직격하지 않게.

const PBA_TTL_MS = 5 * 60 * 1000;
const UMB_TTL_MS = 10 * 60 * 1000;
/** 허브의 '다가오는 대회'는 1년 앞까지만 — UMB 달력은 2030 년까지 적혀 있다 */
const UPCOMING_DAYS = 365;

let pbaCache: { at: number; rows: PbaTourRow[] } | null = null;

/** UMB 대회 한 개 + 부문별로 포인트를 읽을 곳(가장 최근 회차의 열) */
interface UmbIndexEntry extends UmbEventSummary {
    parts: Array<{ category: UmbCat; edition: string; editionDate: string; colKey: string; label: string; players: number }>;
}
let umbCache: { at: number; entries: UmbIndexEntry[] } | null = null;

const CAT_ORDER: Record<string, number> = { players: 0, ladies: 1, juniors: 2 };
const addDays = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** 같은 UMB 대회의 다른 해를 묶는 열쇠 — 월드컵은 도시, 세계선수권은 부문(남자·주니어) */
const umbSeriesKey = (e: UmbEventSummary) => e.kind === "worldcup" ? `wc:${e.city.toLowerCase()}` : `wch:${isJuniorEvent(e) ? "juniors" : "players"}`;

export class TournamentsRepository {
    /** PBA 대회 전부(날짜순) */
    async allPbaRows(): Promise<PbaTourRow[]> {
        if (pbaCache && Date.now() - pbaCache.at < PBA_TTL_MS) return pbaCache.rows;
        const rows = await db.select().from(pbaTournaments).orderBy(asc(pbaTournaments.startDate), asc(pbaTournaments.id));
        const out: PbaTourRow[] = rows.map((r) => ({
            tourCode: r.tourCode, season: r.season, league: r.league as PbaTourLeague, title: r.title, titleEn: r.titleEn,
            startDate: r.startDate, endDate: r.endDate, place: r.place, totalPrize: r.totalPrize, winnerPrize: r.winnerPrize,
            winnerName: r.winnerName, winnerMemCode: r.winnerMemCode, participants: r.participants, officialSeq: r.officialSeq,
        }));
        pbaCache = { at: Date.now(), rows: out };
        return out;
    }

    /** 허브 — 다가오는 대회(PBA 일정 + UMB 공식 달력) · PBA 시즌별 · UMB 해별 */
    async getHub(): Promise<TournamentHub> {
        const today = todayKst();
        const horizon = addDays(today, UPCOMING_DAYS);
        const [rows, umbIndex, umbCal] = await Promise.all([this.allPbaRows(), this.umbIndex(), getUpcomingUmbEvents(today)]);

        const pbaUpcoming: UpcomingEvent[] = rows
            .filter((r) => r.endDate >= today && r.startDate <= horizon)
            .map((r) => ({
                source: "PBA", league: r.league, kind: null, title: r.title, titleEn: r.titleEn,
                startDate: r.startDate, endDate: r.endDate, place: r.place, countryCode: null, country: null, org: null,
                // 공식 이름에 "(연기)" 가 붙은 대회만 연기로 본다
                postponed: /\(연기\)/.test(r.title),
                href: hasTourPage(r) ? pbaTourPath(r.season, r.tourCode) : null,
                officialUrl: pbaOfficialUrl(r.officialSeq),
            }));
        const umbUpcoming: UpcomingEvent[] = umbCal.items
            .filter((x) => x.startDate <= horizon)
            .map((x) => ({
                source: "UMB", league: null, kind: x.type, title: x.name, titleEn: x.name,
                startDate: x.startDate, endDate: x.endDate, place: x.city, countryCode: x.countryCode, country: x.country,
                org: x.organization, postponed: x.postponed, href: null, officialUrl: UMB_OFFICIAL_CALENDAR,
            }));
        const upcoming = [...pbaUpcoming, ...umbUpcoming]
            .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.source.localeCompare(b.source) || a.title.localeCompare(b.title));

        const bySeason = new Map<number, PbaTourRow[]>();
        for (const r of rows) bySeason.set(r.season, [...(bySeason.get(r.season) ?? []), r]);
        const pbaSeasons = [...bySeason.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([season, list]) => {
                // 대회 수는 공식 일정 줄 전부(팀리그 라운드·코드 없는 예정 대회 포함) — 시즌 페이지 타일과 같은 셈
                const tours = list.filter(hasTourPage);
                return {
                    season,
                    tours: list.length,
                    finished: list.filter((t) => tourStatus(t, today) === "finished").length,
                    // 허브에는 1부(PBA·LPBA) 우승자만 — 드림·챌린지는 시즌 페이지에서
                    winners: tours.filter((t) => (t.league === "PBA" || t.league === "LPBA") && t.winnerName)
                        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
                };
            });

        const byYear = new Map<string, UmbEventSummary[]>();
        for (const e of umbIndex) {
            const y = e.date.slice(0, 4);
            byYear.set(y, [...(byYear.get(y) ?? []), summaryOf(e)]);
        }
        const umbYears = [...byYear.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([year, events]) => ({ year, events: events.sort((a, b) => b.date.localeCompare(a.date)) }));

        return { today, upcoming, umbCalendarOk: umbCal.ok, pbaSeasons, umbYears };
    }

    /** 시즌 페이지 — 그 시즌 행이 하나도 없으면 null(404) */
    async getPbaSeasonPage(season: number): Promise<PbaSeasonPage | null> {
        const rows = await this.allPbaRows();
        const tours = rows.filter((r) => r.season === season);
        if (!tours.length) return null;
        const seasons = [...new Set(rows.map((r) => r.season))].sort((a, b) => b - a);
        return { season, seasons, tours, today: todayKst() };
    }

    /** 대회 페이지 — 코드가 있는 개인 투어만. 없으면 null(404) */
    async getPbaTourPage(tourCode: number): Promise<PbaTourPage | null> {
        const rows = await this.allPbaRows();
        const tour = rows.find((r) => r.tourCode === tourCode && hasTourPage(r));
        if (!tour) return null;

        let winner: PbaWinnerProfile | null = null;
        if (tour.winnerMemCode) {
            const [p] = await db.select().from(pbaPlayers).where(eq(pbaPlayers.memCode, tour.winnerMemCode)).limit(1);
            if (p) {
                winner = {
                    memCode: p.memCode, league: p.league, nameKo: p.nameKo, nameEn: p.nameEn, nationCode: p.nationCode,
                    average: p.average, highRun: p.highRun, bankShotRate: p.bankShotRate,
                    win: p.win, lose: p.lose, draw: p.draw, careerPrize: p.careerPrize,
                };
            }
        }

        // 같은 대회 역대 기록 — 열쇠 규칙은 shared/tournamentMeta.ts 의 pbaEventKey(확신 없으면 묶지 않음)
        const key = pbaEventKey(tour.title, tour.league);
        const same = key
            ? rows.filter((r) => r.league === tour.league && hasTourPage(r) && pbaEventKey(r.title, r.league) === key)
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
            : [];
        const history = same.length >= 2 ? same : [];

        const seasonList = rows.filter((r) => r.season === tour.season && r.league === tour.league && hasTourPage(r));
        const i = seasonList.findIndex((r) => r.tourCode === tour.tourCode);
        return {
            tour, today: todayKst(), winner, history,
            prev: i > 0 ? seasonList[i - 1] : null,
            next: i >= 0 && i < seasonList.length - 1 ? seasonList[i + 1] : null,
        };
    }

    /**
     * UMB 대회 목록 — 회차 레전드의 라벨마다 "그 라벨이 남아 있는 가장 최근 회차"의 열에서 포인트를 받은 선수 수를 센다.
     * 같은 대회(슬러그)가 부문마다(남자·주니어) 따로 있으면 부문별 칸으로 모은다. 포인트 받은 선수가 없는 칸은 버린다.
     */
    private async umbIndex(): Promise<UmbIndexEntry[]> {
        if (umbCache && Date.now() - umbCache.at < UMB_TTL_MS) return umbCache.entries;
        const result: any = await db.execute(sql`
            with latest as (
                select distinct on (category, label) category, label, edition, edition_date, col_key
                from umb_events
                order by category, label, edition_date desc
            )
            select l.category, l.label, l.edition, to_char(l.edition_date, 'YYYY-MM-DD') as edition_date, l.col_key,
                count(r.id) filter (where (r.event_points->>l.col_key)::numeric > 0)::int as players
            from latest l
            left join umb_rankings r on r.category = l.category and r.edition = l.edition
            group by l.category, l.label, l.edition, l.edition_date, l.col_key
        `);
        const raw = (result.rows ?? result) as Array<{ category: UmbCat; label: string; edition: string; edition_date: string; col_key: string; players: number }>;

        const bySlug = new Map<string, UmbIndexEntry>();
        for (const r of raw) {
            if (!(r.players > 0)) continue;
            const slug = umbEventSlug(r.label);
            if (!slug) continue;
            const p = parseEventLabel(r.label);
            const e = bySlug.get(slug) ?? {
                slug, kind: p.kind as "worldcup" | "worldchamp", org: p.org, city: p.city!, country: p.country!, date: p.date!,
                categories: [], players: 0, parts: [],
            };
            const part = { category: r.category, edition: r.edition, editionDate: r.edition_date, colKey: r.col_key, label: r.label, players: Number(r.players) };
            const at = e.parts.findIndex((x) => x.category === r.category);
            // 같은 부문에 라벨 표기가 다른 칸이 둘이면 더 최근 회차 쪽
            if (at < 0) e.parts.push(part);
            else if (part.editionDate > e.parts[at].editionDate) e.parts[at] = part;
            bySlug.set(slug, e);
        }
        const entries = [...bySlug.values()].map((e) => {
            const parts = [...e.parts].sort((a, b) => (CAT_ORDER[a.category] ?? 9) - (CAT_ORDER[b.category] ?? 9));
            return { ...e, parts, categories: parts.map((x) => x.category), players: Math.max(...parts.map((x) => x.players)) };
        }).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
        umbCache = { at: Date.now(), entries };
        return entries;
    }

    /** 사이트맵·허브용 요약 목록(최신 먼저) */
    async getUmbEvents(): Promise<UmbEventSummary[]> {
        return (await this.umbIndex()).map(summaryOf);
    }

    /** 사이트맵 lastmod — 대회마다 포인트를 읽은 회차 중 가장 최근 날짜(표가 마지막으로 바뀔 수 있었던 날) */
    async getUmbEventDates(): Promise<Map<string, string>> {
        return new Map((await this.umbIndex()).map((e) => [e.slug, e.parts.map((p) => p.editionDate).sort()[e.parts.length - 1]]));
    }

    /** UMB 대회 한 개 — 부문별 포인트 표. 모르는 슬러그면 null(404) */
    async getUmbEventDetail(slug: string): Promise<UmbEventDetail | null> {
        const index = await this.umbIndex();
        const e = index.find((x) => x.slug === slug);
        if (!e) return null;
        const sections = await Promise.all(e.parts.map(async (part) => {
            const result: any = await db.execute(sql`
                select r.player_umb_id, r.player_name, r.fed, (r.event_points->>${part.colKey})::numeric as event_pts, n.native_name
                from umb_rankings r
                left join umb_player_names n on n.player_umb_id = r.player_umb_id
                where r.category = ${part.category} and r.edition = ${part.edition}
                  and (r.event_points->>${part.colKey})::numeric > 0
                order by event_pts desc, r.player_name asc
            `);
            const rows: UmbEventRow[] = ((result.rows ?? result) as any[]).map((x) => ({
                playerUmbId: String(x.player_umb_id), playerName: String(x.player_name), nativeName: x.native_name ?? null,
                fed: String(x.fed), points: Number(x.event_pts),
            }));
            return { category: part.category, edition: part.edition, editionDate: part.editionDate, label: part.label, rows };
        }));
        const filled = sections.filter((s) => s.rows.length);
        if (!filled.length) return null; // 목록(캐시)과 표 사이에 회차가 바뀐 드문 경우 — 빈 페이지 대신 404
        const summary = summaryOf(e);
        const key = umbSeriesKey(summary);
        const others = index.filter((x) => x.slug !== e.slug && umbSeriesKey(x) === key).map(summaryOf);
        return { ...summary, sections: filled, others };
    }
}

function summaryOf(e: UmbIndexEntry): UmbEventSummary {
    const { parts: _parts, ...s } = e;
    return s;
}

export const tournamentsRepo = new TournamentsRepository();
