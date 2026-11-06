/**
 * 매장 소식 보내기(2026-11-06 오너 '추천대로' 사장님 도구 ③ 손님 관리) — 사장님이 우리 매장 회원에게 앱 알림 한 줄.
 *
 * 광고성 정보라 법(정보통신망법 제50조)을 따른다:
 *  · 받는 사람: **우리 매장 회원 중 마케팅 수신에 동의한 사람만**(hiq_members.marketing_agree). 테이블 QR 로 친 손님이라도 매장 회원이 아니면 보내지 않는다.
 *  · 제목 앞에 '(광고)'와 보내는 매장 이름, 본문 끝에 수신 거부 방법.
 *  · 밤(한국 21시~08시)에는 폰을 울리지 않고 알림함에만 둔다(야간 광고는 따로 동의가 필요하다).
 * 너무 잦으면 손님이 알림을 끈다 — 한 매장이 7일에 한 번까지(STORE_NEWS_EVERY_DAYS).
 * ⚠️ 서버가 임포트하는 shared 파일 — 이 파일은 아무것도 임포트하지 않는다.
 */
export const STORE_NEWS_TYPE = "STORE_NEWS";
export const STORE_NEWS_MAX = 120;
export const STORE_NEWS_EVERY_DAYS = 7;
export type StoreNewsTarget = "all" | "dormant";

export function cleanStoreNews(b: Record<string, unknown> | null | undefined): { message: string; target: StoreNewsTarget } | null {
    const message = String(b?.message ?? "").replace(/\s+\n/g, "\n").trim().slice(0, STORE_NEWS_MAX);
    if (message.length < 2) return null;
    return { message, target: b?.target === "dormant" ? "dormant" : "all" };
}

/** 알림 제목 · 본문 — 광고 표시 · 보내는 매장 · 수신 거부 방법 */
export function storeNewsNotice(storeName: string, message: string): { title: string; body: string } {
    return { title: `(광고) ${storeName}`, body: `${message}\n수신 거부: 랭큐 설정 › 알림 › 마케팅 정보 받기` };
}

/** 지금이 밤(한국 21:00~07:59)인가 — 밤에는 알림함에만 */
export function isKstNight(ms: number): boolean {
    const h = new Date(ms + 9 * 3600_000).getUTCHours();
    return h >= 21 || h < 8;
}

/** 다음에 보낼 수 있는 때(ms) — 마지막으로 보낸 때가 없으면 null(지금 보낼 수 있다) */
export function storeNewsNextAt(lastAtMs: number | null, now: number): number | null {
    if (lastAtMs == null) return null;
    const next = lastAtMs + STORE_NEWS_EVERY_DAYS * 86_400_000;
    return next > now ? next : null;
}

/** 요일 막대 — 0=일 … 6=토(한국 날짜) */
export const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
/** 자주 오는 요일 — 가장 많은 요일부터 둘(한 번뿐이면 그 날만). 경기가 없으면 빈 목록 */
export function topWeekdays(counts: readonly number[]): string[] {
    const ranked = counts.map((n, d) => ({ n, d })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.d - b.d);
    return ranked.slice(0, 2).map((x) => WEEKDAY_KO[x.d]);
}
