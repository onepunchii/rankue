/**
 * 슈퍼 관리자 판정(2026-09-23 오너: "슈퍼 어드민은 모든 크루에 대한 모든 권한 — 가입 안 해도 게시판·채팅 내역을 본다").
 *
 * ⚠️ 판단은 **DB 의 profiles.role** 로만 한다. 전화번호·이메일을 코드에 적지 않는다 —
 * 2026-09-11 에 시험 참가자 번호 목록을 shared 에 두었다가 오너 개인 휴대폰 번호가 공개 JS 번들에 실린 적이 있다.
 * 권한을 주고 뺄 때는 이 파일이 아니라 그 회원의 profiles.role 을 바꾼다.
 */
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { hiqMembers, profiles } from "../../shared/schema.js";

export async function isSuperAdmin(memberId: string | undefined | null): Promise<boolean> {
    if (!memberId) return false;
    const [row] = await db.select({ role: profiles.role }).from(hiqMembers)
        .innerJoin(profiles, eq(profiles.id, hiqMembers.profileId))
        .where(eq(hiqMembers.id, memberId)).limit(1);
    return row?.role === "super_admin";
}
