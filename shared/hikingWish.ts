/**
 * 가고 싶은 산(2026-10-13) — 골프장 상세의 '관심 등록'을 등산으로 옮긴 것. 산 화면에서 담아 두면 등산 홈에 모인다.
 * 알림을 보내지 않는다(산에는 '취소 티' 같은 것이 없다) — 담아 둔 목록과, 오르면 '다녀온 산'으로 바뀌는 표시뿐이다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */

/** 한 사람이 담을 수 있는 산의 수 */
export const HIKING_WISH_MAX = 100;

export const HIKING_WISH_LABEL = {
    add: "가고 싶은 산에 담기",
    added: "가고 싶은 산에 담았어요",
    shelf: "가고 싶은 산",
    empty: "산 화면에서 '가고 싶은 산에 담기'를 누르면 여기에 모여요.",
    full: `가고 싶은 산은 ${HIKING_WISH_MAX}곳까지 담을 수 있어요.`,
    done: "다녀온 산",
} as const;

/**
 * 홈에 놓는 순서 — 아직 안 오른 산이 먼저(새로 담은 것부터), 다녀온 산은 뒤로.
 * ids 는 새로 담은 것부터 온다(서버가 준 순서).
 */
export function orderWishes(ids: readonly string[], done: ReadonlySet<string>): string[] {
    return [...ids.filter((id) => !done.has(id)), ...ids.filter((id) => done.has(id))];
}
