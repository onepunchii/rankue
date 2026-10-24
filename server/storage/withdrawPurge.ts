/**
 * 탈퇴 정리 — 낚시 · 등산(2026-10-16 어드민 전수 조사에서 찾음).
 * 탈퇴하면 회원 행이 '탈퇴회원'으로 남아(user.repo deleteAccount) FK cascade 가 돌지 않는다. 그래서 낚시 조과(좌표 포함) · 사진 · 장비 · 장식과
 * 등산 표시 지점(정확한 위경도) · 정상 · 산행 · 목표 · 와펜이 그대로 남아 있었다. 사진 · 가고 싶은 산은 이미 따로 지운다(member.ts DELETE /me).
 *
 * 지운 조과의 사진 주소를 돌려준다 — 부르는 곳이 파일까지 지운다(deleteBlobs 는 우리 저장소 주소만 지운다).
 * 표가 없으면(42P01) 그 표만 건너뛴다. 하나가 실패해도 나머지는 지운다 — 탈퇴는 막지 않는다.
 * 크루의 것(정출 · 산악회 일정)은 크루의 기록이라 남긴다. 초대로 센 가입(hiq_referrals)은 남의 초대 수라 남기고, 내 초대 코드만 지운다.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const missingTable = (e: any) => (e?.code ?? e?.cause?.code) === "42P01";

export const WITHDRAW_PURGE_TABLES = [
    "fishing_catches", "fishing_gear", "fishing_decor_awards", "fishing_tanks", "hiq_invite_codes",
    "hiking_marks", "hiking_summits", "hiking_awards", "hiking_trips", "hiking_goals",
    "hiking_trail_checks", "hiking_trail_stamps", "hiking_summit_misses",
] as const;

export async function purgeFishingHiking(memberId: string): Promise<{ blobs: string[]; removed: Record<string, number> }> {
    const blobs: string[] = [];
    const removed: Record<string, number> = {};
    const run = async (table: (typeof WITHDRAW_PURGE_TABLES)[number], q: SQL) => {
        try {
            const rows = rowsOf(await db.execute(q));
            removed[table] = rows.length;
            for (const r of rows) for (const k of ["photo_url", "thumb_url"]) if (typeof r[k] === "string" && r[k]) blobs.push(r[k]);
        } catch (e) {
            if (!missingTable(e)) console.error(`[DeleteAccount] ${table}:`, (e as Error)?.message);
        }
    };
    // 낚시 — member_id 가 글자 칸이다
    await run("fishing_catches", sql`delete from fishing_catches where member_id = ${memberId} returning photo_url, thumb_url`);
    await run("fishing_gear", sql`delete from fishing_gear where member_id = ${memberId} returning id`);
    await run("fishing_decor_awards", sql`delete from fishing_decor_awards where member_id = ${memberId} returning item_id`);
    await run("fishing_tanks", sql`delete from fishing_tanks where member_id = ${memberId} returning member_id`);
    // 내 초대 코드 — 링크가 더는 나를 가리키지 않게
    await run("hiq_invite_codes", sql`delete from hiq_invite_codes where member_id = ${memberId}::uuid returning code`);
    // 등산 — 표시 지점에는 정확한 위경도가 있다
    await run("hiking_marks", sql`delete from hiking_marks where member_id = ${memberId}::uuid returning id`);
    await run("hiking_summits", sql`delete from hiking_summits where member_id = ${memberId}::uuid returning id`);
    await run("hiking_awards", sql`delete from hiking_awards where member_id = ${memberId}::uuid returning id`);
    await run("hiking_trips", sql`delete from hiking_trips where member_id = ${memberId}::uuid returning id`);
    await run("hiking_goals", sql`delete from hiking_goals where member_id = ${memberId}::uuid returning year`);
    // 코리아둘레길 코스 도장(10/21) — 좌표는 없지만 언제 어느 코스에 있었는지가 남는다
    await run("hiking_trail_checks", sql`delete from hiking_trail_checks where member_id = ${memberId}::uuid returning id`);
    await run("hiking_trail_stamps", sql`delete from hiking_trail_stamps where member_id = ${memberId}::uuid returning course_id`);
    // 정상 인증 실패(10/24) — 좌표는 없지만 언제 어느 산에 있었는지(혹은 가까웠는지)가 남는다
    await run("hiking_summit_misses", sql`delete from hiking_summit_misses where member_id = ${memberId}::uuid returning id`);
    return { blobs, removed };
}
