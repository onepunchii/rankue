/**
 * 채팅 금지 규칙(2026-10-26 오너 — 멀티방 대전에서 성적인 욕 · 패드립이 오갔는데 계정 정지밖에 수단이 없었다).
 * 막는 것: 자유 채팅(대전 채팅의 글 · 크루/1:1 채팅). 남기는 것: 대전의 문구 단추, 운영자 문의(금지에 이의를 말할 길).
 * 운영자가 정하는 길이(CHAT_BAN_CHOICES)와 자동 금지(막힌 말을 CHAT_HIT_WINDOW_MIN 분 안에 CHAT_AUTO_BAN_HITS 번 → CHAT_AUTO_BAN_HOURS 시간).
 * 저장은 server/storage/chatBans(표 hiq_chat_moderation). ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js(지금은 없다).
 */
export interface ChatBan {
    /** 풀리는 때(ISO) */
    until: string;
    reason: string | null;
    /** 정한 사람 — 운영자 표시 · 'auto' */
    by: string | null;
}

export const CHAT_AUTO_BAN_HITS = 3;
export const CHAT_HIT_WINDOW_MIN = 10;
export const CHAT_AUTO_BAN_HOURS = 24;

/** 관리자 화면의 고르기 — 하루 · 일주일 · 한 달(시간) */
export const CHAT_BAN_CHOICES: readonly { hours: number; label: string }[] = [
    { hours: 24, label: "1일" },
    { hours: 24 * 7, label: "7일" },
    { hours: 24 * 30, label: "30일" },
];
/** 운영자가 보낸 길이 — 고르기 값만 받는다 */
export const isChatBanHours = (v: unknown): v is number => CHAT_BAN_CHOICES.some((c) => c.hours === v);

/** 풀리기까지 남은 시간(올림, 최소 1) — 막힌 사람에게 "N시간 뒤에 풀려요" */
export function chatBanHoursLeft(ban: Pick<ChatBan, "until">, nowMs: number): number {
    const ms = Date.parse(ban.until) - nowMs;
    return Number.isFinite(ms) ? Math.max(1, Math.ceil(ms / 3_600_000)) : 1;
}
