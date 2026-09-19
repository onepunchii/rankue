
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import OnlineGameView from "./OnlineGameView";
import ModerationView from "./ModerationView";
import MemberGamesDialog from "./MemberGamesDialog";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
    LucideLayoutDashboard, LucideStore, LucideUsers, LucidePhone,
    LucideGlobe, LucideArrowRight, LucideCheckCircle, LucideLogOut,
    LucideSearch, LucideTrendingUp, LucideBell, LucideCreditCard, LucideSettings, LucideShieldAlert, LucideMenu, LucideX, LucideUsersRound, LucideMail, LucideFlag, GameController
} from "@/lib/icons";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"; // Assuming Sheet is available or using conditional rendering
import { flagEmoji } from "@/lib/flag";

// --- Types ---
type GlobalStats = {
    totalStores: number;
    totalUsers: number;
    totalVisitsToday: number;
    newLeads: number;
};

type PartnerLead = {
    id: string;
    ownerName: string;
    phoneNumber: string;
    storeName: string | null;
    region: string | null;
    status: "NEW" | "CONTACTED" | "REGISTERED";
    createdAt: string;
};

type AdminStore = {
    id: string;
    name: string;
    region: string;
    ownerName: string;
    slug: string;
    plan: "free" | "basic" | "premium";
    subscriptionStatus: "active" | "overdue" | "cancelled";
    nextBillingDate: string | null;
};

type Notice = {
    id: string;
    title: string;
    content: string;
    target: "all" | "owners";
    createdAt: string;
};

type AdminCrew = {
    id: string;
    name: string;
    description: string;
    sportCategory: "BILLIARDS" | "GOLF" | "MIXED";
    memberCount: number;
    leaderName: string;
    storeName: string;
    createdAt: string;
};

type SuggestionReply = {
    id: string;
    message: string;
    createdAt: string;
};

type Suggestion = {
    id: string;
    type: string;
    content: string;
    contact: string | null;
    createdAt: string;
    isRead: boolean;
    /** 보낸 답장 — 오래된 것부터(서버 admin.repo getSuggestions) */
    replies: SuggestionReply[];
};

// 운영자 알림(푸시)을 누르면 ?tab= 으로 온다 — 신고 알림은 moderation, 새 건의 알림은 suggestions.
const DEEP_LINK_TABS = ["moderation", "suggestions"] as const;

// --- Left Sidebar Component ---
// --- Sidebar Component (Unified) ---
function SidebarContent({ tab, setTab, handleLogout, closeMobileMenu }: any) {
    const menuItems = [
        { id: "dashboard", label: "Dashboard", icon: LucideLayoutDashboard },
        { id: "online-game", label: "온라인게임", icon: GameController },
        { id: "claims", label: "매장 클레임", icon: LucideStore },
        { id: "registrations", label: "신규 매장 등록", icon: LucideStore },
        { id: "leads", label: "입점 문의", icon: LucidePhone },
        { id: "stores", label: "매장 리스트", icon: LucideStore },
        { id: "crews", label: "크루 현황", icon: LucideUsersRound },
        { id: "members", label: "회원 관리", icon: LucideUsers },
        { id: "push", label: "푸시 발송", icon: LucideBell },
        { id: "golf-orders", label: "골프 회원권", icon: LucideFlag }, // New
        { id: "billing", label: "결제 관리", icon: LucideCreditCard },
        { id: "suggestions", label: "건의함", icon: LucideMail },
        { id: "notices", label: "공지사항", icon: LucideBell },
        { id: "moderation", label: "신고/제재", icon: LucideShieldAlert },
    ];

    return (
        // 모바일 서랍에서도 메뉴가 다 보이게: 가운데 목록만 스크롤(머리글·로그아웃은 고정), min-h-0 이 없으면 flex 자식이 안 줄어 스크롤이 안 생긴다
        <div className="flex flex-col h-full min-h-0 bg-white border-r border-black/10">
            <div className="shrink-0 p-6 border-b border-black/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                        <LucideGlobe className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black tracking-tight text-brand">ADMIN</h1>
                        <span className="text-[10px] text-black/40 font-bold uppercase tracking-widest block">Control Tower</span>
                    </div>
                </div>
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-1">
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => {
                            setTab(item.id);
                            if (closeMobileMenu) closeMobileMenu();
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${tab === item.id
                            ? "bg-brand text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                            : "text-black/60 hover:bg-black/[0.04] hover:text-[rgba(0,0,0,0.87)]"
                            }`}
                    >
                        <item.icon size={18} />
                        {item.label}
                    </button>
                ))}
            </nav>

            <div className="shrink-0 p-4 border-t border-black/10" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-500/10 transition">
                    <LucideLogOut size={18} />
                    로그아웃
                </button>
            </div>
        </div>
    );
}


// --- Main Page Component ---

/** 마지막 접속을 "3분 전 · 2일 전" 으로. 기록이 없으면 '-'. */
function lastSeenLabel(iso: string | null | undefined): string {
    if (!iso) return "-";
    const ms = Date.now() - Date.parse(iso);
    if (!Number.isFinite(ms)) return "-";
    const min = Math.floor(ms / 60_000);
    if (min < 1) return "방금";
    if (min < 60) return `${min}분 전`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}시간 전`;
    const d = Math.floor(h / 24);
    return d < 30 ? `${d}일 전` : `${Math.floor(d / 30)}달 전`;
}
/** 30일 넘게 안 들어온 회원은 이탈로 본다 — 붉게. 7일 안이면 진하게. */
function lastSeenTone(iso: string | null | undefined): string {
    if (!iso) return "text-black/25";
    const d = (Date.now() - Date.parse(iso)) / 86_400_000;
    return d > 30 ? "text-red-600" : d <= 7 ? "text-[rgba(0,0,0,0.87)] font-bold" : "text-black/55";
}
/** 리텐션 칸: 아직 그 기간이 안 지난 코호트는 '-' (숫자를 내면 낮게 보여 오해한다). */
function retentionCell(n: number, signed: number, ready: boolean) {
    if (!ready || signed === 0) return <span className="text-black/25">-</span>;
    const pct = Math.round((n / signed) * 100);
    return <span className={pct >= 40 ? "font-bold text-brand" : pct > 0 ? "text-[rgba(0,0,0,0.87)]" : "text-black/35"}>{pct}%<span className="text-black/35 text-[11px]"> ({n})</span></span>;
}

export default function AdminDashboard() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    // 모바일 메뉴 서랍(열림 상태를 들고 있어야 메뉴를 고를 때 닫을 수 있다)
    const [menuOpen, setMenuOpen] = useState(false);
    const [tab, setTab] = useState<"dashboard" | "claims" | "registrations" | "leads" | "stores" | "crews" | "members" | "push" | "billing" | "suggestions" | "notices" | "moderation" | "golf-orders" | "online-game">(() =>
        // 신고 알림은 ?tab=moderation(신고/제재 센터), 새 건의 알림은 ?tab=suggestions(건의함)로 온다(2026-09-11).
        // 목록에 없는 값은 무시하고 대시보드를 연다.
        DEEP_LINK_TABS.find((t) => t === new URLSearchParams(window.location.search).get("tab")) ?? "dashboard");
    // 대시보드가 이미 떠 있을 때 알림을 누르면 주소만 바뀌고 이 화면은 다시 만들어지지 않는다(navigateInApp 은 라우터 이동).
    // 그래서 처음 한 번이 아니라 주소가 바뀔 때마다 ?tab= 을 읽는다. 읽은 뒤에는 주소에서 지운다 — 남겨 두면 다른 탭으로
    // 옮긴 뒤 같은 알림을 또 눌렀을 때 주소가 같아 이동이 일어나지 않는다(navigateInApp 은 같은 주소면 아무것도 안 한다).
    const search = useSearch();
    useEffect(() => {
        const t = DEEP_LINK_TABS.find((x) => x === new URLSearchParams(search).get("tab"));
        if (!t) return;
        setTab(t);
        // 새 건의 알림으로 왔다 — 5분 캐시를 기다리지 않고 건의함을 다시 읽어 방금 온 건의가 보이게 한다.
        if (t === "suggestions") queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/suggestions"] });
        setLocation(window.location.pathname, { replace: true });
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
    const [memberSearch, setMemberSearch] = useState("");
    // 기록 정리 대화상자(잘못 만든 경기 삭제) — 회원 표의 '기록' 버튼이 연다
    const [gamesFor, setGamesFor] = useState<{ id: string; name: string } | null>(null);
    /** 임시 PIN 발급 결과 — 사용자에게 전달할 때까지 창에 띄워 둔다(한 번만 보인다). */
    const [pinResult, setPinResult] = useState<{ pin: string; name: string; phone: string } | null>(null);
    const resetPin = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/members/${id}/reset-pin`, { method: "POST" }) as Promise<{ pin: string; name: string; phone: string }>,
        onSuccess: (r) => setPinResult(r),
        onError: (e: any) => toast({ title: "PIN 초기화 실패", description: e?.message ?? "", variant: "destructive" }),
    });
    const [crewSportFilter, setCrewSportFilter] = useState<"ALL" | "BILLIARDS" | "GOLF">("ALL");

    // Queries
    const { data: stats } = useQuery<GlobalStats>({ queryKey: ["/api/hiq/admin/stats"] });
    const { data: leads = [] } = useQuery<PartnerLead[]>({ queryKey: ["/api/hiq/admin/leads"] });
    const { data: stores = [] } = useQuery<AdminStore[]>({ queryKey: ["/api/hiq/admin/stores"] });
    const { data: crews = [] } = useQuery<AdminCrew[]>({ queryKey: ["/api/hiq/admin/crews"] });
    const { data: notices = [] } = useQuery<Notice[]>({ queryKey: ["/api/hiq/admin/notices"] });
    const { data: suggestions = [] } = useQuery<Suggestion[]>({ queryKey: ["/api/hiq/admin/suggestions"] });
    // 건의 모두 읽음 — 하나씩 누르는 게 일이다(오너 요청 2026-09-04).
    const readAllSuggestionsMutation = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/admin/suggestions/read-all", { method: "PATCH" }),
        onSuccess: (r: any) => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/suggestions"] });
            toast({ title: `${r?.count ?? 0}건 읽음 처리` });
        },
        onError: (e: any) => toast({ title: e?.message || "처리 실패", variant: "destructive" }),
    });
    const { data: members = [] } = useQuery<any[]>({ queryKey: ["/api/hiq/admin/members"] });
    const { data: activity } = useQuery<{
        dau: number; wau: number; mau: number; sessions7: number; avgMinutes7: number;
        cohorts: { week: string; signed: number; d1: number; d7: number; d30: number; d7Ready: boolean; d30Ready: boolean }[];
    }>({ queryKey: ["/api/hiq/admin/activity"], enabled: tab === "members" });

    // Filter crews
    const filteredCrews = crews.filter(crew => {
        if (crewSportFilter === "ALL") return true;
        return crew.sportCategory === crewSportFilter || crew.sportCategory === "MIXED";
    });

    // 매장 클레임 대기열 — 승인 = 사장님 계정(전화+PIN)+파트너 매장 자동 발급 (실제 온보딩)
    const { data: claims = [] } = useQuery<Array<{
        id: string; listingCode: string; applicantName: string; applicantPhone: string;
        message: string | null; status: string; issuedPin: string | null; createdAt: string;
        listingName: string | null; listingRegion: string | null; listingAddress: string | null;
    }>>({ queryKey: ["/api/hiq/admin/listing-claims"] });
    const [approveResult, setApproveResult] = useState<{ storeSlug: string; partnerPhone: string; issuedPin: string | null; notified?: boolean } | null>(null);
    const approveClaim = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/listing-claims/${id}/approve`, { method: "POST" }),
        onSuccess: (r: any) => {
            setApproveResult(r);
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/listing-claims"] });
        },
        onError: (e: any) => toast({ title: e?.message || "승인 실패", variant: "destructive" }),
    });
    const rejectClaim = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/listing-claims/${id}/reject`, { method: "POST" }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/listing-claims"] }),
        onError: (e: any) => toast({ title: e?.message || "거절 실패", variant: "destructive" }),
    });

    // 신규 매장 등록 대기열 — 승인 = 리스팅 생성(n#####)+지오코딩+사장님 권한 발급
    const { data: registrations = [] } = useQuery<Array<{
        id: string; name: string; region: string; address: string; phone: string | null;
        openHours: string | null;
        tableLarge: number | null; tableMedium: number | null; tablePocket: number | null;
        rate10Large: number | null; rate10Medium: number | null; rate10Pocket: number | null;
        flatLarge: number | null; flatMedium: number | null; flatPocket: number | null;
        applicantName: string; applicantPhone: string;
        status: "pending" | "approved" | "rejected"; listingCode: string | null; issuedPin: string | null; createdAt: string;
        kind?: "owner" | "report";
    }>>({ queryKey: ["/api/hiq/admin/store-registrations"] });
    const [regResult, setRegResult] = useState<{ listingCode: string; storeSlug?: string; partnerPhone?: string; issuedPin?: string | null; notified?: boolean; kind?: "owner" | "report" } | null>(null);
    const approveReg = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/store-registrations/${id}/approve`, { method: "POST" }),
        onSuccess: (r: any) => {
            setRegResult(r);
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/store-registrations"] });
        },
        onError: (e: any) => toast({ title: e?.message || "승인 실패", variant: "destructive" }),
    });
    const rejectReg = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/store-registrations/${id}/reject`, { method: "POST" }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/store-registrations"] }),
        onError: (e: any) => toast({ title: e?.message || "거절 실패", variant: "destructive" }),
    });

    // 공지 숨김·삭제
    const toggleNoticeMutation = useMutation({
        mutationFn: async ({ id, hidden }: { id: string; hidden: boolean }) =>
            apiRequest(`/api/hiq/admin/notices/${id}`, { method: "PATCH", body: { hidden } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/notices"] }),
    });
    const deleteNoticeMutation = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/notices/${id}`, { method: "DELETE" }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/notices"] }),
    });

    // 푸시함 — 전체/개별 회원 대상 발송
    const [pushForm, setPushForm] = useState({ title: "", body: "", url: "" });
    const [pushTargets, setPushTargets] = useState<string[]>([]);
    const [pushAll, setPushAll] = useState(true);
    const sendPushMutation = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/admin/push", {
            method: "POST",
            body: { memberIds: pushAll ? "all" : pushTargets, title: pushForm.title, body: pushForm.body, url: pushForm.url.trim() || undefined },
        }),
        onSuccess: (r: any) => {
            toast({ title: `발송 완료 — ${r.sent}/${r.total}명` });
            setPushForm({ title: "", body: "", url: "" });
            setPushTargets([]);
        },
        onError: (e: any) => toast({ title: e?.message || "발송 실패", variant: "destructive" }),
    });

    // Mutations
    const updateLeadStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            return apiRequest(`/api/hiq/admin/leads/${id}/status`, { method: "POST", body: { status } });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/leads"] });
            toast({ title: "상태 업데이트 완료" });
        }
    });

    const createNoticeMutation = useMutation({
        mutationFn: async (data: any) => {
            return apiRequest("/api/hiq/admin/notices", { method: "POST", body: data });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/notices"] });
            toast({ title: "공지사항 등록 완료" });
            setNewNoticeOpen(false);
        }
    });
    const [newNoticeOpen, setNewNoticeOpen] = useState(false);
    const [noticeForm, setNoticeForm] = useState({ title: "", content: "", target: "all" });

    const impersonateMutation = useMutation({
        mutationFn: async (storeId: string) => {
            return apiRequest(`/api/hiq/admin/impersonate/${storeId}`, { method: "POST" });
        },
        onSuccess: () => {
            window.location.href = "/partner/dashboard";
        }
    });

        // 건의 답장 — 전화 말고 앱 알림으로 회신한다(오너 요청 2026-08-19).
    const [replyingId, setReplyingId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState("");
    const replyMutation = useMutation({
        mutationFn: async ({ id, message }: { id: string; message: string }) =>
            apiRequest(`/api/hiq/admin/suggestions/${id}/reply`, { method: "POST", body: { message } }),
        onSuccess: (r: any) => {
            toast({
                title: `${r?.memberName ?? "회원"}님에게 답장을 보냈습니다`,
                // 답장은 갔는데 기록만 실패한 경우(서버 recorded:false) — 다시 보내면 회원이 두 번 받는다.
                description: r?.recorded === false ? "'보낸 답장' 기록에는 실패했습니다. 다시 보내지 마세요." : undefined,
            });
            setReplyingId(null);
            setReplyText("");
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/suggestions"] });
        },
        onError: (e: any) => toast({ title: e?.message || "답장 전송 실패", variant: "destructive" }),
    });

    const toggleSuggestionReadMutation = useMutation({
        mutationFn: async ({ id, isRead }: { id: string, isRead: boolean }) => {
            return apiRequest(`/api/hiq/admin/suggestions/${id}`, { method: "PATCH", body: { isRead } });
        },
        // Optimistic update
        onMutate: async ({ id, isRead }) => {
            await queryClient.cancelQueries({ queryKey: ["/api/hiq/admin/suggestions"] });
            const previous = queryClient.getQueryData<Suggestion[]>(["/api/hiq/admin/suggestions"]);
            queryClient.setQueryData<Suggestion[]>(["/api/hiq/admin/suggestions"], (old) =>
                (old ?? []).map((s) => (s.id === id ? { ...s, isRead } : s))
            );
            return { previous };
        },
        onError: (_err, _vars, context) => {
            // Rollback
            if (context?.previous) {
                queryClient.setQueryData(["/api/hiq/admin/suggestions"], context.previous);
            }
            toast({ title: "처리에 실패했습니다", variant: "destructive" });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/suggestions"] });
        }
    });

    const handleLogout = async () => {
        // Session cookies are httpOnly, so client JS cannot clear them — the server must.
        try {
            await apiRequest("/api/hiq/logout", { method: "POST" });
        } catch {
            /* proceed even if offline */
        }
        // Wipe cached PII from memory and the throttled localStorage persister.
        queryClient.clear();
        localStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
        setLocation("/partner/login");
    };

    return (
        <div className="min-h-screen bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-black/10 p-4 sticky top-0 z-30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
                        <LucideGlobe className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-black text-brand">ADMIN</span>
                </div>
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="메뉴" className="text-[rgba(0,0,0,0.87)]">
                            <LucideMenu />
                        </Button>
                    </SheetTrigger>
                    {/* 서랍도 화면 높이에 맞춰 세로 flex — 안의 메뉴가 스크롤된다. 고르면 닫힌다. */}
                    <SheetContent side="left" className="p-0 border-r border-black/10 w-72 max-w-[85vw] bg-white flex flex-col h-full">
                        <SidebarContent tab={tab} setTab={setTab} handleLogout={handleLogout} closeMobileMenu={() => setMenuOpen(false)} />
                    </SheetContent>
                </Sheet>
            </div>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 flex-col fixed h-full z-20">
                <SidebarContent tab={tab} setTab={setTab} handleLogout={handleLogout} />
            </aside>

            {/* Main Content */}
            {/* Main Content */}
            <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto">
                {/* Header Title */}
                <header className="mb-8">
                    <h2 className="text-3xl font-black text-[rgba(0,0,0,0.87)] mb-2">{getTabTitle(tab)}</h2>
                    <p className="text-black/55 text-sm">시스템 운영 및 관리</p>
                </header>

                <div className="max-w-6xl">
                    {tab === "dashboard" && (
                        <div className="space-y-8">
                            <div className="space-y-8">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <StatCard label="Total Stores" value={stats?.totalStores || 0} icon={<LucideStore className="text-brand" />} sub="가맹점" />
                                    <StatCard label="New Leads" value={stats?.newLeads || 0} icon={<LucidePhone className="text-brand" />} sub="신규 문의" highlight={!!stats?.newLeads} />
                                    <StatCard label="Today Traffic" value={stats?.totalVisitsToday || 0} icon={<LucideTrendingUp className="text-orange-500" />} sub="방문객" />
                                    <StatCard label="Total Users" value={stats?.totalUsers || 0} icon={<LucideUsers className="text-brand" />} sub="회원수" />
                                </div>

                                {/* Recent Activity Brief */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-6 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                            <LucidePhone size={18} className="text-brand" /> 최근 입점 문의
                                        </h3>
                                        <div className="space-y-3">
                                            {leads.slice(0, 3).map(lead => (
                                                <div key={lead.id} className="flex justify-between items-center text-sm p-3 bg-black/[0.04] rounded-xl">
                                                    <div>
                                                        <span className="font-bold">{lead.ownerName}</span>
                                                        <span className="text-black/55 text-xs ml-2">{lead.region}</span>
                                                    </div>
                                                    <Badge variant={lead.status === 'NEW' ? 'destructive' : 'secondary'}>{lead.status}</Badge>
                                                </div>
                                            ))}
                                            {leads.length === 0 && <div className="text-center text-black/40 py-4 text-xs">문의 내역이 없습니다.</div>}
                                        </div>
                                    </div>

                                    <div className="bg-white p-6 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                            <LucideMail size={18} className="text-brand" /> 최근 건의사항
                                        </h3>
                                        <div className="space-y-3">
                                            {suggestions.slice(0, 3).map(suggestion => (
                                                <div key={suggestion.id} className="p-3 bg-black/[0.04] rounded-xl text-xs space-y-1">
                                                    <div className="flex justify-between items-center">
                                                        <Badge variant={suggestion.type === 'BUG' ? 'destructive' : 'secondary'} className="scale-75 origin-left">
                                                            {suggestion.type}
                                                        </Badge>
                                                        <span className="text-black/40">{new Date(suggestion.createdAt).toLocaleDateString()}</span>
                                                    </div>
                                                    <p className="text-black/70 line-clamp-1">{suggestion.content}</p>
                                                </div>
                                            ))}
                                            {suggestions.length === 0 && <div className="text-center text-black/40 py-4 text-xs">건의사항이 없습니다.</div>}
                                            {suggestions.length > 0 && (
                                                <Button variant="ghost" className="w-full text-xs text-black/55 h-8 mt-2 hover:bg-black/[0.04]" onClick={() => setTab("suggestions")}>
                                                    모두 보기
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === "claims" && (
                        <div className="grid gap-4">
                            {approveResult && (
                                <div className="bg-brand/[0.06] border border-brand/30 p-5 rounded-2xl">
                                    {/* 신청자가 회원이면 앱 알림으로 통보가 끝난다 — 전화할 필요가 없다.
                                        비회원일 때만 PIN 을 전화로 불러줘야 한다. */}
                                    <p className="font-bold text-brand mb-2">
                                        {approveResult.notified
                                            ? "✓ 승인 완료 — 사장님께 앱 알림을 보냈습니다"
                                            : "✓ 승인 완료 — 사장님께 전화로 전달하세요"}
                                    </p>
                                    <div className="text-[14px] space-y-1 tabular-nums">
                                        {approveResult.notified ? (
                                            <p className="text-black/60">
                                                따로 연락하지 않으셔도 됩니다. 사장님이 앱 전체 메뉴 → 내 매장 관리에서 바로 들어갑니다.
                                            </p>
                                        ) : (
                                            <>
                                                <p>파트너 로그인 전화번호: <b>{approveResult.partnerPhone}</b></p>
                                                {approveResult.issuedPin
                                                    ? <p>임시 PIN: <b className="text-[19px] text-brand">{approveResult.issuedPin}</b> <span className="text-black/45 text-[12px]">— 이 화면을 닫으면 다시 볼 수 없습니다</span></p>
                                                    : <p className="text-black/55">기존 계정 재사용 — 쓰던 비밀번호로 로그인</p>}
                                                <p className="text-black/55 text-[13px]">파트너 포털: /partner/login</p>
                                            </>
                                        )}
                                    </div>
                                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setApproveResult(null)}>닫기</Button>
                                </div>
                            )}
                            {claims.length === 0 && (
                                <div className="bg-white p-8 rounded-2xl text-center text-black/45 text-sm">
                                    접수된 클레임이 없습니다. 사장님이 매장 페이지(/stores)에서 '내 매장 정보 관리 신청'을 하면 여기에 쌓입니다.
                                </div>
                            )}
                            {claims.map((c) => (
                                <div key={c.id} className="bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant={c.status === "pending" ? "destructive" : c.status === "approved" ? "default" : "secondary"}>
                                                {c.status === "pending" ? "대기" : c.status === "approved" ? "승인됨" : "거절됨"}
                                            </Badge>
                                            {c.issuedPin && (
                                                <Badge variant="outline" className="border-brand/40 text-brand tabular-nums" title="발급 당시 초기 PIN — 사장님이 변경했다면 낡은 값일 수 있습니다">
                                                    초기 PIN {c.issuedPin}
                                                </Badge>
                                            )}
                                            <span className="text-xs text-black/40">{new Date(c.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <h3 className="text-lg font-bold truncate">{c.listingName ?? c.listingCode}</h3>
                                        <div className="text-black/60 text-sm mt-1">
                                            {c.applicantName} 사장님 · {c.applicantPhone}
                                        </div>
                                        <div className="text-black/45 text-xs mt-0.5 truncate">{c.listingRegion} · {c.listingAddress}</div>
                                        {c.message && <div className="text-black/55 text-xs mt-1 truncate">"{c.message}"</div>}
                                    </div>
                                    {c.status === "pending" && (
                                        <div className="flex gap-2 shrink-0">
                                            <Button size="sm" variant="outline" onClick={() => window.open(`tel:${c.applicantPhone}`)}>전화</Button>
                                            <Button size="sm" variant="ghost" className="text-red-500" disabled={rejectClaim.isPending} onClick={() => rejectClaim.mutate(c.id)}>거절</Button>
                                            <Button size="sm" className="bg-brand hover:bg-brand-strong text-white" disabled={approveClaim.isPending} onClick={() => approveClaim.mutate(c.id)}>승인·계정 발급</Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === "registrations" && (
                        <div className="grid gap-4">
                            {regResult && regResult.kind === "report" && (
                                <div className="bg-brand/[0.06] border border-brand/30 p-5 rounded-2xl">
                                    <p className="font-bold text-brand mb-2">✓ 디렉토리에 추가했습니다 — 권한·PIN 은 발급하지 않았습니다(이용자 제보)</p>
                                    <p className="text-[14px]">매장 페이지: <a className="text-brand font-bold underline" href={`/stores/${regResult.listingCode}`} target="_blank" rel="noreferrer">/stores/{regResult.listingCode}</a></p>
                                    <p className="text-[13px] text-black/55 mt-1">사장님이 나중에 "사장님이신가요?"로 클레임하면 그때 권한이 나갑니다.</p>
                                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRegResult(null)}>닫기</Button>
                                </div>
                            )}
                            {regResult && regResult.kind !== "report" && (
                                <div className="bg-brand/[0.06] border border-brand/30 p-5 rounded-2xl">
                                    <p className="font-bold text-brand mb-2">
                                        {regResult.notified
                                            ? "✓ 등록·발급 완료 — 사장님께 앱 알림을 보냈습니다"
                                            : "✓ 등록·발급 완료 — 사장님께 전화로 전달하세요"}
                                    </p>
                                    <div className="text-[14px] space-y-1 tabular-nums">
                                        <p>매장 페이지: <a className="text-brand font-bold underline" href={`/stores/${regResult.listingCode}`} target="_blank" rel="noreferrer">/stores/{regResult.listingCode}</a></p>
                                        {regResult.notified ? (
                                            <p className="text-black/60">따로 연락하지 않으셔도 됩니다. 사장님이 앱 전체 메뉴 → 내 매장 관리에서 바로 들어갑니다.</p>
                                        ) : (
                                            <>
                                                <p>파트너 로그인 전화번호: <b>{regResult.partnerPhone}</b></p>
                                                {regResult.issuedPin
                                                    ? <p>임시 PIN: <b className="text-[19px] text-brand">{regResult.issuedPin}</b> <span className="text-black/45 text-[12px]">— 이 화면을 닫으면 다시 볼 수 없습니다</span></p>
                                                    : <p className="text-black/55">기존 계정 재사용 — 쓰던 비밀번호로 로그인</p>}
                                            </>
                                        )}
                                    </div>
                                    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setRegResult(null)}>닫기</Button>
                                </div>
                            )}
                            {registrations.length === 0 && (
                                <div className="bg-white p-8 rounded-2xl text-center text-black/45 text-sm">접수된 신규 매장 등록 신청이 없습니다.</div>
                            )}
                            {registrations.map((r) => (
                                <div key={r.id} className={`bg-white p-5 rounded-2xl border border-black/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col gap-2 ${r.status !== "pending" ? "opacity-50" : ""}`}>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-[15px]">{r.name}</span>
                                        <Badge variant="secondary">{r.region}</Badge>
                                        {r.kind === "report" && <Badge variant="outline" className="border-[#F5B721] text-[#8a6a0a]">이용자 제보 · 권한 미발급</Badge>}
                                        {r.status === "approved" && <Badge className="bg-brand text-white">등록됨 {r.listingCode && `· ${r.listingCode}`}</Badge>}
                                        {r.issuedPin && (
                                            <Badge variant="outline" className="border-brand/40 text-brand tabular-nums" title="발급 당시 초기 PIN — 사장님이 변경했다면 낡은 값일 수 있습니다">
                                                초기 PIN {r.issuedPin}
                                            </Badge>
                                        )}
                                        {r.status === "rejected" && <Badge variant="destructive">거절됨</Badge>}
                                        <span className="text-xs text-black/40 ml-auto">{new Date(r.createdAt).toLocaleString()}</span>
                                    </div>
                                    <div className="text-[13px] text-black/60 space-y-0.5">
                                        <p>{r.address}{r.phone ? ` · ${r.phone}` : ""}{r.openHours ? ` · ${r.openHours}` : ""}</p>
                                        <p className="tabular-nums">
                                            {[r.tableLarge && `대대 ${r.tableLarge}`, r.tableMedium && `중대 ${r.tableMedium}`, r.tablePocket && `포켓 ${r.tablePocket}`].filter(Boolean).join(" · ") || "테이블 미입력"}
                                            {" | "}
                                            {[r.rate10Large && `대대 ${r.rate10Large.toLocaleString()}원/10분`, r.rate10Medium && `중대 ${r.rate10Medium.toLocaleString()}원/10분`].filter(Boolean).join(" · ") || "요금 미입력"}
                                        </p>
                                        <p className="font-medium text-[rgba(0,0,0,0.75)]">신청자: {r.applicantName} · {r.applicantPhone}</p>
                                    </div>
                                    {r.status === "pending" && (
                                        <div className="flex gap-2 justify-end">
                                            <Button size="sm" variant="outline" onClick={() => window.open(`tel:${r.applicantPhone}`)}>전화</Button>
                                            <Button size="sm" variant="ghost" className="text-red-500" disabled={rejectReg.isPending} onClick={() => rejectReg.mutate(r.id)}>거절</Button>
                                            <Button size="sm" className="bg-brand hover:bg-brand-strong text-white" disabled={approveReg.isPending} onClick={() => approveReg.mutate(r.id)}>
                                                {approveReg.isPending ? "처리 중..." : r.kind === "report" ? "승인·디렉토리 추가" : "승인·페이지 생성"}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === "leads" && (
                        <div className="grid gap-4">
                            <div className="bg-[#F5B721]/[0.12] p-4 rounded-2xl text-[13px] text-[#8a6a0a] leading-relaxed">
                                입점 문의는 <b>연락처 접수함</b>입니다 — 여기서 상태를 바꿔도 계정은 발급되지 않습니다.
                                사장님께 전화드려 <b>매장 찾기에서 본인 매장을 '관리 신청'(클레임)</b>하도록 안내하면, '매장 클레임' 탭에서 승인 한 번으로 계정·매장이 자동 발급됩니다.
                            </div>
                            {leads.map((lead) => (
                                <div key={lead.id} className="bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-black/10 transition">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant={lead.status === 'NEW' ? 'destructive' : lead.status === 'REGISTERED' ? 'default' : 'secondary'}>
                                                {lead.status}
                                            </Badge>
                                            <span className="text-xs text-black/40">{new Date(lead.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <h3 className="text-lg font-bold">{lead.ownerName} <span className="text-sm font-normal text-black/55">사장님</span></h3>
                                        <div className="text-black/60 text-sm mt-1">
                                            {lead.phoneNumber} | {lead.region} {lead.storeName}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => window.open(`tel:${lead.phoneNumber}`)}>전화</Button>
                                        {lead.status === 'NEW' && (
                                            <Button size="sm" variant="outline" onClick={() => updateLeadStatusMutation.mutate({ id: lead.id, status: "CONTACTED" })}>연락함</Button>
                                        )}
                                        {lead.status !== 'REGISTERED' && (
                                            <Button size="sm" className="bg-brand hover:bg-brand-strong text-white" onClick={() => updateLeadStatusMutation.mutate({ id: lead.id, status: "REGISTERED" })}>등록 완료 표시</Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === "stores" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {stores.map((store) => (
                                <div key={store.id} className="bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] group hover:border-brand/50 transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
                                            <LucideStore className="w-5 h-5 text-brand" />
                                        </div>
                                        <Badge variant="outline" className="border-black/10 text-black/60">{store.region || "지역 미설정"}</Badge>
                                    </div>
                                    <h3 className="text-xl font-bold mb-1 truncate">{store.name}</h3>
                                    <p className="text-black/55 text-sm mb-6">점주: {store.ownerName}</p>
                                    <Button
                                        className="w-full bg-black/[0.04] hover:bg-brand hover:text-white transition-all"
                                        onClick={() => impersonateMutation.mutate(store.id)}
                                    >
                                        관리자 접속 <LucideArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === "crews" && (
                        <div className="space-y-6">
                            <div className="flex gap-2 mb-6 bg-black/[0.04] p-1 rounded-xl w-fit">
                                <button
                                    onClick={() => setCrewSportFilter("ALL")}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${crewSportFilter === "ALL" ? "bg-brand text-white" : "text-black/55 hover:text-[rgba(0,0,0,0.87)]"}`}
                                >
                                    전체
                                </button>
                                <button
                                    onClick={() => setCrewSportFilter("BILLIARDS")}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${crewSportFilter === "BILLIARDS" ? "bg-brand text-white" : "text-black/55 hover:text-[rgba(0,0,0,0.87)]"}`}
                                >
                                    당구
                                </button>
                                <button
                                    onClick={() => setCrewSportFilter("GOLF")}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${crewSportFilter === "GOLF" ? "bg-brand text-white" : "text-black/55 hover:text-[rgba(0,0,0,0.87)]"}`}
                                >
                                    골프
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredCrews.map((crew) => (
                                    <div key={crew.id} className="bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:border-black/10 transition">
                                        <div className="flex justify-between items-start mb-3">
                                            <Badge variant={crew.sportCategory === 'GOLF' ? 'default' : 'secondary'} className={crew.sportCategory === 'GOLF' ? 'bg-brand' : 'bg-blue-600'}>
                                                {crew.sportCategory === 'GOLF' ? 'GOLF' : '당구'}
                                            </Badge>
                                            <span className="text-[10px] text-black/40">{new Date(crew.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <h3 className="text-lg font-bold mb-1">{crew.name}</h3>
                                        <p className="text-black/55 text-sm mb-4 line-clamp-2 h-10">{crew.description}</p>
                                        <div className="flex justify-between items-center pt-4 border-t border-black/10">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-black/[0.06] flex items-center justify-center">
                                                    <LucideUsers size={12} className="text-black/60" />
                                                </div>
                                                <span className="text-xs font-bold">{crew.memberCount}명</span>
                                            </div>
                                            <span className="text-xs text-black/55">리더: {crew.leaderName}</span>
                                        </div>
                                    </div>
                                ))}
                                {filteredCrews.length === 0 && (
                                    <div className="col-span-full text-center py-20 bg-black/[0.03] rounded-3xl border border-dashed border-black/10">
                                        <p className="text-black/40">등록된 크루가 없습니다.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === "billing" && (
                        <div className="space-y-6">
                            <div className="bg-brand/[0.06] border border-brand/20 p-6 rounded-2xl mb-8">
                                <h3 className="text-xl font-bold text-brand mb-2">💰 Revenue Management (Mockup)</h3>
                                <p className="text-black/60 mb-0">현재는 Mock Data를 기반으로 표시됩니다.</p>
                            </div>

                            <div className="bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-black/[0.04] text-black/55 text-xs uppercase font-bold">
                                        <tr>
                                            <th className="p-4">Store Name</th>
                                            <th className="p-4">Plan</th>
                                            <th className="p-4">Next Billing</th>
                                            <th className="p-4">Status</th>
                                            <th className="p-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/[0.06]">
                                        {stores.map(store => (
                                            <tr key={store.id} className="hover:bg-black/[0.03]">
                                                <td className="p-4 font-bold">{store.name}</td>
                                                <td className="p-4">
                                                    <Badge variant={store.plan === 'premium' ? 'default' : 'outline'} className={store.plan === 'premium' ? 'bg-brand' : 'text-black/60'}>
                                                        {store.plan.toUpperCase()}
                                                    </Badge>
                                                </td>
                                                <td className="p-4 text-black/60">{store.nextBillingDate ? new Date(store.nextBillingDate).toLocaleDateString() : '-'}</td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${store.subscriptionStatus === 'active' ? 'bg-brand/10 text-brand' :
                                                        store.subscriptionStatus === 'overdue' ? 'bg-red-500/10 text-red-600' : 'bg-black/[0.04] text-black/40'
                                                        }`}>
                                                        <div className={`w-1.5 h-1.5 rounded-full ${store.subscriptionStatus === 'active' ? 'bg-brand' : store.subscriptionStatus === 'overdue' ? 'bg-red-500' : 'bg-gray-400'}`} />
                                                        {store.subscriptionStatus.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <Button size="sm" variant="ghost" className="h-8 text-brand hover:text-brand/80 hover:bg-brand/10">
                                                        Send Invoice
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {tab === "suggestions" && (
                        <div className="grid gap-4">
                            {/* 안 읽은 게 있을 때만 — 없으면 눌러도 아무 일이 없어 버튼이 거짓말이 된다 */}
                            {suggestions.some((x) => !x.isRead) && (
                                <div className="flex items-center justify-between bg-white px-5 py-3 rounded-2xl border border-black/[0.07]">
                                    <span className="text-[13px] text-black/60">
                                        안 읽은 건의 <b className="text-[rgba(0,0,0,0.87)] tabular-nums">{suggestions.filter((x) => !x.isRead).length}</b>건
                                    </span>
                                    <Button
                                        size="sm" variant="outline" className="h-8 text-xs"
                                        disabled={readAllSuggestionsMutation.isPending}
                                        onClick={() => readAllSuggestionsMutation.mutate()}
                                    >
                                        <LucideCheckCircle className="w-3 h-3 mr-1" /> 모두 읽음
                                    </Button>
                                </div>
                            )}
                            {suggestions.map((suggestion) => (
                                // 읽은 건은 흐리게 — 단 카드 전체가 아니라 머리·본문·버튼만. 답장하면 읽음이 되므로 카드째 흐리면
                                // '보낸 답장'이 늘 흐린 채로 보인다(시각은 거의 안 읽힌다).
                                <div key={suggestion.id} className="bg-white p-5 rounded-2xl border border-black/[0.07] shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col gap-3">
                                    <div className={`flex justify-between items-start transition-opacity ${suggestion.isRead ? "opacity-50" : ""}`}>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={suggestion.type === 'BUG' ? 'destructive' : suggestion.type === 'PARTNERSHIP' ? 'default' : 'secondary'}>
                                                {suggestion.type}
                                            </Badge>
                                            {suggestion.isRead && (
                                                <Badge variant="outline" className="border-brand/30 text-brand">
                                                    <LucideCheckCircle className="w-3 h-3 mr-1" /> 완료
                                                </Badge>
                                            )}
                                            <span className="text-xs text-black/40">{new Date(suggestion.createdAt).toLocaleString()}</span>
                                        </div>
                                        {suggestion.contact && (
                                            <div className="text-right text-xs text-black/60 bg-black/[0.04] px-2 py-1 rounded-md">
                                                연락처: {suggestion.contact}
                                            </div>
                                        )}
                                    </div>
                                    <p className={`text-black/70 whitespace-pre-wrap text-sm leading-relaxed p-3 bg-black/[0.03] rounded-xl transition-opacity ${suggestion.isRead ? "opacity-50" : ""}`}>
                                        {suggestion.content}
                                    </p>
                                    {/* 보낸 답장 — 무엇을 답했는지 다시 보려고(오너 요청 2026-09-11). 오래된 것부터, 최신이 맨 아래. */}
                                    {(suggestion.replies?.length ?? 0) > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[12px] font-semibold text-black/55">
                                                보낸 답장 <span className="tabular-nums">{suggestion.replies.length}</span>
                                            </p>
                                            {suggestion.replies.map((reply) => (
                                                <div key={reply.id} className="rounded-xl bg-brand/5 px-3 py-2.5">
                                                    <p className="text-[13px] text-black/70 whitespace-pre-wrap leading-relaxed">{reply.message}</p>
                                                    <p className="mt-1 text-[12px] text-black/50 tabular-nums">{new Date(reply.createdAt).toLocaleString()}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className={`flex justify-end gap-2 transition-opacity ${suggestion.isRead ? "opacity-50" : ""}`}>
                                        <Button
                                            size="sm"
                                            variant={suggestion.isRead ? "ghost" : "outline"}
                                            className="h-8 text-xs"
                                            disabled={toggleSuggestionReadMutation.isPending}
                                            onClick={() => toggleSuggestionReadMutation.mutate({ id: suggestion.id, isRead: !suggestion.isRead })}
                                        >
                                            {suggestion.isRead
                                                ? <><LucideMail className="w-3 h-3 mr-1" /> 안읽음으로</>
                                                : <><LucideCheckCircle className="w-3 h-3 mr-1" /> 읽음 처리</>}
                                        </Button>
                                        {suggestion.contact && (
                                            <Button size="sm" variant="ghost" className="h-8 text-xs text-black/50" onClick={() => {
                                                if (suggestion.contact?.includes('@')) {
                                                    window.location.href = `mailto:${suggestion.contact}`;
                                                } else {
                                                    window.location.href = `tel:${suggestion.contact}`;
                                                }
                                            }}>
                                                {suggestion.contact.includes('@') ? "메일" : "전화"}
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => {
                                                setReplyingId(replyingId === suggestion.id ? null : suggestion.id);
                                                setReplyText("");
                                            }}
                                        >
                                            <LucideMail className="w-3 h-3 mr-1" /> 앱으로 답장
                                        </Button>
                                    </div>

                                    {replyingId === suggestion.id && (
                                        <div className="rounded-xl bg-black/[0.03] p-3 space-y-2">
                                            <p className="text-[12px] text-black/50">
                                                건의한 회원의 알림함으로 전송됩니다. 푸시 토큰이 있으면 기기 알림도 함께 갑니다.
                                            </p>
                                            <Textarea
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                maxLength={500}
                                                placeholder="답장 내용 (500자 이내)"
                                                className="bg-white border-black/10 h-24 text-sm"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setReplyingId(null)}>
                                                    취소
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    className="h-8 text-xs"
                                                    disabled={!replyText.trim() || replyMutation.isPending}
                                                    onClick={() => replyMutation.mutate({ id: suggestion.id, message: replyText.trim() })}
                                                >
                                                    {replyMutation.isPending ? "보내는 중..." : "답장 보내기"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {suggestions.length === 0 && (
                                <div className="text-center text-black/40 py-10">접수된 건의사항이 없습니다.</div>
                            )}
                        </div>
                    )}

                    {tab === "push" && (
                        <div className="grid gap-4 max-w-3xl">
                            <div className="bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] space-y-3">
                                <h3 className="font-bold text-lg">푸시 알림 보내기</h3>
                                <p className="text-[13px] text-black/50 leading-relaxed">
                                    인앱 알림함에 저장되고, 푸시 토큰이 있는 회원에게는 기기 알림도 함께 갑니다.
                                </p>
                                <Input
                                    value={pushForm.title}
                                    onChange={(e) => setPushForm({ ...pushForm, title: e.target.value })}
                                    maxLength={60}
                                    placeholder="제목 (예: 이번 주 랭킹전 안내)"
                                    className="bg-black/[0.04] border-black/10 h-12"
                                />
                                <Textarea
                                    value={pushForm.body}
                                    onChange={(e) => setPushForm({ ...pushForm, body: e.target.value })}
                                    maxLength={200}
                                    placeholder="내용 (200자 이내)"
                                    className="bg-black/[0.04] border-black/10 h-24"
                                />
                                <Input
                                    value={pushForm.url}
                                    onChange={(e) => setPushForm({ ...pushForm, url: e.target.value })}
                                    maxLength={200}
                                    placeholder="누르면 열 화면 (선택, 예: /online-game)"
                                    className="bg-black/[0.04] border-black/10 h-12 font-mono"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setPushAll(true)}
                                        className={`px-3.5 h-10 rounded-full text-[13px] font-bold transition-colors ${pushAll ? "bg-brand text-white" : "bg-black/[0.05] text-black/55"}`}
                                    >
                                        전체 회원 ({members.length}명)
                                    </button>
                                    <button
                                        onClick={() => setPushAll(false)}
                                        className={`px-3.5 h-10 rounded-full text-[13px] font-bold transition-colors ${!pushAll ? "bg-brand text-white" : "bg-black/[0.05] text-black/55"}`}
                                    >
                                        개별 선택{!pushAll && pushTargets.length > 0 ? ` (${pushTargets.length}명)` : ""}
                                    </button>
                                </div>
                                {!pushAll && (
                                    <div className="max-h-64 overflow-y-auto rounded-xl border border-black/[0.06] divide-y divide-black/[0.05]">
                                        {members.map((m: any) => (
                                            <label key={m.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-black/[0.02]">
                                                <input
                                                    type="checkbox"
                                                    checked={pushTargets.includes(m.id)}
                                                    onChange={(e) => setPushTargets((prev) =>
                                                        e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id))}
                                                />
                                                <span className="text-[14px] font-semibold">{m.name}</span>
                                                <span className="text-[12px] text-black/40 tabular-nums">{m.phone}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                                <Button
                                    disabled={!pushForm.title.trim() || !pushForm.body.trim() || (!pushAll && pushTargets.length === 0) || sendPushMutation.isPending}
                                    onClick={() => sendPushMutation.mutate()}
                                    className="w-full h-12 bg-brand hover:bg-brand-strong text-white font-bold"
                                >
                                    {sendPushMutation.isPending ? "발송 중..." : `발송하기 (${pushAll ? members.length : pushTargets.length}명)`}
                                </Button>
                            </div>
                        </div>
                    )}

                    {tab === "notices" && (
                        <div className="space-y-6">
                            <div className="flex justify-end">
                                <Dialog open={newNoticeOpen} onOpenChange={setNewNoticeOpen}>
                                    <DialogTrigger asChild>
                                        <Button className="bg-brand hover:bg-brand/90 text-white">
                                            + 새 공지사항 작성
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-white border-black/10 text-[rgba(0,0,0,0.87)]">
                                        <h3 className="text-xl font-bold mb-4">Create Notice</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs text-black/55 font-bold uppercase block mb-1">Title</label>
                                                <Input value={noticeForm.title} onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })} className="bg-black/[0.04] border-black/10 text-[rgba(0,0,0,0.87)]" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-black/55 font-bold uppercase block mb-1">Content</label>
                                                <Textarea value={noticeForm.content} onChange={e => setNoticeForm({ ...noticeForm, content: e.target.value })} className="bg-black/[0.04] border-black/10 text-[rgba(0,0,0,0.87)] h-32" />
                                            </div>
                                            <div className="flex gap-4">
                                                <label className="flex items-center gap-2 text-sm text-black/60">
                                                    <input type="radio" checked={noticeForm.target === 'all'} onChange={() => setNoticeForm({ ...noticeForm, target: 'all' })} />
                                                    전체 사용자
                                                </label>
                                                <label className="flex items-center gap-2 text-sm text-black/60">
                                                    <input type="radio" checked={noticeForm.target === 'owners'} onChange={() => setNoticeForm({ ...noticeForm, target: 'owners' })} />
                                                    사장님 전용
                                                </label>
                                            </div>
                                            <Button onClick={() => createNoticeMutation.mutate(noticeForm)} className="w-full bg-brand text-white mt-2">등록하기</Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="grid gap-4">
                                {notices.map(notice => (
                                    <div key={notice.id} className={`bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${(notice as any).hidden ? "opacity-55" : ""}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-lg">{notice.title}</h3>
                                            <div className="flex items-center gap-1.5">
                                                {(notice as any).hidden && <Badge variant="secondary">숨김</Badge>}
                                                <Badge variant="outline" className="border-black/10">{notice.target === 'all' ? '전체' : '사장님'}</Badge>
                                            </div>
                                        </div>
                                        <p className="text-black/60 text-sm whitespace-pre-wrap">{notice.content}</p>
                                        <div className="mt-4 flex items-center justify-between">
                                            <span className="text-xs text-black/40">{new Date(notice.createdAt).toLocaleString()}</span>
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" onClick={() => toggleNoticeMutation.mutate({ id: notice.id, hidden: !(notice as any).hidden })}>
                                                    {(notice as any).hidden ? "보이기" : "가리기"}
                                                </Button>
                                                <Button size="sm" variant="ghost" className="text-red-500" onClick={() => { if (confirm("이 공지를 삭제할까요?")) deleteNoticeMutation.mutate(notice.id); }}>
                                                    삭제
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === "moderation" && <ModerationView />}

                    {tab === "members" && (
                        <div>
                            {/* 앱 접속 요약(2026-09-13 오너: 잔류 측정). 앱을 연 회원 수와 가입 코호트별 재방문 */}
                            {activity && (
                                <div className="mb-5 space-y-3">
                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                        {[
                                            ["오늘 접속", activity.dau, "명"], ["7일 접속", activity.wau, "명"], ["30일 접속", activity.mau, "명"],
                                            ["7일 세션", activity.sessions7, "회"], ["평균 세션", activity.avgMinutes7, "분"],
                                        ].map(([label, v, unit]) => (
                                            <div key={String(label)} className="rounded-2xl bg-white border border-black/10 p-4">
                                                <p className="text-[11px] font-bold text-black/45">{label}</p>
                                                <p className="text-[22px] font-black text-[rgba(0,0,0,0.87)] tabular-nums">{v}<span className="text-[12px] text-black/40 ml-0.5">{unit}</span></p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="rounded-2xl overflow-hidden border border-black/10 overflow-x-auto">
                                        <table className="w-full text-left bg-white text-sm whitespace-nowrap">
                                            <thead>
                                                <tr className="border-b border-black/10 bg-black/[0.02]">
                                                    <th className="p-3 font-black text-black/55">가입 주</th>
                                                    <th className="p-3 font-black text-black/55 text-right">가입</th>
                                                    <th className="p-3 font-black text-black/55 text-right" title="가입 다음 날 다시 왔나">D1</th>
                                                    <th className="p-3 font-black text-black/55 text-right" title="가입 후 7일 안에 다시 왔나">D7</th>
                                                    <th className="p-3 font-black text-black/55 text-right" title="가입 후 30일 안에 다시 왔나">D30</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activity.cohorts.map((c) => (
                                                    <tr key={c.week} className="border-b border-black/[0.06]">
                                                        <td className="p-3 font-mono text-black/60">{c.week}~</td>
                                                        <td className="p-3 text-right font-mono">{c.signed}</td>
                                                        <td className="p-3 text-right font-mono">{retentionCell(c.d1, c.signed, true)}</td>
                                                        <td className="p-3 text-right font-mono">{retentionCell(c.d7, c.signed, c.d7Ready)}</td>
                                                        <td className="p-3 text-right font-mono">{retentionCell(c.d30, c.signed, c.d30Ready)}</td>
                                                    </tr>
                                                ))}
                                                {activity.cohorts.length === 0 && (
                                                    <tr><td colSpan={5} className="p-6 text-center text-black/45">최근 8주 가입자가 없습니다.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-[11px] text-black/40">접속 기록은 이 기능을 켠 날부터 쌓입니다. 그 전 가입자의 D1·D7은 기록이 없어 낮게 나옵니다.</p>
                                </div>
                            )}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                                <p className="text-sm font-bold text-black/55">총 <span className="text-brand">{members.length}</span>명</p>
                                <input
                                    value={memberSearch}
                                    onChange={(e) => setMemberSearch(e.target.value)}
                                    placeholder="이름 또는 전화번호 검색"
                                    className="w-full sm:w-72 h-11 px-4 rounded-xl bg-white border border-black/10 text-sm outline-none focus:border-brand/40"
                                />
                            </div>
                            <div className="rounded-2xl overflow-hidden border border-black/10 overflow-x-auto">
                                <table className="w-full text-left bg-white text-sm whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b border-black/10 bg-black/[0.02]">
                                            <th className="p-4 font-black text-black/55">이름</th>
                                            <th className="p-4 font-black text-black/55">연락처</th>
                                            <th className="p-4 font-black text-black/55 text-center">성별</th>
                                            <th className="p-4 font-black text-black/55 text-center">국가</th>
                                            <th className="p-4 font-black text-black/55 text-center">기기</th>
                                            <th className="p-4 font-black text-black/55 text-right">3쿠션 RP</th>
                                            <th className="p-4 font-black text-black/55 text-right">4구 RP</th>
                                            <th className="p-4 font-black text-black/55 text-center">온라인게임</th>
                                            <th className="p-4 font-black text-black/55 text-right">방문</th>
                                            <th className="p-4 font-black text-black/55" title="앱을 마지막으로 연 시각">접속</th>
                                            <th className="p-4 font-black text-black/55 text-right" title="최근 7일 중 앱을 연 날 수">주간</th>
                                            <th className="p-4 font-black text-black/55 text-right" title="최근 30일 평균 세션(분, 4시간 상한)">세션</th>
                                            <th className="p-4 font-black text-black/55">가입일</th>
                                            <th className="p-4 font-black text-black/55 text-right">기록</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {members
                                            .filter((m) => !memberSearch || m.name?.includes(memberSearch) || m.phone?.includes(memberSearch))
                                            .map((m) => (
                                                <tr key={m.id} className="border-b border-black/[0.06] hover:bg-black/[0.02]">
                                                    <td className="p-4 font-bold text-[rgba(0,0,0,0.87)]">{m.name}</td>
                                                    <td className="p-4 text-black/60 font-mono">{m.phone}</td>
                                                    <td className="p-4 text-center text-black/60">{m.gender === "male" ? "남" : m.gender === "female" ? "여" : "-"}</td>
                                                    <td className="p-4 text-center">
                                                        {m.countryCode
                                                            ? <span title={m.countryCode}>{flagEmoji(m.countryCode) || m.countryCode}</span>
                                                            : <span className="text-black/25">-</span>}
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        {m.platform === "ios" ? <span title="iOS(애플)">🍎</span>
                                                            : m.platform === "android" ? <span title="Android(안드로이드)">🤖</span>
                                                            : <span className="text-black/25" title="앱 미설치(웹) 또는 알림 미허용">-</span>}
                                                    </td>
                                                    <td className="p-4 text-right font-mono font-bold text-brand">{m.rating3c ?? 0}</td>
                                                    <td className="p-4 text-right font-mono font-bold text-brand">{m.rating4c ?? 0}</td>
                                                    <td className="p-4 text-center font-mono text-black/60" title="연습 세션 · 대전">
                                                        {(m.simSessions ?? 0) + (m.simMatches ?? 0) > 0
                                                            ? <span><span className="font-bold text-[rgba(0,0,0,0.87)]">{m.simSessions ?? 0}</span><span className="text-black/35"> · </span><span className="font-bold text-[rgba(0,0,0,0.87)]">{m.simMatches ?? 0}</span></span>
                                                            : <span className="text-black/25">-</span>}
                                                    </td>
                                                    <td className="p-4 text-right text-black/60 font-mono">{m.visitCount ?? 0}</td>
                                                    <td className={cn("p-4 font-mono text-[12px]", lastSeenTone(m.lastSeenAt))}>{lastSeenLabel(m.lastSeenAt)}</td>
                                                    <td className="p-4 text-right font-mono">{(m.activeDays7 ?? 0) > 0 ? <span className="font-bold text-[rgba(0,0,0,0.87)]">{m.activeDays7}일</span> : <span className="text-black/25">-</span>}</td>
                                                    <td className="p-4 text-right font-mono text-black/60">{m.avgSessionMin30 ? `${m.avgSessionMin30}분` : <span className="text-black/25">-</span>}</td>
                                                    <td className="p-4 text-black/50 font-mono">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "-"}</td>
                                                    <td className="p-4 text-right whitespace-nowrap">
                                                        <button
                                                            onClick={() => setGamesFor({ id: m.id, name: m.name })}
                                                            className="h-8 px-3 rounded-lg border border-black/15 text-xs font-bold text-black/60 hover:border-brand/40 hover:text-brand"
                                                        >기록</button>
                                                        {m.phone && !String(m.phone).startsWith("social:") && (
                                                            <button
                                                                disabled={resetPin.isPending}
                                                                onClick={() => {
                                                                    if (window.confirm(`${m.name}(${m.phone}) 님의 PIN 을 임시 PIN 으로 바꿉니다.\n본인 확인을 마쳤나요? 지금 PIN 은 더 이상 쓸 수 없습니다.`)) resetPin.mutate(m.id);
                                                                }}
                                                                className="ml-1.5 h-8 px-3 rounded-lg border border-black/15 text-xs font-bold text-black/60 hover:border-red-400 hover:text-red-600 disabled:opacity-50"
                                                            >PIN 초기화</button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        {members.length === 0 && (
                                            <tr><td colSpan={14} className="p-10 text-center text-black/45">회원이 없습니다.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <MemberGamesDialog member={gamesFor} onClose={() => setGamesFor(null)} />
                    <Dialog open={pinResult !== null} onOpenChange={(o) => { if (!o) setPinResult(null); }}>
                        <DialogContent className="max-w-sm">
                            <h2 className="text-lg font-black text-[rgba(0,0,0,0.87)]">임시 PIN 발급 완료</h2>
                            <p className="text-sm text-black/60">{pinResult?.name} · {pinResult?.phone}</p>
                            <p className="my-2 text-center font-mono text-4xl font-black tracking-[0.3em] text-brand">{pinResult?.pin}</p>
                            <p className="text-xs text-black/50 leading-relaxed">
                                이 창을 닫으면 다시 볼 수 없습니다. 사용자에게 전달하세요 — 전화번호 + 이 PIN 으로 로그인하면 기존 기록이 그대로 있습니다.
                                PIN 을 바꾸고 싶으면 로그인 화면의 "PIN을 잊으셨나요?"(보안 질문)로 바꿀 수 있습니다.
                            </p>
                        </DialogContent>
                    </Dialog>

                    {tab === "golf-orders" && <GolfOrdersView />}
                    {tab === "online-game" && <OnlineGameView />}
                </div>
            </main>
        </div>
    );
}

function getTabTitle(tab: string) {
    switch (tab) {
        case "dashboard": return "Dashboard";
        case "members": return "회원 관리";
        case "leads": return "입점 문의 관리";
        case "stores": return "가맹점 리스트";
        case "billing": return "결제 및 정산";
        case "suggestions": return "건의함 (고객 의견)";
        case "notices": return "공지사항 관리";
        case "moderation": return "신고/제재 센터";
        case "golf-orders": return "골프 회원권 접수 현황";
        case "online-game": return "온라인게임 이용 현황";
        // 빠져 있던 탭들 — 모바일에선 머리글이 지금 어느 화면인지 알려 주는 유일한 표시라 전부 채운다(2026-09-08)
        case "claims": return "매장 클레임";
        case "registrations": return "신규 매장 등록";
        case "crews": return "크루 현황";
        case "push": return "푸시 발송";
        default: return "Admin";
    }
}

function StatCard({ label, value, icon, sub, highlight = false }: any) {
    return (
        <div className={`p-5 rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${highlight ? 'bg-brand/[0.06] border-brand/30' : 'bg-white border-black/[0.07]'}`}>
            <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-black/55 uppercase tracking-widest">{label}</span>
                <div className="opacity-80">{icon}</div>
            </div>
            <div className="text-3xl font-black text-[rgba(0,0,0,0.87)] mb-1">{value}</div>
            <div className="text-xs text-black/40">{sub}</div>
        </div>
    );
}

function GolfOrdersView() {
    const { toast } = useToast();
    const { data: orders, isLoading, refetch } = useQuery<any[]>({
        queryKey: ["/api/hiq/admin/membership/orders"],
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            return await apiRequest(`/api/hiq/admin/membership/orders/${id}/status`, {
                method: "PATCH",
                body: { status }
            });
        },
        onSuccess: () => {
            toast({ title: "상태 변경 완료" });
            refetch();
        },
        onError: () => {
            toast({ title: "오류", description: "상태 변경에 실패했습니다.", variant: "destructive" });
        }
    });

    if (isLoading) return <div className="text-center py-20 text-black/40">Loading...</div>;

    const sortedOrders = orders ? [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];

    return (
        <div className="bg-white overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <div className="overflow-x-auto">
                <table className="w-full text-left bg-white">
                    <thead>
                        <tr className="bg-black/[0.04] border-b border-black/10">
                            <th className="p-5 font-black text-black/55">날짜</th>
                            <th className="p-5 font-black text-black/55">구분</th>
                            <th className="p-5 font-black text-black/55">회원권 / 구장</th>
                            <th className="p-5 font-black text-black/55 text-right">희망가격</th>
                            <th className="p-5 font-black text-black/55">연락처</th>
                            <th className="p-5 font-black text-black/55 text-center">상태</th>
                            <th className="p-5 font-black text-black/55 text-center">관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedOrders.map((order) => (
                            <tr key={order.id} className="border-b border-black/[0.06] hover:bg-black/[0.03] transition-colors">
                                <td className="p-5 text-black/55 font-mono text-sm max-w-[120px]">
                                    <div className="font-bold text-[rgba(0,0,0,0.87)]">{new Date(order.createdAt).toLocaleDateString()}</div>
                                    <div className="text-xs">{new Date(order.createdAt).toLocaleTimeString()}</div>
                                </td>
                                <td className="p-5">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${order.orderType === 'BUY' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-brand/10 text-brand border border-brand/20'}`}>
                                        {order.orderType === 'BUY' ? '매수' : '매도'}
                                    </span>
                                </td>
                                <td className="p-5">
                                    <div className="font-bold text-lg text-[rgba(0,0,0,0.87)]">{order.courseName}</div>
                                </td>
                                <td className="p-5 text-right font-mono font-bold text-[rgba(0,0,0,0.87)] text-lg">
                                    {new Intl.NumberFormat('ko-KR').format(order.price)}원
                                </td>
                                <td className="p-5 font-mono text-brand font-bold">{order.contact}</td>
                                <td className="p-5 text-center">
                                    <span className={`px-3 py-1 rounded-full text-xs font-black ${order.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                                        order.status === 'CONTACTED' ? 'bg-brand/10 text-brand border border-brand/20' :
                                            order.status === 'COMPLETED' ? 'bg-green-500/10 text-green-500 border border-green-500/20' :
                                                'bg-gray-500/10 text-gray-500 border border-gray-500/20'
                                        }`}>
                                        {order.status === 'PENDING' ? '대기중' :
                                            order.status === 'CONTACTED' ? '연락됨' :
                                                order.status === 'COMPLETED' ? '완료' : '취소'}
                                    </span>
                                </td>
                                <td className="p-5 text-center">
                                    <select
                                        className="bg-white rounded-lg px-3 py-2 text-sm outline-none focus:border-brand text-[rgba(0,0,0,0.87)] font-medium cursor-pointer hover:bg-black/[0.04] transition-colors"
                                        value={order.status}
                                        onChange={(e) => updateStatusMutation.mutate({ id: order.id, status: e.target.value })}
                                        title="주문 상태 변경"
                                    >
                                        <option value="PENDING">대기중</option>
                                        <option value="CONTACTED">연락됨</option>
                                        <option value="COMPLETED">거래완료</option>
                                        <option value="CANCELLED">취소</option>
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!orders?.length && (
                    <div className="py-20 text-center text-black/40">
                        <LucideSearch className="w-12 h-12 mx-auto mb-4 opacity-40" />
                        <p className="font-bold">신규 접수된 내역이 없습니다.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
