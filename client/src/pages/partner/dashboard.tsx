import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
    LucideStore, LucideLogOut, LucideUserPlus, LucideUsers,
    LucideDownload, LucideMessageSquare, LucideTrophy,
    LucideSearch, LucidePhone, LucideTrendingUp, LucideEdit, LucideCopy, LucideCheck
} from "@/lib/icons";
import { HiqStore } from "../../../../shared/schema";
import { useRef, useState, useMemo } from "react";
import * as XLSX from 'xlsx';
import { apiRequest, queryClient } from "@/lib/queryClient";
import html2canvas from "html2canvas";
import { LucideLock as LockIcon } from "@/lib/icons";

type MemberWithStats = {
    id: string;
    name: string;
    phone: string;
    handi4c: number;
    rating4c: number;
    average: number;
    visitCount: number;
    lastVisitedAt: string;
    memo?: string;
    monthlyGameCount: number;
};

type AdminStats = {
    totalMembers: number;
    visitsToday: number;
    visitsYesterday: number;
    newToday: number;
};

export default function PartnerDashboard() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const qrRef = useRef<HTMLDivElement>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [rankingTab, setRankingTab] = useState<"skill" | "visit">("visit");
    const [showSmsModal, setShowSmsModal] = useState(false);
    const posterRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPoster, setIsGeneratingPoster] = useState(false);

    // 1. Fetch Store
    const { data: store, isLoading: isStoreLoading } = useQuery<HiqStore>({
        queryKey: ["/api/hiq/partner/store"],
    });

    // 2. Fetch Stats
    const { data: stats } = useQuery<AdminStats>({
        queryKey: ["/api/hiq/partner/stats"],
        enabled: !!store,
    });

    // 3. Fetch Members
    const { data: members = [] } = useQuery<MemberWithStats[]>({
        queryKey: ["/api/hiq/partner/members"],
        enabled: !!store,
    });

    const [copied, setCopied] = useState(false);

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

    const handleCopyLink = () => {
        const joinUrl = `${window.location.origin}/join?store=${store?.id}`;
        navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadPoster = async () => {
        if (!store || !posterRef.current) return;
        setIsGeneratingPoster(true);

        try {
            // Wait a bit for images to load (if any)
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(posterRef.current, {
                scale: 2, // 2x resolution for better quality
                backgroundColor: "#000000",
                logging: false,
                useCORS: true
            });

            const link = document.createElement("a");
            link.download = `Rankue_Poster_${store.slug}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        } catch (err) {
            console.error("Poster Generation Failed:", err);
            alert("포스터 생성 실패. 다시 시도해주세요.");
        } finally {
            setIsGeneratingPoster(false);
        }
    };


    // Excel Export
    const handleDownloadExcel = () => {
        if (!store) return;
        if (store.subscriptionTier === "BASIC") {
            toast({
                title: "프리미엄 기능입니다 🔒",
                description: "회원 데이터 엑셀 다운로드는 프리미엄 멤버십에서만 제공됩니다.",
                variant: "destructive"
            });
            return;
        }
        if (!members.length) return;

        const excelData = members.map(m => ({
            "회원명": m.name,
            "전화번호": m.phone,
            "등급": getTierName(m.rating4c), // Add helper
            "현재 핸디": m.handi4c,
            "총 방문수": m.visitCount,
            "최근 방문": m.lastVisitedAt ? new Date(m.lastVisitedAt).toISOString().split('T')[0] : '-',
            "평균 에버": m.average,
            "이번달 게임": m.monthlyGameCount
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "회원명부");
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
        XLSX.writeFile(wb, `${dateStr}_회원명부.xlsx`);
    };

    // Helper: Tier
    const getTierName = (rating: number) => {
        if (rating >= 2000) return "Diamond";
        if (rating >= 1500) return "Platinum";
        if (rating >= 1000) return "Gold";
        if (rating >= 500) return "Silver";
        return "Bronze";
    };

    // Filtered Members for Search
    const filteredMembers = useMemo(() => {
        if (!searchQuery) return members;
        const q = searchQuery.toLowerCase();
        return members.filter(m =>
            m.name.toLowerCase().includes(q) ||
            m.phone.includes(q)
        );
    }, [members, searchQuery]);

    // Ranked Members
    const rankedMembers = useMemo(() => {
        const sorted = [...members];
        if (rankingTab === "skill") {
            // Sort by Average (Descending)
            return sorted.sort((a, b) => (b.average || 0) - (a.average || 0)).slice(0, 10);
        } else {
            // Sort by Monthly Game Count (Descending)
            return sorted.sort((a, b) => b.monthlyGameCount - a.monthlyGameCount).slice(0, 10);
        }
    }, [members, rankingTab]);

    if (isStoreLoading) return <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center text-black/55">Loading...</div>;
    if (!store) return <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] p-6">Store not found</div>;

    const joinUrl = `${window.location.origin}/join?store=${store.id}`;

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans pb-24">
            {/* 1. Header & Pulse */}
            <div className="bg-gradient-to-b from-[#006241]/[0.08] to-[#f2f0eb] p-6 pb-2 rounded-b-[2rem]">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#006241] rounded-xl flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                            <LucideStore className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight">{store.name}</h1>
                            <span className="text-[10px] text-[#006241] font-bold uppercase tracking-wider block">Owner Dashboard</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setLocation("/partner/settings")} className="p-2 bg-black/[0.04] rounded-full hover:bg-black/[0.06]" aria-label="매장 정보 수정">
                            <LucideEdit className="w-4 h-4 text-black/40" />
                        </button>
                        <button onClick={handleLogout} className="p-2 bg-black/[0.04] rounded-full hover:bg-black/[0.06]" aria-label="로그아웃">
                            <LucideLogOut className="w-4 h-4 text-black/40" />
                        </button>
                    </div>
                </div>

                {/* Today's Pulse */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-5 rounded-[1.5rem] shadow-[0_1px_2px_rgba(0,0,0,0.05)] relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-[0.06]"><LucideUsers size={40} /></div>
                        <span className="text-[10px] text-black/55 font-bold uppercase tracking-widest">Today Visitors</span>
                        <div className="mt-2 flex items-baseline gap-1">
                            <span className="text-3xl font-black text-[rgba(0,0,0,0.87)]">{stats?.visitsToday || 0}</span>
                            <span className="text-xs text-black/40">명</span>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        className="bg-white p-5 rounded-[1.5rem] shadow-[0_1px_2px_rgba(0,0,0,0.05)] relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-[0.06] text-[#006241]"><LucideUserPlus size={40} /></div>
                        <span className="text-[10px] text-[#006241]/80 font-bold uppercase tracking-widest">New Signups</span>
                        <div className="mt-2 flex items-baseline gap-1">
                            <span className="text-3xl font-black text-[#006241]">{stats?.newToday || 0}</span>
                            <span className="text-xs text-[#006241]/60">명</span>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* 1.5. Tournament Banner (The Flower of the Platform) */}
            <div className="px-6 mt-4 mb-6">
                <button
                    onClick={() => setLocation("/partner/create-tournament")}
                    className="w-full relative overflow-hidden group rounded-[2.5rem] shadow-[0_4px_16px_rgba(0,98,65,0.18)]"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-[#006241] to-[#00754A] transition-all duration-500 group-hover:scale-105" />
                    <div className="relative z-10 p-7 flex items-center justify-between">
                        <div className="text-left space-y-3">
                            <div className="inline-block bg-white/20 rounded-lg px-3 py-1 text-[11px] font-bold text-white tracking-wide">
                                우리 매장 이벤트
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white leading-tight mb-1">매장 대회 개최하기</h2>
                                <p className="text-sm text-white/90 font-medium">3분 만에 대회 만들고 대진표 자동 생성!</p>
                            </div>
                        </div>
                        <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shadow-inner">
                            <LucideTrophy className="w-8 h-8 text-[#cba258] drop-shadow-md" />
                        </div>
                    </div>
                </button>
            </div>

            {/* 2. Member DB Management */}
            <div className="px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="w-1 h-4 bg-[#006241] rounded-full" />
                        회원 관리
                    </h2>
                    <span className="text-xs text-black/55 font-mono">Total: {stats?.totalMembers || 0}</span>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <Button
                        onClick={handleDownloadExcel}
                        className="h-12 bg-white hover:bg-black/[0.04] text-[rgba(0,0,0,0.87)] rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-center gap-2"
                    >
                        {store.subscriptionTier === "BASIC" ? <LockIcon className="w-4 h-4 text-black/40" /> : <LucideDownload className="w-4 h-4 text-[#006241]" />}
                        <span className={`text-sm font-bold ${store.subscriptionTier === "BASIC" ? 'text-black/40' : ''}`}>엑셀 저장</span>
                    </Button>
                    <Button
                        onClick={() => {
                            if (store.subscriptionTier === "BASIC") {
                                toast({
                                    title: "프리미엄 기능입니다 🔒",
                                    description: "단체 문자 가이드 및 푸시 알림은 프리미엄 멤버십 전용입니다.",
                                    variant: "destructive"
                                });
                                return;
                            }
                            setShowSmsModal(true);
                        }}
                        className="h-12 bg-white hover:bg-black/[0.04] text-[rgba(0,0,0,0.87)] rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-center gap-2"
                    >
                        {store.subscriptionTier === "BASIC" ? <LockIcon className="w-4 h-4 text-black/40" /> : <LucideMessageSquare className="w-4 h-4 text-[#006241]" />}
                        <span className={`text-sm font-bold ${store.subscriptionTier === "BASIC" ? 'text-black/40' : ''}`}>단체 문자</span>
                    </Button>
                </div>

                {/* Member List */}
                <div className="bg-white rounded-[1.5rem] shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
                    <div className="p-4 border-b border-black/10">
                        <div className="relative">
                            <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                            <Input
                                placeholder="이름 또는 전화번호 뒷자리"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-black/[0.04] border-black/[0.08] text-[rgba(0,0,0,0.87)] placeholder:text-black/40 h-10 rounded-lg focus:ring-[#006241]/40"
                            />
                        </div>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        {filteredMembers.length === 0 ? (
                            <div className="p-8 text-center text-black/40 text-sm">검색 결과가 없습니다.</div>
                        ) : (
                            filteredMembers.slice(0, 50).map((member) => (
                                <div key={member.id} className="p-4 border-b border-black/10 last:border-0 flex items-center justify-between hover:bg-black/[0.04] transition-colors">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-[rgba(0,0,0,0.87)]">{member.name}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${member.rating4c >= 1000 ? 'bg-[#cba258]/[0.12] text-[#cba258]' : 'bg-black/[0.06] text-black/55'
                                                }`}>
                                                {getTierName(member.rating4c)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-black/55">
                                            <span>{member.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3')}</span>
                                            <span>•</span>
                                            <span>Avg {Number(member.average).toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <a href={`tel:${member.phone}`} aria-label={`${member.name}에게 전화 걸기`} className="w-8 h-8 rounded-full bg-[#006241]/10 flex items-center justify-center text-[#006241] hover:bg-[#006241] hover:text-white transition-colors">
                                            <LucidePhone size={14} />
                                        </a>
                                        <a href={`sms:${member.phone}`} aria-label={`${member.name}에게 문자 보내기`} className="w-8 h-8 rounded-full bg-black/[0.04] flex items-center justify-center text-black/60 hover:bg-black/[0.08] hover:text-[rgba(0,0,0,0.87)] transition-colors">
                                            <LucideMessageSquare size={14} />
                                        </a>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* 3. Store Ranking */}
            <div className="px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="w-1 h-4 bg-[#006241] rounded-full" />
                        우리 매장 랭킹
                    </h2>
                </div>

                <div className="bg-white rounded-[1.5rem] shadow-[0_1px_2px_rgba(0,0,0,0.05)] p-1">
                    <div className="grid grid-cols-2 p-1 gap-1 mb-2 bg-black/[0.04] rounded-2xl">
                        <button
                            onClick={() => setRankingTab("visit")}
                            className={`py-2 text-xs font-bold rounded-xl transition-all ${rankingTab === "visit" ? "bg-white text-[rgba(0,0,0,0.87)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-black/40 hover:text-black/70"
                                }`}
                        >
                            방문 랭킹 (VIP)
                        </button>
                        <button
                            onClick={() => setRankingTab("skill")}
                            className={`py-2 text-xs font-bold rounded-xl transition-all ${rankingTab === "skill" ? "bg-white text-[#006241] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-black/40 hover:text-black/70"
                                }`}
                        >
                            실력 랭킹 (Avg)
                        </button>
                    </div>

                    <div className="px-3 pb-3">
                        {rankedMembers.map((member, idx) => (
                            <div key={member.id} className="flex items-center py-3 border-b border-black/10 last:border-0">
                                <span className={`w-6 text-center font-black text-sm ${idx === 0 ? "text-[#cba258]" :
                                    idx === 1 ? "text-slate-500" :
                                        idx === 2 ? "text-amber-700" : "text-black/40"
                                    }`}>
                                    {idx + 1}
                                </span>
                                <div className="ml-3 flex-1">
                                    <div className="text-sm font-bold text-[rgba(0,0,0,0.87)]">{member.name}</div>
                                    <div className="text-[10px] text-black/55">
                                        {rankingTab === "visit" ? `이번 달 ${member.monthlyGameCount}게임` : `Average ${Number(member.average).toFixed(3)}`}
                                    </div>
                                </div>
                                <div className="text-right">
                                    {rankingTab === "visit" ? (
                                        <div className="px-2 py-1 rounded bg-black/[0.04] text-xs font-bold text-black/70">
                                            {member.visitCount}회 누적
                                        </div>
                                    ) : (
                                        <div className="px-2 py-1 rounded bg-[#006241]/10 text-xs font-bold text-[#006241]">
                                            {member.handi4c}점
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {rankedMembers.length === 0 && <div className="text-center py-6 text-black/40 text-xs">데이터가 없습니다</div>}
                    </div>
                </div>
            </div>

            {/* QR Code Mini Access */}
            <div className="px-6 py-4 mb-8">
                <div className="bg-white rounded-[1.5rem] p-6 text-center text-black shadow-[0_1px_2px_rgba(0,0,0,0.06)] relative overflow-hidden">
                    <div ref={qrRef} className="flex flex-col items-center bg-white p-2">
                        <QRCodeSVG
                            value={joinUrl}
                            size={160}
                        />
                        <div className="mt-4">
                            <h3 className="font-bold text-lg leading-tight text-[rgba(0,0,0,0.87)]">매장 QR 코드</h3>
                            <p className="text-xs text-black/55 mt-1">고객 등록용</p>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-6">
                        <Button
                            onClick={handleDownloadPoster}
                            disabled={isGeneratingPoster}
                            className="flex-1 bg-[#006241] text-white hover:bg-[#00553a] h-10 rounded-full text-xs font-bold"
                        >
                            <LucideDownload className="w-3 h-3 mr-1.5" />
                            {isGeneratingPoster ? "생성 중..." : "포스터 저장"}
                        </Button>
                        <Button
                            onClick={handleCopyLink}
                            variant="outline"
                            className="flex-1 bg-transparent border border-[#006241] text-[#006241] hover:bg-[#006241]/[0.06] h-10 rounded-full text-xs font-bold"
                        >
                            {copied ? <LucideCheck className="w-3 h-3 mr-1.5 text-[#006241]" /> : <LucideCopy className="w-3 h-3 mr-1.5" />}
                            {copied ? "복사됨" : "링크 복사"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Premium Gating Banner */}
            <div className="px-6 mb-8">
                <div className="rounded-[3rem] bg-[#1E3932] p-8 relative overflow-hidden shadow-[0_8px_30px_rgba(30,57,50,0.25)]">
                    {/* Warm Glow Accents */}
                    <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-[#cba258] opacity-[0.10] blur-[100px] rounded-full" />
                    <div className="absolute bottom-[-50px] left-[-50px] w-64 h-64 bg-[#006241] opacity-[0.25] blur-[100px] rounded-full" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex flex-col">
                                <span className="text-[#cba258] text-[10px] font-black tracking-[0.2em] uppercase mb-1">Rankue Membership</span>
                                <h3 className="text-2xl font-black text-white leading-tight">
                                    프리미엄 멤버십
                                </h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                                <LucideTrophy className="w-6 h-6 text-[#cba258]" />
                            </div>
                        </div>

                        <div className="space-y-6 mb-10">
                            {[
                                { title: "데이터 소유권", sub: "EXCEL DATA EXPORT", desc: "회원 명부 및 방문 데이터 엑셀 다운로드" },
                                { title: "스마트 마케팅", sub: "PUSH & SMS CAMPAIGN", desc: "전체 회원 대상 앱 푸시 및 이벤트 문자 발송" },
                                { title: "상세 분석 리포트", sub: "STORE INSIGHTS", desc: "매장별 방문 패턴 및 매출 추이 정밀 분석" }
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4">
                                    <div className="mt-1 w-5 h-5 rounded-full bg-[#cba258]/[0.15] flex items-center justify-center flex-shrink-0">
                                        <LucideCheck className="w-3 h-3 text-[#cba258]" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-sm font-bold text-white">{item.title}</span>
                                            <span className="text-[9px] font-bold text-white/40 tracking-wider uppercase">{item.sub}</span>
                                        </div>
                                        <p className="text-xs text-white/60 leading-relaxed font-medium">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-3">
                            <Button
                                onClick={() => setLocation("/partner/subscription")}
                                className="w-full h-16 bg-white hover:bg-white/90 text-[#006241] text-lg font-black rounded-full transition-all shadow-[0_2px_8px_rgba(0,0,0,0.12)] active:scale-[0.97]"
                            >
                                프리미엄 1개월 무료 체험 🎁
                            </Button>
                            <p className="text-[10px] text-center text-white/50 font-medium">
                                지금 신청하면 30일 무료 체험 제공 • 언제든 해지 가능
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hidden Poster Element for Capturing */}
            {store && (
                <div className="absolute top-0 left-[-9999px]">
                    <div
                        ref={posterRef}
                        style={{
                            width: '400px',
                            height: '600px',
                            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '40px',
                            fontFamily: 'sans-serif',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        {/* Deco Elements */}
                        <div style={{
                            position: 'absolute', top: -50, right: -50, width: 200, height: 200,
                            background: '#10b981', filter: 'blur(80px)', opacity: 0.2, borderRadius: '50%'
                        }} />
                        <div style={{
                            position: 'absolute', bottom: -50, left: -50, width: 200, height: 200,
                            background: '#10b981', filter: 'blur(80px)', opacity: 0.1, borderRadius: '50%'
                        }} />

                        {/* Store Name Header */}
                        <div style={{ textAlign: 'center', marginBottom: '40px', zIndex: 10 }}>
                            <div style={{
                                fontSize: '14px', fontWeight: 'bold', color: '#10b981',
                                textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '8px'
                            }}>
                                RANKUE PARTNER
                            </div>
                            <h1 style={{
                                fontSize: '32px', fontWeight: '900', color: 'white',
                                lineHeight: '1.2', textShadow: '0 4px 20px rgba(0,0,0,0.5)'
                            }}>
                                {store.name}
                            </h1>
                        </div>

                        {/* QR Box */}
                        <div style={{
                            background: 'white', padding: '20px', borderRadius: '24px',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.5)', marginBottom: '40px', zIndex: 10
                        }}>
                            <QRCodeSVG
                                value={joinUrl}
                                size={220}
                                level="H"
                                includeMargin={true}
                            />
                        </div>

                        {/* CTA Text */}
                        <div style={{ textAlign: 'center', zIndex: 10 }}>
                            <p style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>
                                QR 스캔하고 내 점수 기록하기
                            </p>
                            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                                3초 만에 회원 등록 완료!
                            </p>
                        </div>

                        {/* Footer Logo */}
                        <div style={{
                            position: 'absolute', bottom: '30px',
                            fontSize: '12px', fontWeight: '900', color: 'rgba(255,255,255,0.1)', letterSpacing: '4px'
                        }}>
                            RANKUE
                        </div>
                    </div>
                </div>
            )}

            {/* SMS Modal Mock */}
            <AnimatePresence>
                {showSmsModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                            className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-[rgba(0,0,0,0.87)]">단체 문자 발송</h3>
                                <button onClick={() => setShowSmsModal(false)} className="text-black/40 hover:text-[rgba(0,0,0,0.87)]">✕</button>
                            </div>

                            <div className="space-y-3 mb-6">
                                <Button variant="outline" className="w-full justify-start h-12 border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.04]">
                                    <LucideUsers className="w-4 h-4 mr-2" />
                                    전체 회원 ({stats?.totalMembers}명)
                                </Button>
                                <Button variant="outline" className="w-full justify-start h-12 border-black/10 text-[rgba(0,0,0,0.87)] hover:bg-black/[0.04]">
                                    <LucideTrendingUp className="w-4 h-4 mr-2" />
                                    최근 미방문자 (30일+)
                                </Button>
                            </div>

                            <div className="bg-amber-500/10 p-3 rounded-lg mb-4">
                                <p className="text-xs text-amber-600 font-medium">⚠️ 실제 발송은 포인트가 필요합니다.<br />현재는 데모 모드입니다.</p>
                            </div>

                            <Button className="w-full h-12 bg-[#006241] hover:bg-[#00553a] text-white font-bold rounded-full" onClick={() => setShowSmsModal(false)}>
                                닫기
                            </Button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
