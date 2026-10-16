/**
 * 어드민 · 골프 › 보상 맞춰 보기(2026-10-17, shared/golfAwardAudit 머리말). 받은 기록(golf_stamp_awards)을 지금 판정(golf.repo golfAwardsDue)과 견준다.
 * 판정은 부르는 쪽이 넘긴다(라우트가 storage.golf.golfAwardsDue) — 이 파일이 저장소 묶음을 들여오지 않게.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { listStampAwards } from "./golfStampAwards.js";
import { stampAwardId, type StampAwardDue } from "../../shared/golfStampAwards.js";
import { canTakeBackGolf, golfAwardLabel, type GolfAwardAuditMember, type GolfAwardSweep } from "../../shared/golfAwardAudit.js";

type Due = (memberId: string) => Promise<StampAwardDue[]>;
const rowsOf = (r: any) => (r.rows ?? r) as any[];
/** 한 번에 맞춰 보는 시간 — 함수 한도(10초) 안에서 */
const SWEEP_BUDGET_MS = 7_000;

export async function auditGolfAwards(memberId: string, due: Due, nowMs = Date.now()): Promise<GolfAwardAuditMember | null> {
    const [m] = rowsOf(await db.execute(sql`select name from hiq_members where id = ${memberId}::uuid`));
    if (!m) return null;
    const [held, grants, dueList] = await Promise.all([
        listStampAwards(memberId),
        db.execute(sql`select item from hiq_goods_grants where member_id = ${memberId}::uuid and sport = 'golf' and revoked_at is null`).then(rowsOf).catch(() => [] as any[]),
        due(memberId),
    ]);
    const granted = new Set(grants.map((g) => String(g.item)));
    const want = new Set(dueList.map((d) => stampAwardId(d.kind, d.key)));
    const rows = held.map((h) => ({ id: h.id, kind: h.kind, key: h.key, serial: h.serial, earnedAt: new Date(h.earnedAt).toISOString(), granted: granted.has(h.id), supported: want.has(h.id), ...golfAwardLabel(h.id, nowMs) }));
    const have = new Set(held.map((h) => h.id));
    return { memberId, name: String(m.name ?? ""), rows, unsupported: rows.filter(canTakeBackGolf).length, dueNotHeld: [...want].filter((id) => !have.has(id)).length };
}

/** 받은 사람마다 맞춰 본다 — 시간 안에 못 본 사람은 pending 으로(화면이 열 때 한 사람씩 맞춰 본다) */
export async function sweepGolfAwards(due: Due): Promise<GolfAwardSweep> {
    const holders = rowsOf(await db.execute(sql`select a.member_id::text as id, m.name, count(*)::int as n, max(a.earned_at) as last
        from golf_stamp_awards a left join hiq_members m on m.id = a.member_id group by a.member_id, m.name order by last desc`));
    const t0 = Date.now();
    const members: GolfAwardAuditMember[] = [], failed: { memberId: string; name: string }[] = [], pending: GolfAwardSweep["pending"] = [];
    for (const h of holders) {
        const id = String(h.id);
        if (Date.now() - t0 > SWEEP_BUDGET_MS) { pending.push({ memberId: id, name: String(h.name ?? ""), held: Number(h.n) || 0 }); continue; }
        try {
            const a = await auditGolfAwards(id, due);
            if (a) members.push(a);
        } catch (e) {
            console.error("[admin] golf awards audit", id, (e as Error)?.message);
            failed.push({ memberId: id, name: "" });
        }
    }
    if (failed.length) {
        const names = rowsOf(await db.execute(sql`select id::text as id, name from hiq_members where id in (${sql.join(failed.map((f) => sql`${f.memberId}::uuid`), sql`, `)})`));
        for (const f of failed) f.name = String(names.find((n) => n.id === f.memberId)?.name ?? "");
    }
    return { members: members.sort((a, b) => b.unsupported - a.unsupported), failed, pending };
}

/** 받쳐 주지 않는 줄만 거둔다 — 다시 판정해서 확인. 거둔 이름표를 돌려준다 */
export async function takeBackGolfAwards(memberId: string, ids: readonly string[], due: Due): Promise<string[]> {
    const a = await auditGolfAwards(memberId, due);
    if (!a) return [];
    const allowed = new Map(a.rows.filter(canTakeBackGolf).map((r) => [r.id, r]));
    const pick = [...new Set(ids)].map((id) => allowed.get(id)).filter((r): r is NonNullable<typeof r> => !!r);
    if (!pick.length) return [];
    await db.execute(sql`delete from golf_stamp_awards where member_id = ${memberId}::uuid and (kind, key) in (${sql.join(pick.map((r) => sql`(${r.kind}, ${r.key})`), sql`, `)})`);
    return pick.map((r) => r.id);
}
