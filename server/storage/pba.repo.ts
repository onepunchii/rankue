import { db } from "../db.js";
import { pbaPlayers, pbaSeasonRanks } from "../../shared/schema.js";
import { and, desc, eq, sql } from "drizzle-orm";

// PBA 투어 읽기 저장소 — 공개 읽기 전용. 시즌 목록은 자주 안 바뀌므로 프로세스 캐시.

let seasonsCache: { at: number; data: { league: string; seasons: number[] }[] } | null = null;
const SEASONS_TTL = 5 * 60 * 1000;

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

    // 사이트맵·프리렌더용 전체 목록
    async getPlayersForSitemap() {
        return db.select({ memCode: pbaPlayers.memCode, league: pbaPlayers.league, nameKo: pbaPlayers.nameKo })
            .from(pbaPlayers).orderBy(pbaPlayers.memCode);
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
