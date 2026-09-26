import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LucideSearch, LucideCheck } from "@/lib/icons";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { CREW_BTN, CREW_TEXT, CrewAvatar } from "@/components/hiq/crew-ui";

// 정산 차수의 참석자 고르기. 2026-09-26: 크루 공통 토큰·글자 크기로 정리(골프 어두운 테마에서 흰 판·검은 글씨가 떴다),
// "N명 선택" 문구를 앞뒤 조각 이어 붙이기 대신 {n} 틀로.

interface MemberSelectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    members: any[];
    selectedIds: string[];
    onConfirm: (selectedIds: string[]) => void;
}

export function MemberSelectionDialog({ open, onOpenChange, members, selectedIds: initialSelectedIds, onConfirm }: MemberSelectionDialogProps) {
    const { t } = useT();
    const [searchQuery, setSearchQuery] = useState("");
    const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(initialSelectedIds);

    // Seed the in-dialog selection from props ONLY when the dialog opens. Using useMemo for a
    // side effect was impure and, because initialSelectedIds is a fresh array each parent render,
    // it re-ran on nearly every render and wiped the user's in-progress toggles. Keying the
    // effect on `open` alone runs the sync exactly once per open.
    useEffect(() => {
        if (open) {
            setTempSelectedIds(initialSelectedIds);
            setSearchQuery("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const filteredMembers = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return members.filter(m =>
            m.member.name.toLowerCase().includes(q) ||
            (m.profileNickname && m.profileNickname.toLowerCase().includes(q))
        );
    }, [members, searchQuery]);

    const toggleMember = (id: string) => {
        setTempSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const allSelected = tempSelectedIds.length === members.length;
    const toggleAll = () => setTempSelectedIds(allSelected ? [] : members.map(m => m.member.id));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-surface-1 text-ink-1 max-w-md p-0 gap-0 flex flex-col max-h-[80dvh] overflow-hidden z-[110] rounded-card">
                <DialogHeader className="px-4 pt-5 pb-3 pr-14 text-left shrink-0">
                    <DialogTitle className={CREW_TEXT.section}>
                        {t("crewSettle.selectTitle").replace("{n}", String(tempSelectedIds.length))}
                    </DialogTitle>
                </DialogHeader>

                <div className="px-4 flex-1 flex flex-col gap-2 min-h-0">
                    <div className="relative">
                        <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
                        <Input
                            placeholder={t("memberSelection.searchPlaceholder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-11 pl-10 text-[15px] bg-surface-2 border-surface-line rounded-tile"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <span className={CREW_TEXT.caption}>{t("memberSelection.memberList")}</span>
                        <button type="button" onClick={toggleAll} className="h-11 -mr-2 px-2 text-[13px] font-semibold text-brand">
                            {allSelected ? t("memberSelection.deselectAll") : t("memberSelection.selectAll")}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-2 flex flex-col gap-1 custom-scrollbar" role="group">
                        {filteredMembers.map(m => {
                            const isSelected = tempSelectedIds.includes(m.member.id);
                            return (
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={isSelected}
                                    key={m.member.id}
                                    onClick={() => toggleMember(m.member.id)}
                                    className={cn(
                                        "w-full min-h-12 flex items-center justify-between gap-3 px-3 py-1.5 rounded-tile border text-left transition-colors",
                                        isSelected ? "bg-brand/10 border-brand/30" : "border-transparent active:bg-surface-3",
                                    )}
                                >
                                    <span className="flex items-center gap-3 min-w-0">
                                        <CrewAvatar src={m.member.profileImageUrl} name={m.member.name} size={32} />
                                        <span className="flex flex-col min-w-0">
                                            <span className="truncate text-[15px] font-medium text-ink-1">{m.member.name}</span>
                                            {m.role === "leader" && <span className="text-[12px] font-semibold text-brand">{t("memberSelection.leader")}</span>}
                                        </span>
                                    </span>
                                    <span aria-hidden="true" className={cn(
                                        "w-5 h-5 shrink-0 rounded-[6px] border-2 flex items-center justify-center",
                                        isSelected ? "bg-brand border-brand text-brand-fg" : "border-[var(--surface-line-strong)]",
                                    )}>
                                        {isSelected && <LucideCheck className="w-3 h-3" />}
                                    </span>
                                </button>
                            );
                        })}
                        {filteredMembers.length === 0 && (
                            <p className={cn(CREW_TEXT.sub, "py-10 text-center")}>{t("memberSelection.noResults")}</p>
                        )}
                    </div>
                </div>

                <DialogFooter className="px-4 pt-3 pb-4 border-t border-surface-line shrink-0">
                    <button
                        type="button"
                        onClick={() => { onConfirm(tempSelectedIds); onOpenChange(false); }}
                        className={cn(CREW_BTN.primary, "w-full")}
                    >
                        {t("crewSettle.selectConfirm").replace("{n}", String(tempSelectedIds.length))}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
