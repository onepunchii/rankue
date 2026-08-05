import { db } from "../db.js";
import { umbRankings, umbEvents, type InsertUmbRanking } from "../../shared/schema.js";
import { and, eq, desc, asc, sql, inArray, ilike } from "drizzle-orm";
import type { UmbCategory, ParsedRanking, ArchiveEntry } from "../services/umbService.js";

// UMB 세계랭킹 저장소. 공개 데이터라 뷰어 개인화·차단 로직이 없고,
// 회차(edition) 단위 스냅샷의 멱등 적재가 핵심이다.
//
// 최신 회차 조회는 부문 파티션 전체 DISTINCT 집계라 요청마다 돌리면 무인증 공개
// 엔드포인트가 Neon 컴퓨트를 직격한다 — 데이터가 주 1회 갱신이므로 모듈 캐시로 흡수.
const EDITIONS_TTL_MS = 5 * 60 * 1000;
const editionsCache = new Map<string, { at: number; data: Array<{ edition: string; editionDate: Date }> }>();

export class UmbRepository {

    async hasEdition(category: UmbCategory, edition: string): Promise<boolean> {
        const [row] = await db.select({ id: umbRankings.id })
            .from(umbRankings)
            .where(and(eq(umbRankings.category, category), eq(umbRankings.edition, edition)))
            .limit(1);
        return !!row;
    }

    // 멱등 적재 — 같은 회차 재수집 시 삭제 후 재삽입
    async upsertEdition(entry: ArchiveEntry, parsed: ParsedRanking): Promise<number> {
        await db.transaction(async (tx) => {
            await tx.delete(umbRankings).where(and(
                eq(umbRankings.category, entry.category), eq(umbRankings.edition, entry.edition)));
            await tx.delete(umbEvents).where(and(
                eq(umbEvents.category, entry.category), eq(umbEvents.edition, entry.edition)));

            const values: InsertUmbRanking[] = parsed.rows.map(r => ({
                category: entry.category,
                edition: entry.edition,
                editionDate: entry.editionDate,
                rank: r.rank,
                playerName: r.playerName,
                fed: r.fed,
                playerUmbId: r.playerUmbId,
                points: r.points,
                penaltyPoints: r.penaltyPoints,
                eventPoints: r.eventPoints,
            }));
            for (let i = 0; i < values.length; i += 500) {
                await tx.insert(umbRankings).values(values.slice(i, i + 500));
            }
            if (parsed.events.length) {
                await tx.insert(umbEvents).values(parsed.events.map(e => ({
                    category: entry.category,
                    edition: entry.edition,
                    editionDate: entry.editionDate,
                    colKey: e.colKey,
                    label: e.label,
                })));
            }
        });
        editionsCache.delete(entry.category); // 새 회차 적재 즉시 반영
        return parsed.rows.length;
    }

    // 최신·직전 회차 (순위 변동 계산의 기준) — 5분 모듈 캐시
    async getLatestEditions(category: UmbCategory, count = 2): Promise<Array<{ edition: string; editionDate: Date }>> {
        const cached = editionsCache.get(category);
        if (cached && Date.now() - cached.at < EDITIONS_TTL_MS && cached.data.length >= count) {
            return cached.data.slice(0, count);
        }
        const data = await db.selectDistinct({ edition: umbRankings.edition, editionDate: umbRankings.editionDate })
            .from(umbRankings)
            .where(eq(umbRankings.category, category))
            .orderBy(desc(umbRankings.editionDate))
            .limit(Math.max(count, 2));
        editionsCache.set(category, { at: Date.now(), data });
        return data.slice(0, count);
    }

    async getRankings(category: UmbCategory, opts: { limit?: number; offset?: number; fed?: string; q?: string } = {}) {
        const limit = Math.min(opts.limit ?? 50, 200);
        const offset = Math.max(opts.offset ?? 0, 0);
        const editions = await this.getLatestEditions(category);
        if (!editions.length) return { edition: null, editionDate: null, total: 0, rows: [] };
        const [latest, prev] = editions;

        const conds = [eq(umbRankings.category, category), eq(umbRankings.edition, latest.edition)];
        if (opts.fed) conds.push(eq(umbRankings.fed, opts.fed.toUpperCase()));
        if (opts.q) conds.push(ilike(umbRankings.playerName, `%${opts.q}%`));

        const [rows, [{ total }]] = await Promise.all([
            db.select({
                rank: umbRankings.rank,
                playerName: umbRankings.playerName,
                fed: umbRankings.fed,
                playerUmbId: umbRankings.playerUmbId,
                points: umbRankings.points,
            })
                .from(umbRankings)
                .where(and(...conds))
                .orderBy(asc(umbRankings.rank))
                .limit(limit)
                .offset(offset),
            db.select({ total: sql<number>`count(*)::int` }).from(umbRankings).where(and(...conds)),
        ]);

        // 직전 회차 순위 → 변동 계산 (조회된 페이지의 선수만)
        let prevRanks = new Map<string, number>();
        if (prev && rows.length) {
            const prevRows = await db.select({ playerUmbId: umbRankings.playerUmbId, rank: umbRankings.rank })
                .from(umbRankings)
                .where(and(
                    eq(umbRankings.category, category),
                    eq(umbRankings.edition, prev.edition),
                    inArray(umbRankings.playerUmbId, rows.map(r => r.playerUmbId)),
                ));
            prevRanks = new Map(prevRows.map(r => [r.playerUmbId, r.rank]));
        }

        return {
            edition: latest.edition,
            editionDate: latest.editionDate,
            total,
            rows: rows.map(r => {
                const prevRank = prevRanks.get(r.playerUmbId) ?? null;
                return { ...r, prevRank, move: prevRank == null ? null : prevRank - r.rank };
            }),
        };
    }

    // 선수 상세 — 전 회차 히스토리 + 최신 회차의 대회별 점수·레전드
    async getPlayerHistory(category: UmbCategory, playerUmbId: string) {
        const history = await db.select({
            edition: umbRankings.edition,
            editionDate: umbRankings.editionDate,
            rank: umbRankings.rank,
            points: umbRankings.points,
        })
            .from(umbRankings)
            .where(and(eq(umbRankings.category, category), eq(umbRankings.playerUmbId, playerUmbId)))
            .orderBy(asc(umbRankings.editionDate));
        if (!history.length) return null;

        const latestEdition = history[history.length - 1].edition;
        const [latestRow] = await db.select()
            .from(umbRankings)
            .where(and(
                eq(umbRankings.category, category),
                eq(umbRankings.edition, latestEdition),
                eq(umbRankings.playerUmbId, playerUmbId),
            ));

        const events = await db.select({ colKey: umbEvents.colKey, label: umbEvents.label })
            .from(umbEvents)
            .where(and(eq(umbEvents.category, category), eq(umbEvents.edition, latestEdition)));

        const bestRank = Math.min(...history.map(h => h.rank));
        // 같은 국가 내 순위 (최신 회차)
        const [natl] = latestRow ? await db.select({ n: sql<number>`count(*)::int` })
            .from(umbRankings)
            .where(and(
                eq(umbRankings.category, category),
                eq(umbRankings.edition, latestEdition),
                eq(umbRankings.fed, latestRow.fed),
                sql`${umbRankings.rank} <= ${latestRow.rank}`,
            )) : [{ n: 0 }];

        // 국내 라이벌 — 같은 국가에서 순위가 가장 가까운 2명 (탭하면 그 선수로 이동)
        const rivals = latestRow ? await db.select({
            rank: umbRankings.rank,
            playerName: umbRankings.playerName,
            playerUmbId: umbRankings.playerUmbId,
            points: umbRankings.points,
        })
            .from(umbRankings)
            .where(and(
                eq(umbRankings.category, category),
                eq(umbRankings.edition, latestEdition),
                eq(umbRankings.fed, latestRow.fed),
                sql`${umbRankings.playerUmbId} != ${playerUmbId}`,
            ))
            .orderBy(sql`abs(${umbRankings.rank} - ${latestRow.rank})`)
            .limit(2) : [];

        return {
            rivals: rivals.sort((a, b) => a.rank - b.rank),
            player: latestRow ? {
                playerName: latestRow.playerName,
                fed: latestRow.fed,
                playerUmbId,
                rank: latestRow.rank,
                points: latestRow.points,
                penaltyPoints: latestRow.penaltyPoints,
                eventPoints: latestRow.eventPoints,
                nationalRank: natl?.n ?? null,
            } : null,
            bestRank,
            history,
            events,
        };
    }

    // 이번 주 무버 — 최신 vs 직전 회차의 순위 상승 톱 N (상위 200위 안에서)
    async getMovers(category: UmbCategory, limit = 5) {
        const editions = await this.getLatestEditions(category);
        if (editions.length < 2) return [];
        const [latest, prev] = editions;
        const cur = sql`(SELECT rank, player_name, fed, player_umb_id, points FROM ${umbRankings}
            WHERE category = ${category} AND edition = ${latest.edition} AND rank <= 200)`;
        const before = sql`(SELECT rank, player_umb_id FROM ${umbRankings}
            WHERE category = ${category} AND edition = ${prev.edition})`;
        const rows: any[] = await db.execute(sql`
            SELECT c.rank, c.player_name AS "playerName", c.fed, c.player_umb_id AS "playerUmbId",
                   c.points, b.rank AS "prevRank", (b.rank - c.rank) AS move
            FROM ${cur} c JOIN ${before} b ON b.player_umb_id = c.player_umb_id
            WHERE b.rank - c.rank > 0
            ORDER BY move DESC, c.rank ASC
            LIMIT ${limit}
        `).then((r: any) => r.rows ?? r);
        return rows;
    }

    // 국가별 집계 — "당구 강국 랭킹". 상위 5명 합산 포인트로 정렬(데이비스컵 방식):
    // 총합은 선수 수가 많은 나라가, 1위 순위만은 스타 한 명이 왜곡하므로 톱5 합산이 균형점.
    async getNations(category: UmbCategory) {
        const editions = await this.getLatestEditions(category, 1);
        if (!editions.length) return { edition: null, editionDate: null, nations: [] };
        const latest = editions[0];
        const result: any = await db.execute(sql`
            SELECT fed,
                   count(*)::int AS "players",
                   min(rank)::int AS "bestRank",
                   (array_agg(player_name ORDER BY rank))[1] AS "bestPlayer",
                   sum(points) FILTER (WHERE rn <= 5)::int AS "top5Points"
            FROM (
                SELECT fed, rank, points, player_name,
                       row_number() OVER (PARTITION BY fed ORDER BY rank) AS rn
                FROM ${umbRankings}
                WHERE category = ${category} AND edition = ${latest.edition}
            ) s
            GROUP BY fed
            ORDER BY "top5Points" DESC NULLS LAST, "bestRank" ASC
        `);
        const nations = (result.rows ?? result) as any[];
        return { edition: latest.edition, editionDate: latest.editionDate, nations };
    }

    // 대회 캘린더 — 최신 회차 레전드에서 도시·국가·날짜를 파싱.
    // 월드컵은 "PORTO (PT) 2025-07-05", 세계선수권은 "14/18 Oct. 2025 - ANTWERP (BE)" 형식.
    async getCalendar(category: UmbCategory) {
        const editions = await this.getLatestEditions(category, 1);
        if (!editions.length) return [];
        const events = await db.select({ colKey: umbEvents.colKey, label: umbEvents.label })
            .from(umbEvents)
            .where(and(eq(umbEvents.category, category), eq(umbEvents.edition, editions[0].edition)));

        const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        const parsed = events.map(e => {
            const label = e.label;
            let date: Date | null = null;
            const iso = label.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (iso) date = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
            else {
                const en = label.match(/(\d{1,2})(?:\/\d{1,2})?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/i);
                if (en) date = new Date(Date.UTC(+en[3], MONTHS[en[2].toLowerCase().slice(0, 3)], +en[1]));
            }
            const loc = [...label.matchAll(/([A-ZÀ-Ü][A-ZÀ-Ü' .]+?)\s*\(([A-Z]{2})\)/g)].pop();
            const kind = /World Championship/i.test(label) ? "championship"
                : /World Cup/i.test(label) ? "worldcup" : "other";
            return {
                colKey: e.colKey,
                label,
                kind,
                city: loc ? loc[1].trim() : null,
                country: loc ? loc[2] : null,
                date: date ? date.toISOString() : null,
            };
        }).filter(e => e.date && e.kind !== "other");
        return parsed.sort((a, b) => a.date!.localeCompare(b.date!));
    }

    async getSummary(category: UmbCategory) {
        const editions = await this.getLatestEditions(category, 1);
        if (!editions.length) return null;
        const latest = editions[0];
        const base = and(eq(umbRankings.category, category), eq(umbRankings.edition, latest.edition));
        const [[{ total }], [{ krCount }], [top], [krTop]] = await Promise.all([
            db.select({ total: sql<number>`count(*)::int` }).from(umbRankings).where(base),
            db.select({ krCount: sql<number>`count(*)::int` }).from(umbRankings).where(and(base, eq(umbRankings.fed, "KR"))),
            db.select({ rank: umbRankings.rank, playerName: umbRankings.playerName, fed: umbRankings.fed })
                .from(umbRankings).where(base).orderBy(asc(umbRankings.rank)).limit(1),
            db.select({ rank: umbRankings.rank, playerName: umbRankings.playerName })
                .from(umbRankings).where(and(base, eq(umbRankings.fed, "KR"))).orderBy(asc(umbRankings.rank)).limit(1),
        ]);
        return { edition: latest.edition, editionDate: latest.editionDate, total, krCount, top: top ?? null, krTop: krTop ?? null };
    }
}
