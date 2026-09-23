/**
 * 대화방 ⋯ 메뉴(2026-09-23 오너: "채팅에 나가기 버튼과 기본 채팅 기능들").
 * 셋만 둔다 — 참여자 보기 · 이 방 알림 끄기 · 나가기.
 *
 * 생김새는 오너가 보낸 화면을 따른다(2026-09-23: "해당 스타일로 변경해줘 … 심플하고 아이콘도 깔끔하게").
 * 묶음 카드 + **한 줄에 이름 하나**, 설명 줄 없음, 맨 아래 취소. 설명을 다 붙이면 시트가 답답해 보인다.
 *
 * 나가기는 **1:1·소그룹 방에서만** 보인다. 크루 방에서 나가는 것은 크루 탈퇴이고 조인/부킹 방은 신청 취소라,
 * 채팅 메뉴가 대신 눌러 주면 안 되는 일이다(각자 제 화면에 따로 있다). 문의 방은 나갈 대상이 아니다.
 * 알림 끄기는 크루 방이면 크루 알림 설정의 '채팅' 스위치를 그대로 움직인다 — 스위치를 두 곳에 두지 않으려는 것이다.
 */
import { useState } from "react";
import { LucideUsers, LucideBellOff, LucideBell, LucideLogOut, LucideLoader2, LucideChevronLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface ChatMenuMember { id: string; name: string; profileImageUrl: string | null }

/** 묶음 카드 — 줄 사이에만 선을 넣는다(카드 테두리는 라운드가 먹어 버린다). */
function Group({ children }: { children: React.ReactNode }) {
    return <div className="rounded-2xl bg-surface-2 overflow-hidden divide-y divide-surface-line">{children}</div>;
}

function Row({ Icon, label, right, danger, busy, onClick }: {
    Icon: React.ComponentType<{ className?: string }>; label: string; right?: string; danger?: boolean; busy?: boolean; onClick: () => void;
}) {
    return (
        <button
            type="button" onClick={onClick} disabled={busy}
            className="w-full h-[54px] flex items-center gap-3.5 px-4 text-left active:bg-surface-3 disabled:opacity-50"
        >
            {busy
                ? <LucideLoader2 className="w-[19px] h-[19px] animate-spin text-ink-3 shrink-0" />
                : <Icon className={cn("w-[19px] h-[19px] shrink-0 [stroke-width:1.75]", danger ? "text-red-500" : "text-ink-2")} />}
            <span className={cn("flex-1 text-[15px] font-medium truncate", danger ? "text-red-500" : "text-ink-1")}>{label}</span>
            {right && <span className="text-[13px] font-medium text-ink-3 shrink-0">{right}</span>}
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
            <SheetContent
                side="bottom" hideClose
                className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] focus:outline-none"
            >
                <SheetHeader className="sr-only">
                    <SheetTitle>{t("chat.menu.title")}</SheetTitle>
                    <SheetDescription>{t("chat.menu.title")}</SheetDescription>
                </SheetHeader>

                {showMembers ? (
                    <>
                        <div className="flex items-center gap-1 px-2 pt-2 pb-1">
                            <button type="button" onClick={() => setShowMembers(false)} aria-label={t("common.back")} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-2 active:bg-surface-2">
                                <LucideChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="text-[15px] font-semibold text-ink-1">{t("chat.menu.membersN").replace("{n}", String(members.length))}</span>
                        </div>
                        <div className="px-3 pb-2 max-h-[52vh] overflow-y-auto">
                            <div className="rounded-2xl bg-surface-2 overflow-hidden divide-y divide-surface-line">
                                {members.map((m) => (
                                    <div key={m.id} className="flex items-center gap-3 px-4 h-[54px]">
                                        <span className="w-8 h-8 rounded-full bg-surface-3 overflow-hidden shrink-0 flex items-center justify-center text-[12.5px] font-semibold text-ink-2">
                                            {m.profileImageUrl ? <img src={m.profileImageUrl} alt="" className="w-full h-full object-cover" /> : m.name.charAt(0)}
                                        </span>
                                        <span className="flex-1 text-[15px] font-medium text-ink-1 truncate">{m.name}</span>
                                        {m.id === meId && <span className="text-[13px] font-medium text-ink-3 shrink-0">{t("chat.menu.me")}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="px-3 pt-3 space-y-2">
                        <Group>
                            <Row Icon={LucideUsers} label={t("chat.menu.members")} right={String(members.length)} onClick={() => setShowMembers(true)} />
                        </Group>
                        <Group>
                            <Row Icon={muted ? LucideBell : LucideBellOff} busy={busy} label={muted ? t("chat.menu.unmute") : t("chat.menu.mute")} onClick={() => onToggleMute(!muted)} />
                            {canLeave && <Row Icon={LucideLogOut} label={t("chat.menu.leave")} danger busy={busy} onClick={onLeave} />}
                        </Group>
                        <button
                            type="button" onClick={() => onOpenChange(false)}
                            className="w-full h-[54px] rounded-2xl bg-surface-2 text-[15px] font-semibold text-ink-2 active:bg-surface-3"
                        >{t("common.cancel")}</button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
