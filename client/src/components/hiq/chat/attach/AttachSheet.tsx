/**
 * 채팅 입력줄 "+" → 종목별 첨부 고르기(2026-09-23 오너: "당구·골프 채팅에 각각 + 아이콘").
 * 사진은 용량 때문에 뺐고, 우리가 이미 가진 DB·자산만 카드로 붙인다 — 당구는 매칭 대결·온라인 대전 초대·경기 결과·매장,
 * 골프는 조인/부킹 글·랭큐매치 핀·라운드 결과. 카드는 서버만 만들므로 여기서는 종류만 고른다.
 *
 * '내 기록'은 오너 지시로 **보내는 길만** 없앴다(2026-09-23) — 그 자리에 매칭 대결이 들어간다.
 * 이미 방에 남아 있는 MY_STATS 카드는 그대로 그려져야 하므로 ChatCard 의 case 와 서버 라우트는 건드리지 않았다.
 *
 * 크루 방(2026-09-26 크루 채팅 1단계, 오너 승인 시안)은 위에 "우리 크루" 줄(정모 만들기·투표·정산 요청·공지)을 더 두고,
 * 아래에 종목 줄을 그대로 둔다. 정산 요청·공지는 운영진만(크루 홈의 정산 창·공지 고정과 같은 권한).
 *
 * 아래에서 올라오는 시트(Radix Sheet). 검색칸이 없어 키보드 회피 문제(FriendPicker 참고)가 없다 — 검색이 있는 매장 고르기는
 * 다른 시트가 맡는다.
 */
import type { ComponentType } from "react";
import { LucideGamepad2, LucideFlag, LucideTarget, LucideMapPin, LucideCalendarDays, LucideKeyRound, LucideTrophy } from "lucide-react";
import { LucideBarChart3, LucideCalendarPlus, LucideMegaphone, LucideReceipt, LucideUsers } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";

export type AttachItem = "MATCH_INVITE" | "SIM_INVITE" | "GAME_RESULT" | "STORE" | "GOLF_BOOKING" | "GOLF_MATCH" | "GOLF_ROUND";
/** 크루 방 전용 줄 — 카드 라우트가 아니라 크루 기능(정모·투표·정산·공지 글)을 먼저 만들고 그걸 카드로 붙인다. */
export type CrewAttachItem = "CREW_MEETUP" | "CREW_POLL" | "CREW_SETTLE" | "CREW_NOTICE";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sport: "BILLIARDS" | "GOLF";
    roomKind: "crew" | "listing" | "dm" | "support";
    onPick: (item: AttachItem) => void;
    /** 크루 방 운영진 — 정산 요청·공지 칸을 보인다. */
    canManage?: boolean;
    onPickCrew?: (item: CrewAttachItem) => void;
}

/** 타일 정의 — 이름은 t("chat.attach.<key>"). 설명 줄은 2026-09-23 에 뺐다(오너: "내용이 너무 많아"). */
const TILES: Record<AttachItem, { key: string; Icon: ComponentType<{ className?: string }> }> = {
    MATCH_INVITE: { key: "matchInvite", Icon: LucideTarget },
    SIM_INVITE: { key: "simInvite", Icon: LucideGamepad2 },
    GAME_RESULT: { key: "gameResult", Icon: LucideFlag },
    STORE: { key: "store", Icon: LucideMapPin },
    GOLF_BOOKING: { key: "golfBooking", Icon: LucideCalendarDays },
    GOLF_MATCH: { key: "golfMatch", Icon: LucideKeyRound },
    GOLF_ROUND: { key: "golfRound", Icon: LucideTrophy },
};

// 실제 테이블에서 치는 매칭 대결이 먼저다 — 대화 중 "한 판 치자"가 제일 잦은 쓰임이라 첫 칸.
const BILLIARDS_ITEMS: AttachItem[] = ["MATCH_INVITE", "SIM_INVITE", "GAME_RESULT", "STORE"];
const GOLF_ITEMS: AttachItem[] = ["GOLF_BOOKING", "GOLF_MATCH", "GOLF_ROUND"];

const CREW_TILES: Record<CrewAttachItem, { key: string; Icon: ComponentType<{ className?: string }>; staff?: boolean }> = {
    CREW_MEETUP: { key: "crewMeetup", Icon: LucideCalendarPlus },
    CREW_POLL: { key: "crewPoll", Icon: LucideBarChart3 },
    CREW_SETTLE: { key: "crewSettle", Icon: LucideReceipt, staff: true },
    CREW_NOTICE: { key: "crewNotice", Icon: LucideMegaphone, staff: true },
};
const CREW_ITEMS: CrewAttachItem[] = ["CREW_MEETUP", "CREW_POLL", "CREW_SETTLE", "CREW_NOTICE"];

function Tile({ label, Icon, tinted, onClick }: { label: string; Icon: ComponentType<{ className?: string }>; tinted?: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl active:bg-surface-2 transition-colors">
            <span className={cn("w-[52px] h-[52px] rounded-2xl flex items-center justify-center", tinted ? "bg-brand/10 text-brand" : "bg-surface-2 text-ink-1")}><Icon className="w-[22px] h-[22px]" /></span>
            <span className="text-[12px] font-medium text-ink-2 text-center leading-tight">{label}</span>
        </button>
    );
}

export function AttachSheet({ open, onOpenChange, sport, roomKind, onPick, canManage, onPickCrew }: Props) {
    const { t } = useT();
    // support 방은 chat-room.tsx 가 onAttach 를 안 넘겨 + 자체가 없다 — 혹시 열려도 아무것도 안 그린다.
    if (roomKind === "support") return null;
    const items = sport === "GOLF" ? GOLF_ITEMS : BILLIARDS_ITEMS;
    const crew = roomKind === "crew" && !!onPickCrew ? CREW_ITEMS.filter((i) => !CREW_TILES[i].staff || canManage) : [];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[calc(1rem+env(safe-area-inset-bottom))] focus:outline-none">
                <SheetHeader className={cn("px-5 pt-4 pb-1 text-left", crew.length > 0 && "sr-only")}>
                    <SheetTitle className="text-[15px] font-semibold text-ink-1">{t("chat.attach.title")}</SheetTitle>
                    <SheetDescription className="sr-only">{sport === "GOLF" ? t("chat.attach.descGolf") : t("chat.attach.descBilliards")}</SheetDescription>
                </SheetHeader>
                {/* 크루 방: 위에 크루 줄(브랜드 색 칸), 가는 줄, 아래 종목 줄. 다른 방은 종목 줄만(예전 그대로). */}
                {crew.length > 0 && (
                    <>
                        <p className="px-5 pt-4 pb-0.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-brand"><LucideUsers className="w-3.5 h-3.5" />{t("chat.attach.crewSection")}</p>
                        <div className="px-4 pt-1 grid grid-cols-4 gap-1">
                            {crew.map((item) => {
                                const { key, Icon } = CREW_TILES[item];
                                return <Tile key={item} label={t(`chat.attach.${key}`)} Icon={Icon} tinted onClick={() => { onOpenChange(false); onPickCrew!(item); }} />;
                            })}
                        </div>
                        <div className="mx-5 mt-2 border-t border-surface-line" />
                        <p className="px-5 pt-3 pb-0.5 text-[12.5px] font-semibold text-ink-3">{sport === "GOLF" ? t("chat.attach.sportGolf") : t("chat.attach.sportBilliards")}</p>
                    </>
                )}
                {/* 이름만 남긴 한 줄짜리 칸(2026-09-23 오너: "내용이 너무 많아 심플하고 아이콘도 깔끔하게").
                    설명 줄은 뺐다 — 이름만으로 뜻이 서는 넷뿐이고, 설명이 붙으면 시트가 화면 절반을 먹는다. */}
                <div className={cn("px-4 grid grid-cols-4 gap-1", crew.length > 0 ? "pt-1" : "pt-2")}>
                    {items.map((item) => {
                        const { key, Icon } = TILES[item];
                        return <Tile key={item} label={t(`chat.attach.${key}`)} Icon={Icon} onClick={() => { onOpenChange(false); onPick(item); }} />;
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}
