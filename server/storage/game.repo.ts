import { db } from "../db.js";
import {
    hiqMembers,
    hiqGames,
    hiqGameHistory,
    hiqInvites,
    hiqFriendships,
    hiqCrewTournamentMatches,
    profiles
} from "../../shared/schema.js";
import type {
    InsertHiqGame,
    HiqGame,
    HiqGameHistory,
    HiqMember
} from "../../shared/schema.js";
import { eq, ne, desc, asc, and, or, sql, gt, inArray } from "drizzle-orm";
import { notFound } from "../utils/errors.js";
import { msg } from "../lib/i18n.js";
import { scoringInnings } from "../../shared/averageRule.js";

const HANDICAP_MAP_4C = [
    { avg: 1.5, handi: 50 },
    { avg: 1.2, handi: 40 },
    { avg: 0.9, handi: 30 },
    { avg: 0.75, handi: 25 },
    { avg: 0.6, handi: 20 },
    { avg: 0.45, handi: 15 },
    { avg: 0.35, handi: 12 },
    { avg: 0.3, handi: 10 },
    { avg: 0.24, handi: 8 },
    { avg: 0.15, handi: 5 },
    { avg: 0.0, handi: 3 },
];

const HANDICAP_MAP_3C = [
    { avg: 1.0, handi: 30 },
    { avg: 0.7, handi: 25 },
    { avg: 0.6, handi: 23 },
    { avg: 0.5, handi: 20 },
    { avg: 0.4, handi: 18 },
    { avg: 0.3, handi: 15 },
    { avg: 0.0, handi: 12 },
];

/** 어드민 기록 삭제 결과 — 지운 것과, 되돌린 값의 전후 대조. 실패 사유도 같은 타입으로 돌려준다. */
export type AdminGameDeleteResult =
    | { ok: false; reason: "not-found" | "tournament" }
    | {
        ok: true;
        game: { id: string; gameType: "3c" | "4c"; gameMode: string; isRanked: boolean; playedAt: string | null; players: string[] };
        members: Array<{
            id: string; name: string;
            /** RP 에 되돌려 넣은 값(승리 되돌리기면 -30). 0 이면 건드리지 않았다. */
            rpRolledBack: number;
            before: { rating: number; avg: number; games: number; wins: number; highRun: number };
            after: { rating: number; avg: number; games: number; wins: number; highRun: number };
        }>;
    };

/**
 * 랭킹 포인트 증감. 경기 종료(finishHiqGame)와 어드민의 기록 삭제(되돌리기)가 **같은 식**을 써야
 * 넣은 만큼 정확히 빼진다. 임계값은 HANDICAP_MAP_3C / HANDICAP_MAP_4C 의 스케일과 한 몸이다
 * (자세한 근거는 finishHiqGame 안 주석).
 */
export function rpDeltaFor(gameType: string, isWinner: boolean, handi: number): number {
    if (isWinner) return 30;
    const h = handi || 0;
    if (gameType === "3c") {
        if (h < 16) return 0;
        if (h < 22) return -5;
        return -15;
    }
    if (h < 12) return 0;
    if (h < 25) return -5;
    return -15;
}

export class GameRepository {

    /**
     * 내 진행 중 경기 — 대시보드의 "이어서 하기" 배너용.
     * 앱을 껐다 켜면 진행 중 경기로 돌아갈 입구가 아예 없어서, 한 번 이탈한 경기는
     * 영구히 playing_base 로 남았다(전체 완주율 33%, 외국 유저는 0% — 2026-08-31 실측).
     * 최근 24시간 것만 — 며칠 지난 미완 경기를 들이밀면 오히려 혼란스럽다.
     */
    async getMyOngoingGame(memberId: string) {
        const rows = await db.select().from(hiqGames)
            .where(and(
                inArray(hiqGames.status, ["playing_base", "playing_finish"]),
                or(
                    eq(hiqGames.player1Id, memberId), eq(hiqGames.player2Id, memberId),
                    eq(hiqGames.player3Id, memberId), eq(hiqGames.player4Id, memberId),
                ),
            ))
            .orderBy(desc(hiqGames.playedAt))
            .limit(1);
        const g = rows[0];
        if (!g) return null;
        const age = Date.now() - new Date(g.playedAt as any).getTime();
        if (age > 24 * 3600 * 1000) return null;
        return g;
    }
    async startHiqGame(gameData: InsertHiqGame): Promise<HiqGame> {
        const [game] = await db.insert(hiqGames).values(gameData).returning();
        return game;
    }

    async getHiqGameById(id: string): Promise<HiqGame | undefined> {
        const [game] = await db.select().from(hiqGames).where(eq(hiqGames.id, id));
        return game;
    }

    async updateHiqGameScore(id: string, data: Partial<HiqGame>): Promise<void> {
        // 종료된 경기는 이 경로로 다시 열 수 없다. status를 playing_base로 되돌린 뒤 /finish를
        // 다시 호출하면 history 4건과 RP가 통째로 한 번 더 쌓이기 때문. 라우트에서도 409로
        // 막지만, 다른 호출부(이름 self-heal 등)까지 덮는 최종 방어선으로 WHERE에 둔다.
        await db.update(hiqGames).set({
            ...data,
        }).where(and(eq(hiqGames.id, id), ne(hiqGames.status, "finished")));
    }

    async finishHiqGame(id: string, finalData: Partial<HiqGame>): Promise<HiqGame> {
        const currentGame = await this.getHiqGameById(id);
        if (!currentGame) throw notFound(msg("err.game.notFound"));

        // Fast path: already finished.
        if (currentGame.status === "finished") return currentGame;

        // Ranked status is decided ONCE at start by the consent gate (startHiqGame), which
        // accounts for consented members in ANY slot (2, 3 or 4). Recomputing it here from
        // player2Id alone silently un-ranked legit 1v2 / 1v3 matches, so we keep the persisted
        // decision instead of second-guessing it.
        const isRanked = currentGame.gameMode === "match" && !!currentGame.isRanked;

        // winnerId must be one of THIS game's players — never an arbitrary member id.
        const playerIds = [currentGame.player1Id, currentGame.player2Id, currentGame.player3Id, currentGame.player4Id]
            .filter((pid): pid is string => !!pid);
        const submittedWinner = (finalData as any).winnerId;
        const winnerId = submittedWinner && playerIds.includes(submittedWinner) ? submittedWinner : null;

        // 종료는 전부-또는-전무여야 한다. 상태 전환 / history 4건 / RP 적용이 개별 쿼리였을 때는
        // 중간에 실패하면 일부 참가자의 전적만 남고, 재시도는 위의 fast-path(status==='finished')에
        // 막혀 나머지 전적이 영구 소실됐다. 하나의 트랜잭션으로 묶어 롤백되게 한다.
        // 알림 발송·핸디 재계산 같은 외부/후속 작업은 커밋 이후(트랜잭션 밖)에 둔다.
        const finished = await db.transaction(async (tx) => {
            // Atomic finish: the status guard lives INSIDE the UPDATE, so two concurrent finish
            // requests can't both pass a read-then-write check and double-insert history / double-apply RP.
            const [game] = await tx.update(hiqGames).set({
                ...finalData,
                winnerId,
                status: "finished",
                isRanked
            }).where(and(eq(hiqGames.id, id), ne(hiqGames.status, "finished"))).returning();

            // Lost the race — another request finished it first.
            if (!game) return null;

            // 각 선수의 실제 이닝 수. 후공은 마지막 이닝을 치지 않고 끝나는 경우가 있어
            // 공용 totalInnings를 그대로 쓰면 후공의 에버리지가 실제보다 낮게 저장된다.
            // 배열이 없거나 비어 있으면(구버전 페이로드) totalInnings로 폴백한다.
            const totalInnings = game.totalInnings || 0;
            // 목표(알다마) 도달 이후의 마무리 이닝은 에버리지에서 제외한다 — shared/averageRule 참고.
            const inningsOf = (inningData: unknown, target: unknown): number =>
                scoringInnings(inningData, Number(target ?? 0), totalInnings);

            // 슬롯별 history 저장. 점수는 파울 감점으로 음수가 될 수 있으므로 클램프하지 않는다.
            const saveHistory = async (slot: 1 | 2 | 3 | 4, opponentName: string) => {
                const g = game as any;
                const memberId: string | null = g[`player${slot}Id`];
                if (!memberId) return;

                const score: number = g[`player${slot}Score`] ?? 0;
                const inningData = g[`player${slot}Innings`] ?? null;
                const innings = inningsOf(inningData, g[`player${slot}Target`]);

                await tx.insert(hiqGameHistory).values({
                    memberId,
                    gameId: game.id,
                    gameMode: game.gameMode,
                    gameType: game.gameType,
                    score,
                    innings,
                    average: (score / (innings || 1)).toFixed(2),
                    isRanked: game.isRanked,
                    isWinner: game.winnerId === memberId,
                    highRun: g[`player${slot}HighRun`] || 0,
                    inningData,
                    opponentName,
                    sportCategory: game.sportCategory
                });
            };

            await saveHistory(1, game.player2Name || "상대방");
            // 슬롯 2~4는 모두 대전 상대다 — 연습(practice) 모드에는 상대 전적이 남으면 안 된다.
            // 예전에는 이 gameMode 조건이 슬롯 2에만 있어서 3·4번 슬롯만 연습 경기 전적을 남겼다.
            if (game.gameMode === "match") {
                await saveHistory(2, game.player1Name || "상대방");
                await saveHistory(3, game.player1Name || "상대방");
                await saveHistory(4, game.player1Name || "상대방");
            }

            // Update Ratings based on result (Record-based Ranking Point with Tier Protection)
            const ratingField = game.gameType === "3c" ? "rating3c" : "rating4c";
            const handiField = game.gameType === "3c" ? "handi3c" : "handi4c";

            // 패배 감점 구간. handi 값은 HANDICAP_MAP_3C / HANDICAP_MAP_4C가 내놓는 값이므로
            // 임계값은 그 맵의 스케일과 한 몸이다 — 맵의 handi 범위를 바꾸면 여기도 같이 고쳐야 한다.
            //   3구 맵: 12~30 → 12·15 면제 / 18·20 -5 / 23·25·30 -15
            //   4구 맵: 3~50  → 3·5·8·10 면제 / 12·15·20 -5 / 25·30·40·50 -15
            // 4구 임계값이 예전엔 80·150이었는데 4구 맵의 최댓값이 50이라 항상 h<80,
            // 즉 패배 감점이 언제나 0이었다(4구 랭킹이 사실상 '승 횟수 랭킹'이 됐다).
            // 새 값은 두 맵의 avg 축에서도 대응된다: 면제 구간 상한이 3구·4구 모두 avg 0.3이다.
            const calculateRpDelta = (isWinner: boolean, handi: number) => rpDeltaFor(game.gameType, isWinner, handi);

            if (game.isRanked) {
                // Apply RP to EVERY bound member slot, not just 1 and 2 — a consented member in
                // slot 3 or 4 was getting a ranked history row while their rating never moved.
                const rankedIds = [game.player1Id, game.player2Id, game.player3Id, game.player4Id]
                    .filter((pid): pid is string => !!pid);

                for (const pid of rankedIds) {
                    const [p] = await tx.select().from(hiqMembers).where(eq(hiqMembers.id, pid));
                    if (!p) continue;
                    const delta = calculateRpDelta(game.winnerId === pid, p[handiField] || 0);
                    await tx.update(hiqMembers)
                        .set({ [ratingField]: sql`GREATEST(0, ${hiqMembers[ratingField]} + ${delta})` })
                        .where(eq(hiqMembers.id, pid));
                }
            }

            return game;
        });

        // Lost the race — another request finished it first. Return that result untouched.
        if (!finished) {
            const existing = await this.getHiqGameById(id);
            if (!existing) throw notFound(msg("err.game.notFound"));
            return existing;
        }

        // Update Cached Averages (every bound member, so the lobby's target-score input stays fresh).
        // 커밋 이후에 돌려야 방금 넣은 history 행까지 집계에 잡힌다.
        for (const pid of [finished.player1Id, finished.player2Id, finished.player3Id, finished.player4Id]) {
            if (pid) await this._updateUserAverage(pid, finished.gameType as "3c" | "4c");
        }

        return finished;
    }

    async getMemberGameHistory(memberId: string, sportCategory?: string): Promise<HiqGameHistory[]> {
        return await db
            .select()
            .from(hiqGameHistory)
            .where(
                and(
                    eq(hiqGameHistory.memberId, memberId),
                    sportCategory ? eq(hiqGameHistory.sportCategory, sportCategory as any) : undefined
                )
            )
            .orderBy(desc(hiqGameHistory.createdAt));
    }

    async checkAndUpdateHandicap(memberId: string, gameType: "3c" | "4c") {
        const history = await this.getMemberGameHistory(memberId);
        const filtered = history.filter(h => h.gameType === gameType && h.isRanked).slice(0, 10);

        if (filtered.length < 5) return { oldHandi: 0, newHandi: 0, message: null };

        const totalAvg = filtered.reduce((acc, h) => acc + parseFloat(h.average), 0) / filtered.length;
        const [currentMember] = await db.select().from(hiqMembers).where(eq(hiqMembers.id, memberId));
        if (!currentMember) return { oldHandi: 0, newHandi: 0, message: null };

        const handiField = gameType === "3c" ? "handi3c" : "handi4c";
        const oldHandi = currentMember[handiField] || 0;

        const map = gameType === "4c" ? HANDICAP_MAP_4C : HANDICAP_MAP_3C;
        let newHandi = map[map.length - 1].handi;
        for (const tier of map) {
            if (totalAvg >= tier.avg) {
                newHandi = tier.handi;
                break;
            }
        }

        if (newHandi !== oldHandi) {
            await db.update(hiqMembers)
                .set({ [handiField]: newHandi, updatedAt: new Date() })
                .where(eq(hiqMembers.id, memberId));

            return {
                oldHandi,
                newHandi,
                message: `최근 ${filtered.length}게임 에버리지(${totalAvg.toFixed(2)}) 기준 핸디가 ${newHandi}로 조정되었습니다.`
            };
        }

        return { oldHandi, newHandi, message: null };
    }

    async getMemberStatsAnalysis(memberId: string, type: "3c" | "4c" = "4c") {
        const history = await this.getMemberGameHistory(memberId);
        const filtered = history.filter(h => h.gameType === type && h.gameMode === 'match' && h.isRanked);

        const wins = filtered.filter(h => h.isWinner).length;
        const losses = filtered.length - wins;
        const totalGames = filtered.length;

        let overallAvg = 0;
        let recentAvg = 0;
        let highRunMax = 0;

        if (totalGames > 0) {
            overallAvg = filtered.reduce((acc, h) => acc + parseFloat(h.average), 0) / totalGames;
            highRunMax = Math.max(...filtered.map(h => h.highRun || 0));

            const recent = filtered.slice(0, 5);
            if (recent.length > 0) {
                recentAvg = recent.reduce((acc, h) => acc + parseFloat(h.average), 0) / recent.length;
            }
        }

        const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
        const mentalScore = Math.abs(recentAvg - overallAvg) < 0.1 ? 80 : 50;

        return {
            power: Math.min(100, 40 + (highRunMax * 5)),
            technique: Math.min(100, 30 + (overallAvg * 50)),
            mental: mentalScore,
            experience: Math.min(100, 20 + totalGames),
            trend: 50 + (filtered[0]?.isWinner ? 10 : -10),
            winRate: Math.round(winRate),
            avgAverage: overallAvg.toFixed(2),
            totalGames: totalGames,
            summary: {
                overallAvg: overallAvg.toFixed(3),
                recentAvg: recentAvg.toFixed(3),
                highRun: highRunMax,
                wins,
                losses,
                matchCount: totalGames
            }
        };
    }

    async getHeadToHeadStats(myId: string, friendId: string, sport: string = "BILLIARDS") {
        const games = await db.select()
            .from(hiqGameHistory)
            .innerJoin(hiqGames, eq(hiqGameHistory.gameId, hiqGames.id))
            .where(
                and(
                    eq(hiqGameHistory.memberId, myId),
                    eq(hiqGames.sportCategory, sport as "BILLIARDS" | "GOLF"),
                    or(
                        eq(hiqGames.player1Id, friendId),
                        eq(hiqGames.player2Id, friendId),
                        eq(hiqGames.player3Id, friendId),
                        eq(hiqGames.player4Id, friendId)
                    )
                )
            );

        const myWins = games.filter(g => g.hiq_game_history.isWinner).length;
        const total = games.length;

        return {
            total,
            myWins,
            friendWins: total - myWins,
            winRate: total > 0 ? Math.round((myWins / total) * 100) : 0
        };
    }

    async getHeadToHeadGames(myId: string, friendId: string, sport: string = "BILLIARDS") {
        const history = await db.select()
            .from(hiqGameHistory)
            .innerJoin(hiqGames, eq(hiqGameHistory.gameId, hiqGames.id))
            .where(
                and(
                    eq(hiqGameHistory.memberId, myId),
                    eq(hiqGames.sportCategory, sport as "BILLIARDS" | "GOLF"),
                    or(
                        eq(hiqGames.player1Id, friendId),
                        eq(hiqGames.player2Id, friendId),
                        eq(hiqGames.player3Id, friendId),
                        eq(hiqGames.player4Id, friendId)
                    )
                )
            )
            .orderBy(desc(hiqGameHistory.createdAt))
            .limit(10);

        return history.map(h => ({
            ...h.hiq_games,
            historyId: h.hiq_game_history.id,
            myScore: h.hiq_game_history.score,
            myInnings: h.hiq_game_history.innings,
            isWinner: h.hiq_game_history.isWinner
        }));
    }

    async claimGameRecord(gameId: string, memberId: string, slotIndex: number): Promise<boolean> {
        // Slot 1 is always the host/creator and must never be claimable.
        if (!Number.isInteger(slotIndex) || slotIndex < 2 || slotIndex > 4) return false;

        const game = await this.getHiqGameById(gameId);
        if (!game) return false;

        // 진행 중인 경기는 claim 대상이 아니다. 종료 전에 빈 슬롯을 차지하면 finishHiqGame이
        // 그 회원을 정식 참가자로 보고 RP까지 얹어주는데, 이건 초대·동의 게이트를 우회하는
        // 경로다. 이미 끝난 경기의 기록 연동만 허용한다.
        if (game.status !== "finished") return false;

        const idField = `player${slotIndex}Id`;
        const nameField = `player${slotIndex}Name`;
        const g = game as any;

        // Target slot must be an unclaimed guest: no bound member id but a name present.
        if (g[idField] !== null || !g[nameField]) return false;

        // Reject if this member already occupies any player slot in this game
        // (prevents claiming two slots / self-duplication in head-to-head).
        const occupied = [game.player1Id, game.player2Id, game.player3Id, game.player4Id];
        if (occupied.includes(memberId)) return false;

        await db.transaction(async (tx) => {
            await tx.update(hiqGames)
                .set({ [idField]: memberId })
                .where(eq(hiqGames.id, gameId));

            // Backfill a hiqGameHistory row so the claimed game surfaces in the
            // claimer's own history / head-to-head reads (both keyed by memberId).
            // 위에서 종료된 경기만 통과시켰으므로 여기선 score/inning이 항상 확정값이다.
            const score = g[`player${slotIndex}Score`] ?? 0;
            const inningData = g[`player${slotIndex}Innings`] ?? null;
            // 후공은 덜 칠 수 있으니 본인 이닝 배열 길이를 우선하고, 목표 도달 이후의
            // 마무리 이닝은 제외한다 — finishHiqGame 과 같은 규칙(shared/averageRule).
            const totalInnings = game.totalInnings ?? 0;
            const innings = scoringInnings(inningData, Number(g[`player${slotIndex}Target`] ?? 0), totalInnings);
            const highRun = g[`player${slotIndex}HighRun`] ?? 0;
            const average = (score / (innings || 1)).toFixed(2);

            // 승자 판정. game.winnerId가 있으면 그게 정답이다. 예전에는 무조건 점수 비교였는데
            // 비어 있는 슬롯의 기본값 0점까지 후보에 들어가서, 0-0으로 끝난 경기를 claim하면
            // 패자도 승자로 기록됐다. 폴백은 (a) 실제로 채워진 슬롯만 보고 (b) 최고점이
            // 유일할 때만 승리로 친다 — 동점(0-0 포함)은 승자 없음.
            let isWinner: boolean;
            if (game.winnerId) {
                isWinner = game.winnerId === memberId;
            } else {
                const filledScores = [1, 2, 3, 4]
                    .filter(n => g[`player${n}Id`] || g[`player${n}Name`])
                    .map(n => g[`player${n}Score`] ?? 0);
                const maxScore = filledScores.length > 0 ? Math.max(...filledScores) : 0;
                isWinner = score === maxScore && filledScores.filter(s => s === maxScore).length === 1;
            }

            await tx.insert(hiqGameHistory).values({
                memberId,
                gameId: game.id,
                gameMode: game.gameMode,
                gameType: game.gameType,
                score,
                innings,
                average,
                isRanked: game.isRanked,
                isWinner,
                highRun,
                inningData,
                opponentName: game.player1Name || "상대방",
                sportCategory: game.sportCategory,
            });
        });

        return true;
    }

    // Set of member ids who accepted an invite from this host and whose invite is still
    // valid — the consent primitive used to gate binding members into game slots.
    async getConsentedGuestIds(hostId: string): Promise<Set<string>> {
        const rows = await db
            .select({ guestId: hiqInvites.guestId })
            .from(hiqInvites)
            .where(
                and(
                    eq(hiqInvites.hostId, hostId),
                    eq(hiqInvites.status, "accepted"),
                    gt(hiqInvites.expiresAt, new Date())
                )
            );
        return new Set(rows.map(r => r.guestId).filter((id): id is string => id !== null));
    }

    async getGameHistoryById(id: string): Promise<HiqGameHistory | undefined> {
        const [history] = await db.select().from(hiqGameHistory).where(eq(hiqGameHistory.id, id));
        return history;
    }

    async createInvite(hostId: string): Promise<string> {
        // 살아 있는(pending, 미만료) 초대와 같은 코드가 나오면 다른 호스트의 방으로 들어가는 사고가 난다.
        // 6자리 900,000개 중 동시 활성 초대는 수십 개 수준이라 재시도 몇 번이면 충분하다.
        for (let attempt = 0; attempt < 8; attempt++) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            const [live] = await db.select({ id: hiqInvites.id }).from(hiqInvites)
                .where(and(eq(hiqInvites.code, code), eq(hiqInvites.status, 'pending'), gt(hiqInvites.expiresAt, new Date())))
                .limit(1);
            if (live) continue;
            await db.insert(hiqInvites).values({
                code,
                hostId,
                status: 'pending',
                expiresAt: new Date(Date.now() + 30 * 60 * 1000)
            });
            return code;
        }
        throw new Error("초대 코드 생성 실패");
    }

    // Consume the accepted invites a completed ranked game was built from, so a single PIN can't
    // authorize an endless stream of ranked results. expiresAt is pulled back to now as well as
    // flipping the status — otherwise the guest could simply re-enter the still-live code and
    // mint a fresh 'accepted' row, reopening the farm loop.
    async consumeInvites(hostId: string, guestIds: string[]): Promise<void> {
        if (guestIds.length === 0) return;
        await db.update(hiqInvites)
            .set({ status: "expired", expiresAt: new Date() })
            .where(and(
                eq(hiqInvites.hostId, hostId),
                eq(hiqInvites.status, "accepted"),
                inArray(hiqInvites.guestId, guestIds)
            ));
    }

    async getInviteStatus(code: string): Promise<any> {
        // Only LIVE invites: a code that has timed out OR been consumed must not keep showing the
        // opponent in the lobby (the host would sit on a phantom joiner that can no longer be bound).
        const invites = await db.select().from(hiqInvites).where(
            and(
                eq(hiqInvites.code, code),
                ne(hiqInvites.status, "expired"),
                gt(hiqInvites.expiresAt, new Date())
            )
        );
        if (invites.length === 0) return null;

        const base = invites[0];
        const result: any = { ...base, guests: [] };

        const guestIds = invites.map(inv => inv.guestId).filter(id => id !== null) as string[];
        if (guestIds.length > 0) {
            // Project the fields the match lobby actually needs (identity + the skill stats used
            // to compute each opponent's target score / displayed average) and nothing more —
            // never leak phone, birthYear, gender, or default settlement bank account fields.
            const guests = await db
                .select({
                    id: hiqMembers.id,
                    name: hiqMembers.name,
                    average: hiqMembers.average,
                    avg3c: hiqMembers.avg3c,
                    avg4c: hiqMembers.avg4c,
                    handi3c: hiqMembers.handi3c,
                    handi4c: hiqMembers.handi4c,
                    rating3c: hiqMembers.rating3c,
                    rating4c: hiqMembers.rating4c,
                })
                .from(hiqMembers)
                .where(inArray(hiqMembers.id, guestIds));
            result.guests = guests;
        }

        return result;
    }

    async joinInvite(code: string, guestId: string): Promise<boolean> {
        const invites = await db.select().from(hiqInvites).where(
            and(
                eq(hiqInvites.code, code),
                gt(hiqInvites.expiresAt, new Date())
            )
        );

        if (invites.length === 0) return false;

        // The host cannot join their own PIN — otherwise they'd be bound into an opponent slot
        // and collect RP twice from a single "match" against themselves.
        if (invites[0].hostId === guestId) return false;

        // Only a LIVE accepted row counts as already-joined. Scoping this to 'accepted' means a
        // guest whose row was consumed by a finished game doesn't get a false "참여 완료" while
        // their consent is actually gone.
        const alreadyJoined = invites.some(inv => inv.guestId === guestId && inv.status === 'accepted');
        if (alreadyJoined) return true;

        const base = invites[0];
        const pendingInvite = invites.find(inv => inv.status === 'pending');

        if (pendingInvite) {
            // Claim the pending row ATOMICALLY. Previously this was a read-then-write, so two
            // guests entering the same PIN concurrently both saw it as 'pending' and the second
            // UPDATE overwrote the first — silently dropping one guest's consent.
            const claimed = await db.update(hiqInvites)
                .set({ guestId, status: 'accepted' })
                .where(and(eq(hiqInvites.id, pendingInvite.id), eq(hiqInvites.status, 'pending')))
                .returning();

            if (claimed.length > 0) return true;
            // Lost the race — fall through and add our own accepted row instead.
        }

        await db.insert(hiqInvites).values({
            code: base.code,
            hostId: base.hostId,
            storeId: base.storeId,
            status: 'accepted',
            guestId: guestId,
            expiresAt: base.expiresAt,
            sportCategory: base.sportCategory
        });

        return true;
    }

    /* ── 매칭 대결 카드(2026-09-23) ───────────────────────────
     * 채팅의 '매칭 대결' 카드는 **카드 자체가 대기실**이다 — 카드가 핀을 들고 있고, 보는 사람은
     * [참가하기] 한 번으로 그 핀에 앉는다(핀 입력 없음). 그래서 카드는 두 가지를 물어야 한다:
     *   · 올릴 때  — 내가 이미 연 핀이 살아 있나(있으면 그걸 다시 쓴다).
     *   · 보일 때  — 그 핀이 아직 살아 있고 몇 명이 앉았나.
     * 스키마는 그대로다(hiq_invites 만 본다). 새 열·새 표 없음.
     */

    /**
     * 한 코드의 '지금 살아 있는 세대'. 죽었으면(만료·소비) null.
     * 코드는 6자리뿐이라 만료된 뒤 **다른 호스트**에게 다시 날 수 있다 — 살아 있는 행들 중 가장 최근 행의
     * 호스트만 이번 세대로 본다(옛 세대 행이 섞이면 남의 참가자가 내 카드에 뜬다).
     * openedAt 은 이번 세대가 열린 시각 — 시작된 경기를 가려낼 때 기준이 된다.
     */
    private async liveInviteGeneration(code: string): Promise<{ hostId: string; openedAt: Date; guestIds: string[] } | null> {
        const rows = await db.select().from(hiqInvites).where(and(
            eq(hiqInvites.code, code),
            ne(hiqInvites.status, "expired"),
            gt(hiqInvites.expiresAt, new Date()),
        )).orderBy(asc(hiqInvites.createdAt));
        if (rows.length === 0) return null;
        const hostId = String(rows[rows.length - 1].hostId);
        const mine = rows.filter((r) => String(r.hostId) === hostId);
        const guestIds: string[] = [];
        for (const r of mine) {
            const g = r.guestId ? String(r.guestId) : null;
            // 같은 사람이 두 번 눌러 행이 둘이 될 수 있다(joinInvite 의 경합 분기) — 사람 수로 센다.
            if (g && g !== hostId && !guestIds.includes(g)) guestIds.push(g);
        }
        return { hostId, openedAt: mine[0].createdAt as Date, guestIds };
    }

    /**
     * 이 호스트가 그 시각 이후로 실전 경기를 시작했나.
     * /game/start 는 재시도 안전을 위해 **초대를 소비하지 않는다**(소비는 종료 때) — 그래서 invite 행만 보면
     * 이미 시작해 점수를 치고 있는 판도 "아직 모집 중"으로 보인다. 시작 시각으로 가려낸다.
     * ⚠️ 기준 시각은 반드시 '이번 세대가 열린 시각'이다. 그냥 '진행 중 경기가 있나'로 물으면, 어제 끝내지 않고
     * 남겨 둔 판 하나 때문에 방금 올린 카드가 태어나자마자 죽은 카드로 그려진다.
     */
    private async hasHostGameSince(hostId: string, since: Date): Promise<boolean> {
        const [g] = await db.select({ id: hiqGames.id }).from(hiqGames).where(and(
            eq(hiqGames.player1Id, hostId),
            inArray(hiqGames.status, ["playing_base", "playing_finish"]),
            inArray(hiqGames.gameType, ["3c", "4c"]),
            gt(hiqGames.playedAt, since),
        )).limit(1);
        return !!g;
    }

    /**
     * 카드를 올릴 때 다시 쓸, 살아 있는 내 핀 하나(없으면 null).
     * 매번 새로 만들면 앞서 올린 카드의 코드가 참가자 없는 방을 가리켜, 카드 두 장이 서로 다른 대기실이 된다
     * (온라인 대전 카드가 내 대기 방을 다시 쓰는 것과 같은 규칙).
     * '살아 있다' = 만료 전 + 소비 안 됨(consumeInvites 가 status 를 expired 로, expiresAt 을 now 로 당긴다)
     *              + 그 핀으로 경기가 아직 시작되지 않음.
     * ⚠️ status='pending' 행만 찾으면 안 된다 — 첫 게스트가 들어오는 순간 joinInvite 가 바로 그 pending 행을
     * accepted 로 바꿔 버려서, 한 명이라도 앉은 뒤에 올리는 카드는 늘 새 코드를 만들게 된다.
     */
    async getLivePendingInvite(hostId: string, sport: "BILLIARDS" | "GOLF" = "BILLIARDS"): Promise<string | null> {
        const [row] = await db.select({ code: hiqInvites.code }).from(hiqInvites).where(and(
            eq(hiqInvites.hostId, hostId),
            eq(hiqInvites.sportCategory, sport),
            ne(hiqInvites.status, "expired"),
            gt(hiqInvites.expiresAt, new Date()),
        )).orderBy(desc(hiqInvites.createdAt)).limit(1);
        if (!row) return null;
        const gen = await this.liveInviteGeneration(String(row.code));
        if (!gen || gen.hostId !== hostId) return null;
        if (await this.hasHostGameSince(gen.hostId, gen.openedAt)) return null;
        return String(row.code);
    }

    /**
     * 카드가 3초마다 묻는 대기실 상태. 죽은 코드도 404 가 아니라 alive:false 로 답한다 — 카드는 사라지지 않고
     * "끝난 대결"로 그려져야 하기 때문이다.
     *  · joined — 앉은 사람 수, **호스트 포함**(카드가 "n/seats 참가"로 그린다. 자리 수 seats 에 호스트가 들어간다).
     *  · names  — 참가한 게스트 이름들(호스트 이름은 카드 metadata 의 hostName 에 이미 있다).
     *  · mine   — 내가 게스트로 이미 앉았나.
     * 방 사람 누구나 부를 수 있다 — 이름은 채팅에서 이미 보이므로 새로 흘리는 정보가 없다(이름 말고는 싣지 않는다).
     */
    async getMatchInviteCardStatus(code: string, viewerId: string): Promise<{ alive: boolean; joined: number; names: string[]; mine: boolean; hostId: string }> {
        const gen = await this.liveInviteGeneration(code);
        if (!gen) {
            // 만료·소비된 코드. 누구 카드였는지는 알려 준다(화면이 "내 카드"를 구분한다).
            const [last] = await db.select({ hostId: hiqInvites.hostId }).from(hiqInvites)
                .where(eq(hiqInvites.code, code)).orderBy(desc(hiqInvites.createdAt)).limit(1);
            return { alive: false, joined: 0, names: [], mine: false, hostId: last ? String(last.hostId) : "" };
        }
        let names: string[] = [];
        if (gen.guestIds.length > 0) {
            const people = await db.select({ id: hiqMembers.id, name: hiqMembers.name })
                .from(hiqMembers).where(inArray(hiqMembers.id, gen.guestIds));
            const byId = new Map(people.map((p) => [String(p.id), p.name]));
            // 들어온 순서 그대로 — 카드가 이름을 줄로 이어 붙인다.
            names = gen.guestIds.map((id) => byId.get(id)).filter((n): n is string => !!n);
        }
        const started = await this.hasHostGameSince(gen.hostId, gen.openedAt);
        return {
            alive: !started,
            joined: gen.guestIds.length + 1,
            names,
            mine: gen.guestIds.includes(viewerId),
            hostId: gen.hostId,
        };
    }

    /**
     * 진행 중인 경기를 버린다 — 기록·RP 없이 행을 지운다.
     * 유저 건의(2026-09-03): 잘못 시작한 경기가 "진행 중"으로 영원히 남아, 없애려면 억지로
     * 점수를 채워 FINISH 를 누르는 수밖에 없었고 그게 랭킹 기록으로 남았다.
     * 끝난 경기는 지우지 않는다(이미 RP·전적에 반영됨). 전적 행은 미종료 경기엔 없지만
     * 방어적으로 같이 지운다.
     */
    async discardGame(gameId: string): Promise<boolean> {
        return await db.transaction(async (tx) => {
            const [g] = await tx.select({ id: hiqGames.id, status: hiqGames.status })
                .from(hiqGames).where(eq(hiqGames.id, gameId));
            if (!g || g.status === "finished") return false;
            await tx.delete(hiqGameHistory).where(eq(hiqGameHistory.gameId, gameId));
            await tx.delete(hiqGames).where(eq(hiqGames.id, gameId));
            return true;
        });
    }

    /**
     * 어드민 전용: **끝난 경기**를 지운다(2026-09-12). 회원용 DELETE /game/:id 는 진행 중인 경기만 지운다 —
     * 끝난 경기는 RP·전적에 이미 반영돼서 참가자가 마음대로 지우면 안 되기 때문이다. 그런데 잘못 눌러
     * 만든 판을 억지로 끝낸 기록(예: 1이닝 16점)이 에버리지·하이런·랭킹을 오염시키는 일이 실제로 있었고,
     * 그때마다 DB 를 직접 건드려야 했다. 그 작업을 순서·되돌리기까지 포함해 한 곳에 둔다.
     *
     * 지우는 순서는 자식 → 부모다: hiq_game_history → hiq_games (반대로 하면 FK 위반).
     * 되돌릴 것이 세 가지 있고, 셋 다 자동으로는 복구되지 않는다:
     *   1) RP — 증감식이라 넣은 값을 그대로 빼야 한다(rpDeltaFor 를 종료 훅과 공유). 단, 종료 당시의
     *      핸디가 지금과 다르거나 그때 0 에서 잘렸다면 정확히 원상복구되지 않는다 — 결과에 그대로 적어 돌려준다.
     *   2) 에버리지 — _updateUserAverage 는 그 종목 기록이 0건이면 조기 반환이라 값이 남는다. 여기서는
     *      0건이면 0 으로 되돌리는 _recomputeUserAverage 를 쓴다.
     *   3) 하이런·승수 — 전적 행에서 다시 계산되는 값이라 행만 지우면 따라온다.
     *
     * 대진표(hiq_crew_tournament_matches)에 연결된 경기는 지우지 않는다(409). 대진 승패까지 건드리는
     * 일이라 자동으로 판단할 수 없다 — 크루장이 대진을 먼저 정리해야 한다.
     */
    async adminDeleteFinishedGame(gameId: string): Promise<AdminGameDeleteResult> {
        const game = await this.getHiqGameById(gameId);
        if (!game) return { ok: false, reason: "not-found" };

        const [linked] = await db.select({ n: sql<number>`count(*)::int` })
            .from(hiqCrewTournamentMatches).where(eq(hiqCrewTournamentMatches.gameId, gameId));
        if ((linked?.n ?? 0) > 0) return { ok: false, reason: "tournament" };

        const gameType = game.gameType as "3c" | "4c";
        const memberIds = [game.player1Id, game.player2Id, game.player3Id, game.player4Id]
            .filter((id): id is string => !!id);
        const before = await this._memberStatsFor(memberIds, gameType);

        const rolledBack: Record<string, number> = {};
        await db.transaction(async (tx) => {
            await tx.delete(hiqGameHistory).where(eq(hiqGameHistory.gameId, gameId));
            await tx.delete(hiqGames).where(eq(hiqGames.id, gameId));

            if (game.isRanked) {
                const ratingField = gameType === "3c" ? "rating3c" : "rating4c";
                const handiField = gameType === "3c" ? "handi3c" : "handi4c";
                for (const pid of memberIds) {
                    const [p] = await tx.select().from(hiqMembers).where(eq(hiqMembers.id, pid));
                    if (!p) continue;
                    const delta = rpDeltaFor(gameType, game.winnerId === pid, (p as any)[handiField] || 0);
                    rolledBack[pid] = -delta;
                    if (delta === 0) continue;
                    await tx.update(hiqMembers)
                        .set({ [ratingField]: sql`GREATEST(0, ${hiqMembers[ratingField]} - ${delta})` })
                        .where(eq(hiqMembers.id, pid));
                }
            }
        });

        // 커밋 뒤에 돌려야 방금 지운 행이 집계에서 빠진다.
        for (const pid of memberIds) await this._recomputeUserAverage(pid, gameType);
        const after = await this._memberStatsFor(memberIds, gameType);

        return {
            ok: true,
            game: {
                id: game.id, gameType, gameMode: game.gameMode, isRanked: game.isRanked,
                playedAt: game.playedAt ? new Date(game.playedAt).toISOString() : null,
                players: memberIds.map((id) => before.find((b) => b.id === id)?.name ?? id),
            },
            members: before.map((b) => ({
                id: b.id, name: b.name,
                rpRolledBack: rolledBack[b.id] ?? 0,
                before: b, after: after.find((a) => a.id === b.id) ?? b,
            })),
        };
    }

    /** 어드민 화면용: 한 회원의 최근 경기(끝난 것·진행 중 모두). 지울 판을 눈으로 고르는 용도다. */
    async adminMemberGames(memberId: string, limit = 30) {
        const rows = await db.select().from(hiqGames)
            .where(or(
                eq(hiqGames.player1Id, memberId), eq(hiqGames.player2Id, memberId),
                eq(hiqGames.player3Id, memberId), eq(hiqGames.player4Id, memberId),
            ))
            .orderBy(desc(hiqGames.playedAt))
            .limit(Math.min(100, Math.max(1, limit)));

        return rows.map((g: any) => {
            const slot = [1, 2, 3, 4].find((n) => g[`player${n}Id`] === memberId) ?? 1;
            const others = [1, 2, 3, 4].filter((n) => n !== slot && g[`player${n}Id`]).map((n) => g[`player${n}Name`] || "상대");
            return {
                id: g.id,
                playedAt: g.playedAt,
                gameType: g.gameType,
                gameMode: g.gameMode,
                status: g.status,
                isRanked: g.isRanked,
                opponents: others.length ? others : [g[`player${slot === 1 ? 2 : 1}Name`] || "-"],
                score: g[`player${slot}Score`] ?? 0,
                target: g[`player${slot}Target`] ?? 0,
                highRun: g[`player${slot}HighRun`] ?? 0,
                innings: g.totalInnings ?? 0,
                isWinner: g.winnerId === memberId,
            };
        });
    }

    /** 삭제 전후 대조용 한 줄: 캐시된 RP·에버리지와, 전적 행에서 다시 센 값. */
    private async _memberStatsFor(memberIds: string[], type: "3c" | "4c") {
        if (memberIds.length === 0) return [];
        const members = await db.select().from(hiqMembers).where(inArray(hiqMembers.id, memberIds));
        const agg = await db.select({
            memberId: hiqGameHistory.memberId,
            games: sql<number>`count(*)::int`,
            score: sql<number>`coalesce(sum(${hiqGameHistory.score}),0)::int`,
            innings: sql<number>`coalesce(sum(${hiqGameHistory.innings}),0)::int`,
            wins: sql<number>`coalesce(sum(case when ${hiqGameHistory.isWinner} then 1 else 0 end),0)::int`,
            highRun: sql<number>`coalesce(max(${hiqGameHistory.highRun}),0)::int`,
        })
            .from(hiqGameHistory)
            .where(and(
                inArray(hiqGameHistory.memberId, memberIds),
                eq(hiqGameHistory.gameType, type),
                eq(hiqGameHistory.gameMode, "match"),
                eq(hiqGameHistory.isRanked, true),
            ))
            .groupBy(hiqGameHistory.memberId);

        return members.map((m: any) => {
            const a = agg.find((x) => x.memberId === m.id);
            return {
                id: m.id as string,
                name: (m.name as string) ?? "",
                rating: (type === "3c" ? m.rating3c : m.rating4c) ?? 0,
                avg: Number((type === "3c" ? m.avg3c : m.avg4c) ?? 0),
                games: a?.games ?? 0,
                wins: a?.wins ?? 0,
                highRun: a?.highRun ?? 0,
            };
        });
    }

    /**
     * _updateUserAverage 와 같은 산식이되, 그 종목 기록이 0건이면 **0 으로 되돌린다**.
     * _updateUserAverage 는 0건이면 조기 반환이라, 기록을 지워도 캐시된 에버리지가 그대로 남는다.
     */
    async _recomputeUserAverage(memberId: string, type: "3c" | "4c") {
        const history = await this.getMemberGameHistory(memberId);
        const filtered = history.filter(h => h.gameType === type && h.gameMode === "match" && h.isRanked);
        const totalScore = filtered.reduce((acc, h) => acc + (h.score || 0), 0);
        const totalInnings = filtered.reduce((acc, h) => acc + (h.innings || 0), 0);
        const totalAvg = totalInnings > 0 ? totalScore / totalInnings : 0;
        const avgField = type === "3c" ? "avg3c" : "avg4c";
        await db.update(hiqMembers)
            .set({ [avgField]: totalAvg, average: totalAvg.toFixed(3), updatedAt: new Date() })
            .where(eq(hiqMembers.id, memberId));
    }

    // --- Private Helper ---
    async _updateUserAverage(memberId: string, type: "3c" | "4c") {
        const history = await this.getMemberGameHistory(memberId);

        // 랭킹·대시보드·전적 분석은 전부 "랭킹전만"을 기준으로 집계한다. 여기만 연습경기까지
        // 포함하고 있어서 캐시된 에버리지가 다른 화면과 어긋났고, 그 값으로 상대 다마수를
        // 뽑으니 목표점수까지 틀어졌다. 필터를 다른 집계와 동일하게 맞춘다.
        const filtered = history.filter(h => h.gameType === type && h.gameMode === "match" && h.isRanked);
        if (filtered.length === 0) return;

        // 에버리지 = 총 득점 / 총 이닝. 경기별 평균을 다시 산술평균하면 2이닝짜리 경기와
        // 40이닝짜리 경기가 같은 무게로 들어가 짧은 경기의 운이 그대로 실력으로 굳는다.
        // (파울 감점으로 score가 음수인 경기도 그대로 합산한다 — 의도된 동작이다.)
        const totalScore = filtered.reduce((acc, h) => acc + (h.score || 0), 0);
        const totalInnings = filtered.reduce((acc, h) => acc + (h.innings || 0), 0);
        if (totalInnings <= 0) return;

        const totalAvg = totalScore / totalInnings;
        const avgField = type === "3c" ? "avg3c" : "avg4c";

        // Also refresh the generic `average` column. It was never written here, yet it is the
        // field the match lobby and the ranking cards read — which is why every opponent was
        // handicapped off a stale default and rankings showed "평균 0.000".
        //
        // ⚠️ 주의: `average`는 종목 구분이 없는 공용 컬럼이라 3구/4구 중 "마지막에 친 종목"의
        // 값이 남는다. 4구를 치면 4구 에버리지가, 3구를 치면 3구 에버리지가 덮어써진다.
        // 지금은 crew.repo(크루 랭킹), getInviteStatus(대기실), 파트너 대시보드가 이 컬럼을
        // 읽고 있어서 그냥 지우면 그 화면들이 전부 0으로 죽는다. 제대로 고치려면 읽는 쪽을
        // avg3c/avg4c로 옮긴 뒤 이 줄을 제거해야 한다.
        await db.update(hiqMembers)
            .set({ [avgField]: totalAvg, average: totalAvg.toFixed(3), updatedAt: new Date() })
            .where(eq(hiqMembers.id, memberId));
    }
}
