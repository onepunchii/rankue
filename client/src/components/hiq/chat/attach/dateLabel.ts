/**
 * 첨부 고르기 시트의 날짜 표기 — 한국어는 kst 헬퍼("9월 12일"), 다른 언어는 그 언어 관례로(시간대는 KST 고정).
 * ChatCard 와 같은 규칙을 시트들이 같이 쓰려고 뽑아 둔다 — 안 그러면 줄 안에서 번역된 문구와 한국어 날짜가 섞인다(2026-09-23 리뷰).
 */
import { INTL_TAG } from "@/components/hiq/chat/ChatRoom";
import { kstDateLabel } from "@/lib/kst";
import type { Locale } from "@/lib/i18n";

export function attachDateLabel(iso: string | null | undefined, locale: Locale): string {
    if (!iso) return "";
    if (locale === "ko") return kstDateLabel(iso);
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(INTL_TAG[locale], { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(d);
}

/** 날짜 + 시각(티타임처럼 시각이 중요한 줄). */
export function attachDateTimeLabel(iso: string | null | undefined, locale: Locale): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const time = new Intl.DateTimeFormat(INTL_TAG[locale], { hour: "2-digit", minute: "2-digit", hour12: locale !== "ko", timeZone: "Asia/Seoul" }).format(d);
    return `${attachDateLabel(iso, locale)} ${time}`;
}
