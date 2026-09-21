/**
 * 조인·부킹 대화방(2026-09-21). 올린 사람 + 확정된 사람만.
 * 위에 글 카드(장소·시각·지도·길찾기)가 고정되고 아래가 대화다.
 *
 * 폴링: 2.5초마다 `after`(마지막 메시지 시각) 뒤만 받는다 — 새 게 없으면 빈 배열이라 가볍다. 화면이 가려지면 쉰다.
 * 보내기: 즉시 내 말풍선(pending) → 서버 행으로 교체. 실패하면 빨갛게, 누르면 다시 보낸다.
 * 읽음: 방을 열 때와 아래를 보고 있는 동안 새 메시지가 오면 서버에 "봤다"를 적는다(하단 배지·목록 안 읽은 수의 근거).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideChevronLeft, LucideMapPin } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ChatRoom, type ChatMsg } from "@/components/hiq/chat/ChatRoom";
import { JoinTypeBadge, joinTypeOf, kakaoMapUrl, kakaoRouteUrl } from "@/golf/components/join/joinUi";
import { kstDateLabel, kstTime } from "@/lib/kst";
import { CHAT_ROOMS_KEY } from "./chat-hub";

const POLL_MS = 2500;

export default function ListingChatPage() {
    const [, params] = useRoute("/chat/listing/:id");
    const bookingId = params?.id ?? "";
    const [, setLocation] = useLocation();
    const { t } = useT();
    const { member } = useAuth();
    const qc = useQueryClient();

    const booking = useQuery<any>({ queryKey: ["/api/hiq/golf/bookings", bookingId], queryFn: () => apiRequest(`/api/hiq/golf/bookings/${bookingId}`), enabled: !!bookingId });

    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const lastAtRef = useRef<string | null>(null);
    const seenAtRef = useRef(0);

    const merge = useCallback((incoming: ChatMsg[]) => {
        if (incoming.length === 0) return;
        setMessages((cur) => {
            const byId = new Map(cur.map((m) => [m.id, m]));
            for (const m of incoming) byId.set(m.id, { ...m, pending: false, failed: false });
            const list = [...byId.values()].filter((m) => !(m.pending && incoming.some((n) => n.message === m.message && n.senderId === m.senderId)));
            list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            return list;
        });
        const last = incoming[incoming.length - 1].createdAt;
        if (!lastAtRef.current || new Date(last) > new Date(lastAtRef.current)) lastAtRef.current = last;
    }, []);

    const markSeen = useCallback(() => {
        if (!bookingId || Date.now() - seenAtRef.current < 5_000) return;
        seenAtRef.current = Date.now();
        void apiRequest("/api/hiq/chat/read", { method: "POST", body: { key: `listing:${bookingId}` } })
            .then(() => { void qc.invalidateQueries({ queryKey: ["/api/hiq/chat/unread"] }); void qc.invalidateQueries({ queryKey: CHAT_ROOMS_KEY("GOLF") }); })
            .catch(() => { /* 다음에 */ });
    }, [bookingId, qc]);

    // 처음 전부 → 그 뒤 after 로만. 가려지면 쉰다.
    useEffect(() => {
        if (!bookingId) return;
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const tick = async () => {
            if (!alive) return;
            if (document.visibilityState === "visible") {
                try {
                    const after = lastAtRef.current ? `?after=${encodeURIComponent(lastAtRef.current)}` : "";
                    const rows = await apiRequest(`/api/hiq/chat/listing/${bookingId}/messages${after}`) as ChatMsg[];
                    if (!alive) return;
                    merge(rows);
                    setLoading(false);
                } catch (e: any) {
                    if (!alive) return;
                    if (e?.status === 403) { setForbidden(true); setLoading(false); return; }
                }
            }
            if (alive) timer = setTimeout(tick, POLL_MS);
        };
        void tick();
        const onVis = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void tick(); } };
        document.addEventListener("visibilitychange", onVis);
        return () => { alive = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
    }, [bookingId, merge]);

    const send = useCallback(async (text: string) => {
        const tempId = `tmp-${Date.now()}`;
        const optimistic: ChatMsg = { id: tempId, senderId: member?.id ?? null, message: text, type: "text", createdAt: new Date().toISOString(), sender: { name: member?.name ?? "" }, pending: true };
        setMessages((cur) => [...cur, optimistic]);
        try {
            const row = await apiRequest(`/api/hiq/chat/listing/${bookingId}/messages`, { method: "POST", body: { message: text } }) as ChatMsg;
            setMessages((cur) => cur.map((m) => (m.id === tempId ? { ...row, pending: false } : m)));
            if (!lastAtRef.current || new Date(row.createdAt) > new Date(lastAtRef.current)) lastAtRef.current = row.createdAt;
        } catch {
            setMessages((cur) => cur.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
        }
    }, [bookingId, member]);

    const retry = useCallback((msg: ChatMsg) => {
        setMessages((cur) => cur.filter((m) => m.id !== msg.id));
        void send(msg.message);
    }, [send]);

    const b = booking.data;
    const name: string = b ? (b.isBlind ? b.blindName : b.courseName) : "";
    const pinned = useMemo(() => b ? (
        <div className="px-4 py-3 border-b border-surface-line bg-surface-1 flex items-center gap-3">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                    {b.listingType === "JOIN" ? <JoinTypeBadge type={joinTypeOf(b)} /> : <span className="px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-brand/10 text-brand">부킹</span>}
                    <span className="text-[14px] font-semibold text-ink-1 truncate">{name}</span>
                </div>
                <div className="mt-0.5 text-[12px] font-medium text-ink-3 truncate flex items-center gap-1">
                    <LucideMapPin className="w-3 h-3" /> {kstDateLabel(b.datetime)} {kstTime(b.datetime)} · {b.isBlind ? "위치 비공개" : b.region}
                </div>
            </div>
            {!b.isBlind && (
                <div className="flex gap-1.5 shrink-0">
                    <a href={kakaoMapUrl(name, b.lat, b.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-surface-2 text-[12px] font-medium text-ink-2 inline-flex items-center">지도</a>
                    <a href={kakaoRouteUrl(name, b.lat, b.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-surface-2 text-[12px] font-medium text-ink-2 inline-flex items-center">길찾기</a>
                </div>
            )}
        </div>
    ) : null, [b, name]);

    return (
        <div className="h-[100dvh] flex flex-col bg-surface-0 text-ink-1">
            <header className="shrink-0 h-14 px-2 flex items-center gap-1 border-b border-surface-line bg-surface-0">
                <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/chat"))} aria-label="뒤로" className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 active:bg-surface-2">
                    <LucideChevronLeft className="w-6 h-6" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[16px] font-semibold truncate">{name || t("chat.title")}</h1>
                    {b && <p className={cn("text-[11.5px] font-medium text-ink-3 truncate")}>{b.listingType === "JOIN" ? t("chat.roomJoin") : t("chat.roomBooking")}</p>}
                </div>
            </header>
            {forbidden ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
                    <p className="text-[15px] font-semibold">{t("chat.notMemberTitle")}</p>
                    <p className="text-[13px] font-medium text-ink-3 leading-relaxed">{t("chat.notMemberDesc")}</p>
                    <button type="button" onClick={() => setLocation(`/golf/booking-list/${bookingId}`)} className="h-11 px-5 rounded-full bg-brand text-brand-fg text-[14px] font-semibold">{t("chat.goListing")}</button>
                </div>
            ) : (
                <ChatRoom messages={messages} meId={member?.id} onSend={send} onRetry={retry} pinned={pinned} loading={loading} onSeen={markSeen} emptyText={t("chat.emptyRoom")} />
            )}
        </div>
    );
}
