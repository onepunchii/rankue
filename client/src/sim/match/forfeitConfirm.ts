/**
 * "진행 중인 판이 있어요 — 기권하고 새로 만들까요?"(2026-10-26 — 멀티방에 치다 나간 판이 '진행 중'으로 남던 일).
 * 방 만들기 · 방 들어가기 · 코드로 들어가기가 같은 창을 쓴다(matchApi withForfeitConfirm 의 confirm).
 * 확인 단추는 빨강 — 옛 판은 내 기권(상대 승)으로 끝난다.
 */
import { appConfirm } from "@/components/AppDialog";

export function askForfeitPlaying(t: (key: string) => string): Promise<boolean> {
    return appConfirm({
        title: t("sim.match.hasPlaying.title"),
        message: t("sim.match.hasPlaying.body"),
        confirmText: t("sim.match.hasPlaying.ok"),
        cancelText: t("sim.match.hasPlaying.cancel"),
        tone: "danger",
    });
}
