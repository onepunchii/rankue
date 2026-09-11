import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { LucideDownload } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { openStorePage } from "@/lib/nativeBridge";
import { apiRequest } from "@/lib/queryClient";
import { APP_UPDATE_POLICY, decideUpdate, isPolicyActive, parseBuildNumber, shownToday, type UpdateDecision } from "@shared/appVersion";
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

/** iOS 자동 켜기용 — App Store 에 지금 올라가 있는 버전(서버가 애플 공개 조회로 확인). 못 읽으면 null(→ 안내 안 함). */
async function iosStoreVersion(): Promise<string | null> {
    try {
        const r = (await apiRequest("/api/hiq/app/store-version")) as { ios?: unknown } | null;
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

export function UpdatePromptSheet({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
    const { t } = useT();
    const [decision, setDecision] = useState<UpdateDecision>("none");

    useEffect(() => {
        const p = platform();
        if (p === "web") return;
        const policy = APP_UPDATE_POLICY[p];
        const auto = !policy.enabled && !!policy.autoWhenStoreVersion && p === "ios";
        if (!policy.enabled && !auto) return; // 꺼져 있으면 스토어도, 빌드 번호도 묻지 않는다
        let alive = true;
        void (async () => {
            const storeVersion = auto ? await iosStoreVersion() : null;
            if (!alive || !isPolicyActive(policy, storeVersion)) return;
            const build = await installedBuild();
            if (!alive) return;
            const d = decideUpdate(policy, build, storeVersion);
            if (d === "suggest") {
                if (shownToday(readShownAt(), Date.now())) return;
                writeShownAt(Date.now());
            }
            setDecision(d);
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
