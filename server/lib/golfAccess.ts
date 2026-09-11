/**
 * 골프를 쓸 수 있는가 — **서버만** 안다(2026-09-11).
 *
 * 판단 기준은 회원 id 또는 프로필 id 다. 전화번호로 하면 안 된다: 가입(POST /auth/register)이 번호를
 * 확인하지 않아서, 허용된 번호를 적어 새로 가입하기만 하면 문이 열렸다(그 번호는 예전 공개 번들에 이미 실렸다).
 * 화면은 GET /api/hiq/me 의 golfAccess 값을 보고, 골프 라우트는 middleware/golfAccess.ts 가 같은 판단으로 막는다.
 *
 * 시험 참가자를 늘릴 땐 아래 목록에 넣거나, 코드를 안 고치고 환경변수 GOLF_TESTER_IDS(쉼표로 구분)에 더한다.
 */
import { GOLF_PUBLIC } from "../../shared/golfAccess.js";

/** 오너 계정(2026-09-09 오너 지정): 회원 id, 프로필 id. */
export const GOLF_TESTER_IDS: readonly string[] = [
    "02fce921-5170-4c0e-9cc2-5be2906f0bb0",
    "7f0612c3-b309-4780-921a-a3c201ef0252",
];

function testerIds(): Set<string> {
    const extra = (process.env.GOLF_TESTER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return new Set([...GOLF_TESTER_IDS, ...extra]);
}

/** 이 회원이 골프를 쓸 수 있는가. 회원을 모르면(비로그인 등) 못 쓴다. */
export function golfAllowed(member: { id?: string | null; profileId?: string | null } | null | undefined): boolean {
    if (GOLF_PUBLIC) return true;
    if (!member) return false;
    const ids = testerIds();
    return (!!member.id && ids.has(member.id)) || (!!member.profileId && ids.has(member.profileId));
}
