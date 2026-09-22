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
/** 서버가 한 번에 주는 최근 메시지 수(chat.repo messages 와 같은 값) — 이만큼 꽉 차서 오면 위에 더 있다. */
const PAGE = 60;

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

    const info = useQuery<RoomInfo>({ queryKey: ["/api/hiq/chat/room-info", key], queryFn: () => apiRequest(`/api/hiq/chat/rooms/${key}/info`), enabled: !!kind && !!id, retry: false });
    const gone = info.isError && (info.error as any)?.status === 404; // 글을 내려 방이 닫혔다
    const forbidden = info.isError && ((info.error as any)?.status === 403 || gone);
    // 푸시로 골프 방에 들어왔는데 앱이 당구 모드면 골프 테마·골프 채팅 탭으로 맞춘다(방마다 종목이 있다).
    const { currentSport, setSport } = useSport();
    const roomSport = info.data?.sport;
    useEffect(() => { if (roomSport && roomSport !== currentSport) setSport(roomSport); }, [roomSport, currentSport, setSport]);

    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasOlder, setHasOlder] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const lastAtRef = useRef<string | null>(null);
    const seenAtRef = useRef(0);
    const seenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const keyRef = useRef(key);            // 늦게 온 응답이 "아직 그 방인가"를 본다(같은 컴포넌트가 방→방으로 재사용된다)
    keyRef.current = key;
    const loadingOlderRef = useRef(false);  // 상태는 다음 렌더에야 바뀐다 — 같은 프레임의 스크롤 두 번을 막는다
    const sentIdsRef = useRef(new Map<string, number>()); // 방금 내가 보낸 행(id→보낸 시각) — 그 사이 떠 있던 resync 응답이 '지워진 것'으로 오인하지 않게

    // 서버에서 온 행을 합친다. 내 낙관 행은 **같은 문장 하나당 하나만** 걷어낸다 — 예전엔 같은 문장의 낙관 행을 전부 지워,
    // "ㅋㅋ"를 연달아 두 번 보내면 두 번째가 화면에서 사라졌다(2026-09-22 리뷰).
    const merge = useCallback((incoming: ChatMsg[]) => {
        if (incoming.length === 0) return;
        setMessages((cur) => {
            const byId = new Map(cur.map((m) => [m.id, m]));
            const fresh = incoming.filter((m) => !byId.has(m.id));
            for (const m of incoming) byId.set(m.id, { ...m, pending: false, failed: false });
            const drop = new Set<string>();
            for (const n of fresh) {
                const twin = cur.find((m) => m.pending && !drop.has(m.id) && m.message === n.message && m.senderId === n.senderId);
                if (twin) drop.add(twin.id);
            }
            const list = [...byId.values()].filter((m) => !drop.has(m.id));
            list.sort((x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime());
            return list;
        });
        const last = incoming[incoming.length - 1].createdAt;
        if (!lastAtRef.current || new Date(last) > new Date(lastAtRef.current)) lastAtRef.current = last;
    }, []);

    // 읽음: 5초에 한 번만 보내되, 막힌 호출은 **버리지 않고 뒤로 미룬다** — 버리면 그 5초 안에 온 마지막 메시지의 읽음이
    // 영영 기록되지 않아 방을 나가면 배지가 남았다.
    const markSeen = useCallback(() => {
        if (!kind) return;
        const fire = () => {
            seenAtRef.current = Date.now();
            void apiRequest("/api/hiq/chat/read", { method: "POST", body: { key } })
                .then(() => { void qc.invalidateQueries({ queryKey: ["/api/hiq/chat/unread"] }); void qc.invalidateQueries({ queryKey: ["/api/hiq/chat/rooms"] }); })
                .catch(() => { /* 다음에 */ });
        };
        const wait = 5_000 - (Date.now() - seenAtRef.current);
        if (wait <= 0) { fire(); return; }
        if (seenTimerRef.current) return;
        seenTimerRef.current = setTimeout(() => { seenTimerRef.current = null; fire(); }, wait);
    }, [key, kind, qc]);

    useEffect(() => {
        if (!kind || !id || forbidden) return;
        // 방이 바뀌면 처음부터 — 같은 컴포넌트가 재사용되므로(푸시로 방→방 이동) 안 비우면 앞 방 대화가 남고
        // 앞 방의 커서로 새 방을 물어 과거 메시지를 못 받았다(2026-09-22 리뷰).
        setMessages([]); setLoading(true); setHasOlder(false);
        lastAtRef.current = null; seenAtRef.current = 0; sentIdsRef.current.clear();
        let alive = true;
        let busy = false;
        let ticks = 0;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const tick = async () => {
            if (!alive || busy) return; // 진행 중인 요청과 겹치면 루프가 둘이 된다(visibilitychange) — 하나만 돈다
            busy = true;
            if (timer) { clearTimeout(timer); timer = null; }
            if (document.visibilityState === "visible") {
                try {
                    // 12번에 한 번(약 30초)은 최근 창을 통째로 다시 받아 **지워진 메시지**를 걷어낸다 — after 폴링은 새 것만 알려 준다.
                    const resync = lastAtRef.current !== null && ++ticks % 12 === 0;
                    const after = lastAtRef.current && !resync ? `?after=${encodeURIComponent(lastAtRef.current)}` : "";
                    const rows = await apiRequest(`/api/hiq/chat/rooms/${key}/messages${after}`) as ChatMsg[];
                    if (!alive) return;
                    if (!after) {
                        if (!resync) setHasOlder(rows.length >= PAGE);
                        const ids = new Set(rows.map((m) => m.id));
                        // 창이 비어 왔다 = 방에 남은 메시지가 없다(다 지워졌다) → 전부 걷는다. 첫 로드는 걷을 것이 없다.
                        const from = rows[0] ? new Date(rows[0].createdAt).getTime() : (resync ? -Infinity : Infinity);
                        const now = Date.now();
                        for (const [sid, at] of sentIdsRef.current) if (now - at > 60_000) sentIdsRef.current.delete(sid);
                        // 받은 창의 시간 범위 안에 있는데 응답에 없는 행 = 지워진 것. 단 방금 내가 보낸 행은 이 응답(보내기 전 스냅샷)에 없을 뿐이다.
                        setMessages((cur) => cur.filter((m) => m.pending || m.failed || ids.has(m.id) || sentIdsRef.current.has(m.id) || new Date(m.createdAt).getTime() < from));
                    }
                    merge(rows);
                    setLoading(false);
                } catch (e: any) {
                    if (!alive) return;
                    if (e?.status === 403 || e?.status === 404) { setLoading(false); busy = false; return; }
                }
            }
            busy = false;
            if (alive) timer = setTimeout(tick, POLL_MS);
        };
        void tick();
        const onVis = () => { if (document.visibilityState === "visible") void tick(); };
        document.addEventListener("visibilitychange", onVis);
        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
            if (seenTimerRef.current) { clearTimeout(seenTimerRef.current); seenTimerRef.current = null; }
            document.removeEventListener("visibilitychange", onVis);
        };
    }, [key, kind, id, forbidden, merge]);

    // 위로 더 읽기 — 가장 오래된 메시지 앞의 한 쪽
    const loadOlder = useCallback(async () => {
        const first = messages.find((m) => !m.pending && !m.failed);
        if (!first || loadingOlderRef.current || !hasOlder) return;
        loadingOlderRef.current = true;
        setLoadingOlder(true);
        const myKey = key;
        try {
            const rows = await apiRequest(`/api/hiq/chat/rooms/${myKey}/messages?before=${encodeURIComponent(first.createdAt)}`) as ChatMsg[];
            if (keyRef.current !== myKey) return; // 그 사이 다른 방으로 갔다 — 앞 방의 옛 대화를 새 방에 붙이지 않는다
            setHasOlder(rows.length >= PAGE);
            if (rows.length > 0) setMessages((cur) => { const have = new Set(cur.map((m) => m.id)); return [...rows.filter((m) => !have.has(m.id)), ...cur]; });
        } catch { /* 다시 올리면 된다 */ } finally { loadingOlderRef.current = false; setLoadingOlder(false); }
    }, [messages, hasOlder, key]);

    const send = useCallback(async (text: string) => {
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setMessages((cur) => [...cur, { id: tempId, senderId: member?.id ?? null, message: text, type: "text", createdAt: new Date().toISOString(), sender: { name: member?.name ?? "" }, pending: true }]);
        try {
            const row = await apiRequest(`/api/hiq/chat/rooms/${key}/messages`, { method: "POST", body: { message: text } }) as ChatMsg;
            sentIdsRef.current.set(row.id, Date.now());
            // 폴링이 먼저 그 행을 가져왔으면 낙관 행만 걷고, 아니면 그 자리에 끼운다
            setMessages((cur) => (cur.some((m) => m.id === row.id) ? cur.filter((m) => m.id !== tempId) : cur.map((m) => (m.id === tempId ? { ...row, pending: false } : m))));
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
                            {b.listingType === "JOIN" ? <JoinTypeBadge type={joinTypeOf(b)} /> : <span className="px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-brand/10 text-brand">{t("chat.booking")}</span>}
                            <span className="text-[14px] font-semibold text-ink-1 truncate">{name}</span>
                        </div>
                        <div className="mt-0.5 text-[12px] font-medium text-ink-3 truncate flex items-center gap-1">
                            <LucideMapPin className="w-3 h-3" /> {kstDateLabel(b.datetime)} {kstTime(b.datetime)} · {b.isBlind ? t("chat.locationHidden") : b.region} · {t("chat.peopleN").replace("{n}", String(d.members.length))}
                        </div>
                    </div>
                    {!b.isBlind && (
                        <div className="flex gap-1.5 shrink-0">
                            <a href={kakaoMapUrl(name, b.lat, b.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-surface-2 text-[12px] font-medium text-ink-2 inline-flex items-center">{t("chat.map")}</a>
                            <a href={kakaoRouteUrl(name, b.lat, b.lng)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-full bg-surface-2 text-[12px] font-medium text-ink-2 inline-flex items-center">{t("chat.directions")}</a>
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
                <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/chat"))} aria-label={t("common.back")} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 active:bg-surface-2">
                    <LucideChevronLeft className="w-6 h-6" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="text-[16px] font-semibold truncate">{d?.title ?? t("chat.title")}</h1>
                    {d && <p className="text-[11.5px] font-medium text-ink-3 truncate">{d.subtitle}</p>}
                </div>
            </header>
            {forbidden ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
                    <p className="text-[15px] font-semibold">{gone ? t("chat.roomGone") : kind === "listing" ? t("chat.notMemberTitle") : t("chat.noAccess")}</p>
                    {kind === "listing" && !gone && <p className="text-[13px] font-medium text-ink-3 leading-relaxed">{t("chat.notMemberDesc")}</p>}
                    {/* 내려간 글은 돌아갈 글이 없다 — 채팅 목록으로 */}
                    <button type="button" onClick={() => setLocation(kind === "listing" && !gone ? `/golf/booking-list/${id}` : "/chat")} className="h-11 px-5 rounded-full bg-brand text-brand-fg text-[14px] font-semibold">{kind === "listing" && !gone ? t("chat.goListing") : t("chat.title")}</button>
                </div>
            ) : (
                <ChatRoom
                    messages={messages} meId={member?.id} onSend={send} onRetry={retry} onDelete={remove} onOpenCard={openCard}
                    canDelete={(m) => !!member && (m.senderId === member.id || !!d?.canManage)}
                    pinned={pinned} loading={loading || info.isPending} onSeen={markSeen}
                    hasOlder={hasOlder} loadingOlder={loadingOlder} onLoadOlder={loadOlder} roomKey={key}
                    // 티타임 이틀 뒤 조인·부킹 방은 읽기만(서버도 같은 기준으로 막는다) — 목록에서 빠진 방에서 푸시만 오지 않게
                    disabled={d?.kind === "listing" && !!b && new Date(b.datetime).getTime() < Date.now() - 2 * 86_400_000}
                    emptyText={d?.kind === "support" ? t("chat.emptySupport") : d?.kind === "listing" ? t("chat.emptyRoom") : t("chat.empty")}
                />
            )}
        </div>
    );
}
