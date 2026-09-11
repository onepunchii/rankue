import { LucideMapPin, LucideFlag, LucidePhone } from "lucide-react";

interface CourseStatsProps {
    course: any;
}

/**
 * 골프장 기본 정보 — **원장에 있는 값만** 보여 준다(2026-09-11).
 * 예전엔 모든 골프장에 '• 용인시', '(Par 144)', 난이도 85% 막대, '평균 핸디캡 +12 …' 문구, 태그 여섯 개가
 * 똑같이 박혀 있었다. 코스 분석은 실제 라운드 기록이 쌓이면 그걸로 만든다.
 */
export function CourseStats({ course }: CourseStatsProps) {
    const area = String(course.address ?? "").split(/\s+/).slice(0, 2).join(" ");
    const phone: string | undefined = course.phone || course.tel || undefined;
    return (
        <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/[0.04] border border-white/5 p-4">
                    <span className="text-xs text-white/50 font-medium flex items-center gap-1.5">
                        <LucideMapPin className="w-3.5 h-3.5 text-[#64DD17]" />
                        지역
                    </span>
                    <span className="mt-1 block text-base font-bold text-white tracking-tight">{area || course.originalRegion || course.region || "—"}</span>
                </div>
                <div className="rounded-2xl bg-white/[0.04] border border-white/5 p-4">
                    <span className="text-xs text-white/50 font-medium flex items-center gap-1.5">
                        <LucideFlag className="w-3.5 h-3.5 text-[#64DD17]" />
                        규모
                    </span>
                    <span className="mt-1 block text-base font-bold text-white tracking-tight">{course.holes ? `${course.holes}홀` : "—"}</span>
                </div>
            </section>

            {course.address && (
                <p className="text-[12px] font-bold text-white/60 break-keep">{course.address}</p>
            )}
            {phone && (
                <a href={`tel:${String(phone).replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white/5 border border-white/10 text-[12px] font-bold text-white/80">
                    <LucidePhone className="w-3.5 h-3.5 text-[#64DD17]" />
                    {phone}
                </a>
            )}
            <p className="text-[11px] font-bold text-white/40 break-keep">
                난이도·그린 스피드 같은 코스 분석은 랭큐 회원의 실제 라운드 기록이 쌓이면 보여 드릴게요.
            </p>
        </div>
    );
}
