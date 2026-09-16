/**
 * 대전 채팅의 순수 규칙(2026-09-16 오너: "멀티가 너무 정적이다 … 일단 자유로운 챗이 가능하게").
 *
 * 왜 여기 모으나: 글자 수를 서버와 화면이 **같은 함수로 세야** 한다. 한쪽이 30자라 하고 다른 쪽이 29자라 하면
 * 사용자는 "보내기만 누르면 실패"를 겪는다. 특히 `String.length` 는 UTF-16 단위라 이모지 하나가 2로 세진다 —
 * 그래서 코드포인트로 센다.
 *
 * 규모 결정(오너 2026-09-16: "사람도 없으니 너무 빡빡하게는 말고, 그건 유저 많아지면 강화하자"):
 * 제한은 도배만 막는다. 횟수 상한은 사실상 안 걸리는 값이고, 화면에 남은 횟수를 세어 보여 주지 않는다 —
 * 아껴 쓰라고 숫자를 보여 주면 사람은 안 쓴다.
 */

/**
 * 1탭으로 보내는 고정 문구. 키보드를 **덜 열게** 하는 것이 목적이다 — 키보드는 어떻게 배치해도 화면의 40%를
 * 먹으므로, 가장 좋은 해결은 안 여는 것이다(2026-09-16 오너: "1.3 가자").
 *
 * 기존 여섯 개는 상단 띠의 이모지 인사와 같은 코드다(진행 중 대전 행에 그 코드가 들어 있어 이름을 못 바꾼다).
 * 여기에 **두 손으로 셀 만큼만** 더한다. 기준은 하나 — 자유 입력으로 치기엔 너무 급하거나 너무 자주 쓰는 말인가.
 *   · oops(아깝다)  : 상대가 놓친 직후 0.5초 안에 눌러야 하는 말. 타이핑하면 순간이 지나간다.
 *   · wait(잠깐만요): 자리를 떠야 하는 순간. 40초가 도는 중이고 세 번이면 실격패라, 이 한 줄이 상대의
 *                     시간 초과 신고를 멈춘다. 급함이 문자 그대로다.
 *   · thanks(고마워요): 굿샷·우와·화이팅을 받기만 하고 돌려줄 말이 없어 대화가 거기서 끊겼다.
 *
 * 처음엔 상단 띠의 이모지 바를 그대로 두고 여기만 늘렸는데, 2026-09-17 헤더 재설계에서 그 바를 없앴다 —
 * 지금은 이 목록이 고정 문구의 **유일한** 출처다(하단 한마디의 ☺ 판, 조준 중 칩 열 둘 다 여기서 그린다).
 * 문구 키는 전부 `sim.emoji.<code>` 한 갈래로 둔다(그 이름이 곧 "고정 문구"라는 뜻이다).
 */
export const CHAT_EXTRA_CODES = ["oops", "wait", "thanks"] as const;
/** 서버가 받아 주는 코드 전부(옛 이모지 여섯 + 새 셋). 넉넉히 받아 두면 화면 쪽을 바꿔도 서버를 안 건드린다. */
export const CHAT_CODES: readonly string[] = ["hi", "nice", "wow", "sorry", "oops", "wait", "thanks", "fight", "hurry"];
/**
 * 1탭 패널에 **실제로 그리는** 여섯. 320 px 폭에서 두 줄에 들어간다 — 세 줄이면 당구대를 덮고,
 * 그쯤 되면 "빠른 한마디"가 아니라 두 번째 화면이다.
 * 여기서 빠진 hi·wow·hurry 는 상단 띠의 이모지 인사에 그대로 있다(같은 말을 두 군데서 고르게 하지 않는다).
 */
export const CHAT_QUICK_CODES: readonly string[] = ["nice", "oops", "thanks", "wait", "sorry", "fight"];

/** 한 줄 최대 글자(코드포인트). 오너 지정. 짧을수록 칩 한 줄에 들어가고, 거래·시비를 담기도 어렵다. */
export const CHAT_MAX_CHARS = 30;
/** 같은 사람의 연속 전송 최소 간격. 도배만 막는 값이다. */
export const CHAT_COOLDOWN_MS = 3_000;
/** 한 대전에서 한 사람이 보낼 수 있는 줄 수. 정상적으로는 안 걸린다 — 폭주 계정의 상한일 뿐이다. */
export const CHAT_MAX_PER_MATCH = 100;
/** GET /chats 한 번에 주는 최대 줄 수. */
export const CHAT_PAGE_MAX = 100;
/** 내 차례(조준 중) 화면 위에 상대 말을 띄워 두는 시간. 낡은 말이 테이블에 영영 남지 않게. */
export const CHAT_FRESH_MS = 12_000;
/** 화면에 쌓아 두는 최근 줄 수(하단 띠). 예산이 106 px 이라 두 줄이 상한이다. */
export const CHAT_LOG_LINES = 2;

/** 보낼 수 있는 고정 인사 코드인가 — 자유 입력과 같은 로그에 코드로 저장된다(받는 사람 언어로 보이게). */
export function isChatCode(v: unknown, codes: readonly string[]): v is string {
    return typeof v === "string" && codes.includes(v);
}

/** 코드포인트 길이. `"X".length` 가 이모지에서 2 가 되는 것을 피한다 — 사람이 세면 1 이다. */
export function chatLength(s: string): number {
    return [...s].length;
}

/**
 * 보내기 전 정리: 제어문자·줄바꿈을 없애고 연속 공백을 한 칸으로 줄인 뒤 양끝을 턴다.
 * 줄바꿈을 지우는 이유는 한 줄짜리 칩에 그리기 때문이고, 제어문자는 화면을 망가뜨릴 수 있어서다.
 */
export function normalizeChatText(raw: string): string {
    const CONTROL = new RegExp("[\\u0000-\\u001F\\u007F\\u2028\\u2029]", "g");
    return raw.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

/** 30자를 넘으면 코드포인트 기준으로 자른다(화면 입력칸이 쓴다 — 서버는 자르지 않고 거부한다). */
export function clampChatText(raw: string): string {
    const cps = [...raw];
    return cps.length <= CHAT_MAX_CHARS ? raw : cps.slice(0, CHAT_MAX_CHARS).join("");
}

export type ChatReject = "gone" | "your-turn" | "cooldown" | "limit" | null;

/**
 * 시각은 전부 **epoch ms 숫자**로 받는다. shared/sim 은 결정론이 불변이라 시계 객체를 쓰지 않는다
 * (conformance.test.ts 가 이 디렉터리 전체를 grep 한다). 부르는 쪽이 지금 시각을 넘긴다.
 */

/**
 * 보낼 수 있나 — 서버가 대전 행을 잠근 뒤 이 함수로만 판단한다(DB 없이 테스트할 수 있게 뺐다. nextTurnSeenAt 와 같은 이유).
 *
 * `lastMineAt` 과 `lastAnyAt` 을 **둘 다** 받는 이유가 중요하다. 이모지 쿨다운에는 버그가 있다:
 * 대전 행에 "마지막으로 보낸 사람" 하나만 두고 `emojiFrom === from` 일 때만 간격을 보기 때문에,
 * 상대가 사이에 하나 보내면 내 간격이 즉시 풀렸다(옛 repo.sendEmoji — 지금은 지웠다). 채팅은 **내 마지막 시각만** 보면 되는데,
 * 인자에 둘 다 있어야 "상대가 사이에 보냈다"는 상황을 테스트가 표현할 수 있고, 구현이 실수로 lastAnyAt 을
 * 보면 그 테스트가 실패한다. 인자가 하나뿐이면 어떤 구현이든 테스트를 통과해 버린다.
 */
export function chatReject(x: {
    status: string;
    /** 대전 행의 지금 차례(서버 정본) */
    turn: number;
    from: 0 | 1;
    kind: "text" | "code";
    /** 내가 이 대전에서 지금까지 보낸 줄 수 */
    count: number;
    /** 내가 마지막으로 보낸 시각(epoch ms) */
    lastMineAt: number | null;
    /** 누구든 마지막으로 보낸 시각(epoch ms). 쿨다운 계산에 쓰면 안 된다 — 위 주석 참고. */
    lastAnyAt?: number | null;
    /** 지금(epoch ms) */
    now: number;
    cooldownMs?: number;
    maxPerMatch?: number;
}): ChatReject {
    const now = x.now;
    const cooldownMs = x.cooldownMs ?? CHAT_COOLDOWN_MS;
    const maxPerMatch = x.maxPerMatch ?? CHAT_MAX_PER_MATCH;
    if (x.status !== "playing") return "gone";
    // 글은 **내가 기다리는 동안에만** 쓴다. 안전 때문이 아니라 화면 때문이다 — 내 차례에 키보드가 올라오면
    // 두께 독·미세 방향조절·샷 버튼이 덮이는데 40초 시계는 계속 돌고, 세 번이면 실격패다.
    // 고정 인사(code)는 키보드가 없으므로 차례를 가리지 않는다.
    if (x.kind === "text" && x.turn === x.from) return "your-turn";
    if (x.count >= maxPerMatch) return "limit";
    if (x.lastMineAt !== null && now - x.lastMineAt < cooldownMs) return "cooldown";
    return null;
}
