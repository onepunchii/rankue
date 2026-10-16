/**
 * 굿즈 · 배지 증정 저장소(2026-10-16) — 목록 shared/goods · 표 hiq_goods_grants(migrations/goods_grants.sql).
 *
 * 증정 = 그 종목의 받은 기록에 한 줄(몇 번째 주인인지 serial — 한정이면 그 수를 넘지 않는다) + 증정 기록 한 줄.
 *  - 이미 가진 것이면 넣지 않는다(have) · 다 나간 한정이면 넣지 않는다(soldOut).
 * 회수 = **증정한 줄만** — 받은 기록의 그 줄을 지우고 증정 기록에 회수한 때 · 사람 · 까닭을 적는다. 번호는 다시 쓰지 않는다
 *  (지운 번호가 가장 큰 번호였으면 다음 사람이 그 번호를 받을 수 있다 — 화면에 보이는 '몇 번째'가 겹치지 않는 것까지만 지킨다).
 * 각 종목의 자동 지급(판정 · 동기화)은 '아직 없는 것만' 더하므로 증정한 줄을 지우거나 바꾸지 않는다.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import { goodsItem, type GoodsOwned, type GoodsSport } from "../../shared/goods.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const code = (e: any) => e?.code ?? e?.cause?.code;
const utc = (d: Date) => sql`(${d.toISOString()}::timestamptz at time zone 'UTC')`;

/** 종목 → 받은 기록 표에서 그 굿즈 한 줄 */
function where(sport: GoodsSport, memberId: string, key: string): { table: SQL; match: SQL; insert: (serialFrom: SQL, cap: number, at: Date) => SQL } {
    if (sport === "billiards") return {
        table: sql`hiq_cue_case_awards`, match: sql`member_id = ${memberId}::uuid and item_id = ${key}`,
        insert: (_s, cap, at) => sql`insert into hiq_cue_case_awards (member_id, item_id, earned_at, serial)
            select ${memberId}::uuid, ${key}, ${utc(at)}, coalesce(max(serial), 0) + 1 from hiq_cue_case_awards where item_id = ${key}
            having coalesce(max(serial), 0) < ${cap} on conflict (member_id, item_id) do nothing returning serial`,
    };
    if (sport === "fishing") return {
        table: sql`fishing_decor_awards`, match: sql`member_id = ${memberId} and item_id = ${key}`,
        insert: (_s, cap) => sql`insert into fishing_decor_awards (member_id, item_id, serial)
            select ${memberId}, ${key}, coalesce(max(serial), 0) + 1 from fishing_decor_awards where item_id = ${key}
            having coalesce(max(serial), 0) < ${cap} on conflict (member_id, item_id) do nothing returning serial`,
    };
    const [kind, k] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const t = sport === "golf" ? sql`golf_stamp_awards` : sql`hiking_awards`;
    return {
        table: t, match: sql`member_id = ${memberId}::uuid and kind = ${kind} and key = ${k}`,
        insert: (_s, cap, at) => sql`insert into ${t} (member_id, kind, key, serial, earned_at)
            select ${memberId}::uuid, ${kind}, ${k}, coalesce(max(serial), 0) + 1, ${utc(at)} from ${t} where kind = ${kind} and key = ${k}
            having coalesce(max(serial), 0) < ${cap} on conflict (member_id, kind, key) do nothing returning serial`,
    };
}

export type GrantResult = { ok: true; id: string; serial: number } | { ok: false; reason: "item" | "have" | "soldOut" };

export async function grantGoods(o: { memberId: string; sport: GoodsSport; key: string; reason: string; message: string | null; notify: boolean; adminId: string | null; adminName: string }): Promise<GrantResult> {
    const item = goodsItem(o.sport, o.key);
    if (!item) return { ok: false, reason: "item" };
    const w = where(o.sport, o.memberId, o.key);
    const [have] = rowsOf(await db.execute(sql`select 1 from ${w.table} where ${w.match}`));
    if (have) return { ok: false, reason: "have" };
    const cap = item.limit ?? 2_147_483_647;
    let serial: number | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const [row] = rowsOf(await db.execute(w.insert(sql``, cap, new Date())));
            serial = row ? Number(row.serial) : null;
            break;
        } catch (e) {
            if (code(e) === "23505" && attempt < 4) continue; // 같은 순간 같은 번호 — 다시 센다
            throw e;
        }
    }
    if (serial == null) {
        const [again] = rowsOf(await db.execute(sql`select 1 from ${w.table} where ${w.match}`));
        return { ok: false, reason: again ? "have" : "soldOut" };
    }
    const [g] = rowsOf(await db.execute(sql`insert into hiq_goods_grants (member_id, sport, item, serial, reason, message, notified, admin_profile_id, admin_name)
        values (${o.memberId}::uuid, ${o.sport}, ${o.key}, ${serial}, ${o.reason}, ${o.message}, ${o.notify}, ${o.adminId}::uuid, ${o.adminName}) returning id`));
    return { ok: true, id: String(g.id), serial };
}

export type RevokeResult = { ok: true } | { ok: false; reason: "notFound" | "revoked" };
export async function revokeGrant(o: { grantId: string; reason: string; adminName: string }): Promise<RevokeResult> {
    const [g] = rowsOf(await db.execute(sql`select member_id, sport, item, revoked_at from hiq_goods_grants where id = ${o.grantId}::uuid`));
    if (!g) return { ok: false, reason: "notFound" };
    if (g.revoked_at) return { ok: false, reason: "revoked" };
    const w = where(g.sport as GoodsSport, String(g.member_id), String(g.item));
    await db.execute(sql`delete from ${w.table} where ${w.match}`);
    await db.execute(sql`update hiq_goods_grants set revoked_at = now(), revoked_by = ${o.adminName}, revoke_reason = ${o.reason} where id = ${o.grantId}::uuid`);
    return { ok: true };
}

/** 한 회원이 가진 것 — 네 종목의 받은 기록 + 그것이 증정한 것인지(회수하지 않은 증정) */
export async function ownedGoods(memberId: string): Promise<GoodsOwned[]> {
    const safe = async (q: SQL) => { try { return rowsOf(await db.execute(q)); } catch (e) { if (code(e) === "42P01") return []; throw e; } };
    const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());
    const [cue, fish, golf, hike, grants] = await Promise.all([
        safe(sql`select item_id as key, serial, earned_at from hiq_cue_case_awards where member_id = ${memberId}::uuid`),
        safe(sql`select item_id as key, serial, earned_at from fishing_decor_awards where member_id = ${memberId}`),
        safe(sql`select kind || ':' || key as key, serial, earned_at from golf_stamp_awards where member_id = ${memberId}::uuid`),
        safe(sql`select kind || ':' || key as key, serial, earned_at from hiking_awards where member_id = ${memberId}::uuid`),
        safe(sql`select id, sport, item, reason, admin_name, created_at from hiq_goods_grants where member_id = ${memberId}::uuid and revoked_at is null`),
    ]);
    const g = new Map(grants.map((r) => [`${r.sport}|${r.item}`, { id: String(r.id), reason: String(r.reason), adminName: String(r.admin_name ?? "관리자"), at: iso(r.created_at)! }]));
    const out: GoodsOwned[] = [];
    for (const [sport, rows] of [["billiards", cue], ["fishing", fish], ["golf", golf], ["hiking", hike]] as const) {
        for (const r of rows) out.push({ sport, key: String(r.key), serial: r.serial == null ? null : Number(r.serial), earnedAt: iso(r.earned_at), grant: g.get(`${sport}|${r.key}`) ?? null });
    }
    return out;
}
