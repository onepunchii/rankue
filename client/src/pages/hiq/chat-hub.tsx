/**
 * 채팅 탭(2026-09-21 오너: "하단 '전체' 대신 메시지"). 내 방 전부 — 크루 방 + 조인·부킹 방 — 마지막 메시지 순.
 * 크루 방을 누르면 크루 채팅 탭으로, 조인·부킹 방은 전용 방으로. 안 읽은 수 배지는 방마다.
 * 목록은 15초마다 조용히 갱신한다(방 안에서는 2.5초 폴링 — 여기서는 그럴 이유가 없다).
 */
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LucideLoader2, LucideChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { JOIN_TYPE_LABEL } from "@shared/golfJoin";
import { FriendPicker } from "@/components/hiq/chat/FriendPicker";
import { LucidePlus, LucideHeadset } from "lucide-react";
import { useEffect, useState } from "react";

export interface ChatRoomRow {
    key: string;
    kind: "crew" | "listing" | "dm" | "support";
    id: string;
    title: string;
    subtitle: string;
    imageUrl: string | null;
    listing?: { listingType: string; joinType: string | null; datetime: string; courseName: string; region: string };
    lastMessage: { text: string; at: string; senderName: string | null } | null;
    unread: number;
    memberCount: number;
}

export const CHAT_ROOMS_KEY = (sport: string) => ["/api/hiq/chat/rooms", sport] as const;

/** "방금·n분 전·n시간 전·어제·9/25" — 목록용 짧은 시각 */
export function agoLabel(iso: string, now = Date.now()): string {
    const ms = now - new Date(iso).getTime();
    if (ms < 60_000) return "방금";
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 전`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 전`;
    if (ms < 2 * 86_400_000) return "어제";
    const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function teeLabel(iso: string): string {
    const d = new Date(new Date(iso).getTime() + 9 * 3_600_000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export default function ChatHub() {
    const { t } = useT();
    const [, setLocation] = useLocation();
    const { member } = useAuth();
    const { currentSport } = useSport();
    const q = useQuery<ChatRoomRow[]>({
        queryKey: CHAT_ROOMS_KEY(currentSport),
        queryFn: () => apiRequest(`/api/hiq/chat/rooms?sport=${currentSport}`),
        enabled: !!member,
        refetchInterval: 15_000,
        staleTime: 5_000,
    });
    const allRooms = q.data ?? [];
    const golf = currentSport === "GOLF";
    const [pickerOpen, setPickerOpen] = useState(false);
    const isAdmin = (member as any)?.role === "admin" || (member as any)?.role === "super_admin";
    // 종류 칩(2026-09-21 오너: "종목에 맞는 채팅 카테고리") — 골프는 조인·부킹/크루/친구, 당구는 크루/친구.
    // 방이 있는 종류만 칩이 되고, 두 종류 이상일 때만 줄이 보인다(방 두세 개인 사람에게 칩은 소음).
    const [kindFilter, setKindFilter] = useState<"all" | ChatRoomRow["kind"]>("all");
    const kindOrder: ChatRoomRow["kind"][] = golf ? ["listing", "crew", "dm", "support"] : ["crew", "dm", "support"];
    const kindLabel: Record<ChatRoomRow["kind"], string> = { listing: t("chat.filterListing"), crew: t("chat.filterCrew"), dm: t("chat.filterDm"), support: t("chat.filterSupport") };
    const kindsPresent = kindOrder.filter((k) => allRooms.some((r) => r.kind === k));
    const showChips = kindsPresent.length >= 2;
    const activeKind = showChips && kindsPresent.includes(kindFilter as ChatRoomRow["kind"]) ? kindFilter : "all";
    const rooms = activeKind === "all" ? allRooms : allRooms.filter((r) => r.kind === activeKind);
    // 고른 종류가 목록에서 사라졌으면(방이 닫힘·종목 전환) 고른 것도 지운다 — 안 지우면 나중에 그 종류가 돌아올 때 고르지도 않은 필터가 되살아난다.
    useEffect(() => { if (q.data && kindFilter !== "all" && activeKind === "all") setKindFilter("all"); }, [q.data, kindFilter, activeKind]);
    const unreadOf = (k: "all" | ChatRoomRow["kind"]) => allRooms.filter((r) => k === "all" || r.kind === k).reduce((n, r) => n + r.unread, 0);
    const roomPath = (r: ChatRoomRow) => (r.kind === "crew" ? `/chat/crew/${r.id}` : `/chat/${r.kind}/${r.id}`);

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 pb-nav">
            <header className="sticky top-0 z-40 bg-surface-0/90 backdrop-blur border-b border-surface-line px-5 h-14 flex items-center justify-between gap-2">
                <h1 className="text-[18px] font-semibold">{t("chat.title")}</h1>
                {member && (
                    <div className="flex items-center gap-1.5">
                        {!isAdmin && (
                            <button type="button" onClick={() => setLocation(`/chat/support/${member.id}`)} className="h-9 px-3 rounded-full bg-surface-2 text-[12.5px] font-medium text-ink-2 inline-flex items-center gap-1.5" title={t("chat.support")}>
                                <LucideHeadset className="w-4 h-4" /> {t("chat.support")}
                            </button>
                        )}
                        <button type="button" onClick={() => setPickerOpen(true)} className="h-9 px-3 rounded-full bg-brand text-brand-fg text-[12.5px] font-semibold inline-flex items-center gap-1" title={t("chat.newChat")}>
                            <LucidePlus className="w-4 h-4" /> {t("chat.newChat")}
                        </button>
                    </div>
                )}
            </header>

            {member && showChips && (
                <div className="sticky top-14 z-30 bg-surface-0/90 backdrop-blur px-3 py-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {(["all", ...kindsPresent] as ("all" | ChatRoomRow["kind"])[]).map((k) => {
                        const on = activeKind === k;
                        const n = unreadOf(k);
                        return (
                            <button
                                key={k} type="button" onClick={() => setKindFilter(k)}
                                className={cn("h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors",
                                    on ? "bg-ink-1 text-surface-0" : "bg-surface-2 text-ink-2")}
                            >
                                {k === "all" ? t("chat.filterAll") : kindLabel[k]}
                                {n > 0 && <span className={cn("min-w-[16px] h-4 px-1 rounded-full text-[10px] rk-num flex items-center justify-center", on ? "bg-surface-0/20 text-surface-0" : "bg-brand text-brand-fg")}>{n > 99 ? "99+" : n}</span>}
                            </button>
                        );
                    })}
                </div>
            )}
            <main className="px-3 pt-2">
                {!member ? (
                    <p className="py-16 text-center text-[13px] font-medium text-ink-3">{t("chat.loginNeeded")}</p>
                ) : q.isPending ? (
                    <div className="flex justify-center py-16 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                ) : allRooms.length === 0 ? (
                    <div className="py-16 px-6 text-center space-y-3">
                        <p className="text-[15px] font-semibold text-ink-1">{t("chat.emptyTitle")}</p>
                        <p className="text-[13px] font-medium text-ink-3 leading-relaxed">{golf ? t("chat.emptyGolf") : t("chat.emptyBilliards")}</p>
                        <button type="button" onClick={() => setLocation(golf ? "/golf/booking-list?view=JOIN" : "/club")} className="h-11 px-5 rounded-full bg-brand text-brand-fg text-[14px] font-semibold">
                            {golf ? t("chat.goJoin") : t("chat.goCrew")}
                        </button>
                    </div>
                ) : (
                    <ul className="divide-y divide-surface-line">
                        {rooms.map((r) => (
                            <li key={r.key}>
                                <button
                                    type="button"
                                    onClick={() => setLocation(roomPath(r))}
                                    className="w-full px-2 py-3 flex items-center gap-3 text-left active:bg-surface-2 rounded-xl transition-colors"
                                >
                                    <span className={cn("w-12 h-12 shrink-0 overflow-hidden flex items-center justify-center text-[15px] font-semibold",
                                        r.kind === "dm" ? "rounded-full bg-surface-3 text-ink-2" : "rounded-2xl",
                                        r.kind === "crew" ? "bg-brand/10 text-brand" : r.kind === "support" ? "bg-[#6E5BC8]/20 text-[#B8A7FF]" : r.kind === "listing" ? (r.listing?.listingType === "JOIN" ? "bg-[#FF6B00]/12 text-[#FF8A33]" : "bg-[#64DD17]/12 text-[#6DBE2A]") : "")}>
                                        {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-full h-full object-cover" /> : r.kind === "support" ? <LucideHeadset className="w-5 h-5" /> : r.kind === "listing" ? (r.listing?.listingType === "JOIN" ? "조" : "부") : r.title.charAt(0)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="text-[15px] font-semibold text-ink-1 truncate">{r.title}</span>
                                            <span className="text-[11.5px] font-medium text-ink-4 shrink-0">
                                                {r.kind === "listing" ? `${r.listing?.joinType ? JOIN_TYPE_LABEL[r.listing.joinType as keyof typeof JOIN_TYPE_LABEL] ?? "" : r.listing?.listingType === "JOIN" ? "조인" : "부킹"} · ${r.listing ? teeLabel(r.listing.datetime) : ""}` : r.subtitle}
                                            </span>
                                        </span>
                                        <span className={cn("block text-[13px] truncate mt-0.5", r.unread > 0 ? "text-ink-1 font-medium" : "text-ink-3")}>
                                            {r.lastMessage ? `${r.lastMessage.senderName ? r.lastMessage.senderName + ": " : ""}${r.lastMessage.text}` : t("chat.noMessagesYet")}
                                        </span>
                                    </span>
                                    <span className="shrink-0 flex flex-col items-end gap-1">
                                        <span className="text-[11px] text-ink-4">{r.lastMessage ? agoLabel(r.lastMessage.at) : ""}</span>
                                        {r.unread > 0
                                            ? <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-brand-fg text-[11px] font-semibold flex items-center justify-center rk-num">{r.unread > 99 ? "99+" : r.unread}</span>
                                            : <LucideChevronRight className="w-4 h-4 text-ink-4" />}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </main>
            <FriendPicker open={pickerOpen} onOpenChange={setPickerOpen} sport={currentSport} />
            <HiqNavigation />
        </div>
    );
}
