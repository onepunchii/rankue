import { memo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { LucideCheck } from "@/lib/icons";

/**
 * 비회원 길 찾기 무료 횟수(3번)를 다 썼을 때의 가입 안내(2026-09-27 오너: 검색 유입 → 가입).
 * 가입하면 이 화면(?path=1)으로 돌아온다 — landing·register 가 redirect 를 이어 준다.
 */
interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSignup: () => void;
}

export const GuestPathGate = memo(function GuestPathGate(p: Props) {
    const { t } = useT();
    const benefits = [t("promo.gate.b1"), t("promo.gate.b2"), t("promo.gate.b3")];
    return (
        <Dialog open={p.open} onOpenChange={p.onOpenChange}>
            <DialogContent hideClose className="sim-dark sim-table bg-[var(--surface-1)] max-w-[360px] rounded-card p-0 gap-0 flex flex-col">
                <DialogHeader className="px-6 pt-6 pb-1 text-left">
                    <span className="text-[28px] leading-none mb-1" aria-hidden="true">🎱</span>
                    <DialogTitle className="break-keep">{t("promo.gate.title")}</DialogTitle>
                    <DialogDescription className="text-[13px] font-medium text-ink-3 break-keep">{t("promo.gate.sub")}</DialogDescription>
                </DialogHeader>
                <ul className="px-6 pt-3 space-y-2">
                    {benefits.map((b) => (
                        <li key={b} className="flex items-center gap-2 text-[14px] font-semibold text-ink-1">
                            <span className="w-5 h-5 rounded-full bg-brand text-brand-fg inline-flex items-center justify-center shrink-0"><LucideCheck className="w-3 h-3" /></span>
                            <span className="break-keep">{b}</span>
                        </li>
                    ))}
                </ul>
                <div className="px-6 pb-6 pt-5 flex flex-col gap-2">
                    <Button type="button" onClick={p.onSignup} className="h-12 bg-brand hover:bg-brand/90 text-brand-fg font-bold rounded-xl text-[15px]">
                        {t("promo.gate.cta")}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => p.onOpenChange(false)} className="h-10 text-ink-3 font-semibold">
                        {t("promo.gate.later")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
});
