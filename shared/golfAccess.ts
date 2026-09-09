/**
 * 골프 접근 통제 — 화면과 서버가 **같은 판단**을 쓰도록 여기 하나에 둔다.
 *
 * 왜 필요했나: 예전엔 client/src/lib/features.ts 의 GOLF_ENABLED 하나로 화면만 가렸다.
 * 그런데 App.tsx 의 /golf/* 라우트에는 그 플래그가 안 걸려 있어서, 로그인한 사람이 주소만 치면
 * 골프 여권·부킹·코스 랭킹이 그대로 열렸다(2026-09-09 프로덕션 실측). 서버의 /api/hiq/golf/* 도 열려 있었다.
 * 화면만 가리는 잠금은 잠금이 아니다 — 그래서 서버까지 같은 목록으로 막는다.
 *
 * 오너 방침(2026-09-09): 골프와 당구는 아예 다른 플랫폼으로 본다. 지금은 시험 단계라
 * 허용 목록에 있는 사람만 골프에 들어간다. 전면 공개할 땐 GOLF_PUBLIC 을 true 로 한 번만 바꾼다.
 */

/** 전면 공개 스위치. true 면 아래 목록과 무관하게 모두 골프를 쓸 수 있다. */
export const GOLF_PUBLIC = false;

/** 시험 단계에서 골프를 쓸 수 있는 회원 전화번호(2026-09-09 오너 지정). */
export const GOLF_TESTER_PHONES: readonly string[] = ["01093740076"];

/** 전화번호는 저장 형태가 제각각이라(하이픈·국가번호) 숫자만 남겨 견준다. */
function digitsOnly(v: string | null | undefined): string {
    const d = (v ?? "").replace(/\D/g, "");
    // +82 10 1234 5678 → 821012345678 → 01012345678
    return d.startsWith("82") && d.length >= 11 ? "0" + d.slice(2) : d;
}

/** 이 회원이 골프를 쓸 수 있는가. 번호를 모르면(비로그인 등) 못 쓴다. */
export function golfAllowed(phone: string | null | undefined): boolean {
    if (GOLF_PUBLIC) return true;
    const p = digitsOnly(phone);
    if (!p) return false;
    return GOLF_TESTER_PHONES.some((t) => digitsOnly(t) === p);
}
