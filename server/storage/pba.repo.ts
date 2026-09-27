import { db } from "../db.js";
import { pbaPlayers, pbaSeasonRanks, hiqPlayerFollows, umbRankings } from "../../shared/schema.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { PBA_RECORDS_MIN_GAMES, buildPbaRecords, pbaLeagueBench, pbaPlayerRecordRanks, type PbaCareerInput, type PbaLeague, type PbaRecordsReport } from "../../shared/pbaRecordsMeta.js";
import type { PbaPlayerExtra, PbaPlayerProfile } from "../../shared/pbaPlayerProfile.js";
import type { ComparePro } from "../../shared/proCompare.js";
import { hasTourPage, pbaTourPath, tourNameWithSeason } from "../../shared/tournamentMeta.js";
import { tournamentsRepo } from "./tournaments.repo.js";

// PBA 투어 읽기 저장소 — 공개 읽기 전용. 시즌 목록은 자주 안 바뀌므로 프로세스 캐시.

let seasonsCache: { at: number; data: { league: string; seasons: number[] }[] } | null = null;
const SEASONS_TTL = 5 * 60 * 1000;

// 통산 기록 순위 — 상세 갱신이 하루 한 번(크론)이라 10분 캐시면 충분하다. API·프리렌더·사이트맵이 같은 값을 본다.
let recordsCache: { at: number; data: PbaRecordsReport } | null = null;
const RECORDS_TTL = 10 * 60 * 1000;
/** 통산 기록 전 선수 줄 — 기록 순위표와 선수 페이지의 '기록 순위·리그 평균'이 같은 값을 본다 */
let careerCache: { at: number; rows: PbaCareerInput[]; updated: Partial<Record<PbaLeague, string | null>> } | null = null;

export class PbaRepository {
    async getSeasons() {
        if (seasonsCache && Date.now() - seasonsCache.at < SEASONS_TTL) return seasonsCache.data;
        const rows = await db.select({
            league: pbaSeasonRanks.league,
            season: pbaSeasonRanks.season,
        }).from(pbaSeasonRanks).groupBy(pbaSeasonRanks.league, pbaSeasonRanks.season)
            .orderBy(desc(pbaSeasonRanks.season));
        const byLeague = new Map<string, number[]>();
        for (const r of rows) {
            const arr = byLeague.get(r.league) ?? [];
            arr.push(r.season);
            byLeague.set(r.league, arr);
        }
        const data = [...byLeague.entries()].map(([league, seasons]) => ({ league, seasons }));
        seasonsCache = { at: Date.now(), data };
        return data;
    }

    // 공개 표면의 기본 시즌 — 달력(currentPbaSeason)이 아니라 "DB에 행이 실존하는 최신 시즌".
    // 매년 6/1 시즌 롤오버 후 첫 랭킹 발행까지 수 주간 DB에 신시즌 행이 없는데,
    // 달력 기준을 쓰면 그 기간 /pba 프리렌더 503·기본 화면 공백이 된다 (2026-08 리뷰 확정).
    async getDisplaySeason(league: "PBA" | "LPBA", fallback: number): Promise<number> {
        const seasons = await this.getSeasons();
        const list = seasons.find((s) => s.league === league)?.seasons ?? [];
        return list.length ? list[0] : fallback; // getSeasons 는 내림차순 정렬
    }

    // 시즌 랭킹 — 상금순이 기본(PBA 공식 표기 관행), by=point면 포인트순
    async getRankings(league: "PBA" | "LPBA", season: number, by: "prize" | "point", limit: number) {
        const orderCol = by === "point" ? pbaSeasonRanks.pointRank : pbaSeasonRanks.prizeRank;
        return db.select({
            memCode: pbaSeasonRanks.memCode,
            prizeRank: pbaSeasonRanks.prizeRank,
            pointRank: pbaSeasonRanks.pointRank,
            prize: pbaSeasonRanks.prize,
            rankingPoint: pbaSeasonRanks.rankingPoint,
            nameKo: pbaPlayers.nameKo,
            nameEn: pbaPlayers.nameEn,
            nationCode: pbaPlayers.nationCode,
        }).from(pbaSeasonRanks)
            .innerJoin(pbaPlayers, eq(pbaPlayers.memCode, pbaSeasonRanks.memCode))
            .where(and(eq(pbaSeasonRanks.league, league), eq(pbaSeasonRanks.season, season), sql`${orderCol} IS NOT NULL`))
            .orderBy(orderCol)
            .limit(limit);
    }

    // 선수 프로필 + 시즌별 히스토리
    async getPlayer(memCode: string) {
        const [player] = await db.select().from(pbaPlayers).where(eq(pbaPlayers.memCode, memCode));
        if (!player) return null;
        const seasonRows = await db.select({
            season: pbaSeasonRanks.season,
            league: pbaSeasonRanks.league,
            prizeRank: pbaSeasonRanks.prizeRank,
            pointRank: pbaSeasonRanks.pointRank,
            prize: pbaSeasonRanks.prize,
            rankingPoint: pbaSeasonRanks.rankingPoint,
        }).from(pbaSeasonRanks).where(eq(pbaSeasonRanks.memCode, memCode))
            .orderBy(pbaSeasonRanks.season);
        // 공개 DTO — 내부 uuid는 싣지 않는다
        const { id, ...pub } = player;
        return { ...pub, seasons: seasonRows };
    }

    /** 이 선수를 팔로우한 랭큐 회원 수 */
    async followerCount(memCode: string): Promise<number> {
        const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(hiqPlayerFollows)
            .where(and(eq(hiqPlayerFollows.category, "pba"), eq(hiqPlayerFollows.playerUmbId, memCode)));
        return row?.n ?? 0;
    }

    async exists(memCode: string): Promise<boolean> {
        const [row] = await db.select({ id: pbaPlayers.id }).from(pbaPlayers).where(eq(pbaPlayers.memCode, memCode)).limit(1);
        return !!row;
    }

    // 사이트맵·프리렌더용 전체 목록
    async getPlayersForSitemap() {
        return db.select({ memCode: pbaPlayers.memCode, league: pbaPlayers.league, nameKo: pbaPlayers.nameKo })
            .from(pbaPlayers).orderBy(pbaPlayers.memCode);
    }

    /** "나와 비교하기"의 비슷한 프로 후보 — 통산 기록 순위와 같은 자격(통산 경기 수)·같은 표 */
    async comparePros(): Promise<ComparePro[]> {
        const { rows } = await this.careerRows();
        return rows
            .filter((r) => r.average != null && r.average > 0 && (r.win ?? 0) + (r.lose ?? 0) + (r.draw ?? 0) >= PBA_RECORDS_MIN_GAMES)
            .map((r) => ({ memCode: r.memCode, nameKo: r.nameKo, nameEn: r.nameEn, league: r.league, nationCode: r.nationCode, average: r.average! }));
    }

    // 통산 기록 순위(/pba/records) — 선수 480명 남짓이라 통째로 읽어 shared/pbaRecordsMeta 의 한 함수로 순위를 매긴다
    // (SQL 과 JS 두 곳에서 따로 정렬하면 공동 순위·동점 순서가 갈린다).
    /** 통산 기록 전 선수(480명 남짓) + 리그별 갱신일 — 10분 캐시 */
    private async careerRows() {
        if (careerCache && Date.now() - careerCache.at < RECORDS_TTL) return careerCache;
        const rows = await db.select({
            memCode: pbaPlayers.memCode,
            league: pbaPlayers.league,
            nameKo: pbaPlayers.nameKo,
            nameEn: pbaPlayers.nameEn,
            nationCode: pbaPlayers.nationCode,
            average: pbaPlayers.average,
            bankShotRate: pbaPlayers.bankShotRate,
            highRun: pbaPlayers.highRun,
            win: pbaPlayers.win,
            lose: pbaPlayers.lose,
            draw: pbaPlayers.draw,
            careerPrize: pbaPlayers.careerPrize,
        }).from(pbaPlayers);
        // 갱신일 — updated_at 은 시간대 없는 timestamp 에 UTC 벽시계로 저장된다(크론 21:30 UTC 가 21:30 으로 찍힘).
        // UTC 로 읽어 KST 날짜 문자열로 준다. Date 로 넘기면 받는 쪽 시간대에 따라 하루가 밀린다.
        // 주의: 상세 받기에 실패한 선수도 회전 슬롯을 비우려고 updated_at 을 전진시킨다(pbaSync.refreshDetails) —
        // 그래서 이 날짜는 '마지막으로 다시 받으러 간 날'이다. 수집이 살아 있는지는 pba-sync 크론 쪽에서 본다.
        const fresh = await db.select({
            league: pbaPlayers.league,
            day: sql<string | null>`to_char((max(${pbaPlayers.updatedAt}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`,
        }).from(pbaPlayers).groupBy(pbaPlayers.league);
        const updated: Partial<Record<PbaLeague, string | null>> = {};
        for (const f of fresh) updated[f.league] = f.day;
        careerCache = { at: Date.now(), rows: rows as PbaCareerInput[], updated };
        return careerCache;
    }

    // 통산 기록 순위(/pba/records) — 선수 480명 남짓이라 통째로 읽어 shared/pbaRecordsMeta 의 한 함수로 순위를 매긴다
    // (SQL 과 JS 두 곳에서 따로 정렬하면 공동 순위·동점 순서가 갈린다).
    async getRecords(): Promise<PbaRecordsReport> {
        if (recordsCache && Date.now() - recordsCache.at < RECORDS_TTL) return recordsCache.data;
        const { rows, updated } = await this.careerRows();
        const data = buildPbaRecords(rows, updated);
        recordsCache = { at: Date.now(), data };
        return data;
    }

    /**
     * 선수 페이지 전체(2026-09-27 개편) — 프로필·시즌 + extra(우승·기록 순위·리그 평균·비슷한 순위·팔로워·UMB 순위·갱신일).
     * 공개·캐시되는 응답이라 '내가 팔로우 중인가' 는 싣지 않는다(따로 GET …/follow). extra 조각은 하나가 실패해도 나머지로 나간다.
     */
    async getPlayerProfile(memCode: string): Promise<PbaPlayerProfile | null> {
        const base = await this.getPlayer(memCode);
        if (!base) return null;
        const safe = async <T,>(label: string, f: () => Promise<T>, fallback: T): Promise<T> => {
            try { return await f(); } catch (e) { console.warn(`[pba] profile ${label} 실패:`, (e as Error)?.message); return fallback; }
        };
        const career = await safe("career", () => this.careerRows(), null);
        const lastRanked = [...base.seasons].reverse().find((s) => s.prizeRank != null && (s.league === "PBA" || s.league === "LPBA"));
        const [wins, neighbors, followers, umbRank, updated] = await Promise.all([
            safe("wins", async () => (await tournamentsRepo.allPbaRows())
                .filter((r) => r.winnerMemCode === memCode && hasTourPage(r))
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map((r) => ({ season: r.season, title: tourNameWithSeason(r), startDate: r.startDate, winnerPrize: r.winnerPrize, path: pbaTourPath(r.season, r.tourCode!) })), []),
            safe("neighbors", async () => {
                if (!lastRanked) return null;
                const r0 = Number(lastRanked.prizeRank);
                const league = lastRanked.league as "PBA" | "LPBA";
                const rows = await this.getRankings(league, lastRanked.season, "prize", r0 + 5);
                const near = rows.filter((r) => r.memCode !== memCode && r.prizeRank != null && r.prizeRank >= r0 - 5 && r.prizeRank <= r0 + 5)
                    .map((r) => ({ memCode: r.memCode, nameKo: r.nameKo, nameEn: r.nameEn, nationCode: r.nationCode, prizeRank: r.prizeRank! }));
                return near.length ? { season: lastRanked.season, league, rows: near } : null;
            }, null),
            safe("followers", () => this.followerCount(memCode), 0),
            safe("umb", async () => {
                if (!base.umbPlayerId || !base.umbCategory) return null;
                const [row] = await db.select({ rank: umbRankings.rank, at: umbRankings.editionDate }).from(umbRankings)
                    .where(and(eq(umbRankings.category, base.umbCategory as "players" | "ladies" | "juniors"), eq(umbRankings.playerUmbId, base.umbPlayerId)))
                    .orderBy(desc(umbRankings.editionDate)).limit(1);
                // 두 달 넘게 안 올라온 순위는 '지금 순위'가 아니다
                return row && Date.now() - new Date(row.at).getTime() < 62 * 86_400_000 ? row.rank : null;
            }, null),
            safe("updated", async () => {
                const [row] = await db.select({
                    day: sql<string | null>`to_char((${pbaPlayers.updatedAt} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`,
                }).from(pbaPlayers).where(eq(pbaPlayers.memCode, memCode));
                return row?.day ?? null;
            }, null),
        ]);
        const extra: PbaPlayerExtra = {
            wins,
            recordRanks: career ? pbaPlayerRecordRanks(career.rows, memCode) : {},
            bench: career ? pbaLeagueBench(career.rows, base.league) : { average: null, bankShotRate: null, winRate: null, highRunTop: null },
            neighbors,
            followers,
            umbRank,
            updated,
        };
        return { ...(base as unknown as PbaPlayerProfile), extra };
    }

    // 요약 — 현재 시즌 상금 1위·포인트 1위 (홈/프리렌더 카드용)
    async getSummary(league: "PBA" | "LPBA", season: number) {
        const [prizeTop] = await this.getRankings(league, season, "prize", 1);
        const [pointTop] = await this.getRankings(league, season, "point", 1);
        const [{ total }] = await db.select({ total: sql<number>`count(*)::int` })
            .from(pbaSeasonRanks)
            .where(and(eq(pbaSeasonRanks.league, league), eq(pbaSeasonRanks.season, season)));
        return { prizeTop: prizeTop ?? null, pointTop: pointTop ?? null, total };
    }
}
