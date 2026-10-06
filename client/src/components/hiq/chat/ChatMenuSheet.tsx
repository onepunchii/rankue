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
 *
 * 신고·차단(2026-10-06, 스토어 심사 1.2 — 9/21 채팅을 한 체계로 합치며 빠졌던 입구를 되살린다):
 *  - 참여자 줄: 내가 아닌 사람 오른쪽에 ⋯(UgcActionMenu, 회원 신고·차단). 문의 방은 상대가 운영자라 뺀다(reportable).
 *  - ChatReportSheet: 남의 **메시지**에서 여는 [신고] [차단하기] 두 줄. 무엇을 신고할지는 부르는 쪽이 정한다.
 */
import { useRef, useState } from "react";
import { LucideUsers, LucideBellOff, LucideBell, LucideLogOut, LucideLoader2, LucideChevronLeft, LucideFlag, LucideBan } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { UgcActionMenu } from "@/components/hiq/community/UgcActionMenu";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface ChatMenuMember { id: string; name: string; profileImageUrl: string | null }

/** 참여자가 이 수 이상일 때만 명단을 스크롤 상자에 넣는다 — 아래 memberMenuSide 설명 참고. */
const MEMBER_SCROLL_FROM = 4;

/**
 * 참여자 줄 ⋯ 메뉴가 펼쳐지는 쪽. 메뉴(약 90px)는 줄(54px)보다 커서 줄 밖으로 나간다 —
 * 맨 아래 두 줄은 위로 열어야 시트 아래로 잘리지 않고, 첫 줄은 위에 자리가 없어 늘 아래로 연다.
 * 스크롤 상자는 넘친 메뉴를 잘라 버리므로, 줄이 적어(3명 이하) 메뉴가 명단 밖으로 나갈 수밖에 없는 방은
 * 상자를 씌우지 않는다(MEMBER_SCROLL_FROM). 4명부터는 이 규칙대로면 메뉴가 늘 명단 안에 들어온다.
 * 다만 '명단 안'이 곧 '보이는 창 안'은 아니다 — 명단이 창(52vh)보다 길면 창 맨 아래에 걸린 줄의 메뉴는
 * 창 밖에 그려져 잘린다(700px 화면의 10명 방에서 7번째 줄은 메뉴가 통째로 안 보였다). 그래서 열 때 상자를 민다(revealMemberMenu).
 */
const memberMenuSide = (index: number, count: number): "top" | "bottom" => (index > 0 && index >= count - 2 ? "top" : "bottom");

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

export function ChatMenuSheet({ open, onOpenChange, members, meId, muted, canLeave, busy, onToggleMute, onLeave, reportable, onBlocked }: {
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
    /** 참여자 줄에 신고·차단 ⋯ 를 둔다 — 문의 방만 false(상대가 운영자다). */
    reportable?: boolean;
    /** 참여자를 차단한 직후 — 부르는 쪽이 그 사람 메시지를 화면에서 바로 걷는다. */
    onBlocked?: (memberId: string) => void;
}) {
    const { t } = useT();
    const [showMembers, setShowMembers] = useState(false);
    // 참여자 줄 ⋯ 메뉴가 열리면, 스크롤 상자의 보이는 창 밖으로 나간 만큼만 상자를 밀어 메뉴를 다 보이게 한다.
    // 메뉴는 늘 명단 안에 있으니(memberMenuSide) 밀면 반드시 다 들어온다. 상자가 없는 방(3명 이하)에서는 아무 일도 없다.
    const listRef = useRef<HTMLDivElement>(null);
    const revealMemberMenu = (opened: boolean) => {
        if (!opened) return;
        // 메뉴가 그려진 다음 틀에서 잰다
        requestAnimationFrame(() => {
            const box = listRef.current;
            const menu = box?.querySelector('[role="menu"]');
            if (!box || !menu) return;
            const view = box.getBoundingClientRect();
            const at = menu.getBoundingClientRect();
            if (at.bottom > view.bottom) box.scrollTop += at.bottom - view.bottom + 8;
            else if (at.top < view.top) box.scrollTop -= view.top - at.top + 8;
        });
    };

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
                        {/* 줄이 적은 방은 스크롤 상자를 씌우지 않고 아래 여백을 넉넉히 둔다 — ⋯ 메뉴가 명단 밖으로 펼쳐져도 잘리지 않게(memberMenuSide). */}
                        <div ref={listRef} className={cn("px-3", members.length >= MEMBER_SCROLL_FROM ? "pb-2 max-h-[52vh] overflow-y-auto" : "pb-6")}>
                            {/* 줄에 배경이 없어 모서리를 자를 것이 없다 — 여기에 overflow-hidden 을 두면 ⋯ 메뉴가 카드 밖에서 잘린다. */}
                            <div className="rounded-2xl bg-surface-2 divide-y divide-surface-line">
                                {members.map((m, i) => (
                                    <div key={m.id} className="flex items-center gap-3 px-4 h-[54px]">
                                        <span className="w-8 h-8 rounded-full bg-surface-3 overflow-hidden shrink-0 flex items-center justify-center text-[12.5px] font-semibold text-ink-2">
                                            {m.profileImageUrl ? <img src={m.profileImageUrl} alt="" className="w-full h-full object-cover" /> : m.name.charAt(0)}
                                        </span>
                                        <span className="flex-1 text-[15px] font-medium text-ink-1 truncate">{m.name}</span>
                                        {m.id === meId && <span className="text-[13px] font-medium text-ink-3 shrink-0">{t("chat.menu.me")}</span>}
                                        {/* 회원 신고·차단 — 내가 아닌 사람만. 누를 자리 44px, 줄 오른쪽 여백에 맞춰 살짝 당긴다. */}
                                        {reportable && !!meId && m.id !== meId && (
                                            <UgcActionMenu
                                                targetType="member" targetId={m.id} authorId={m.id} authorName={m.name}
                                                onBlocked={() => onBlocked?.(m.id)}
                                                side={memberMenuSide(i, members.length)} onOpenChange={revealMemberMenu}
                                                className="w-11 h-11 text-ink-3" iconClassName="w-[19px] h-[19px]" wrapperClassName="-mr-2.5"
                                            />
                                        )}
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

/**
 * 남의 메시지에서 여는 [신고] [차단하기](2026-10-06). 그 말풍선 옆 ⋯ 나 길게 누르기로 뜬다.
 * 대화방 메뉴와 같은 생김새(묶음 카드 + 한 줄에 이름 하나 + 취소)이고, 맨 위에 누구 것인지 한 줄로 알린다.
 * 차단을 신고 창 안에만 두지 않고 여기 바로 두는 까닭은 UgcActionMenu 와 같다 — 심사관이 '차단'을 한 번에 찾아야 하고,
 * 사유를 고르지 않고 그냥 안 보고 싶은 사람이 더 많다.
 */
export function ChatReportSheet({ open, onOpenChange, name, busy, onReport, onBlock }: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    /** 메시지를 보낸 사람 이름 */
    name: string;
    /** 차단 요청이 가는 중 */
    busy?: boolean;
    onReport: () => void;
    onBlock: () => void;
}) {
    const { t } = useT();
    const who = t("chat.report.of").replace("{name}", name);
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom" hideClose
                className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))] focus:outline-none"
            >
                <SheetHeader className="sr-only">
                    <SheetTitle>{t("chat.report.title")}</SheetTitle>
                </SheetHeader>
                <div className="px-3 pt-3 space-y-2">
                    {/* 누구 것인지 — 화면에 보이는 이 한 줄이 곧 시트 설명(읽어 주기)이다. */}
                    <SheetDescription className="px-2 pt-1 text-[13px] font-medium text-ink-3 truncate">{who}</SheetDescription>
                    <Group>
                        <Row Icon={LucideFlag} label={t("community.report")} onClick={onReport} />
                        <Row Icon={LucideBan} label={t("community.blockMenu")} danger busy={busy} onClick={onBlock} />
                    </Group>
                    <button
                        type="button" onClick={() => onOpenChange(false)}
                        className="w-full h-[54px] rounded-2xl bg-surface-2 text-[15px] font-semibold text-ink-2 active:bg-surface-3"
                    >{t("common.cancel")}</button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
