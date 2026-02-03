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
} from "lucide-react";
import { HiqStore } from "../../../../shared/schema";
import { useRef, useState, useMemo } from "react";
import * as XLSX from 'xlsx';
import { apiRequest } from "@/lib/queryClient";
import html2canvas from "html2canvas";
import { LucideLock as LockIcon } from "lucide-react";

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

    const handleLogout = () => {
        document.cookie = "hiq_partner_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
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

    if (isStoreLoading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/50">Loading...</div>;
    if (!store) return <div className="min-h-screen bg-[#050505] text-white p-6">Store not found</div>;

    const joinUrl = `${window.location.origin}/join?store=${store.id}`;

    return (
        <div className="min-h-screen bg-[#050505] text-white font-sans pb-24">
            {/* 1. Header & Pulse */}
            <div className="bg-gradient-to-b from-emerald-900/20 to-[#050505] p-6 pb-2 rounded-b-[2rem]">
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#10b981] rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/20">
                            <LucideStore className="w-5 h-5 text-black" />
                        </div>
                        <div>
                            <h1 className="text-lg font-black tracking-tight">{store.name}</h1>
                            <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider block">Owner Dashboard</span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setLocation("/partner/settings")} className="p-2 bg-white/5 rounded-full hover:bg-white/10" aria-label="매장 정보 수정">
                            <LucideEdit className="w-4 h-4 text-white/40" />
                        </button>
                        <button onClick={handleLogout} className="p-2 bg-white/5 rounded-full hover:bg-white/10" aria-label="로그아웃">
                            <LucideLogOut className="w-4 h-4 text-white/40" />
                        </button>
                    </div>
                </div>

                {/* Today's Pulse */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="bg-[#1a1a1a] p-5 rounded-[1.5rem] border border-white/5 relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10"><LucideUsers size={40} /></div>
                        <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Today Visitors</span>
                        <div className="mt-2 flex items-baseline gap-1">
                            <span className="text-3xl font-black text-white">{stats?.visitsToday || 0}</span>
                            <span className="text-xs text-white/30">명</span>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                        className="bg-[#1a1a1a] p-5 rounded-[1.5rem] border border-white/5 relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-3 opacity-10"><LucideUserPlus size={40} /></div>
                        <span className="text-[10px] text-emerald-500/80 font-bold uppercase tracking-widest">New Signups</span>
                        <div className="mt-2 flex items-baseline gap-1">
                            <span className="text-3xl font-black text-emerald-400">{stats?.newToday || 0}</span>
                            <span className="text-xs text-emerald-500/50">명</span>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* 1.5. Tournament Banner (The Flower of the Platform) */}
            <div className="px-6 mt-4 mb-6">
                <button
                    onClick={() => setLocation("/partner/create-tournament")}
                    className="w-full relative overflow-hidden group rounded-[2.5rem] shadow-2xl shadow-emerald-900/40"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-500 group-hover:scale-105" />
                    <div className="relative z-10 p-7 flex items-center justify-between">
                        <div className="text-left space-y-3">
                            <div className="inline-block bg-white/20 backdrop-blur-md border border-white/10 rounded-lg px-3 py-1 text-[11px] font-bold text-white tracking-wide">
                                우리 매장 이벤트
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white leading-tight mb-1">매장 대회 개최하기</h2>
                                <p className="text-sm text-white/90 font-medium">3분 만에 대회 만들고 대진표 자동 생성!</p>
                            </div>
                        </div>
                        <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
                            <LucideTrophy className="w-8 h-8 text-yellow-300 drop-shadow-md" />
                        </div>
                    </div>
                </button>
            </div>

            {/* 2. Member DB Management */}
            <div className="px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <span className="w-1 h-4 bg-emerald-500 rounded-full" />
                        회원 관리
                    </h2>
                    <span className="text-xs text-white/40 font-mono">Total: {stats?.totalMembers || 0}</span>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <Button
                        onClick={handleDownloadExcel}
                        className="h-12 bg-[#1a1a1a] hover:bg-[#252525] text-white border border-white/10 rounded-xl flex items-center justify-center gap-2"
                    >
                        {store.subscriptionTier === "BASIC" ? <LockIcon className="w-4 h-4 text-white/20" /> : <LucideDownload className="w-4 h-4 text-emerald-500" />}
                        <span className={`text-sm font-bold ${store.subscriptionTier === "BASIC" ? 'text-white/40' : ''}`}>엑셀 저장</span>
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
                        className="h-12 bg-[#1a1a1a] hover:bg-[#252525] text-white border border-white/10 rounded-xl flex items-center justify-center gap-2"
                    >
                        {store.subscriptionTier === "BASIC" ? <LockIcon className="w-4 h-4 text-white/20" /> : <LucideMessageSquare className="w-4 h-4 text-emerald-500" />}
                        <span className={`text-sm font-bold ${store.subscriptionTier === "BASIC" ? 'text-white/40' : ''}`}>단체 문자</span>
                    </Button>
                </div>

                {/* Member List */}
                <div className="bg-[#111] rounded-[1.5rem] border border-white/5 overflow-hidden">
                    <div className="p-4 border-b border-white/5">
                        <div className="relative">
                            <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <Input
                                placeholder="이름 또는 전화번호 뒷자리"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-[#050505] border-white/10 text-white placeholder:text-white/20 h-10 rounded-lg focus:ring-emerald-500/50"
                            />
                        </div>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        {filteredMembers.length === 0 ? (
                            <div className="p-8 text-center text-white/20 text-sm">검색 결과가 없습니다.</div>
                        ) : (
                            filteredMembers.slice(0, 50).map((member) => (
                                <div key={member.id} className="p-4 border-b border-white/5 last:border-0 flex items-center justify-between hover:bg-white/5 transition-colors">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-white">{member.name}</span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${member.rating4c >= 1000 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-white/10 text-white/50'
                                                }`}>
                                                {getTierName(member.rating4c)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-white/30">
                                            <span>{member.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3')}</span>
                                            <span>•</span>
                                            <span>Avg {Number(member.average).toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <a href={`tel:${member.phone}`} aria-label={`${member.name}에게 전화 걸기`} className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors">
                                            <LucidePhone size={14} />
                                        </a>
                                        <a href={`sms:${member.phone}`} aria-label={`${member.name}에게 문자 보내기`} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white transition-colors">
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
                        <span className="w-1 h-4 bg-emerald-500 rounded-full" />
                        우리 매장 랭킹
                    </h2>
                </div>

                <div className="bg-[#111] rounded-[1.5rem] border border-white/5 p-1">
                    <div className="grid grid-cols-2 p-1 gap-1 mb-2 bg-[#050505] rounded-2xl">
                        <button
                            onClick={() => setRankingTab("visit")}
                            className={`py-2 text-xs font-bold rounded-xl transition-all ${rankingTab === "visit" ? "bg-[#1a1a1a] text-white shadow" : "text-white/30 hover:text-white/60"
                                }`}
                        >
                            방문 랭킹 (VIP)
                        </button>
                        <button
                            onClick={() => setRankingTab("skill")}
                            className={`py-2 text-xs font-bold rounded-xl transition-all ${rankingTab === "skill" ? "bg-[#1a1a1a] text-emerald-400 shadow" : "text-white/30 hover:text-white/60"
                                }`}
                        >
                            실력 랭킹 (Avg)
                        </button>
                    </div>

                    <div className="px-3 pb-3">
                        {rankedMembers.map((member, idx) => (
                            <div key={member.id} className="flex items-center py-3 border-b border-white/5 last:border-0">
                                <span className={`w-6 text-center font-black text-sm ${idx === 0 ? "text-yellow-500" :
                                    idx === 1 ? "text-slate-400" :
                                        idx === 2 ? "text-amber-700" : "text-white/20"
                                    }`}>
                                    {idx + 1}
                                </span>
                                <div className="ml-3 flex-1">
                                    <div className="text-sm font-bold text-white">{member.name}</div>
                                    <div className="text-[10px] text-white/30">
                                        {rankingTab === "visit" ? `이번 달 ${member.monthlyGameCount}게임` : `Average ${Number(member.average).toFixed(3)}`}
                                    </div>
                                </div>
                                <div className="text-right">
                                    {rankingTab === "visit" ? (
                                        <div className="px-2 py-1 rounded bg-white/5 text-xs font-bold text-white/70">
                                            {member.visitCount}회 누적
                                        </div>
                                    ) : (
                                        <div className="px-2 py-1 rounded bg-emerald-500/10 text-xs font-bold text-emerald-500">
                                            {member.handi4c}점
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                        {rankedMembers.length === 0 && <div className="text-center py-6 text-white/20 text-xs">데이터가 없습니다</div>}
                    </div>
                </div>
            </div>

            {/* QR Code Mini Access */}
            <div className="px-6 py-4 mb-8">
                <div className="bg-white rounded-[1.5rem] p-6 text-center text-black shadow-xl relative overflow-hidden">
                    <div ref={qrRef} className="flex flex-col items-center bg-white p-2">
                        <QRCodeSVG
                            value={joinUrl}
                            size={160}
                        />
                        <div className="mt-4">
                            <h3 className="font-bold text-lg leading-tight">매장 QR 코드</h3>
                            <p className="text-xs text-gray-500 mt-1">고객 등록용</p>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-6">
                        <Button
                            onClick={handleDownloadPoster}
                            disabled={isGeneratingPoster}
                            className="flex-1 bg-black text-white hover:bg-gray-800 h-10 rounded-xl text-xs font-bold"
                        >
                            <LucideDownload className="w-3 h-3 mr-1.5" />
                            {isGeneratingPoster ? "생성 중..." : "포스터 저장"}
                        </Button>
                        <Button
                            onClick={handleCopyLink}
                            variant="outline"
                            className="flex-1 border-gray-200 hover:bg-gray-50 h-10 rounded-xl text-xs font-bold"
                        >
                            {copied ? <LucideCheck className="w-3 h-3 mr-1.5 text-green-600" /> : <LucideCopy className="w-3 h-3 mr-1.5" />}
                            {copied ? "복사됨" : "링크 복사"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Premium Gating Banner */}
            <div className="px-6 mb-8">
                <div className="rounded-[3rem] bg-[#141414] border border-white/5 p-8 relative overflow-hidden shadow-2xl">
                    {/* Neon Glow Accents */}
                    <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-[#10b981] opacity-[0.08] blur-[100px] rounded-full" />
                    <div className="absolute bottom-[-50px] left-[-50px] w-64 h-64 bg-[#10b981] opacity-[0.05] blur-[100px] rounded-full" />

                    <div className="relative z-10">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex flex-col">
                                <span className="text-[#10b981] text-[10px] font-black tracking-[0.2em] uppercase mb-1">Rankue Membership</span>
                                <h3 className="text-2xl font-black text-white leading-tight">
                                    프리미엄 멤버십
                                </h3>
                            </div>
                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                                <LucideTrophy className="w-6 h-6 text-[#10b981]" />
                            </div>
                        </div>

                        <div className="space-y-6 mb-10">
                            {[
                                { title: "데이터 소유권", sub: "EXCEL DATA EXPORT", desc: "회원 명부 및 방문 데이터 엑셀 다운로드" },
                                { title: "스마트 마케팅", sub: "PUSH & SMS CAMPAIGN", desc: "전체 회원 대상 앱 푸시 및 이벤트 문자 발송" },
                                { title: "상세 분석 리포트", sub: "STORE INSIGHTS", desc: "매장별 방문 패턴 및 매출 추이 정밀 분석" }
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4">
                                    <div className="mt-1 w-5 h-5 rounded-full bg-[#10b981]/10 flex items-center justify-center flex-shrink-0">
                                        <LucideCheck className="w-3 h-3 text-[#10b981]" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-sm font-bold text-white">{item.title}</span>
                                            <span className="text-[9px] font-bold text-white/20 tracking-wider uppercase">{item.sub}</span>
                                        </div>
                                        <p className="text-xs text-white/40 leading-relaxed font-medium">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-3">
                            <Button
                                onClick={() => setLocation("/partner/subscription")}
                                className="w-full h-16 bg-white hover:bg-white/90 text-black text-lg font-black rounded-3xl transition-all shadow-xl active:scale-[0.97]"
                            >
                                프리미엄 1개월 무료 체험 🎁
                            </Button>
                            <p className="text-[10px] text-center text-white/30 font-medium">
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
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                            className="bg-[#1a1a1a] rounded-2xl w-full max-w-sm p-6 border border-white/10"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white">단체 문자 발송</h3>
                                <button onClick={() => setShowSmsModal(false)} className="text-white/40 hover:text-white">✕</button>
                            </div>

                            <div className="space-y-3 mb-6">
                                <Button variant="outline" className="w-full justify-start h-12 border-white/10 text-white hover:bg-white/5">
                                    <LucideUsers className="w-4 h-4 mr-2" />
                                    전체 회원 ({stats?.totalMembers}명)
                                </Button>
                                <Button variant="outline" className="w-full justify-start h-12 border-white/10 text-white hover:bg-white/5">
                                    <LucideTrendingUp className="w-4 h-4 mr-2" />
                                    최근 미방문자 (30일+)
                                </Button>
                            </div>

                            <div className="bg-yellow-500/10 p-3 rounded-lg mb-4">
                                <p className="text-xs text-yellow-500 font-medium">⚠️ 실제 발송은 포인트가 필요합니다.<br />현재는 데모 모드입니다.</p>
                            </div>

                            <Button className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-black font-bold" onClick={() => setShowSmsModal(false)}>
                                닫기
                            </Button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
