/**
 * 같이 한 판 — 종목만 고른다(2026-09-23 오너: "친구 초대·같이하기를 엄청 간소화").
 *
 * 나머지는 서버가 정한다: 대대, **핸디전**(상대가 들어오는 순간 두 사람의 온라인 기록으로 각자 목표가 정해진다 —
 * 자기신고 다마수를 그대로 쓰지 않는다), 비밀번호 없음. 이미 열어 둔 내 대기 방이 있으면 그 방을 다시 쓴다.
 */
import { LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";

export type SimGameType = "3c" | "4c";

export function SimInviteSheet({ open, onOpenChange, busy, onPick }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    busy?: boolean;
    onPick: (gameType: SimGameType) => void;
}) {
    const { t } = useT();
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
                <SheetHeader className="px-5 pt-5 pb-3 text-left">
                    <SheetTitle className="text-[17px] font-semibold text-ink-1">{t("chat.attach.simInvite")}</SheetTitle>
                    <SheetDescription className="text-[12.5px] text-ink-3 leading-relaxed">{t("chat.attach.simInvitePick")}</SheetDescription>
                </SheetHeader>
                <div className="px-4 grid grid-cols-2 gap-2.5">
                    {(["3c", "4c"] as const).map((g) => (
                        <button
                            key={g} type="button" disabled={busy} onClick={() => onPick(g)}
                            className="h-24 rounded-2xl bg-surface-2 active:bg-surface-3 disabled:opacity-50 flex flex-col items-center justify-center gap-1 transition-colors"
                        >
                            <span className="text-[16px] font-semibold text-ink-1">{t(g === "3c" ? "chat.attach.threeBall" : "chat.attach.fourBall")}</span>
                            <span className="text-[12px] font-medium text-ink-3">{t("chat.attach.simInviteHandicap")}</span>
                        </button>
                    ))}
                </div>
                <p className="px-5 pt-3 pb-5 text-[11.5px] font-medium text-ink-4 leading-relaxed flex items-center gap-1.5">
                    {busy && <LucideLoader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                    {t("chat.attach.simInviteNote")}
                </p>
            </SheetContent>
        </Sheet>
    );
}
