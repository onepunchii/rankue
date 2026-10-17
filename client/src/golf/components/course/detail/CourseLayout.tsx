/**
 * 코스(2026-09-24) — 랭큐매치 명부의 코스별 파("라고 9홀 파36")와 운영 구성(회원제 36홀 + 대중제 18홀).
 * 구성은 둘 이상일 때만 막대로 그린다(하나면 머리의 칩과 같은 말이다).
 */
import type { CourseDetail } from "@/golf/lib/courseApi";
import { Card, Section } from "./ui";

const PART_COLOR: Record<string, string> = { 회원제: "#64DD17", 대중제: "#4DA3FF" };

export function CourseLayout({ courses, parts, holes }: { courses: CourseDetail["courses"]; parts: CourseDetail["parts"]; holes: number | null }) {
    const cs = (courses ?? []).filter((c) => c.holes > 0);
    const ps = (parts ?? []).filter((p) => p.holes && p.holes > 0);
    const showParts = ps.length >= 2;
    if (!cs.length && !showParts) return null;
    const totalHoles = cs.reduce((n, c) => n + c.holes, 0);
    const totalPar = cs.reduce((n, c) => n + c.par, 0);
    const partSum = ps.reduce((n, p) => n + (p.holes ?? 0), 0);
    // 코스별 파를 아는 홀이 골프장 홀보다 적으면(진양밸리 27홀 중 CREEK · HILL 18홀) 모르는 몫을 숨기지 않는다 —
    // "18홀 · 파72"만 적으면 27홀짜리가 18홀로 읽힌다(2026-10-17 리뷰). 모르는 코스의 파는 지어 넣지 않는다.
    const missing = holes != null && totalHoles > 0 && holes > totalHoles ? holes - totalHoles : 0;

    return (
        <Section
            id="course" title="코스"
            aside={cs.length ? <span className="text-[13px] text-[#FFFFFF80] tabular-nums">{missing ? `${holes}홀 · 파는 ${totalHoles}홀만` : `${totalHoles || holes}홀 · 파${totalPar}`}</span> : undefined}
        >
            <Card className="p-4 space-y-4">
                {showParts && (
                    <div>
                        <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                            {ps.map((p, i) => (
                                <span key={i} style={{ flex: p.holes ?? 0, backgroundColor: PART_COLOR[p.kind] ?? "#FFFFFF66" }} />
                            ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                            {ps.map((p, i) => (
                                <span key={i} className="inline-flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PART_COLOR[p.kind] ?? "#FFFFFF66" }} />
                                    <span className="text-[#FFFFFFCC]">{p.kind}</span>
                                    <span className="text-white font-medium tabular-nums">{p.holes}홀</span>
                                </span>
                            ))}
                            {partSum > 0 && <span className="ml-auto text-[#FFFFFF66] tabular-nums">합 {partSum}홀</span>}
                        </div>
                    </div>
                )}
                {cs.length > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                        {cs.map((c) => (
                            <div key={c.name} className="rounded-xl bg-[#FFFFFF08] border border-[#FFFFFF0F] px-3 py-2.5 min-w-0">
                                <div className="text-[15px] font-semibold text-white truncate">{c.name}</div>
                                <div className="mt-0.5 text-[12.5px] text-[#FFFFFF80] tabular-nums">{c.holes}홀 · 파{c.par}</div>
                            </div>
                        ))}
                        {missing > 0 && (
                            <div className="rounded-xl border border-dashed border-[#FFFFFF26] px-3 py-2.5 min-w-0" data-testid="course-par-missing">
                                <div className="text-[15px] font-semibold text-[#FFFFFF99]">나머지 {missing}홀</div>
                                <div className="mt-0.5 text-[12.5px] text-[#FFFFFF66]">파 확인 중</div>
                            </div>
                        )}
                    </div>
                )}
            </Card>
        </Section>
    );
}
