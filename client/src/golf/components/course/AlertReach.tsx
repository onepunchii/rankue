/**
 * 알림을 켠 직후 — 그 알림이 **어떻게 닿는지** 맞춰 준다(2026-10-05).
 *
 * 푸시는 랭큐 앱에서만 울린다(웹 푸시 없음 — lib/nativeBridge). 검색으로 들어온 사람은 대부분 브라우저라
 * "올라오면 바로 알려 드려요"는 그대로 두면 지켜지지 않는 말이다. 그래서 켠 자리에서:
 *   · 앱 + 권한 허용     → 토스트 한 줄(그대로 울린다)
 *   · 앱 + 아직 안 물음  → OS 권한 창(방금 '알림 받기'를 누른 사람이다 — PushPermissionSheet 와 같은 원칙)
 *   · 앱 + 권한 꺼짐     → 꺼져 있다고 알리고 설정으로
 *   · 브라우저           → 설치 팝업의 '알림' 판(2026-10-14 — components/hiq/AppInstallSheet openInstallForAlert):
 *                          "강남300 취소티 알림은 앱에서 울려요" + 기기별 스토어 · PC 는 QR · 로그인한 휴대폰은 '앱에서 열기'.
 *                          한 방문에 한 번, 그 사이엔 토스트(shared/alertReach). 알림은 막지 않는다 — 켜지고 알림함에 남는다.
 * 관심 골프장(WatchSheet)과 지역 알림(AreaAlert)이 같이 쓴다.
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말).
 */
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import {
    canOpenNotificationSettings, isNativeApp, openNotificationSettings, pushPermission, requestPushPermission,
} from "@/lib/nativeBridge";
import { queryClient } from "@/lib/queryClient";
import { openInstallForAlert } from "@/components/hiq/AppInstallSheet";
import { alertInstallTitle } from "@shared/alertReach";

/**
 * 알림을 새로 켰을 때 부른다(조건만 바꾼 저장에는 부르지 않는다).
 * `done` 은 끝난 일 한 줄("경기 알림을 켰어요"), `ok` 는 그대로 울리는 사람에게 보여 줄 토스트(없으면 done + 약속 한 줄).
 */
/** `what` 은 무엇의 알림인지("강남300 취소티") — 브라우저의 팝업 제목에 넣는다 */
export async function announceAlertOn(done: string, ok?: string, what?: string): Promise<void> {
    // 골프 홈 · 알림함의 띠(켜 둔 알림 수)가 바로 따라오게
    void queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf-courses/alerts/reach"] });
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
    // 브라우저 — 푸시가 없다. 이번 방문에 처음이면 설치 팝업('알림' 판), 아니면 토스트로 사실만 말한다
    if (openInstallForAlert({ title: alertInstallTitle(what, done), source: "golf_alert" })) return;
    toast({ title: done, description: "푸시는 랭큐 앱에서 울려요. 여기서는 알림함에 남아요." });
}
