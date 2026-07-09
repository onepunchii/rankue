import { useState, useMemo, useRef } from "react";
import { useParams } from "wouter";
import {
    LucideMessageSquare,
    LucideHeart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { COURSES } from "@/golf/data/golfCourses";
import { uploadImage } from "@/lib/imageUtils";

// Components
import { CourseHero } from "../components/course/CourseHero";
import { CourseStats } from "../components/course/CourseStats";
import { ReviewCard } from "../components/course/ReviewCard";
import { ReviewFormSheet } from "../components/course/ReviewFormSheet";

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
const UNSPLASH_DEFAULT = "https://images.unsplash.com/photo-1587174486073-ae5e5cff02fa?auto=format&fit=crop&q=80&w=200";

export default function GolfCourseDetail() {
    const { id } = useParams();
    const courseId = parseInt(id || "1");
    const course = useMemo(() => COURSES.find(c => c.id === courseId) || COURSES[0], [courseId]);

    const [isLiked, setIsLiked] = useState(false);
    const [courseImage, setCourseImage] = useState(() => {
        const savedImage = localStorage.getItem(`course-${courseId}-image`);
        if (savedImage) return savedImage;
        if (!course.imageUrl || course.imageUrl.includes(UNSPLASH_DEFAULT)) return DEFAULT_PLACEHOLDER_IMG;
        return course.imageUrl;
    });
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [reviews, setReviews] = useState(INITIAL_REVIEWS);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const conqueredInfo = useMemo(() => STAMPS.find(s => s.name === course.name), [course.name]);
    const isC = !!conqueredInfo;

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const url = await uploadImage(file, 'course', { maxSize: 1200, quality: 0.7 });
            setCourseImage(url);
            localStorage.setItem(`course-${courseId}-image`, url);
            alert("사진이 저장되었습니다!");
        } catch (err) {
            console.error("Compression/Storage error:", err);
            alert("이미지 저장 중 오류가 발생했습니다.");
        }
    };

    const handleReviewSubmit = (formData: any) => {
        const newReview = {
            id: Date.now(),
            user: "나의 기록",
            tier: "싱글골퍼 / 30대",
            rating: 5,
            content: "",
            date: new Date().toLocaleDateString(),
            verified: true,
            likes: 0,
            ...formData
        };

        setReviews([newReview, ...reviews]);
        alert("리뷰가 등록되었습니다!");
    };

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-32 font-sans relative overflow-x-hidden">
            <CourseHero
                course={course}
                courseImage={courseImage}
                isConquered={isC}
                conqueredInfo={conqueredInfo}
                onBack={() => window.history.back()}
                onCameraClick={() => fileInputRef.current?.click()}
                placeholderImg={DEFAULT_PLACEHOLDER_IMG}
            />

            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
            />

            <main className="px-8 -mt-4 relative z-40 bg-[#0A0A0A] rounded-t-[3rem] pt-10">
                <CourseStats course={course} />

                {/* Reviews Section */}
                <section className="mb-24 mt-12 space-y-6">
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
                        <ReviewCard key={review.id} review={review} />
                    ))}
                </section>
            </main>

            {/* Review Form Sheet */}
            <ReviewFormSheet
                open={isReviewOpen}
                onOpenChange={setIsReviewOpen}
                onSubmit={handleReviewSubmit}
            />

            {/* Floating bottom Bar */}
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
        </div>
    );
}
