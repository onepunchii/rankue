import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { LucideDownload } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { openStorePage } from "@/lib/nativeBridge";
import { apiRequest } from "@/lib/queryClient";
import { APP_UPDATE_POLICY, decideUpdate, isPolicyActive, isUpToDate, parseBuildNumber, shownToday, type UpdateDecision } from "@shared/appVersion";
import { hasPlugin, platform } from "@shared/nativeCaps";

// 앱 업데이트 안내(감사 N7·C-O5). 정책은 shared/appVersion.ts —
// iOS 는 App Store 에 새 버전이 실제로 올라오면 자동으로 켜지고(서버가 확인), 안드로이드는 enabled 로 수동으로 켠다.
//  - 권유(최신 빌드보다 낮음): 닫을 수 있고 하루 한 번.
//  - 강제(최소 빌드보다 낮음): 닫을 수 없다.
// 버튼: 새 안드로이드 앱은 Play 인앱 업데이트(앱을 떠나지 않고 받는다), 그 밖에는 스토어 페이지.

const SHOWN_KEY = "rankue_update_prompt_at";

function readShownAt(): number | null {
    try {
        const v = Number(localStorage.getItem(SHOWN_KEY));
        return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
        return null;
    }
}

function writeShownAt(at: number): void {
    try {
        localStorage.setItem(SHOWN_KEY, String(at));
    } catch { /* 무시 */ }
}

/** 설치된 빌드 번호. App 플러그인도 없을 만큼 옛 앱이면 null(= 아주 옛 앱으로 판정). */
async function installedBuild(): Promise<number | null> {
    if (!hasPlugin("App")) return null;
    try {
        return parseBuildNumber((await App.getInfo()).build);
    } catch {
        return null;
    }
}

/** iOS 자동 켜기용 — App Store 에 지금 올라가 있는 버전(서버가 애플 공개 조회로 확인).
 *  못 읽거나 3초 안에 답이 없으면 null(→ 안내 안 함). 앱 첫 화면의 다른 안내를 오래 붙잡지 않으려고 상한을 둔다. */
async function iosStoreVersion(): Promise<string | null> {
    try {
        const r = (await Promise.race([
            apiRequest("/api/hiq/app/store-version"),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ])) as { ios?: unknown } | null;
        return typeof r?.ios === "string" ? r.ios : null;
    } catch {
        return null;
    }
}

async function startUpdate(): Promise<void> {
    if (platform() === "android" && hasPlugin("AppUpdate")) {
        try {
            const { AppUpdate, AppUpdateAvailability, AppUpdateResultCode, FlexibleUpdateInstallStatus } =
                await import("@capawesome/capacitor-app-update");
            const info = await AppUpdate.getAppUpdateInfo();
            const ready = info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE
                || info.updateAvailability === AppUpdateAvailability.UPDATE_IN_PROGRESS;
            if (ready && info.immediateUpdateAllowed) {
                // 전체 화면 Play 업데이트. 사용자가 취소하면 그대로 둔다(강제면 시트가 남아 있다).
                const r = await AppUpdate.performImmediateUpdate();
                if (r.code === AppUpdateResultCode.OK || r.code === AppUpdateResultCode.CANCELED) return;
            } else if (ready && info.flexibleUpdateAllowed) {
                // 뒤에서 받고, 다 받으면 설치(앱이 다시 시작된다)
                await AppUpdate.addListener("onFlexibleUpdateStateChange", (s) => {
                    if (s.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) void AppUpdate.completeFlexibleUpdate().catch(() => { /* 무시 */ });
                });
                const r = await AppUpdate.startFlexibleUpdate();
                if (r.code === AppUpdateResultCode.OK || r.code === AppUpdateResultCode.CANCELED) return;
            }
        } catch { /* Play 인앱 업데이트를 못 쓰는 설치(사이드로드 등) — 스토어로 */ }
    }
    openStorePage();
}

/**
 * onSettled: 띄울지 말지 결정이 끝나면 한 번 부른다. 알림 권한 시트가 이걸 기다린다 —
 * 결정 전에 알림 시트가 먼저 올라왔다가 업데이트 시트로 바뀌면 읽던 사람이 놀란다.
 */
export function UpdatePromptSheet({ onOpenChange, onSettled }: { onOpenChange?: (open: boolean) => void; onSettled?: () => void }) {
    const { t } = useT();
    const [decision, setDecision] = useState<UpdateDecision>("none");

    useEffect(() => {
        let alive = true;
        const settle = () => { if (alive) onSettled?.(); };
        const p = platform();
        const policy = p === "web" ? undefined : APP_UPDATE_POLICY[p];
        const auto = !!policy && !policy.enabled && !!policy.autoFromStore && p === "ios";
        if (!policy || (!policy.enabled && !auto)) { settle(); return () => { alive = false; }; } // 꺼져 있으면 아무것도 묻지 않는다
        void (async () => {
            // 설치 빌드(즉시)를 먼저 본다 — 이미 최신이면 스토어에 물을 이유가 없다(새 앱 사용자 대부분)
            const build = await installedBuild();
            if (!alive) return;
            if (isUpToDate(policy, build)) { settle(); return; }
            const storeVersion = auto ? await iosStoreVersion() : null;
            if (!alive) return;
            if (!isPolicyActive(policy, storeVersion)) { settle(); return; }
            const d = decideUpdate(policy, build, storeVersion);
            if (d === "suggest" && shownToday(readShownAt(), Date.now())) { settle(); return; }
            if (d === "suggest") writeShownAt(Date.now());
            setDecision(d);
            settle();
        })();
        return () => { alive = false; };
    }, []);

    const open = decision !== "none";
    useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
    if (!open) return null;

    const force = decision === "force";
    const close = () => { if (!force) setDecision("none"); };

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40" onClick={close} role="presentation">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="update-sheet-title"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[448px] bg-white rounded-t-card px-6 pt-6 shadow-[0_-8px_28px_rgba(0,0,0,0.10)]"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
            >
                <div className="w-11 h-11 rounded-tile bg-brand/12 flex items-center justify-center mb-4">
                    <LucideDownload className="w-5 h-5 text-brand" />
                </div>
                <h2 id="update-sheet-title" className="text-[18px] font-bold text-ink-1">{t("update.title")}</h2>
                <p className="text-[14px] text-black/60 mt-1.5 leading-relaxed">{force ? t("update.forceBody") : t("update.body")}</p>
                <button
                    onClick={() => void startUpdate()}
                    className="mt-5 w-full h-12 rounded-full bg-brand text-brand-fg text-[15px] font-semibold active:scale-[0.98] transition-transform"
                >
                    {t("update.now")}
                </button>
                {!force && (
                    <button onClick={close} className="mt-2 w-full h-11 rounded-full text-[14px] font-medium text-black/55 active:bg-black/[0.04]">
                        {t("update.later")}
                    </button>
                )}
            </div>
        </div>
    );
}
