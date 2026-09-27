/**
 * "나와 비교하기"(2026-09-27) 저장소 — 랭큐 회원의 3쿠션 에버리지 분포와 내 기록 요약.
 * 분포는 공개 화면(가입 전 방문자)도 부르므로 프로세스 캐시(10분)로 한 번만 읽는다 — 회원 수천 명 × 숫자 하나.
 * 에버리지 값은 회원 프로필의 avg_3c(앱 곳곳에 보이는 '내 에버'와 같은 값), 자격은 3쿠션 기록 COMPARE_MIN_GAMES 판 이상.
 */
import { db } from "../db.js";
import { hiqGameHistory, hiqMembers } from "../../shared/schema.js";
import { and, eq, gt, gte, sql } from "drizzle-orm";
import { COMPARE_MIN_GAMES, rankAmong, type CompareMembers, type CompareMyStats } from "../../shared/proCompare.js";

const TTL = 10 * 60 * 1000;
let distCache: { at: number; sortedDesc: number[] } | null = null;

export class CompareRepository {
    /** 자격 회원들의 3쿠션 에버리지(내림차순) */
    async memberAverages(): Promise<number[]> {
        if (distCache && Date.now() - distCache.at < TTL) return distCache.sortedDesc;
        const games = db.select({ memberId: hiqGameHistory.memberId, n: sql<number>`count(*)::int`.as("n") })
            .from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.gameType, "3c"), gt(hiqGameHistory.innings, 0)))
            .groupBy(hiqGameHistory.memberId)
            .as("g");
        const rows = await db.select({ avg: hiqMembers.avg3c })
            .from(hiqMembers)
            .innerJoin(games, eq(games.memberId, hiqMembers.id))
            .where(and(gt(hiqMembers.avg3c, 0), gte(games.n, COMPARE_MIN_GAMES)));
        const sortedDesc = rows.map((r) => Number(r.avg)).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => b - a);
        distCache = { at: Date.now(), sortedDesc };
        return sortedDesc;
    }

    async memberRank(avg: number): Promise<CompareMembers | null> {
        return rankAmong(await this.memberAverages(), avg);
    }

    /**
     * 내 3쿠션 요약 — 경기 수·하이런·승률(대전만)·최근 3개월 월평균 변화.
     * 변화: (전체 누적 에버) − (90일 전까지의 누적 에버) 를 3으로 나눈다. 90일 전 기록이 5판 미만이거나 그 뒤 3판 미만이면 null.
     */
    async myStats(memberId: string): Promise<CompareMyStats | null> {
        const [m] = await db.select({ avg: hiqMembers.avg3c }).from(hiqMembers).where(eq(hiqMembers.id, memberId)).limit(1);
        const cutoff = new Date(Date.now() - 90 * 86_400_000);
        const [agg] = await db.select({
            games: sql<number>`count(*)::int`,
            highRun: sql<number | null>`max(${hiqGameHistory.highRun})`,
            matches: sql<number>`count(*) filter (where ${hiqGameHistory.gameMode} = 'match')::int`,
            wins: sql<number>`count(*) filter (where ${hiqGameHistory.gameMode} = 'match' and ${hiqGameHistory.isWinner})::int`,
            score: sql<number>`coalesce(sum(${hiqGameHistory.score}), 0)::int`,
            innings: sql<number>`coalesce(sum(${hiqGameHistory.innings}), 0)::int`,
            oldGames: sql<number>`count(*) filter (where ${hiqGameHistory.createdAt} < ${cutoff})::int`,
            oldScore: sql<number>`coalesce(sum(${hiqGameHistory.score}) filter (where ${hiqGameHistory.createdAt} < ${cutoff}), 0)::int`,
            oldInnings: sql<number>`coalesce(sum(${hiqGameHistory.innings}) filter (where ${hiqGameHistory.createdAt} < ${cutoff}), 0)::int`,
        }).from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.memberId, memberId), eq(hiqGameHistory.gameType, "3c"), gt(hiqGameHistory.innings, 0)));
        const games = Number(agg?.games ?? 0);
        const avg = Number(m?.avg ?? 0);
        if (!games || !(avg > 0)) return null;
        const recent = games - Number(agg.oldGames);
        const perMonth = Number(agg.oldGames) >= COMPARE_MIN_GAMES && recent >= 3 && agg.oldInnings > 0 && agg.innings > 0
            ? (agg.score / agg.innings - agg.oldScore / agg.oldInnings) / 3
            : null;
        const matches = Number(agg.matches);
        return {
            avg,
            games,
            highRun: agg.highRun != null && Number(agg.highRun) > 0 ? Number(agg.highRun) : null,
            winRate: matches > 0 ? Number(agg.wins) / matches : null,
            perMonth,
        };
    }
}
