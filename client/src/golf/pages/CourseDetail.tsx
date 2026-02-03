import { useState, useMemo, useRef } from "react";
import { Link, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
    LucideChevronLeft,
    LucideCrown,
    LucideLock,
    LucideTrophy,
    LucideStar,
    LucideZap,
    LucideSkull,
    LucideMapPin,
    LucideFlag,
    LucideLeaf,
    LucideInfo,
    LucideMessageSquare,
    LucideHeart,
    LucideCamera,
    LucideCheckCircle2,
    LucideMoreHorizontal,
    LucideArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { COURSES } from "@/golf/data/golfCourses";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

// Mock data for demo
const STAMPS = [
    { id: 3, name: "안양 CC", date: "2025.12.14", score: 79, region: "경기", color: "#FFD600" },
    { id: 1, name: "88CC", date: "2026.01.24", score: 82, region: "경기", color: "#64DD17" }
];

const INITIAL_REVIEWS = [
    {
        id: 1,
        user: "최정환",
        tier: "싱글골퍼 / 30대",
        rating: 5,
        content: "역시 88CC 서코스는 명불허전입니다. 페어웨이 관리 상태가 양탄자 수준이고, 그린도 잘 받아줍니다. 다만 그늘집 가격은 좀 사악하네요.",
        date: "2026.01.24",
        score: 82,
        verified: true,
        likes: 124,
        ratings: { course: 5, green: 4, service: 5 },
        specs: { speed: 2.8, fee: 250000, difficulty: "상" },
        tags: ["#그린스피드빠름", "#페어웨이양탄자", "#그늘집맛집"]
    },
    {
        id: 2,
        user: "김프로",
        tier: "세미프로 / 40대",
        rating: 5,
        content: "그린 스피드가 2.8 이상 나와주네요. 난이도도 적당하고 코스 레이아웃이 정말 훌륭합니다.",
        date: "2026.01.10",
        score: 75,
        verified: true,
        likes: 85,
        ratings: { course: 5, green: 5, service: 4 },

        specs: { speed: 2.9, fee: 220000, difficulty: "중" },
        tags: ["#전장김", "#벙커지옥"]
    }
];

const DEFAULT_PLACEHOLDER_IMG = "/rankue_placeholder.png";
const UNSPLASH_DEFAULT = "https://images.unsplash.com/photo-1587174486073-ae5e5cff02fa?auto=format&fit=crop&q=80&w=200"; // For check

export default function GolfCourseDetail() {
    const { id } = useParams();
    const courseId = parseInt(id || "1");
    const course = useMemo(() => COURSES.find(c => c.id === courseId) || COURSES[0], [courseId]);

    const [isLiked, setIsLiked] = useState(false);
    // Load image from localStorage if available, otherwise use default
    const [courseImage, setCourseImage] = useState(() => {
        const savedImage = localStorage.getItem(`course-${courseId}-image`);
        if (savedImage) return savedImage;
        if (!course.imageUrl || course.imageUrl.includes(UNSPLASH_DEFAULT)) return DEFAULT_PLACEHOLDER_IMG;
        return course.imageUrl;
    });
    const [isReviewOpen, setIsReviewOpen] = useState(false); // Sheet state
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State (Mock)
    const [myScore, setMyScore] = useState(82);
    const [ratings, setRatings] = useState({ course: 5, green: 4, service: 5 });
    const [specs, setSpecs] = useState({ speed: 2.8, fee: 250000, difficulty: "상" });
    const [revisit, setRevisit] = useState(true);
    const [reviews, setReviews] = useState(INITIAL_REVIEWS);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const TAG_OPTIONS = [
        "#그린스피드빠름", "#페어웨이양탄자", "#그늘집맛집", "#캐디친절",
        "#경치좋음", "#가성비갑", "#전장김", "#벙커지옥"
    ];

    const conqueredInfo = useMemo(() => STAMPS.find(s => s.name === course.name), [course.name]);
    const isC = !!conqueredInfo;

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // 1. Create an image element to draw onto canvas
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                // 2. Create canvas for compression
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Set canvas size (Max width 1200px to save space)
                const MAX_WIDTH = 1200;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = Math.round((height * MAX_WIDTH) / width);
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;

                // 3. Draw and compress to WebP
                ctx?.drawImage(img, 0, 0, width, height);
                const webpDataUrl = canvas.toDataURL('image/webp', 0.7); // 0.7 quality

                // 4. Save to state and localStorage
                setCourseImage(webpDataUrl);
                try {
                    localStorage.setItem(`course-${courseId}-image`, webpDataUrl);
                    alert("사진이 압축되어 저장되었습니다! (WebP 포맷)");
                } catch (err) {
                    console.error("Storage error:", err);
                    alert("이미지 용량이 너무 커서 로컬 저장소에 저장하지 못했습니다.");
                }
            };
        }
    };

    const handleReviewSubmit = () => {
        const newReview = {
            id: Date.now(),
            user: "나의 기록", // Default user name for demo
            tier: "싱글골퍼 / 30대", // Default tier
            rating: 5, // Overall rating logic can be added
            content: "",
            date: new Date().toLocaleDateString(),
            score: myScore,
            verified: true,
            likes: 0,
            ratings: ratings,
            specs: specs,
            tags: selectedTags
        };

        setReviews([newReview, ...reviews]);
        setIsReviewOpen(false);
        // Reset form or keep it? Keeping it for now as "Edit Score" implies persistence logic.
        alert("리뷰가 등록되었습니다!");
    };

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-32 font-sans relative overflow-x-hidden" >
            {/* A. Hero Section */}
            < header className="relative h-[45vh] overflow-hidden" >
                <div className="w-full h-full relative">
                    <motion.img
                        initial={{ scale: 1.1 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 1.5 }}
                        src={courseImage}
                        className={cn("w-full h-full object-cover", !isC && "grayscale")}
                        alt={course.name}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = DEFAULT_PLACEHOLDER_IMG;
                        }}
                    />

                </div>
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-[#0A0A0A]" />

                {/* Navigation */}
                <div className="absolute top-0 left-0 right-0 p-6 flex items-center justify-between z-30" >
                    <button
                        onClick={() => window.history.back()}
                        className="p-2 -ml-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white transition-all active:scale-90 shadow-2xl"
                        title="뒤로 가기"
                    >
                        <LucideChevronLeft className="w-6 h-6" />
                    </button>
                    <div className="flex gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 rounded-full bg-black/20 backdrop-blur-md border border-white/10 text-white shadow-2xl transition-all active:scale-90"
                            title="사진 업로드"
                        >
                            <LucideCamera className="w-6 h-6" />
                        </button>
                    </div>
                </div >

                {/* Hero Info */}
                < div className="absolute bottom-8 left-0 right-0 px-8 z-30" >
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex flex-col items-start gap-3"
                    >
                        <div className="text-[9px] font-bold text-white/50 uppercase tracking-[0.2em]">{course.originalRegion}</div>
                        <div className="flex items-center gap-2">
                            {course.isRankue60 && (
                                <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r from-amber-400 to-amber-600 shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                                    <LucideCrown className="w-2.5 h-2.5 text-amber-950 fill-amber-950" />
                                    <span className="text-[8px] font-black text-amber-950 uppercase tracking-widest">RANKUE 60</span>
                                </div>
                            )}
                            <div className={cn(
                                "px-2 py-0.5 rounded bg-white/10 backdrop-blur-md border text-[8px] font-black uppercase tracking-widest",
                                course.type === 'Membership' ? "border-amber-500/50 text-amber-400" : "border-[#64DD17]/50 text-[#64DD17]"
                            )}>
                                {course.type === 'Membership' ? "[ M 회원제 ]" : "[ P 퍼블릭 ]"}
                            </div>
                        </div>
                        <h1 className="text-4xl font-black tracking-tighter drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
                            {course.name}
                        </h1>
                    </motion.div>
                </div >

                {/* Conquest Status Badge */}
                < div className="absolute bottom-8 right-8 z-30" >
                    {
                        isC ? (
                            <motion.div
                                initial={{ scale: 0, rotate: -30 }}
                                animate={{ scale: 1, rotate: -15 }}
                                className="bg-amber-400 text-amber-950 px-4 py-2 rounded-xl shadow-[0_0_20px_rgba(251,191,36,0.3)] flex flex-col items-center"
                            >
                                <span className="text-[7px] font-black uppercase tracking-[0.1em] mb-0.5 opacity-60">정복 완료</span>
                                <div className="flex items-baseline gap-0.5">
                                    <span className="text-[8px] font-bold">BEST</span>
                                    <span className="text-xl font-black">{conqueredInfo.score}</span>
                                </div>
                            </motion.div >
                        ) : (
                            <div className="bg-white/5 backdrop-blur-md border border-white/10 p-3 rounded-xl flex flex-col items-center opacity-40">
                                <LucideLock className="w-6 h-6 mb-1" />
                                <span className="text-[8px] font-black uppercase tracking-widest">Locked</span>
                            </div>
                        )}
                </div >


                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleImageUpload}
                />
            </header >

            <main className="px-8 -mt-4 relative z-40 bg-[#0A0A0A] rounded-t-[3rem] pt-10">
                {/* B. Spec Bar */}
                <section className="mb-12 flex justify-between items-center py-4 relative">
                    {/* Vertical Divider 1 */}
                    <div className="absolute left-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />
                    {/* Vertical Divider 2 */}
                    <div className="absolute right-1/3 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />

                    <div className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-[#AAAAAA] font-medium flex items-center gap-1.5">
                            <LucideMapPin className="w-3.5 h-3.5 text-[#64DD17]" />
                            위치
                        </span>
                        <span className="text-base font-bold text-white tracking-tight">{course.originalRegion} • 용인시</span>
                    </div>

                    <div className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-[#AAAAAA] font-medium flex items-center gap-1.5">
                            <LucideFlag className="w-3.5 h-3.5 text-[#64DD17]" />
                            코스
                        </span>
                        <span className="text-base font-bold text-white tracking-tight">{course.holes}홀 (Par 144)</span>
                    </div>

                    <div className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-[#AAAAAA] font-medium flex items-center gap-1.5">
                            <LucideLeaf className="w-3.5 h-3.5 text-[#64DD17]" />
                            잔디
                        </span>
                        <span className="text-base font-bold text-white tracking-tight">{course.grass}</span>
                    </div>
                </section>

                {/* C. Analysis Chart */}
                <section className="mb-12">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-black italic tracking-widest uppercase flex items-center gap-2">
                            <div className="w-1 h-4 bg-amber-400" />
                            랭큐 코스 분석
                        </h3>
                        <LucideInfo className="w-4 h-4 text-white/20" />
                    </div>

                    <div className="space-y-8 px-2">
                        {/* Difficulty Bar */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-black uppercase text-white/40">난이도</span>
                                <span className="text-xs font-black text-[#64DD17]">{course.difficulty}</span>
                            </div>
                            <div className="h-1.5 bg-white/10 rounded-full relative flex items-center">
                                <div className="absolute left-[85%] -translate-x-1/2 w-4 h-4 rounded-full bg-[#0A0A0A] border-2 border-[#64DD17] shadow-[0_0_10px_rgba(100,221,23,0.4)] z-10" />
                                <div className="h-full w-[85%] bg-gradient-to-r from-emerald-500/50 via-amber-500/50 to-[#64DD17] rounded-full opacity-50" />
                            </div>
                            <p className="text-[10px] font-bold text-white/30 mt-3 text-right italic">"평균 핸디캡 +12 이상 싱글러들에게 도전적인 코스입니다."</p>
                        </div>

                        {/* Course Style Tags */}
                        <div className="flex flex-wrap gap-2">
                            {["#넓은페어웨이", "#전장김", "#여성우대", "#벙커지옥", "#명문프리미엄", "#양탄자잔디"].map(tag => (
                                <span key={tag} className="px-3 py-1.5 rounded-full border border-white/20 text-[10px] font-bold text-white/50 bg-transparent">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                {/* D. Integrated Insight Cards */}
                <section className="mb-24 space-y-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-lg font-black italic tracking-widest uppercase mb-1">⭐ 멤버 인사이트</h3>
                            <p className="text-[10px] font-bold text-white/30">핵심 데이터 요약 카드 (총 1,240개)</p>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-black text-amber-400 tracking-tighter">4.9</div>
                            <div className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">전체 평점</div>
                        </div>
                    </div>

                    {reviews.map(review => (
                        <div key={review.id} className="bg-[#1E1E1E] rounded-[2rem] p-6 relative overflow-hidden border border-white/5 shadow-lg">
                            {/* Header Row: Profile (Left) & Score (Right) */}
                            <div className="flex items-center justify-between mb-6">
                                {/* Left: User Profile */}
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-black text-xs text-white/40 shrink-0 border border-white/5">
                                        {review.user[0]}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-white">{review.user}</span>
                                            {review.verified && <LucideCheckCircle2 className="w-3.5 h-3.5 text-[#64DD17]" />}
                                            <div className="px-1.5 py-0.5 rounded bg-white/10 border border-white/5 text-[9px] font-bold text-[#FFD700]">
                                                싱글 골퍼
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-white/30 font-bold mt-0.5">{review.date} • 30대 남성</div>
                                    </div>
                                </div>

                                {/* Right: Score Display */}
                                <div className="text-2xl font-black text-[#64DD17] tracking-tighter leading-none flex items-center gap-1">
                                    🏆 {review.score}타
                                </div>
                            </div>

                            {/* Section 2: Data Grid */}
                            <div className="grid grid-cols-2 gap-6 relative mb-6">
                                {/* Vertical Divider */}
                                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2" />

                                {/* Left Column: Satisfaction */}
                                <div className="space-y-3 pr-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-white/40">코스</span>
                                        <div className="flex items-center gap-1">
                                            <LucideStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                                            <span className="text-xs font-black text-white">{review.ratings.course}.0</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-white/40">그린</span>
                                        <div className="flex items-center gap-1">
                                            <LucideStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                                            <span className="text-xs font-black text-white">{review.ratings.green}.0</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-white/40">서비스</span>
                                        <div className="flex items-center gap-1">
                                            <LucideStar className="w-3 h-3 text-amber-400 fill-amber-400" />
                                            <span className="text-xs font-black text-white">{review.ratings.service}.0</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Specs/Facts */}
                                <div className="space-y-3 pl-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-white/40">스피드</span>
                                        <span className="text-xs font-black text-white">{review.specs.speed}m</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-white/40">그린피</span>
                                        <span className="text-xs font-black text-white">{review.specs.fee / 10000}만</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-white/40">난이도</span>
                                        <span className="text-xs font-black text-white">{review.specs.difficulty}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Footer (Tags) */}
                            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                                {review.tags.map(tag => (
                                    <span key={tag} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white/60 shrink-0">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>
            </main>

            {/* Sheet for Review Form */}
            <Sheet open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <SheetContent side="bottom" className="bg-[#1E1E1E] border-t border-white/10 rounded-t-[2rem] p-8 h-[85vh]">
                    <SheetHeader className="mb-8">
                        <SheetTitle className="text-xl font-black text-white flex items-center gap-2">
                            <LucideMessageSquare className="w-5 h-5 text-[#64DD17]" />
                            리뷰 & 스코어 기록
                        </SheetTitle>
                    </SheetHeader>

                    <div className="space-y-8 h-full overflow-y-auto pb-20 no-scrollbar">
                        {/* 1. Score & Revisit */}
                        <div className="flex flex-col gap-6">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-bold text-white/60">재방문 의사</label>
                                <button
                                    onClick={() => setRevisit(!revisit)}
                                    className={cn("px-4 py-2 rounded-full font-black text-xs transition-all", revisit ? "bg-yellow-400 text-black" : "bg-white/10 text-white/40")}
                                >
                                    {revisit ? "😊 있음 (96%)" : "😐 없음"}
                                </button>
                            </div>

                            <div className="bg-black/20 rounded-3xl p-6 text-center border border-white/5">
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest block mb-2">베스트 스코어</label>
                                <div className="flex items-center justify-center gap-4">
                                    <button onClick={() => setMyScore(s => s - 1)} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white text-xl">-</button>
                                    <span className="text-5xl font-black text-[#64DD17] tracking-tighter w-24">{myScore}</span>
                                    <button onClick={() => setMyScore(s => s + 1)} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white text-xl">+</button>
                                </div>
                            </div>
                        </div>

                        {/* 2. Ratings & Specs Grid */}
                        <div className="grid grid-cols-2 gap-8 relative">
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2" />

                            {/* Ratings Input */}
                            <div className="space-y-6">
                                {[
                                    { id: 'course', label: '코스 상태', icon: LucideLeaf },
                                    { id: 'green', label: '그린 상태', icon: LucideFlag },
                                    { id: 'service', label: '서비스', icon: LucideHeart }
                                ].map((item) => (
                                    <div key={item.id} className="space-y-2">
                                        <div className="flex items-center gap-1.5 text-white/40">
                                            <item.icon className="w-3 h-3" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <button
                                                    key={star}
                                                    onClick={() => setRatings(prev => ({ ...prev, [item.id]: star }))}
                                                >
                                                    <LucideStar
                                                        className={cn(
                                                            "w-4 h-4 transition-all",
                                                            star <= ratings[item.id as keyof typeof ratings] ? "text-amber-400 fill-amber-400" : "text-white/10 fill-white/10"
                                                        )}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Specs Input */}
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-white/40">
                                        <LucideZap className="w-3 h-3" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">그린 스피드</span>
                                    </div>
                                    <input
                                        type="number"
                                        value={specs.speed}
                                        onChange={(e) => setSpecs({ ...specs, speed: parseFloat(e.target.value) })}
                                        step="0.1"
                                        className="w-full bg-transparent text-xl font-black text-white border-b border-white/10 focus:border-[#64DD17] outline-none py-1"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-white/40">
                                        <span className="text-[10px]">💰</span>
                                        <span className="text-[10px] font-bold uppercase tracking-widest">그린피</span>
                                    </div>
                                    <input
                                        type="number"
                                        value={specs.fee}
                                        onChange={(e) => setSpecs({ ...specs, fee: parseInt(e.target.value) })}
                                        step="10000"
                                        className="w-full bg-transparent text-xl font-black text-white border-b border-white/10 focus:border-[#64DD17] outline-none py-1"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-white/40">
                                        <LucideTrophy className="w-3 h-3" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">난이도</span>
                                    </div>
                                    <select
                                        value={specs.difficulty}
                                        onChange={(e) => setSpecs({ ...specs, difficulty: e.target.value })}
                                        className="w-full bg-[#1E1E1E] text-xl font-black text-white border-b border-white/10 focus:border-[#64DD17] outline-none py-1 appearance-none"
                                    >
                                        <option value="상">상</option>
                                        <option value="중">중</option>
                                        <option value="하">하</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* 3. Hashtags */}
                        <div className="space-y-4">
                            <label className="text-sm font-bold text-white/60">자주 쓰는 태그</label>
                            <div className="flex flex-wrap gap-2">
                                {TAG_OPTIONS.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => {
                                            setSelectedTags(prev =>
                                                prev.includes(tag)
                                                    ? prev.filter(t => t !== tag)
                                                    : [...prev, tag]
                                            );
                                        }}
                                        className={cn(
                                            "px-3 py-1.5 rounded-full text-[10px] font-bold transition-all border",
                                            selectedTags.includes(tag)
                                                ? "bg-[#64DD17] text-[#051907] border-[#64DD17]"
                                                : "bg-white/5 text-white/40 border-white/10 hover:bg-white/10"
                                        )}
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleReviewSubmit}
                            className="w-full bg-[#64DD17] text-[#051907] py-4 rounded-xl font-black uppercase tracking-widest hover:bg-[#7ff531] transition-all shadow-[0_0_30px_rgba(100,221,23,0.3)]"
                        >
                            기록 저장하기
                        </button>
                    </div>
                </SheetContent>
            </Sheet>

            {/* E. Floating bottom Bar */}
            <div className="fixed bottom-10 left-0 right-0 px-6 z-50">
                <div className="bg-black/80 backdrop-blur-2xl border border-white/10 p-3 rounded-[2.5rem] flex items-center gap-3 shadow-[0_-10px_50px_rgba(0,0,0,0.8)]">
                    <button
                        onClick={() => setIsLiked(!isLiked)}
                        className={cn(
                            "w-14 h-14 rounded-full flex items-center justify-center transition-all border shrink-0",
                            isLiked ? "bg-red-500/20 border-red-500 text-red-500" : "bg-white/5 border-white/10 text-white/40"
                        )}
                    >
                        <LucideHeart className={cn("w-6 h-6", isLiked && "fill-red-500")} />
                    </button>
                    {isC ? (
                        <button
                            onClick={() => setIsReviewOpen(true)}
                            className="flex-1 bg-white/10 hover:bg-white/20 text-white py-4 rounded-full text-sm font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2"
                        >
                            <LucideMessageSquare className="w-4 h-4" />
                            리뷰 남기기 / 스코어 수정
                        </button>
                    ) : (
                        <button className="flex-1 bg-[#64DD17] hover:bg-[#7ff531] text-[#051907] py-4 rounded-full text-sm font-black uppercase tracking-[0.2em] transition-all shadow-[0_0_30px_rgba(100,221,23,0.3)]">
                            부킹 / 조인 알림 신청 🔥
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}
