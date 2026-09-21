/**
 * 대화방(2026-09-21) — 크루·조인/부킹·1:1·관리자 문의가 같은 화면. /chat/:kind/:id
 *
 * 폴링 2.5초, `after` 뒤만(새 게 없으면 빈 응답). 가려지면 쉰다. 보내면 즉시 말풍선, 실패는 빨갛게 눌러 재전송.
 * 읽음: 방을 열 때와 아래를 보고 있는 동안 새 메시지가 오면 "봤다". 카드형 메시지(정산·부킹 공유)는 눌러서 이동.
 * 내 메시지(크루는 운영진도)는 길게 눌러 삭제.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideChevronLeft, LucideMapPin, LucideUsers } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { ChatRoom, type ChatMsg } from "@/components/hiq/chat/ChatRoom";
import { JoinTypeBadge, joinTypeOf, kakaoMapUrl, kakaoRouteUrl } from "@/golf/components/join/joinUi";
import { kstDateLabel, kstTime } from "@/lib/kst";

const POLL_MS = 2500;

interface RoomInfo {
    key: string; kind: "crew" | "listing" | "dm" | "support"; id: string;
    title: string; subtitle: string;
    members: { id: string; name: string; profileImageUrl: string | null }[];
    canManage: boolean; crewId?: string; booking?: any; sport?: "BILLIARDS" | "GOLF";
}

export default function ChatRoomPage() {
    const [, params] = useRoute("/chat/:kind/:id");
    const kind = params?.kind ?? "";
    const id = params?.id ?? "";
    const key = `${kind}:${id}`;
    const [, setLocation] = useLocation();
    const { t } = useT();
    const { toast } = useToast();
    const { member } = useAuth();
    const qc = useQueryClient();

    const info = useQuery<RoomInfo>({ queryKey: ["/api/hiq/chat/rooms", key, "info"], queryFn: () => apiRequest(`/api/hiq/chat/rooms/${key}/info`), enabled: !!kind && !!id, retry: false });
    const forbidden = info.isError && (info.error as any)?.status === 403;
    // 푸시로 골프 방에 들어왔는데 앱이 당구 모드면 골프 테마·골프 채팅 탭으로 맞춘다(방마다 종목이 있다).
    const { currentSport, setSport } = useSport();
    const roomSport = info.data?.sport;
    useEffect(() => { if (roomSport && roomSport !== currentSport) setSport(roomSport); }, [roomSport, currentSport, setSport]);

    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [loading, setLoading] = useState(true);
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
        if (!kind || Date.now() - seenAtRef.current < 5_000) return;
        seenAtRef.current = Date.now();
        void apiRequest("/api/hiq/chat/read", { method: "POST", body: { key } })
            .then(() => { void qc.invalidateQueries({ queryKey: ["/api/hiq/chat/unread"] }); void qc.invalidateQueries({ queryKey: ["/api/hiq/chat/rooms"] }); })
            .catch(() => { /* 다음에 */ });
    }, [key, kind, qc]);

    useEffect(() => {
        if (!kind || !id || forbidden) return;
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const tick = async () => {
            if (!alive) return;
            if (document.visibilityState === "visible") {
                try {
                    const after = lastAtRef.current ? `?after=${encodeURIComponent(lastAtRef.current)}` : "";
                    const rows = await apiRequest(`/api/hiq/chat/rooms/${key}/messages${after}`) as ChatMsg[];
                    if (!alive) return;
                    merge(rows);
                    setLoading(false);
                } catch (e: any) {
                    if (!alive) return;
                    if (e?.status === 403 || e?.status === 404) { setLoading(false); return; }
                }
            }
            if (alive) timer = setTimeout(tick, POLL_MS);
        };
        void tick();
        const onVis = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void tick(); } };
        document.addEventListener("visibilitychange", onVis);
        return () => { alive = false; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
    }, [key, kind, id, forbidden, merge]);

    const send = useCallback(async (text: string) => {
        const tempId = `tmp-${Date.now()}`;
        setMessages((cur) => [...cur, { id: tempId, senderId: member?.id ?? null, message: text, type: "text", createdAt: new Date().toISOString(), sender: { name: member?.name ?? "" }, pending: true }]);
        try {
            const row = await apiRequest(`/api/hiq/chat/rooms/${key}/messages`, { method: "POST", body: { message: text } }) as ChatMsg;
            setMessages((cur) => cur.map((m) => (m.id === tempId ? { ...row, pending: false } : m)));
            if (!lastAtRef.current || new Date(row.createdAt) > new Date(lastAtRef.current)) lastAtRef.current = row.createdAt;
        } catch (e: any) {
            setMessages((cur) => cur.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
            if (e?.message) toast({ title: e.message, variant: "destructive" });
        }
    }, [key, member, toast]);

    const retry = useCallback((msg: ChatMsg) => { setMessages((cur) => cur.filter((m) => m.id !== msg.id)); void send(msg.message); }, [send]);

    const remove = useCallback(async (msg: ChatMsg) => {
        if (!window.confirm(t("chat.deleteConfirm"))) return;
        try {
            await apiRequest(`/api/hiq/chat/rooms/${key}/messages/${msg.id}`, { method: "DELETE" });
            setMessages((cur) => cur.filter((m) => m.id !== msg.id));
        } catch (e: any) { toast({ title: e?.message || t("chat.deleteFailed"), variant: "destructive" }); }
    }, [key, t, toast]);

    const openCard = useCallback((msg: ChatMsg) => {
        const md = (msg as any).metadata ?? {};
        if (msg.type === "settlement" && info.data?.crewId) setLocation(`/crew/${info.data.crewId}/home?settlement=${md.settlementId ?? ""}`);
        else if (md.type === "GOLF_BOOKING" && md.bookingId) setLocation(`/golf/booking-list/${md.bookingId}`);
    }, [info.data, setLocation]);

    const d = info.data;
    const b = d?.booking;
    const pinned = useMemo(() => {
        if (!d) return null;
        if (d.kind === "listing" && b) {
            const name: string = b.isBlind ? b.blindName : b.courseName;
            return (
                <div className="px-4 py-3 border-b border-surface-line bg-surface-1 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                            {b.listingType === "JOIN" ? <JoinTypeBadge type={joinTypeOf(b)} /> : <span className="px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-brand/10 text-brand">부킹</span>}
                            <span className="text-[14px] font-semibold text-ink-1 truncate">{name}</span>
                        </div>
                        <div className="mt-0.5 text-[12px] font-medium text-ink-3 truncate flex items-center gap-1">
                            <LucideMapPin className="w-3 h-3" /> {kstDateLabel(b.datetime)} {kstTime(b.datetime)} · {b.isBlind ? "위치 비공개" : b.region} · {d.members.length}명
                        </div>
                    </div>
                    {!b.isBlind && (
                        <div className="flex gap-1.5 shrink-0">
                            <a href={kakaoMapUrl(name, b.lat, b.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-surface-2 text-[12px] font-medium text-ink-2 inline-flex items-center">지도</a>
                            <a href={kakaoRouteUrl(name, b.lat, b.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-surface-2 text-[12px] font-medium text-ink-2 inline-flex items-center">길찾기</a>
                        </div>
                    )}
                </div>
            );
        }
        if (d.kind === "crew") {
            return (
                <button type="button" onClick={() => setLocation(`/crew/${d.crewId}`)} className="w-full px-4 py-2.5 border-b border-surface-line bg-surface-1 flex items-center gap-2 text-left">
                    <LucideUsers className="w-4 h-4 text-ink-3" />
                    <span className="text-[12.5px] font-medium text-ink-3 flex-1 truncate">{t("chat.crewPinned").replace("{n}", String(d.members.length))}</span>
                    <span className="text-[12px] font-medium text-brand">{t("chat.goCrewHome")}</span>
                </button>
            );
        }
        if (d.kind === "support" && d.id === member?.id) {
            return <p className="px-4 py-2.5 border-b border-surface-line bg-surface-1 text-[12.5px] font-medium text-ink-3">{t("chat.supportPinned")}</p>;
        }
        if (d.kind === "dm" && d.members.length > 2) {
            return <p className="px-4 py-2.5 border-b border-surface-line bg-surface-1 text-[12.5px] font-medium text-ink-3 truncate">{d.members.map((m) => m.name).join(" · ")}</p>;
        }
        return null;
    }, [d, b, member?.id, setLocation, t]);

    return (
        // 키보드가 뜨면 그 높이만큼 방을 줄인다 — 웹뷰가 안 줄어드는 iOS·안드로이드(edge-to-edge)에서 입력줄이 키보드 뒤로 숨었다(2026-09-21).
        <div className="flex flex-col bg-surface-0 text-ink-1" style={{ height: "calc(100dvh - var(--keyboard-height, 0px))" }}>
            <header className="shrink-0 h-14 px-2 flex items-center gap-1 border-b border-surface-line bg-surface-0">
                <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/chat"))} aria-label="뒤로" className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 active:bg-surface-2">
                    <LucideChevronLeft className="w-6 h-6" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[16px] font-semibold truncate">{d?.title ?? t("chat.title")}</h1>
                    {d && <p className="text-[11.5px] font-medium text-ink-3 truncate">{d.subtitle}</p>}
                </div>
            </header>
            {forbidden ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
                    <p className="text-[15px] font-semibold">{kind === "listing" ? t("chat.notMemberTitle") : t("chat.noAccess")}</p>
                    {kind === "listing" && <p className="text-[13px] font-medium text-ink-3 leading-relaxed">{t("chat.notMemberDesc")}</p>}
                    <button type="button" onClick={() => setLocation(kind === "listing" ? `/golf/booking-list/${id}` : "/chat")} className="h-11 px-5 rounded-full bg-brand text-brand-fg text-[14px] font-semibold">{kind === "listing" ? t("chat.goListing") : t("chat.title")}</button>
                </div>
            ) : (
                <ChatRoom
                    messages={messages} meId={member?.id} onSend={send} onRetry={retry} onDelete={remove} onOpenCard={openCard}
                    canDelete={(m) => !!member && (m.senderId === member.id || !!d?.canManage)}
                    pinned={pinned} loading={loading || info.isPending} onSeen={markSeen}
                    emptyText={d?.kind === "support" ? t("chat.emptySupport") : d?.kind === "listing" ? t("chat.emptyRoom") : t("chat.empty")}
                />
            )}
        </div>
    );
}
