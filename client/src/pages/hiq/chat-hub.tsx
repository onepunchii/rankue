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

export interface ChatRoomRow {
    key: string;
    kind: "crew" | "listing";
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
    const rooms = q.data ?? [];
    const golf = currentSport === "GOLF";

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 pb-nav">
            <header className="sticky top-0 z-40 bg-surface-0/90 backdrop-blur border-b border-surface-line px-5 h-14 flex items-center justify-between">
                <h1 className="text-[18px] font-semibold">{t("chat.title")}</h1>
                {rooms.some((r) => r.unread > 0) && (
                    <span className="text-[12px] font-medium text-ink-3">{t("chat.unreadRooms").replace("{n}", String(rooms.filter((r) => r.unread > 0).length))}</span>
                )}
            </header>

            <main className="px-3 pt-2">
                {!member ? (
                    <p className="py-16 text-center text-[13px] font-medium text-ink-3">{t("chat.loginNeeded")}</p>
                ) : q.isPending ? (
                    <div className="flex justify-center py-16 text-ink-3"><LucideLoader2 className="w-5 h-5 animate-spin" /></div>
                ) : rooms.length === 0 ? (
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
                                    onClick={() => setLocation(r.kind === "crew" ? `/crew/${r.id}/chat` : `/chat/listing/${r.id}`)}
                                    className="w-full px-2 py-3 flex items-center gap-3 text-left active:bg-surface-2 rounded-xl transition-colors"
                                >
                                    <span className={cn("w-12 h-12 rounded-2xl shrink-0 overflow-hidden flex items-center justify-center text-[15px] font-semibold",
                                        r.kind === "crew" ? "bg-brand/10 text-brand" : r.listing?.listingType === "JOIN" ? "bg-[#FF6B00]/12 text-[#FF8A33]" : "bg-[#64DD17]/12 text-[#6DBE2A]")}>
                                        {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-full h-full object-cover" /> : r.kind === "crew" ? r.title.charAt(0) : (r.listing?.listingType === "JOIN" ? "조" : "부")}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className="text-[15px] font-semibold text-ink-1 truncate">{r.title}</span>
                                            <span className="text-[11.5px] font-medium text-ink-4 shrink-0">
                                                {r.kind === "crew" ? r.subtitle : `${r.listing?.joinType ? JOIN_TYPE_LABEL[r.listing.joinType as keyof typeof JOIN_TYPE_LABEL] ?? "" : r.listing?.listingType === "JOIN" ? "조인" : "부킹"} · ${r.listing ? teeLabel(r.listing.datetime) : ""}`}
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
            <HiqNavigation />
        </div>
    );
}
