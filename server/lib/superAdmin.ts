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
import { isConsoleRole } from "../../shared/adminRole.js";

export async function isSuperAdmin(memberId: string | undefined | null): Promise<boolean> {
    if (!memberId) return false;
    const [row] = await db.select({ role: profiles.role }).from(hiqMembers)
        .innerJoin(profiles, eq(profiles.id, hiqMembers.profileId))
        .where(eq(hiqMembers.id, memberId)).limit(1);
    return row?.role === "super_admin";
}

/** 그 회원의 역할(profiles.role) — 없으면 null */
export async function memberRoleOf(memberId: string | undefined | null): Promise<string | null> {
    if (!memberId) return null;
    const [row] = await db.select({ role: profiles.role }).from(hiqMembers)
        .innerJoin(profiles, eq(profiles.id, hiqMembers.profileId))
        .where(eq(hiqMembers.id, memberId)).limit(1);
    return row?.role ?? null;
}

/**
 * 채팅 · 글 거르기를 받지 않는 사람(2026-11-08 오너: "다대맨이 채팅 금지됐다는데 관리자는 금지 안 되게 해당 사항 없게 — 보기 관리자로 지정했어").
 * 슈퍼관리자와 관리자(보기 전용) 둘 다 — 채팅 금지 · 금칙어 · 연락처 가리기 · 자동 금지 셈을 건너뛴다.
 * ⚠️ 받는 사람 화면에서 **링크가 눌리는 글**은 여전히 슈퍼관리자 글뿐이다(isSuperAdmin · chat.repo trusted) — 피싱 통로를 넓히지 않는다.
 */
export async function isModerationExempt(memberId: string | undefined | null): Promise<boolean> {
    return isConsoleRole(await memberRoleOf(memberId));
}
