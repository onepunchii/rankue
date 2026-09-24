/**
 * 골프 홈 → 전국 골프장(/golf/courses) 입구(2026-09-24). 홈 타일 말투(영문 대문자 제목 + 한 줄)에 맞춘 넓은 카드.
 * 오른쪽 점 지도는 목록 화면과 같은 그림이다 — 누르고 들어가면 같은 지도가 그대로 이어진다.
 * 숫자는 전부 실제 값(골프장 수·지금 글·내 관심). 0 이면 적지 않는다.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { useCourseList, useMyWatches } from "../../../lib/courseApi";
import { CourseDotMap, type MapDot } from "./CourseDotMap";
import { LiveBadges } from "./CourseRow";

export function CourseHomeEntry() {
    const { member } = useAuth();
    const all = useCourseList({});
    const watches = useMyWatches(!!member);
    const rows = all.data ?? [];

    const { dots, counts } = useMemo(() => {
        const c = { booking: 0, join: 0, urgent: 0 };
        const d: MapDot[] = [];
        for (const x of rows) {
            c.booking += x.counts.booking; c.join += x.counts.join; c.urgent += x.counts.urgent;
            if (x.lat == null || x.lng == null) continue;
            const k = x.counts;
            d.push({ key: x.slug, lat: x.lat, lng: x.lng, tone: k.urgent ? "urgent" : k.join ? "join" : k.booking ? "booking" : "on" });
        }
        return { dots: d, counts: c };
    }, [rows]);
    const watchN = watches.data?.length ?? 0;

    return (
        <Link
            href="/golf/courses"
            className="block w-full mb-4 relative z-10 rounded-[2rem] bg-[#FFFFFF08] border border-[#FFFFFF1A] overflow-hidden active:scale-[0.99] transition-transform"
        >
            <span className="flex items-stretch">
                <span className="flex-1 min-w-0 p-6 flex flex-col justify-between gap-4">
                    <span>
                        <span className="block text-2xl font-bold text-[#FFFFFF] leading-none">GOLF<br />COURSES</span>
                        <span className="mt-2 block text-[12px] font-semibold text-[#FFFFFF73]">
                            {rows.length ? `전국 골프장 ${rows.length.toLocaleString()}곳` : "전국 골프장"} · 그린피 · 회원권 시세
                        </span>
                    </span>
                    <span className="flex items-center gap-1.5 flex-wrap min-h-[20px]">
                        <LiveBadges counts={counts} />
                        {watchN > 0 && <span className="h-5 px-1.5 rounded-md bg-[#FFFFFF14] text-[#FFFFFFB3] text-[12px] font-semibold leading-5">관심 {watchN}</span>}
                        <LucideChevronRight className="w-5 h-5 text-[#64DD17] ml-auto" />
                    </span>
                </span>
                <span className="relative w-[112px] shrink-0 bg-[#FFFFFF05] border-l border-[#FFFFFF0F]">
                    <CourseDotMap dots={dots} focus={null} aspect={112 / 180} className="absolute inset-0 w-full h-full" />
                </span>
            </span>
        </Link>
    );
}
