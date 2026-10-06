/**
 * 점수판 열기 — 목표 점수(다마수)를 숫자로 직접 치는 칸의 '글자 → 값' 규칙(2026-10-06).
 * 오너: "우리 점수판에 이거 지금 화살표로만 내리고 올리고 하는데 숫자로 입력 가능하게".
 *
 * 화면(client/src/components/hiq/dashboard/GameCreationModal.tsx)은 치는 동안의 글자를 따로 들고(빈 칸 허용),
 * 그 글자가 뜻하는 값은 여기 규칙으로만 정한다. 화면에 식을 흩어 두지 않으려고 순수 함수로 뺐다.
 *
 * 범위
 *  - 최소 1. 음수 '점수'는 정상이지만 '목표'가 0 이면 승리 조건이 없어진다(끝나지 않는 경기).
 *  - 최대 999. 서버(POST /api/hiq/game/start, server/routes/modules/game.ts)가 player{N}Target·targetScore 를
 *    Math.min(999, Math.max(0, Math.round(n))) 로 자른다. DB 칸(hiq_games.player{N}_target)은 integer 라 따로 상한이 없다.
 *    화면이 더 큰 수를 받으면 보이는 값과 저장되는 값이 갈리므로 서버와 같은 999 에서 멈춘다.
 */

/** 목표의 하한 — 0 은 승리 조건이 없다. */
export const TARGET_INPUT_MIN = 1;
/** 목표의 상한 — 서버 /game/start 가 자르는 값과 같다. */
export const TARGET_INPUT_MAX = 999;

/** 전각 숫자(０-９)는 반각으로 바꾸고, 숫자가 아닌 글자는 전부 버린다. */
function digitsOf(raw: string): string {
    return String(raw ?? "")
        .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/[^0-9]/g, "");
}

/**
 * 치는 동안 칸에 보여 줄 글자.
 *  - 숫자만 남긴다(한글·기호·공백·소수점·부호를 버린다 — 붙여넣기도 같은 길로 온다).
 *  - 앞자리 0 은 접는다("05" → "5", "000" → "0"). "0" 하나는 남긴다 — 지우고 다시 치는 중일 수 있다.
 *  - 최대값의 자릿수까지만 받는다(999 → 세 자리). 넘치는 뒷자리는 버린다 — 잘못 눌린 네 번째 숫자가 값을 바꾸지 않게.
 */
export function sanitizeTargetText(raw: string, max: number = TARGET_INPUT_MAX): string {
    const digits = digitsOf(raw);
    if (digits === "") return "";
    const maxLen = String(Math.max(1, Math.floor(max))).length;
    return digits.replace(/^0+(?=\d)/, "").slice(0, maxLen);
}

/**
 * 글자를 목표 값으로 확정한다.
 *  - 빈 칸·0 → 치기 전 값(prev)을 그대로 돌려준다(손대지 않는다).
 *  - 범위 밖 → 가까운 경계로 당긴다.
 */
export function commitTargetText(
    text: string,
    prev: number,
    min: number = TARGET_INPUT_MIN,
    max: number = TARGET_INPUT_MAX,
): number {
    const digits = digitsOf(text);
    if (digits === "") return prev;
    const n = Number(digits);
    if (n === 0) return prev;
    // 터무니없이 긴 숫자(Infinity)도 Math.min 이 상한으로 당긴다.
    return Math.min(max, Math.max(min, n));
}

/** 화살표 한 번 — ±1 하고 범위 안으로. 치던 글자가 있으면 먼저 commitTargetText 로 확정한 값을 넣는다. */
export function stepTarget(
    value: number,
    dir: -1 | 1,
    min: number = TARGET_INPUT_MIN,
    max: number = TARGET_INPUT_MAX,
): number {
    const cur = Number.isFinite(value) ? Math.round(value) : min;
    return Math.min(max, Math.max(min, cur + dir));
}
