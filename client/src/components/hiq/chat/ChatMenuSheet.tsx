/**
 * 대화방 ⋯ 메뉴(2026-09-23 오너: "채팅에 나가기 버튼과 기본 채팅 기능들").
 * 세 가지만 둔다 — 참여자 보기 · 이 방 알림 끄기 · 나가기.
 *
 * 나가기는 **1:1·소그룹 방에서만** 보인다. 크루 방에서 나가는 것은 크루 탈퇴이고 조인/부킹 방은 신청 취소라,
 * 채팅 메뉴가 대신 눌러 주면 안 되는 일이다(각자 제 화면에 따로 있다). 문의 방은 나갈 대상이 아니다.
 * 알림 끄기는 크루 방이면 크루 알림 설정의 '채팅' 스위치를 그대로 움직인다 — 스위치를 두 곳에 두지 않으려는 것이다.
 */
import { useState } from "react";
import { LucideUsers, LucideBellOff, LucideBell, LucideLogOut, LucideLoader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface ChatMenuMember { id: string; name: string; profileImageUrl: string | null }

function Row({ Icon, label, sub, danger, busy, onClick }: {
    Icon: React.ComponentType<{ className?: string }>; label: string; sub?: string; danger?: boolean; busy?: boolean; onClick: () => void;
}) {
    return (
        <button
            type="button" onClick={onClick} disabled={busy}
            className="w-full flex items-center gap-3 px-5 py-3.5 text-left active:bg-surface-2 disabled:opacity-50"
        >
            {busy ? <LucideLoader2 className="w-[18px] h-[18px] animate-spin text-ink-3 shrink-0" /> : <Icon className={cn("w-[18px] h-[18px] shrink-0", danger ? "text-red-500" : "text-ink-3")} />}
            <span className="min-w-0 flex-1">
                <span className={cn("block text-[14.5px] font-semibold", danger ? "text-red-500" : "text-ink-1")}>{label}</span>
                {sub && <span className="block text-[12px] font-medium text-ink-3 mt-0.5">{sub}</span>}
            </span>
        </button>
    );
}

export function ChatMenuSheet({ open, onOpenChange, members, meId, muted, canLeave, busy, onToggleMute, onLeave }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    members: ChatMenuMember[];
    meId?: string;
    muted: boolean;
    /** 1:1·소그룹 방만 true */
    canLeave: boolean;
    busy?: boolean;
    onToggleMute: (next: boolean) => void;
    onLeave: () => void;
}) {
    const { t } = useT();
    const [showMembers, setShowMembers] = useState(false);

    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) setShowMembers(false); onOpenChange(o); }}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
                <SheetHeader className="px-5 pt-5 pb-2 text-left">
                    <SheetTitle className="text-[16px] font-semibold text-ink-1">{showMembers ? t("chat.menu.membersN").replace("{n}", String(members.length)) : t("chat.menu.title")}</SheetTitle>
                    <SheetDescription className="sr-only">{t("chat.menu.title")}</SheetDescription>
                </SheetHeader>

                {showMembers ? (
                    <div className="max-h-[52vh] overflow-y-auto pb-3">
                        {members.map((m) => (
                            <div key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                                <span className="w-9 h-9 rounded-full bg-surface-3 overflow-hidden shrink-0 flex items-center justify-center text-[13px] font-semibold text-ink-2">
                                    {m.profileImageUrl ? <img src={m.profileImageUrl} alt="" className="w-full h-full object-cover" /> : m.name.charAt(0)}
                                </span>
                                <span className="text-[14px] font-medium text-ink-1 truncate">{m.name}</span>
                                {m.id === meId && <span className="px-1.5 py-0.5 rounded-md bg-brand/10 text-brand text-[11px] font-semibold shrink-0">{t("chat.menu.me")}</span>}
                            </div>
                        ))}
                        <button type="button" onClick={() => setShowMembers(false)} className="mt-1 w-full h-11 text-[13.5px] font-semibold text-ink-3">{t("common.back")}</button>
                    </div>
                ) : (
                    <div className="pb-3">
                        <Row Icon={LucideUsers} label={t("chat.menu.members")} sub={t("chat.menu.membersN").replace("{n}", String(members.length))} onClick={() => setShowMembers(true)} />
                        <Row
                            Icon={muted ? LucideBell : LucideBellOff} busy={busy}
                            label={muted ? t("chat.menu.unmute") : t("chat.menu.mute")}
                            sub={muted ? t("chat.menu.unmuteDesc") : t("chat.menu.muteDesc")}
                            onClick={() => onToggleMute(!muted)}
                        />
                        {canLeave && <Row Icon={LucideLogOut} label={t("chat.menu.leave")} sub={t("chat.menu.leaveDesc")} danger busy={busy} onClick={onLeave} />}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
