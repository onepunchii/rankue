import { useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideFlag } from "lucide-react";
import { COURSES } from "@/golf/data/golfCourses";
import { uploadImage } from "@/lib/imageUtils";
import { kstDateLabel } from "@/lib/kst";

// Components
import { CourseHero } from "../components/course/CourseHero";
import { CourseStats } from "../components/course/CourseStats";

// 2026-09-11: 여기 있던 가짜 자료를 지웠다.
//  - INITIAL_REVIEWS: 오너 실명('최정환 · 싱글골퍼')·'인증' 표시가 붙은 88CC 후기 두 건이 **모든 골프장**에 떴다.
//    제주 골프장 상세에도 '88CC 서코스는 명불허전' 이 인증 후기로 붙었다. 공개하면 조작된 후기를 게시한 것이 된다.
//  - STAMPS: '88CC 82타', '안양 CC 79타' 가 누가 열든 '정복' 으로 보였다.
//  - '4.9 · 총 1,240개' 평점, 눌러도 아무 일 없는 '부킹 / 조인 알림 신청' 버튼, 로컬에만 저장되던 후기 쓰기.
// 정복 여부는 여권과 같은 서버 판정을 쓰고, 후기는 실제 라운드 인증을 붙일 때까지 비워 둔다.

const DEFAULT_PLACEHOLDER_IMG = "/rankue_placeholder.png";
const UNSPLASH_DEFAULT = "https://images.unsplash.com/photo-1587174486073-ae5e5cff02fa?auto=format&fit=crop&q=80&w=200";
const squash = (v: string) => v.replace(/\s+/g, "").toLowerCase();

export default function GolfCourseDetail() {
    const { id } = useParams();
    const [, setLocation] = useLocation();
    const courseId = parseInt(id || "1");
    const course = useMemo(() => COURSES.find(c => c.id === courseId) || COURSES[0], [courseId]);

    const [courseImage, setCourseImage] = useState(() => {
        try {
            const savedImage = localStorage.getItem(`course-${courseId}-image`);
            if (savedImage) return savedImage;
        } catch { /* 저장소를 못 쓰는 환경 */ }
        if (!course.imageUrl || course.imageUrl.includes(UNSPLASH_DEFAULT)) return DEFAULT_PLACEHOLDER_IMG;
        return course.imageUrl;
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: passport } = useQuery<any>({ queryKey: ["/api/hiq/golf/passport-stats"] });
    const conqueredInfo = useMemo(() => {
        const st = (passport?.stamps ?? []).find((x: any) => squash(x.name) === squash(course.name));
        if (!st) return undefined;
        return {
            score: st.bestScore > 0 ? st.bestScore : null,
            date: kstDateLabel(st.firstDate, { year: "numeric", month: "2-digit", day: "2-digit" }),
            rounds: st.rounds,
        };
    }, [passport, course.name]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const url = await uploadImage(file, 'course', { maxSize: 1200, quality: 0.7 });
            setCourseImage(url);
            try { localStorage.setItem(`course-${courseId}-image`, url); } catch { /* 이번 화면에서만 */ }
        } catch (err) {
            console.error("Compression/Storage error:", err);
            alert("이미지 저장 중 오류가 발생했습니다.");
        }
    };

    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-32 font-sans relative overflow-x-hidden">
            <CourseHero
                course={course}
                courseImage={courseImage}
                isConquered={!!conqueredInfo}
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

                <section className="mb-24 mt-12">
                    <h3 className="text-lg font-black tracking-widest mb-4">멤버 후기</h3>
                    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
                        <p className="text-sm font-bold text-white/70">아직 후기가 없어요</p>
                    </div>
                </section>
            </main>

            <div className="fixed bottom-10 left-0 right-0 px-6 z-50">
                <button
                    onClick={() => setLocation('/golf/game/new?mode=match')}
                    className="w-full bg-[#64DD17] hover:bg-[#7ff531] text-[#051907] py-4 rounded-full text-sm font-black transition-all shadow-[0_0_30px_rgba(100,221,23,0.3)] flex items-center justify-center gap-2"
                >
                    <LucideFlag className="w-4 h-4" />
                    {conqueredInfo ? `다시 라운드하기 · 베스트 ${conqueredInfo.score ?? "-"}타` : "여기서 라운드 시작"}
                </button>
            </div>
        </div>
    );
}
