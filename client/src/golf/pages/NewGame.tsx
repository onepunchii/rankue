import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideCheckCircle2,
    LucideSearch,
    LucideX,
    LucideUsers,
    LucideLoader2,
    LucideMapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMoneyUnit } from "../lib/money";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { GolfBackButton } from "../components/common/GolfBackButton";
import { CourseLogo } from "../components/course/CourseLogo";

// import { COURSES } from "@/golf/data/golfCourses"; // 더 이상 사용하지 않음
import { useDebounce } from "@/hooks/use-debounce";

const formatMoney = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount);

/**
 * 라운드 만들기(2026-09-24 둘째 판 — 오너: "유저가 손쉽게 만질 수 있는 화면인가? 더 콤팩트하게 … 전반·후반 체크도 어렵고
 * 골프장을 골라 주세요도 어렵고, 서치바에 가장 가까운 골프장 자동 검색 … 디자인 전면 수정").
 *
 * 무엇을 바꿨나:
 *  - **한 화면**. 큰 카드 여섯 장(골프장·게임 방식 2·기록 방식 2)을 세 줄로 — 골프장 · 코스 · 방식. 시작 단추는 바닥에 붙는다.
 *  - 골프장은 **검색창이 화면에 바로 있다**(따로 뜨는 창 없음). 비어 있으면 **가까운 골프장**(위치)과 **최근 친 곳**(이 기기)을 먼저 보여 준다.
 *  - 전반·후반은 드롭다운 대신 **칩 한 번**. 코스가 1~2개인 골프장은 자동으로 채운다(9홀짜리는 두 번 돈다).
 *  - 영어 대문자 제목·기울인 굵은 글씨(BATTLE FIELD·GAME MODE…)를 걷고 골프장 화면과 같은 말투로.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */

const RECENT_KEY = "rankue_golf_recent_clubs";
type ClubLite = { id: string; name: string; region?: string | null; logo?: string | null };
function readRecentClubs(): ClubLite[] {
    try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.slice(0, 5) : []; } catch { return []; }
}
function rememberRecentClub(c: ClubLite) {
    try {
        const next = [{ id: String(c.id), name: c.name, region: c.region ?? null, logo: c.logo ?? null }, ...readRecentClubs().filter((x) => String(x.id) !== String(c.id))].slice(0, 5);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* 저장소를 못 쓰는 환경 */ }
}
const kmText = (km?: number) => (km == null ? "" : km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`);

/** 두세 칸 고르기 — 고른 칸은 흰 면. */
function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
    return (
        <div className="flex rounded-full bg-[#FFFFFF0D] p-0.5" role="radiogroup">
            {options.map((o) => (
                <button
                    key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
                    className={cn(
                        "flex-1 h-10 rounded-full text-[14px] transition-colors",
                        value === o.v ? "bg-[#ffffff] text-[#0a0a0a] font-semibold" : "text-[#FFFFFFB3] font-medium active:text-[#ffffff]",
                    )}
                >{o.label}</button>
            ))}
        </div>
    );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button
            type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
            className={cn("shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors", on ? "bg-[#64DD17]" : "bg-[#FFFFFF24]")}
        >
            <span className={cn("block w-6 h-6 rounded-full bg-[#ffffff] transition-transform", on ? "translate-x-5" : "translate-x-0")} />
        </button>
    );
}

function Label({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-[13px] font-semibold text-[#FFFFFF99]">{children}</h2>
            {right}
        </div>
    );
}

/** 골프장 한 줄 — 검색 결과·가까운 곳·최근 공용 */
function ClubRow({ club, onPick }: { club: any; onPick: (c: any) => void }) {
    return (
        <li>
            <button type="button" onClick={() => onPick(club)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[#FFFFFF0A]">
                {/* 골프장 로고(골프장 페이지와 같은 흰 판) — 없으면 이름 글자. 위치 핀보다 어느 곳인지 한눈에 보인다(2026-09-24 오너) */}
                <CourseLogo logo={club.logo} name={club.name} size="sm" className="w-10 h-10" />
                <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium text-[#ffffff] truncate">{club.name}</span>
                    {club.region && <span className="block text-[12.5px] text-[#FFFFFF73] truncate">{club.region}</span>}
                </span>
                {club.distance != null && <span className="shrink-0 text-[13px] text-[#FFFFFF8C] tabular-nums">{kmText(club.distance)}</span>}
            </button>
        </li>
    );
}

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
        enabled: !selectedCourseData,
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

    // 코스가 1~2개면 고를 게 없다 — 1개(9홀)는 두 번 돌고, 2개는 앞·뒤로. 이미 고른 값은 건드리지 않는다.
    useEffect(() => {
        if (!selectedCourseData || selectedFrontCourse || selectedBackCourse) return;
        if (subCourses.length === 1) { setSelectedFrontCourse(subCourses[0].name); setSelectedBackCourse(subCourses[0].name); }
        else if (subCourses.length === 2) { setSelectedFrontCourse(subCourses[0].name); setSelectedBackCourse(subCourses[1].name); }
    }, [selectedCourseData, subCourses, selectedFrontCourse, selectedBackCourse]);

    const pickClub = useCallback((c: any) => {
        // 골프장을 바꾸면 전반/후반도 비운다 — 예전엔 앞 골프장의 코스 이름이 남아 엉뚱한 코스로 방이 만들어졌고 파가 전부 기본값이 됐다.
        if (c?.id !== selectedCourseData?.id) { setSelectedFrontCourse(""); setSelectedBackCourse(""); }
        setSelectedCourseData(c);
        setCourseSearch("");
    }, [selectedCourseData?.id]);
    const [recentClubs] = useState<ClubLite[]>(readRecentClubs);
    const nearClubs = useMemo(() => (dbClubs ?? []).filter((c: any) => c.distance != null).slice(0, 5), [dbClubs]);

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
            if (selectedCourseData) rememberRecentClub(selectedCourseData);
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
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-36 font-sans relative">

            {/* 머리 — 뒤로 + 제목 한 줄(골프 화면 공통 말투) */}
            <header className="sticky top-0 z-40 bg-[#0A0A0AE6] backdrop-blur-md border-b border-[#FFFFFF0F]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
                <div className="h-14 px-3 flex items-center gap-1.5">
                    <GolfBackButton onClick={handleBack} label="뒤로 가기" className="-ml-1" />
                    <h1 className="text-[17px] font-semibold tracking-tight text-[#ffffff]">
                        {step === 'lobby' ? "대기실" : step === 'join' ? "코드로 입장" : "라운드 만들기"}
                    </h1>
                </div>
            </header>

            <main className="relative z-10">

                <AnimatePresence mode="wait">
                    {step === 'setup' && (
                        <motion.div
                            key="setup"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="max-w-md mx-auto px-5 pt-5 pb-10 space-y-7"
                        >
                            {/* ── 골프장 ── 검색창이 화면에 바로 있다. 비어 있으면 가까운 곳·최근 친 곳 */}
                            <section>
                                <Label>골프장</Label>
                                {selectedCourseData ? (
                                    <div className="flex items-center gap-3 rounded-2xl bg-[#FFFFFF0A] ring-1 ring-inset ring-[#64DD174D] px-4 py-3.5">
                                        <CourseLogo logo={selectedCourseData.logo} name={selectedCourseData.name} size="sm" />
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-[16px] font-semibold text-[#ffffff] truncate">{selectedCourseData.name}</span>
                                            <span className="block text-[12.5px] text-[#FFFFFF80] truncate tabular-nums">
                                                {[selectedCourseData.region, kmText(selectedCourseData.distance), subCourses.length ? `코스 ${subCourses.length}개` : ""].filter(Boolean).join(" · ")}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedCourseData(null); setSelectedFrontCourse(""); setSelectedBackCourse(""); }}
                                            className="shrink-0 h-9 px-3.5 rounded-full bg-[#FFFFFF14] text-[13px] font-medium text-[#ffffff] active:bg-[#FFFFFF24]"
                                        >바꾸기</button>
                                    </div>
                                ) : (
                                    <>
                                        <label className="h-12 rounded-2xl bg-[#FFFFFF0D] flex items-center gap-2.5 px-4 ring-1 ring-inset ring-transparent focus-within:ring-[#64DD1780]">
                                            <LucideSearch className="w-[18px] h-[18px] text-[#FFFFFF66] shrink-0" />
                                            <input
                                                type="text" enterKeyHint="search"
                                                value={courseSearch}
                                                onChange={(e) => setCourseSearch(e.target.value)}
                                                placeholder="골프장 이름·지역 (예: 레이크사이드, 용인)"
                                                aria-label="골프장 검색"
                                                className="flex-1 min-w-0 bg-transparent text-[15px] text-[#ffffff] placeholder:text-[#FFFFFF59] focus:outline-none"
                                            />
                                            {courseSearch && (
                                                <button type="button" onClick={() => setCourseSearch("")} aria-label="지우기" className="w-7 h-7 -mr-1.5 rounded-full flex items-center justify-center bg-[#FFFFFF14]">
                                                    <LucideX className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </label>

                                        {debouncedSearch ? (
                                            // 검색 결과 — 가까운 순(위치가 있으면 서버가 거리로 정렬한다)
                                            <ul className="mt-2 rounded-2xl bg-[#FFFFFF08] divide-y divide-[#FFFFFF0F] overflow-hidden">
                                                {(dbClubs ?? []).slice(0, 12).map((c: any) => <ClubRow key={c.id} club={c} onPick={pickClub} />)}
                                                {dbClubs && dbClubs.length === 0 && (
                                                    <li className="px-4 py-5 text-[13px] text-[#FFFFFF73]">'{debouncedSearch}'(으)로 찾은 골프장이 없어요.</li>
                                                )}
                                                {!dbClubs && <li className="px-4 py-5 text-[13px] text-[#FFFFFF59]">찾는 중…</li>}
                                            </ul>
                                        ) : (
                                            <div className="mt-4 space-y-4">
                                                {recentClubs.length > 0 && (
                                                    <div>
                                                        <p className="mb-2 text-[12px] text-[#FFFFFF73]">최근 친 곳</p>
                                                        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-5 px-5">
                                                            {recentClubs.map((c) => (
                                                                <button
                                                                    key={c.id} type="button" onClick={() => pickClub(c)}
                                                                    className="shrink-0 h-9 px-3.5 rounded-full bg-[#FFFFFF0D] text-[13.5px] font-medium text-[#FFFFFFD9] active:bg-[#FFFFFF1A] whitespace-nowrap"
                                                                >{c.name}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="mb-2 text-[12px] text-[#FFFFFF73]">가까운 골프장</p>
                                                    {nearClubs.length > 0 ? (
                                                        <ul className="rounded-2xl bg-[#FFFFFF08] divide-y divide-[#FFFFFF0F] overflow-hidden">
                                                            {nearClubs.map((c: any) => <ClubRow key={c.id} club={c} onPick={pickClub} />)}
                                                        </ul>
                                                    ) : (
                                                        <button
                                                            type="button" onClick={() => requestLocation()}
                                                            className="w-full h-12 rounded-2xl bg-[#FFFFFF08] text-[14px] font-medium text-[#FFFFFFCC] inline-flex items-center justify-center gap-2 active:bg-[#FFFFFF0F]"
                                                        >
                                                            <LucideMapPin className="w-4 h-4 text-[#8BE84A]" />내 위치로 가까운 골프장 찾기
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </section>

                            {/* ── 코스 ── 드롭다운 대신 칩 한 번. 1~2개면 위에서 자동으로 채웠다. */}
                            {selectedCourseData && (
                                <section>
                                    <Label right={subCourses.length > 1 && selectedFrontCourse && selectedBackCourse ? (
                                        <button
                                            type="button"
                                            onClick={() => { const f = selectedFrontCourse; setSelectedFrontCourse(selectedBackCourse); setSelectedBackCourse(f); }}
                                            className="text-[12.5px] text-[#FFFFFF99] active:text-[#ffffff]"
                                        >앞뒤 바꾸기 ⇄</button>
                                    ) : undefined}>코스</Label>
                                    {/* 전국 634곳 중 317곳은 코스 구성 자료가 없다 — 직접 적으면 원장에 남아 다음 사람은 고르기만 한다(2026-09-10). */}
                                    {subCourses.length === 0 ? (
                                        <div className="space-y-2">
                                            <p className="text-[12.5px] text-[#FFFFFF80]">코스 정보가 아직 없어요. 오늘 도는 코스를 적어 주세요.</p>
                                            <div className="flex gap-2">
                                                <input
                                                    value={selectedFrontCourse}
                                                    onChange={(e) => setSelectedFrontCourse(e.target.value.slice(0, 20))}
                                                    placeholder="전반 (예: 동코스)" aria-label="전반 코스 이름"
                                                    className="flex-1 min-w-0 h-12 rounded-xl bg-[#FFFFFF0D] px-3.5 text-[15px] text-[#ffffff] placeholder:text-[#FFFFFF59] focus:outline-none focus:ring-1 focus:ring-[#64DD1780]"
                                                />
                                                <input
                                                    value={selectedBackCourse}
                                                    onChange={(e) => setSelectedBackCourse(e.target.value.slice(0, 20))}
                                                    placeholder="후반 (예: 서코스)" aria-label="후반 코스 이름"
                                                    className="flex-1 min-w-0 h-12 rounded-xl bg-[#FFFFFF0D] px-3.5 text-[15px] text-[#ffffff] placeholder:text-[#FFFFFF59] focus:outline-none focus:ring-1 focus:ring-[#64DD1780]"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {([["전반", selectedFrontCourse, setSelectedFrontCourse], ["후반", selectedBackCourse, setSelectedBackCourse]] as const).map(([half, val, set]) => (
                                                <div key={half} className="flex items-center gap-3">
                                                    <span className="w-9 shrink-0 text-[13px] text-[#FFFFFF8C]">{half}</span>
                                                    <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto scrollbar-hide">
                                                        {subCourses.map((c: any) => (
                                                            <button
                                                                key={c.id} type="button" aria-pressed={val === c.name} onClick={() => set(c.name)}
                                                                className={cn(
                                                                    "shrink-0 h-10 px-4 rounded-full text-[14px] whitespace-nowrap transition-colors",
                                                                    val === c.name ? "bg-[#ffffff] text-[#0a0a0a] font-semibold" : "bg-[#FFFFFF0D] text-[#FFFFFFB3] font-medium active:bg-[#FFFFFF1A]",
                                                                )}
                                                            >{c.name}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            )}

                            {/* ── 방식 ── 큰 카드 넷 → 작은 토글 둘 */}
                            <section className="space-y-3">
                                <Label>방식</Label>
                                <Segmented
                                    value={selectedGame}
                                    onChange={setSelectedGame}
                                    options={[{ v: 'stroke', label: "스트로크" }, { v: 'skins', label: "타당 게임" }]}
                                />
                                {selectedGame === 'stroke' ? (
                                    <>
                                        <Segmented
                                            value={strokeMode}
                                            onChange={setStrokeMode}
                                            options={[{ v: 'group', label: "함께 기록" }, { v: 'solo', label: "혼자 기록" }]}
                                        />
                                        <p className="text-[12.5px] text-[#FFFFFF73] px-1">
                                            {strokeMode === 'group' ? "동반자와 같은 점수판을 봐요. 핀번호로 들어와요." : "나 혼자 스코어만 적어요. 바로 시작해요."}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-[12.5px] text-[#FFFFFF73] px-1">홀마다 타수 차이만큼 포인트를 주고받아요.</p>
                                )}
                            </section>

                            {/* ── 타당 설정 ── 한 상자 안에 세 줄 */}
                            {selectedGame === 'skins' && (
                                <section>
                                    <Label>포인트</Label>
                                    <div className="rounded-2xl bg-[#FFFFFF08] divide-y divide-[#FFFFFF0F]">
                                        <div className="px-4 py-3.5">
                                            <p className="text-[13px] text-[#FFFFFF99] mb-2.5">1타당</p>
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {[1000, 5000, 10000, 20000].map((amount) => (
                                                    <button
                                                        key={amount} type="button" aria-pressed={stake === amount} onClick={() => setStake(amount)}
                                                        className={cn(
                                                            "h-10 rounded-xl text-[13.5px] tabular-nums transition-colors",
                                                            stake === amount ? "bg-[#ffffff] text-[#0a0a0a] font-semibold" : "bg-[#FFFFFF0D] text-[#FFFFFFB3] font-medium",
                                                        )}
                                                    >{amount >= 10000 ? `${amount / 10000}만` : `${amount / 1000}천`}{unit === 'KRW' ? '원' : 'P'}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="px-4 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-[14px] font-medium text-[#ffffff]">배판</span>
                                                    <span className="block text-[12px] text-[#FFFFFF73]">버디·트리플이 나오면 판을 두 배로</span>
                                                </span>
                                                <Toggle on={useDouble} onChange={setUseDouble} label="배판" />
                                            </div>
                                            {useDouble && (
                                                <div className="mt-3">
                                                    <Segmented
                                                        value={doublingMode}
                                                        onChange={setDoublingMode}
                                                        options={[{ v: 'next', label: "다음 홀부터" }, { v: 'current', label: "그 홀부터" }]}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <div className="px-4 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-[14px] font-medium text-[#ffffff]">버디·이글 보너스</span>
                                                    <span className="block text-[12px] text-[#FFFFFF73]">상대 1명당 받아요</span>
                                                </span>
                                                <Toggle on={isExtrasEnabled} onChange={setIsExtrasEnabled} label="버디·이글 보너스" />
                                            </div>
                                            {isExtrasEnabled && (
                                                <div className="mt-3 grid grid-cols-2 gap-2">
                                                    {([["버디", birdieAmount, setBirdieAmount, 100000], ["이글", eagleAmount, setEagleAmount, 200000]] as const).map(([lbl, val, set, max]) => (
                                                        <label key={lbl} className="h-12 rounded-xl bg-[#FFFFFF0D] px-3.5 flex items-center gap-2">
                                                            <span className="text-[13px] text-[#FFFFFF99] shrink-0">{lbl}</span>
                                                            <input
                                                                type="number" inputMode="numeric" value={val}
                                                                onChange={(e) => set(Math.min(max, Math.max(0, Math.round(Number(e.target.value) || 0))))}
                                                                aria-label={`${lbl} 보너스`}
                                                                className="flex-1 min-w-0 bg-transparent text-right text-[15px] font-semibold text-[#ffffff] tabular-nums focus:outline-none"
                                                            />
                                                            <span className="text-[12px] text-[#FFFFFF73] shrink-0">{unit === 'KRW' ? '원' : 'P'}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* ── 앱 없는 동반자 ── 이름만으로 점수판에(기록·통계엔 안 들어간다). 예전엔 한 명만 앱이 없어도 랭큐매치를 못 썼다. */}
                            {!isSolo && (
                                <section>
                                    <Label right={<span className="text-[12px] text-[#FFFFFF59] tabular-nums">{guestNames.length}/3</span>}>앱 없는 동반자</Label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {guestNames.map((n, i) => (
                                            <span key={`${n}-${i}`} className="inline-flex items-center gap-0.5 h-10 pl-3.5 pr-1 rounded-full bg-[#FFFFFF14] text-[14px] font-medium text-[#ffffff]">
                                                {n}
                                                <button type="button" onClick={() => setGuestNames((g) => g.filter((_, j) => j !== i))} aria-label={`${n} 빼기`} className="w-8 h-8 flex items-center justify-center rounded-full active:bg-[#FFFFFF1A]">
                                                    <LucideX className="w-3.5 h-3.5" />
                                                </button>
                                            </span>
                                        ))}
                                        {guestNames.length < 3 && (
                                            <form
                                                className="flex-1 min-w-[150px] flex h-10 rounded-full bg-[#FFFFFF0D] pl-4 pr-1 items-center"
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
                                                    placeholder="이름 추가"
                                                    aria-label="앱 없는 동반자 이름"
                                                    className="flex-1 min-w-0 bg-transparent text-[14px] text-[#ffffff] placeholder:text-[#FFFFFF59] focus:outline-none"
                                                />
                                                <button type="submit" disabled={!guestDraft.trim()} className="h-8 px-3 rounded-full bg-[#FFFFFF1A] text-[13px] font-medium text-[#ffffff] disabled:opacity-40">추가</button>
                                            </form>
                                        )}
                                    </div>
                                    <p className="mt-2 text-[12px] text-[#FFFFFF59] break-keep">점수는 방장이 적고 기록은 남지 않아요. 앱으로 들어오는 사람과 합쳐 최대 4명.</p>
                                </section>
                            )}
                        </motion.div>
                    )}

                    {step === 'lobby' && (
                        <motion.div
                            key="lobby"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-w-md mx-auto px-5 pt-6 pb-10"
                        >
                            {/* 핀번호 한 장 — 숫자가 주인공. 네온 그림자·기울인 굵은 글씨는 걷었다(2026-09-24) */}
                            <section className="rounded-3xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] px-5 pt-5 pb-6 text-center">
                                <p className="text-[13px] text-[#FFFFFF8C]">핀번호</p>
                                <p className="mt-1 text-[56px] leading-none font-bold tracking-[0.18em] text-[#ffffff] tabular-nums pl-[0.18em]">{activeSession?.pinCode}</p>
                                <p className="mt-3 text-[13px] text-[#FFFFFFB3] truncate">
                                    {[activeSession?.courseName, activeSession?.frontCourseName && activeSession?.backCourseName ? `${activeSession.frontCourseName} → ${activeSession.backCourseName}` : ""].filter(Boolean).join(" · ")}
                                </p>
                                <div className="mt-5 flex gap-2">
                                    <button type="button" onClick={copyPin} className="flex-1 h-11 rounded-full bg-[#FFFFFF14] text-[14px] font-medium text-[#ffffff] active:bg-[#FFFFFF24]">번호 복사</button>
                                    <button type="button" onClick={shareInvite} className="flex-[1.6] h-11 rounded-full bg-[#FAE100] text-[14px] font-semibold text-[#1A1600] active:bg-[#F2D000]">초대 링크 보내기</button>
                                </div>
                                <p className="mt-3 text-[12px] text-[#FFFFFF66] break-keep">링크를 받은 동반자는 누르기만 하면 들어와요. 번호는 홈의 [핀 번호 입력]에서.</p>
                            </section>

                            {/* 자리 넷 — 한 줄에 한 사람 */}
                            <section className="mt-6">
                                <div className="flex items-center justify-between mb-2.5">
                                    <h2 className="text-[13px] font-semibold text-[#FFFFFF99]">함께하는 사람</h2>
                                    <span className="text-[12px] text-[#FFFFFF59] tabular-nums">{sessionInfo?.players?.length ?? 1}/4</span>
                                </div>
                                <ul className="rounded-2xl bg-[#FFFFFF08] divide-y divide-[#FFFFFF0F]">
                                    {[0, 1, 2, 3].map((i) => {
                                        const player = sessionInfo?.players?.[i];
                                        return (
                                            <li key={i} className="flex items-center gap-3 px-4 h-14">
                                                <span className={cn(
                                                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                                    player ? "bg-[#64DD171F]" : "bg-[#FFFFFF0A] ring-1 ring-inset ring-dashed ring-[#FFFFFF26]",
                                                )}>
                                                    {player ? <LucideCheckCircle2 className="w-4 h-4 text-[#8BE84A]" /> : <LucideUsers className="w-3.5 h-3.5 text-[#FFFFFF40]" />}
                                                </span>
                                                <span className={cn("flex-1 min-w-0 truncate text-[15px]", player ? "font-medium text-[#ffffff]" : "text-[#FFFFFF59]")}>
                                                    {player ? player.name : "기다리는 중"}
                                                </span>
                                                {player && (
                                                    <span className="shrink-0 h-6 px-2 rounded-md bg-[#FFFFFF0F] text-[12px] text-[#FFFFFFB3] leading-6">
                                                        {i === 0 ? "방장" : player.isGuest ? "앱 없음" : "입장"}
                                                    </span>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>

                            <div className="mt-8">
                                {isHost ? (
                                    <button
                                        type="button"
                                        className="w-full h-14 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#E85200] shadow-lg shadow-[#FF6B00]/20 text-[#ffffff] text-[16px] font-semibold active:opacity-90 disabled:bg-none disabled:bg-[#FFFFFF14] disabled:shadow-none disabled:text-[#FFFFFF73]"
                                        onClick={() => {
                                            apiRequest(`/api/hiq/golf/match/${activeSession.id}/start`, { method: "POST" })
                                                .then(() => setLocation(`/golf/game/${activeSession.id}`))
                                                .catch((e: any) => toast({ variant: "destructive", title: "시작하지 못했어요", description: e?.message }));
                                        }}
                                        disabled={!sessionInfo?.players || sessionInfo.players.length < 2}
                                    >
                                        {sessionInfo?.players?.length < 2 ? "동반자를 기다리는 중…" : "라운드 시작"}
                                    </button>
                                ) : (
                                    <div className="w-full h-14 rounded-2xl bg-[#FFFFFF08] flex items-center justify-center gap-2 text-[14px] text-[#FFFFFFB3]">
                                        <LucideLoader2 className="w-4 h-4 text-[#8BE84A] animate-spin" />방장이 시작하길 기다리는 중
                                    </div>
                                )}
                                {isHost && (
                                    <button type="button" onClick={abandonLobby} className="mt-2 w-full h-11 rounded-2xl text-[13px] font-medium text-[#FF6E6E] active:bg-[#FF6E6E14]">
                                        방 없애기
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {step === 'join' && (
                        <motion.div
                            key="join"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-w-md mx-auto px-5 pt-10 pb-10 flex flex-col"
                        >
                            <div className="text-center mb-8">
                                <h2 className="text-[22px] font-bold tracking-tight text-[#ffffff]">핀번호 4자리</h2>
                                <p className="mt-1 text-[14px] text-[#FFFFFF8C]">방장이 알려 준 숫자를 눌러 주세요</p>
                            </div>

                            <div className="flex justify-center gap-3 mb-10">
                                {[0, 1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "w-14 h-[72px] rounded-2xl flex items-center justify-center text-[32px] font-bold tabular-nums transition-colors",
                                            pinEntry[i] ? "bg-[#FFFFFF14] text-[#ffffff] ring-1 ring-inset ring-[#64DD1780]"
                                                : i === pinEntry.length ? "bg-[#FFFFFF0A] ring-1 ring-inset ring-[#FFFFFF40]" : "bg-[#FFFFFF0A]",
                                        )}
                                    >
                                        {pinEntry[i] ?? ""}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-3 gap-2.5 w-full">
                                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'].map((k) => (
                                    <button
                                        key={k}
                                        type="button"
                                        onClick={() => {
                                            if (k === 'CLR') setPinEntry([]);
                                            else if (k === 'DEL') setPinEntry(prev => prev.slice(0, -1));
                                            else handlePinPress(k);
                                        }}
                                        className={cn(
                                            "h-16 rounded-2xl transition-colors active:bg-[#FFFFFF24]",
                                            ['CLR', 'DEL'].includes(k) ? "bg-transparent text-[15px] font-medium text-[#FFFFFF99]" : "bg-[#FFFFFF0D] text-[24px] font-semibold text-[#ffffff] tabular-nums",
                                        )}
                                        aria-label={k === 'DEL' ? '한 칸 지우기' : k === 'CLR' ? '모두 지우기' : k}
                                    >
                                        {k === 'DEL' ? "⌫" : k === 'CLR' ? "모두 지우기" : k}
                                    </button>
                                ))}
                            </div>

                            {joinMatch.isPending && (
                                <div className="fixed inset-0 bg-[#000000A6] flex items-center justify-center z-50">
                                    <LucideLoader2 className="w-9 h-9 text-[#8BE84A] animate-spin" />
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {step === 'setup' && (
                <div className="fixed bottom-0 inset-x-0 z-40 bg-[#0A0A0AF2] border-t border-[#FFFFFF14] px-5 pt-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                    <div className="max-w-md mx-auto">
                        {/* 무엇으로 시작하는지 한 줄 — 누르기 전에 확인 */}
                        {selectedCourseData && (
                            <p className="mb-2 text-[12.5px] text-[#FFFFFF8C] truncate text-center tabular-nums">
                                {[selectedCourseData.name, selectedFrontCourse && selectedBackCourse ? `${selectedFrontCourse} → ${selectedBackCourse}` : "", selectedGame === 'skins' ? `타당 ${formatMoney(stake)}${unit === 'KRW' ? '원' : 'P'}` : isSolo ? "혼자 기록" : "함께 기록"].filter(Boolean).join(" · ")}
                            </p>
                        )}
                        {/* 왜 안 눌리는지 버튼이 말해 준다 — 예전엔 회색으로 죽어 있기만 했다(2026-09-10). 주황 = 골프 포인트 색(2026-09-24 오너) */}
                        <button
                            type="button"
                            className="w-full h-14 rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#E85200] shadow-lg shadow-[#FF6B00]/20 text-[#ffffff] text-[16px] font-semibold active:opacity-90 disabled:bg-none disabled:bg-[#FFFFFF14] disabled:shadow-none disabled:text-[#FFFFFF73] inline-flex items-center justify-center"
                            onClick={() => { rememberTypedCourses(); createMatch.mutate(); }}
                            disabled={createMatch.isPending || !!setupMissing}
                        >
                            {createMatch.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : (setupMissing ?? (isSolo ? "기록 시작" : "방 만들기"))}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
