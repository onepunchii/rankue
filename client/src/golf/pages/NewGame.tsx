import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideChevronLeft,
    LucideTrophy,
    LucideCoins,
    LucideSwords,
    LucideCheckCircle2,
    LucideSearch,
    LucideX,
    LucideUsers,
    LucideLoader2,
    LucideMapPin,
    LucideUser,
    LucideCheck,
    LucideSparkles,
    LucideZap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMoneyUnit } from "../lib/money";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useNativeBridge } from "@/hooks/useNativeBridge";

// import { COURSES } from "@/golf/data/golfCourses"; // 더 이상 사용하지 않음
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/use-debounce";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const formatMoney = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

// 1. 코스 리스트 아이템 컴포넌트 분리 및 메모이제이션
const CourseItem = memo(({ course, isSelected, onSelect }: any) => (
    <button
        onClick={() => onSelect(course)}
        className={cn(
            "w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left",
            isSelected
                ? "bg-[#64DD17]/10 border-[#64DD17]/50 shadow-lg shadow-[#64DD17]/5"
                : "bg-white/5 border-white/5 hover:border-white/10"
        )}
    >
        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-white/5">
            <img
                src={course.imageUrl}
                alt={course.name}
                className="w-full h-full object-cover"
                loading="lazy"
            />
        </div>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white truncate">{course.name}</h3>
                {course.isRankue60 && (
                    <span className="px-1.5 py-0.5 rounded bg-[#FFD700] text-black text-[8px] font-black uppercase tracking-tighter">Elite 60</span>
                )}
            </div>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
                {course.distance ? `${course.distance.toFixed(1)}km` : course.region} · {course.totalHoles} Holes
            </p>
        </div>
        {isSelected && (
            <div className="w-6 h-6 rounded-full bg-[#64DD17] flex items-center justify-center">
                <LucideCheck className="w-3 h-3 text-black" />
            </div>
        )}
    </button>
));

CourseItem.displayName = "CourseItem";

export default function GolfNewGame() {
    const [_, setLocation] = useLocation();
    const searchParams = new URLSearchParams(window.location.search);
    const initialMode = searchParams.get("mode") || "match";

    // 2. 상태 관리 최적화
    const [step, setStep] = useState<'setup' | 'lobby' | 'join'>(initialMode === 'join' ? 'join' : 'setup');
    const [selectedGame, setSelectedGame] = useState<'stroke' | 'skins'>('stroke');
    const [strokeMode, setStrokeMode] = useState<'solo' | 'group'>('group');
    const [stake, setStake] = useState<number>(10000);
    const [useOecd, setUseOecd] = useState(false);
    const [useDouble, setUseDouble] = useState(true);
    const [doublingMode, setDoublingMode] = useState<'current' | 'next'>('next');
    const [isExtrasEnabled, setIsExtrasEnabled] = useState(false);
    const [birdieAmount, setBirdieAmount] = useState<number>(10000);
    const [eagleAmount, setEagleAmount] = useState<number>(20000);

    const [courseSearch, setCourseSearch] = useState("");
    const debouncedSearch = useDebounce(courseSearch, 300);
    const [isCourseSearchOpen, setIsCourseSearchOpen] = useState(false);
    const [selectedCourseData, setSelectedCourseData] = useState<any>(null);
    const [selectedFrontCourse, setSelectedFrontCourse] = useState<string>("");
    const [selectedBackCourse, setSelectedBackCourse] = useState<string>("");

    const [pinEntry, setPinEntry] = useState<string[]>([]);
    const [activeSession, setActiveSession] = useState<any>(null);
    // 앱 없는 동반자(이름만). 점수판에만 있고 기록·통계에는 들어가지 않는다.
    const [guestNames, setGuestNames] = useState<string[]>([]);
    const [guestDraft, setGuestDraft] = useState("");
    const [unit] = useMoneyUnit();
    const isSolo = selectedGame === 'stroke' && strokeMode === 'solo';

    const { toast } = useToast();

    const { location, requestLocation } = useNativeBridge();

    // Request location on mount
    useEffect(() => {
        requestLocation();
    }, [requestLocation]);

    // 3. API 데이터 페칭 최적화
    const { data: me } = useQuery<any>({
        queryKey: ["/api/hiq/me"],
        staleTime: 1000 * 60 * 5 // 5분 캐싱
    });

    // 골프장 목록 검색
    const { data: dbClubs } = useQuery<any[]>({
        queryKey: [`/api/hiq/golf/clubs`, { search: debouncedSearch, lat: location?.lat, lng: location?.lng }],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (debouncedSearch) params.append("search", debouncedSearch);
            if (location) {
                params.append("lat", String(location.lat));
                params.append("lng", String(location.lng));
            }
            return await apiRequest(`/api/hiq/golf/clubs?${params.toString()}`);
        },
        enabled: isCourseSearchOpen || !selectedCourseData,
    });

    // 세부 코스 목록 조회
    const { data: dbSubCourses } = useQuery<any[]>({
        queryKey: [`/api/hiq/golf/clubs/${selectedCourseData?.id}/courses`],
        enabled: !!selectedCourseData?.id,
    });

    const filteredCourses = useMemo(() => dbClubs || [], [dbClubs]);
    const subCourses = useMemo(() => dbSubCourses || [], [dbSubCourses]);

    const setupMissing = !selectedCourseData ? "골프장을 선택해 주세요"
        : !selectedFrontCourse ? "전반 코스를 골라 주세요"
            : !selectedBackCourse ? "후반 코스를 골라 주세요"
                : null;

    /** 회원이 직접 적어 준 코스 이름을 원장에 남긴다 — 다음 사람은 고르기만 하면 된다. 실패해도 라운드는 진행된다. */
    const rememberTypedCourses = useCallback(() => {
        if (!selectedCourseData?.id || subCourses.length > 0) return;
        const names = [selectedFrontCourse, selectedBackCourse].map((n) => n.trim()).filter(Boolean);
        if (names.length === 0) return;
        apiRequest(`/api/hiq/golf/clubs/${selectedCourseData.id}/courses`, { method: "POST", body: { names } })
            .catch(() => { /* 원장에 못 남겨도 오늘 라운드는 그대로 간다 */ });
    }, [selectedCourseData?.id, subCourses.length, selectedFrontCourse, selectedBackCourse]);

    // 예전엔 목록이 뜨면 '88CC' 를 자동으로 골랐다(개발 때 쓰던 기본값) — 엉뚱한 골프장으로 방이 만들어졌다.
    // 이제 사람이 고른다. 아래 버튼이 '골프장을 선택해 주세요' 라고 말해 준다(2026-09-11).

    // 스마트 코스 추천 로직
    useEffect(() => {
        if (selectedFrontCourse && subCourses.length > 0 && !selectedBackCourse) {
            const prefix = selectedFrontCourse.split(' ')[0];
            const backMatch = subCourses.find(c => c.name.startsWith(prefix) && c.name !== selectedFrontCourse);
            if (backMatch) {
                setSelectedBackCourse(backMatch.name);
            }
        }
    }, [selectedFrontCourse, subCourses, selectedBackCourse]);

    // Create Match Mutation
    const createMatch = useMutation({
        mutationFn: async () => {
            if (!me?.id) throw new Error("로그인이 필요합니다.");
            return await apiRequest("/api/hiq/golf/match/create", {
                method: "POST",
                // 포인트·배판은 '타당 게임' 에서만 보낸다. 스트로크는 서버도 0 으로 덮는다
                // (예전엔 화면에 안 보이는 기본값 1타 1만원·배판이 스트로크 경기에도 저장됐다).
                body: {
                    courseId: String(selectedCourseData?.id || ""),
                    courseName: selectedCourseData?.name,
                    gameMode: selectedGame,
                    strokeMode: selectedGame === 'stroke' ? strokeMode : null,
                    ...(selectedGame === 'skins' ? {
                        stake,
                        useDouble,
                        doublingMode: useDouble ? doublingMode : 'none',
                        birdieAmount: isExtrasEnabled ? birdieAmount : 0,
                        eagleAmount: isExtrasEnabled ? eagleAmount : 0,
                    } : {}),
                    frontCourseName: selectedFrontCourse,
                    backCourseName: selectedBackCourse,
                    guests: isSolo ? [] : guestNames,
                }
            });
        },
        onSuccess: (data: any) => {
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/match/active"] });
            if (data.status === 'playing') {
                // 혼자 기록은 서버가 바로 '진행 중' 으로 연다.
                setLocation(`/golf/game/${data.id}`);
            } else {
                setActiveSession(data);
                setStep('lobby');
            }
        },
        onError: (e: any) => {
            toast({ variant: "destructive", title: "실패", description: e.message });
        }
    });

    // Join Match Mutation
    const joinMatch = useMutation({
        mutationFn: async (pin: string) => {
            return await apiRequest("/api/hiq/golf/match/join", { method: "POST", body: { pin } });
        },
        onSuccess: (data: any) => {
            toast({ title: "입장했어요", description: data?.status === 'waiting' ? "방장이 시작하면 바로 넘어가요." : "진행 중인 라운드에 들어왔어요." });
            setLocation(`/golf/game/${data.id}`);
        },
        onError: (e: any) => {
            toast({ variant: "destructive", title: "입장 실패", description: e.message });
            setPinEntry([]);
        }
    });

    // 홈의 '진행 중 라운드' 에서 대기실로 돌아올 때(?lobby=<경기 번호>). 예전엔 대기실 상태가 화면 메모리에만
    // 있어서 한 번 나가면 방장이 돌아올 길이 없었다.
    const lobbyParam = searchParams.get("lobby");
    useEffect(() => {
        if (!lobbyParam || activeSession) return;
        apiRequest(`/api/hiq/golf/match/${lobbyParam}`)
            .then((s: any) => {
                if (s?.status === 'waiting') { setActiveSession(s); setStep('lobby'); }
                else if (s?.status === 'playing') setLocation(`/golf/game/${s.id}`, { replace: true });
            })
            .catch(() => { /* 없는 방이면 설정 화면 그대로 */ });
    }, [lobbyParam]);

    // 초대 링크(?mode=join&pin=1234)로 들어오면 번호를 채워 바로 들어간다.
    const pinParam = searchParams.get("pin");
    const autoJoinedRef = useRef(false);
    useEffect(() => {
        if (!pinParam || autoJoinedRef.current || !me?.id) return;
        const digits = pinParam.replace(/\D/g, "").slice(0, 4);
        if (digits.length !== 4) return;
        autoJoinedRef.current = true;
        setStep('join');
        setPinEntry(digits.split(""));
        joinMatch.mutate(digits);
    }, [pinParam, me?.id]);

    // 로비 폴링 최적화 (상태에 따른 동적 간격)
    const { data: sessionInfo } = useQuery<any>({
        queryKey: ["/api/hiq/golf/match", activeSession?.id],
        enabled: !!activeSession && step === 'lobby',
        refetchInterval: (query) => (query.state.data?.status === 'playing' ? false : 2000),
        refetchOnWindowFocus: true
    });

    // 1. [Lobby] Host status check
    const isHost = useMemo(() => {
        if (!sessionInfo || !me) return false;
        return sessionInfo.hostId === me.id || (sessionInfo.players && sessionInfo.players[0]?.memberId === me.id);
    }, [sessionInfo, me]);

    useEffect(() => {
        if (sessionInfo?.status === 'playing') {
            setLocation(`/golf/game/${sessionInfo.id}`, { replace: true });
        }
    }, [sessionInfo, setLocation]);

    const handlePinPress = useCallback((num: string) => {
        setPinEntry(prev => {
            if (prev.length >= 4) return prev;
            const next = [...prev, num];
            if (next.length === 4) joinMatch.mutate(next.join(""));
            return next;
        });
    }, [joinMatch]);

    // 대기실에서 뒤로 가도 방은 남는다 — 홈의 '진행 중 라운드' 로 돌아온다.
    // (예전엔 설정 화면으로 돌아가 방을 하나 더 만들 수 있었다.)
    const handleBack = useCallback(() => {
        setLocation('/dashboard');
    }, [setLocation]);

    const copyPin = async () => {
        try {
            await navigator.clipboard.writeText(String(activeSession?.pinCode ?? ""));
            toast({ title: "핀번호를 복사했어요" });
        } catch {
            toast({ title: `핀번호 ${activeSession?.pinCode}` });
        }
    };

    /** 누르기만 하면 들어오는 초대 링크. 예전엔 번호를 소리 내 불러 주는 것 말고 전할 방법이 없었다. */
    const shareInvite = async () => {
        const url = `${window.location.origin}/golf/game/new?mode=join&pin=${activeSession?.pinCode}`;
        const text = `[랭큐] ${activeSession?.courseName || "골프"} 라운드에 초대해요.\n핀번호 ${activeSession?.pinCode}`;
        try {
            if (navigator.share) { await navigator.share({ title: "랭큐 라운드 초대", text, url }); return; }
        } catch { return; /* 공유 창을 닫음 */ }
        try {
            await navigator.clipboard.writeText(`${text}\n${url}`);
            toast({ title: "초대 문구를 복사했어요", description: "카톡에 붙여 넣어 보내세요." });
        } catch {
            toast({ title: "복사하지 못했어요", description: url });
        }
    };

    /** 대기방을 접는다. 예전엔 대기실에 접는 버튼이 없어서, 사람이 안 오면 홈 카드가 12시간 남았다. */
    const abandonLobby = async () => {
        if (!activeSession?.id || !window.confirm("이 방을 없앨까요?")) return;
        try {
            await apiRequest(`/api/hiq/golf/match/${activeSession.id}/abandon`, { method: "POST" });
            queryClient.invalidateQueries({ queryKey: ["/api/hiq/golf/match/active"] });
            setLocation('/dashboard', { replace: true });
        } catch (e: any) {
            toast({ variant: "destructive", title: "방을 없애지 못했어요", description: e?.message });
        }
    };



    return (
        <div className="min-h-screen bg-[#09090b] text-white pb-32 font-sans relative">
            {/* Background Effects (Static) */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-[#64DD17]/5 rounded-full blur-[128px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-[#64DD17]/5 rounded-full blur-[96px]" />
            </div>

            {/* Header */}
            <header className="px-6 pt-12 pb-4 relative z-10 flex items-center justify-between">
                <button
                    onClick={handleBack}
                    className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                    aria-label="뒤로 가기"
                    title="뒤로 가기"
                >
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

            <main className="relative z-10">
                {/* Course Search Dialog */}
                <Dialog open={isCourseSearchOpen} onOpenChange={setIsCourseSearchOpen}>
                    <DialogContent className="max-w-md w-full h-[80vh] bg-[#0A0A0A] border-white/10 p-0 overflow-hidden flex flex-col [&>button]:hidden">
                        <div className="p-6 pb-4 border-b border-white/5 space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-xl font-black text-white tracking-tighter">라운드 장소 선택</h2>
                                <button
                                    onClick={() => setIsCourseSearchOpen(false)}
                                    className="p-2 hover:bg-white/5 rounded-full text-white/40"
                                    aria-label="닫기"
                                    title="닫기"
                                >
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
                                <CourseItem
                                    key={course.id}
                                    course={course}
                                    isSelected={selectedCourseData?.name === course.name}
                                    onSelect={(c: any) => {
                                        // 골프장을 바꾸면 전반/후반도 비운다 — 예전엔 앞 골프장의 코스 이름이 남아
                                        // 엉뚱한 코스로 방이 만들어졌고 파가 전부 기본값이 됐다.
                                        if (c?.id !== selectedCourseData?.id) {
                                            setSelectedFrontCourse("");
                                            setSelectedBackCourse("");
                                        }
                                        setSelectedCourseData(c);
                                        setIsCourseSearchOpen(false);
                                        setCourseSearch("");
                                    }}
                                />
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
                            {/* Course Select Section */}
                            <section>
                                <label className="text-sm font-semibold text-white/40 uppercase tracking-[0.2em] mb-3 block px-1">BATTLE FIELD</label>
                                <div
                                    onClick={() => setIsCourseSearchOpen(true)}
                                    className="relative h-44 rounded-2xl overflow-hidden border border-[#64DD17]/30 group cursor-pointer active:scale-[0.98] transition-transform shadow-lg shadow-[#64DD17]/5"
                                >
                                    <img
                                        src={selectedCourseData?.imageUrl || "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?auto=format&fit=crop&q=80&w=800"}
                                        alt="Course"
                                        className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-110 transition-transform duration-700"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                                    <div className="absolute inset-0 p-5 flex flex-col justify-between">
                                        <div className="flex items-center justify-between w-full">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                                    <LucideMapPin className="w-6 h-6 text-[#64DD17]" />
                                                </div>
                                                <div>
                                                    <h2 className="text-2xl font-black italic tracking-tight">{selectedCourseData?.name || "골프장을 골라 주세요"}</h2>
                                                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{selectedCourseData ? `${selectedCourseData.region ?? ""}${subCourses.length ? ` · 코스 ${subCourses.length}개` : ""}` : "눌러서 검색"}</p>
                                                </div>
                                            </div>
                                            <div className="px-4 py-2 rounded-full bg-white/10 border border-white/20 text-[10px] font-black backdrop-blur-md group-hover:bg-[#64DD17] group-hover:text-black group-hover:border-[#64DD17] transition-all uppercase">
                                                Change
                                            </div>
                                        </div>

                                        {/* 전국 634곳 중 317곳은 코스 구성 자료가 없다. 그런 골프장을 고르면 목록이 비어
                                            '방 만들기' 가 영영 안 눌렸다 — 그래서 직접 적을 수 있게 한다.
                                            적어 주면 원장에 남아서 다음 사람은 고르기만 하면 된다(2026-09-10). */}
                                        {selectedCourseData && subCourses.length === 0 ? (
                                            <div className="mt-4 space-y-2" onClick={(e) => e.stopPropagation()}>
                                                <p className="text-[10px] font-bold text-white/50">
                                                    이 골프장은 코스 정보가 아직 없어요. 오늘 도는 코스를 적어 주세요.
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        value={selectedFrontCourse}
                                                        onChange={(e) => setSelectedFrontCourse(e.target.value.slice(0, 20))}
                                                        placeholder="전반 (예: 동코스)"
                                                        aria-label="전반 코스 이름"
                                                        className="flex-1 bg-black/40 border border-white/10 text-[11px] font-black h-12 rounded-xl px-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#64DD17]/50"
                                                    />
                                                    <input
                                                        value={selectedBackCourse}
                                                        onChange={(e) => setSelectedBackCourse(e.target.value.slice(0, 20))}
                                                        placeholder="후반 (예: 서코스)"
                                                        aria-label="후반 코스 이름"
                                                        className="flex-1 bg-black/40 border border-white/10 text-[11px] font-black h-12 rounded-xl px-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#64DD17]/50"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                        <div className="flex items-center gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                                            <Select
                                                value={selectedFrontCourse}
                                                onValueChange={setSelectedFrontCourse}
                                                disabled={!selectedCourseData}
                                            >
                                                <SelectTrigger className="flex-1 bg-black/40 border-white/10 text-[11px] font-black h-12 rounded-xl focus:ring-1 focus:ring-[#64DD17]/50">
                                                    <SelectValue placeholder="전반 선택" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#0A0A0A] border-white/10 text-white rounded-none">
                                                    {subCourses.map(course => (
                                                        <SelectItem key={course.id} value={course.name} className="text-[11px] hover:bg-white/5 font-bold">
                                                            {course.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Select
                                                value={selectedBackCourse}
                                                onValueChange={setSelectedBackCourse}
                                                disabled={!selectedCourseData}
                                            >
                                                <SelectTrigger className="flex-1 bg-black/40 border-white/10 text-[11px] font-black h-12 rounded-xl focus:ring-1 focus:ring-[#64DD17]/50">
                                                    <SelectValue placeholder="후반 선택" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#0A0A0A] border-white/10 text-white rounded-none">
                                                    {subCourses.map(course => (
                                                        <SelectItem key={course.id} value={course.name} className="text-[11px] hover:bg-white/5 font-bold">
                                                            {course.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {/* Game Mode Selection */}
                            <section>
                                <label className="text-sm font-semibold text-white/40 uppercase tracking-[0.2em] mb-3 block px-1">GAME MODE</label>
                                <div className="grid grid-cols-2 gap-3">
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

                                    <button
                                        onClick={() => setSelectedGame('skins')}
                                        className={cn(
                                            "relative p-5 rounded-2xl border text-left transition-all duration-300 overflow-hidden group",
                                            selectedGame === 'skins'
                                                ? "bg-[#FFD700]/10 border-[#FFD700] ring-1 ring-[#FFD700]/50 shadow-lg shadow-[#FFD700]/10"
                                                : "bg-[#18181b] border-white/5 hover:border-white/10"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-500",
                                            selectedGame === 'skins' ? "bg-[#FFD700] text-[#09090b] shadow-[0_0_15px_rgba(255,215,0,0.4)]" : "bg-white/5 text-white/40 group-hover:bg-white/10"
                                        )}>
                                            <LucideCoins className="w-5 h-5" />
                                        </div>
                                        <div className="font-black text-lg mb-0.5 italic">타당 게임</div>
                                        <div className="text-[10px] text-white/60 font-medium leading-relaxed">타수 차이만큼 포인트 교환<br />치열한 스코어 경쟁</div>
                                        {selectedGame === 'skins' && <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-[#FFD700] shadow-[0_0_10px_#FFD700]" />}
                                    </button>
                                </div>
                            </section>

                            {/* Record Mode (Stroke Only) */}
                            {selectedGame === 'stroke' && (
                                <section className="space-y-4">
                                    <label className="text-sm font-semibold text-white/40 uppercase tracking-[0.2em] mb-3 block px-1">RECORD TYPE</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setStrokeMode('solo')}
                                            className={cn(
                                                "relative p-5 rounded-2xl border text-left transition-all duration-300 overflow-hidden group",
                                                strokeMode === 'solo'
                                                    ? "bg-[#64DD17]/10 border-[#64DD17] ring-1 ring-[#64DD17]/50 shadow-lg shadow-[#64DD17]/10"
                                                    : "bg-[#18181b] border-white/5 hover:border-white/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-500",
                                                strokeMode === 'solo' ? "bg-[#64DD17] text-[#09090b] shadow-[0_0_15px_rgba(100,221,23,0.4)]" : "bg-white/5 text-white/40 group-hover:bg-white/10"
                                            )}>
                                                <LucideUser className="w-5 h-5" />
                                            </div>
                                            <div className="font-black text-lg mb-0.5 italic">혼자 기록하기</div>
                                            <div className="text-[10px] text-white/40 font-medium leading-relaxed">나만의 연습 라운드<br />스코어 집중 분석</div>
                                            {strokeMode === 'solo' && <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-[#64DD17] shadow-[0_0_10px_#64DD17]" />}
                                        </button>

                                        <button
                                            onClick={() => setStrokeMode('group')}
                                            className={cn(
                                                "relative p-5 rounded-2xl border text-left transition-all duration-300 overflow-hidden group",
                                                strokeMode === 'group'
                                                    ? "bg-[#64DD17]/10 border-[#64DD17] ring-1 ring-[#64DD17]/50 shadow-lg shadow-[#64DD17]/10"
                                                    : "bg-[#18181b] border-white/5 hover:border-white/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all duration-500",
                                                strokeMode === 'group' ? "bg-[#64DD17] text-[#09090b] shadow-[0_0_15px_rgba(100,221,23,0.4)]" : "bg-white/5 text-white/40 group-hover:bg-white/10"
                                            )}>
                                                <LucideUsers className="w-5 h-5" />
                                            </div>
                                            <div className="font-black text-lg mb-0.5 italic">다함께 기록하기</div>
                                            <div className="text-[10px] text-white/40 font-medium leading-relaxed">동반자와 실시간<br />라이브 스코어보드</div>
                                            {strokeMode === 'group' && <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-[#64DD17] shadow-[0_0_10px_#64DD17]" />}
                                        </button>
                                    </div>
                                </section>
                            )}

                            {/* 앱 없는 동반자 — 이름만으로 점수판에 넣는다(기록·통계엔 안 들어간다). 예전엔 앱을 안 깐
                                동반자는 넣을 방법이 없어서, 4명 중 한 명만 앱이 없어도 랭큐매치를 못 썼다. */}
                            {!isSolo && (
                                <section>
                                    <label className="text-sm font-semibold text-white/40 tracking-[0.2em] mb-3 block px-1">앱 없는 동반자</label>
                                    {guestNames.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {guestNames.map((n, i) => (
                                                <span key={`${n}-${i}`} className="flex items-center gap-1 h-9 pl-3 pr-1 rounded-full bg-white/10 text-sm font-bold">
                                                    {n}
                                                    <button
                                                        onClick={() => setGuestNames((g) => g.filter((_, j) => j !== i))}
                                                        aria-label={`${n} 빼기`}
                                                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10"
                                                    >
                                                        <LucideX className="w-3.5 h-3.5" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {guestNames.length < 3 && (
                                        <form
                                            className="flex gap-2"
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                const n = guestDraft.trim().slice(0, 12);
                                                if (!n) return;
                                                setGuestNames((g) => [...g, n].slice(0, 3));
                                                setGuestDraft("");
                                            }}
                                        >
                                            <input
                                                value={guestDraft}
                                                onChange={(e) => setGuestDraft(e.target.value.slice(0, 12))}
                                                placeholder="이름 (예: 김프로)"
                                                aria-label="앱 없는 동반자 이름"
                                                className="flex-1 bg-[#18181b] border border-white/10 rounded-xl h-12 px-4 text-sm font-bold text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#64DD17]/50"
                                            />
                                            <Button type="submit" disabled={!guestDraft.trim()} className="h-12 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black border-none">
                                                추가
                                            </Button>
                                        </form>
                                    )}
                                    <p className="mt-2 text-[11px] font-bold text-white/40 break-keep px-1">
                                        앱이 없는 사람도 이름만으로 넣을 수 있어요. 점수는 방장이 적고 기록은 남지 않아요. (앱으로 들어오는 사람과 합쳐 최대 4명)
                                    </p>
                                </section>
                            )}

                            {/* Stakes & Options (타당 게임 Only) */}
                            {selectedGame === 'skins' && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                                    <section>
                                        <label className="text-sm font-semibold text-white/40 uppercase tracking-[0.2em] mb-3 block px-1">게임 규칙 · 1타당 포인트</label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[1000, 5000, 10000, 20000].map((amount) => (
                                                <button
                                                    key={amount}
                                                    onClick={() => setStake(amount)}
                                                    className={cn(
                                                        "py-4 rounded-xl text-xs font-black transition-all border relative overflow-hidden",
                                                        stake === amount
                                                            ? "bg-amber-400 border-amber-400 text-black shadow-lg scale-[1.05] z-10"
                                                            : "bg-[#18181b] border-white/5 text-white/30 hover:bg-[#202025]"
                                                    )}
                                                >
                                                    {amount / 1000}천{unit === 'KRW' ? '원' : 'P'}
                                                </button>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="bg-[#18181b] rounded-3xl p-1 border border-white/5 shadow-2xl">
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
                                                className={cn(
                                                    "w-12 h-6 rounded-full transition-all duration-300 relative p-1",
                                                    useDouble ? "bg-[#64DD17]" : "bg-white/10"
                                                )}
                                                aria-label="배판 자동화 토글"
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full bg-[#ffffff] transition-transform duration-300",
                                                    useDouble ? "translate-x-6" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>
                                        {useDouble && (
                                            <div className="flex gap-2 p-1 bg-black/40 rounded-2xl border border-white/5">
                                                {[
                                                    { id: 'current', label: '당홀 배판' },
                                                    { id: 'next', label: '다음홀 배판' }
                                                ].map(mode => (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => setDoublingMode(mode.id as any)}
                                                        className={cn(
                                                            "flex-1 py-3 rounded-xl text-[11px] font-black transition-all",
                                                            doublingMode === mode.id ? "bg-[#64DD17] text-[#051907]" : "text-white/40"
                                                        )}
                                                    >
                                                        {mode.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    {/* 특별 상금 */}
                                    <section className="space-y-4">
                                        <div className="flex items-center justify-between px-1">
                                            <div className="flex items-center gap-2">
                                                <label className="text-sm font-black text-white italic uppercase tracking-tighter">버디/이글 보너스</label>
                                                <span className="text-[10px] font-bold text-white/50">상대 1명당 받아요</span>
                                            </div>
                                            <button
                                                onClick={() => setIsExtrasEnabled(!isExtrasEnabled)}
                                                className={cn(
                                                    "w-10 h-5 rounded-full transition-all duration-300 relative p-0.5",
                                                    isExtrasEnabled ? "bg-amber-400" : "bg-white/10"
                                                )}
                                                aria-label="특별 상금 활성화 토글"
                                                title="특별 상금 활성화"
                                            >
                                                <div className={cn(
                                                    "w-4 h-4 rounded-full bg-[#ffffff] transition-transform duration-300",
                                                    isExtrasEnabled ? "translate-x-5" : "translate-x-0"
                                                )} />
                                            </button>
                                        </div>

                                        <AnimatePresence>
                                            {isExtrasEnabled && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden space-y-3"
                                                >
                                                    <div className="bg-[#18181b] rounded-2xl border border-white/5 p-4 space-y-4">
                                                        {/* Birdie */}
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-md font-black text-white italic uppercase whitespace-nowrap">버디</span>
                                                            <div className="flex items-center gap-2 bg-black/40 rounded-xl px-3 py-2 border border-white/5 w-[180px]">
                                                                <input
                                                                    type="number"
                                                                    className="w-full bg-transparent text-right text-lg font-black text-amber-400 focus:outline-none placeholder:text-white/10"
                                                                    value={birdieAmount}
                                                                    onChange={(e) => setBirdieAmount(Math.min(100000, Math.max(0, Math.round(Number(e.target.value) || 0))))}
                                                                    aria-label="버디 상금"
                                                                    placeholder="10000"
                                                                />
                                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-tighter">{unit === 'KRW' ? '원' : 'P'}</span>
                                                            </div>
                                                        </div>

                                                        {/* Eagle */}
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-md font-black text-white italic uppercase whitespace-nowrap">이글</span>
                                                            <div className="flex items-center gap-2 bg-black/40 rounded-xl px-3 py-2 border border-white/5 w-[180px]">
                                                                <input
                                                                    type="number"
                                                                    className="w-full bg-transparent text-right text-lg font-black text-amber-400 focus:outline-none placeholder:text-white/10"
                                                                    value={eagleAmount}
                                                                    onChange={(e) => setEagleAmount(Math.min(200000, Math.max(0, Math.round(Number(e.target.value) || 0))))}
                                                                    aria-label="이글 상금"
                                                                    placeholder="20000"
                                                                />
                                                                <span className="text-[10px] font-black text-white/40 uppercase tracking-tighter">{unit === 'KRW' ? '원' : 'P'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </section>
                                </div>
                            )}
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
                                            <div key={i} className="flex flex-col items-center space-y-2">
                                                <div className={cn(
                                                    "w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-500",
                                                    player ? "bg-[#64DD17]/20 border-[#64DD17] shadow-lg" : "bg-white/5 border-white/10"
                                                )}>
                                                    {player ? <LucideCheckCircle2 className="w-5 h-5 text-[#64DD17]" /> : <LucideUsers className="w-4 h-4 text-white/10" />}
                                                </div>
                                                <p className={cn("text-[9px] font-black uppercase", player ? "text-[#64DD17]" : "text-white/20")}>
                                                    {player ? (i === 0 ? "방장" : player.isGuest ? "게스트" : "입장") : "대기"}
                                                </p>
                                                {player && <p className="text-[10px] font-bold text-white max-w-[50px] truncate">{player.name}</p>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mt-6 flex gap-2 w-full max-w-sm">
                                <Button variant="ghost" className="flex-1 h-12 rounded-2xl bg-white/5 border border-white/10 text-white font-bold" onClick={copyPin}>
                                    번호 복사
                                </Button>
                                <Button className="flex-[2] h-12 rounded-2xl bg-[#FAE100] hover:bg-[#F2D000] text-black font-black border-none" onClick={shareInvite}>
                                    초대 링크 보내기
                                </Button>
                            </div>
                            <p className="mt-4 text-xs text-white/50 font-bold leading-relaxed max-w-[270px] break-keep">
                                링크를 받은 동반자는 누르기만 하면 들어와요. 번호로는 홈의 [핀 번호 입력]에서 들어올 수 있어요.
                            </p>

                            <div className="mt-12 w-full max-w-sm">
                                {isHost ? (
                                    <Button
                                        className="w-full h-16 bg-[#64DD17] border-none text-[#051907] font-black text-lg rounded-2xl shadow-xl active:scale-95 transition-all"
                                        onClick={() => {
                                            apiRequest(`/api/hiq/golf/match/${activeSession.id}/start`, { method: "POST" })
                                                .then(() => setLocation(`/golf/game/${activeSession.id}`))
                                                .catch((e: any) => toast({ variant: "destructive", title: "시작하지 못했어요", description: e?.message }));
                                        }}
                                        disabled={!sessionInfo?.players || sessionInfo.players.length < 2}
                                    >
                                        {sessionInfo?.players?.length < 2 ? "참여 대기 중..." : "게임 시작"}
                                    </Button>
                                ) : (
                                    <div className="w-full h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                                        <div className="flex flex-col items-center">
                                            <LucideLoader2 className="w-5 h-5 text-[#64DD17] animate-spin mb-1" />
                                            <span className="text-xs text-white/60 font-bold">방장이 게임을 시작하길 기다리는 중...</span>
                                        </div>
                                    </div>
                                )}
                                {isHost && (
                                    <button onClick={abandonLobby} className="mt-3 w-full h-11 rounded-2xl text-[13px] font-bold text-[#FF6E6E] hover:bg-[#FF6E6E]/10">
                                        방 없애기
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {step === 'join' && (
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
                                            "h-16 rounded-2xl font-black text-xl transition-all active:scale-95",
                                            ['CLR', 'DEL'].includes(k) ? "bg-white/5 text-white/40" : "bg-white/10 text-white border border-white/10 hover:bg-white/20"
                                        )}
                                        aria-label={k === 'DEL' ? 'Delete' : k}
                                    >
                                        {k === 'DEL' ? <LucideX className="mx-auto w-5 h-5" /> : k}
                                    </button>
                                ))}
                            </div>

                            {joinMatch.isPending && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
                                    <LucideLoader2 className="w-10 h-10 text-[#64DD17] animate-spin" />
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {step === 'setup' && (
                <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#09090b] via-[#09090b]/95 to-transparent z-40">
                    <div className="max-w-md mx-auto">
                        {/* 왜 안 눌리는지 버튼이 말해 준다 — 예전엔 회색으로 죽어 있기만 했다(2026-09-10) */}
                        <Button
                            className="w-full h-16 bg-[#64DD17] text-[#09090b] font-black text-lg rounded-2xl shadow-xl shadow-[#64DD17]/20 border-none active:scale-[0.98] transition-all hover:bg-[#52c41a] disabled:opacity-50 disabled:grayscale"
                            onClick={() => { rememberTypedCourses(); createMatch.mutate(); }}
                            disabled={createMatch.isPending || !!setupMissing}
                        >
                            {createMatch.isPending ? <LucideLoader2 className="w-6 h-6 animate-spin" /> : (
                                <span>{setupMissing ?? (selectedGame === 'stroke' && strokeMode === 'solo' ? "기록 시작" : "방 만들기")}</span>
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
