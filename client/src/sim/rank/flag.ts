/**
 * 국가 코드(KR) → 국기 이모지. client/src/lib/flag.ts 와 같은 규칙이지만 여기 둔다 —
 * 시뮬레이터 테스트는 "@" 별칭을 타지 않아(vitest node 환경) 별칭 import 가 있으면 파일 전체가 안 열린다.
 */
export function rankFlag(cc?: string | null): string {
    const c = (cc ?? "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return "";
    return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + (ch.charCodeAt(0) - 65)));
}
