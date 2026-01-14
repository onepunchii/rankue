import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, XCircle, ArrowRight, Brain, Share2, Award } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { useAuth } from "@/contexts/AuthContext";

interface Question {
    id: number;
    category: string;
    level: number;
    content: {
        q: string;
        options: string[];
        answer: string;
    };
}

interface QuizResult {
    correct: boolean;
    userRating: number;
    correctAnswer?: string;
    explanation: string;
}

interface BrainStats {
    level: number;
    iq: number;
    totalScore: number;
    ratings: {
        logic: number;
        math: number;
        verbal: number;
        economy: number;
        trivia: number;
    };
    report: {
        title: string;
        topPercent: string;
        comment: string;
        icon: string;
    };
    topPercent: number;
}

export default function BrainQuiz() {
    const [_, setLocation] = useLocation();
    const queryClient = useQueryClient();
    const { user } = useAuth();

    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [result, setResult] = useState<QuizResult | null>(null);
    const [score, setScore] = useState(0);
    const [isFinished, setIsFinished] = useState(false);

    // Fetch Quiz
    const { data: qData, isLoading: isQuizLoading, isError, error } = useQuery<{ questions: Question[] }>({
        queryKey: ["dailyQuiz"],
        queryFn: async () => {
            console.log("[BrainQuiz] Query started...");

            // Helper to get token with fallback
            const getToken = async () => {
                try {
                    console.log("[BrainQuiz] Getting session...");

                    // Race Supabase getSession with a 2s timeout
                    const sessionPromise = supabase.auth.getSession();
                    const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
                        setTimeout(() => resolve({ data: { session: null } }), 2000)
                    );

                    const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
                    if (session?.access_token) return session.access_token;

                    console.warn("[BrainQuiz] supabase.auth.getSession() timed out or empty, checking LocalStorage...");

                    // Fallback: Manually check LocalStorage
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('sb-') && key.includes('auth-token')) {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                if (parsed.access_token) return parsed.access_token;
                            }
                        }
                    }
                } catch (e) {
                    console.error("[BrainQuiz] Token retrieval error:", e);
                }
                return null;
            };

            const token = await getToken();
            console.log("[BrainQuiz] Token exists?", !!token);

            const headers: Record<string, string> = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Add timeout for the FETCH itself
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 10000);

            try {
                console.log("[BrainQuiz] Fetching /api/quiz/daily...");
                const res = await fetch("/api/quiz/daily", {
                    headers,
                    signal: controller.signal
                });
                clearTimeout(id);

                console.log("[BrainQuiz] Response status:", res.status);

                if (!res.ok) {
                    const text = await res.text();
                    try {
                        const json = JSON.parse(text);
                        throw new Error(json.error || `Server Error: ${res.status}`);
                    } catch (e) {
                        throw new Error(text || `Server Error: ${res.status}`);
                    }
                }
                const data = await res.json();
                console.log("[BrainQuiz] Data received, questions:", data.questions?.length);
                return data;
            } catch (err) {
                console.error("[BrainQuiz] Fetch Error:", err);
                throw err;
            }
        },
        refetchOnWindowFocus: false,
        staleTime: 0,
        retry: 1, // Do not retry infinitely
    });

    const questions = qData?.questions || [];
    const currentQuestion = questions[currentIndex];

    // Fetch Stats (Only when finished)
    const { data: stats, isLoading: isStatsLoading, isError: isStatsError, error: statsError, refetch: refetchStats } = useQuery<BrainStats>({
        queryKey: ["brainStatsForReport"],
        queryFn: async () => {
            console.log("[BrainQuiz] Fetching stats...");

            // Helper to get token with fallback (Inline to avoid dependency issues)
            const getToken = async () => {
                try {
                    const sessionPromise = supabase.auth.getSession();
                    const timeoutPromise = new Promise<{ data: { session: null } }>((resolve) =>
                        setTimeout(() => resolve({ data: { session: null } }), 1000)
                    );
                    const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);
                    if (session?.access_token) return session.access_token;

                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('sb-') && key.includes('auth-token')) {
                            const raw = localStorage.getItem(key);
                            if (raw) {
                                const parsed = JSON.parse(raw);
                                if (parsed.access_token) return parsed.access_token;
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Token fetch failed", e);
                }
                return null;
            };

            const token = await getToken();
            const headers: Record<string, string> = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch("/api/user/stats", { headers });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to fetch stats");
            }
            return res.json();
        },
        enabled: isFinished, // trigger only when finished
        retry: 2
    });

    // Submit Mutation
    const submitMutation = useMutation({
        mutationFn: async (option: string) => {
            // [Auth Fix] Get token manually
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const headers: Record<string, string> = {
                "Content-Type": "application/json"
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch("/api/quiz/submit", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    questionId: currentQuestion.id,
                    answer: option,
                    timeTaken: 10 // Mock implementation
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                try {
                    const json = JSON.parse(text);
                    throw new Error(json.error || "Submit failed");
                } catch (e) {
                    throw new Error(text || "Submit failed");
                }
            }
            return res.json() as Promise<QuizResult>;
        },
        onSuccess: (data) => {
            setResult(data);
            if (data.correct) setScore(p => p + 1);
        },
        onError: (error) => {
            console.error("Submit Error:", error);
            // Optional: Show toast or alert?
            // Since UI locks up if no result, we should probably reset selection or show error
            setSelectedOption(null); // Unlock UI so user can try again?
            alert("정답 제출 실패: " + (error instanceof Error ? error.message : "알 수 없는 오류"));
        }
    });

    const handleOptionClick = (option: string) => {
        if (selectedOption) return;
        setSelectedOption(option);
        submitMutation.mutate(option);
    };

    const handleNext = () => {
        setSelectedOption(null);
        setResult(null);
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(p => p + 1);
        } else {
            setIsFinished(true);
            queryClient.invalidateQueries({ queryKey: ["brainStats"] });
        }
    };

    // Chart Data Helper
    const getChartData = (s: BrainStats) => [
        { subject: '논리', A: s.ratings.logic, fullMark: 2000 },
        { subject: '수리', A: s.ratings.math, fullMark: 2000 },
        { subject: '언어', A: s.ratings.verbal, fullMark: 2000 },
        { subject: '경제', A: s.ratings.economy, fullMark: 2000 },
        { subject: '상식', A: s.ratings.trivia, fullMark: 2000 },
    ];

    if (isQuizLoading) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                <p className="text-white/50 text-sm animate-pulse">두뇌 가동 중...</p>
            </div>
        );
    }

    if (isError || questions.length === 0) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-6 text-center">
                <Brain className="w-16 h-16 text-white/20 mb-4" />
                <h2 className="text-xl font-bold mb-2">문제를 불러올 수 없습니다.</h2>
                <p className="text-red-400 text-sm mb-6 max-w-xs mx-auto breaking-words">
                    {error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."}
                </p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                    <Button onClick={() => window.location.reload()} className="w-full bg-white text-black hover:bg-gray-200">
                        다시 시도
                    </Button>
                    <Button variant="outline" onClick={() => setLocation('/brain-ranking')} className="w-full border-white/20 text-white hover:bg-white/10">
                        뒤로 가기
                    </Button>
                </div>
            </div>
        );
    }

    // Finished View - Brain Passport
    if (isFinished) {
        if (isStatsError) {
            return (
                <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-6 text-center">
                    <XCircle className="w-12 h-12 text-red-500 mb-4" />
                    <h2 className="text-xl font-bold mb-2">결과 리포트 생성 실패</h2>
                    <p className="text-white/60 text-sm mb-6 max-w-xs">{statsError instanceof Error ? statsError.message : "알 수 없는 오류"}</p>
                    <Button onClick={() => refetchStats()} variant="secondary">다시 시도</Button>
                </div>
            )
        }

        if (isStatsLoading || !stats) {
            return (
                <div className="min-h-screen bg-black flex items-center justify-center flex-col gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-white/50" />
                    <p className="text-white/50 text-sm animate-pulse">결과 분석 중...</p>
                </div>
            );
        }

        return (
            <div className="min-h-screen bg-black text-white p-4 flex flex-col items-center justify-center relative overflow-hidden font-sans">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-black to-black"></div>

                <div className="z-10 w-full max-w-md space-y-6">
                    {/* Header */}
                    <div className="text-center mb-6">
                        <motion.h1
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500"
                        >
                            MY BRAIN PASSPORT
                        </motion.h1>
                        <p className="text-white/50 text-sm mt-1">두뇌 진단 리포트</p>
                    </div>

                    {/* Passport Card */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="bg-[#1a1a20] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
                    >
                        {/* Background Deco */}
                        <div className="absolute top-0 right-0 p-3 opacity-20">
                            <Brain className="w-32 h-32 text-indigo-500 transform rotate-12" />
                        </div>

                        {/* Top Section */}
                        <div className="flex items-start justify-between mb-6 relative z-10">
                            <div>
                                <div className="text-sm text-white/40 mb-1">NAME</div>
                                <div className="text-xl font-bold">{user?.nickname || "익명"}</div>
                                <div className="text-xs text-indigo-400 font-bold mt-1">LEVEL {stats.level}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm text-white/40 mb-1">BRAIN IQ</div>
                                <div className="text-4xl font-black text-white tracking-tighter shadow-indigo-500/50 drop-shadow-lg">
                                    {stats.iq}
                                </div>
                                <div className="text-xs text-green-400 font-bold">{stats.report.topPercent}</div>
                            </div>
                        </div>

                        <div className="h-px bg-white/10 my-4"></div>

                        {/* Title Section */}
                        <div className="flex items-center gap-4 mb-6">
                            <div className="text-5xl">{stats.report.icon}</div>
                            <div>
                                <div className="text-xs text-indigo-300 font-bold tracking-widest mb-1">TITLE</div>
                                <div className="text-xl font-bold text-white leading-tight">
                                    {stats.report.title}
                                </div>
                            </div>
                        </div>

                        {/* Comment */}
                        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/5">
                            <div className="text-xs text-white/40 mb-2 font-bold uppercase">Evaluator's Note</div>
                            <p className="text-sm text-white/80 leading-relaxed italic">
                                "{stats.report.comment}"
                            </p>
                        </div>

                        {/* Radar Chart */}
                        <div className="h-48 w-full relative">
                            <div className="absolute top-0 left-0 text-xs font-bold text-white/20">ABILITIES</div>
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getChartData(stats)}>
                                    <PolarGrid stroke="#3f3f46" strokeDasharray="3 3" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 2000]} tick={false} axisLine={false} />
                                    <Radar
                                        name="Stats"
                                        dataKey="A"
                                        stroke="#818cf8"
                                        fill="#818cf8"
                                        fillOpacity={0.4}
                                    />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 mt-8">
                        <Button
                            className="flex-1 bg-white text-black hover:bg-gray-200 h-12 font-bold"
                            onClick={() => setLocation('/brain-ranking')}
                        >
                            랭킹 확인
                        </Button>
                        <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700 h-12 font-bold">
                            <Share2 className="w-4 h-4 mr-2" />
                            공유하기
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // Safety check for current question
    const content = currentQuestion?.content as any;
    if (!content || !content.q) return null;

    return (
        <div className="min-h-screen bg-[#0f0f12] text-white flex flex-col font-sans">
            <header className="p-6 pb-2">
                <div className="flex items-center justify-between mb-4">
                    <span className="text-md font-bold text-indigo-400">{currentQuestion.category}</span>
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-white/10 text-white/60">
                        Lv.{currentQuestion.level}
                    </span>
                </div>
                <Progress value={((currentIndex + 1) / questions.length) * 100} className="h-1.5 bg-white/10 [&>div]:bg-indigo-500" />
            </header>

            <div className="flex-1 p-6 flex flex-col justify-center max-w-lg mx-auto w-full">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold leading-relaxed text-white">
                        {content.q}
                    </h2>
                </div>

                <div className="space-y-3">
                    {content.options && content.options.map((opt: string, idx: number) => {
                        const isSelected = selectedOption === opt;
                        let btnClass = "bg-white/5 border-white/10 hover:bg-white/10";
                        if (result) {
                            if (opt === result.correctAnswer || (result.correct && isSelected)) {
                                btnClass = "bg-green-500/20 border-green-500 text-green-400";
                            } else if (isSelected && !result.correct) {
                                btnClass = "bg-red-500/20 border-red-500 text-red-400";
                            } else {
                                btnClass = "opacity-40";
                            }
                        } else if (isSelected) {
                            btnClass = "bg-indigo-500 text-white border-indigo-500";
                        }

                        return (
                            <button
                                key={idx}
                                disabled={!!selectedOption}
                                onClick={() => handleOptionClick(opt)}
                                className={`w-full p-4 rounded-xl border text-left transition-all duration-200 ${btnClass} flex items-center justify-between group`}
                            >
                                <span className="text-md font-medium">{opt}</span>
                                {result && opt === result.correctAnswer && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                                {isSelected && result && !result.correct && opt !== result.correctAnswer && <XCircle className="w-5 h-5 text-red-400" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            <AnimatePresence>
                {result && (
                    <motion.div
                        initial={{ y: 100 }}
                        animate={{ y: 0 }}
                        className="bg-[#1a1a20] border-t border-white/10 p-6 pb-10 shadow-2xl z-20"
                    >
                        <div className={`flex items-start gap-3 mb-4`}>
                            <div className={`mt-1`}>
                                {result.correct ?
                                    <CheckCircle2 className="w-6 h-6 text-green-500" /> :
                                    <XCircle className="w-6 h-6 text-red-500" />
                                }
                            </div>
                            <div>
                                <h3 className={`font-bold text-lg ${result.correct ? 'text-green-500' : 'text-red-500'}`}>
                                    {result.correct ? '정답입니다!' : '오답입니다'}
                                </h3>
                                <p className="text-white/60 text-sm mt-1 leading-relaxed">
                                    {result.explanation}
                                </p>
                            </div>
                        </div>
                        <Button onClick={handleNext} className="w-full bg-white text-black hover:bg-gray-200 h-12 text-md font-bold">
                            다음 문제 <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

