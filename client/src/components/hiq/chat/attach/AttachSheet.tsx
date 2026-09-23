/**
 * 채팅 입력줄 "+" → 종목별 첨부 고르기(2026-09-23 오너: "당구·골프 채팅에 각각 + 아이콘").
 * 사진은 용량 때문에 뺐고, 우리가 이미 가진 DB·자산만 카드로 붙인다 — 당구는 매칭 대결·온라인 대전 초대·경기 결과·매장,
 * 골프는 조인/부킹 글·랭큐매치 핀·라운드 결과. 카드는 서버만 만들므로 여기서는 종류만 고른다.
 *
 * '내 기록'은 오너 지시로 **보내는 길만** 없앴다(2026-09-23) — 그 자리에 매칭 대결이 들어간다.
 * 이미 방에 남아 있는 MY_STATS 카드는 그대로 그려져야 하므로 ChatCard 의 case 와 서버 라우트는 건드리지 않았다.
 *
 * 아래에서 올라오는 시트(Radix Sheet). 검색칸이 없어 키보드 회피 문제(FriendPicker 참고)가 없다 — 검색이 있는 매장 고르기는
 * 다른 시트가 맡는다.
 */
import type { ComponentType } from "react";
import { LucideGamepad2, LucideFlag, LucideSwords, LucideMapPin, LucideCalendarDays, LucideKeyRound, LucideTrophy } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";

export type AttachItem = "MATCH_INVITE" | "SIM_INVITE" | "GAME_RESULT" | "STORE" | "GOLF_BOOKING" | "GOLF_MATCH" | "GOLF_ROUND";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sport: "BILLIARDS" | "GOLF";
    roomKind: "crew" | "listing" | "dm" | "support";
    onPick: (item: AttachItem) => void;
}

/** 타일 정의 — 이름·설명은 t("chat.attach.<key>")·t("chat.attach.<key>Desc"). */
const TILES: Record<AttachItem, { key: string; Icon: ComponentType<{ className?: string }> }> = {
    MATCH_INVITE: { key: "matchInvite", Icon: LucideSwords },
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

export function AttachSheet({ open, onOpenChange, sport, roomKind, onPick }: Props) {
    const { t } = useT();
    // support 방은 chat-room.tsx 가 onAttach 를 안 넘겨 + 자체가 없다 — 혹시 열려도 아무것도 안 그린다.
    if (roomKind === "support") return null;
    const items = sport === "GOLF" ? GOLF_ITEMS : BILLIARDS_ITEMS;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" hideClose className="bg-surface-0 text-ink-1 border-surface-line rounded-t-2xl p-0 pb-[calc(1rem+env(safe-area-inset-bottom))] focus:outline-none">
                <SheetHeader className="px-5 pt-5 pb-3 text-left">
                    <SheetTitle className="text-[16px] font-semibold text-ink-1">{t("chat.attach.title")}</SheetTitle>
                    <SheetDescription className="text-[12.5px] font-medium text-ink-3">{sport === "GOLF" ? t("chat.attach.descGolf") : t("chat.attach.descBilliards")}</SheetDescription>
                </SheetHeader>
                <div className="px-4 grid grid-cols-2 gap-2.5">
                    {items.map((item) => {
                        const { key, Icon } = TILES[item];
                        return (
                            <button
                                key={item} type="button"
                                onClick={() => { onOpenChange(false); onPick(item); }}
                                className="text-left rounded-2xl border border-surface-line bg-surface-2 px-3.5 py-3.5 active:bg-surface-3 transition-colors"
                            >
                                <span className="w-9 h-9 rounded-full bg-brand/10 text-brand flex items-center justify-center"><Icon className="w-[18px] h-[18px]" /></span>
                                <span className="block mt-2.5 text-[14px] font-semibold text-ink-1">{t(`chat.attach.${key}`)}</span>
                                <span className="block mt-0.5 text-[12px] font-medium text-ink-3 leading-snug">{t(`chat.attach.${key}Desc`)}</span>
                            </button>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}
