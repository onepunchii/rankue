/**
 * 켜 둔 알림이 웹에서는 울리지 않는다는 띠 한 줄(2026-10-14 오너: "웹 가입자가 앱으로 연결이 잘 안 되네" → "응 진행").
 * 골프 홈 · 알림함 위에 둔다. 누르면 설치 팝업이 '알림' 판으로 뜬다(아이폰 · 안드로이드 스토어, PC 는 QR, 로그인한 휴대폰은 '앱에서 열기').
 * 보이는 때는 shared/alertReach 의 alertStripPlan 이 정한다(앱 밖 · 켜 둔 알림이 있고 · 푸시가 닿지 않을 때, 닫으면 사흘).
 * 모든 종목이 같이 쓰는 알림함에도 놓이므로 글은 t() 로(다섯 언어).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { LucideBellRing, X } from "@/lib/icons";
import { isNativeApp } from "@/lib/nativeBridge";
import { cn } from "@/lib/utils";
import { ALERT_STRIP_KEY, alertStripPlan, type AlertReach } from "@shared/alertReach";
import { openInstallForAlert } from "@/components/hiq/AppInstallSheet";

const readClosed = (): number | null => { try { const v = Number(localStorage.getItem(ALERT_STRIP_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; } };

export function AlertAppStrip({ tone = "dark", className, onOpen }: { tone?: "dark" | "light"; className?: string; /** 팝업을 띄우기 전에(알림함 서랍처럼 팝업보다 위층인 곳은 먼저 닫는다) */ onOpen?: () => void }) {
    const { t } = useT();
    const { isLoggedIn } = useAuth();
    const native = isNativeApp();
    const [closedAt, setClosedAt] = useState(readClosed);
    const { data } = useQuery<AlertReach | null>({ queryKey: ["/api/hiq/golf-courses/alerts/reach"], enabled: isLoggedIn && !native, staleTime: 5 * 60_000 });
    const plan = alertStripPlan(data, { native, closedAt, now: Date.now() });
    if (!plan.show) return null;
    const text = t("alertApp.strip").replace("{n}", String(plan.count));
    const close = () => { const now = Date.now(); try { localStorage.setItem(ALERT_STRIP_KEY, String(now)); } catch { /* 저장소를 못 쓰면 이 화면에서만 닫힌다 */ } setClosedAt(now); };
    const dark = tone === "dark";
    return (
        <div className={cn("relative z-10 flex items-center gap-3 rounded-2xl py-2.5 pl-3 pr-1.5", className)} data-testid="alert-app-strip"
            style={dark ? { background: "#FFC43D1A", boxShadow: "inset 0 0 0 1px #FFC43D59", color: "#FFFFFF" } : { background: "#FFF6DB", boxShadow: "inset 0 0 0 1px #F2C14E", color: "#1F1500" }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "#FFC43D" }}><LucideBellRing weight="fill" className="h-[18px] w-[18px]" style={{ color: "#1F1500" }} /></span>
            <button type="button" onClick={() => { onOpen?.(); openInstallForAlert({ title: text, source: "alert_strip", force: true }); }} className="min-w-0 flex-1 text-left" data-testid="alert-app-strip-open">
                <span className="block text-[14px] font-semibold leading-snug [word-break:keep-all]">{text}</span>
                <span className="mt-0.5 block text-[13px] font-semibold" style={{ color: dark ? "#FFC43D" : "#8A5A00" }}>{t("alertApp.stripAction")} ›</span>
            </button>
            <button type="button" onClick={close} aria-label={t("alertApp.close")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ color: dark ? "#FFFFFF99" : "#1F150099" }} data-testid="alert-app-strip-close"><X className="h-4 w-4" /></button>
        </div>
    );
}
