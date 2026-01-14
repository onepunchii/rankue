
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Ticket, Trophy, RefreshCw, Wand2, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

export default function LottoPage() {
    const { user, refreshUser } = useAuth();
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // State
    const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
    const [timeUntilDraw, setTimeUntilDraw] = useState('');
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);

    // Queries
    const { data: lotteryHistory = [] } = useQuery<any[]>({
        queryKey: ['/api/lottery/history'],
        refetchInterval: 60000
    });

    const { data: todayDraw } = useQuery<any>({
        queryKey: ['/api/lottery/today-draw'],
        refetchInterval: 60000
    });

    const { data: myTickets = [] } = useQuery<any[]>({
        queryKey: ['/api/lottery/tickets'],
        enabled: !!user
    });

    // Derived Data
    const latestHistory = lotteryHistory[0];
    const currentViewedDraw = lotteryHistory[currentHistoryIndex];

    // Round ID for PREDICTION/NEXT usage (must be based on latest known + 1)
    const roundId = todayDraw?.id || (latestHistory?.round || 0) + 1;

    // Countdown Logic
    useEffect(() => {
        const updateCountdown = () => {
            const now = new Date();
            const nextDraw = new Date(now);
            nextDraw.setDate(nextDraw.getDate() + 1);
            nextDraw.setHours(0, 0, 0, 0);

            const timeDiff = nextDraw.getTime() - now.getTime();

            if (timeDiff <= 0) {
                setTimeUntilDraw("추첨 진행중");
                return;
            }

            const hours = Math.floor(timeDiff / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

            setTimeUntilDraw(`${hours}시간 ${minutes}분 ${seconds}초`);
        };

        updateCountdown();
        const timer = setInterval(updateCountdown, 1000);
        return () => clearInterval(timer);
    }, []);

    // Handlers
    const toggleNumber = (number: number) => {
        if (selectedNumbers.includes(number)) {
            setSelectedNumbers(selectedNumbers.filter(n => n !== number));
        } else if (selectedNumbers.length < 5) {
            setSelectedNumbers([...selectedNumbers, number].sort((a, b) => a - b));
        }
    };

    const generateRandomNumbers = () => {
        const numbers: number[] = [];
        while (numbers.length < 5) {
            const randomNum = Math.floor(Math.random() * 40) + 1;
            if (!numbers.includes(randomNum)) {
                numbers.push(randomNum);
            }
        }
        const sortedNumbers = numbers.sort((a, b) => a - b);
        setSelectedNumbers(sortedNumbers);
    };

    const handlePrevRound = () => {
        if (currentHistoryIndex < lotteryHistory.length - 1) {
            setCurrentHistoryIndex(prev => prev + 1);
        }
    };

    const handleNextRound = () => {
        if (currentHistoryIndex > 0) {
            setCurrentHistoryIndex(prev => prev - 1);
        }
    };

    const handleCreateTicket = async () => {
        if (!user) {
            toast({ title: "로그인이 필요합니다", variant: "destructive" });
            return;
        }
        if ((user.availableLotteryTickets || 0) <= 0) {
            toast({ title: "티켓이 부족합니다", description: "레벨업하여 티켓을 획득하세요!", variant: "destructive" });
            return;
        }
        if (selectedNumbers.length !== 5) {
            toast({ title: "번호 5개를 선택해주세요", variant: "destructive" });
            return;
        }

        setIsCreating(true);
        try {
            let token: string | null = null;
            try {
                // validation
                const { data } = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<{ data: any }>((_, reject) => setTimeout(() => reject(new Error("Token limit")), 2000))
                ]);
                token = data?.session?.access_token || null;
            } catch (e) {
                console.log("Token fetch error, trying local", e);
            }

            if (!token) {
                // Fallback to local storage
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('sb-') && key.includes('auth-token')) {
                        try {
                            const sessionData = JSON.parse(localStorage.getItem(key) || '{}');
                            token = sessionData.access_token;
                            if (token) break;
                        } catch (e) { }
                    }
                }
            }

            if (!token) throw new Error("로그인 세션을 찾을 수 없습니다.");

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const res = await fetch("/api/lottery/create-ticket", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    roundId,
                    numbers: selectedNumbers
                }),
                signal: controller.signal
            }).finally(() => clearTimeout(timeoutId));

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `Server Error: ${res.status}`);
            }

            const json = await res.json();

            // Success
            queryClient.invalidateQueries({ queryKey: ['/api/lottery/tickets'] });
            queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
            if (refreshUser) refreshUser();

            setShowSuccessModal(true);
            setSelectedNumbers([]);
            toast({ title: "티켓 생성 완료!", description: "행운을 빕니다! 🍀" });

        } catch (error: any) {
            console.error("Ticket creation failed", error);
            if (error.name === 'AbortError') {
                toast({ title: "응답 지연", description: "서버 응답이 늦어지고 있습니다. 잠시 후 다시 시도해주세요.", variant: "destructive" });
            } else {
                toast({ title: "생성 실패", description: error.message || "오류가 발생했습니다.", variant: "destructive" });
            }
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-black text-white pb-24 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-96 h-96 bg-purple-900/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-900/20 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2"></div>
            </div>

            {/* Header */}
            <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 h-14 flex items-center">
                <Button variant="ghost" size="icon" onClick={() => setLocation('/home')} className="mr-2 text-white/70 hover:text-white hover:bg-white/10">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <span className="font-bold text-lg">Lotto 540</span>
            </header>

            <main className="container max-w-md mx-auto px-4 pt-6 space-y-8 relative z-10">

                {/* A. Results Carousel */}
                {currentViewedDraw && (
                    <section className="text-center space-y-6">
                        <div className="flex items-center justify-between px-4">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handlePrevRound}
                                disabled={currentHistoryIndex >= lotteryHistory.length - 1}
                                className="rounded-full w-10 h-10 border border-white/10 hover:bg-white/10 disabled:opacity-30"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </Button>

                            <div className="flex flex-col items-center">
                                <h2 className="text-2xl font-black tracking-tight">
                                    제 <span className="text-purple-400">{currentViewedDraw.id}</span>회 추첨 결과
                                </h2>
                                <p className="text-sm text-white/50 mt-1">
                                    {new Date(currentViewedDraw.drawDate).toLocaleDateString()} 추첨
                                </p>
                            </div>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleNextRound}
                                disabled={currentHistoryIndex <= 0}
                                className="rounded-full w-10 h-10 border border-white/10 hover:bg-white/10 disabled:opacity-30"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </Button>
                        </div>

                        <div className="relative py-2">
                            {/* Balls */}
                            <div className="flex justify-center gap-3">
                                {(currentViewedDraw.winningNumbers || []).map((num: number, idx: number) => {
                                    // Colors based on number range (standard lotto colors)
                                    let colorClass = "from-yellow-500 to-yellow-600"; // 1-10
                                    if (num > 10) colorClass = "from-blue-500 to-blue-600"; // 11-20
                                    if (num > 20) colorClass = "from-red-500 to-red-600"; // 21-30
                                    if (num > 30) colorClass = "from-gray-500 to-gray-600"; // 31-40
                                    if (num > 40) colorClass = "from-green-500 to-green-600"; // 41-45

                                    return (
                                        <div key={idx} className={`w-12 h-12 rounded-full bg-gradient-to-br ${colorClass} border-2 border-white/20 flex items-center justify-center shadow-lg shadow-black/50 font-black text-xl text-white transform hover:scale-110 transition-transform`}>
                                            {num}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Winner Stats */}
                        <div className="grid grid-cols-3 gap-2 bg-white/5 rounded-2xl p-4 border border-white/5">
                            <div className="text-center">
                                <div className="text-xs text-yellow-400 font-bold mb-1">1등</div>
                                <div className="text-lg font-bold">{currentViewedDraw.winnerCounts?.first || 0}명</div>
                            </div>
                            <div className="text-center border-l border-white/10">
                                <div className="text-xs text-gray-300 font-bold mb-1">2등</div>
                                <div className="text-lg font-bold">{currentViewedDraw.winnerCounts?.second || 0}명</div>
                            </div>
                            <div className="text-center border-l border-white/10">
                                <div className="text-xs text-orange-400 font-bold mb-1">3등</div>
                                <div className="text-lg font-bold">{currentViewedDraw.winnerCounts?.third || 0}명</div>
                            </div>
                        </div>
                    </section>
                )}

                {/* B. Hero Section (Timer & Info) */}
                <section className="bg-black rounded-3xl p-6 border border-white/20 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30"></div>
                    <div className="relative z-10 text-center space-y-4">
                        <div className="space-y-1">
                            <p className="text-purple-200 text-sm font-medium">제 {roundId}회 추첨까지</p>
                            <div className="text-3xl font-black tracking-wider font-mono text-white drop-shadow-lg">
                                {timeUntilDraw}
                            </div>
                        </div>

                        <div className="py-4">
                            <div className="text-sm text-white/60 mb-1">1등 당첨금 최대</div>
                            <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-100 to-yellow-500 drop-shadow-sm">
                                50,000 P
                            </div>
                        </div>

                        <div className="flex items-center justify-center gap-2 text-sm text-white/80 bg-black/30 py-2 rounded-lg backdrop-blur-sm border border-white/5">
                            <Ticket className="w-4 h-4 text-purple-400" />
                            <span>보유 티켓: <strong className="text-white">{user?.availableLotteryTickets || 0}장</strong></span>
                        </div>
                    </div>
                </section>

                {/* C. Interaction (Number Selection) */}
                <section className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                        <h3 className="font-bold text-lg">번호 선택 (5개)</h3>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setSelectedNumbers([])} className="h-8 bg-white/5 border-white/10 hover:bg-white/10 text-white/70">
                                <RefreshCw className="w-3.5 h-3.5 mr-1" /> 초기화
                            </Button>
                            <Button variant="outline" size="sm" onClick={generateRandomNumbers} className="h-8 bg-purple-500/20 border-purple-500/30 hover:bg-purple-500/30 text-purple-200">
                                <Wand2 className="w-3.5 h-3.5 mr-1" /> 자동
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-8 gap-2">
                        {Array.from({ length: 40 }, (_, i) => i + 1).map((num) => {
                            const isSelected = selectedNumbers.includes(num);
                            let colorClass = "from-yellow-500 to-yellow-600";
                            if (num > 10) colorClass = "from-blue-500 to-blue-600";
                            if (num > 20) colorClass = "from-red-500 to-red-600";
                            if (num > 30) colorClass = "from-gray-500 to-gray-600";
                            if (num > 40) colorClass = "from-green-500 to-green-600";

                            return (
                                <button
                                    key={num}
                                    onClick={() => toggleNumber(num)}
                                    className={`aspect-square rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-200 ${isSelected
                                        ? `bg-gradient-to-br ${colorClass} shadow-lg scale-105 border-transparent text-white`
                                        : 'bg-white/5 text-white/50 hover:bg-white/10 border border-white/5'
                                        }`}
                                >
                                    {num}
                                </button>
                            );
                        })}
                    </div>

                    <div className="pt-4">
                        <Button
                            className="w-full h-14 text-lg font-bold bg-[#7c3aed] hover:bg-[#6d28d9] shadow-lg shadow-purple-900/20 rounded-2xl transition-all"
                            onClick={handleCreateTicket}
                            disabled={isCreating}
                        >
                            {isCreating ? '티켓 생성 중...' : '지금 바로 티켓 생성하기'}
                        </Button>
                    </div>
                </section>

                {/* D. Info Tabs */}
                <section>
                    <Tabs defaultValue="prizes" className="w-full">
                        <TabsList className="w-full grid grid-cols-2 bg-white/5 p-1 rounded-xl">
                            <TabsTrigger value="prizes" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">당첨금 안내</TabsTrigger>
                            <TabsTrigger value="history" className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50">나의 기록</TabsTrigger>
                        </TabsList>

                        <TabsContent value="prizes" className="mt-4 space-y-3">
                            {[
                                { rank: '1등', match: '5개 일치', prize: '50,000 P', color: 'text-yellow-400' },
                                { rank: '2등', match: '4개 일치', prize: '5,000 P', color: 'text-gray-300' },
                                { rank: '3등', match: '3개 일치', prize: '500 P', color: 'text-orange-400' },
                            ].map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <Trophy className={`w-5 h-5 ${item.color}`} />
                                        <div>
                                            <div className={`font-bold ${item.color}`}>{item.rank}</div>
                                            <div className="text-xs text-white/50">{item.match}</div>
                                        </div>
                                    </div>
                                    <div className="font-bold text-white">{item.prize}</div>
                                </div>
                            ))}
                        </TabsContent>

                        <TabsContent value="history" className="mt-4 space-y-3 max-h-80 overflow-y-auto pr-2">
                            {myTickets.length === 0 ? (
                                <div className="text-center py-10 text-white/30">
                                    <Ticket className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p>아직 생성한 티켓이 없습니다.</p>
                                </div>
                            ) : (
                                myTickets.map((ticket, idx) => {
                                    // Find draw by ID since lottery_draws table uses 'id' as the round number
                                    const draw = lotteryHistory.find((h: any) => Number(h.id) === Number(ticket.roundId));
                                    let status = { text: "결과 대기 중", color: "text-purple-300" };

                                    if (draw) {
                                        const myNums = Array.isArray(ticket.numbers) ? ticket.numbers : JSON.parse(ticket.numbers || '[]');
                                        const winNums = draw.winningNumbers || [];
                                        const matchCount = myNums.filter((n: number) => winNums.includes(n)).length;

                                        if (matchCount === 5) status = { text: "🏆 1등 당첨", color: "text-yellow-400 font-bold" };
                                        else if (matchCount === 4) status = { text: "🥈 2등 당첨", color: "text-gray-300 font-bold" };
                                        else if (matchCount === 3) status = { text: "🥉 3등 당첨", color: "text-orange-400 font-bold" };
                                        else status = { text: "낙첨", color: "text-white/30" };
                                    }

                                    return (
                                        <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                                            <div>
                                                <div className="text-xs text-purple-300 mb-1">{ticket.roundId}회차</div>
                                                <div className="flex gap-1.5">
                                                    {(Array.isArray(ticket.numbers) ? ticket.numbers : JSON.parse(ticket.numbers || '[]')).map((n: number, i: number) => (
                                                        <span key={i} className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center text-xs text-white font-medium">{n}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className={`text-xs ${status.color}`}>
                                                {status.text}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </TabsContent>
                    </Tabs>
                </section>

            </main>

            {/* Success Modal */}
            <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
                <DialogContent className="bg-[#1a1b2e] border-white/10 text-white w-[85%] rounded-2xl p-6">
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center animate-bounce">
                            <Ticket className="w-6 h-6 text-purple-400" />
                        </div>

                        <div className="text-center space-y-1">
                            <h2 className="text-xl font-bold text-white">🎉 티켓 생성 완료!</h2>
                            <p className="text-sm text-white/70">
                                제 <strong className="text-purple-300">{roundId}회</strong> 로또 티켓이 발급되었습니다.<br />
                                <span className="text-xs text-white/50">내일 자정 추첨 결과를 기대해주세요!</span>
                            </p>
                        </div>

                        <Button className="w-full h-10 bg-purple-600 hover:bg-purple-700 text-sm font-bold rounded-xl" onClick={() => setShowSuccessModal(false)}>
                            확인
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

        </div>
    );
}
