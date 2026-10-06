/**
 * 점수판 요청 규칙 — 화면(client/src/hooks/useGameScore · client/src/lib/queryClient)과 시험이 같은 값을 쓴다.
 *
 * 2026-10-06 오너 제보: "경기 시작하고 종료하기 버튼이 안 눌러지고, 홈의 이어서로 다시 들어가 종료해도 에러가 있는 듯".
 * 원인은 TanStack Query v5 의 scope 였다. 같은 scope 의 요청(뮤테이션)은 한 줄로 선다 — 앞의 것이 끝나지 않으면
 * 뒤의 것은 나가지도 않는다(query-core mutationCache.canRun). 점수 저장·FINISH·종료(버리기)가 모두 같은 줄이었고:
 *   1) 저장 하나가 응답 없이 매달리면(타임아웃 60초) 종료가 그 뒤에서 기다렸다.
 *   2) 오프라인이면 저장이 '멈춤(paused)'이 되고, 멈춘 요청은 기기 저장소에 남았다(dehydrate 기본값이 isPaused 인 것만 저장).
 *      앱을 다시 켜면 그 요청이 보낼 함수(mutationFn)도 없이 되살아나 그 경기의 줄 맨 앞을 막았다 — 저장도 종료도 안 나갔다.
 *
 * 고친 규칙:
 *   · 저장·FINISH 는 같은 줄(순서를 지켜야 한다 — 끝난 경기에 진행 중 저장이 뒤늦게 닿으면 안 된다).
 *   · 종료(버리기)는 줄 밖 — 바로 나간다. FINISH 와 겹치지 않게 하는 일은 화면이 한다(둘 중 하나가 가는 동안 다른 쪽 단추를 막는다 —
 *     가는 중인지는 캐시에서 읽는다: gameFinishKey · gameDiscardKey).
 *   · 셋 다 networkMode "always" — 오프라인이어도 멈추지 않고 곧바로 시도해 실패를 알린다.
 *   · 요청은 기기 저장소에 남기지 않는다.
 */

/** 저장·FINISH 가 서는 줄. 종료(버리기)는 이 줄에 서지 않는다. */
export const gameSaveScope = (gameId: string): { id: string } => ({ id: `hiq-game-${gameId}` });

/**
 * FINISH·종료(버리기) 요청의 이름 — '이 경기의 FINISH(버리기)가 가는 중인가'를 캐시에서 찾는 데 쓴다.
 * 화면의 isPending 은 그 화면이 보낸 요청만 본다(옵저버는 화면이 뜰 때마다 새로 생긴다). 요청은 화면을 떠나도 캐시에서 계속 가므로,
 * 뒤로 나갔다가 홈의 '이어서'로 다시 들어온 화면은 앞 화면이 남긴 FINISH 를 못 보고 버리기를 함께 보낼 수 있었다 —
 * 서로 막는 근거를 화면이 아니라 캐시에서 읽는다.
 */
export const gameFinishKey = (gameId: string) => ["hiq-game-finish", gameId] as const;
export const gameDiscardKey = (gameId: string) => ["hiq-game-discard", gameId] as const;

type ErrorLike = { status?: unknown; data?: { success?: unknown; code?: unknown } | null };

/**
 * 서버의 답을 받지 못했다 — 끊김(TypeError) · 시간 초과(AbortError) · 웹 서비스워커의 가짜 404.
 * 웹/PWA 에서는 서비스워커(client/public/sw.js)가 네트워크 실패를 본문 없는 404("Network Unavailable")로 바꿔 돌려준다.
 * 우리 서버의 오류 답에는 늘 { success: false, … } 본문이 있다(server/utils/response.ts 의 sendError) — 그것이 없는 404 는 서버의 답이 아니다.
 * 그런 404 를 '이미 없는 경기'로 읽으면 못 지운 경기를 지웠다고 하고, 그 문구("Network Unavailable")를 까닭이라고 보여 주게 된다.
 */
export const isNoAnswer = (err: unknown): boolean => {
    const e = (err ?? {}) as ErrorLike;
    if (typeof e.status !== "number") return true;
    return e.status === 404 && e.data?.success !== false;
};

/** 이미 없는 경기 — 서버가 그렇게 답했다(server/routes/modules/game.ts 의 GAME_NOT_FOUND). 답을 못 받은 가짜 404 와 가른다. */
export const isGameGone = (err: unknown): boolean => {
    const e = (err ?? {}) as ErrorLike;
    return e.status === 404 && e.data?.code === "GAME_NOT_FOUND";
};

/** 점수 저장은 10초 안에 답이 없으면 놓는다 — 매달린 저장 하나가 뒤의 저장·FINISH 를 오래 붙잡지 않게. */
export const SAVE_TIMEOUT_MS = 10_000;

/** 종료(버리기)는 12초 — 누른 사람이 기다리는 요청이다. 못 지웠으면 그 사실을 알린다. */
export const DISCARD_TIMEOUT_MS = 12_000;

/**
 * 저장은 '가는 중 하나 + 줄 선 것 하나'까지만. 줄 선 저장은 나가는 순간의 최신 상태를 보내므로 그 뒤에 더 세울 이유가 없다.
 * 네트워크가 매달려 있을 때 점수를 누른 만큼 저장이 쌓이면 FINISH 가 그 수 × 10초를 기다린다.
 */
export const MAX_QUEUED_SAVES = 2;
export const canQueueSave = (pendingSaves: number): boolean => pendingSaves < MAX_QUEUED_SAVES;

/**
 * 요청(뮤테이션)은 기기 저장소에 남기지 않는다 — persistQueryClient 의 dehydrateOptions.shouldDehydrateMutation.
 * 되살아난 요청에는 보낼 함수가 없다(우리는 setMutationDefaults 를 쓰지 않는다). 남겨 봐야 다시 보내지도 못하고 줄만 막는다.
 */
export const neverPersistMutations = (): boolean => false;
