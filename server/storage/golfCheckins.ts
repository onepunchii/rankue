/**
 * 현장 인증 확인 저장소(2026-09-30). 규칙은 shared/golfOnSite.ts, 표 설명은 shared/schema.ts golfRoundCheckins.
 *
 * 원칙
 *  - **좌표는 여기까지 오지 않는다.** 라우트가 받은 위치로 골프장까지 거리를 재고(judgeCheckin) 인증 여부·거리 구간만 넘긴다.
 *    오류 로그에도 요청 본문을 싣지 않는다.
 *  - 권한(그 경기 참가자인가)은 라우트(routes/modules/golf.ts loadMatch)가 본다. 경기 상태·유예 시간은 golf.repo 가
 *    경기 행을 잠그고 본다(끝내기와 확인이 엇갈려도 한쪽이 기다린다).
 *  - 표가 아직 없으면(42P01) 읽기는 빈 목록, 첫 쓰기는 표를 만들고 다시 한다(golf_round_photos 와 같은 방식,
 *    migrations/golf_onsite.sql). 운영 DB 에는 2026-09-30 미리 만들어 두었다.
 * 다른 저장소 모듈을 끌어오지 않는 잎 모듈 — golf.repo 가 이걸 쓴다(거꾸로는 안 된다: 순환 임포트).
 */
import { db } from "../db.js";
import { golfRoundCheckins } from "../../shared/schema.js";
import { asc, eq, sql } from "drizzle-orm";
import { isGuestId } from "../../shared/golfMatch.js";
import type { OnSiteBucket, OnSiteSource } from "../../shared/golfOnSite.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUndefinedCheckinTable = (e: any) =>
    (e?.code ?? e?.cause?.code) === "42P01" || /relation "golf_round_checkins" does not exist/.test(String(e?.message ?? ""));

let tableReady: Promise<unknown> | null = null;
export function ensureCheckinTable() {
    tableReady ??= (async () => {
        await db.execute(sql`
            create table if not exists golf_round_checkins (
              id uuid primary key default gen_random_uuid(),
              session_id uuid not null references golf_match_sessions(id) on delete cascade,
              member_id uuid not null references hiq_members(id) on delete cascade,
              verified boolean not null,
              distance_bucket text not null,
              source text not null,
              created_at timestamp not null default now()
            )
        `);
        await db.execute(sql`create index if not exists golf_round_checkins_session_idx on golf_round_checkins (session_id, created_at)`);
    })().catch((e) => { tableReady = null; throw e; });
    return tableReady;
}

/** 쓰기: 표가 없으면 만들고 한 번 더(트랜잭션째 다시 돈다) */
export async function withCheckinTable<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (e) {
        if (!isUndefinedCheckinTable(e)) throw e;
        await ensureCheckinTable();
        return await run();
    }
}

export interface CheckinRow { memberId: string; verified: boolean; bucket: OnSiteBucket; source: string; createdAt: Date }

const cols = {
    memberId: golfRoundCheckins.memberId,
    verified: golfRoundCheckins.verified,
    bucket: golfRoundCheckins.distanceBucket,
    source: golfRoundCheckins.source,
    createdAt: golfRoundCheckins.createdAt,
};

type Runner = Pick<typeof db, "select">;

/** 경기 한 판의 확인 전부(오래된 것부터). 표가 없으면 **던진다** — 트랜잭션 안(withCheckinTable 로 감싼 쓰기)에서 쓴다. */
export async function readCheckins(runner: Runner, sessionId: string): Promise<CheckinRow[]> {
    const rows = await runner.select(cols).from(golfRoundCheckins)
        .where(eq(golfRoundCheckins.sessionId, sessionId))
        .orderBy(asc(golfRoundCheckins.createdAt));
    return rows as CheckinRow[];
}

/** 경기 한 판의 확인 전부(오래된 것부터). 표가 없으면 빈 목록 — 트랜잭션 밖 읽기용. */
export async function listCheckins(sessionId: string, runner: Runner = db): Promise<CheckinRow[]> {
    try {
        return await readCheckins(runner, sessionId);
    } catch (e) {
        if (isUndefinedCheckinTable(e)) return [];
        throw e;
    }
}

/**
 * 트랜잭션 **안에서** 읽기 — 저장점(savepoint)으로 감싼다. 표가 없거나 읽다 실패해도 바깥 트랜잭션(끝내기)이 죽지 않는다.
 * 현장 인증은 덤이다: 이것 때문에 라운드를 못 끝내는 일은 없어야 한다(못 읽으면 기록 도장 — 30분 유예 안의 확인이 다시 올린다).
 */
export async function listCheckinsInTx(tx: any, sessionId: string): Promise<CheckinRow[]> {
    try {
        return await tx.transaction((sp: any) => readCheckins(sp, sessionId));
    } catch (e) {
        if (!isUndefinedCheckinTable(e)) console.error("[golf] onsite checkins read failed:", (e as Error)?.message);
        return [];
    }
}

export async function insertCheckin(tx: Pick<typeof db, "insert">, v: { sessionId: string; memberId: string; verified: boolean; bucket: OnSiteBucket; source: OnSiteSource }) {
    await tx.insert(golfRoundCheckins).values({
        sessionId: v.sessionId, memberId: v.memberId, verified: v.verified, distanceBucket: v.bucket, source: v.source,
    });
}

/** 경기의 실제 회원 번호(게스트·모양이 틀린 번호 제외) — 동반자 규칙이 이 사람들의 확인만 센다 */
export function realMemberIds(players: unknown): string[] {
    return (Array.isArray(players) ? players : [])
        .map((p: any) => String(p?.memberId ?? ""))
        .filter((mid) => !isGuestId(mid) && UUID_RE.test(mid));
}
