/**
 * 크루 도장깨기의 저장(2026-10-12) — 규칙은 shared/golfCrewStamps, 표는 golf_crew_stamps · golf_crew_stamp_awards(migrations/golf_crew_stamps.sql).
 *
 *  - syncCrewStamps(crewId)         크루원의 인증 라운드에서 크루 도장을 다시 세어, 새 도장은 적고 있는 도장은 라운드 수 · 풀조만 올린다.
 *                                   **준 것은 거두지 않는다** — 처음 찍은 때는 안 고치고, 크루원이 나가도 도장은 남는다. 그 뒤 받을 깃발을 적는다.
 *  - syncCrewStampsForMember(id)    그 회원이 든 골프 크루마다(승인 대기 빼고). 부르는 곳: golf.repo updateGolfStats(끝내기 · 늦은 현장 인증).
 *  - listCrewStamps(crewId)         화면이 읽는다(읽기만).
 *  - crewsAtClub(clubIds)           골프장 페이지의 '이 골프장을 깬 크루'.
 * 표가 아직 없으면(배포 순서가 어긋났을 때) 빈 값으로 받는다 — 라운드 끝내기를 막지 않는다.
 */
import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../db.js";
import { golfCrewStampAwards, golfCrewStamps, hiqCrewMembers, hiqCrews, hiqGameHistory } from "../../shared/schema.js";
import { countsOnSite } from "../../shared/golfOnSite.js";
import { crewFlagId, crewFlagsDue, crewStampsFrom, type CrewFlagDue, type CrewFlagKind, type CrewStamp } from "../../shared/golfCrewStamps.js";

export interface CrewFlagRow {
    /** "flag:gangwon" · "flag:all-open" · "full:gangwon" */
    id: string;
    kind: CrewFlagKind;
    key: string;
    /** 그 깃발을 받은 순번(1 = 처음 받은 크루) */
    serial: number;
    earnedAt: Date;
}

const code = (e: any) => e?.code ?? e?.cause?.code;
const missingTable = (e: any) => code(e) === "42P01" || /relation "golf_crew_stamp(s|_awards)" does not exist/.test(String(e?.message ?? ""));
const serialClash = (e: any) => code(e) === "23505" && /golf_crew_stamp_awards_kind_key_serial_unique/.test(`${e?.constraint ?? ""} ${e?.cause?.constraint ?? ""} ${e?.message ?? ""} ${e?.cause?.message ?? ""}`);
const SERIAL_RETRIES = 4;
// 날짜는 ISO 글자로 넘겨 UTC 벽시계로 적는다 — JS Date 를 그대로 넘기면 돌리는 기계의 시간대에 따라 어긋난다
const iso = (ms: number) => new Date(ms).toISOString();

const toStamp = (r: { clubKey: string; clubId: string | null; clubName: string; firstAt: Date; fullAt: Date | null; rounds: number; most: number }): CrewStamp => ({
    clubKey: r.clubKey, clubId: r.clubId, name: r.clubName, firstAt: r.firstAt.getTime(), rounds: r.rounds, full: !!r.fullAt, fullAt: r.fullAt ? r.fullAt.getTime() : null, most: r.most,
});

async function storedStamps(crewId: string): Promise<CrewStamp[]> {
    const rows = await db.select({ clubKey: golfCrewStamps.clubKey, clubId: golfCrewStamps.clubId, clubName: golfCrewStamps.clubName, firstAt: golfCrewStamps.firstAt, fullAt: golfCrewStamps.fullAt, rounds: golfCrewStamps.rounds, most: golfCrewStamps.most })
        .from(golfCrewStamps).where(eq(golfCrewStamps.crewId, crewId)).orderBy(asc(golfCrewStamps.firstAt), asc(golfCrewStamps.clubName));
    return rows.map(toStamp);
}
async function storedFlags(crewId: string): Promise<CrewFlagRow[]> {
    const rows = await db.select({ kind: golfCrewStampAwards.kind, key: golfCrewStampAwards.key, serial: golfCrewStampAwards.serial, earnedAt: golfCrewStampAwards.earnedAt })
        .from(golfCrewStampAwards).where(eq(golfCrewStampAwards.crewId, crewId)).orderBy(asc(golfCrewStampAwards.earnedAt), asc(golfCrewStampAwards.createdAt));
    return rows.map((r) => ({ id: crewFlagId(r.kind as CrewFlagKind, r.key), kind: r.kind as CrewFlagKind, key: r.key, serial: r.serial, earnedAt: r.earnedAt }));
}

/** 크루의 도장과 깃발(얻은 순서). 표가 없으면 빈 목록 */
export async function listCrewStamps(crewId: string): Promise<{ stamps: CrewStamp[]; flags: CrewFlagRow[] }> {
    try {
        const [stamps, flags] = await Promise.all([storedStamps(crewId), storedFlags(crewId)]);
        return { stamps, flags };
    } catch (e) {
        if (missingTable(e)) return { stamps: [], flags: [] };
        throw e;
    }
}

/** 깃발 한 줄 — 이미 있으면 아무것도 하지 않고 null */
async function insertFlag(crewId: string, d: CrewFlagDue): Promise<CrewFlagRow | null> {
    for (let attempt = 0; ; attempt++) {
        try {
            const res: any = await db.execute(sql`
                insert into golf_crew_stamp_awards (crew_id, kind, key, serial, earned_at)
                select ${crewId}::uuid, ${d.kind}, ${d.key}, coalesce(max(serial), 0) + 1, (${iso(d.earnedAt)}::timestamptz at time zone 'UTC')
                from golf_crew_stamp_awards where kind = ${d.kind} and key = ${d.key}
                on conflict (crew_id, kind, key) do nothing
                returning serial`);
            const row = (res?.rows ?? res)?.[0];
            return row ? { id: crewFlagId(d.kind, d.key), kind: d.kind, key: d.key, serial: Number(row.serial), earnedAt: new Date(d.earnedAt) } : null;
        } catch (e) {
            // 같은 순간에 다른 크루가 같은 순번을 잡았다 — 다시 센다
            if (serialClash(e) && attempt < SERIAL_RETRIES) continue;
            throw e;
        }
    }
}

/**
 * 크루의 도장을 맞춘다. 새로 찍힌 도장과 새로 받은 깃발을 돌려준다.
 * 골프 크루가 아니면 아무것도 하지 않는다.
 */
export async function syncCrewStamps(crewId: string): Promise<{ fresh: CrewStamp[]; flags: CrewFlagRow[] }> {
    const none = { fresh: [] as CrewStamp[], flags: [] as CrewFlagRow[] };
    try {
        const [crew] = await db.select({ sport: hiqCrews.sportCategory }).from(hiqCrews).where(eq(hiqCrews.id, crewId));
        if (!crew || crew.sport !== "GOLF") return none;
        const members = await db.select({ memberId: hiqCrewMembers.memberId, joinedAt: hiqCrewMembers.joinedAt })
            .from(hiqCrewMembers).where(and(eq(hiqCrewMembers.crewId, crewId), ne(hiqCrewMembers.role, "pending")));
        // 혼자서는 크루 도장이 생기지 않는다
        if (members.length < 2) return none;
        const rows = await db.select({ sessionId: hiqGameHistory.golfSessionId, memberId: hiqGameHistory.memberId, at: hiqGameHistory.createdAt, clubId: hiqGameHistory.golfClubId, name: hiqGameHistory.locationName, onSite: hiqGameHistory.onSite })
            .from(hiqGameHistory)
            .where(and(inArray(hiqGameHistory.memberId, members.map((m) => m.memberId)), eq(hiqGameHistory.sportCategory, "GOLF" as any), isNotNull(hiqGameHistory.golfSessionId)));
        const due = crewStampsFrom(
            rows.filter((r) => countsOnSite(r.onSite)).map((r) => ({ sessionId: String(r.sessionId), memberId: r.memberId, at: r.at, clubId: r.clubId ?? null, name: r.name ?? "" })),
            members,
        );
        if (due.length === 0) return none;

        const have = new Map((await storedStamps(crewId)).map((s) => [s.clubKey, s]));
        const fresh: CrewStamp[] = [];
        for (const s of due) {
            const cur = have.get(s.clubKey);
            if (!cur) {
                const res: any = await db.execute(sql`
                    insert into golf_crew_stamps (crew_id, club_key, club_id, club_name, first_at, full_at, rounds, most)
                    values (${crewId}::uuid, ${s.clubKey}, ${s.clubId}, ${s.name}, (${iso(s.firstAt)}::timestamptz at time zone 'UTC'),
                            ${s.fullAt == null ? null : iso(s.fullAt)}::timestamptz at time zone 'UTC', ${s.rounds}, ${s.most})
                    on conflict (crew_id, club_key) do nothing returning id`);
                if ((res?.rows ?? res)?.[0]) fresh.push(s);
            } else if (s.rounds > cur.rounds || s.most > cur.most || (s.full && !cur.full)) {
                // 있는 도장 — 라운드 수 · 인원 · 풀조만 올린다. 처음 찍은 때는 안 고친다
                await db.execute(sql`
                    update golf_crew_stamps set rounds = greatest(rounds, ${s.rounds}), most = greatest(most, ${s.most}),
                           full_at = coalesce(full_at, ${s.fullAt == null ? null : iso(s.fullAt)}::timestamptz at time zone 'UTC'), updated_at = now()
                    where crew_id = ${crewId}::uuid and club_key = ${s.clubKey}`);
            }
        }

        // 깃발 — 적어 둔 도장(나간 크루원이 찍은 것까지) 기준으로
        const all = await storedStamps(crewId);
        const flagsDue = crewFlagsDue(all);
        const flags: CrewFlagRow[] = [];
        if (flagsDue.length > 0) {
            const got = new Set((await storedFlags(crewId)).map((f) => f.id));
            for (const d of flagsDue) {
                if (got.has(crewFlagId(d.kind, d.key))) continue;
                const row = await insertFlag(crewId, d);
                if (row) flags.push(row);
            }
        }
        return { fresh, flags };
    } catch (e) {
        if (missingTable(e)) return none;
        throw e;
    }
}

/** 그 회원이 든 골프 크루마다 도장을 맞춘다(승인 대기 빼고) */
export async function syncCrewStampsForMember(memberId: string): Promise<void> {
    const crews = await db.select({ id: hiqCrews.id })
        .from(hiqCrewMembers).innerJoin(hiqCrews, eq(hiqCrews.id, hiqCrewMembers.crewId))
        .where(and(eq(hiqCrewMembers.memberId, memberId), ne(hiqCrewMembers.role, "pending"), eq(hiqCrews.sportCategory, "GOLF")));
    for (const c of crews) await syncCrewStamps(c.id);
}

export interface CrewAtClub { crewId: string; name: string; emblem: string | null; firstAt: Date; full: boolean; rounds: number }
/** 이 골프장(원장 번호들)을 깬 크루 — 먼저 깬 순서. 표가 없으면 빈 목록 */
export async function crewsAtClub(clubIds: readonly string[], limit = 8): Promise<CrewAtClub[]> {
    const ids = Array.from(new Set(clubIds.filter(Boolean)));
    if (ids.length === 0) return [];
    try {
        const rows = await db.select({ crewId: golfCrewStamps.crewId, name: hiqCrews.name, emblem: hiqCrews.emblem, firstAt: golfCrewStamps.firstAt, fullAt: golfCrewStamps.fullAt, rounds: golfCrewStamps.rounds })
            .from(golfCrewStamps).innerJoin(hiqCrews, eq(hiqCrews.id, golfCrewStamps.crewId))
            .where(inArray(golfCrewStamps.clubId, ids)).orderBy(asc(golfCrewStamps.firstAt)).limit(limit * 2);
        // 원장이 두 줄인 골프장을 둘 다 친 크루는 한 번만
        const seen = new Set<string>();
        return rows.filter((r) => (seen.has(r.crewId) ? false : (seen.add(r.crewId), true))).slice(0, limit)
            .map((r) => ({ crewId: r.crewId, name: r.name, emblem: r.emblem, firstAt: r.firstAt, full: !!r.fullAt, rounds: r.rounds }));
    } catch (e) {
        if (missingTable(e)) return [];
        throw e;
    }
}
