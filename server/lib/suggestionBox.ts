/**
 * 건의함 순수 규칙(2026-09-11, 오너 요청 "내가 답장한 내역도 볼 수 있게, 건의가 들어오면 관리자에게 푸시").
 *
 * DB 없이 판단할 수 있는 것만 모았다: 건의 종류 이름표, 운영자 알림 문구·도배 방지, 답장 묶기,
 * 옛 답장(알림에만 남은 것)을 건의에 짝짓는 규칙. 접수(routes/member)·알림(services/suggestionBox)·
 * 조회(storage/admin.repo)·일회성 이관(scripts/backfill-suggestion-replies)이 같은 판정을 쓰게 한곳에 둔다.
 */

export const SUGGESTION_TYPES = ["BUG", "FEATURE", "PARTNERSHIP", "ETC"] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

/** 건의 모달(SuggestionModal)이 보내는 네 종류의 한국어 이름. 운영자 알림 제목에 쓴다. */
export const SUGGESTION_TYPE_LABEL: Record<SuggestionType, string> = {
    BUG: "버그",
    FEATURE: "기능 제안",
    PARTNERSHIP: "제휴",
    ETC: "기타",
};

/** 새 건의 운영자 알림의 hiq_notifications.type — 도배 방지 조회(admin.repo getSuggestionAlertState)의 기준. */
export const SUGGESTION_ALERT_TYPE = "suggestion_new";
/** 운영자가 앱으로 보낸 답장의 회원 알림 type. 옛 답장 이관이 이 값으로 알림을 찾는다. */
export const SUGGESTION_REPLY_TYPE = "suggestion_reply";
/** 같은 회원의 건의 알림은 이 간격에 한 번만 — 연달아 다섯 건을 쓰면 운영자 폰이 다섯 번 울린다. */
export const SUGGESTION_ALERT_WINDOW_MIN = 10;
/**
 * 창 안에 알림을 일으킬 수 있는 서로 다른 작성자 수 — 계정 여럿으로 건의를 연달아 쓰면 회원별 제한만으로는
 * 운영자 폰이 계정 수만큼 울린다(신고 알림 REPORT_ALERT_HOURLY_CAP 과 같은 이유). 넘친 건의도 건의함에는 그대로 있다.
 */
export const SUGGESTION_ALERT_GLOBAL_CAP = 5;
/** 알림을 누르면 열리는 곳 — 대시보드가 ?tab=suggestions 를 읽어 건의함을 바로 연다(REPORT_QUEUE_URL 과 같은 방식). */
export const SUGGESTION_QUEUE_URL = "/admin/dashboard?tab=suggestions";
/** 알림 본문 미리보기 길이. 잠금 화면 두세 줄에 들어가는 정도. */
export const SUGGESTION_PREVIEW_MAX = 80;

/**
 * 모르는 값(예전 클라이언트·직접 호출)은 '기타'로 — 알림 제목이 영문 코드나 undefined 로 뜨지 않게.
 * `in` 으로 보면 "toString" 같은 프로토타입 이름까지 통과하므로 목록에 있는지로 본다.
 */
export function suggestionTypeLabel(type: unknown): string {
    return typeof type === "string" && (SUGGESTION_TYPES as readonly string[]).includes(type)
        ? SUGGESTION_TYPE_LABEL[type as SuggestionType]
        : SUGGESTION_TYPE_LABEL.ETC;
}

/**
 * 알림 본문용 한 줄 미리보기. 줄바꿈·연속 공백은 공백 하나로 접는다(잠금 화면은 첫 줄만 보여 준다).
 * 글자 단위(코드 포인트)로 자른다 — UTF-16 단위로 자르면 이모지가 반쪽으로 깨진다.
 */
export function suggestionPreview(content: unknown, max = SUGGESTION_PREVIEW_MAX): string {
    const flat = typeof content === "string" ? content.replace(/\s+/g, " ").trim() : "";
    if (!flat) return "(내용 없음)";
    const chars = Array.from(flat);
    return chars.length <= max ? flat : `${chars.slice(0, max).join("").trimEnd()}…`;
}

/** 운영자에게 가는 새 건의 알림 문구. */
export function buildSuggestionAlert(p: { type: unknown; content: unknown }): { title: string; body: string } {
    return {
        title: `📮 새 건의 · ${suggestionTypeLabel(p.type)}`,
        body: suggestionPreview(p.content),
    };
}

/**
 * 도배 방지 판단 — 이 회원의 건의로 최근 SUGGESTION_ALERT_WINDOW_MIN 안에 알림을 보냈으면 건너뛰고,
 * 그 창 안에 이미 cap 명의 작성자 건의로 알렸으면 전체 상한에 걸려 건너뛴다.
 */
export function shouldAlertSuggestion(
    s: { alertedRecently: boolean; submittersAlerted?: number },
    cap = SUGGESTION_ALERT_GLOBAL_CAP,
): boolean {
    if (s.alertedRecently) return false;
    return (s.submittersAlerted ?? 0) < cap;
}

/**
 * 알림 받을 운영자 — 중복을 빼고, 건의를 쓴 본인은 뺀다(운영자가 시험 삼아 쓴 건의가 자기에게 되돌아오지 않게).
 * 운영자 회원 id 는 로그인이 고르는 행과 같은 기준이라(admin.repo getStaffMemberIds) 본인 비교가 맞아떨어진다.
 */
export function alertRecipients(staffMemberIds: readonly string[], submitterMemberId: string | null | undefined): string[] {
    return Array.from(new Set(staffMemberIds)).filter((id) => id !== submitterMemberId);
}

export type SuggestionReplyView = { id: string; message: string; createdAt: Date };

/**
 * 건의마다 보낸 답장을 붙인다. 답장은 오래된 것부터(대화처럼 아래로 쌓인다) — 입력 순서와 무관하게 정렬한다.
 * 조회는 답장 전체를 한 번에 읽어 여기서 나눈다(건의마다 따로 읽는 N+1 을 피한다).
 */
export function attachReplies<S extends { id: string }>(
    rows: readonly S[],
    replies: readonly (SuggestionReplyView & { suggestionId: string })[],
): (S & { replies: SuggestionReplyView[] })[] {
    const bySuggestion = new Map<string, SuggestionReplyView[]>();
    const sorted = [...replies].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    for (const r of sorted) {
        const list = bySuggestion.get(r.suggestionId) ?? [];
        list.push({ id: r.id, message: r.message, createdAt: r.createdAt });
        bySuggestion.set(r.suggestionId, list);
    }
    return rows.map((s) => ({ ...s, replies: bySuggestion.get(s.id) ?? [] }));
}

export type ReplyMatch =
    | { kind: "matched"; suggestionId: string }
    | { kind: "unmatched" }
    | { kind: "ambiguous"; suggestionIds: string[] };

/**
 * 옛 답장 이관 규칙: 답장 알림(sentAt)은 그 회원이 알림보다 **먼저** 쓴 건의 중 가장 최근 것에 대한 답이라고 본다.
 * 먼저 쓴 건의가 없으면 짝이 없고, 가장 최근 시각이 같은 건의가 둘 이상이면 어느 쪽인지 알 수 없어 건너뛴다.
 * 시각은 같은 기준의 숫자(밀리초)로 받는다 — 호출하는 쪽이 DB 에서 epoch 로 뽑아 시간대 해석 차이를 없앤다.
 */
export function matchReplyToSuggestion(sentAt: number, candidates: readonly { id: string; createdAt: number }[]): ReplyMatch {
    const before = candidates.filter((c) => c.createdAt < sentAt);
    if (!before.length) return { kind: "unmatched" };
    const latest = Math.max(...before.map((c) => c.createdAt));
    const top = before.filter((c) => c.createdAt === latest);
    if (top.length > 1) return { kind: "ambiguous", suggestionIds: top.map((c) => c.id) };
    return { kind: "matched", suggestionId: top[0].id };
}
