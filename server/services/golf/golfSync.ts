/**
 * 골프 랭킹 동기화(2026-09-13). 크론(투어별 하루 1회)과 수동 스크립트(scripts/golf-sync-now.ts)가 같이 쓴다.
 *
 * 회차 규칙:
 *  - 세계 랭킹(owgr·rolex): 출처가 주는 회차 날짜. 이미 있으면 랭킹은 건너뛴다(선수 정보만 갱신).
 *  - 투어 랭킹(kpga·klpga): 오늘(KST)이 회차. 단 상위 300명의 순위·값 서명이 최신 회차와 같으면 새 회차를 만들지 않는다 —
 *    대회가 없는 날 매일 같은 스냅샷이 쌓여 순위 추이가 계단이 되는 걸 막는다. 기록(비거리 등)은 매번 통째로 바꾼다.
 *  - 한국 선수의 한글 이름(세계 랭킹은 로마자만 준다): KPGA 선수의 영문 이름과 맞춰 채운다(김시우 ← "Siwoo KIM"). 못 맞추면 그대로.
 */
import { storage } from "../../storage/index.js";
import { GOLF_TOUR_META, type GolfTour } from "../../../shared/golfTours.js";
import { editionSignature } from "./parse.js";
import { FETCHERS, type TourSnapshot } from "./sources.js";
import { db } from "../../db.js";
import { golfPlayers } from "../../../shared/schema.js";
import { and, eq, isNotNull } from "drizzle-orm";

export interface GolfSyncResult {
    tour: GolfTour; edition: string; newEdition: boolean; rows: number; players: number; stats: number; skipped?: string; error?: string;
}

/** "Siwoo KIM" / "Si Woo Kim" / "KIM Siwoo" → "kimsiwoo" (성·이름 순서 무관하게 글자만 정렬해 비교) */
export function nameKey(s: string): string {
    return s.toLowerCase().replace(/[^a-z]/g, "").split("").sort().join("");
}

async function koreanNameMap(): Promise<Map<string, string>> {
    const rows = await db.select({ nameEn: golfPlayers.nameEn, nameKo: golfPlayers.nameKo }).from(golfPlayers)
        .where(and(eq(golfPlayers.tour, "kpga"), isNotNull(golfPlayers.nameEn), isNotNull(golfPlayers.nameKo)));
    const m = new Map<string, string>();
    for (const r of rows) if (r.nameEn && r.nameKo) m.set(nameKey(r.nameEn), r.nameKo);
    return m;
}

export async function syncGolfTour(tour: GolfTour, opts: { force?: boolean } = {}): Promise<GolfSyncResult> {
    const snap: TourSnapshot = await FETCHERS[tour]();
    const meta = GOLF_TOUR_META[tour];

    // 한글 이름 채우기(세계 랭킹의 한국 선수)
    let rows = snap.rows;
    if (meta.world) {
        const ko = await koreanNameMap();
        if (ko.size) rows = rows.map((r) => (r.country === "KOR" && !r.nameKo ? { ...r, nameKo: ko.get(nameKey(r.playerName)) ?? null } : r));
    }

    let newEdition = false;
    let skipped: string | undefined;
    if (meta.world) {
        if (!opts.force && await storage.golfRank.hasEdition(tour, snap.edition)) skipped = `회차 ${snap.edition} 이미 있음`;
    } else if (!opts.force) {
        const sig = await storage.golfRank.latestSignature(tour);
        if (sig !== null && sig === editionSignature(rows)) skipped = "순위 변동 없음(서명 동일)";
    }
    if (!skipped) {
        await storage.golfRank.upsertEdition(tour, snap.edition, snap.editionDate, rows.map((r) => ({
            rank: r.rank, playerId: r.playerId, playerName: r.playerName, nameKo: r.nameKo, country: r.country,
            points: r.points, pointsTotal: r.pointsTotal, events: r.events, prevRank: r.prevRank, extra: r.extra ?? null,
        })));
        newEdition = true;
    }

    await storage.golfRank.upsertPlayers(snap.players);
    let statRows = 0;
    for (const s of snap.stats) statRows += await storage.golfRank.replaceStat(tour, snap.season, s.key, s.label, s.unit, s.rows);

    return { tour, edition: snap.edition, newEdition, rows: rows.length, players: snap.players.length, stats: statRows, skipped };
}

/** 여러 투어를 차례로. 한 투어가 실패해도 나머지는 돈다. */
export async function syncGolfTours(tours: readonly GolfTour[], opts: { force?: boolean } = {}): Promise<GolfSyncResult[]> {
    const out: GolfSyncResult[] = [];
    for (const tour of tours) {
        try {
            out.push(await syncGolfTour(tour, opts));
        } catch (e) {
            console.error(`[golf] ${tour} 동기화 실패:`, (e as Error)?.message);
            out.push({ tour, edition: "", newEdition: false, rows: 0, players: 0, stats: 0, error: (e as Error)?.message || String(e) });
        }
    }
    return out;
}
