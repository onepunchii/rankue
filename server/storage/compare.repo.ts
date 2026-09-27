/**
 * "나와 비교하기"(2026-09-27) 저장소 — 랭큐 회원의 실전 에버리지 분포와 내 기록 요약.
 * 분포는 공개 화면(가입 전 방문자)도 부르므로 프로세스 캐시(10분)로 한 번만 읽는다 — 회원 수천 명 × 숫자 하나.
 * 에버리지 값은 회원 프로필의 avg_3c·avg_4c(앱 곳곳에 보이는 '내 에버'와 같은 값), 자격은 그 종목 기록 COMPARE_MIN_GAMES 판 이상.
 */
import { db } from "../db.js";
import { hiqGameHistory, hiqMembers } from "../../shared/schema.js";
import { and, desc, eq, gt, gte, sql } from "drizzle-orm";
import { COMPARE_MIN_GAMES, rankAmong, type CompareMembers, type CompareMyStats } from "../../shared/proCompare.js";
import { HANDI_RECENT_GAMES } from "../../shared/realHandicap.js";

const TTL = 10 * 60 * 1000;
type GT = "3c" | "4c";
const distCache: Partial<Record<GT, { at: number; sortedDesc: number[] }>> = {};
const avgCol = (type: GT) => (type === "4c" ? hiqMembers.avg4c : hiqMembers.avg3c);

export class CompareRepository {
    /** 자격 회원들의 그 종목 에버리지(내림차순) */
    async memberAverages(type: GT = "3c"): Promise<number[]> {
        const hit = distCache[type];
        if (hit && Date.now() - hit.at < TTL) return hit.sortedDesc;
        const games = db.select({ memberId: hiqGameHistory.memberId, n: sql<number>`count(*)::int`.as("n") })
            .from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.gameType, type), gt(hiqGameHistory.innings, 0)))
            .groupBy(hiqGameHistory.memberId)
            .as("g");
        const rows = await db.select({ avg: avgCol(type) })
            .from(hiqMembers)
            .innerJoin(games, eq(games.memberId, hiqMembers.id))
            .where(and(gt(avgCol(type), 0), gte(games.n, COMPARE_MIN_GAMES)));
        const sortedDesc = rows.map((r) => Number(r.avg)).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => b - a);
        distCache[type] = { at: Date.now(), sortedDesc };
        return sortedDesc;
    }

    async memberRank(avg: number, type: GT = "3c"): Promise<CompareMembers | null> {
        return rankAmong(await this.memberAverages(type), avg);
    }

    /**
     * 내 한 종목 요약 — 경기 수·하이런·승률(대전만)·최근 3개월 월평균 변화.
     * 변화: (전체 누적 에버) − (90일 전까지의 누적 에버) 를 3으로 나눈다. 90일 전 기록이 5판 미만이거나 그 뒤 3판 미만이면 null.
     */
    async myStats(memberId: string, type: GT = "3c"): Promise<CompareMyStats | null> {
        const [m] = await db.select({ avg: avgCol(type) }).from(hiqMembers).where(eq(hiqMembers.id, memberId)).limit(1);
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
            .where(and(eq(hiqGameHistory.memberId, memberId), eq(hiqGameHistory.gameType, type), gt(hiqGameHistory.innings, 0)));
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

    /**
     * 핸디를 매기는 값 — 최근 공식(랭크) HANDI_RECENT_GAMES 경기의 경기별 에버리지 평균과 공식 경기 수.
     * game.repo 의 핸디 산정과 같은 식(경기별 average 글자를 숫자로 읽어 평균)이라 '다음 핸디까지'가 실제 오름과 맞는다.
     */
    async handiBasis(memberId: string, type: GT): Promise<{ ranked: number; avg: number | null }> {
        const [cnt] = await db.select({ n: sql<number>`count(*)::int` }).from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.memberId, memberId), eq(hiqGameHistory.gameType, type), eq(hiqGameHistory.isRanked, true)));
        const rows = await db.select({ average: hiqGameHistory.average }).from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.memberId, memberId), eq(hiqGameHistory.gameType, type), eq(hiqGameHistory.isRanked, true)))
            .orderBy(desc(hiqGameHistory.createdAt))
            .limit(HANDI_RECENT_GAMES);
        const vals = rows.map((r) => parseFloat(r.average)).filter((v) => Number.isFinite(v));
        return { ranked: Number(cnt?.n ?? 0), avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
    }

    /** 같은 핸디 회원 — 인원·평균 에버·평균 최고 하이런(그 종목). 나도 포함한다. */
    async peers(type: GT, handi: number): Promise<{ count: number; avg: number | null; highRun: number | null }> {
        const handiCol = type === "4c" ? hiqMembers.handi4c : hiqMembers.handi3c;
        const hr = db.select({ memberId: hiqGameHistory.memberId, best: sql<number>`max(${hiqGameHistory.highRun})`.as("best") })
            .from(hiqGameHistory).where(eq(hiqGameHistory.gameType, type)).groupBy(hiqGameHistory.memberId).as("h");
        const [row] = await db.select({
            count: sql<number>`count(*)::int`,
            avg: sql<number | null>`avg(nullif(${avgCol(type)}, 0))`,
            highRun: sql<number | null>`avg(nullif(${hr.best}, 0))`,
        }).from(hiqMembers).leftJoin(hr, eq(hr.memberId, hiqMembers.id)).where(eq(handiCol, handi));
        return {
            count: Number(row?.count ?? 0),
            avg: row?.avg != null ? Number(row.avg) : null,
            highRun: row?.highRun != null ? Number(row.highRun) : null,
        };
    }
}
