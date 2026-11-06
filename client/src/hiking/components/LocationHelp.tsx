/**
 * 위치 켜는 방법(2026-11-06 오너: "위치 꺼져 있는 사람이면 다시 키게 하는 팝업" → "응 그렇게 하자").
 *
 * 정상 인증 · 코스 도장 · 산행 기록이 위치를 못 받았을 때 한 줄 안내 밑에 '위치 켜는 방법' 단추를 두고, 누르면 이 시트가
 * 지금 기기(랭큐 앱 · 카카오톡 같은 앱 안 · 사파리 · 크롬)에 맞는 순서를 보여 준다. 순서와 문구는 shared/locationHelp 가 고른다.
 * 할 수 있으면 단추로 대신 해 준다 — 랭큐 앱은 설정 화면 열기, 카카오톡 안은 기본 브라우저로 열기.
 * 스스로 뜨지 않는다(누를 때만). ⚠️ 리터럴 색만(등산의 색). 글자는 12px 이상.
 */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { LucideLocateFixed } from "@/lib/icons";
import { canOpenAppSettings, openAppSettings } from "@/lib/nativeBridge";
import { locationPermission } from "@/hooks/useNativeBridge";
import { isNative, platform } from "@shared/nativeCaps";
import { installDevice, isInAppBrowser } from "@shared/installPrompt";
import { kakaoExternalUrl, locationHelp, type LocationClient, type LocationOs, type LocationTrouble } from "@shared/locationHelp";

/** 이 화면이 열린 곳 — 랭큐 앱 · 다른 앱 안의 브라우저 · 보통 브라우저 */
export function locationClient(): LocationClient {
    if (isNative()) return "app";
    return typeof navigator !== "undefined" && isInAppBrowser(navigator.userAgent) ? "inapp" : "web";
}
function locationOs(): LocationOs {
    if (isNative()) return platform() === "ios" ? "ios" : "android";
    if (typeof navigator === "undefined") return "desktop";
    return installDevice(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints, standalone: (navigator as Navigator & { standalone?: boolean }).standalone ?? null });
}

export function LocationHelpSheet({ open, trouble, onClose }: { open: boolean; trouble: LocationTrouble; onClose: () => void }) {
    const [failed, setFailed] = useState(false);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const help = locationHelp({ client: locationClient(), os: locationOs(), trouble, ua, canOpenSettings: canOpenAppSettings() });
    const act = async () => {
        if (help.action === "settings") { setFailed(!(await openAppSettings())); return; }
        if (help.action === "kakao-external") window.location.href = kakaoExternalUrl(window.location.href);
    };
    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) { setFailed(false); onClose(); } }}>
            <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-[#FFFFFF0F] bg-[#0B1F26] px-5 pb-0 pt-5 [&>button]:right-5 [&>button]:top-5 [&>button]:text-[#F4EFE3] [&>button]:opacity-60" data-testid="location-help-sheet" data-trouble={trouble}>
                <SheetTitle className="pr-8 text-[20px] font-semibold tracking-tight text-[#F4EFE3] break-keep">{help.title}</SheetTitle>
                <SheetDescription className="mt-1 text-[13px] text-[#F4EFE399]">이 순서대로 켜고 다시 눌러 주세요.</SheetDescription>
                <ol className="mt-4 space-y-2.5" data-testid="location-help-steps">
                    {help.steps.map((step, i) => (
                        <li key={`step:${i}`} className="flex gap-3 rounded-2xl bg-[#FFFFFF0A] px-3.5 py-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F28C6A] text-[13px] font-semibold text-[#2A1208]" aria-hidden>{i + 1}</span>
                            <span className="text-[14.5px] leading-snug text-[#F4EFE3] break-keep">{step}</span>
                        </li>
                    ))}
                </ol>
                {help.note && <p className="mt-3 text-[12.5px] leading-relaxed text-[#F4EFE380] break-keep">{help.note}</p>}
                {failed && <p className="mt-2 text-[13px] text-[#FFD4CC] break-keep" role="status">설정을 열지 못했어요. 위 순서대로 폰 설정에서 직접 찾아 주세요.</p>}
                <div className="grid gap-2.5 pt-4" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))", gridTemplateColumns: help.action ? "1fr auto" : "1fr" }}>
                    {help.action && (
                        <button type="button" onClick={() => { void act(); }} data-track-as={`location-help-${help.action}`} data-testid="location-help-action"
                            className="inline-flex h-[52px] items-center justify-center rounded-2xl bg-[#F28C6A] text-[15px] font-semibold text-[#2A1208] active:opacity-90">
                            {help.action === "settings" ? "설정 열기" : "브라우저로 열기"}
                        </button>
                    )}
                    <button type="button" onClick={() => { setFailed(false); onClose(); }}
                        className="inline-flex h-[52px] items-center justify-center rounded-2xl bg-[#FFFFFF12] px-5 text-[14px] font-semibold text-[#F4EFE3] active:bg-[#FFFFFF1F]">
                        닫기
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

/**
 * '위치 켜는 방법' 단추 + 시트. tone 은 놓이는 바탕 — light(밝은 카드 위) · dark(어두운 화면 위).
 */
export function LocationHelpButton({ trouble, tone = "light", label = "위치 켜는 방법", className = "" }: { trouble: LocationTrouble; tone?: "light" | "dark"; label?: string; className?: string }) {
    const [open, setOpen] = useState(false);
    const look = tone === "light"
        ? "bg-[#0E2A33] text-[#F4EFE3] active:bg-[#16404D]"
        : "bg-[#F4EFE3] text-[#0E2A33] active:bg-[#E6DFCD]";
    return (
        <>
            <button type="button" onClick={() => setOpen(true)} data-track-as={`location-help-open-${trouble}`} data-testid="location-help-open"
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold ${look} ${className}`}>
                <LucideLocateFixed className="h-4 w-4 shrink-0" aria-hidden />{label}
            </button>
            <LocationHelpSheet open={open} trouble={trouble} onClose={() => setOpen(false)} />
        </>
    );
}

/**
 * 위치 권한이 **이미 꺼져 있는가** — 묻지 않고 본다(권한 창을 띄우지 않는다). 정상에 가서야 알면 늦어서(신호도 약하다)
 * 산 화면 · 산행 시작 전에 미리 알리려는 것. 설정에서 켜고 돌아오면(화면이 다시 보이면) 다시 본다.
 * 모르는 경우('unknown' — 옛 사파리 · 일부 앱 안 브라우저)는 꺼졌다고 보지 않는다.
 */
export function useLocationBlocked(enabled = true): boolean {
    const [blocked, setBlocked] = useState(false);
    useEffect(() => {
        if (!enabled) { setBlocked(false); return; }
        let alive = true;
        const check = () => { void locationPermission().then((st) => { if (alive) setBlocked(st === "denied"); }); };
        check();
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", check);
        return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", check); };
    }, [enabled]);
    return blocked;
}
