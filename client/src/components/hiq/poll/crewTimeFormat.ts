import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { countdown } from "@shared/crewTime";

// 크루 투표·대회 화면의 시각 표기. date-fns 에 한국어(locale: ko)를 박아 두던 것을 앱 언어로 바꾸고,
// 시간대는 항상 한국(Asia/Seoul)으로 고정한다 — 기기 시간대로 찍으면 해외 회원에게 마감이 9시간씩 어긋나 보였다.

const INTL_TAG: Record<Locale, string> = { ko: "ko-KR", en: "en-US", vi: "vi-VN", tr: "tr-TR", es: "es-ES" };
export const intlTag = (locale: Locale) => INTL_TAG[locale] ?? "ko-KR";

/** '9월 29일 (화) 23:59' 같은 절대 시각(KST). 한국어가 아니면 KST 를 붙여 자기 시각으로 옮길 수 있게 한다. */
export function formatKst(at: Date | string | number, locale: Locale, opts: { weekday?: boolean; year?: boolean } = {}): string {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return "";
    const s = d.toLocaleString(intlTag(locale), {
        timeZone: "Asia/Seoul",
        year: opts.year ? "numeric" : undefined,
        month: "short", day: "numeric",
        weekday: opts.weekday ? "short" : undefined,
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    return locale === "ko" ? s : `${s} KST`;
}

/** 날짜만(KST) — 명예의 전당 '끝난 날'처럼 시각이 필요 없는 곳. */
export function formatKstDate(at: Date | string | number, locale: Locale): string {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(intlTag(locale), { timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric" });
}

/** "2일 3시간 남음" 같은 남은 시간 문구. 닫혔으면 null. */
export function countdownLabel(t: (k: string) => string, endTime: Date | string | null | undefined, now: number): string | null {
    const c = countdown(endTime, now);
    if (!c || c.closed) return null;
    if (c.days > 0) return t("crewPoll.leftDH").replace("{d}", String(c.days)).replace("{h}", String(c.hours));
    if (c.hours > 0) return t("crewPoll.leftHM").replace("{h}", String(c.hours)).replace("{m}", String(c.minutes));
    return t("crewPoll.leftM").replace("{m}", String(c.minutes));
}

/**
 * 30초마다 바뀌는 '지금'. 카운트다운을 갱신하고, 마감 순간 카드가 투표를 그만 받게 한다.
 * 화면이 숨겨지면(탭 전환·앱 백그라운드) 멈췄다가 돌아오면 바로 한 번 맞춘다.
 */
export function useNow(intervalMs = 30_000, enabled = true): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!enabled) return;
        const tick = () => { if (document.visibilityState !== "hidden") setNow(Date.now()); };
        const id = window.setInterval(tick, intervalMs);
        document.addEventListener("visibilitychange", tick);
        return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
    }, [intervalMs, enabled]);
    return now;
}
