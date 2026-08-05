import { db } from "../db.js";
import {
    hiqMembers,
    hiqGames,
    hiqGameHistory,
    hiqSuccessfulShots,
    hiqInvites,
    hiqFriendships,
    profiles
} from "../../shared/schema.js";
import type {
    InsertHiqGame,
    HiqGame,
    HiqGameHistory,
    InsertHiqSuccessfulShot,
    HiqMember
} from "../../shared/schema.js";
import { eq, ne, desc, asc, and, or, sql, gt, inArray } from "drizzle-orm";
import { notFound } from "../utils/errors.js";

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

export class GameRepository {
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
        if (!currentGame) throw notFound("Game not found");

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
            const inningsOf = (inningData: unknown): number => {
                if (!Array.isArray(inningData) || inningData.length === 0) return totalInnings;
                // 한 선수의 이닝이 경기 전체 이닝을 넘을 수는 없다(깨진 페이로드 방어).
                return totalInnings > 0 ? Math.min(inningData.length, totalInnings) : inningData.length;
            };

            // 슬롯별 history 저장. 점수는 파울 감점으로 음수가 될 수 있으므로 클램프하지 않는다.
            const saveHistory = async (slot: 1 | 2 | 3 | 4, opponentName: string) => {
                const g = game as any;
                const memberId: string | null = g[`player${slot}Id`];
                if (!memberId) return;

                const score: number = g[`player${slot}Score`] ?? 0;
                const inningData = g[`player${slot}Innings`] ?? null;
                const innings = inningsOf(inningData);

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
            const calculateRpDelta = (isWinner: boolean, handi: number) => {
                if (isWinner) return 30;
                const h = handi || 0;
                if (game.gameType === "3c") {
                    if (h < 16) return 0;
                    if (h < 22) return -5;
                    return -15;
                } else {
                    if (h < 12) return 0;
                    if (h < 25) return -5;
                    return -15;
                }
            };

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
            if (!existing) throw notFound("Game not found");
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
            // 후공은 덜 칠 수 있으니 본인 이닝 배열 길이를 우선한다(finishHiqGame과 동일 규칙).
            const totalInnings = game.totalInnings ?? 0;
            const innings = Array.isArray(inningData) && inningData.length > 0
                ? (totalInnings > 0 ? Math.min(inningData.length, totalInnings) : inningData.length)
                : totalInnings;
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

    async recordSuccessfulShot(data: InsertHiqSuccessfulShot): Promise<any> {
        const [shot] = await db.insert(hiqSuccessfulShots).values(data).returning();
        return shot;
    }

    async searchSuccessfulShots(gameType: "3c" | "4c", currentPositions: any, limit: number = 5): Promise<any[]> {
        // Fetch a bounded pool of recent candidates, then rank by how closely their
        // stored ball layout matches the user's current layout. Distance math is done
        // in Node (ball-position keys are free-form jsonb entries, so summed-distance
        // SQL over jsonb would be brittle). Both sides are already in meters.
        const CANDIDATE_CAP = 300;
        const candidates = await db.select().from(hiqSuccessfulShots)
            .where(eq(hiqSuccessfulShots.gameType, gameType))
            .orderBy(desc(hiqSuccessfulShots.createdAt))
            .limit(CANDIDATE_CAP);

        // If the client sent no usable layout, fall back to the newest shots.
        if (!currentPositions || typeof currentPositions !== "object") {
            return candidates.slice(0, limit);
        }

        // Summed Euclidean distance over the ball keys common to both layouts.
        const layoutDistance = (a: any, b: any): number => {
            if (!a || !b || typeof a !== "object" || typeof b !== "object") return Infinity;
            let sum = 0;
            let matched = 0;
            for (const key of Object.keys(a)) {
                const pa = a[key];
                const pb = b[key];
                if (!pa || !pb) continue;
                if (typeof pa.x !== "number" || typeof pa.y !== "number") continue;
                if (typeof pb.x !== "number" || typeof pb.y !== "number") continue;
                const dx = pa.x - pb.x;
                const dy = pa.y - pb.y;
                sum += Math.sqrt(dx * dx + dy * dy);
                matched++;
            }
            return matched > 0 ? sum : Infinity;
        };

        // Summed-distance threshold (meters). Genuinely unrelated layouts are excluded;
        // the client shows a "조회 결과 없음" toast for an empty result.
        const MAX_DISTANCE = 1.5;

        return candidates
            .map(shot => ({ shot, distance: layoutDistance(currentPositions, (shot as any).ballPositions) }))
            .filter(entry => Number.isFinite(entry.distance) && entry.distance <= MAX_DISTANCE)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, limit)
            .map(entry => entry.shot);
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
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        await db.insert(hiqInvites).values({
            code,
            hostId,
            status: 'pending',
            expiresAt: new Date(Date.now() + 30 * 60 * 1000)
        });
        return code;
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
