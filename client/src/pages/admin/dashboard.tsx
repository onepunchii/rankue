/**
 * 어드민 콘솔 껍데기(2026-09-26 정리) — 사이드바·머리줄·대시보드 홈만 여기 두고, 각 메뉴 화면은 파일로 나눴다.
 *   오늘 접속 TodayActiveView · 회원 MembersView(+MemberDetailSheet) · 푸시 PushView · 건의 SuggestionsView
 *   신고 ModerationView · 클레임/등록/입점 StoreOnboardingViews · 매장·결제 StoresView · 크루 CrewsView
 *   온라인게임 OnlineGameView · 골프 회원권 GolfOrdersView · 공지 NoticesView
 * 사이드바 숫자(밀린 일)는 각 화면과 같은 쿼리 열쇠를 읽는다 — react-query 가 한 번만 부른다.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import {
    LucideLayoutDashboard, LucideStore, LucideUsers, LucidePhone,
    LucideGlobe, LucideCheckCircle, LucideLogOut,
    LucideBell, LucideCreditCard, LucideShieldAlert, LucideMenu, LucideUsersRound, LucideMail, LucideFlag, GameController,
    LucideZap, LucideMegaphone, LucideUserPlus,
} from "@/lib/icons";
import OnlineGameView from "./OnlineGameView";
import ModerationView from "./ModerationView";
import MembersView from "./MembersView";
import TodayActiveView from "./TodayActiveView";
import PushView from "./PushView";
import SuggestionsView, { type Suggestion, SUGGESTIONS_KEY } from "./SuggestionsView";
import NoticesView from "./NoticesView";
import CrewsView from "./CrewsView";
import GolfOrdersView, { GOLF_ORDERS_KEY } from "./GolfOrdersView";
import { StoresView, BillingView } from "./StoresView";
import {
    ClaimsView, RegistrationsView, LeadsView,
    type Claim, type Registration, type PartnerLead, CLAIMS_KEY, REGISTRATIONS_KEY, LEADS_KEY, LEAD_STATUS_LABEL,
} from "./StoreOnboardingViews";
import MemberDetailSheet, { type AdminMember, ADMIN_MEMBERS_KEY } from "./MemberDetailSheet";
import { KpiTile, Panel, Pill, agoLabel } from "./adminUtils";

type GlobalStats = {
    totalStores: number;
    totalUsers: number;
    totalVisitsToday: number;
    newLeads: number;
    newUsersToday?: number;
};

type Tab = "dashboard" | "today" | "claims" | "registrations" | "leads" | "stores" | "crews" | "members" | "push" | "billing" | "suggestions" | "notices" | "moderation" | "golf-orders" | "online-game";

// 운영자 알림(푸시)을 누르면 ?tab= 으로 온다 — 신고 알림은 moderation, 새 건의 알림은 suggestions.
const DEEP_LINK_TABS = ["moderation", "suggestions", "today", "members", "claims", "registrations", "leads", "push"] as const;

// --- Sidebar (데스크탑 고정 · 폰 서랍 공용) ---
// 14개 메뉴를 한 줄로 늘어놓던 것을 일의 묶음으로 나누고, 처리할 게 쌓인 메뉴엔 숫자를 단다(2026-09-26).
const MENU_GROUPS: { title: string; items: { id: Tab; label: string; icon: any }[] }[] = [
    { title: "한눈에", items: [
        { id: "dashboard", label: "대시보드", icon: LucideLayoutDashboard },
        { id: "today", label: "오늘 접속", icon: LucideZap },
    ] },
    { title: "회원", items: [
        { id: "members", label: "회원 관리", icon: LucideUsers },
        { id: "push", label: "푸시 발송", icon: LucideBell },
        { id: "suggestions", label: "건의함", icon: LucideMail },
        { id: "moderation", label: "신고/제재", icon: LucideShieldAlert },
    ] },
    { title: "매장", items: [
        { id: "claims", label: "매장 클레임", icon: LucideStore },
        { id: "registrations", label: "신규 매장 등록", icon: LucideUserPlus },
        { id: "leads", label: "입점 문의", icon: LucidePhone },
        { id: "stores", label: "매장 리스트", icon: LucideStore },
        { id: "billing", label: "결제 관리", icon: LucideCreditCard },
    ] },
    { title: "콘텐츠", items: [
        { id: "crews", label: "크루 현황", icon: LucideUsersRound },
        { id: "online-game", label: "온라인게임", icon: GameController },
        { id: "golf-orders", label: "골프 회원권", icon: LucideFlag },
        { id: "notices", label: "공지사항", icon: LucideMegaphone },
    ] },
];

function SidebarContent({ tab, setTab, handleLogout, closeMobileMenu, badges }: {
    tab: Tab; setTab: (t: Tab) => void; handleLogout: () => void; closeMobileMenu?: () => void;
    badges: Partial<Record<Tab, number>>;
}) {
    return (
        // 모바일 서랍에서도 메뉴가 다 보이게: 가운데 목록만 스크롤(머리글·로그아웃은 고정), min-h-0 이 없으면 flex 자식이 안 줄어 스크롤이 안 생긴다
        <div className="flex flex-col h-full min-h-0 bg-white border-r border-black/10">
            <div className="shrink-0 px-5 py-5 border-b border-black/10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                        <LucideGlobe className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black tracking-tight text-brand">랭큐 관리자</h1>
                        <span className="text-[11px] text-black/40 font-bold block">운영 콘솔</span>
                    </div>
                </div>
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 space-y-4">
                {MENU_GROUPS.map((g) => (
                    <div key={g.title}>
                        <p className="px-3 pb-1 text-[11px] font-black text-black/35">{g.title}</p>
                        <div className="space-y-0.5">
                            {g.items.map((item) => {
                                const n = badges[item.id] ?? 0;
                                const active = tab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            setTab(item.id);
                                            if (closeMobileMenu) closeMobileMenu();
                                        }}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${active
                                            ? "bg-brand text-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                                            : "text-black/60 hover:bg-black/[0.04] hover:text-[rgba(0,0,0,0.87)]"
                                            }`}
                                    >
                                        <item.icon size={18} />
                                        <span className="flex-1 text-left">{item.label}</span>
                                        {n > 0 && (
                                            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-black tabular-nums flex items-center justify-center ${active ? "bg-white text-brand" : "bg-red-500 text-white"}`}>
                                                {n > 99 ? "99+" : n}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            <div className="shrink-0 p-3 border-t border-black/10" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-500/10 transition">
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
    const queryClient = useQueryClient();
    // 모바일 메뉴 서랍(열림 상태를 들고 있어야 메뉴를 고를 때 닫을 수 있다)
    const [menuOpen, setMenuOpen] = useState(false);
    const [tab, setTabState] = useState<Tab>(() =>
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
        setTabState(t);
        // 새 건의 알림으로 왔다 — 5분 캐시를 기다리지 않고 건의함을 다시 읽어 방금 온 건의가 보이게 한다.
        if (t === "suggestions") queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
        setLocation(window.location.pathname, { replace: true });
    }, [search]); // eslint-disable-line react-hooks/exhaustive-deps
    // 탭을 바꾸면 화면 맨 위로 — 폰에서 긴 목록 아래에서 메뉴를 고르면 새 화면 중간부터 보였다.
    const setTab = (t: Tab) => {
        setTabState(t);
        window.scrollTo({ top: 0 });
    };
    // 회원 상세 시트 — '오늘 접속'·'회원 관리'·대시보드 어디서 눌러도 같은 시트가 열린다.
    const [openMemberId, setOpenMemberId] = useState<string | null>(null);

    const { data: stats } = useQuery<GlobalStats>({ queryKey: ["/api/hiq/admin/stats"] });
    const { data: members = [] } = useQuery<AdminMember[]>({ queryKey: ADMIN_MEMBERS_KEY });
    const openMember = openMemberId ? members.find((m) => m.id === openMemberId) ?? null : null;
    // 밀린 일 숫자 — 각 화면과 같은 열쇠(같은 요청 한 번)
    const { data: leads = [] } = useQuery<PartnerLead[]>({ queryKey: LEADS_KEY });
    const { data: suggestions = [] } = useQuery<Suggestion[]>({ queryKey: SUGGESTIONS_KEY });
    const { data: claims = [] } = useQuery<Claim[]>({ queryKey: CLAIMS_KEY });
    const { data: registrations = [] } = useQuery<Registration[]>({ queryKey: REGISTRATIONS_KEY });
    const { data: golfOrders = [] } = useQuery<{ status: string }[]>({ queryKey: GOLF_ORDERS_KEY });
    const { data: reportCount } = useQuery<{ open: number }>({ queryKey: ["/api/hiq/admin/reports/count"], refetchInterval: 120_000 });

    const pending = useMemo(() => ({
        claims: claims.filter((c) => c.status === "pending").length,
        registrations: registrations.filter((r) => r.status === "pending").length,
        leads: leads.filter((l) => l.status === "NEW").length,
        suggestions: suggestions.filter((x) => !x.isRead).length,
        golfOrders: golfOrders.filter((o) => o.status === "PENDING").length,
        reports: reportCount?.open ?? 0,
    }), [claims, registrations, leads, suggestions, golfOrders, reportCount]);
    const badges: Partial<Record<Tab, number>> = {
        claims: pending.claims,
        registrations: pending.registrations,
        leads: pending.leads,
        suggestions: pending.suggestions,
        "golf-orders": pending.golfOrders,
        moderation: pending.reports,
    };
    const pendingTotal = Object.values(pending).reduce((a, b) => a + b, 0);

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

    const todos: { tab: Tab; label: string; n: number }[] = [
        { tab: "moderation", label: "미처리 신고", n: pending.reports },
        { tab: "claims", label: "매장 클레임 대기", n: pending.claims },
        { tab: "registrations", label: "신규 매장 등록 대기", n: pending.registrations },
        { tab: "leads", label: "새 입점 문의", n: pending.leads },
        { tab: "suggestions", label: "안 읽은 건의", n: pending.suggestions },
        { tab: "golf-orders", label: "골프 회원권 대기", n: pending.golfOrders },
    ];

    return (
        <div className="min-h-screen bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans flex flex-col md:flex-row">
            {/* Mobile Header — 높이 고정(h-14): 회원 관리의 거르기 줄이 이 아래(top-14)에 붙는다 */}
            <div className="md:hidden h-14 bg-white border-b border-black/10 px-2 sticky top-0 z-30 flex items-center gap-1">
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="메뉴" className="relative text-[rgba(0,0,0,0.87)]">
                            <LucideMenu />
                            {pendingTotal > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />}
                        </Button>
                    </SheetTrigger>
                    {/* 서랍도 화면 높이에 맞춰 세로 flex — 안의 메뉴가 스크롤된다. 고르면 닫힌다. */}
                    <SheetContent side="left" className="p-0 border-r border-black/10 w-72 max-w-[85vw] bg-white flex flex-col h-full">
                        <SheetTitle className="sr-only">관리자 메뉴</SheetTitle>
                        <SidebarContent tab={tab} setTab={setTab} handleLogout={handleLogout} closeMobileMenu={() => setMenuOpen(false)} badges={badges} />
                    </SheetContent>
                </Sheet>
                <span className="flex-1 truncate font-black text-[16px]">{getTabTitle(tab)}</span>
                {tab !== "dashboard" && (
                    <button onClick={() => setTab("dashboard")} className="px-3 h-9 rounded-lg text-[13px] font-bold text-brand">홈</button>
                )}
            </div>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-64 flex-col fixed h-full z-20">
                <SidebarContent tab={tab} setTab={setTab} handleLogout={handleLogout} badges={badges} />
            </aside>

            <main className="flex-1 min-w-0 md:ml-64 p-4 md:p-8">
                {/* 제목 — 폰에선 위 머리줄이 제목을 보여 주므로 숨긴다 */}
                <header className="hidden md:block mb-6">
                    <h2 className="text-3xl font-black text-[rgba(0,0,0,0.87)]">{getTabTitle(tab)}</h2>
                    {TAB_SUBTITLE[tab] && <p className="mt-1 text-[13.5px] text-black/50">{TAB_SUBTITLE[tab]}</p>}
                </header>

                <div className="max-w-6xl">
                    {tab === "dashboard" && (
                        <div className="space-y-6">
                            {/* 처리할 일 — 쌓인 것만 보인다. 누르면 그 메뉴로 */}
                            <section>
                                <h3 className="text-[14px] font-black text-black/60 mb-2">처리할 일</h3>
                                {pendingTotal === 0 ? (
                                    <div className="rounded-2xl bg-white border border-black/[0.08] p-4 flex items-center gap-2 text-[13.5px] text-black/55">
                                        <LucideCheckCircle className="w-4 h-4 text-brand" /> 지금 밀린 일이 없습니다.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-2.5">
                                        {todos.filter((t) => t.n > 0).map((t) => (
                                            <KpiTile key={t.tab} label={t.label} value={t.n} unit="건" tone="alert" onClick={() => setTab(t.tab)} sub="눌러서 처리 →" />
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-[14px] font-black text-black/60">오늘 접속</h3>
                                    <button onClick={() => setTab("today")} className="text-[12.5px] font-bold text-brand">자세히 →</button>
                                </div>
                                <TodayActiveView compact onOpenMember={setOpenMemberId} onSeeAll={() => setTab("today")} />
                            </section>

                            <section>
                                <h3 className="text-[14px] font-black text-black/60 mb-2">전체 현황</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                    <KpiTile label="전체 회원" value={(stats?.totalUsers ?? 0).toLocaleString()} unit="명" onClick={() => setTab("members")} />
                                    <KpiTile label="오늘 가입" value={stats?.newUsersToday ?? 0} unit="명" tone="brand" />
                                    <KpiTile label="오늘 매장 방문" value={stats?.totalVisitsToday ?? 0} unit="회" sub="회원이 앱에 들어온 날(하루 1회)" />
                                    <KpiTile label="가맹점" value={stats?.totalStores ?? 0} unit="곳" onClick={() => setTab("stores")} />
                                </div>
                            </section>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Panel className="p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-[15px] font-bold flex items-center gap-2"><LucidePhone size={16} className="text-brand" /> 최근 입점 문의</h3>
                                        <button onClick={() => setTab("leads")} className="text-[12.5px] font-bold text-black/45">전체 →</button>
                                    </div>
                                    <div className="space-y-2">
                                        {leads.slice(0, 3).map((lead) => (
                                            <button key={lead.id} onClick={() => setTab("leads")} className="w-full flex justify-between items-center gap-2 text-sm p-3 bg-black/[0.03] rounded-xl text-left">
                                                <div className="min-w-0 truncate">
                                                    <span className="font-bold">{lead.ownerName}</span>
                                                    <span className="text-black/55 text-xs ml-2">{lead.region} {lead.storeName}</span>
                                                </div>
                                                <Pill tone={lead.status === "NEW" ? "alert" : lead.status === "REGISTERED" ? "brand" : "neutral"}>{LEAD_STATUS_LABEL[lead.status] ?? lead.status}</Pill>
                                            </button>
                                        ))}
                                        {leads.length === 0 && <div className="text-center text-black/40 py-4 text-xs">문의 내역이 없습니다.</div>}
                                    </div>
                                </Panel>

                                <Panel className="p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-[15px] font-bold flex items-center gap-2"><LucideMail size={16} className="text-brand" /> 최근 건의사항</h3>
                                        <button onClick={() => setTab("suggestions")} className="text-[12.5px] font-bold text-black/45">전체 →</button>
                                    </div>
                                    <div className="space-y-2">
                                        {suggestions.slice(0, 3).map((sg) => (
                                            <button key={sg.id} onClick={() => setTab("suggestions")} className="w-full p-3 bg-black/[0.03] rounded-xl text-xs space-y-1 text-left">
                                                <div className="flex justify-between items-center">
                                                    <span className="flex items-center gap-1.5 font-bold text-black/65">
                                                        {!sg.isRead && <span className="w-2 h-2 rounded-full bg-red-500" />}
                                                        {sg.submitterName || "비회원"}
                                                    </span>
                                                    <span className="text-black/40 tabular-nums">{agoLabel(sg.createdAt)}</span>
                                                </div>
                                                <p className="text-black/70 line-clamp-1">{sg.content}</p>
                                            </button>
                                        ))}
                                        {suggestions.length === 0 && <div className="text-center text-black/40 py-4 text-xs">건의사항이 없습니다.</div>}
                                    </div>
                                </Panel>
                            </div>
                        </div>
                    )}

                    {tab === "today" && <TodayActiveView onOpenMember={setOpenMemberId} />}
                    {tab === "members" && <MembersView onOpenId={setOpenMemberId} />}
                    {tab === "push" && <PushView />}
                    {tab === "suggestions" && <SuggestionsView />}
                    {tab === "moderation" && <ModerationView />}
                    {tab === "claims" && <ClaimsView />}
                    {tab === "registrations" && <RegistrationsView />}
                    {tab === "leads" && <LeadsView />}
                    {tab === "stores" && <StoresView />}
                    {tab === "billing" && <BillingView />}
                    {tab === "crews" && <CrewsView />}
                    {tab === "online-game" && <OnlineGameView />}
                    {tab === "golf-orders" && <GolfOrdersView />}
                    {tab === "notices" && <NoticesView />}

                    <MemberDetailSheet member={openMember} onClose={() => setOpenMemberId(null)} />
                </div>
            </main>
        </div>
    );
}

function getTabTitle(tab: string) {
    // 폰에선 머리줄의 이 제목이 지금 어느 화면인지 알려 주는 유일한 표시라 전부 채운다(2026-09-08)
    switch (tab) {
        case "dashboard": return "대시보드";
        case "today": return "오늘 접속";
        case "members": return "회원 관리";
        case "leads": return "입점 문의";
        case "stores": return "가맹점 리스트";
        case "billing": return "결제 관리";
        case "suggestions": return "건의함";
        case "notices": return "공지사항";
        case "moderation": return "신고/제재";
        case "golf-orders": return "골프 회원권 접수";
        case "online-game": return "온라인게임 이용 현황";
        case "claims": return "매장 클레임";
        case "registrations": return "신규 매장 등록";
        case "crews": return "크루 현황";
        case "push": return "푸시 발송";
        default: return "관리자";
    }
}

/** 넓은 화면 제목 아래 한 줄 설명 */
const TAB_SUBTITLE: Partial<Record<Tab, string>> = {
    dashboard: "밀린 일과 오늘 접속을 먼저 봅니다.",
    today: "한국 시간 0시부터 앱을 연 회원 — 1분마다 새로 읽습니다.",
    members: "누르면 상세 — 정보 수정·경기 기록·알림·PIN·정지.",
    push: "받는 사람을 고르고, 미리보기로 확인한 뒤 보냅니다.",
    moderation: "신고는 접수 후 24시간 안에 처리해 주세요.",
    claims: "사장님이 기존 매장 페이지의 관리 권한을 신청한 건입니다.",
    registrations: "디렉토리에 없는 새 매장 등록 신청입니다.",
    leads: "사장님 연락처 접수함 — 전화 후 클레임으로 안내합니다.",
    stores: "계약된 매장과 사장님 화면(대리 접속).",
    crews: "모든 크루 — 종목·인원·가입 대기.",
    "golf-orders": "골프 회원권 매수·매도 상담 접수.",
    notices: "앱 공지 — 쓰기·고치기·가리기.",
};
