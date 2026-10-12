/**
 * 도장첩에서 받은 것(볼마커 · 트로피)의 기록 — golf_stamp_awards(2026-10-12).
 * 무엇을 언제 받았는지는 shared/golfStampAwards.stampAwardsDue 가 도장에서 계산하고, 여기는 **아직 안 적은 것만** 적는다.
 * 적을 때 그 종류의 순번(serial)이 붙는다 — "강원 도장첩 12번째 완성".
 *
 *  - 한 번 적은 줄은 고치지도 지우지도 않는다(나중에 기록이 지워져도 받은 것은 남는다).
 *  - 순번은 '지금까지 적힌 가장 큰 순번 + 1'. 두 사람이 같은 순간에 받으면 같은 순번을 잡을 수 있어 (kind, key, serial) 유일 제약을 두고,
 *    걸리면 다시 센다.
 *  - 표가 아직 없으면(42P01) 읽기 · 쓰기 모두 빈 목록 — 화면과 끝내기는 그대로 된다(순번만 안 적힌다). 생성 SQL: migrations/golf_stamp_awards.sql
 *
 * 부르는 곳: golf.repo updateGolfStats(라운드를 끝낼 때 · 늦은 현장 인증으로 기록이 올라갈 때) → syncStampAwards,
 *            GET /api/hiq/golf/stamp-awards → listStampAwards(읽기만).
 */
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { golfStampAwards } from "../../shared/schema.js";
import { stampAwardId, stampAwardsDue, type DatedStamp, type StampAwardDue, type StampAwardKind } from "../../shared/golfStampAwards.js";

export interface StampAwardRow {
    /** "book:gangwon" · "all:all-open" · "trophy:10" */
    id: string;
    kind: StampAwardKind;
    key: string;
    /** 그것을 받은 순번(1 = 처음) */
    serial: number;
    earnedAt: Date;
}

const code = (e: any) => e?.code ?? e?.cause?.code;
const missingTable = (e: any) => code(e) === "42P01" || /relation "golf_stamp_awards" does not exist/.test(String(e?.message ?? ""));
const serialClash = (e: any) => code(e) === "23505" && /golf_stamp_awards_kind_key_serial_unique/.test(`${e?.constraint ?? ""} ${e?.cause?.constraint ?? ""} ${e?.message ?? ""} ${e?.cause?.message ?? ""}`);
const SERIAL_RETRIES = 4;

/** 회원이 받은 것 전부(받은 순서). 표가 없으면 빈 목록 */
export async function listStampAwards(memberId: string): Promise<StampAwardRow[]> {
    try {
        const rows = await db.select({ kind: golfStampAwards.kind, key: golfStampAwards.key, serial: golfStampAwards.serial, earnedAt: golfStampAwards.earnedAt })
            .from(golfStampAwards).where(eq(golfStampAwards.memberId, memberId))
            .orderBy(asc(golfStampAwards.earnedAt), asc(golfStampAwards.createdAt));
        return rows.map((r) => ({ id: stampAwardId(r.kind as StampAwardKind, r.key), kind: r.kind as StampAwardKind, key: r.key, serial: r.serial, earnedAt: r.earnedAt }));
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}

/** 한 줄을 적는다 — 이미 있으면(같은 회원 · 같은 것) 아무것도 하지 않고 null */
async function insertAward(memberId: string, d: StampAwardDue): Promise<StampAwardRow | null> {
    // 날짜는 ISO 글자로 넘겨 UTC 벽시계로 적는다 — JS Date 를 그대로 넘기면 돌리는 기계의 시간대에 따라 어긋난다
    const at = new Date(d.earnedAt).toISOString();
    for (let attempt = 0; ; attempt++) {
        try {
            const res: any = await db.execute(sql`
                insert into golf_stamp_awards (member_id, kind, key, serial, earned_at)
                select ${memberId}::uuid, ${d.kind}, ${d.key}, coalesce(max(serial), 0) + 1, (${at}::timestamptz at time zone 'UTC')
                from golf_stamp_awards where kind = ${d.kind} and key = ${d.key}
                on conflict (member_id, kind, key) do nothing
                returning serial`);
            const row = (res?.rows ?? res)?.[0];
            return row ? { id: stampAwardId(d.kind, d.key), kind: d.kind, key: d.key, serial: Number(row.serial), earnedAt: new Date(d.earnedAt) } : null;
        } catch (e) {
            // 같은 순간에 다른 회원이 같은 순번을 잡았다 — 다시 센다
            if (serialClash(e) && attempt < SERIAL_RETRIES) continue;
            throw e;
        }
    }
}

/**
 * 회원의 인증 도장에서 받았어야 할 것 가운데 아직 안 적은 것을 적는다. 새로 적은 것을 돌려준다(받은 순서).
 * 받을 것이 없으면 표를 읽지도 않는다.
 */
export async function syncStampAwards(memberId: string, stamps: readonly DatedStamp[]): Promise<StampAwardRow[]> {
    const due = stampAwardsDue(stamps);
    if (due.length === 0) return [];
    try {
        const have = new Set((await db.select({ kind: golfStampAwards.kind, key: golfStampAwards.key }).from(golfStampAwards).where(eq(golfStampAwards.memberId, memberId)))
            .map((r) => stampAwardId(r.kind as StampAwardKind, r.key)));
        const fresh: StampAwardRow[] = [];
        for (const d of due) {
            if (have.has(stampAwardId(d.kind, d.key))) continue;
            const row = await insertAward(memberId, d);
            if (row) fresh.push(row);
        }
        return fresh;
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}
