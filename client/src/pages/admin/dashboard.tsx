
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import {
    LucideLayoutDashboard, LucideStore, LucideUsers, LucidePhone,
    LucideGlobe, LucideArrowRight, LucideCheckCircle, LucideLogOut,
    LucideSearch, LucideTrendingUp, LucideBell, LucideCreditCard, LucideSettings, LucideShieldAlert, LucideMenu, LucideX, LucideUsersRound, LucideMail, LucideFlag
} from "@/lib/icons";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"; // Assuming Sheet is available or using conditional rendering

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

type ReportedUser = {
    id: string;
    nickname: string;
    reportCount: number;
    reason: string;
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

type Suggestion = {
    id: string;
    type: string;
    content: string;
    contact: string | null;
    createdAt: string;
    isRead: boolean;
};

// --- Left Sidebar Component ---
// --- Sidebar Component (Unified) ---
function SidebarContent({ tab, setTab, handleLogout, closeMobileMenu }: any) {
    const menuItems = [
        { id: "dashboard", label: "Dashboard", icon: LucideLayoutDashboard },
        { id: "leads", label: "입점 문의", icon: LucidePhone },
        { id: "stores", label: "매장 리스트", icon: LucideStore },
        { id: "crews", label: "크루 현황", icon: LucideUsersRound },
        { id: "members", label: "회원 관리", icon: LucideUsers },
        { id: "golf-orders", label: "골프 회원권", icon: LucideFlag }, // New
        { id: "billing", label: "결제 관리", icon: LucideCreditCard },
        { id: "suggestions", label: "건의함", icon: LucideMail },
        { id: "notices", label: "공지사항", icon: LucideBell },
        { id: "moderation", label: "신고/제재", icon: LucideShieldAlert },
    ];

    return (
        <div className="flex flex-col h-full bg-white border-r border-black/10">
            <div className="p-6 border-b border-black/10">
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

            <nav className="flex-1 p-4 space-y-1">
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

            <div className="p-4 border-t border-black/10">
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-500/10 transition">
                    <LucideLogOut size={18} />
                    로그아웃
                </button>
            </div>
        </div>
    );
}


// --- Main Page Component ---
export default function AdminDashboard() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<"dashboard" | "leads" | "stores" | "crews" | "members" | "billing" | "suggestions" | "notices" | "moderation" | "golf-orders">("dashboard");
    const [memberSearch, setMemberSearch] = useState("");
    const [crewSportFilter, setCrewSportFilter] = useState<"ALL" | "BILLIARDS" | "GOLF">("ALL");

    // Queries
    const { data: stats } = useQuery<GlobalStats>({ queryKey: ["/api/hiq/admin/stats"] });
    const { data: leads = [] } = useQuery<PartnerLead[]>({ queryKey: ["/api/hiq/admin/leads"] });
    const { data: stores = [] } = useQuery<AdminStore[]>({ queryKey: ["/api/hiq/admin/stores"] });
    const { data: crews = [] } = useQuery<AdminCrew[]>({ queryKey: ["/api/hiq/admin/crews"] });
    const { data: notices = [] } = useQuery<Notice[]>({ queryKey: ["/api/hiq/admin/notices"] });
    const { data: reports = [] } = useQuery<ReportedUser[]>({ queryKey: ["/api/hiq/admin/reports"] });
    const { data: suggestions = [] } = useQuery<Suggestion[]>({ queryKey: ["/api/hiq/admin/suggestions"] });
    const { data: members = [] } = useQuery<any[]>({ queryKey: ["/api/hiq/admin/members"] });

    // Filter crews
    const filteredCrews = crews.filter(crew => {
        if (crewSportFilter === "ALL") return true;
        return crew.sportCategory === crewSportFilter || crew.sportCategory === "MIXED";
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

    const banUserMutation = useMutation({
        mutationFn: async (userId: string) => {
            return apiRequest(`/api/hiq/admin/users/${userId}/ban`, { method: "POST" });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/admin/reports"] });
            toast({ title: "사용자 제재 완료", variant: "destructive" });
        }
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
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-black/10 p-4 sticky top-0 z-30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
                        <LucideGlobe className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-black text-brand">ADMIN</span>
                </div>
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-[rgba(0,0,0,0.87)]">
                            <LucideMenu />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 border-r border-black/10 w-72 bg-white">
                        <SidebarContent tab={tab} setTab={setTab} handleLogout={handleLogout} />
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

                    {tab === "leads" && (
                        <div className="grid gap-4">
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
                                        {lead.status !== 'REGISTERED' && (
                                            <Button size="sm" className="bg-brand hover:bg-brand/90 text-white" onClick={() => updateLeadStatusMutation.mutate({ id: lead.id, status: "REGISTERED" })}>승인</Button>
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
                            {suggestions.map((suggestion) => (
                                <div key={suggestion.id} className={`bg-white p-5 rounded-2xl border shadow-[0_1px_2px_rgba(0,0,0,0.06)] flex flex-col gap-3 transition-opacity ${suggestion.isRead ? 'border-black/[0.07] opacity-50' : 'border-black/[0.07]'}`}>
                                    <div className="flex justify-between items-start">
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
                                    <p className="text-black/70 whitespace-pre-wrap text-sm leading-relaxed p-3 bg-black/[0.03] rounded-xl ">
                                        {suggestion.content}
                                    </p>
                                    <div className="flex justify-end gap-2">
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
                                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => {
                                                if (suggestion.contact?.includes('@')) {
                                                    window.location.href = `mailto:${suggestion.contact}`;
                                                } else {
                                                    window.location.href = `tel:${suggestion.contact}`;
                                                }
                                            }}>
                                                <LucideMail className="w-3 h-3 mr-1" /> 답변하기
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {suggestions.length === 0 && (
                                <div className="text-center text-black/40 py-10">접수된 건의사항이 없습니다.</div>
                            )}
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
                                    <div key={notice.id} className="bg-white p-5 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-lg">{notice.title}</h3>
                                            <Badge variant="outline" className="border-black/10">{notice.target === 'all' ? 'Users' : 'Owners'}</Badge>
                                        </div>
                                        <p className="text-black/60 text-sm whitespace-pre-wrap">{notice.content}</p>
                                        <div className="mt-4 text-xs text-black/40 text-right">
                                            {new Date(notice.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === "moderation" && (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {reports.map((user) => (
                                <div key={user.id} className="bg-red-500/[0.05] p-6 rounded-2xl border border-red-500/20 shadow-[0_1px_2px_rgba(0,0,0,0.06)] text-center">
                                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <LucideShieldAlert className="w-8 h-8 text-red-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-[rgba(0,0,0,0.87)] mb-1">{user.nickname}</h3>
                                    <div className="text-red-600 font-bold mb-4">누적 신고: {user.reportCount}건</div>
                                    <div className="text-black/60 text-sm mb-6 bg-black/[0.04] py-2 rounded-lg">
                                        사유: {user.reason}
                                    </div>
                                    <Button
                                        variant="destructive"
                                        className="w-full font-bold"
                                        onClick={() => banUserMutation.mutate(user.id)}
                                    >
                                        계정 정지 (Ban)
                                    </Button>
                                </div>
                            ))}
                            {reports.length === 0 && <div className="col-span-3 text-center text-black/55 py-10">신고된 유저가 없습니다. 클린합니다! ✨</div>}
                        </div>
                    )}

                    {tab === "members" && (
                        <div>
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
                                            <th className="p-4 font-black text-black/55 text-right">3쿠션 RP</th>
                                            <th className="p-4 font-black text-black/55 text-right">4구 RP</th>
                                            <th className="p-4 font-black text-black/55 text-right">방문</th>
                                            <th className="p-4 font-black text-black/55">가입일</th>
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
                                                    <td className="p-4 text-right font-mono font-bold text-brand">{m.rating3c ?? 0}</td>
                                                    <td className="p-4 text-right font-mono font-bold text-brand">{m.rating4c ?? 0}</td>
                                                    <td className="p-4 text-right text-black/60 font-mono">{m.visitCount ?? 0}</td>
                                                    <td className="p-4 text-black/50 font-mono">{m.createdAt ? new Date(m.createdAt).toLocaleDateString() : "-"}</td>
                                                </tr>
                                            ))}
                                        {members.length === 0 && (
                                            <tr><td colSpan={7} className="p-10 text-center text-black/45">회원이 없습니다.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {tab === "golf-orders" && <GolfOrdersView />}
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
