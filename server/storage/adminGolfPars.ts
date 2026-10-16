/**
 * 어드민 · 골프 › 파 자동 반영(2026-10-17, shared/golfParWatch 머리말).
 * 읽기: 바뀐 기록(golf_par_changes) · 카드가 본 코스(golf_scan_courses — 사람 수 · 이름 · 운영자 계정뿐인가) · 잠근 코스.
 * 쓰기: 잠그기 · 풀기 · 되돌리기(되돌리면 잠근다 — 같은 카드 두 장이 쌓여 있어 다음 카드에 다시 바뀐다). 되돌리기는 운영자 손 수정과 같은 길(saveNinePars — 페이지 코스까지)을 쓴다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { courseKey, SCAN_PROMOTE_MEMBERS } from "../../shared/golfScorecardScan.js";
import { parseParLock, parsOf, parsKey, seenStatus, type ParChangeKind, type ParChangeRow, type ParLock, type ParWatch, type SeenCourseRow } from "../../shared/golfParWatch.js";
import { saveNinePars } from "./adminGolfCourses.js";
import { noteParChange } from "../services/golfScanRound.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const isoZ = (v: unknown) => (v == null ? "" : new Date(String(v)).toISOString());

export async function readParWatch(): Promise<ParWatch> {
    const [changes, seen, locked] = await Promise.all([
        db.execute(sql`
            select p.id::text as id, p.at, p.kind, p.club_id, k.name as club_name, p.course_id::text as course_id, p.course_name, p.from_pars, p.to_pars, p.members, p.by, p.reason,
                   c.pars as current, c.par_lock
            from golf_par_changes p
            left join rankue_golf_clubs k on k.id::text = p.club_id
            left join rankue_golf_courses c on c.id = p.course_id
            order by p.at desc, p.id desc limit 200`),
        db.execute(sql`
            select g.club_id, k.name as club_name, g.course_key, max(g.course_name) as course_name, g.pars_key,
                   count(distinct g.member_id)::int as members, sum(g.seen)::int as seen, max(g.last_seen) as last_seen,
                   array_agg(distinct coalesce(m.name, '?')) as names,
                   bool_and(coalesce(pr.role, '') in ('admin', 'super_admin')) as staff_only
            from golf_scan_courses g
            left join rankue_golf_clubs k on k.id::text = g.club_id
            left join hiq_members m on m.id::text = g.member_id
            left join profiles pr on pr.id = m.profile_id
            group by g.club_id, k.name, g.course_key, g.pars_key
            order by max(g.last_seen) desc limit 300`),
        db.execute(sql`
            select c.id::text as id, c.club_id::text as club_id, k.name as club_name, c.name, c.pars, c.par_lock
            from rankue_golf_courses c left join rankue_golf_clubs k on k.id = c.club_id
            where c.par_lock is not null order by c.par_lock->>'at' desc limit 300`),
    ]);
    const seenRows = rowsOf(seen);
    // 카드가 본 골프장의 명부 코스 — 이름 열쇠로 맞춘다(promoteSeenCourse 와 같은 courseKey)
    const clubIds = Array.from(new Set(seenRows.map((r) => String(r.club_id)))).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    const ledger = clubIds.length
        ? rowsOf(await db.execute(sql`select id::text as id, club_id::text as club_id, name, pars, par_lock from rankue_golf_courses
            where club_id in (${sql.join(clubIds.map((id) => sql`${id}::uuid`), sql`, `)})`))
        : [];
    const byKey = new Map(ledger.map((c) => [`${c.club_id}|${courseKey(c.name)}`, c]));
    return {
        promoteMembers: SCAN_PROMOTE_MEMBERS,
        changes: rowsOf(changes).map((r): ParChangeRow => ({
            id: String(r.id), at: isoZ(r.at), kind: String(r.kind) as ParChangeKind, clubId: String(r.club_id), clubName: r.club_name ?? null,
            courseId: r.course_id ?? null, courseName: String(r.course_name ?? ""), from: parsOf(r.from_pars), to: parsOf(r.to_pars),
            members: r.members == null ? null : Number(r.members), by: r.by ?? null, reason: r.reason ?? null,
            current: parsOf(r.current), lock: parseParLock(r.par_lock),
        })),
        seen: seenRows.flatMap((r): SeenCourseRow[] => {
            const pars = parsOf(r.pars_key);
            if (!pars) return [];
            const cur = byKey.get(`${r.club_id}|${r.course_key}`);
            const lock = parseParLock(cur?.par_lock);
            const current = parsOf(cur?.pars);
            const members = Number(r.members) || 0;
            return [{
                clubId: String(r.club_id), clubName: r.club_name ?? null, courseKey: String(r.course_key), courseName: String(r.course_name ?? ""), pars,
                members, memberNames: (Array.isArray(r.names) ? r.names : []).map(String).slice(0, 4), staffOnly: r.staff_only === true,
                seen: Number(r.seen) || 0, lastSeen: isoZ(r.last_seen), courseId: cur ? String(cur.id) : null, current, lock,
                status: seenStatus({ members, pars, current, courseExists: !!cur, locked: !!lock, promoteMembers: SCAN_PROMOTE_MEMBERS }),
            }];
        }),
        locked: rowsOf(locked).flatMap((r) => {
            const lock = parseParLock(r.par_lock);
            return lock ? [{ courseId: String(r.id), clubId: String(r.club_id), clubName: r.club_name ?? null, courseName: String(r.name ?? ""), pars: parsOf(r.pars), lock }] : [];
        }),
    };
}

async function courseRow(courseId: string): Promise<{ id: string; clubId: string; name: string; pars: number[] | null; lock: ParLock | null } | null> {
    const [c] = rowsOf(await db.execute(sql`select id::text as id, club_id::text as club_id, name, pars, par_lock from rankue_golf_courses where id = ${courseId}::uuid`));
    return c ? { id: String(c.id), clubId: String(c.club_id), name: String(c.name), pars: parsOf(c.pars), lock: parseParLock(c.par_lock) } : null;
}

/** 잠그기 · 풀기 — 이미 그 상태면 바꾸지 않는다(false) */
export async function setParLock(courseId: string, lock: ParLock | null): Promise<{ ok: boolean; course: NonNullable<Awaited<ReturnType<typeof courseRow>>> } | null> {
    const c = await courseRow(courseId);
    if (!c) return null;
    if (!!c.lock === !!lock) return { ok: false, course: c };
    await db.execute(lock
        ? sql`update rankue_golf_courses set par_lock = ${JSON.stringify(lock)}::jsonb where id = ${courseId}::uuid and par_lock is null`
        : sql`update rankue_golf_courses set par_lock = null where id = ${courseId}::uuid`);
    await noteParChange({ clubId: c.clubId, courseId, courseName: c.name, kind: lock ? "lock" : "unlock", from: c.pars ? parsKey(c.pars) : null, to: c.pars ? parsKey(c.pars) : null, by: lock?.by ?? null, reason: lock?.reason ?? null });
    return { ok: true, course: c };
}

export type RevertResult = { ok: true; courseName: string; from: number[]; to: number[] } | { ok: false; reason: "gone" | "not-fixed" | "changed" };

/** 카드가 바꾼 파를 바꾸기 전 값으로 — 지금 명부가 바뀐 값 그대로일 때만. 되돌리고 잠근다 */
export async function revertParChange(changeId: string, who: { by: string; reason: string }): Promise<RevertResult> {
    if (!/^\d+$/.test(changeId)) return { ok: false, reason: "gone" };
    const [p] = rowsOf(await db.execute(sql`select club_id, course_id::text as course_id, course_name, kind, from_pars, to_pars from golf_par_changes where id = ${changeId}::bigint`));
    if (!p || !p.course_id) return { ok: false, reason: "gone" };
    const from = parsOf(p.from_pars), to = parsOf(p.to_pars);
    if (p.kind !== "fixed" || !from || !to) return { ok: false, reason: "not-fixed" };
    const r = await saveNinePars(String(p.course_id), from, to);
    if (!r.ok) return { ok: false, reason: r.reason === "changed" ? "changed" : "gone" };
    await noteParChange({ clubId: String(p.club_id), courseId: String(p.course_id), courseName: String(p.course_name), kind: "reverted", from: parsKey(to), to: parsKey(from), by: who.by, reason: who.reason });
    const at = new Date().toISOString();
    await setParLock(String(p.course_id), { at, by: who.by, reason: `되돌림 — ${who.reason}` });
    return { ok: true, courseName: String(p.course_name), from: to, to: from };
}
