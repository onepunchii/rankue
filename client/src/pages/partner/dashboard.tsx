/**
 * 사장님 대시보드 — 폰 먼저(2026-09-26 개편).
 *
 * 사장님은 거의 다 앱(전체 메뉴 → 내 매장 관리)에서 폰으로 들어온다. 예전 화면은 긴 한 장에 모든 걸 쌓아
 * 회원 목록이 300px 상자 안에서만 스크롤됐고, 숫자는 한국 오전 9시에야 '오늘'이 바뀌었다(서버 UTC).
 * 지금:
 *  - 아래 탭 4개(홈 · 회원 · 대회 · 홍보) — 엄지가 닿는 곳에서 옮겨 다닌다.
 *  - 홈: 오늘 방문(어제 대비) · 최근 7일 막대 · 회원 현황 · 매장 페이지 채우기 점검 · 이번 달 단골/실력 순위
 *  - 회원: 거르기(이번 달 활동·30일+ 미방문·신규·메모) · 정렬 · 누르면 상세 시트(전화·문자·기록·사장님 메모)
 *  - 대회: 만들기 + 우리 매장 대회 목록
 *  - 홍보: 매장 QR · 링크 복사 · 포스터 저장
 *  - 관리자가 '사장님 화면'으로 들어왔으면 맨 위에 '관리자로 돌아가기' 띠.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
    LucideStore, LucideLogOut, LucideUsers, LucideHome,
    LucideDownload, LucideMessageSquare, LucideTrophy, LucideQrCode,
    LucideSearch, LucidePhone, LucideSettings, LucideCopy, LucideCheck,
    LucideChevronRight, LucideExternalLink, LucidePlus, LucideArrowLeft,
} from "@/lib/icons";
import { HiqStore } from "../../../../shared/schema";
import { useRef, useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import { apiRequest, queryClient } from "@/lib/queryClient";
import html2canvas from "html2canvas";
import { LucideLock as LockIcon } from "@/lib/icons";
import { isNativeApp } from "@/lib/nativeBridge";

type StoreMember = {
    id: string;
    name: string;
    phone: string;
    gender: "male" | "female" | null;
    birthYear: number | null;
    handi3c: number | null;
    handi4c: number | null;
    rating3c: number;
    rating4c: number;
    avg3c: number;
    avg4c: number;
    visitCount: number;
    lastVisitedAt: string | null;
    createdAt: string;
    marketingAgree: boolean;
    memo: string | null;
    monthlyGameCount: number;
};

type StoreStats = {
    totalMembers: number;
    visitsToday: number;
    visitsYesterday: number;
    newToday: number;
    newThisMonth?: number;
    active30?: number;
    dormant30?: number;
    visits7?: { date: string; count: number }[];
};

type StoreTournament = {
    id: string; title: string; status: string; gameType: string;
    maxPlayers: number; startDate: string; participants: number;
};

type PartnerStore = HiqStore & {
    listing?: { code: string; description: string | null; crewCount: number; crewMemberTotal: number } | null;
    impersonating?: boolean;
};

type Tab = "home" | "members" | "tournaments" | "promo";
type MemberFilter = "all" | "month" | "dormant" | "new" | "memo";
type MemberSort = "recent" | "visits" | "joined" | "skill";

const MEMBERS_KEY = ["/api/hiq/partner/members"] as const;

// --- 표시 도우미(한국 시각) ---
const KST_MD = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
const KST_YMD = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const kstMonthKey = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 7);

function daysAgo(iso: string | null | undefined): number {
    if (!iso) return Infinity;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? (Date.now() - t) / 86_400_000 : Infinity;
}

function lastVisitLabel(iso: string | null | undefined): string {
    const d = daysAgo(iso);
    if (!Number.isFinite(d)) return "방문 기록 없음";
    if (d < 1) return "오늘";
    if (d < 2) return "어제";
    if (d < 30) return `${Math.floor(d)}일 전`;
    return `${Math.floor(d / 30)}달 전`;
}

const isRealPhone = (p: string) => !!p && !p.startsWith("social:");
const maskPhone = (p: string) => (isRealPhone(p) ? p.replace(/(\d{3})-?(\d{3,4})-?(\d{4})/, "$1-****-$3") : "소셜 로그인");

function getTierName(rating: number) {
    if (rating >= 2000) return "Diamond";
    if (rating >= 1500) return "Platinum";
    if (rating >= 1000) return "Gold";
    if (rating >= 500) return "Silver";
    return "Bronze";
}

const TOURNAMENT_STATUS: Record<string, { label: string; cls: string }> = {
    recruiting: { label: "모집 중", cls: "bg-brand/10 text-brand" },
    preparing: { label: "준비 중", cls: "bg-amber-500/10 text-amber-700" },
    ongoing: { label: "진행 중", cls: "bg-blue-500/10 text-blue-700" },
    ended: { label: "끝남", cls: "bg-black/[0.05] text-black/45" },
};

// --- 작은 조각들 ---
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return <div className={`bg-white rounded-[1.25rem] border border-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}>{children}</div>;
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between mb-2.5 px-1">
            <h2 className="text-[15px] font-bold flex items-center gap-2">
                <span className="w-1 h-4 bg-brand rounded-full" />
                {children}
            </h2>
            {right}
        </div>
    );
}

function VisitBars({ days }: { days: { date: string; count: number }[] }) {
    const max = Math.max(1, ...days.map((d) => d.count));
    return (
        <div className="flex items-end gap-1.5 h-24" role="img" aria-label="최근 7일 방문 회원 수">
            {days.map((d, i) => {
                const today = i === days.length - 1;
                const wd = WEEKDAY[new Date(`${d.date}T00:00:00Z`).getUTCDay()];
                return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                        <span className={`text-[11px] tabular-nums ${today ? "font-bold text-brand" : "text-black/40"}`}>{d.count}</span>
                        <div className={`w-full rounded-md ${today ? "bg-brand" : "bg-brand/25"}`} style={{ height: `${Math.max(6, (d.count / max) * 60)}%` }} />
                        <span className={`text-[11px] ${today ? "font-bold text-brand" : "text-black/45"}`}>{today ? "오늘" : wd}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default function PartnerDashboard() {
    // 앱(iOS·안드로이드) 안에서는 유료 구독 권유·가격·잠긴 프리미엄 기능을 보이지 않는다 — 스토어 결제 밖의
    // 디지털 구독 판매·안내는 Apple 3.1.1 · Google Play 결제 정책 위반이다(감사 S9). 매장 관리 기능은 그대로.
    const native = isNativeApp();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const posterRef = useRef<HTMLDivElement>(null);
    const [tab, setTabState] = useState<Tab>("home");
    const [searchQuery, setSearchQuery] = useState("");
    const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
    const [memberSort, setMemberSort] = useState<MemberSort>("recent");
    const [memberLimit, setMemberLimit] = useState(50);
    const [rankingTab, setRankingTab] = useState<"visit" | "skill">("visit");
    const [openId, setOpenId] = useState<string | null>(null);
    const [memoDraft, setMemoDraft] = useState("");
    const [showSmsSheet, setShowSmsSheet] = useState(false);
    const [smsTarget, setSmsTarget] = useState<"all" | "dormant">("all");
    const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);
    const [copied, setCopied] = useState(false);

    const setTab = (t: Tab) => {
        setTabState(t);
        window.scrollTo({ top: 0 });
    };

    // 1. 매장 — 세션 만료/비로그인이면 로그인으로 돌려보낸다 ('Store not found' 방치 금지)
    const { data: store, isLoading: isStoreLoading, isError: isStoreError } = useQuery<PartnerStore>({
        queryKey: ["/api/hiq/partner/store"],
        retry: false,
    });
    useEffect(() => {
        if (isStoreError) setLocation("/partner/login");
    }, [isStoreError, setLocation]);

    const { data: stats } = useQuery<StoreStats>({ queryKey: ["/api/hiq/partner/stats"], enabled: !!store });
    const { data: members = [], isLoading: membersLoading } = useQuery<StoreMember[]>({ queryKey: MEMBERS_KEY, enabled: !!store });
    const { data: tournaments = [], isLoading: tournamentsLoading } = useQuery<StoreTournament[]>({
        queryKey: ["/api/hiq/partner/tournaments"],
        enabled: !!store && tab === "tournaments",
    });

    const openMember = openId ? members.find((m) => m.id === openId) ?? null : null;
    useEffect(() => { setMemoDraft(openMember?.memo ?? ""); }, [openMember?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const saveMemo = useMutation({
        mutationFn: async ({ id, memo }: { id: string; memo: string }) =>
            apiRequest(`/api/hiq/partner/members/${id}/memo`, { method: "PATCH", body: { memo } }),
        onSuccess: (_r, v) => {
            queryClient.setQueryData<StoreMember[]>(MEMBERS_KEY, (old) => (old ?? []).map((m) => (m.id === v.id ? { ...m, memo: v.memo.trim() || null } : m)));
            toast({ title: "메모를 저장했습니다" });
        },
        onError: (e: any) => toast({ title: e?.message || "메모 저장 실패", variant: "destructive" }),
    });

    const exitImpersonation = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/admin/impersonate/exit", { method: "POST" }),
        onSuccess: () => {
            queryClient.clear();
            window.location.href = "/admin/dashboard";
        },
        onError: (e: any) => toast({ title: e?.message || "돌아가기 실패 — 다시 로그인해 주세요", variant: "destructive" }),
    });

    const handleLogout = async () => {
        // The session cookie is httpOnly, so client JS cannot clear it — the server must.
        try {
            await apiRequest("/api/hiq/logout", { method: "POST" });
        } catch {
            /* proceed even if offline */
        }
        // Wipe cached member PII from memory and the throttled localStorage persister.
        queryClient.clear();
        localStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
        setLocation("/partner/login");
    };

    const isBasic = store?.subscriptionTier !== "PREMIUM";
    // /join?store= 는 존재하지 않는 라우트(404)였다 — 매장 공개 페이지가 올바른 착지점
    const joinUrl = store ? `${window.location.origin}/store/${store.slug}` : "";

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(joinUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast({ title: "복사하지 못했습니다", description: joinUrl });
        }
    };

    const handleDownloadPoster = async () => {
        if (!store || !posterRef.current) return;
        setIsGeneratingPoster(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const canvas = await html2canvas(posterRef.current, { scale: 2, backgroundColor: "#000000", logging: false, useCORS: true });
            const link = document.createElement("a");
            link.download = `Rankue_Poster_${store.slug}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        } catch (err) {
            console.error("Poster Generation Failed:", err);
            toast({ title: "포스터 생성 실패", description: "다시 시도해주세요.", variant: "destructive" });
        } finally {
            setIsGeneratingPoster(false);
        }
    };

    const premiumOnly = (what: string) => toast({ title: "프리미엄 기능입니다 🔒", description: `${what}는 프리미엄 멤버십에서만 제공됩니다.`, variant: "destructive" });

    const handleDownloadExcel = () => {
        if (!store) return;
        if (isBasic) return premiumOnly("회원 데이터 엑셀 다운로드");
        if (!members.length) return;
        const excelData = members.map((m) => ({
            "회원명": m.name,
            "전화번호": isRealPhone(m.phone) ? m.phone : "",
            "등급": getTierName(m.rating4c),
            "3쿠션 핸디": m.handi3c ?? "",
            "4구 핸디": m.handi4c ?? "",
            "3쿠션 에버": Number(m.avg3c || 0).toFixed(3),
            "총 방문수": m.visitCount,
            "최근 방문": m.lastVisitedAt ? KST_YMD.format(new Date(m.lastVisitedAt)) : "-",
            "이번달 게임": m.monthlyGameCount,
            "가입일": KST_YMD.format(new Date(m.createdAt)),
            "마케팅 수신": m.marketingAgree ? "동의" : "",
            "메모": m.memo ?? "",
        }));
        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "회원명부");
        const dateStr = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "_");
        XLSX.writeFile(wb, `${dateStr}_회원명부.xlsx`);
    };

    // 회원 거르기·정렬
    const thisMonth = kstMonthKey(Date.now());
    const filterTest: Record<MemberFilter, (m: StoreMember) => boolean> = {
        all: () => true,
        month: (m) => m.monthlyGameCount > 0 || (!!m.lastVisitedAt && kstMonthKey(Date.parse(m.lastVisitedAt)) === thisMonth),
        dormant: (m) => daysAgo(m.lastVisitedAt) > 30,
        new: (m) => kstMonthKey(Date.parse(m.createdAt)) === thisMonth,
        memo: (m) => !!m.memo,
    };
    const filterCounts = useMemo(
        () => Object.fromEntries((Object.keys(filterTest) as MemberFilter[]).map((k) => [k, members.filter(filterTest[k]).length])) as Record<MemberFilter, number>,
        [members], // eslint-disable-line react-hooks/exhaustive-deps
    );
    const filteredMembers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const rows = members.filter((m) => filterTest[memberFilter](m) && (!q || m.name.toLowerCase().includes(q) || m.phone.includes(q)));
        const t = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);
        switch (memberSort) {
            case "visits": return rows.sort((a, b) => b.visitCount - a.visitCount);
            case "joined": return rows.sort((a, b) => t(b.createdAt) - t(a.createdAt));
            case "skill": return rows.sort((a, b) => (b.avg3c || 0) - (a.avg3c || 0));
            default: return rows.sort((a, b) => t(b.lastVisitedAt) - t(a.lastVisitedAt));
        }
    }, [members, memberFilter, memberSort, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

    const rankedMembers = useMemo(() => {
        const sorted = [...members];
        if (rankingTab === "skill") {
            return sorted.filter((m) => (m.avg3c || 0) > 0).sort((a, b) => (b.avg3c || 0) - (a.avg3c || 0)).slice(0, 5);
        }
        return sorted.filter((m) => m.monthlyGameCount > 0).sort((a, b) => b.monthlyGameCount - a.monthlyGameCount).slice(0, 5);
    }, [members, rankingTab]);

    // 단체 문자 대상 — 광고 문자는 수신 동의한 회원에게만(정보통신망법). 번호를 복사해 쓰던 문자 앱에 붙인다.
    const smsTargets = useMemo(() => members.filter((m) =>
        m.marketingAgree && isRealPhone(m.phone) && (smsTarget === "all" || daysAgo(m.lastVisitedAt) > 30)), [members, smsTarget]);
    const copySmsNumbers = async () => {
        try {
            await navigator.clipboard.writeText(smsTargets.map((m) => m.phone).join(", "));
            toast({ title: `${smsTargets.length}명의 번호를 복사했습니다`, description: "문자 앱 받는 사람 칸에 붙여 넣으세요." });
        } catch {
            toast({ title: "복사하지 못했습니다", variant: "destructive" });
        }
    };

    if (isStoreLoading) return <div className="min-h-screen bg-surface-0 flex items-center justify-center text-black/55">불러오는 중...</div>;
    if (!store) return <div className="min-h-screen bg-surface-0 text-[rgba(0,0,0,0.87)] p-6">매장을 찾을 수 없습니다</div>;

    // 매장 페이지 채우기 점검 — 비어 있으면 손님이 매장 페이지에서 정보를 못 본다
    const checklist = [
        { label: "매장 소개", done: !!(store.description || store.listing?.description) },
        { label: "전화번호", done: !!store.phone },
        { label: "영업시간", done: !!(store.openTime && store.closeTime) },
        { label: "주소", done: !!store.address },
        { label: "테이블 수", done: ((store.tableLarge ?? 0) + (store.tableMedium ?? 0)) > 0 },
    ];
    const missing = checklist.filter((c) => !c.done);
    const visitDiff = (stats?.visitsToday ?? 0) - (stats?.visitsYesterday ?? 0);

    const TABS: { id: Tab; label: string; icon: any }[] = [
        { id: "home", label: "홈", icon: LucideHome },
        { id: "members", label: "회원", icon: LucideUsers },
        { id: "tournaments", label: "대회", icon: LucideTrophy },
        { id: "promo", label: "홍보", icon: LucideQrCode },
    ];

    return (
        <div className="min-h-screen bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 84px)" }}>
            {/* 관리자 대리 접속 중 */}
            {store.impersonating && (
                <div className="bg-amber-400 text-black px-4 py-2 flex items-center gap-2 text-[13px] font-bold" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
                    <span className="flex-1 truncate">관리자로 '{store.name}' 보는 중</span>
                    <button onClick={() => exitImpersonation.mutate()} disabled={exitImpersonation.isPending}
                        className="shrink-0 h-8 px-3 rounded-full bg-black text-white text-[12.5px] flex items-center gap-1 disabled:opacity-60">
                        <LucideArrowLeft className="w-3.5 h-3.5" /> 관리자로 돌아가기
                    </button>
                </div>
            )}

            {/* 머리줄 */}
            <header className="sticky top-0 z-30 bg-surface-0/95 backdrop-blur border-b border-black/[0.05]"
                style={store.impersonating ? undefined : { paddingTop: "env(safe-area-inset-top)" }}>
                <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
                    <div className="w-9 h-9 shrink-0 bg-brand rounded-xl flex items-center justify-center">
                        <LucideStore className="w-[18px] h-[18px] text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[16px] font-bold tracking-tight truncate">{store.name}</h1>
                        <span className="text-[11.5px] text-brand font-bold block -mt-0.5">사장님 대시보드{!isBasic && " · 프리미엄"}</span>
                    </div>
                    <button onClick={() => setLocation("/partner/settings")} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/[0.05]" aria-label="매장 정보 수정">
                        <LucideSettings className="w-5 h-5 text-black/50" />
                    </button>
                    <button onClick={handleLogout} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/[0.05]" aria-label="로그아웃">
                        <LucideLogOut className="w-5 h-5 text-black/50" />
                    </button>
                </div>
            </header>

            <main className="max-w-lg mx-auto px-4 pt-4 space-y-6">
                {tab === "home" && (
                    <>
                        {/* 오늘 */}
                        <Card className="p-5">
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className="text-[13px] text-black/55 font-bold">오늘 방문한 회원</p>
                                    <p className="mt-1 text-[40px] leading-none font-black tabular-nums">
                                        {stats?.visitsToday ?? 0}<span className="text-[15px] text-black/40 font-bold ml-1">명</span>
                                    </p>
                                    <p className="mt-2 text-[12.5px] text-black/50 tabular-nums">
                                        어제 {stats?.visitsYesterday ?? 0}명 ·{" "}
                                        <b className={visitDiff >= 0 ? "text-brand" : "text-red-600"}>{visitDiff >= 0 ? "▲" : "▼"} {Math.abs(visitDiff)}</b>
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[13px] text-brand/80 font-bold">오늘 신규</p>
                                    <p className="mt-1 text-[28px] leading-none font-black text-brand tabular-nums">{stats?.newToday ?? 0}<span className="text-[13px] ml-0.5">명</span></p>
                                </div>
                            </div>
                            {stats?.visits7 && stats.visits7.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-black/[0.06]">
                                    <p className="text-[12px] text-black/45 font-bold mb-2">최근 7일 방문</p>
                                    <VisitBars days={stats.visits7} />
                                </div>
                            )}
                        </Card>

                        {/* 회원 현황 — 누르면 그 조건으로 회원 탭 */}
                        <div className="grid grid-cols-3 gap-2.5">
                            {([
                                ["전체 회원", stats?.totalMembers ?? members.length, "all"],
                                ["이번 달 신규", stats?.newThisMonth ?? filterCounts.new, "new"],
                                ["30일+ 미방문", stats?.dormant30 ?? filterCounts.dormant, "dormant"],
                            ] as [string, number, MemberFilter][]).map(([label, n, f]) => (
                                <button key={label} onClick={() => { setMemberFilter(f); setTab("members"); }}
                                    className="bg-white rounded-2xl border border-black/[0.06] p-3.5 text-left active:scale-[0.98] transition-transform">
                                    <p className="text-[11.5px] font-bold text-black/50">{label}</p>
                                    <p className={`mt-1 text-[22px] font-black tabular-nums ${f === "dormant" && n > 0 ? "text-red-600" : ""}`}>{n}</p>
                                </button>
                            ))}
                        </div>

                        {/* 매장 페이지 — 클레임된 디렉토리 페이지 지표 + 채우기 점검 */}
                        <Card className="p-5">
                            <div className="flex items-center justify-between">
                                <p className="text-[13px] font-bold text-black/55">내 매장 페이지</p>
                                <button
                                    onClick={() => window.open(store.listing ? `/stores/${store.listing.code}` : `/store/${store.slug}`, "_blank")}
                                    className="text-[12.5px] font-bold text-brand flex items-center gap-1"
                                >
                                    페이지 보기 <LucideExternalLink className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            {store.listing && (
                                <div className="mt-2 flex items-center gap-5 tabular-nums">
                                    <span className="text-[13.5px]"><b className="text-brand text-[22px] font-black">{store.listing.crewCount}</b> <span className="text-black/50">활동 크루</span></span>
                                    <span className="text-[13.5px]"><b className="text-brand text-[22px] font-black">{store.listing.crewMemberTotal}</b> <span className="text-black/50">크루 멤버</span></span>
                                </div>
                            )}
                            {missing.length > 0 ? (
                                <button onClick={() => setLocation("/partner/settings")} className="mt-3 w-full rounded-xl bg-[#E02D2D]/[0.06] px-3.5 py-3 text-left">
                                    <p className="text-[13px] font-bold text-[#C42424]">비어 있는 정보 {missing.length}개 — 손님이 페이지에서 못 봐요</p>
                                    <p className="mt-0.5 text-[12px] text-black/55">{missing.map((c) => c.label).join(" · ")} <span className="font-bold text-brand">채우러 가기 →</span></p>
                                </button>
                            ) : (
                                <p className="mt-3 text-[12.5px] text-brand font-bold flex items-center gap-1"><LucideCheck className="w-4 h-4" /> 매장 정보가 모두 채워져 있어요</p>
                            )}
                        </Card>

                        {/* 순위 */}
                        <section>
                            <SectionTitle right={<button onClick={() => setTab("members")} className="text-[12.5px] font-bold text-black/45">전체 회원 →</button>}>
                                우리 매장 순위
                            </SectionTitle>
                            <Card className="p-1.5">
                                <div className="grid grid-cols-2 p-1 gap-1 bg-black/[0.04] rounded-2xl">
                                    {([["visit", "이번 달 단골"], ["skill", "3쿠션 에버"]] as const).map(([k, label]) => (
                                        <button key={k} onClick={() => setRankingTab(k)}
                                            className={`py-2 text-[13px] font-bold rounded-xl transition-all ${rankingTab === k ? "bg-white text-[rgba(0,0,0,0.87)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-black/45"}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <div className="px-3 pb-1">
                                    {rankedMembers.map((m, idx) => (
                                        <button key={m.id} onClick={() => setOpenId(m.id)} className="w-full flex items-center py-3 border-b border-black/[0.06] last:border-0 text-left">
                                            <span className={`w-6 text-center font-black text-[15px] ${idx === 0 ? "text-[#cba258]" : idx === 1 ? "text-slate-500" : idx === 2 ? "text-amber-700" : "text-black/35"}`}>{idx + 1}</span>
                                            <span className="ml-3 flex-1 min-w-0">
                                                <span className="block text-[14px] font-bold truncate">{m.name}</span>
                                                <span className="block text-[12px] text-black/50">누적 방문 {m.visitCount}회</span>
                                            </span>
                                            <span className="px-2 py-1 rounded-lg bg-brand/10 text-[12.5px] font-bold text-brand tabular-nums">
                                                {rankingTab === "visit" ? `${m.monthlyGameCount}게임` : Number(m.avg3c).toFixed(3)}
                                            </span>
                                        </button>
                                    ))}
                                    {rankedMembers.length === 0 && (
                                        <p className="text-center py-6 text-black/40 text-[13px]">
                                            {rankingTab === "visit" ? "이번 달 경기 기록이 아직 없어요" : "에버리지 기록이 있는 회원이 없어요"}
                                        </p>
                                    )}
                                </div>
                            </Card>
                        </section>

                        {/* 대회 만들기 */}
                        <button onClick={() => setLocation("/partner/create-tournament")}
                            className="w-full rounded-[1.25rem] bg-brand p-5 flex items-center justify-between text-left shadow-[0_4px_16px_rgba(0,98,65,0.18)] active:scale-[0.99] transition-transform">
                            <span>
                                <span className="block text-[12px] font-bold text-white/80">우리 매장 이벤트</span>
                                <span className="block mt-0.5 text-[19px] font-bold text-white">매장 대회 개최하기</span>
                                <span className="block mt-0.5 text-[12.5px] text-white/85">3분 만에 대회 만들고 대진표 자동 생성</span>
                            </span>
                            <span className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                                <LucideTrophy className="w-6 h-6 text-[#f3d27a]" />
                            </span>
                        </button>
                    </>
                )}

                {tab === "members" && (
                    <>
                        <div className="sticky z-20 -mx-4 px-4 py-2 bg-surface-0/95 backdrop-blur space-y-2"
                            style={{ top: store.impersonating ? "56px" : "calc(env(safe-area-inset-top) + 56px)" }}>
                            <div className="relative">
                                <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                                <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setMemberLimit(50); }}
                                    placeholder="이름 또는 전화번호 뒷자리"
                                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-white border border-black/[0.08] text-[15px] outline-none focus:border-brand/40" />
                            </div>
                            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                                {([["all", "전체"], ["month", "이번 달 활동"], ["dormant", "30일+ 미방문"], ["new", "이번 달 신규"], ["memo", "메모"]] as [MemberFilter, string][]).map(([k, label]) => (
                                    <button key={k} onClick={() => { setMemberFilter(k); setMemberLimit(50); }}
                                        className={`shrink-0 h-8 px-3 rounded-full text-[12.5px] font-bold tabular-nums ${memberFilter === k ? "bg-brand text-white" : "bg-white border border-black/[0.08] text-black/60"}`}>
                                        {label} <span className={memberFilter === k ? "text-white/80" : "text-black/35"}>{filterCounts[k]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <select value={memberSort} onChange={(e) => setMemberSort(e.target.value as MemberSort)} aria-label="정렬"
                                className="h-9 px-2 rounded-lg bg-white border border-black/[0.08] text-[13px] font-bold text-black/65 outline-none">
                                <option value="recent">최근 방문순</option>
                                <option value="visits">방문 많은순</option>
                                <option value="joined">최근 가입순</option>
                                <option value="skill">3쿠션 에버순</option>
                            </select>
                            {/* 앱 안에서 BASIC 매장에는 숨긴다(잠금 표시·'프리미엄 전용' 안내가 곧 구독 권유가 된다) */}
                            {(!native || !isBasic) && (
                                <div className="flex gap-1.5">
                                    <button onClick={handleDownloadExcel} className="h-9 px-3 rounded-lg bg-white border border-black/[0.08] flex items-center gap-1.5 text-[12.5px] font-bold">
                                        {isBasic ? <LockIcon className="w-3.5 h-3.5 text-black/40" /> : <LucideDownload className="w-3.5 h-3.5 text-brand" />} 엑셀
                                    </button>
                                    <button onClick={() => (isBasic ? premiumOnly("단체 문자") : setShowSmsSheet(true))} className="h-9 px-3 rounded-lg bg-white border border-black/[0.08] flex items-center gap-1.5 text-[12.5px] font-bold">
                                        {isBasic ? <LockIcon className="w-3.5 h-3.5 text-black/40" /> : <LucideMessageSquare className="w-3.5 h-3.5 text-brand" />} 단체 문자
                                    </button>
                                </div>
                            )}
                        </div>

                        <Card className="overflow-hidden">
                            {membersLoading ? (
                                <p className="p-8 text-center text-black/40 text-sm">회원 불러오는 중…</p>
                            ) : filteredMembers.length === 0 ? (
                                <p className="p-8 text-center text-black/40 text-sm">
                                    {members.length === 0 ? "아직 우리 매장으로 가입한 회원이 없어요. 홍보 탭의 QR 로 가입을 받아 보세요." : "조건에 맞는 회원이 없어요."}
                                </p>
                            ) : (
                                <ul className="divide-y divide-black/[0.06]">
                                    {filteredMembers.slice(0, memberLimit).map((m) => {
                                        const dormant = daysAgo(m.lastVisitedAt) > 30;
                                        return (
                                            <li key={m.id}>
                                                <button onClick={() => setOpenId(m.id)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-black/[0.04]">
                                                    <span className="shrink-0 w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-[15px] font-black text-brand">{m.name.slice(0, 1)}</span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="font-bold text-[15px] truncate">{m.name}</span>
                                                            <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded font-bold ${m.rating4c >= 1000 ? "bg-[#cba258]/[0.14] text-[#9c7a35]" : "bg-black/[0.05] text-black/50"}`}>{getTierName(m.rating4c)}</span>
                                                        </span>
                                                        <span className="block text-[12.5px] text-black/50 tabular-nums truncate">
                                                            {maskPhone(m.phone)}{m.memo ? ` · 📝 ${m.memo}` : ""}
                                                        </span>
                                                    </span>
                                                    <span className="shrink-0 text-right">
                                                        <span className={`block text-[12.5px] font-bold ${dormant ? "text-red-600" : "text-black/70"}`}>{lastVisitLabel(m.lastVisitedAt)}</span>
                                                        <span className="block text-[11.5px] text-black/40 tabular-nums">방문 {m.visitCount}회</span>
                                                    </span>
                                                    <LucideChevronRight className="w-4 h-4 text-black/25 shrink-0" />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </Card>
                        {filteredMembers.length > memberLimit && (
                            <button onClick={() => setMemberLimit((n) => n + 50)} className="w-full h-11 rounded-xl bg-white border border-black/[0.08] text-[13px] font-bold text-black/60">
                                더 보기 ({memberLimit} / {filteredMembers.length})
                            </button>
                        )}
                    </>
                )}

                {tab === "tournaments" && (
                    <>
                        <button onClick={() => setLocation("/partner/create-tournament")}
                            className="w-full h-14 rounded-2xl bg-brand text-white font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.99] transition-transform">
                            <LucidePlus className="w-5 h-5" /> 새 대회 만들기
                        </button>
                        <section>
                            <SectionTitle>우리 매장 대회</SectionTitle>
                            <Card className="overflow-hidden">
                                {tournamentsLoading ? (
                                    <p className="p-8 text-center text-black/40 text-sm">불러오는 중…</p>
                                ) : tournaments.length === 0 ? (
                                    <p className="p-8 text-center text-black/40 text-sm">아직 연 대회가 없어요. 위 버튼으로 첫 대회를 만들어 보세요.</p>
                                ) : (
                                    <ul className="divide-y divide-black/[0.06]">
                                        {tournaments.map((t) => {
                                            const st = TOURNAMENT_STATUS[t.status] ?? TOURNAMENT_STATUS.recruiting;
                                            return (
                                                <li key={t.id} className="px-4 py-3.5 flex items-center gap-3">
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block font-bold text-[15px] truncate">{t.title}</span>
                                                        <span className="block text-[12.5px] text-black/50 tabular-nums">
                                                            {t.startDate ? KST_MD.format(new Date(t.startDate)) : "-"} · {t.gameType === "4c" ? "4구" : t.gameType === "3c" ? "3쿠션" : t.gameType} · 참가 {t.participants}/{t.maxPlayers}명
                                                        </span>
                                                    </span>
                                                    <span className={`shrink-0 px-2 py-1 rounded-lg text-[12px] font-bold ${st.cls}`}>{st.label}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </Card>
                        </section>
                    </>
                )}

                {tab === "promo" && (
                    <>
                        <Card className="p-6 text-center">
                            <div className="flex flex-col items-center">
                                <div className="p-3 bg-white rounded-2xl border border-black/[0.06]">
                                    <QRCodeSVG value={joinUrl} size={180} />
                                </div>
                                <h3 className="mt-4 font-bold text-[17px]">매장 QR 코드</h3>
                                <p className="text-[13px] text-black/55 mt-1">카운터·테이블에 붙여 두면 손님이 찍고 바로 가입해요</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-5">
                                <Button onClick={handleDownloadPoster} disabled={isGeneratingPoster} className="h-12 bg-brand text-white hover:bg-brand-strong rounded-xl text-[14px] font-bold">
                                    <LucideDownload className="w-4 h-4 mr-1.5" />{isGeneratingPoster ? "만드는 중…" : "포스터 저장"}
                                </Button>
                                <Button onClick={handleCopyLink} variant="outline" className="h-12 border-brand text-brand hover:bg-brand/[0.06] rounded-xl text-[14px] font-bold">
                                    {copied ? <LucideCheck className="w-4 h-4 mr-1.5" /> : <LucideCopy className="w-4 h-4 mr-1.5" />}{copied ? "복사됨" : "링크 복사"}
                                </Button>
                            </div>
                            <p className="mt-3 text-[11.5px] text-black/40 break-all">{joinUrl}</p>
                        </Card>

                        {/* 프리미엄 안내 — 웹에서, 아직 프리미엄이 아닐 때만. 앱 안에서는 구독 권유·가격을 보이지 않는다(감사 S9) */}
                        {!native && isBasic && (
                            <div className="rounded-[1.25rem] bg-[var(--house-green)] p-6 shadow-[0_8px_30px_rgba(30,57,50,0.25)]">
                                <span className="text-[#cba258] text-[12px] font-bold">랭큐 멤버십</span>
                                <h3 className="text-[20px] font-bold text-white mt-0.5">프리미엄 멤버십</h3>
                                <ul className="mt-4 space-y-3">
                                    {[
                                        ["데이터 소유권", "회원 명부·방문 데이터 엑셀 다운로드"],
                                        ["스마트 마케팅", "수신 동의 회원 대상 단체 문자 준비"],
                                        ["상세 분석 리포트", "매장 방문 패턴 분석"],
                                    ].map(([title, desc]) => (
                                        <li key={title} className="flex gap-3">
                                            <span className="mt-0.5 w-5 h-5 rounded-full bg-[#cba258]/[0.15] flex items-center justify-center shrink-0"><LucideCheck className="w-3 h-3 text-[#cba258]" /></span>
                                            <span><span className="block text-[14px] font-bold text-white">{title}</span><span className="block text-[12.5px] text-white/60">{desc}</span></span>
                                        </li>
                                    ))}
                                </ul>
                                <Button onClick={() => setLocation("/partner/subscription")} className="mt-5 w-full h-14 bg-white hover:bg-white/90 text-brand text-[16px] font-bold rounded-full">
                                    프리미엄 1개월 무료 체험 🎁
                                </Button>
                                <p className="mt-2 text-[12px] text-center text-white/50">30일 무료 체험 · 언제든 해지 가능</p>
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* 아래 탭 — 엄지가 닿는 곳 */}
            <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-black/[0.07]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
                <div className="max-w-lg mx-auto grid grid-cols-4">
                    {TABS.map((t) => (
                        <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
                            className={`h-16 flex flex-col items-center justify-center gap-1 text-[11.5px] font-bold ${tab === t.id ? "text-brand" : "text-black/40"}`}>
                            <t.icon className="w-[22px] h-[22px]" weight={tab === t.id ? "fill" : "regular"} />
                            {t.label}
                        </button>
                    ))}
                </div>
            </nav>

            {/* 회원 상세 */}
            <Sheet open={!!openMember} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
                <SheetContent side="bottom" className="rounded-t-[1.5rem] p-0 max-h-[88vh] flex flex-col">
                    {openMember && (
                        <>
                            <div className="px-5 pt-5 pb-3">
                                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/10" />
                                <div className="flex items-center gap-3 pr-6">
                                    <span className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center text-[18px] font-black text-brand">{openMember.name.slice(0, 1)}</span>
                                    <div className="min-w-0">
                                        <SheetTitle className="text-[18px] font-black truncate">{openMember.name}</SheetTitle>
                                        <SheetDescription className="text-[13px] text-black/50 tabular-nums">
                                            {isRealPhone(openMember.phone) ? openMember.phone : "소셜 로그인 회원"} · 가입 {KST_YMD.format(new Date(openMember.createdAt))}
                                        </SheetDescription>
                                    </div>
                                </div>
                                {isRealPhone(openMember.phone) && (
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <a href={`tel:${openMember.phone}`} className="h-11 rounded-xl bg-brand text-white flex items-center justify-center gap-1.5 text-[14px] font-bold">
                                            <LucidePhone className="w-4 h-4" /> 전화
                                        </a>
                                        <a href={`sms:${openMember.phone}`} className="h-11 rounded-xl border border-black/10 flex items-center justify-center gap-1.5 text-[14px] font-bold">
                                            <LucideMessageSquare className="w-4 h-4" /> 문자
                                        </a>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-6 space-y-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}>
                                <div className="grid grid-cols-3 gap-2">
                                    {([
                                        ["마지막 방문", lastVisitLabel(openMember.lastVisitedAt)],
                                        ["누적 방문", `${openMember.visitCount}회`],
                                        ["이번 달 게임", `${openMember.monthlyGameCount}판`],
                                        ["3쿠션 에버", Number(openMember.avg3c || 0).toFixed(3)],
                                        ["3쿠션 핸디", openMember.handi3c ?? "-"],
                                        ["4구 핸디", openMember.handi4c ?? "-"],
                                    ] as [string, React.ReactNode][]).map(([label, v]) => (
                                        <div key={label} className="rounded-xl bg-black/[0.035] px-3 py-2.5">
                                            <p className="text-[11px] font-bold text-black/45">{label}</p>
                                            <p className="mt-0.5 text-[15px] font-bold tabular-nums">{v}</p>
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <p className="text-[12.5px] font-bold text-black/55 mb-1.5">사장님 메모 <span className="font-medium text-black/35">(회원에게는 보이지 않아요)</span></p>
                                    <Textarea value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)} maxLength={300}
                                        placeholder="예) 화·목 저녁 단골, 4구 선호, 음료는 아메리카노"
                                        className="min-h-[88px] text-[14px] bg-white" />
                                    <Button className="mt-2 w-full h-11 bg-brand hover:bg-brand-strong text-white font-bold rounded-xl"
                                        disabled={saveMemo.isPending || memoDraft.trim() === (openMember.memo ?? "")}
                                        onClick={() => saveMemo.mutate({ id: openMember.id, memo: memoDraft })}>
                                        {saveMemo.isPending ? "저장 중…" : "메모 저장"}
                                    </Button>
                                </div>
                                {openMember.marketingAgree && <p className="text-[12px] text-black/45">마케팅 정보 수신에 동의한 회원입니다.</p>}
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {/* 단체 문자 — 수신 동의 회원 번호 복사 */}
            <Sheet open={showSmsSheet} onOpenChange={setShowSmsSheet}>
                <SheetContent side="bottom" className="rounded-t-[1.5rem] px-5 pt-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-black/10" />
                    <SheetTitle className="text-[18px] font-black">단체 문자</SheetTitle>
                    <SheetDescription className="text-[13px] text-black/55 mt-1">
                        광고성 문자는 <b>수신 동의한 회원</b>에게만 보낼 수 있어요(정보통신망법). 번호를 복사해 쓰시는 문자 앱에 붙여 넣으세요 — 문자 앞에 '(광고)'와 수신거부 방법을 꼭 넣어 주세요.
                    </SheetDescription>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                        {([["all", "수신 동의 전체"], ["dormant", "30일+ 미방문"]] as const).map(([k, label]) => (
                            <button key={k} onClick={() => setSmsTarget(k)}
                                className={`h-12 rounded-xl text-[14px] font-bold border ${smsTarget === k ? "border-brand bg-brand/[0.06] text-brand" : "border-black/10 text-black/65"}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-3 text-[13px] text-black/60 tabular-nums">대상 <b className="text-brand">{smsTargets.length}</b>명</p>
                    <Button className="mt-3 w-full h-12 bg-brand hover:bg-brand-strong text-white font-bold rounded-xl" disabled={smsTargets.length === 0} onClick={copySmsNumbers}>
                        <LucideCopy className="w-4 h-4 mr-1.5" /> 번호 {smsTargets.length}개 복사
                    </Button>
                </SheetContent>
            </Sheet>

            {/* 포스터 캡처용(화면 밖) */}
            <div className="absolute top-0 left-[-9999px]" aria-hidden>
                <div
                    ref={posterRef}
                    style={{
                        width: "400px", height: "600px", background: "#141416",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        padding: "40px", fontFamily: "sans-serif", position: "relative", overflow: "hidden",
                    }}
                >
                    <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, background: "#006241", opacity: 0.12, borderRadius: "50%" }} />
                    <div style={{ position: "absolute", bottom: -50, left: -50, width: 200, height: 200, background: "#006241", opacity: 0.06, borderRadius: "50%" }} />
                    <div style={{ textAlign: "center", marginBottom: "40px", zIndex: 10 }}>
                        <div style={{ fontSize: "14px", fontWeight: "bold", color: "#006241", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px" }}>
                            RANKUE PARTNER
                        </div>
                        <h1 style={{ fontSize: "32px", fontWeight: "900", color: "white", lineHeight: "1.2", textShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>
                            {store.name}
                        </h1>
                    </div>
                    <div style={{ background: "white", padding: "20px", borderRadius: "24px", boxShadow: "0 20px 50px rgba(0,0,0,0.5)", marginBottom: "40px", zIndex: 10 }}>
                        <QRCodeSVG value={joinUrl} size={220} level="H" includeMargin={true} />
                    </div>
                    <div style={{ textAlign: "center", zIndex: 10 }}>
                        <p style={{ fontSize: "18px", fontWeight: "bold", color: "white", marginBottom: "8px" }}>QR 스캔하고 내 점수 기록하기</p>
                        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>3초 만에 회원 등록 완료!</p>
                    </div>
                    <div style={{ position: "absolute", bottom: "30px", fontSize: "12px", fontWeight: "900", color: "rgba(255,255,255,0.1)", letterSpacing: "4px" }}>
                        RANKUE
                    </div>
                </div>
            </div>
        </div>
    );
}
