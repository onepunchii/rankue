import { useEffect, useState } from "react";
import {
    AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LucideLoader2 } from "@/lib/icons";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CREW_BTN } from "@/components/hiq/crew-ui";
import { FIELD_INPUT } from "./formKit";

/**
 * 크루 폐쇄 확인 — 크루 이름을 그대로 쳐야 지울 수 있다(2026-09-26).
 * 크루 삭제는 게시글·사진·채팅·정산까지 전부 지우고 되돌릴 수 없는데, 예전엔 확인 창의 '삭제' 한 번이면 끝났다.
 * 키트의 ConfirmDialog 는 입력칸이 없어 여기 따로 둔다(같은 AlertDialog 모양).
 */
export function DeleteCrewDialog({ open, onOpenChange, crewName, onConfirm, busy }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crewName: string;
    onConfirm: () => void;
    busy?: boolean;
}) {
    const { t } = useT();
    const [typed, setTyped] = useState("");
    useEffect(() => { if (!open) setTyped(""); }, [open]);
    const matches = typed.trim() === crewName.trim() && crewName.trim().length > 0;

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="w-[calc(100%-32px)] max-w-sm rounded-card">
                <AlertDialogHeader className="text-left">
                    <AlertDialogTitle className="text-[17px] font-semibold text-ink-1">{t("clubGeneralTab.deleteConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription className="text-[13px] font-medium text-ink-3 leading-relaxed">
                        {t("clubGeneralTab.deleteConfirmDesc")}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex flex-col gap-2">
                    <label htmlFor="crew-delete-name" className="text-[13px] font-semibold text-ink-2">
                        {t("crewMgmt.deleteTypeName").replace("{name}", crewName)}
                    </label>
                    <input
                        id="crew-delete-name"
                        autoComplete="off"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        placeholder={crewName}
                        className={FIELD_INPUT}
                    />
                </div>
                <AlertDialogFooter className="flex-row gap-2">
                    <AlertDialogCancel className="flex-1 h-11 mt-0 rounded-pill">{t("common.cancel")}</AlertDialogCancel>
                    <button
                        type="button"
                        disabled={!matches || busy}
                        onClick={onConfirm}
                        className={cn(CREW_BTN.danger, "flex-1")}
                    >
                        {busy ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : t("crewMgmt.deleteForever")}
                    </button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
