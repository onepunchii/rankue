/**
 * 알림을 켠 직후 — 그 알림이 **어떻게 닿는지** 맞춰 준다(2026-10-05).
 *
 * 푸시는 랭큐 앱에서만 울린다(웹 푸시 없음 — lib/nativeBridge). 검색으로 들어온 사람은 대부분 브라우저라
 * "올라오면 바로 알려 드려요"는 그대로 두면 지켜지지 않는 말이다. 그래서 켠 자리에서:
 *   · 앱 + 권한 허용     → 토스트 한 줄(그대로 울린다)
 *   · 앱 + 아직 안 물음  → OS 권한 창(방금 '알림 받기'를 누른 사람이다 — PushPermissionSheet 와 같은 원칙)
 *   · 앱 + 권한 꺼짐     → 꺼져 있다고 알리고 설정으로
 *   · 브라우저           → 시트: "푸시는 앱에서 울려요" + 스토어(휴대폰) / 안내만(PC). 7일에 한 번, 그 사이엔 토스트.
 * 관심 골프장(WatchSheet)과 지역 알림(AreaAlert)이 같이 쓴다. 시트는 CourseShell 이 한 번 깔아 둔다(AlertReachHost).
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { LucideBellRing } from "@/lib/icons";
import {
    canOpenNotificationSettings, isNativeApp, openNotificationSettings, pushPermission, requestPushPermission,
} from "@/lib/nativeBridge";
import { androidStoreUrl, detectPlatform, iosStoreUrl } from "@shared/appLinks";

type Store = "ios" | "android";
interface Prompt { title: string; store: Store | null }

let current: Prompt | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const closePrompt = () => { if (current) { current = null; emit(); } };

const SHOWN_KEY = "rankue_alert_reach_shown_at";
const SHOWN_MS = 7 * 24 * 60 * 60 * 1000;
function shownRecently(): boolean {
    try {
        const at = Number(localStorage.getItem(SHOWN_KEY));
        return Number.isFinite(at) && at > 0 && Date.now() - at < SHOWN_MS;
    } catch { return false; }
}
function rememberShown(): void {
    try { localStorage.setItem(SHOWN_KEY, String(Date.now())); } catch { /* 저장소를 못 쓰는 환경 */ }
}

/**
 * 알림을 새로 켰을 때 부른다(조건만 바꾼 저장에는 부르지 않는다).
 * `done` 은 끝난 일 한 줄("경기 알림을 켰어요"), `ok` 는 그대로 울리는 사람에게 보여 줄 토스트(없으면 done + 약속 한 줄).
 */
export async function announceAlertOn(done: string, ok?: string): Promise<void> {
    if (isNativeApp()) {
        let p = await pushPermission();
        if (p === "prompt") p = await requestPushPermission();
        if (p === "denied") {
            toast({
                title: done,
                description: "휴대폰 알림이 꺼져 있어 울리지 않아요. 알림함에는 남아요.",
                action: canOpenNotificationSettings()
                    ? <ToastAction altText="알림 설정 열기" onClick={() => { void openNotificationSettings(); }}>설정 열기</ToastAction>
                    : undefined,
            });
            return;
        }
        toast({ title: ok ?? `${done} — 올라오면 바로 알려 드려요` });
        return;
    }
    // 브라우저 — 푸시가 없다. 시트를 깔아 둔 화면이고 요즘 보여 준 적이 없으면 시트로, 아니면 토스트로 사실만 말한다.
    if (subs.size === 0 || shownRecently()) {
        toast({ title: done, description: "푸시는 랭큐 앱에서 울려요. 여기서는 알림함에 남아요." });
        return;
    }
    const p = detectPlatform();
    current = { title: done, store: p === "ios" || p === "android" ? p : null };
    rememberShown();
    emit();
}

/** CourseShell 이 한 번 깔아 둔다 — 브라우저에서 알림을 켠 사람에게 뜨는 시트 */
export function AlertReachHost() {
    const p = useSyncExternalStore(subscribe, () => current, () => null);
    // 닫히는 동안에도 글이 남아 있게(닫는 순간 current 가 비어 제목이 사라지면 시트가 덜컹한다)
    const [last, setLast] = useState<Prompt | null>(null);
    useEffect(() => { if (p) setLast(p); }, [p]);
    // 화면을 떠나면 닫는다 — 다음 화면에서 느닷없이 뜨지 않게
    useEffect(() => closePrompt, []);
    const s = p ?? last;
    const href = s?.store === "ios" ? iosStoreUrl("golf_alert") : s?.store === "android" ? androidStoreUrl("golf_alert") : null;

    return (
        <Sheet open={!!p} onOpenChange={(v) => { if (!v) closePrompt(); }}>
            <SheetContent side="bottom" className="bg-[#121212] text-white border-[#FFFFFF1A] rounded-t-2xl p-0">
                <SheetHeader className="px-5 pt-6 pb-0 text-left space-y-0">
                    <span className="w-11 h-11 rounded-full bg-[#FFC43D] flex items-center justify-center">
                        <LucideBellRing weight="fill" className="w-5 h-5 text-[#1F1500]" />
                    </span>
                    <SheetTitle className="pt-4 text-[20px] font-bold tracking-tight text-white break-keep">{s?.title}</SheetTitle>
                    <SheetDescription className="pt-2 text-[15px] leading-relaxed text-[#FFFFFFB3] break-keep">
                        {href
                            ? "푸시 알림은 랭큐 앱에서 울려요. 앱을 받고 같은 계정으로 로그인해 두면 올라오는 대로 휴대폰이 알려 줘요."
                            : "푸시 알림은 휴대폰의 랭큐 앱에서 울려요. 앱에서 같은 계정으로 로그인해 두세요."}
                    </SheetDescription>
                </SheetHeader>
                <p className="px-5 pt-3 text-[13px] leading-relaxed text-[#FFFFFF73] break-keep">
                    앱이 없어도 알림은 사라지지 않아요. 여기 알림함에 남아요.
                </p>
                <div className="px-5 pt-5 flex flex-col gap-2" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                    {href && (
                        <a
                            href={href} target="_blank" rel="noopener noreferrer" onClick={closePrompt}
                            className="h-12 rounded-xl bg-[#FFC43D] text-[#1F1500] text-[15px] font-semibold flex items-center justify-center active:bg-[#F0B22A]"
                        >
                            앱 받고 푸시로 받기
                        </a>
                    )}
                    <button
                        type="button" onClick={closePrompt}
                        className={href
                            ? "h-12 rounded-xl bg-[#FFFFFF0F] text-[14px] font-medium text-[#FFFFFFCC] active:bg-[#FFFFFF1A]"
                            : "h-12 rounded-xl bg-[#FFC43D] text-[#1F1500] text-[15px] font-semibold active:bg-[#F0B22A]"}
                    >
                        {href ? "알림함으로만 받을게요" : "확인"}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
