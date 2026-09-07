import { memo } from "react";
import { useT } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// 나가기 확인. 기록 세션이 진행 중이면 "중단으로 기록", 연습이면 "저장 안 됨", 끝난 경기면 "이미 기록됨".
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    record: boolean;
    offline: boolean;
    finished: boolean;
    busy: boolean;
    onConfirm: () => void;
    /** 설명 문구 덮어쓰기(대전: 서버에 남는다는 안내) */
    desc?: string;
}

export const ExitConfirm = memo(function ExitConfirm(p: Props) {
    const { t } = useT();
    const desc = p.desc ?? (!p.record || p.offline
        ? t("sim.exit.descPractice")
        : p.finished ? t("sim.exit.descFinished") : t("sim.exit.descRecord"));
    return (
        <Dialog open={p.open} onOpenChange={(o) => { if (!p.busy) p.onOpenChange(o); }}>
            {/* 취소·나가기 두 갈래면 충분하다 — 오른쪽 위 X 까지 있으면 닫는 길이 셋이 된다 */}
            <DialogContent hideClose className="max-w-[360px] rounded-card p-0 gap-0 flex flex-col">
                <DialogHeader className="px-6 pt-6 pb-2 text-left">
                    <DialogTitle>{t("sim.exit.title")}</DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-ink-3">{desc}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="px-6 pb-6 pt-4 flex-row gap-2">
                    <Button
                        type="button" variant="outline" onClick={() => p.onOpenChange(false)} disabled={p.busy}
                        className="flex-1 h-12 rounded-xl border-surface-line text-ink-2 font-semibold"
                    >
                        {t("sim.common.cancel")}
                    </Button>
                    <Button
                        type="button" onClick={p.onConfirm} disabled={p.busy}
                        className="flex-1 h-12 bg-brand hover:bg-brand/90 text-brand-fg font-semibold rounded-xl"
                    >
                        {t("sim.exit.confirm")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
