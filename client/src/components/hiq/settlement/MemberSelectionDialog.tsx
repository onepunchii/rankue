import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LucideSearch, LucideCheck, LucideUsers } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";

interface MemberSelectionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    members: any[];
    selectedIds: string[];
    onConfirm: (selectedIds: string[]) => void;
}

export function MemberSelectionDialog({ open, onOpenChange, members, selectedIds: initialSelectedIds, onConfirm }: MemberSelectionDialogProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [tempSelectedIds, setTempSelectedIds] = useState<string[]>(initialSelectedIds);

    // Seed the in-dialog selection from props ONLY when the dialog opens. Using useMemo for a
    // side effect was impure and, because initialSelectedIds is a fresh array each parent render,
    // it re-ran on nearly every render and wiped the user's in-progress toggles. Keying the
    // effect on `open` alone runs the sync exactly once per open.
    useEffect(() => {
        if (open) {
            setTempSelectedIds(initialSelectedIds);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const filteredMembers = useMemo(() => {
        return members.filter(m =>
            m.member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (m.profileNickname && m.profileNickname.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }, [members, searchQuery]);

    const toggleMember = (id: string) => {
        setTempSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (tempSelectedIds.length === members.length) {
            setTempSelectedIds([]);
        } else {
            setTempSelectedIds(members.map(m => m.member.id));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#141416] border-white/10 text-white max-w-md p-0 flex flex-col max-h-[80vh] overflow-hidden z-[110] rounded-card">
                <DialogHeader className="p-4 border-b border-white/5 shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-[19px] font-bold tracking-tight">
                        <LucideUsers className="w-5 h-5 text-brand" />
                        참석자 선택 ({tempSelectedIds.length}명)
                    </DialogTitle>
                </DialogHeader>

                <div className="p-4 space-y-4 flex-1 flex flex-col min-h-0">
                    <div className="relative">
                        <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                        <Input
                            placeholder="멤버 이름 검색..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-black/40 border-white/10 pl-10 h-10"
                        />
                    </div>

                    <div className="flex items-center justify-between px-1">
                        <span className="text-[12px] font-medium text-white/45">멤버 리스트</span>
                        <button
                            onClick={toggleAll}
                            className="text-[12px] text-brand font-semibold hover:underline"
                        >
                            {tempSelectedIds.length === members.length ? "전체 해제" : "전체 선택"}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                        {filteredMembers.map(m => {
                            const isSelected = tempSelectedIds.includes(m.member.id);
                            return (
                                <div
                                    key={m.member.id}
                                    onClick={() => toggleMember(m.member.id)}
                                    className={cn(
                                        "flex items-center justify-between p-3 rounded-tile cursor-pointer transition-all",
                                        isSelected ? "bg-brand/12 border border-brand/20" : "hover:bg-white/5 border border-transparent"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <Avatar className="w-8 h-8 border border-white/10">
                                            <AvatarImage src={m.member.profileImageUrl} />
                                            <AvatarFallback className="bg-white/5 text-[12px]">{m.member.name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col">
                                            <span className="text-[15px] font-semibold">{m.member.name}</span>
                                            {m.role === 'leader' && <span className="text-[12px] text-brand font-semibold">크루장</span>}
                                        </div>
                                    </div>
                                    <div className={cn(
                                        "w-5 h-5 rounded-md border flex items-center justify-center transition-colors",
                                        isSelected ? "bg-brand border-brand" : "border-white/20"
                                    )}>
                                        {isSelected && <LucideCheck className="w-3 h-3 text-black" />}
                                    </div>
                                </div>
                            );
                        })}
                        {filteredMembers.length === 0 && (
                            <div className="py-10 text-center text-white/45 text-[13px] font-medium">
                                검색 결과가 없습니다
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="p-4 border-t border-white/5 bg-black/20 shrink-0">
                    <Button
                        onClick={() => {
                            onConfirm(tempSelectedIds);
                            onOpenChange(false);
                        }}
                        className="w-full h-12 rk-btn-primary rounded-tile"
                    >
                        {tempSelectedIds.length}명 선택 완료
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
