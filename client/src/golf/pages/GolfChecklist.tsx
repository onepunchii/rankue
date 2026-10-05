/**
 * /golf/checklist — 골프 라운딩 준비물 체크리스트(2026-10-05 오너: "이모지 및 아이콘을 활용하자 … 우리만의 콘텐츠" → "순서대로"의 2번).
 *
 * 글은 전부 shared/golfPack — 검색엔진용 화면(server/seo/golfGuide.ts)과 같은 글이다. 여기에만 있는 것은 눌러서 지우는 조작뿐.
 * 로그인 없이 열린다(검색으로 들어온 사람이 본다). 체크 표시는 이 브라우저에만 남는다.
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말). 글자 12px 이상.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronRight } from "@/lib/icons";
import { ORIGIN } from "@shared/golfCourse";
import {
    PACK_DESC, PACK_FAQ, PACK_FIRST, PACK_H1, PACK_INTRO, PACK_NAV_LABEL, PACK_PATH, PACK_SEASONS, PACK_TITLE, PACK_WEATHER, PACK_WEATHER_NOTE,
    gearEmoji, packJsonLd,
} from "@shared/golfPack";
import { CourseShell } from "@/golf/components/course/CourseShell";
import { PackList } from "@/golf/components/course/PackList";
import { Card, Section } from "@/golf/components/course/detail/ui";

const CHIP = "h-8 pl-2.5 pr-3 rounded-full bg-[#FFFFFF0F] text-[13.5px] font-medium text-[#FFFFFFCC] inline-flex items-center gap-1.5 whitespace-nowrap";
const PLATE = "w-9 h-9 shrink-0 rounded-full bg-[#FFFFFF0F] flex items-center justify-center text-[17px] leading-none";

export default function GolfChecklist() {
    const jsonLd = useMemo(() => packJsonLd(ORIGIN), []);
    useSeo({ title: PACK_TITLE, description: PACK_DESC, path: PACK_PATH, jsonLd });

    return (
        <CourseShell title={PACK_NAV_LABEL} backTo="/golf/courses">
            <div className="px-5 pt-7">
                <h1 className="text-[25px] font-bold tracking-tight leading-tight text-white break-keep">{PACK_H1}</h1>
                <p className="mt-3 text-[15px] leading-[1.7] text-[#FFFFFFB3] break-keep">{PACK_INTRO}</p>
            </div>

            <Section title="늘 챙기는 것">
                <Card className="px-4 py-1.5"><PackList variant="list" /></Card>
            </Section>

            <Section title="날씨에 따라">
                <Card className="overflow-hidden">
                    <ul className="divide-y divide-[#FFFFFF0A]">
                        {PACK_WEATHER.map((w) => (
                            <li key={w.when} className="px-4 py-3.5">
                                <p className="text-[14px] text-[#FFFFFF99] break-keep">{w.when}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {w.gear.map((g) => (
                                        <span key={g} className={CHIP}><span className="text-[15px] leading-none" aria-hidden>{gearEmoji(g)}</span>{g}</span>
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>
                <Link href="/golf/courses" className="mt-3 flex items-center gap-1 text-[14px] leading-relaxed text-[#FFFFFFB3] break-keep active:text-white">
                    <span className="flex-1 min-w-0">{PACK_WEATHER_NOTE}</span>
                    <LucideChevronRight weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                </Link>
            </Section>

            {PACK_SEASONS.map((s) => (
                <Section key={s.key} title={<><span className="mr-2" aria-hidden>{s.emoji}</span>{s.title}</>}>
                    <p className="-mt-1.5 mb-3 text-[14px] text-[#FFFFFF99] break-keep">{s.lead}</p>
                    <Card className="overflow-hidden">
                        <ul className="divide-y divide-[#FFFFFF0A]">
                            {s.items.map((it) => (
                                <li key={it.key} className="px-4 py-3 flex items-center gap-3">
                                    <span className={PLATE} aria-hidden>{it.emoji}</span>
                                    <span className="min-w-0">
                                        <span className="block text-[15px] font-medium text-[#FFFFFFE6]">{it.label}</span>
                                        {it.note && <span className="block mt-0.5 text-[13px] text-[#FFFFFF73] break-keep">{it.note}</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </Card>
                </Section>
            ))}

            <Section title="처음 가는 날이라면">
                <Card className="px-4 py-1.5">
                    <ul className="divide-y divide-[#FFFFFF0A]">
                        {PACK_FIRST.map((t) => (
                            <li key={t} className="py-3 text-[14.5px] leading-[1.65] text-[#FFFFFFCC] break-keep">{t}</li>
                        ))}
                    </ul>
                </Card>
            </Section>

            <Section title="자주 묻는 것">
                <Card className="px-4 py-1.5">
                    <dl className="divide-y divide-[#FFFFFF0A]">
                        {PACK_FAQ.map((f) => (
                            <div key={f.q} className="py-3.5">
                                <dt className="text-[15px] font-semibold text-white break-keep">{f.q}</dt>
                                <dd className="mt-1.5 text-[14px] leading-[1.65] text-[#FFFFFFB3] break-keep">{f.a}</dd>
                            </div>
                        ))}
                    </dl>
                </Card>
            </Section>

            <nav className="px-5 pt-8 pb-4 flex flex-wrap gap-2" aria-label="더 보기">
                <Link href="/golf/courses" className="h-10 px-4 rounded-full bg-[#FFFFFF0F] text-[14px] font-medium text-[#FFFFFFCC] inline-flex items-center active:bg-[#FFFFFF1A]">전국 골프장 · 날씨</Link>
                <Link href="/golf/join" className="h-10 px-4 rounded-full bg-[#FFFFFF0F] text-[14px] font-medium text-[#FFFFFFCC] inline-flex items-center active:bg-[#FFFFFF1A]">조인 찾기</Link>
            </nav>
        </CourseShell>
    );
}
