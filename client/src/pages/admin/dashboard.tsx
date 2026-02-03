
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
    LucideSearch, LucideTrendingUp, LucideBell, LucideCreditCard, LucideSettings, LucideShieldAlert, LucideMenu, LucideX, LucideUsersRound
} from "lucide-react";
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
    memberCount: number;
    leaderName: string;
    storeName: string;
    createdAt: string;
};

// --- Left Sidebar Component ---
// --- Sidebar Component (Unified) ---
function SidebarContent({ tab, setTab, handleLogout, closeMobileMenu }: any) {
    const menuItems = [
        { id: "dashboard", label: "Dashboard", icon: LucideLayoutDashboard },
        { id: "leads", label: "입점 문의", icon: LucidePhone },
        { id: "stores", label: "매장 리스트", icon: LucideStore },
        { id: "crews", label: "크루 현황", icon: LucideUsersRound }, // New
        { id: "billing", label: "결제 관리", icon: LucideCreditCard },
        { id: "notices", label: "공지사항", icon: LucideBell },
        { id: "moderation", label: "신고/제재", icon: LucideShieldAlert },
    ];

    return (
        <div className="flex flex-col h-full bg-[#111] border-r border-white/10">
            <div className="p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)]">
                        <LucideGlobe className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black tracking-tight text-white">ADMIN</h1>
                        <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest block">Control Tower</span>
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
                            ? "bg-indigo-600 text-white shadow-lg"
                            : "text-white/40 hover:bg-white/5 hover:text-white"
                            }`}
                    >
                        <item.icon size={18} />
                        {item.label}
                    </button>
                ))}
            </nav>

            <div className="p-4 border-t border-white/10">
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-400 hover:bg-red-500/10 transition">
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
    const [tab, setTab] = useState<"dashboard" | "leads" | "stores" | "crews" | "billing" | "notices" | "moderation">("dashboard");

    // Queries
    const { data: stats } = useQuery<GlobalStats>({ queryKey: ["/api/hiq/admin/stats"] });
    const { data: leads = [] } = useQuery<PartnerLead[]>({ queryKey: ["/api/hiq/admin/leads"] });
    const { data: stores = [] } = useQuery<AdminStore[]>({ queryKey: ["/api/hiq/admin/stores"] });
    const { data: crews = [] } = useQuery<AdminCrew[]>({ queryKey: ["/api/hiq/admin/crews"] });
    const { data: notices = [] } = useQuery<Notice[]>({ queryKey: ["/api/hiq/admin/notices"] });
    const { data: reports = [] } = useQuery<ReportedUser[]>({ queryKey: ["/api/hiq/admin/reports"] });

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

    const handleLogout = () => {
        document.cookie = "hiq_partner_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        document.cookie = "hiq_user_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        setLocation("/partner/login");
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-[#111] border-b border-white/10 p-4 sticky top-0 z-30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                        <LucideGlobe className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-black text-white">ADMIN</span>
                </div>
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-white">
                            <LucideMenu />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 border-r border-white/10 w-72 bg-[#111]">
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
                    <h2 className="text-3xl font-black text-white mb-2">{getTabTitle(tab)}</h2>
                    <p className="text-white/40 text-sm">시스템 운영 및 관리</p>
                </header>

                <div className="max-w-6xl">
                    {tab === "dashboard" && (
                        <div className="space-y-8">
                            <div className="space-y-8">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <StatCard label="Total Stores" value={stats?.totalStores || 0} icon={<LucideStore className="text-indigo-400" />} sub="가맹점" />
                                    <StatCard label="New Leads" value={stats?.newLeads || 0} icon={<LucidePhone className="text-emerald-400" />} sub="신규 문의" highlight={!!stats?.newLeads} />
                                    <StatCard label="Today Traffic" value={stats?.totalVisitsToday || 0} icon={<LucideTrendingUp className="text-orange-400" />} sub="방문객" />
                                    <StatCard label="Total Users" value={stats?.totalUsers || 0} icon={<LucideUsers className="text-blue-400" />} sub="회원수" />
                                </div>

                                {/* Recent Activity Brief */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-[#111] p-6 rounded-2xl border border-white/5">
                                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                            <LucidePhone size={18} className="text-emerald-500" /> 최근 입점 문의
                                        </h3>
                                        <div className="space-y-3">
                                            {leads.slice(0, 3).map(lead => (
                                                <div key={lead.id} className="flex justify-between items-center text-sm p-3 bg-white/5 rounded-xl">
                                                    <div>
                                                        <span className="font-bold">{lead.ownerName}</span>
                                                        <span className="text-white/40 text-xs ml-2">{lead.region}</span>
                                                    </div>
                                                    <Badge variant={lead.status === 'NEW' ? 'destructive' : 'secondary'}>{lead.status}</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === "leads" && (
                        <div className="grid gap-4">
                            {leads.map((lead) => (
                                <div key={lead.id} className="bg-[#111] p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-white/10 transition">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant={lead.status === 'NEW' ? 'destructive' : lead.status === 'REGISTERED' ? 'default' : 'secondary'}>
                                                {lead.status}
                                            </Badge>
                                            <span className="text-xs text-white/30">{new Date(lead.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <h3 className="text-lg font-bold">{lead.ownerName} <span className="text-sm font-normal text-white/40">사장님</span></h3>
                                        <div className="text-white/50 text-sm mt-1">
                                            {lead.phoneNumber} | {lead.region} {lead.storeName}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => window.open(`tel:${lead.phoneNumber}`)}>전화</Button>
                                        {lead.status !== 'REGISTERED' && (
                                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => updateLeadStatusMutation.mutate({ id: lead.id, status: "REGISTERED" })}>승인</Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === "stores" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {stores.map((store) => (
                                <div key={store.id} className="bg-[#111] p-5 rounded-2xl border border-white/5 group hover:border-indigo-500/50 transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                                            <LucideStore className="w-5 h-5 text-indigo-400" />
                                        </div>
                                        <Badge variant="outline" className="border-white/10 text-white/60">{store.region || "지역 미설정"}</Badge>
                                    </div>
                                    <h3 className="text-xl font-bold mb-1 truncate">{store.name}</h3>
                                    <p className="text-white/40 text-sm mb-6">점주: {store.ownerName}</p>
                                    <Button
                                        className="w-full bg-white/5 hover:bg-indigo-600 hover:text-white transition-all"
                                        onClick={() => impersonateMutation.mutate(store.id)}
                                    >
                                        관리자 접속 <LucideArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === "billing" && (
                        <div className="space-y-6">
                            <div className="bg-indigo-900/10 border border-indigo-500/20 p-6 rounded-2xl mb-8">
                                <h3 className="text-xl font-bold text-indigo-400 mb-2">💰 Revenue Management (Mockup)</h3>
                                <p className="text-indigo-200/60 mb-0">현재는 Mock Data를 기반으로 표시됩니다.</p>
                            </div>

                            <div className="bg-[#111] rounded-2xl border border-white/5 overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-white/5 text-white/40 text-xs uppercase font-bold">
                                        <tr>
                                            <th className="p-4">Store Name</th>
                                            <th className="p-4">Plan</th>
                                            <th className="p-4">Next Billing</th>
                                            <th className="p-4">Status</th>
                                            <th className="p-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {stores.map(store => (
                                            <tr key={store.id} className="hover:bg-white/[0.02]">
                                                <td className="p-4 font-bold">{store.name}</td>
                                                <td className="p-4">
                                                    <Badge variant={store.plan === 'premium' ? 'default' : 'outline'} className={store.plan === 'premium' ? 'bg-indigo-600' : 'text-white/60'}>
                                                        {store.plan.toUpperCase()}
                                                    </Badge>
                                                </td>
                                                <td className="p-4 text-white/50">{store.nextBillingDate ? new Date(store.nextBillingDate).toLocaleDateString() : '-'}</td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${store.subscriptionStatus === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                                                        store.subscriptionStatus === 'overdue' ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-white/40'
                                                        }`}>
                                                        <div className={`w-1.5 h-1.5 rounded-full ${store.subscriptionStatus === 'active' ? 'bg-emerald-400' : store.subscriptionStatus === 'overdue' ? 'bg-red-400' : 'bg-gray-400'}`} />
                                                        {store.subscriptionStatus.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <Button size="sm" variant="ghost" className="h-8 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-400/10">
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

                    {tab === "notices" && (
                        <div className="space-y-6">
                            <div className="flex justify-end">
                                <Dialog open={newNoticeOpen} onOpenChange={setNewNoticeOpen}>
                                    <DialogTrigger asChild>
                                        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                            + 새 공지사항 작성
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="bg-[#1a1a1a] border-white/10 text-white">
                                        <h3 className="text-xl font-bold mb-4">Create Notice</h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs text-white/40 font-bold uppercase block mb-1">Title</label>
                                                <Input value={noticeForm.title} onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })} className="bg-white/5 border-white/10 text-white" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/40 font-bold uppercase block mb-1">Content</label>
                                                <Textarea value={noticeForm.content} onChange={e => setNoticeForm({ ...noticeForm, content: e.target.value })} className="bg-white/5 border-white/10 text-white h-32" />
                                            </div>
                                            <div className="flex gap-4">
                                                <label className="flex items-center gap-2 text-sm text-white/60">
                                                    <input type="radio" checked={noticeForm.target === 'all'} onChange={() => setNoticeForm({ ...noticeForm, target: 'all' })} />
                                                    전체 사용자
                                                </label>
                                                <label className="flex items-center gap-2 text-sm text-white/60">
                                                    <input type="radio" checked={noticeForm.target === 'owners'} onChange={() => setNoticeForm({ ...noticeForm, target: 'owners' })} />
                                                    사장님 전용
                                                </label>
                                            </div>
                                            <Button onClick={() => createNoticeMutation.mutate(noticeForm)} className="w-full bg-indigo-600 mt-2">등록하기</Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="grid gap-4">
                                {notices.map(notice => (
                                    <div key={notice.id} className="bg-[#111] p-5 rounded-2xl border border-white/5">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-lg">{notice.title}</h3>
                                            <Badge variant="outline" className="border-white/10">{notice.target === 'all' ? 'Users' : 'Owners'}</Badge>
                                        </div>
                                        <p className="text-white/60 text-sm whitespace-pre-wrap">{notice.content}</p>
                                        <div className="mt-4 text-xs text-white/30 text-right">
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
                                <div key={user.id} className="bg-red-500/5 p-6 rounded-2xl border border-red-500/20 text-center">
                                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <LucideShieldAlert className="w-8 h-8 text-red-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-1">{user.nickname}</h3>
                                    <div className="text-red-400 font-bold mb-4">누적 신고: {user.reportCount}건</div>
                                    <div className="text-white/40 text-sm mb-6 bg-black/20 py-2 rounded-lg">
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
                            {reports.length === 0 && <div className="col-span-3 text-center text-white/30 py-10">신고된 유저가 없습니다. 클린합니다! ✨</div>}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

function getTabTitle(tab: string) {
    switch (tab) {
        case "dashboard": return "Dashboard";
        case "leads": return "입점 문의 관리";
        case "stores": return "가맹점 리스트";
        case "billing": return "결제 및 정산";
        case "notices": return "공지사항 관리";
        case "moderation": return "신고/제재 센터";
        default: return "Admin";
    }
}

function StatCard({ label, value, icon, sub, highlight = false }: any) {
    return (
        <div className={`p-5 rounded-2xl border ${highlight ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-[#111] border-white/5'}`}>
            <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</span>
                <div className="opacity-80">{icon}</div>
            </div>
            <div className="text-3xl font-black text-white mb-1">{value}</div>
            <div className="text-xs text-white/30">{sub}</div>
        </div>
    );
}
