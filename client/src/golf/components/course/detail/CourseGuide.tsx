/**
 * 골프장 상세의 '가이드' 구역(2026-10-12) — 개요 · 코스 구성 · 코스 특징 · 대표 홀 · 시설 · 오는 길 · 라운드 팁 · 자주 묻는 것.
 *
 * 값은 서버가 걸러서 담아 둔 것(golf_course_pages.guide — 규칙은 shared/golfCourseGuide)을 그대로 그린다. 값이 없는 구역은 그리지 않는다.
 * 검색용 화면(server/prerender.ts courseGuideHtml)과 같은 글 · 같은 순서다.
 *
 * 길어서 처음에는 개요 + 코스 구성만 보이고, 나머지는 '더 보기'로 펼친다(티타임 · 날씨 · 그린피가 이 구역 밑으로 밀리지 않게 구역은 그 뒤에 온다).
 * 문답은 하나씩 접었다 편다.
 * ⚠️ 리터럴 색만(골프 테마가 흰색 · 검정 유틸을 바꿔 끼운다). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useState } from "react";
import { LucideChevronDown } from "@/lib/icons";
import { GUIDE_LABEL, type CourseGuide as Guide } from "@shared/golfCourseGuide";
import { Card, Section } from "./ui";

const H = ({ children }: { children: string }) => <h3 className="text-[13px] font-semibold text-[#64DD17]">{children}</h3>;
const P = ({ children }: { children: string }) => <p className="mt-1.5 text-[15px] leading-[1.7] text-[#FFFFFFD9] break-keep">{children}</p>;

export function CourseGuide({ name, guide }: { name: string; guide: Guide }) {
    const [more, setMore] = useState(false);
    const [open, setOpen] = useState<number | null>(null);
    const rest = !!(guide.layout || guide.signature.length || guide.facilities || guide.access || guide.tips.length || guide.faq.length);

    return (
        <Section id="guide" title={GUIDE_LABEL.section}>
            <Card className="p-4" >
                <div data-testid="course-guide" data-open={more ? "1" : "0"}>
                    {guide.overview && <p className="text-[15px] leading-[1.7] text-[#FFFFFFD9] break-keep">{guide.overview}</p>}

                    {guide.courses.length > 0 && (
                        <div className="mt-4 border-t border-[#FFFFFF0F] pt-4">
                            <H>{GUIDE_LABEL.courses}</H>
                            <ul className="mt-2 space-y-3">
                                {guide.courses.map((c, i) => (
                                    <li key={`${c.name}:${i}`}>
                                        <p className="text-[15px] font-semibold text-[#FFFFFF] break-keep">
                                            {c.name}{c.holes ? <span className="ml-1.5 text-[13px] font-normal text-[#FFFFFF80]">{c.holes}홀</span> : null}
                                        </p>
                                        {c.desc && <p className="mt-0.5 text-[14px] leading-[1.65] text-[#FFFFFFB3] break-keep">{c.desc}</p>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {rest && !more && (
                        <button type="button" onClick={() => setMore(true)} className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-xl bg-[#FFFFFF0F] text-[14px] font-medium text-[#FFFFFFCC] active:bg-[#FFFFFF1F]" data-testid="course-guide-more">
                            {name} 가이드 더 보기
                            <LucideChevronDown weight="bold" className="h-4 w-4" aria-hidden />
                        </button>
                    )}

                    {more && (
                        <div className="mt-4 space-y-4 border-t border-[#FFFFFF0F] pt-4">
                            {guide.layout && <div><H>{GUIDE_LABEL.layout}</H><P>{guide.layout}</P></div>}
                            {guide.signature.length > 0 && (
                                <div>
                                    <H>{GUIDE_LABEL.signature}</H>
                                    <ul className="mt-2 space-y-2.5">
                                        {guide.signature.map((h, i) => (
                                            <li key={`${h.hole}:${i}`}>
                                                <p className="text-[14.5px] font-semibold text-[#FFFFFF] break-keep">{h.hole}</p>
                                                <p className="mt-0.5 text-[14px] leading-[1.65] text-[#FFFFFFB3] break-keep">{h.desc}</p>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {guide.facilities && <div><H>{GUIDE_LABEL.facilities}</H><P>{guide.facilities}</P></div>}
                            {guide.access && <div><H>{GUIDE_LABEL.access}</H><P>{guide.access}</P></div>}
                            {guide.tips.length > 0 && (
                                <div>
                                    <H>{GUIDE_LABEL.tips}</H>
                                    <ul className="mt-2 space-y-2">
                                        {guide.tips.map((t, i) => (
                                            <li key={i} className="flex gap-2 text-[14.5px] leading-[1.65] text-[#FFFFFFD9] break-keep">
                                                <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#64DD17]" />
                                                <span>{t}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {guide.faq.length > 0 && (
                                <div>
                                    <H>{GUIDE_LABEL.faq}</H>
                                    <ul className="mt-1.5">
                                        {guide.faq.map((f, i) => (
                                            <li key={i} className={i ? "border-t border-[#FFFFFF0F]" : ""}>
                                                <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex min-h-11 w-full items-center gap-2 py-2 text-left">
                                                    <span className="flex-1 text-[14.5px] font-medium text-[#FFFFFF] break-keep">{f.q}</span>
                                                    <LucideChevronDown weight="bold" className={`h-4 w-4 shrink-0 text-[#FFFFFF80] transition-transform ${open === i ? "rotate-180" : ""}`} aria-hidden />
                                                </button>
                                                {open === i && <p className="pb-3 text-[14px] leading-[1.65] text-[#FFFFFFB3] break-keep">{f.a}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            <p className="text-[12.5px] leading-relaxed text-[#FFFFFF73] break-keep">{GUIDE_LABEL.note}</p>
                        </div>
                    )}
                </div>
            </Card>
        </Section>
    );
}

export default CourseGuide;
