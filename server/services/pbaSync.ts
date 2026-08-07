import { db } from "../db.js";
import { pbaPlayers, pbaSeasonRanks, umbRankings } from "../../shared/schema.js";
import { eq, isNull, sql } from "drizzle-orm";
import {
    fetchSeasonRanking, fetchPlayerDetail, sleep,
    PBA_FIRST_SEASON, type PbaLeague, type PbaRankRow,
} from "./pbaService.js";

// PBA 동기화 흐름
// - 주간 크론: 현재 시즌 랭킹 갱신 + 현재 시즌 등재 선수의 통산 스탯 갱신
// - 백필 스크립트: 2019~현재 전 시즌 + 전체 선수 상세 (fullBackfill=true)
// 상세 API 호출은 120ms 간격으로 던져 상대 서버를 존중한다.

const DETAIL_DELAY_MS = 120;

// 현재 "시즌 연도" — PBA 시즌은 6월경 개막하므로 1~5월엔 전년도 시즌이 진행 중이다
export function currentPbaSeason(now = new Date()): number {
    const y = now.getFullYear();
    return now.getMonth() + 1 >= 6 ? y : y - 1;
}

async function upsertSeason(league: PbaLeague, season: number, rawRows: PbaRankRow[]) {
    // 같은 응답에 중복 MemCode 가 오면 ON CONFLICT 가 "cannot affect row a second time" 으로
    // 터진다 — 마지막 행 우선으로 dedupe (상대 API 이상 응답 방어)
    const rows = [...new Map(rawRows.map((r) => [r.memCode, r])).values()];
    // 신규 선수 뼈대 upsert (상세는 별도 단계)
    for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        await db.insert(pbaPlayers)
            .values(chunk.map((r) => ({
                memCode: r.memCode, league, nameKo: r.nameKo, nameEn: r.nameEn, nationCode: r.nationCode,
            })))
            .onConflictDoUpdate({
                target: pbaPlayers.memCode,
                set: { nameKo: sql`excluded.name_ko`, nameEn: sql`excluded.name_en`, nationCode: sql`excluded.nation_code` },
            });
        await db.insert(pbaSeasonRanks)
            .values(chunk.map((r) => ({
                memCode: r.memCode, season, league,
                prizeRank: r.prizeRank, pointRank: r.pointRank, prize: r.prize, rankingPoint: r.rankingPoint,
            })))
            .onConflictDoUpdate({
                target: [pbaSeasonRanks.memCode, pbaSeasonRanks.season],
                set: {
                    prizeRank: sql`excluded.prize_rank`, pointRank: sql`excluded.point_rank`,
                    prize: sql`excluded.prize`, rankingPoint: sql`excluded.ranking_point`,
                    updatedAt: sql`now()`,
                },
            });
    }
}

async function refreshDetails(memCodes: string[]): Promise<number> {
    let updated = 0;
    for (const memCode of memCodes) {
        try {
            const d = await fetchPlayerDetail(memCode);
            if (d) {
                await db.update(pbaPlayers).set({
                    nameKo: d.nameKo, nameEn: d.nameEn, nationCode: d.nationCode, birthday: d.birthday,
                    average: d.average, bankShotRate: d.bankShotRate, highRun: d.highRun,
                    win: d.win, lose: d.lose, draw: d.draw, careerPrize: d.careerPrize,
                    updatedAt: new Date(),
                }).where(eq(pbaPlayers.memCode, memCode));
                updated++;
            } else {
                // 상세 미제공 선수도 updatedAt 을 전진시켜야 회전 슬롯을 상시 점유하지 않는다
                await db.update(pbaPlayers).set({ updatedAt: new Date() }).where(eq(pbaPlayers.memCode, memCode));
            }
        } catch (e) {
            console.warn(`[pba] detail 실패 ${memCode}:`, (e as Error)?.message);
            await db.update(pbaPlayers).set({ updatedAt: new Date() }).where(eq(pbaPlayers.memCode, memCode)).catch(() => { });
        }
        await sleep(DETAIL_DELAY_MS);
    }
    return updated;
}

// UMB 세계랭킹 교차 매칭 — 이름 토큰 집합이 정확히 일치하는 경우만.
// PBA "Daniel SANCHEZ" ↔ UMB "SANCHEZ Daniel" 처럼 어순만 다른 표기를 잡는다.
// 동명이인 위험이 있으므로 후보가 정확히 1명일 때만 연결한다.
const nameKey = (s: string) =>
    s.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(Boolean).sort().join("|");

export async function crossMatchUmb(): Promise<number> {
    const unmatched = await db.select({ memCode: pbaPlayers.memCode, nameEn: pbaPlayers.nameEn, league: pbaPlayers.league })
        .from(pbaPlayers).where(isNull(pbaPlayers.umbPlayerId));
    if (!unmatched.length) return 0;

    // PBA 쪽 동명이인 가드 — "김현우1/김현우2"처럼 이름키가 겹치는 선수는 어느 쪽의
    // UMB 기록인지 판별할 수 없으므로 둘 다 연결하지 않는다.
    const allPba = await db.select({ nameEn: pbaPlayers.nameEn }).from(pbaPlayers);
    const pbaKeyCount = new Map<string, number>();
    for (const p of allPba) {
        if (!p.nameEn) continue;
        const k = nameKey(p.nameEn);
        pbaKeyCount.set(k, (pbaKeyCount.get(k) ?? 0) + 1);
    }

    const umbNames = await db.selectDistinct({
        playerUmbId: umbRankings.playerUmbId, playerName: umbRankings.playerName,
        category: umbRankings.category, fed: umbRankings.fed,
    }).from(umbRankings);

    const byKey = new Map<string, { playerUmbId: string; category: string; fed: string }[]>();
    for (const u of umbNames) {
        const k = nameKey(u.playerName);
        if (!k) continue;
        const arr = byKey.get(k) ?? [];
        if (!arr.some((x) => x.playerUmbId === u.playerUmbId && x.category === u.category)) {
            arr.push({ playerUmbId: u.playerUmbId, category: u.category, fed: u.fed });
        }
        byKey.set(k, arr);
    }

    // 국적 정보도 매칭 조건에 쓴다 (memCode → nationCode)
    const nations = new Map(
        (await db.select({ memCode: pbaPlayers.memCode, nationCode: pbaPlayers.nationCode }).from(pbaPlayers))
            .map((r) => [r.memCode, r.nationCode]),
    );

    let matched = 0;
    for (const p of unmatched) {
        if (!p.nameEn) continue;
        if ((pbaKeyCount.get(nameKey(p.nameEn)) ?? 0) > 1) continue; // PBA 쪽 동명이인 — 판별 불가
        const nation = nations.get(p.memCode) ?? null;
        // 이름 일치 + 부문 일치(PBA→players, LPBA→ladies) + 국적 일치(양쪽 다 있을 때).
        // 실측된 오매칭 사례: ZAPATA(ES)↔ZAPATA(CO) 동명이인, LPBA 박정민↔남자부 PARK Jung-min.
        // juniors 는 제외 — 보유한 주니어 랭킹은 현재 회차라, 현역 프로가 동시에
        // 주니어 랭킹에 있을 수 없다(이름만 같은 유망주와의 오연결 실측: 이종훈↔#8010).
        const allowedCat = p.league === "LPBA" ? "ladies" : "players";
        const candidates = (byKey.get(nameKey(p.nameEn)) ?? [])
            .filter((c) => c.category === allowedCat)
            .filter((c) => !nation || !c.fed || c.fed === nation);
        const uniqueIds = new Set(candidates.map((c) => c.playerUmbId));
        if (uniqueIds.size !== 1) continue;
        const pick = candidates[0];
        await db.update(pbaPlayers)
            .set({ umbPlayerId: pick.playerUmbId, umbCategory: pick.category })
            .where(eq(pbaPlayers.memCode, p.memCode));
        matched++;
    }
    return matched;
}

export async function syncPba(opts: { fullBackfill?: boolean } = {}) {
    const current = currentPbaSeason();
    const seasons = opts.fullBackfill
        ? Array.from({ length: current - PBA_FIRST_SEASON + 1 }, (_, i) => PBA_FIRST_SEASON + i)
        : [current];

    const summary: Record<string, number> = {};
    const detailTargets = new Set<string>();

    for (const league of ["PBA", "LPBA"] as PbaLeague[]) {
        for (const season of seasons) {
            try {
                const rows = await fetchSeasonRanking(league, season);
                // 10명 미만이면 API 이상 응답으로 보고 기존 데이터를 보존한다 (UMB 파서와 같은 가드)
                if (rows.length < 10) {
                    if (rows.length > 0) console.warn(`[pba] ${league} ${season}: ${rows.length}행 — 이상 응답, 스킵`);
                    continue;
                }
                await upsertSeason(league, season, rows);
                summary[`${league}-${season}`] = rows.length;
                for (const r of rows) detailTargets.add(r.memCode);
            } catch (e) {
                // 한 리그·시즌 실패가 나머지 시즌·상세 회전·교차 매칭까지 죽이지 않게 격리
                console.warn(`[pba] ${league} ${season} 동기화 실패:`, (e as Error)?.message);
            }
            await sleep(300);
        }
    }

    // 크론(일간)은 서버리스 시간 제한 안에서 돌아야 하므로 상세 갱신을 회전식으로 제한 —
    // updatedAt이 가장 오래된 선수부터 60명씩. 등재 선수 ~250명이 4~5일 주기로 전부 갱신된다.
    let targets = [...detailTargets];
    if (!opts.fullBackfill) {
        if (targets.length === 0) {
            // 시즌 경계 공백(신시즌 랭킹 미발행) 중에도 통산 스탯 회전은 계속 돈다
            const stalest = await db.select({ memCode: pbaPlayers.memCode }).from(pbaPlayers)
                .orderBy(pbaPlayers.updatedAt).limit(60);
            targets = stalest.map((r) => r.memCode);
        } else if (targets.length > 60) {
            const stalest = await db.select({ memCode: pbaPlayers.memCode }).from(pbaPlayers)
                .where(sql`${pbaPlayers.memCode} IN ${targets}`)
                .orderBy(pbaPlayers.updatedAt).limit(60);
            targets = stalest.map((r) => r.memCode);
        }
    }

    const detailsUpdated = await refreshDetails(targets);
    const umbMatched = await crossMatchUmb();
    return { seasons: summary, detailsUpdated, umbMatched };
}
