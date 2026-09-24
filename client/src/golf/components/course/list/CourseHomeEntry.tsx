/**
 * 골프 홈 → 전국 골프장(/golf/courses) 입구(2026-09-24). 홈 타일 말투(영문 대문자 제목 + 한 줄)에 맞춘 넓은 카드.
 * 오른쪽 점 지도는 목록 화면과 같은 그림이다 — 누르고 들어가면 같은 지도가 그대로 이어진다.
 * 숫자는 전부 실제 값(골프장 수·지금 글·내 관심). 0 이면 적지 않는다.
 *
 * 둘째 판(2026-09-24 오너: "홈에 배너를 조금 더 시각적으로 눈에 보이게"):
 *  - 지도를 카드 반쪽 크기로 키우고 점을 격자 점으로(CourseDotMap 셋째 판) — 한반도가 또렷하게 떠 보인다.
 *  - 셋째 판(같은 날 오너: "배경을 조인 주황으로 입혀 줘 · 테두리에 저렇게 있으니 이상해"): 라임 테두리·빛을 걷고
 *    **주황 면 카드**로 — 위의 RANKUE MATCH(라임 면)와 짝을 이룬다. 점은 흰색, 글이 있는 곳은 짙은 점(CourseDotMap onColor).
 *  - 흐린 ▷ 대신 흰 동그라미 화살표 — 눌러서 들어가는 카드라는 게 한눈에.
 *  - 홈은 굵기를 낮추지 않는다(2026-09-21 오너) — 제목 extrabold.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { LucideArrowRight, LucideStar } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { useCourseList, useMyWatches } from "../../../lib/courseApi";
import { CourseDotMap, type MapDot } from "./CourseDotMap";

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
            className="group block w-full mb-4 relative z-10 rounded-[2rem] overflow-hidden bg-gradient-to-br from-[#FF8A3D] to-[#E85200] shadow-2xl shadow-[#FF6B00]/20 active:scale-[0.99] transition-transform"
        >
            {/* 지도 쪽을 살짝 밝힌다 — 면이 한 색으로만 누르면 지도가 납작해 보인다 */}
            <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(90%_80%_at_85%_40%,#FFFFFF26_0%,transparent_65%)]" />
            <span className="relative flex items-stretch min-h-[192px]">
                <span className="flex-1 min-w-0 p-6 pr-1 flex flex-col">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-[#FFFFFFD9]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FFFFFF]" />
                        전국 골프장
                    </span>
                    <span className="mt-2 block text-[26px] font-extrabold text-[#FFFFFF] leading-[0.98]">GOLF<br />COURSES</span>
                    <span className="mt-2.5 block text-[12px] font-semibold text-[#FFFFFFCC]">
                        {rows.length ? `${rows.length.toLocaleString()}곳 · ` : ""}그린피 · 회원권 시세
                    </span>
                    <span className="mt-auto pt-4 flex items-center gap-1.5 flex-wrap min-h-[20px]">
                        {/* 주황 바탕 위라 색 칩(부킹 라임·조인 주황)은 묻힌다 — 흰 반투명 칩 하나로 */}
                        {([["긴급", counts.urgent], ["부킹", counts.booking], ["조인", counts.join]] as const).filter(([, n]) => n > 0).map(([label, n]) => (
                            <span key={label} className="h-5 px-1.5 rounded bg-[#FFFFFF33] text-[#FFFFFF] text-[12px] font-semibold leading-5 tabular-nums">{label} {n}</span>
                        ))}
                        {watchN > 0 && (
                            <span className="h-5 px-1.5 rounded bg-[#FFFFFF33] text-[#FFFFFF] text-[12px] font-semibold leading-5 inline-flex items-center gap-1 tabular-nums">
                                <LucideStar weight="fill" className="w-3 h-3" />관심 {watchN}
                            </span>
                        )}
                    </span>
                </span>
                <span className="relative w-[46%] shrink-0">
                    <CourseDotMap dots={dots} focus={null} aspect={0.8} cols={30} onColor className="absolute inset-0 w-full h-full" />
                </span>
            </span>
            <span className="absolute right-4 bottom-4 w-10 h-10 rounded-full bg-[#FFFFFF] flex items-center justify-center shadow-lg shadow-[#7A2A00]/30 transition-transform group-active:scale-95">
                <LucideArrowRight weight="bold" className="w-5 h-5 text-[#E85200]" />
            </span>
        </Link>
    );
}
