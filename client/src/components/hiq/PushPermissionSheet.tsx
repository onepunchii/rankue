import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LucideBell } from "@/lib/icons";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import {
    ensurePushRegistered, navigateInApp, pushPermission, requestPushPermission, setForegroundPushHandler,
} from "@/lib/nativeBridge";
import { hasPlugin } from "@shared/nativeCaps";

// 알림 권한 사전 설명 시트(감사 P3·L6). 예전엔 앱을 켜자마자, 로그인도 하기 전에 OS 권한 창을 띄웠다.
// iOS 는 한 번 거부하면 다시 물을 수 없고 안드로이드도 두 번이면 끝이라, 무엇을 알려 주는지 먼저 말하고
// 사용자가 '알림 받기'를 눌렀을 때만 OS 창을 띄운다. '나중에'는 7일 동안 다시 묻지 않는다.
// 같은 자리에서 옛 앱(presentationOptions 없음)이 앱을 보는 중 받은 푸시를 토스트로 보여 준다 — 안 그러면 조용히 사라진다.

const DISMISS_KEY = "rankue_push_sheet_dismissed_at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;
// 경기·점수판·시뮬레이터 위에는 절대 올리지 않는다 — 로그인 직후 머무는 목록형 화면에서만 뜬다.
const SHEET_ROUTES = new Set(["/dashboard", "/club", "/friends", "/history", "/ranking", "/menu", "/community"]);

function dismissedRecently(now = Date.now()): boolean {
    try {
        const at = Number(localStorage.getItem(DISMISS_KEY));
        return Number.isFinite(at) && at > 0 && now - at < DISMISS_MS;
    } catch {
        return false;
    }
}

function rememberDismiss(): void {
    try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* 저장소를 못 쓰는 환경 */ }
}

export function PushPermissionSheet({ suppressed = false }: { suppressed?: boolean }) {
    const { member } = useAuth();
    const [location] = useLocation();
    const { t } = useT();
    const { toast } = useToast();
    const [eligible, setEligible] = useState(false);
    const [busy, setBusy] = useState(false);
    const memberId = member?.id;

    // 옛 앱에서 앱을 보는 중 온 푸시 → 토스트(새 앱은 OS 배너가 대신한다 — nativeBridge 가 거른다)
    useEffect(() => {
        setForegroundPushHandler((push) => {
            const url = push.url;
            toast({
                title: push.title || t("common.appName"),
                description: push.body,
                action: url ? (
                    <ToastAction altText={t("push.view")} onClick={() => navigateInApp(url)}>
                        {t("push.view")}
                    </ToastAction>
                ) : undefined,
            });
        });
        return () => setForegroundPushHandler(null);
    }, [t, toast]);

    useEffect(() => {
        if (!memberId || !hasPlugin("PushNotifications")) {
            setEligible(false);
            return;
        }
        let alive = true;
        void ensurePushRegistered();
        void pushPermission().then((p) => {
            if (alive) setEligible(p === "prompt" && !dismissedRecently());
        });
        return () => { alive = false; };
    }, [memberId]);

    if (!eligible || suppressed || !SHEET_ROUTES.has(location)) return null;

    const later = () => {
        rememberDismiss();
        setEligible(false);
    };
    const enable = async () => {
        if (busy) return;
        setBusy(true);
        const p = await requestPushPermission();
        setBusy(false);
        // OS 창에서 거부했으면 안드로이드는 한 번 더 물을 수 있다 — 바로 다시 조르지 않게 '나중에'와 같이 쉰다
        if (p !== "granted") rememberDismiss();
        setEligible(false);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/30" onClick={later} role="presentation">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="push-sheet-title"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[448px] bg-white rounded-t-card px-6 pt-6 shadow-[0_-8px_28px_rgba(0,0,0,0.10)]"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
            >
                <div className="w-11 h-11 rounded-tile bg-brand/12 flex items-center justify-center mb-4">
                    <LucideBell className="w-5 h-5 text-brand" />
                </div>
                <h2 id="push-sheet-title" className="text-[18px] font-bold text-ink-1">{t("push.sheetTitle")}</h2>
                <p className="text-[14px] text-black/60 mt-1.5 leading-relaxed">{t("push.sheetBody")}</p>
                <button
                    onClick={enable}
                    disabled={busy}
                    className="mt-5 w-full h-12 rounded-full bg-brand text-brand-fg text-[15px] font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
                >
                    {t("push.enable")}
                </button>
                <button onClick={later} className="mt-2 w-full h-11 rounded-full text-[14px] font-medium text-black/55 active:bg-black/[0.04]">
                    {t("push.later")}
                </button>
            </div>
        </div>
    );
}
