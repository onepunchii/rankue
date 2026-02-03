import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideChevronLeft,
    LucideTrophy,
    LucideCoins,
    LucideDice5,
    LucideBomb,
    LucideSwords,
    LucideCheckCircle2,
    LucideSearch,
    LucideX,
    LucideHash,
    LucideUsers,
    LucideLoader2,
    LucideMapPin,
    LucideCalculator,
    LucideCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { COURSES } from "@/golf/data/golfCourses";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const formatMoney = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

export default function GolfNewGame() {
    const [location, setLocation] = useLocation();
    const searchParams = new URLSearchParams(window.location.search);
    const initialMode = searchParams.get("mode") || "match";

    const [step, setStep] = useState<'setup' | 'lobby' | 'join'>(initialMode === 'join' ? 'join' : 'setup');
    const [selectedGame, setSelectedGame] = useState<'stroke' | 'skins'>('stroke');
    const [stake, setStake] = useState<number>(10000);
    const [useOecd, setUseOecd] = useState(false);
    const [useDouble, setUseDouble] = useState(true);
    const [courseSearch, setCourseSearch] = useState("");
    const [isCourseSearchOpen, setIsCourseSearchOpen] = useState(false);
    const [selectedCourseData, setSelectedCourseData] = useState<any>(COURSES.find(c => c.name === "88CC") || COURSES[0]);
    const [selectedCourse, setSelectedCourse] = useState<string>("88CC");
    const [pinEntry, setPinEntry] = useState<string[]>([]);
    const [activeSession, setActiveSession] = useState<any>(null);

    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch me
    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"] });

    const filteredCourses = useMemo(() => {
        if (!courseSearch) return COURSES.filter(c => c.isRankue60).slice(0, 6);
        return COURSES.filter(c =>
            c.name.toLowerCase().includes(courseSearch.toLowerCase()) ||
            c.region.toLowerCase().includes(courseSearch.toLowerCase())
        ).slice(0, 15);
    }, [courseSearch]);

    // Create Match Mutation
    const createMatch = useMutation({
        mutationFn: async () => {
            if (!me?.id) {
                throw new Error("로그인이 필요합니다. 다시 로그인해주세요.");
            }
            if (!selectedCourse) {
                throw new Error("골프장을 선택해주세요.");
            }

            const data = await apiRequest("/api/hiq/golf/match/create", {
                method: "POST",
                body: {
                    hostId: me.id,
                    courseId: String(selectedCourseData?.id || ""),
                    courseName: selectedCourse,
                    gameMode: selectedGame,
                    stake: stake,
                    useOecd: useOecd,
                    useDouble: useDouble
                }
            });

            return data;
        },
        onSuccess: (data) => {
            setActiveSession(data);
            setStep('lobby');
            toast({ title: "방 생성 완료", description: `핀코드[${data.pinCode}] 대기실로 이동합니다.` });
        },
        onError: (e: any) => {
            toast({
                variant: "destructive",
                title: "방 만들기 실패",
                description: e.message
            });
            console.error("Create Match Error:", e);
        }
    });

    // Join Match Mutation
    const joinMatch = useMutation({
        mutationFn: async (pin: string) => {
            const data = await apiRequest("/api/hiq/golf/match/join", {
                method: "POST",
                body: {
                    pin,
                    memberId: me.id,
                    name: me.name
                }
            });
            return data;
        },
        onSuccess: (data) => {
            toast({ title: "입장 성공!", description: "대기실로 이동합니다." });
            setLocation(`/golf/game/${data.id}`);
        },
        onError: (e: any) => {
            toast({ variant: "destructive", title: "입장 실패", description: e.message });
            setPinEntry([]);
        }
    });

    // Status Polling for Lobby
    const { data: sessionInfo } = useQuery<any>({
        queryKey: ["/api/hiq/golf/match", activeSession?.id],
        enabled: !!activeSession && step === 'lobby',
        refetchInterval: 2000
    });

    useEffect(() => {
        if (sessionInfo?.status === 'playing') {
            setLocation(`/golf/game/${sessionInfo.id}`);
        }
    }, [sessionInfo, setLocation]);

    const handlePinPress = (num: string) => {
        if (pinEntry.length < 4) {
            const newPin = [...pinEntry, num];
            setPinEntry(newPin);
            if (newPin.length === 4) {
                joinMatch.mutate(newPin.join(""));
            }
        }
    };

    const handleBack = () => {
        if (step === 'setup' || step === 'join') {
            setLocation('/golf/dashboard');
        } else if (step === 'lobby') {
            setStep('setup');
        }
    };

    return (
        <div className="min-h-screen bg-[#09090b] text-white pb-32 font-sans relative">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-[#64DD17]/5 rounded-full blur-[128px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-[#64DD17]/5 rounded-full blur-[96px]" />
            </div>

            {/* Header */}
            <header className="px-6 pt-12 pb-4 relative z-10 flex items-center justify-between">
                <button onClick={handleBack} title="뒤로가기" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                    <LucideChevronLeft className="w-6 h-6" />
                </button>
                <div className="text-center">
                    <h1 className="text-2xl font-black italic tracking-tighter">
                        GAME <span className="text-[#64DD17]">SETUP</span>
                    </h1>
                    <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] mt-0.5">오늘의 승부를 설계하세요</p>
                </div>
                <div className="w-10" />
            </header>

            <main className="relative z-10 overflow-y-auto no-scrollbar">
                {/* Course Selection Modal */}
                <Dialog open={isCourseSearchOpen} onOpenChange={setIsCourseSearchOpen}>
                    <DialogContent className="max-w-md w-full h-[80vh] bg-[#0A0A0A] border-white/10 p-0 overflow-hidden flex flex-col [&>button]:hidden">
                        <div className="p-6 pb-4 border-b border-white/5 space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xl font-black text-white tracking-tighter">라운드 장소 선택</h2>
                                <button onClick={() => setIsCourseSearchOpen(false)} className="p-2 hover:bg-white/5 rounded-full text-white/40" title="닫기">
                                    <LucideX className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="relative">
                                <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="골프장 이름 또는 지역 검색"
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold text-white focus:outline-none focus:border-[#64DD17]/50 transition-all placeholder:text-white/10"
                                    value={courseSearch}
                                    onChange={(e) => setCourseSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
                            {filteredCourses.map((course) => (
                                <button
                                    key={course.id}
                                    onClick={() => {
                                        setSelectedCourse(course.name);
                                        setSelectedCourseData(course);
                                        setIsCourseSearchOpen(false);
                                        setCourseSearch("");
                                    }}
                                    className={cn(
                                        "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left",
                                        selectedCourse === course.name
                                            ? "bg-[#64DD17]/10 border-[#64DD17]/50 shadow-lg shadow-[#64DD17]/5"
                                            : "bg-white/5 border-white/5 hover:border-white/10"
                                    )}
                                >
                                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-white/5">
                                        <img src={course.imageUrl} alt={course.name} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-white truncate">{course.name}</h3>
                                            {course.isRankue60 && (
                                                <span className="px-1.5 py-0.5 rounded bg-[#FFD700] text-black text-[8px] font-black uppercase tracking-tighter">Elite 60</span>
                                            )}
                                        </div>
                                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-0.5">{course.region} · {course.holes} Holes</p>
                                    </div>
                                    {selectedCourse === course.name && (
                                        <div className="w-6 h-6 rounded-full bg-[#64DD17] flex items-center justify-center">
                                            <LucideCheck className="w-3 h-3 text-black" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </DialogContent>
                </Dialog>

                <AnimatePresence mode="wait">
                    {step === 'setup' && (
                        <motion.div
                            key="setup"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="px-5 mt-6 space-y-8 pb-10"
                        >
                            {/* Golf Course (Ticket Style) */}
                            <section>
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 block px-1">BATTLE FIELD (골프장)</label>
                                <div
                                    onClick={() => setIsCourseSearchOpen(true)}
                                    className="relative h-28 rounded-2xl overflow-hidden border border-[#64DD17]/30 group cursor-pointer active:scale-[0.98] transition-transform shadow-lg shadow-[#64DD17]/5"
                                >
                                    <img
                                        src={selectedCourseData?.imageUrl || "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?q=80&w=2000&auto=format&fit=crop"}
                                        alt="Course"
                                        className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-700"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                                    <div className="absolute inset-0 p-5 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                                <LucideMapPin className="w-6 h-6 text-[#64DD17]" />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black italic tracking-tight">{selectedCourse}</h2>
                                                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{selectedCourseData?.region} / {selectedCourseData?.holes} Holes</p>
                                            </div>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); setIsCourseSearchOpen(true); }} className="px-4 py-2 rounded-full bg-white/10 border border-white/20 text-[10px] font-black backdrop-blur-md hover:bg-[#64DD17] hover:text-black hover:border-[#64DD17] transition-all uppercase">
                                            Change
                                        </button>
                                    </div>
                                </div>
                            </section>

                            {/* Game Mode (Premium Cards) */}
                            <section>
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 block px-1">GAME MODE</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Type: Stroke */}
                                    <button
                                        onClick={() => setSelectedGame('stroke')}
                                        className={cn(
                                            "relative p-5 rounded-2xl border text-left transition-all duration-300 overflow-hidden group",
                                            selectedGame === 'stroke'
                                                ? "bg-[#64DD17]/10 border-[#64DD17] ring-1 ring-[#64DD17]/50 shadow-lg shadow-[#64DD17]/10"
                                                : "bg-[#18181b] border-white/5 hover:border-white/10"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-500",
                                            selectedGame === 'stroke' ? "bg-[#64DD17] text-[#09090b] shadow-[0_0_15px_rgba(100,221,23,0.4)]" : "bg-white/5 text-white/40 group-hover:bg-white/10"
                                        )}>
                                            <LucideTrophy className="w-5 h-5" />
                                        </div>
                                        <div className="font-black text-lg mb-0.5 italic">스트로크</div>
                                        <div className="text-[10px] text-white/40 font-medium leading-relaxed">진정한 실력 승부<br />타수 합계 대결</div>
                                        {selectedGame === 'stroke' && <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-[#64DD17] shadow-[0_0_10px_#64DD17]" />}
                                    </button>

                                    {/* Type: Skins */}
                                    <button
                                        onClick={() => setSelectedGame('skins')}
                                        className={cn(
                                            "relative p-5 rounded-2xl border text-left transition-all duration-300 overflow-hidden group",
                                            selectedGame === 'skins'
                                                ? "bg-[#29B6F6]/10 border-[#29B6F6] ring-1 ring-[#29B6F6]/50 shadow-lg shadow-[#29B6F6]/10"
                                                : "bg-[#18181b] border-white/5 hover:border-white/10"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-500",
                                            selectedGame === 'skins' ? "bg-[#29B6F6] text-[#09090b] shadow-[0_0_15px_rgba(41,182,246,0.4)]" : "bg-white/5 text-white/40 group-hover:bg-white/10"
                                        )}>
                                            <LucideCoins className="w-5 h-5" />
                                        </div>
                                        <div className="font-black text-lg mb-0.5 italic">스킨스</div>
                                        <div className="text-[10px] text-white/40 font-medium leading-relaxed">홀마다 상금 획득<br />짜릿한 역전승</div>
                                        {selectedGame === 'skins' && <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-[#29B6F6] shadow-[0_0_10px_#29B6F6]" />}
                                    </button>
                                </div>
                            </section>

                            {/* Stakes (Betting Chips) */}
                            <section>
                                <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-3 block px-1">BETTING (홀당 판돈)</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[1000, 5000, 10000, 20000].map((amount) => (
                                        <button
                                            key={amount}
                                            onClick={() => setStake(amount)}
                                            className={cn(
                                                "py-4 rounded-xl text-xs font-black transition-all border relative overflow-hidden",
                                                stake === amount
                                                    ? "bg-amber-400 border-amber-400 text-black shadow-[0_0_15px_rgba(251,191,36,0.3)] scale-[1.05] z-10"
                                                    : "bg-[#18181b] border-white/5 text-white/30 hover:bg-[#202025] hover:text-white/60"
                                            )}
                                        >
                                            {amount / 1000}천
                                            {stake === amount && (
                                                <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-4 flex items-center justify-center gap-2 py-2 px-4 bg-amber-400/5 rounded-full border border-amber-400/10 w-fit mx-auto">
                                    <LucideCoins className="w-3 h-3 text-amber-400" />
                                    <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider">
                                        18홀 예상 총판돈: {formatMoney(stake * 18)}원
                                    </span>
                                </div>
                            </section>

                            {/* Options (Switch Toggles) */}
                            <section className="bg-[#18181b] rounded-3xl p-1 border border-white/5 shadow-2xl">
                                {/* OECD Option */}
                                <div className="flex items-center justify-between p-5 border-b border-white/5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 shadow-inner">
                                            <LucideBomb className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="font-black text-sm italic uppercase tracking-tighter">OECD 적용</div>
                                            <div className="text-[10px] text-white/30 font-bold">OB, 해저드, 벙커, 3퍼트 시 벌금</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setUseOecd(!useOecd)}
                                        title="Apply OECD"
                                        className={cn(
                                            "w-12 h-6 rounded-full transition-all duration-300 relative p-1",
                                            useOecd ? "bg-[#64DD17] shadow-[0_0_10px_rgba(100,221,23,0.3)]" : "bg-white/10"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-md",
                                            useOecd ? "translate-x-6" : "translate-x-0"
                                        )} />
                                    </button>
                                </div>

                                {/* Double Par Option */}
                                <div className="flex items-center justify-between p-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 shadow-inner">
                                            <LucideSwords className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="font-black text-sm italic uppercase tracking-tighter">배판 자동화</div>
                                            <div className="text-[10px] text-white/30 font-bold">버디/트리플 발생 시 다음 홀 배판</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setUseDouble(!useDouble)}
                                        title="Auto Double"
                                        className={cn(
                                            "w-12 h-6 rounded-full transition-all duration-300 relative p-1",
                                            useDouble ? "bg-[#64DD17] shadow-[0_0_10px_rgba(100,221,23,0.3)]" : "bg-white/10"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-md",
                                            useDouble ? "translate-x-6" : "translate-x-0"
                                        )} />
                                    </button>
                                </div>
                            </section>
                        </motion.div>
                    )}

                    {step === 'lobby' && (
                        <motion.div
                            key="lobby"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="p-6 h-full flex flex-col items-center justify-center text-center pb-32"
                        >
                            <div className="w-full max-w-sm bg-[#111111] border border-[#64DD17]/30 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#64DD17] to-transparent opacity-50" />

                                <p className="text-[10px] font-black text-[#64DD17] uppercase tracking-[0.3em] mb-4">MATCH PIN CODE</p>
                                <h2 className="text-7xl font-black text-white italic tracking-tighter mb-8 drop-shadow-[0_0_20px_rgba(100,221,23,0.3)]">
                                    {activeSession?.pinCode?.split("").map((c: string, i: number) => (
                                        <span key={i} className="mx-1">{c}</span>
                                    ))}
                                </h2>

                                <div className="grid grid-cols-4 gap-4 mt-8">
                                    {[0, 1, 2, 3].map((i) => {
                                        const player = sessionInfo?.players?.[i];
                                        return (
                                            <div key={i} className="space-y-2">
                                                <div className={cn(
                                                    "w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-500",
                                                    player ? "bg-[#64DD17]/20 border-[#64DD17] shadow-[0_0_15px_rgba(100,221,23,0.2)]" : "bg-white/5 border-white/10"
                                                )}>
                                                    {player ? <LucideCheckCircle2 className="w-5 h-5 text-[#64DD17]" /> : <LucideUsers className="w-4 h-4 text-white/10" />}
                                                </div>
                                                <p className={cn(
                                                    "text-[9px] font-black transition-colors uppercase",
                                                    player ? "text-[#64DD17]" : "text-white/20"
                                                )}>
                                                    {player ? (i === 0 ? "HOST" : "JOINED") : "WAIT"}
                                                </p>
                                                {player && <p className="text-[10px] font-bold text-white max-w-[50px] truncate">{player.name}</p>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <p className="mt-8 text-xs text-white/40 font-bold leading-relaxed max-w-[250px]">
                                동반자가 [코드 입장] 메뉴에서<br />위 번호를 입력하면 즉시 연결됩니다.
                            </p>

                            <div className="mt-12 w-full max-w-sm space-y-3">
                                <Button
                                    className="w-full h-16 bg-[#64DD17] border-none text-[#051907] font-black text-lg rounded-2xl shadow-lg shadow-[#64DD17]/20 active:scale-95 transition-all"
                                    onClick={() => {
                                        apiRequest(`/api/hiq/golf/match/${activeSession.id}/score`, {
                                            method: "POST",
                                            body: {
                                                holeNo: 1,
                                                players: sessionInfo.players
                                            }
                                        }).then(() => {
                                            setLocation(`/golf/game/${activeSession.id}`);
                                        });
                                    }}
                                    disabled={!sessionInfo?.players || sessionInfo.players.length < 2}
                                >
                                    {sessionInfo?.players?.length < 2 ? "참여 대기 중..." : "게임 시작"}
                                </Button >
                            </div >
                        </motion.div >
                    )}

                    {
                        step === 'join' && (
                            <motion.div
                                key="join"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="h-full flex flex-col p-6"
                            >
                                <div className="text-center pt-8 mb-12">
                                    <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">핀번호 입력</h2>
                                    <p className="text-sm text-white/40 font-bold">방장이 부른 숫자 4자리를 입력하세요</p>
                                </div>

                                <div className="flex justify-center gap-4 mb-16">
                                    {[0, 1, 2, 3].map((i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                "w-14 h-20 rounded-2xl border-2 flex items-center justify-center text-3xl font-black transition-all",
                                                pinEntry[i] ? "border-[#64DD17] text-[#64DD17] bg-[#64DD17]/5" : "border-white/10 bg-white/5 text-white/20"
                                            )}
                                        >
                                            {pinEntry[i] || "_"}
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto w-full mb-12">
                                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((k) => (
                                        <button
                                            key={k}
                                            onClick={() => {
                                                if (k === 'CLR') setPinEntry([]);
                                                else if (k === 'DEL') setPinEntry(prev => prev.slice(0, -1));
                                                else handlePinPress(k);
                                            }}
                                            className={cn(
                                                "h-16 rounded-2xl font-black text-xl transition-all active:scale-95 shadow-sm",
                                                ['CLR', 'DEL'].includes(k) ? "bg-white/5 text-white/40 border border-white/5" : "bg-white/10 text-white border border-white/10 hover:bg-white/20"
                                            )}
                                        >
                                            {k === 'DEL' ? <LucideX className="mx-auto w-5 h-5" /> : k}
                                        </button>
                                    ))}
                                </div>

                                {joinMatch.isPending && (
                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 rounded-[3rem]">
                                        <LucideLoader2 className="w-10 h-10 text-[#64DD17] animate-spin" />
                                    </div>
                                )}
                            </motion.div>
                        )
                    }
                </AnimatePresence >
            </main >

            {/* Action Bar (Only for Setup) */}
            {
                step === 'setup' && (
                    <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#09090b] via-[#09090b]/95 to-transparent z-40">
                        <div className="max-w-md mx-auto">
                            <Button
                                className="w-full h-16 bg-[#64DD17] text-[#09090b] font-black text-lg rounded-2xl shadow-xl shadow-[#64DD17]/20 border-none group active:scale-[0.98] transition-all hover:bg-[#52c41a]"
                                onClick={() => createMatch.mutate()}
                                disabled={createMatch.isPending}
                            >
                                {createMatch.isPending ? (
                                    <LucideLoader2 className="w-6 h-6 animate-spin" />
                                ) : (
                                    <>
                                        <span>방 만들기</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
