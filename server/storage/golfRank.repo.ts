import { db } from "../db.js";
import { golfRankings, golfPlayers, golfStats, hiqPlayerFollows, type InsertGolfRanking, type InsertGolfPlayer, type InsertGolfStat } from "../../shared/schema.js";
import { and, eq, desc, asc, sql, ilike, or, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { GOLF_TOUR_META, type GolfTour } from "../../shared/golfTours.js";
import { editionSignature } from "../services/golf/parse.js";

/**
 * 골프 랭킹 저장소(2026-09-13 오너: PGA·LPGA·KPGA·KLPGA). UMB 저장소(umb.repo)와 같은 골격 —
 * 회차 단위 스냅샷의 멱등 적재, 최신·직전 회차 비교로 순위 변동, 국가 집계, 선수 히스토리.
 * 공개 데이터라 뷰어 개인화가 없고, 최신 회차 조회는 5분 모듈 캐시로 Neon 을 보호한다(UMB 와 같은 이유).
 */
const EDITIONS_TTL_MS = 5 * 60 * 1000;
const editionsCache = new Map<string, { at: number; data: Array<{ edition: string; editionDate: Date }> }>();

export interface GolfRankRow {
    rank: number; playerId: string; playerName: string; nameKo: string | null; country: string;
    points: number; pointsTotal: number | null; events: number | null; prevRank: number | null;
    move: number | null;   // 직전 회차 대비(+상승 / -하락 / null 신규)
}

export class GolfRankRepository {
    /* ── 회차 ── */

    async hasEdition(tour: GolfTour, edition: string): Promise<boolean> {
        const [row] = await db.select({ id: golfRankings.id }).from(golfRankings)
            .where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, edition))).limit(1);
        return !!row;
    }

    async getLatestEditions(tour: GolfTour, count = 2): Promise<Array<{ edition: string; editionDate: Date }>> {
        const cached = editionsCache.get(tour);
        if (cached && Date.now() - cached.at < EDITIONS_TTL_MS && cached.data.length >= count) return cached.data.slice(0, count);
        const data = await db.selectDistinct({ edition: golfRankings.edition, editionDate: golfRankings.editionDate })
            .from(golfRankings).where(eq(golfRankings.tour, tour))
            .orderBy(desc(golfRankings.editionDate)).limit(Math.max(count, 2));
        editionsCache.set(tour, { at: Date.now(), data });
        return data.slice(0, count);
    }

    /** 최신 회차의 서명 — 같으면 새 회차를 만들지 않는다(투어 랭킹은 대회 없는 날 그대로다). */
    async latestSignature(tour: GolfTour): Promise<string | null> {
        const [latest] = await this.getLatestEditions(tour, 1);
        if (!latest) return null;
        const rows = await db.select({ rank: golfRankings.rank, playerId: golfRankings.playerId, points: golfRankings.points })
            .from(golfRankings).where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, latest.edition)))
            .orderBy(asc(golfRankings.rank)).limit(300);
        return editionSignature(rows);
    }

    /** 멱등 적재 — 같은 회차 재수집 시 삭제 후 재삽입 */
    async upsertEdition(tour: GolfTour, edition: string, editionDate: Date, rows: readonly Omit<InsertGolfRanking, "tour" | "edition" | "editionDate">[]): Promise<number> {
        await db.transaction(async (tx) => {
            await tx.delete(golfRankings).where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, edition)));
            const values: InsertGolfRanking[] = rows.map((r) => ({ ...r, tour, edition, editionDate }));
            for (let i = 0; i < values.length; i += 500) await tx.insert(golfRankings).values(values.slice(i, i + 500));
        });
        editionsCache.delete(tour);
        return rows.length;
    }

    async upsertPlayers(rows: readonly InsertGolfPlayer[]): Promise<void> {
        // 같은 응답에 같은 선수가 두 번 오면 ON CONFLICT 가 두 번째 행에서 터진다 — 마지막 행 우선
        const uniq = [...new Map(rows.map((r) => [`${r.tour}:${r.playerId}`, r])).values()];
        for (let i = 0; i < uniq.length; i += 200) {
            await db.insert(golfPlayers).values(uniq.slice(i, i + 200)).onConflictDoUpdate({
                target: [golfPlayers.tour, golfPlayers.playerId],
                set: {
                    name: sql`excluded.name`,
                    nameKo: sql`coalesce(excluded.name_ko, ${golfPlayers.nameKo})`,
                    nameEn: sql`coalesce(excluded.name_en, ${golfPlayers.nameEn})`,
                    country: sql`excluded.country`,
                    birthDate: sql`coalesce(excluded.birth_date, ${golfPlayers.birthDate})`,
                    extra: sql`coalesce(excluded.extra, ${golfPlayers.extra})`,
                    updatedAt: sql`now()`,
                },
            });
        }
    }

    /** 시즌 한 지표의 목록을 통째로 바꾼다(출처가 전체를 다시 주므로 부분 갱신할 이유가 없다). */
    async replaceStat(tour: GolfTour, season: string, statKey: string, label: string, unit: string, rows: readonly { rank: number; playerId: string; playerName: string; value: number; extra?: Record<string, unknown> }[]): Promise<number> {
        await db.transaction(async (tx) => {
            await tx.delete(golfStats).where(and(eq(golfStats.tour, tour), eq(golfStats.season, season), eq(golfStats.statKey, statKey)));
            const uniq = [...new Map(rows.map((r) => [r.playerId, r])).values()];
            const values: InsertGolfStat[] = uniq.map((r) => ({ tour, season, statKey, label, unit, rank: r.rank, playerId: r.playerId, playerName: r.playerName, value: r.value, extra: r.extra ?? null }));
            for (let i = 0; i < values.length; i += 500) await tx.insert(golfStats).values(values.slice(i, i + 500));
        });
        return rows.length;
    }

    /* ── 목록 ── */

    async getRankings(tour: GolfTour, opts: { limit?: number; offset?: number; country?: string; q?: string } = {}) {
        const [latest, prev] = await this.getLatestEditions(tour, 2);
        if (!latest) return { edition: null, editionDate: null, prevEdition: null, total: 0, rows: [] as GolfRankRow[] };
        const limit = opts.limit ?? 50, offset = opts.offset ?? 0;
        const conds = [eq(golfRankings.tour, tour), eq(golfRankings.edition, latest.edition)];
        if (opts.country) conds.push(eq(golfRankings.country, opts.country.toUpperCase()));
        if (opts.q) conds.push(or(ilike(golfRankings.playerName, `%${opts.q}%`), ilike(golfRankings.nameKo, `%${opts.q}%`))!);
        const where = and(...conds);
        const prevT = alias(golfRankings, "prev");
        const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(golfRankings).where(where);
        const rows = await db.select({
            rank: golfRankings.rank, playerId: golfRankings.playerId, playerName: golfRankings.playerName, nameKo: golfRankings.nameKo,
            country: golfRankings.country, points: golfRankings.points, pointsTotal: golfRankings.pointsTotal, events: golfRankings.events,
            prevRank: golfRankings.prevRank, prevEditionRank: prevT.rank,
        }).from(golfRankings)
            .leftJoin(prevT, and(eq(prevT.tour, tour), eq(prevT.edition, prev?.edition ?? "__none__"), eq(prevT.playerId, golfRankings.playerId)))
            .where(where).orderBy(asc(golfRankings.rank)).limit(limit).offset(offset);
        const out: GolfRankRow[] = rows.map((r) => this.withMove(r));
        // prevEdition: 직전 회차가 아예 없으면(첫 스냅샷) 화면이 전원을 NEW 로 찍지 않게 알려 준다
        return { edition: latest.edition, editionDate: latest.editionDate, prevEdition: prev?.edition ?? null, total, rows: out };
    }

    /** 순위 변동: 출처가 지난 회차 순위를 주면 그것, 아니면 우리가 가진 직전 회차와 비교 */
    private withMove(r: { rank: number; playerId: string; playerName: string; nameKo: string | null; country: string; points: number; pointsTotal: number | null; events: number | null; prevRank: number | null; prevEditionRank?: number | null }): GolfRankRow {
        const prevRank = r.prevRank ?? r.prevEditionRank ?? null;
        return { rank: r.rank, playerId: r.playerId, playerName: r.playerName, nameKo: r.nameKo, country: r.country, points: r.points, pointsTotal: r.pointsTotal, events: r.events, prevRank, move: prevRank === null ? null : prevRank - r.rank };
    }

    async getMovers(tour: GolfTour, limit = 5) {
        const { rows } = await this.getRankings(tour, { limit: 300 });
        return rows.filter((r) => (r.move ?? 0) > 0).sort((a, b) => (b.move! - a.move!) || (a.rank - b.rank)).slice(0, limit);
    }

    /** 국가 집계(세계 랭킹만 의미) — 상위 5명 합산 평균 포인트, 등재 인원, 최고 순위, 톱20 수 */
    async getNations(tour: GolfTour) {
        const [latest] = await this.getLatestEditions(tour, 1);
        if (!latest) return { edition: null, nations: [] };
        const rows = await db.select({ rank: golfRankings.rank, country: golfRankings.country, points: golfRankings.points, playerName: golfRankings.playerName, nameKo: golfRankings.nameKo })
            .from(golfRankings).where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, latest.edition))).orderBy(asc(golfRankings.rank));
        const acc = new Map<string, { players: number; bestRank: number; bestPlayer: string; top5: number[]; top20Count: number }>();
        for (const r of rows) {
            const a = acc.get(r.country) ?? { players: 0, bestRank: r.rank, bestPlayer: r.nameKo || r.playerName, top5: [] as number[], top20Count: 0 };
            a.players++;
            if (a.top5.length < 5) a.top5.push(r.points);
            if (r.rank <= 20) a.top20Count++;
            acc.set(r.country, a);
        }
        const nations = [...acc.entries()].map(([fed, a]) => ({ fed, players: a.players, bestRank: a.bestRank, bestPlayer: a.bestPlayer, top5Points: Math.round(a.top5.reduce((s, v) => s + v, 0) * 100) / 100, top20Count: a.top20Count }))
            .sort((x, y) => y.top5Points - x.top5Points).slice(0, 40);
        return { edition: latest.edition, nations };
    }

    /* ── 선수 ── */

    async getPlayer(tour: GolfTour, playerId: string) {
        const history = await db.select({ edition: golfRankings.edition, editionDate: golfRankings.editionDate, rank: golfRankings.rank, points: golfRankings.points })
            .from(golfRankings).where(and(eq(golfRankings.tour, tour), eq(golfRankings.playerId, playerId))).orderBy(asc(golfRankings.editionDate));
        const [latestEd, prevEd] = await this.getLatestEditions(tour, 2);
        if (!latestEd) return null;
        const [row] = await db.select().from(golfRankings)
            .where(and(eq(golfRankings.tour, tour), eq(golfRankings.playerId, playerId), eq(golfRankings.edition, latestEd.edition))).limit(1);
        const [info] = await db.select().from(golfPlayers).where(and(eq(golfPlayers.tour, tour), eq(golfPlayers.playerId, playerId))).limit(1);
        if (!row && !info) return null;
        const bestRank = history.length ? Math.min(...history.map((h) => h.rank)) : null;
        const country = row?.country ?? info?.country ?? "UNK";

        // 국내 순위판 — 세계 랭킹만. 같은 국가 상위 5 + 이 선수의 국내 순위
        let national: { fedCount: number; nationalRank: number | null; top: Array<{ rank: number; playerId: string; playerName: string; nameKo: string | null; points: number }> } | null = null;
        if (GOLF_TOUR_META[tour].world && row) {
            const same = await db.select({ rank: golfRankings.rank, playerId: golfRankings.playerId, playerName: golfRankings.playerName, nameKo: golfRankings.nameKo, points: golfRankings.points })
                .from(golfRankings).where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, latestEd.edition), eq(golfRankings.country, country))).orderBy(asc(golfRankings.rank));
            const idx = same.findIndex((s) => s.playerId === playerId);
            national = { fedCount: same.length, nationalRank: idx >= 0 ? idx + 1 : null, top: same.slice(0, 5) };
        }

        // 시즌 기록 — 이 선수의 지표별 순위·값 + 그 지표에 몇 명이 있나
        const season = String(new Date().getFullYear());
        const mine = await db.select({ statKey: golfStats.statKey, label: golfStats.label, unit: golfStats.unit, rank: golfStats.rank, value: golfStats.value })
            .from(golfStats).where(and(eq(golfStats.tour, tour), eq(golfStats.season, season), eq(golfStats.playerId, playerId)));
        const keys = mine.map((m) => m.statKey);
        const counts = keys.length ? await db.select({ statKey: golfStats.statKey, n: sql<number>`count(*)::int` })
            .from(golfStats).where(and(eq(golfStats.tour, tour), eq(golfStats.season, season), inArray(golfStats.statKey, keys))).groupBy(golfStats.statKey) : [];
        const countOf = new Map(counts.map((c) => [c.statKey, c.n]));
        const stats = mine.map((m) => ({ ...m, of: countOf.get(m.statKey) ?? null }));

        const [followRow] = await db.select({ n: sql<number>`count(*)::int` }).from(hiqPlayerFollows)
            .where(and(eq(hiqPlayerFollows.category, tour), eq(hiqPlayerFollows.playerUmbId, playerId)));

        const prevT = prevEd ? await db.select({ rank: golfRankings.rank }).from(golfRankings)
            .where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, prevEd.edition), eq(golfRankings.playerId, playerId))).limit(1) : [];

        return {
            player: {
                playerId, tour,
                playerName: row?.playerName ?? info?.name ?? playerId,
                nameKo: row?.nameKo ?? info?.nameKo ?? null,
                nameEn: info?.nameEn ?? (row?.extra as any)?.nameEn ?? null,
                country,
                rank: row?.rank ?? null,
                points: row?.points ?? null,
                pointsTotal: row?.pointsTotal ?? null,
                events: row?.events ?? null,
                prevRank: row?.prevRank ?? prevT[0]?.rank ?? null,
                birthDate: info?.birthDate ?? (row?.extra as any)?.birthDate ?? null,
                extra: { ...(info?.extra ?? {}), ...(row?.extra ?? {}) },
                inLatest: !!row,
            },
            edition: latestEd.edition,
            bestRank,
            history,
            national,
            stats,
            season,
            followers: followRow?.n ?? 0,
        };
    }

    /* ── 기록 목록 ── */

    async getStatKeys(tour: GolfTour, season: string) {
        return db.select({ statKey: golfStats.statKey, label: golfStats.label, unit: golfStats.unit, n: sql<number>`count(*)::int` })
            .from(golfStats).where(and(eq(golfStats.tour, tour), eq(golfStats.season, season)))
            .groupBy(golfStats.statKey, golfStats.label, golfStats.unit).orderBy(asc(golfStats.statKey));
    }

    async getStat(tour: GolfTour, season: string, statKey: string, limit = 50) {
        return db.select({ rank: golfStats.rank, playerId: golfStats.playerId, playerName: golfStats.playerName, value: golfStats.value, label: golfStats.label, unit: golfStats.unit })
            .from(golfStats).where(and(eq(golfStats.tour, tour), eq(golfStats.season, season), eq(golfStats.statKey, statKey)))
            .orderBy(asc(golfStats.rank)).limit(limit);
    }

    /** 최근 시즌(기록이 있는) — 시즌 초 롤오버 공백에도 비지 않게 */
    async getDisplaySeason(tour: GolfTour): Promise<string | null> {
        const [row] = await db.select({ s: sql<string>`max(${golfStats.season})` }).from(golfStats).where(eq(golfStats.tour, tour));
        return row?.s ?? null;
    }

    /* ── 사이트맵·요약 ── */

    /** 세계 랭킹은 톱 300 + 한국 선수 전원, 투어 랭킹은 전원 */
    async getPlayersForSitemap(): Promise<Array<{ tour: GolfTour; playerId: string }>> {
        const out: Array<{ tour: GolfTour; playerId: string }> = [];
        for (const tour of Object.keys(GOLF_TOUR_META) as GolfTour[]) {
            const [latest] = await this.getLatestEditions(tour, 1);
            if (!latest) continue;
            const cond = GOLF_TOUR_META[tour].world
                ? or(sql`${golfRankings.rank} <= 300`, eq(golfRankings.country, "KOR"))!
                : sql`true`;
            const rows = await db.select({ playerId: golfRankings.playerId }).from(golfRankings)
                .where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, latest.edition), cond)).orderBy(asc(golfRankings.rank));
            for (const r of rows) out.push({ tour, playerId: r.playerId });
        }
        return out;
    }

    async getSummary(tour: GolfTour, fed = "KOR") {
        const [latest] = await this.getLatestEditions(tour, 1);
        if (!latest) return null;
        const [[{ total }], [top], [fedTop], [{ fedCount }]] = await Promise.all([
            db.select({ total: sql<number>`count(*)::int` }).from(golfRankings).where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, latest.edition))),
            db.select({ rank: golfRankings.rank, playerId: golfRankings.playerId, playerName: golfRankings.playerName, nameKo: golfRankings.nameKo, country: golfRankings.country, points: golfRankings.points })
                .from(golfRankings).where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, latest.edition))).orderBy(asc(golfRankings.rank)).limit(1),
            db.select({ rank: golfRankings.rank, playerId: golfRankings.playerId, playerName: golfRankings.playerName, nameKo: golfRankings.nameKo, points: golfRankings.points })
                .from(golfRankings).where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, latest.edition), eq(golfRankings.country, fed))).orderBy(asc(golfRankings.rank)).limit(1),
            db.select({ fedCount: sql<number>`count(*)::int` }).from(golfRankings).where(and(eq(golfRankings.tour, tour), eq(golfRankings.edition, latest.edition), eq(golfRankings.country, fed))),
        ]);
        return { tour, edition: latest.edition, editionDate: latest.editionDate, total, top: top ?? null, fed, fedCount, fedTop: fedTop ?? null };
    }

    /** 팔로우된 선수들의 최신·직전 회차 순위(순위 변동 알림용) — umb.repo.followedRows 와 같은 모양 */
    async followedRows(tour: GolfTour, latestEdition: string, prevEdition: string | null) {
        const cur = alias(golfRankings, "cur");
        const prev = alias(golfRankings, "prev");
        const rows = await db.select({
            memberId: hiqPlayerFollows.memberId, playerUmbId: hiqPlayerFollows.playerUmbId,
            playerName: cur.playerName, nativeName: cur.nameKo, rank: cur.rank, points: cur.points, prevRank: prev.rank,
        }).from(hiqPlayerFollows)
            .innerJoin(cur, and(eq(cur.tour, tour), eq(cur.edition, latestEdition), eq(cur.playerId, hiqPlayerFollows.playerUmbId)))
            .leftJoin(prev, and(eq(prev.tour, tour), eq(prev.edition, prevEdition ?? "__none__"), eq(prev.playerId, hiqPlayerFollows.playerUmbId)))
            .where(eq(hiqPlayerFollows.category, tour));
        return rows.map((r) => ({ ...r, points: Math.round(r.points), prevRank: r.prevRank ?? null }));
    }
}
