/**
 * 대화방(2026-09-21) — 크루·조인/부킹·1:1·관리자 문의가 같은 화면. /chat/:kind/:id
 *
 * 폴링 2.5초, `after` 뒤만(새 게 없으면 빈 응답). 가려지면 쉰다. 보내면 즉시 말풍선, 실패는 빨갛게 눌러 재전송.
 * 읽음: 방을 열 때와 아래를 보고 있는 동안 새 메시지가 오면 "봤다". 카드형 메시지(정산·부킹 공유·+ 첨부)는 눌러서 이동.
 * 내 메시지(크루는 운영진도)는 길게 눌러 삭제.
 * ⋯ 메뉴(2026-09-23): 참여자 보기 · 이 방 알림 끄기 · 나가기(1:1·소그룹만).
 *   읽음 줄 "여기까지 읽었어요"는 **방에 들어온 순간의 커서**로 한 번만 긋고, 내 말풍선 옆 숫자는 아직 안 읽은 사람 수다.
 * + 첨부(2026-09-23): 종목별 카드(당구 매칭 대결·온라인 대전 초대·경기 결과·매장, 골프 조인/부킹·랭큐매치 핀·라운드) — 서버가 만들고 여기서는 끼우기만.
 *   매칭 대결 카드만 예외로 **살아 있다** — 참가 수가 갱신되고 방장이 누르면 그 핀으로 매칭대결하기 화면을 이어받는다.
 * 크루 방(2026-09-26 크루 채팅 1단계): + 에 "우리 크루" 줄(정모 만들기·투표·정산 요청·공지) — 크루 기능의 만들기 창을 그대로 열고,
 *   만든 정모·투표·공지를 카드로 붙인다(정산은 서버가 원래 카드를 올린다). 윗줄은 다가오는 정모 띠(없으면 예전 한 줄).
 *   정모·투표 카드는 크루 API 로 살아 있다 — 카드 안에서 참석·투표.
 * 신고·차단(2026-10-06, 스토어 심사 1.2 — 9/21 채팅을 한 체계로 합치며 빠졌던 입구): 남의 말풍선 옆 ⋯(말풍선마다) · 길게 누르기 →
 *   [신고] [차단하기]. 크루 방은 그 메시지를(crew_chat), 조인/부킹·1:1 방은 보낸 사람을(member) 신고한다. 문의 방은 뺀다.
 *   차단하면 그 사람 글을 바로 걷는다. ⋯ 메뉴의 참여자 줄에서도 회원 신고·차단이 된다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LucideChevronLeft, LucideMapPin, LucideUsers, LucideMoreVertical } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useSport } from "@/contexts/SportContext";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { ChatRoom, type ChatMsg } from "@/components/hiq/chat/ChatRoom";
import { cardKind } from "@/components/hiq/chat/ChatCard";
import { ChatMenuSheet, ChatReportSheet } from "@/components/hiq/chat/ChatMenuSheet";
import { ReportDialog, useBlockMember, blockConfirmText, type ReportTargetType } from "@/components/hiq/community/ReportDialog";
import { AttachSheet, type AttachItem, type CrewAttachItem } from "@/components/hiq/chat/attach/AttachSheet";
import { MeetupBanner } from "@/components/hiq/chat/crew/MeetupBanner";
import { NoticeComposeSheet } from "@/components/hiq/chat/crew/NoticeComposeSheet";
import { CreateActivityDialog } from "@/components/hiq/CreateActivityDialog";
import { CreateGolfActivityModal } from "@/components/hiq/club/activity/CreateGolfActivityModal";
import { CreatePollDialog } from "@/components/hiq/CreatePollDialog";
import { CreateSettlementDialog } from "@/components/hiq/settlement/CreateSettlementDialog";
import { SimInviteSheet } from "@/components/hiq/chat/attach/SimInviteSheet";
import { MatchInviteSheet } from "@/components/hiq/chat/attach/MatchInviteSheet";
import { RecentGamesPicker } from "@/components/hiq/chat/attach/RecentGamesPicker";
import { StorePicker } from "@/components/hiq/chat/attach/StorePicker";
import { GolfListingPicker } from "@/components/hiq/chat/attach/GolfListingPicker";
import { GolfRoundsPicker } from "@/components/hiq/chat/attach/GolfRoundsPicker";
import { GolfMatchCreateSheet } from "@/components/hiq/chat/attach/GolfMatchCreateSheet";
import { JoinTypeBadge, joinTypeOf, kakaoMapUrl, kakaoRouteUrl } from "@/golf/components/join/joinUi";
import { kstDateLabel, kstTime } from "@/lib/kst";
import { appConfirm } from "@/components/AppDialog";
import { copyText } from "@/lib/copyText";
import { languageLabel } from "@shared/languageLabel";

const POLL_MS = 2500;
/** 서버가 한 번에 주는 최근 메시지 수(chat.repo messages 와 같은 값) — 이만큼 꽉 차서 오면 위에 더 있다. */
const PAGE = 60;

interface RoomInfo {
    key: string; kind: "crew" | "listing" | "dm" | "support"; id: string;
    title: string; subtitle: string;
    members: { id: string; name: string; profileImageUrl: string | null }[];
    canManage: boolean; crewId?: string; booking?: any; sport?: "BILLIARDS" | "GOLF";
    /** 방에 들어온 순간의 내 읽음 커서 — "여기까지 읽었어요" 줄의 기준(읽음 처리 전 값이다). */
    lastReadAt?: string | null;
    /** 이 방 알림 꺼짐(크루는 크루 알림 설정의 채팅 스위치). */
    muted?: boolean;
}

/** 신고 창·차단에 넘길 대상. authorId 는 차단할 사람(= 메시지를 보낸 사람). */
interface ChatReportTarget { targetType: ReportTargetType; targetId: string; crewId?: string; authorId: string; authorName?: string }

/**
 * 고른 메시지를 방 종류에 맞는 신고 대상으로 바꾼다(서버가 받는 타입에 맞춘다).
 *  - 크루 방: **그 메시지**(crew_chat). 크루 신고 주소(POST /crews/:id/reports)가 이 크루의 메시지인지 확인한다.
 *  - 조인/부킹·1:1 방: **보낸 사람**(member). 메시지 단위 신고 타입은 서버에 아직 없다 — 커뮤니티 신고 주소가 회원 신고를 받는다.
 *  - 문의 방: 없음(null). 상대가 운영자라 신고·차단할 대상이 아니다.
 * 보낸 사람이 없는 글(시스템 메시지)도 대상이 아니다.
 */
function reportTargetFor(room: Pick<RoomInfo, "kind" | "id" | "crewId">, msg: ChatMsg): ChatReportTarget | null {
    if (room.kind === "support" || !msg.senderId) return null;
    const author = { authorId: msg.senderId, authorName: msg.sender?.name };
    if (room.kind === "crew") return { targetType: "crew_chat", targetId: msg.id, crewId: room.crewId ?? room.id, ...author };
    return { targetType: "member", targetId: msg.senderId, ...author };
}

export default function ChatRoomPage() {
    const [, params] = useRoute("/chat/:kind/:id");
    const kind = params?.kind ?? "";
    const id = params?.id ?? "";
    const key = `${kind}:${id}`;
    const [, setLocation] = useLocation();
    const { t, locale } = useT();
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
    /**
     * "여기까지 읽었어요" 줄의 기준 — 방에 들어온 그 순간의 커서를 **한 번만** 잡는다.
     * 들어오자마자 POST /chat/read 가 커서를 지금으로 옮기므로, 다시 읽으면 줄이 곧장 맨 아래로 내려간다.
     */
    const [readLineAt, setReadLineAt] = useState<string | null>(null);
    const readLineKeyRef = useRef<string | null>(null);
    /** 방 사람들의 읽은 시각 — 내 말풍선 옆 숫자를 센다(폴링에 같이 실려 온다). */
    const [reads, setReads] = useState<{ id: string; at: string }[]>([]);
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

    // 이 방의 정보가 처음 온 순간의 커서를 잡는다. 방을 옮기면(키가 바뀌면) 다시 잡는다.
    useEffect(() => {
        if (!info.data || readLineKeyRef.current === key) return;
        readLineKeyRef.current = key;
        setReadLineAt(info.data.lastReadAt ?? null);
    }, [info.data, key]);

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
        setMessages([]); setLoading(true); setHasOlder(false); setReads([]);
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
                    const after = lastAtRef.current && !resync ? `&after=${encodeURIComponent(lastAtRef.current)}` : "";
                    // reads=1 — 응답이 { messages, reads } 로 온다(요청 하나로 끝낸다. 폴링을 둘로 나누면 호출이 두 배가 된다).
                    const res = await apiRequest(`/api/hiq/chat/rooms/${key}/messages?reads=1${after}`) as { messages: ChatMsg[]; reads: { id: string; at: string }[] };
                    if (!alive) return;
                    const rows = res.messages ?? [];
                    if (res.reads) setReads(res.reads);
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
        if (!(await appConfirm({ message: t("chat.deleteConfirm"), tone: "danger", confirmText: t("community.delete") }))) return;
        try {
            await apiRequest(`/api/hiq/chat/rooms/${key}/messages/${msg.id}`, { method: "DELETE" });
            setMessages((cur) => cur.filter((m) => m.id !== msg.id));
        } catch (e: any) { toast({ title: e?.message || t("chat.deleteFailed"), variant: "destructive" }); }
    }, [key, t, toast]);

    /**
     * 내 말풍선 옆 '아직 안 읽은 사람 수'. 방 사람(나 제외) 중 읽은 시각이 그 메시지보다 이른 사람을 센다.
     * 읽음 행이 아예 없는 사람은 **안 읽은 것**으로 센다(행은 방을 처음 열 때 생긴다).
     * 크루처럼 사람이 많은 방에서도 화면이 세는 값이라 서버 왕복이 늘지 않는다.
     */
    const readAtById = useMemo(() => new Map(reads.map((r) => [r.id, new Date(r.at).getTime()])), [reads]);
    const memberIds = useMemo(() => (info.data?.members ?? []).map((m) => m.id), [info.data]);
    const unreadBy = useCallback((m: ChatMsg) => {
        if (!member || m.senderId !== member.id || memberIds.length < 2) return 0;
        const at = new Date(m.createdAt).getTime();
        return memberIds.filter((id) => id !== member.id && (readAtById.get(id) ?? 0) < at).length;
    }, [member, memberIds, readAtById]);

    // ⋯ 메뉴 — 참여자 보기 · 이 방 알림 끄기 · 나가기
    const [menuOpen, setMenuOpen] = useState(false);
    const [menuBusy, setMenuBusy] = useState(false);
    const muted = !!info.data?.muted;
    const toggleMute = useCallback(async (next: boolean) => {
        setMenuBusy(true);
        try {
            await apiRequest(`/api/hiq/chat/rooms/${key}/mute`, { method: "POST", body: { muted: next } });
            // 방 정보를 다시 읽으면 lastReadAt 도 새로 오지만 읽음 줄은 이미 잡아 뒀으므로(readLineKeyRef) 흔들리지 않는다.
            qc.setQueryData(["/api/hiq/chat/room-info", key], (old: any) => (old ? { ...old, muted: next } : old));
            toast({ title: next ? t("chat.menu.mutedDone") : t("chat.menu.unmutedDone") });
        } catch (e: any) { toast({ title: e?.message || t("chat.actionFailed"), variant: "destructive" }); }
        finally { setMenuBusy(false); }
    }, [key, qc, t, toast]);
    const leaveRoom = useCallback(async () => {
        if (!(await appConfirm({ message: t("chat.menu.leaveConfirm"), tone: "danger", confirmText: t("chat.menu.leave") }))) return;
        setMenuBusy(true);
        try {
            await apiRequest(`/api/hiq/chat/rooms/${key}/leave`, { method: "POST" });
            void qc.invalidateQueries({ queryKey: ["/api/hiq/chat/rooms"] });
            void qc.invalidateQueries({ queryKey: ["/api/hiq/chat/unread"] });
            setMenuOpen(false);
            setLocation("/chat");
        } catch (e: any) { toast({ title: e?.message || t("chat.actionFailed"), variant: "destructive" }); }
        finally { setMenuBusy(false); }
    }, [key, qc, setLocation, t, toast]);

    // 카드 탭 → 종류별 이동(ChatCard 의 CARD_OPENABLE 과 짝). MY_STATS 는 갈 곳이 없다.
    const openCard = useCallback((msg: ChatMsg) => {
        const md = (msg as any).metadata ?? {};
        switch (cardKind(msg)) {
            // 매칭 대결: **방장만** 그 핀으로 매칭대결하기 화면을 이어받는다(자리 앉히고 시작).
            // 참가는 카드 안 [참가하기] 버튼이 하므로, 방장이 아니면 아무 데도 가지 않는다.
            case "MATCH_INVITE": {
                if (!md.code || !member || String(md.hostId ?? "") !== member.id) break;
                const q = new URLSearchParams({ match: String(md.code), gameType: md.gameType === "4c" ? "4c" : "3c", seats: String(Number(md.seats) || 2) });
                if (md.target != null) q.set("target", String(md.target));
                // /dashboard 는 두 종목이 함께 쓰는 주소다(sportForPath 가 null) — 저장된 선호가 골프면 골프 홈이 떠서
                // ?match= 가 통째로 버려진다. 당구 카드를 눌렀으니 종목을 당구로 돌려놓고 간다.
                setSport("BILLIARDS");
                setLocation(`/dashboard?${q.toString()}`);
                break;
            }
            case "settlement": if (info.data?.crewId) setLocation(`/crew/${info.data.crewId}/home?settlement=${md.settlementId ?? ""}`); break;
            case "GOLF_BOOKING": if (md.bookingId) setLocation(`/golf/booking-list/${md.bookingId}`); break;
            case "SIM_INVITE": if (md.code) setLocation(`/online-game?join=${encodeURIComponent(String(md.code))}&auto=1`); break;
            case "GAME_RESULT": if (md.gameId) setLocation(`/r/${md.gameId}`); break;
            case "STORE": if (md.code) setLocation(`/stores/${md.code}`); else if (md.slug) setLocation(`/store/${md.slug}`); break;
            case "GOLF_MATCH": if (md.pinCode) setLocation(`/golf/game/new?mode=join&pin=${encodeURIComponent(String(md.pinCode))}`); break;
            case "GOLF_ROUND": if (md.sessionId) setLocation(`/golf/game/${md.sessionId}/result`); break;
            // 크루 카드 — 참석·투표는 카드 안 버튼이 하고, 카드 자체는 크루의 그 자리로 간다.
            case "CREW_MEETUP": if (md.crewId) setLocation(`/crew/${md.crewId}/home`); break;
            case "CREW_POLL": if (md.crewId) setLocation(`/crew/${md.crewId}/poll`); break;
            case "CREW_NOTICE": if (md.crewId) setLocation(`/crew/${md.crewId}/board`); break;
        }
    }, [info.data, member, setLocation, setSport]);

    // + 첨부(2026-09-23): 종류를 고르면 서버가 카드를 만든다(가짜 카드 방지 — 보내기 라우트는 metadata 를 버린다).
    // 돌아온 행을 바로 목록에 끼운다 — 낙관 행은 없다(카드 값은 서버가 채운다).
    const [attachOpen, setAttachOpen] = useState(false);
    const [simBusy, setSimBusy] = useState(false);
    const [matchBusy, setMatchBusy] = useState(false);
    const [picker, setPicker] = useState<null | "MATCH_INVITE" | "SIM_INVITE" | "GAME_RESULT" | "STORE" | "GOLF_BOOKING" | "GOLF_MATCH" | "GOLF_ROUND">(null);
    // 경로의 종류는 metadata.type 과 같은 이름(SIM_INVITE·GAME_RESULT·…) — 서버 라우터(chatCards.ts)와 맞춘 계약.
    const postCard = useCallback(async (item: AttachItem, body: Record<string, unknown>, after?: (row: ChatMsg) => void) => {
        const myKey = key;
        try {
            // 서버 라우트는 kebab-case(sim-invite …)다 — AttachItem 이름(SIM_INVITE)을 그대로 쓰면 404.
            const row = await apiRequest(`/api/hiq/chat/rooms/${myKey}/cards/${item.toLowerCase().replace(/_/g, "-")}`, { method: "POST", body }) as ChatMsg;
            if (keyRef.current !== myKey) return; // 그 사이 다른 방으로 갔다
            sentIdsRef.current.set(row.id, Date.now());
            merge([row]); // 폴링이 먼저 가져왔으면 같은 id 로 덮일 뿐 — lastAtRef 도 같은 규칙으로 앞당긴다
            after?.(row);
        } catch (e: any) {
            toast({ title: e?.message || t("chat.attach.failed"), variant: "destructive" });
        }
    }, [key, merge, t, toast]);
    const onPickAttach = useCallback((item: AttachItem) => {
        switch (item) {
            // 온라인 대전: 종목을 고르면 카드를 올리고 **나는 곧바로 그 대기방으로** 간다(2026-09-23 오너).
            // 방 열쇠를 주소에 실어 로비가 그 방을 바로 연다 — 목록 스캔(최근 20건)에 맡기면 재사용한 옛 방을 못 찾아 만들기 폼이 뜬다.
            case "SIM_INVITE": setPicker("SIM_INVITE"); break;
            default: setPicker(item);                                         // 고를 것이 있는 종류
        }
    }, [postCard, setLocation]);

    // 크루 줄: 만들기 창을 열고, 만든 것을 카드로 붙인다. 정산은 서버(POST /settlements, sendToChat)가 카드를 올린다 — 폴링이 가져온다.
    const [crewPicker, setCrewPicker] = useState<CrewAttachItem | null>(null);
    const [crewBusy, setCrewBusy] = useState(false);
    const roomCrewId = info.data?.kind === "crew" ? info.data.crewId : undefined;
    // 정산 창은 크루원 명단(역할·계좌 기본값)이 필요하다 — 열 때만 읽는다(크루 홈과 같은 키라 캐시를 같이 쓴다).
    const crewData = useQuery<{ members: any[] }>({ queryKey: [`/api/hiq/crews/${roomCrewId}`], enabled: !!roomCrewId && crewPicker === "CREW_SETTLE" });
    const postCrewCard = useCallback(async (path: "crew-meetup" | "crew-poll" | "crew-notice", body: Record<string, unknown>) => {
        const myKey = key;
        try {
            const row = await apiRequest(`/api/hiq/chat/rooms/${myKey}/cards/${path}`, { method: "POST", body }) as ChatMsg;
            if (keyRef.current !== myKey) return;
            sentIdsRef.current.set(row.id, Date.now());
            merge([row]);
        } catch (e: any) {
            toast({ title: e?.message || t("chat.attach.failed"), variant: "destructive" });
        }
    }, [key, merge, t, toast]);
    const submitSettlement = useCallback(async (data: any) => {
        if (!roomCrewId) return;
        setCrewBusy(true);
        try {
            await apiRequest(`/api/hiq/crews/${roomCrewId}/settlements`, { method: "POST", body: { ...data, sendToChat: true } });
            toast({ title: t("clubDetail.settlementCreated") });
            setCrewPicker(null);
        } catch (e: any) {
            toast({ title: t("clubDetail.createFailed"), description: e?.message, variant: "destructive" });
        } finally { setCrewBusy(false); }
    }, [roomCrewId, t, toast]);
    const submitNotice = useCallback(async (v: { title: string; content: string }) => {
        if (!roomCrewId) return;
        setCrewBusy(true);
        try {
            // 공지사항 카테고리 + isNotice — 게시판 맨 위에 고정된다(운영진만 — 서버가 한 번 더 본다).
            const post = await apiRequest(`/api/hiq/crews/${roomCrewId}/posts`, { method: "POST", body: { title: v.title, content: v.content, category: "공지사항", isNotice: true } }) as { id: string };
            void qc.invalidateQueries({ queryKey: [`/api/hiq/crews/${roomCrewId}/posts`] });
            setCrewPicker(null);
            if (post?.id) await postCrewCard("crew-notice", { postId: post.id });
        } catch (e: any) {
            toast({ title: e?.message || t("chat.actionFailed"), variant: "destructive" });
        } finally { setCrewBusy(false); }
    }, [roomCrewId, postCrewCard, qc, t, toast]);

    const d = info.data;
    const b = d?.booking;
    // 방 종목: 서버가 준 sport, 없으면 조인·부킹 방은 골프, 그 밖은 지금 앱 모드.
    const attachSport: "BILLIARDS" | "GOLF" = d?.sport ?? (d?.kind === "listing" ? "GOLF" : currentSport === "GOLF" ? "GOLF" : "BILLIARDS");
    const canAttach = !!d && d.kind !== "support" && !!member;

    // 신고·차단 — 문의 방은 뺀다(상대가 운영자다). 고른 남의 메시지 한 건을 잡아 두고 [신고] [차단하기] 시트를 띄운다.
    // 시트·신고 창이 닫혀도 대상은 남겨 둔다 — 닫히는 동안에도 그려야 하고, 신고 창은 시트가 닫힌 뒤에 뜬다.
    const canReport = !!d && d.kind !== "support" && !!member;
    const [reportMsg, setReportMsg] = useState<ChatMsg | null>(null);
    const [reportMenuOpen, setReportMenuOpen] = useState(false);
    const [reportDialogOpen, setReportDialogOpen] = useState(false);
    const reportTarget = canReport && reportMsg ? reportTargetFor(d, reportMsg) : null;
    const openReport = useCallback((m: ChatMsg) => { setReportMsg(m); setReportMenuOpen(true); }, []);
    // 차단 직후 그 사람 글을 바로 걷는다 — 서버도 차단한 사람 글은 안 주지만, 안 걷으면 다음 통째 동기화(최대 30초)까지 화면에 남는다.
    const dropSender = useCallback((senderId: string) => setMessages((cur) => cur.filter((x) => x.senderId !== senderId)), []);
    const blockSender = useBlockMember();
    const askBlock = async () => {
        if (!reportTarget) return;
        const { authorId } = reportTarget; // 응답이 오는 사이 다른 메시지를 골라도 **차단한 그 사람** 글만 걷는다
        if (!(await appConfirm({ message: blockConfirmText(t, reportTarget.targetType, reportTarget.authorName), tone: "danger", confirmText: t("community.blockMenu") }))) return;
        blockSender.mutate(authorId, { onSuccess: () => { dropSender(authorId); setReportMenuOpen(false); } });
    };
    // 방을 옮기면(같은 컴포넌트가 재사용된다) 앞 방에서 고른 메시지를 버린다 — 새 방의 종류로 엉뚱하게 신고되지 않게.
    useEffect(() => { setReportMsg(null); setReportMenuOpen(false); setReportDialogOpen(false); }, [key]);

    // ── 말풍선 메뉴(2026-10-06 오너: "신고하기 버튼 위에 기능들 더 — 복사하기나 이런 거, 번역하기는 일단 관리자만") ──
    // 고른 메시지(reportMsg)와 시트(reportMenuOpen)는 신고·차단이 쓰던 것을 그대로 쓴다 — 이제 그 시트가 메뉴 전체다.
    // 메시지마다 할 수 있는 일이 다르다: 복사(글자 메시지) · 번역(운영자, 남의 글자 메시지) · 신고·차단(남의 글, 문의 방 아님) · 삭제(내 글·운영진).
    // 운영자 = 슈퍼관리자만(2026-10-07) — 번역·다듬기는 서버도 슈퍼관리자만 받는다(chat.repo isAdmin)
    const isStaff = (member as any)?.role === "super_admin";
    const canDeleteMsg = (m: ChatMsg) => !!member && (m.senderId === member.id || !!d?.canManage);
    const menuFor = (m: ChatMsg) => {
        const text = (m.type ?? "text") === "text" && !!m.message?.trim();
        const others = !!m.senderId && m.senderId !== member?.id;
        return {
            copy: text,
            translate: text && isStaff && others,
            report: canReport && others && !!d && !!reportTargetFor(d, m),
            del: canDeleteMsg(m),
        };
    };
    const menu = reportMsg ? menuFor(reportMsg) : { copy: false, translate: false, report: false, del: false };
    // 번역문(운영자) — 메시지 id 별. 원문은 그대로 두고 말풍선 아래에 붙인다. 방을 옮기면 비운다.
    const [translations, setTranslations] = useState<Record<string, { text?: string; loading?: boolean; failed?: boolean }>>({});
    useEffect(() => { setTranslations({}); }, [key]);
    const copyMsg = async () => {
        const m = reportMsg; if (!m) return;
        setReportMenuOpen(false);
        const ok = await copyText(m.message);
        toast(ok ? { title: t("chat.msgMenu.copied") } : { title: t("chat.msgMenu.copyFailed"), variant: "destructive" });
    };
    const translateMsg = async () => {
        const m = reportMsg; if (!m) return;
        setReportMenuOpen(false);
        // 이미 띄운 번역이면 숨긴다(같은 줄이 '번역 숨기기'로 바뀌어 있다)
        if (translations[m.id]?.text) { setTranslations((cur) => { const next = { ...cur }; delete next[m.id]; return next; }); return; }
        const asked = key;
        setTranslations((cur) => ({ ...cur, [m.id]: { loading: true } }));
        try {
            const out = await apiRequest(`/api/hiq/chat/rooms/${asked}/messages/${m.id}/translate`, { method: "POST" }) as { text: string };
            if (keyRef.current !== asked) return; // 그사이 방을 옮겼다
            setTranslations((cur) => ({ ...cur, [m.id]: { text: out.text } }));
        } catch (e: any) {
            if (keyRef.current !== asked) return;
            // 실패는 한 번만 말한다 — 말풍선 아래에 실패 줄을 남기지 않는다(메뉴에서 다시 누르면 다시 묻는다)
            setTranslations((cur) => { const next = { ...cur }; delete next[m.id]; return next; });
            toast({ title: e?.message || t("chat.msgMenu.translateFailed"), variant: "destructive" });
        }
    };
    const deleteFromMenu = () => { const m = reportMsg; if (!m) return; setReportMenuOpen(false); void remove(m); };
    // 답변 다듬기(2026-10-06 오너) — 운영자가 남의 문의 방에서 답할 때만. 한국어로 쓴 답을 회원 언어의 정중한 문장으로 바꿔 입력칸에 넣는다.
    // 보내기는 내가 누른다. 바꾼 글의 언어 이름은 화면 언어로(Intl), 뜻풀이는 서버가 화면 언어로 준다(같은 언어면 없다).
    const canPolish = isStaff && kind === "support" && !!member && id !== member.id;
    const polishReply = async (draft: string) => {
        const asked = key;
        try {
            const out = await apiRequest(`/api/hiq/chat/rooms/${asked}/reply-polish`, { method: "POST", body: { text: draft } }) as { text: string; language: string; back: string };
            if (keyRef.current !== asked) return null; // 그사이 방을 옮겼다 — 앞 방의 답을 새 방 입력칸에 넣지 않는다
            const lang = languageLabel(out.language, locale);
            return { text: out.text, title: lang ? t("chat.polish.done").replace("{lang}", lang) : t("chat.polish.doneNoLang"), detail: out.back || undefined };
        } catch (e: any) {
            if (keyRef.current === asked) toast({ title: e?.message || t("chat.polish.failed"), variant: "destructive" });
            return null;
        }
    };

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
            const plain = (
                <button type="button" onClick={() => setLocation(`/crew/${d.crewId}`)} className="w-full px-4 py-2.5 border-b border-surface-line bg-surface-1 flex items-center gap-2 text-left">
                    <LucideUsers className="w-4 h-4 text-ink-3" />
                    <span className="text-[12.5px] font-medium text-ink-3 flex-1 truncate">{t("chat.crewPinned").replace("{n}", String(d.members.length))}</span>
                    <span className="text-[12px] font-medium text-brand">{t("chat.goCrewHome")}</span>
                </button>
            );
            // 다가오는 정모가 있으면 정모 띠, 없으면 예전 한 줄(plain).
            return d.crewId ? <MeetupBanner crewId={d.crewId} meId={member?.id} onOpen={() => setLocation(`/crew/${d.crewId}/home`)} fallback={plain} /> : plain;
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
                {/* ⋯ — 들어갈 수 있는 방에서만(못 들어가는 방은 참여자도 알림도 뜻이 없다) */}
                {d && (
                    <button type="button" onClick={() => setMenuOpen(true)} aria-label={t("chat.menu.title")} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 active:bg-surface-2 shrink-0">
                        <LucideMoreVertical className="w-5 h-5" />
                    </button>
                )}
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
                    onAttach={canAttach ? () => setAttachOpen(true) : undefined}
                    canDelete={(m) => !!member && (m.senderId === member.id || !!d?.canManage)}
                    onReport={canReport ? openReport : undefined}
                    // 말풍선 메뉴 — 길게 누르기·우클릭·남의 글의 ⋯ 가 한 시트를 연다. 할 일이 하나도 없는 글(남의 카드, 문의 방의 카드 등)에서는 열지 않는다.
                    onMenu={openReport}
                    canMenu={(m) => { const x = menuFor(m); return x.copy || x.translate || x.report || x.del; }}
                    translationOf={(m) => translations[m.id]}
                    onPolish={canPolish ? polishReply : undefined}
                    pinned={pinned} loading={loading || info.isPending} onSeen={markSeen}
                    hasOlder={hasOlder} loadingOlder={loadingOlder} onLoadOlder={loadOlder} roomKey={key}
                    readLineAt={readLineAt} unreadBy={unreadBy}
                    // 티타임 이틀 뒤 조인·부킹 방은 읽기만(서버도 같은 기준으로 막는다) — 목록에서 빠진 방에서 푸시만 오지 않게
                    disabled={d?.kind === "listing" && !!b && new Date(b.datetime).getTime() < Date.now() - 2 * 86_400_000}
                    // 문의 방의 빈 화면: 회원에게는 "적어 주세요", 운영자가 남의 방을 열었으면(먼저 말 걸기) "먼저 보내 보세요 — 운영팀으로 보여요"
                    emptyText={d?.kind === "support" ? (d.id === member?.id ? t("chat.emptySupport") : t("chat.emptySupportAdmin")) : d?.kind === "listing" ? t("chat.emptyRoom") : t("chat.empty")}
                />
            )}
            {d && (
                <ChatMenuSheet
                    open={menuOpen} onOpenChange={setMenuOpen} members={d.members} meId={member?.id}
                    muted={muted} busy={menuBusy}
                    // 나가기는 1:1·소그룹만 — 크루는 탈퇴, 조인/부킹은 신청 취소라서 채팅 메뉴가 할 일이 아니다.
                    canLeave={d.kind === "dm"}
                    onToggleMute={(next) => void toggleMute(next)} onLeave={() => void leaveRoom()}
                    // 참여자 줄의 회원 신고·차단 — 차단하면 그 사람 글을 이 방에서 바로 걷는다.
                    reportable={canReport} onBlocked={dropSender}
                />
            )}
            {d && (
                <>
                    <ChatReportSheet
                        open={reportMenuOpen && !!reportMsg} onOpenChange={setReportMenuOpen}
                        name={reportTarget?.authorName || t("community.thisUser")} busy={blockSender.isPending}
                        onReport={() => { setReportMenuOpen(false); setReportDialogOpen(true); }}
                        onBlock={() => void askBlock()}
                        reportable={menu.report && !!reportTarget}
                        onCopy={menu.copy ? () => void copyMsg() : undefined}
                        onTranslate={menu.translate ? () => void translateMsg() : undefined}
                        translateLabel={reportMsg && translations[reportMsg.id]?.text ? t("chat.msgMenu.hideTranslation") : undefined}
                        onDelete={menu.del ? deleteFromMenu : undefined}
                    />
                    {menu.report && reportTarget && (
                        // key — 고른 메시지가 바뀌면 앞에서 골라 둔 사유를 비운다.
                        <ReportDialog
                            key={`${reportTarget.targetType}:${reportTarget.targetId}`}
                            open={reportDialogOpen} onOpenChange={setReportDialogOpen}
                            targetType={reportTarget.targetType} targetId={reportTarget.targetId} crewId={reportTarget.crewId}
                            targetAuthorId={reportTarget.authorId} targetAuthorName={reportTarget.authorName}
                            onBlocked={() => dropSender(reportTarget.authorId)}
                        />
                    )}
                </>
            )}
            {canAttach && (
                <>
                    <AttachSheet
                        open={attachOpen} onOpenChange={setAttachOpen} sport={attachSport} roomKind={d.kind} onPick={onPickAttach}
                        canManage={!!d.canManage} onPickCrew={roomCrewId ? setCrewPicker : undefined}
                    />
                    {roomCrewId && (
                        <>
                            {/* 크루 줄 — 크루 홈과 같은 만들기 창. 만든 정모·투표를 이 방에 카드로 붙인다(만들 때 크루 알림이 나가서 카드 푸시는 서버가 건너뛴다). */}
                            {attachSport === "GOLF" ? (
                                <CreateGolfActivityModal
                                    open={crewPicker === "CREW_MEETUP"} onOpenChange={(o) => { if (!o) setCrewPicker(null); }} crewId={roomCrewId}
                                    onCreated={(a) => void postCrewCard("crew-meetup", { activityId: a.id })}
                                />
                            ) : (
                                <CreateActivityDialog
                                    open={crewPicker === "CREW_MEETUP"} onOpenChange={(o) => { if (!o) setCrewPicker(null); }} crewId={roomCrewId} sportCategory="BILLIARDS"
                                    onCreated={(a) => void postCrewCard("crew-meetup", { activityId: a.id })}
                                />
                            )}
                            <CreatePollDialog
                                open={crewPicker === "CREW_POLL"} onOpenChange={(o) => { if (!o) setCrewPicker(null); }} crewId={roomCrewId}
                                onCreated={(p) => void postCrewCard("crew-poll", { pollId: p.id })}
                            />
                            {d.canManage && (
                                <>
                                    <CreateSettlementDialog
                                        open={crewPicker === "CREW_SETTLE" && !!crewData.data} onOpenChange={(o) => { if (!o) setCrewPicker(null); }} crewId={roomCrewId}
                                        members={crewData.data?.members ?? []} me={member ?? undefined} isPending={crewBusy}
                                        onSubmit={(data) => void submitSettlement(data)}
                                    />
                                    <NoticeComposeSheet open={crewPicker === "CREW_NOTICE"} onOpenChange={(o) => { if (!o) setCrewPicker(null); }} busy={crewBusy} onSubmit={(v) => void submitNotice(v)} />
                                </>
                            )}
                        </>
                    )}
                    {/* 매칭 대결: 카드가 핀을 들고 방에 남는다 — 방장은 이 자리를 뜨지 않고, 나중에 카드를 눌러 이어받는다.
                        1:1 방은 자리가 둘뿐이라 인원 줄을 아예 안 그린다. */}
                    <MatchInviteSheet
                        open={picker === "MATCH_INVITE"} onOpenChange={(o) => { if (!o) setPicker(null); }} busy={matchBusy}
                        seatsFixed={d?.kind === "dm" && (d?.members?.length ?? 0) === 2 ? 2 : undefined}
                        onPick={(pick) => {
                            setMatchBusy(true);
                            void postCard("MATCH_INVITE", { ...pick }, () => { setPicker(null); }).finally(() => setMatchBusy(false));
                        }}
                    />
                    <SimInviteSheet
                        open={picker === "SIM_INVITE"} onOpenChange={(o) => { if (!o) setPicker(null); }} busy={simBusy}
                        onPick={(pick) => {
                            setSimBusy(true);
                            void postCard("SIM_INVITE", { ...pick }, (row) => {
                                setPicker(null); setSimBusy(false);
                                const id = (row as any)?.metadata?.matchId;
                                // 방 열쇠를 싣는다 — 로비가 목록을 뒤지지 않고 그 방을 바로 연다.
                                setLocation(id ? `/online-game?lobby=1&room=${encodeURIComponent(String(id))}` : "/online-game?lobby=1");
                            }).finally(() => setSimBusy(false));
                        }}
                    />
                    <RecentGamesPicker open={picker === "GAME_RESULT"} onOpenChange={(o) => { if (!o) setPicker(null); }} onPick={(gameId) => { setPicker(null); void postCard("GAME_RESULT", { gameId }); }} />
                    <StorePicker open={picker === "STORE"} onOpenChange={(o) => { if (!o) setPicker(null); }} onPick={(pick) => { setPicker(null); void postCard("STORE", pick.code ? { code: pick.code } : { slug: pick.slug }); }} />
                    <GolfListingPicker open={picker === "GOLF_BOOKING"} onOpenChange={(o) => { if (!o) setPicker(null); }} onPick={(bookingId) => { setPicker(null); void postCard("GOLF_BOOKING", { bookingId }); }} />
                    <GolfRoundsPicker open={picker === "GOLF_ROUND"} onOpenChange={(o) => { if (!o) setPicker(null); }} onPick={(historyId) => { setPicker(null); void postCard("GOLF_ROUND", { historyId }); }} />
                    {/* 조인·부킹 방이면 그 글의 코스명을 기본값으로 — 같은 골프장에서 치는 사람들이다 */}
                    <GolfMatchCreateSheet open={picker === "GOLF_MATCH"} onOpenChange={(o) => { if (!o) setPicker(null); }} defaultCourseName={d.kind === "listing" && b && !b.isBlind ? b.courseName : undefined} onCreate={(courseName) => { setPicker(null); void postCard("GOLF_MATCH", { courseName }); }} />
                </>
            )}
        </div>
    );
}
