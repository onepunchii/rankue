import { db } from "../db.js";
import { umbRankings, umbEvents, umbPlayerNames, type InsertUmbRanking } from "../../shared/schema.js";
import { and, eq, desc, asc, sql, inArray, ilike, or } from "drizzle-orm";
import type { UmbCategory, ParsedRanking, ArchiveEntry } from "../services/umbService.js";
import { toKoreanName } from "../services/umbKoreanName.js";

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

        const conds: any[] = [eq(umbRankings.category, category), eq(umbRankings.edition, latest.edition)];
        if (opts.fed) conds.push(eq(umbRankings.fed, opts.fed.toUpperCase()));
        // 검색은 로마자·네이티브(한글) 양쪽 매칭 — "조명우"로도 "CHO"로도 찾게
        if (opts.q) conds.push(or(
            ilike(umbRankings.playerName, `%${opts.q}%`),
            ilike(umbPlayerNames.nativeName, `%${opts.q}%`),
        ));

        const base = () => db.select({
            rank: umbRankings.rank,
            playerName: umbRankings.playerName,
            nativeName: umbPlayerNames.nativeName,
            fed: umbRankings.fed,
            playerUmbId: umbRankings.playerUmbId,
            points: umbRankings.points,
        })
            .from(umbRankings)
            .leftJoin(umbPlayerNames, eq(umbPlayerNames.playerUmbId, umbRankings.playerUmbId));

        const [rows, [{ total }]] = await Promise.all([
            base()
                .where(and(...conds))
                .orderBy(asc(umbRankings.rank))
                .limit(limit)
                .offset(offset),
            db.select({ total: sql<number>`count(*)::int` })
                .from(umbRankings)
                .leftJoin(umbPlayerNames, eq(umbPlayerNames.playerUmbId, umbRankings.playerUmbId))
                .where(and(...conds)),
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
        const rivalsRaw = latestRow ? await db.select({
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
        const rivals = rivalsRaw.sort((a, b) => a.rank - b.rank);

        // 네이티브 이름(한글 등) 일괄 조회 — 본인 + 라이벌
        const nameRows = await db.select({ playerUmbId: umbPlayerNames.playerUmbId, nativeName: umbPlayerNames.nativeName })
            .from(umbPlayerNames)
            .where(inArray(umbPlayerNames.playerUmbId, [playerUmbId, ...rivals.map(r => r.playerUmbId)]));
        const nativeNames = new Map(nameRows.map(n => [n.playerUmbId, n.nativeName]));

        return {
            rivals: rivals.map(r => ({ ...r, nativeName: nativeNames.get(r.playerUmbId) ?? null })),
            player: latestRow ? {
                playerName: latestRow.playerName,
                nativeName: nativeNames.get(playerUmbId) ?? null,
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
            SELECT c.rank, c.player_name AS "playerName", n.native_name AS "nativeName",
                   c.fed, c.player_umb_id AS "playerUmbId",
                   c.points, b.rank AS "prevRank", (b.rank - c.rank) AS move
            FROM ${cur} c
            JOIN ${before} b ON b.player_umb_id = c.player_umb_id
            LEFT JOIN ${umbPlayerNames} n ON n.player_umb_id = c.player_umb_id
            WHERE b.rank - c.rank > 0
            ORDER BY move DESC, c.rank ASC
            LIMIT ${limit}
        `).then((r: any) => r.rows ?? r);
        return rows;
    }

    // 사이트맵용 선수 목록 — 부문별 톱 1000 + 한국 선수 전원 (오너 결정: 세계 톱1000).
    // 전 선수(4,300+)까지는 하위권 페이지가 얇은 콘텐츠로 저품질 판정 위험이 있어 제한한다.
    async getPlayersForSitemap(): Promise<Array<{ category: string; playerUmbId: string }>> {
        const out: Array<{ category: string; playerUmbId: string }> = [];
        for (const category of ["players", "ladies", "juniors"] as UmbCategory[]) {
            const editions = await this.getLatestEditions(category, 1);
            if (!editions.length) continue;
            const rows = await db.select({ playerUmbId: umbRankings.playerUmbId, rank: umbRankings.rank, fed: umbRankings.fed })
                .from(umbRankings)
                .where(and(
                    eq(umbRankings.category, category),
                    eq(umbRankings.edition, editions[0].edition),
                    sql`(${umbRankings.rank} <= 1000 OR ${umbRankings.fed} = 'KR')`,
                ))
                .orderBy(asc(umbRankings.rank));
            for (const r of rows) out.push({ category, playerUmbId: r.playerUmbId });
        }
        return out;
    }

    // 로마자→한글 변환으로 아직 이름이 없는 한국 선수를 채운다.
    // 변환기는 모든 음절이 확실할 때만 결과를 내므로(불확실=null) 틀린 이름이 저장되지 않는다.
    // 동기화(주간)·백필이 함께 쓴다 — 멱등.
    async fillMissingKoreanNames(): Promise<number> {
        const result: any = await db.execute(sql`
            SELECT DISTINCT r.player_umb_id AS id, r.player_name AS name
            FROM ${umbRankings} r
            LEFT JOIN ${umbPlayerNames} n ON n.player_umb_id = r.player_umb_id
            WHERE r.fed = 'KR' AND n.id IS NULL
        `);
        const missing = (result.rows ?? result) as Array<{ id: string; name: string }>;
        const values = missing
            .map(m => ({ playerUmbId: m.id, nativeName: toKoreanName(m.name), lang: "ko" }))
            .filter((v): v is { playerUmbId: string; nativeName: string; lang: string } => !!v.nativeName);
        for (let i = 0; i < values.length; i += 500) {
            await db.insert(umbPlayerNames).values(values.slice(i, i + 500)).onConflictDoNothing();
        }
        return values.length;
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
                   sum(points) FILTER (WHERE rn <= 5)::int AS "top5Points",
                   count(*) FILTER (WHERE rank <= 20)::int AS "top20Count"
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

    // fed = 뷰어의 "우리나라" (기본 KR) — 요약 줄의 국가별 통계 기준
    // 역대 세계 1위 계보 — 연속 재임 구간으로 접는다. "지금 1위는 누구" 정답 허브의 핵심:
    // AI 검색·위키가 낡은 답(전임 1위)을 주는 공백을 주간 스냅샷 2년치로 메운다.
    async getNo1History(category: UmbCategory) {
        const rows = await db.select({
            edition: umbRankings.edition,
            editionDate: umbRankings.editionDate,
            playerUmbId: umbRankings.playerUmbId,
            playerName: umbRankings.playerName,
            nativeName: umbPlayerNames.nativeName,
            fed: umbRankings.fed,
        })
            .from(umbRankings)
            .leftJoin(umbPlayerNames, eq(umbPlayerNames.playerUmbId, umbRankings.playerUmbId))
            .where(and(eq(umbRankings.category, category), eq(umbRankings.rank, 1)))
            .orderBy(asc(umbRankings.editionDate));

        const reigns: Array<{ playerUmbId: string; playerName: string; nativeName: string | null; fed: string; from: Date; to: Date; weeks: number; current: boolean }> = [];
        for (const r of rows) {
            const last = reigns[reigns.length - 1];
            if (last && last.playerUmbId === r.playerUmbId) {
                last.to = r.editionDate;
                last.weeks++;
            } else {
                reigns.push({ playerUmbId: r.playerUmbId, playerName: r.playerName, nativeName: r.nativeName, fed: r.fed, from: r.editionDate, to: r.editionDate, weeks: 1, current: false });
            }
        }
        if (reigns.length) reigns[reigns.length - 1].current = true;
        return reigns.reverse(); // 현재 1위부터
    }

    async getSummary(category: UmbCategory, fed = "KR") {
        const editions = await this.getLatestEditions(category, 1);
        if (!editions.length) return null;
        const latest = editions[0];
        const base = and(eq(umbRankings.category, category), eq(umbRankings.edition, latest.edition));
        const [[{ fedCount }], [top], [fedTop]] = await Promise.all([
            db.select({ fedCount: sql<number>`count(*)::int` }).from(umbRankings).where(and(base, eq(umbRankings.fed, fed))),
            db.select({ rank: umbRankings.rank, playerName: umbRankings.playerName, nativeName: umbPlayerNames.nativeName, fed: umbRankings.fed })
                .from(umbRankings)
                .leftJoin(umbPlayerNames, eq(umbPlayerNames.playerUmbId, umbRankings.playerUmbId))
                .where(base).orderBy(asc(umbRankings.rank)).limit(1),
            db.select({ rank: umbRankings.rank, playerName: umbRankings.playerName, nativeName: umbPlayerNames.nativeName })
                .from(umbRankings)
                .leftJoin(umbPlayerNames, eq(umbPlayerNames.playerUmbId, umbRankings.playerUmbId))
                .where(and(base, eq(umbRankings.fed, fed))).orderBy(asc(umbRankings.rank)).limit(1),
        ]);
        const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(umbRankings).where(base);
        return { edition: latest.edition, editionDate: latest.editionDate, total, fed, fedCount, top: top ?? null, fedTop: fedTop ?? null };
    }

    // 데일리 브리핑 — "역사 속 오늘"(±3일 과거 연도 1위) 또는 현재 1·2위 격차 폴백.
    // 나열이 아니라 매일 바뀌는 헤드라인 한 줄. 요청 시 계산 + CDN 캐시로 충분(크론 불필요).
    async getBriefing() {
        // 1) 과거 같은 시기(±3일)의 1위 — 히스토리가 쌓일수록 적중률이 올라간다
        const [past] = (await db.execute(sql`
            SELECT r.edition_date, r.player_name, r.player_umb_id, r.points, n.native_name
            FROM umb_rankings r
            LEFT JOIN umb_player_names n ON n.player_umb_id = r.player_umb_id
            WHERE r.category = 'players' AND r.rank = 1
              AND r.edition_date < now() - interval '300 days'
              AND abs(extract(doy FROM r.edition_date) - extract(doy FROM now())) <= 3
            ORDER BY r.edition_date DESC LIMIT 1`)).rows as any[];
        if (past) {
            const yearsAgo = new Date().getFullYear() - new Date(past.edition_date).getFullYear();
            return {
                type: "onThisDay" as const, yearsAgo,
                name: past.player_name, nativeName: past.native_name ?? null,
                playerUmbId: past.player_umb_id, points: past.points,
            };
        }
        // 2) 폴백: 현재 1·2위 격차 밀리스톤
        const [latest] = await this.getLatestEditions("players", 1);
        if (!latest) return null;
        const top2 = (await db.execute(sql`
            SELECT r.rank, r.player_name, r.player_umb_id, r.points, n.native_name
            FROM umb_rankings r
            LEFT JOIN umb_player_names n ON n.player_umb_id = r.player_umb_id
            WHERE r.category = 'players' AND r.edition = ${latest.edition} AND r.rank <= 2
            ORDER BY r.rank`)).rows as any[];
        if (top2.length < 2) return null;
        return {
            type: "gap" as const,
            name: top2[0].player_name, nativeName: top2[0].native_name ?? null,
            playerUmbId: top2[0].player_umb_id,
            rivalName: top2[1].player_name, rivalNativeName: top2[1].native_name ?? null,
            gap: top2[0].points - top2[1].points,
        };
    }
}
