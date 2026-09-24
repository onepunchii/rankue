/**
 * 소개 + 기본정보(2026-09-24) — TGM 소개문과 개장일·회원 수·회원권 종류·홈페이지. 있는 것만.
 */
import { useState, type ReactNode } from "react";
import type { CourseDetail } from "@/golf/lib/courseApi";
import { Card, Section } from "./ui";

function openedText(v: string): { date: string; years: number | null } {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v);
    if (!m) return { date: v, years: null };
    const y = Number(m[1]);
    const now = new Date();
    return { date: `${y}년 ${Number(m[2])}월`, years: now.getFullYear() - y };
}

export function AboutInfo({ intro, info, grass }: { intro: string | null; info: CourseDetail["info"]; grass?: string[] }) {
    const [more, setMore] = useState(false);
    const rows: { k: string; v: ReactNode }[] = [];
    if (info?.opened) {
        const o = openedText(info.opened);
        // "40년째" 는 한 해 적다(1986년 개장이 2026년이면 41년째) — 햇수로만 말한다.
        rows.push({ k: "개장", v: <>{o.date}{o.years && o.years > 0 ? <span className="text-[#FFFFFF66]"> · {o.years}년</span> : null}</> });
    }
    if (info?.members) rows.push({ k: "회원 수", v: `${info.members.toLocaleString("ko-KR")}명` });
    if (info?.membershipTypes) rows.push({ k: "회원권", v: info.membershipTypes });
    // 홈페이지는 '위치·연락' 칸의 단추로 옮겼다(대표 전화와 나란히) — 두 군데에 두지 않는다.
    if (grass?.length) rows.push({ k: "잔디", v: grass.join(" · ") });
    if (!intro && !rows.length) return null;
    const long = (intro?.length ?? 0) > 140;

    return (
        <Section id="about" title="소개">
            <Card className="p-4">
                {intro && (
                    <div>
                        <p className={`text-[15px] leading-[1.7] text-[#FFFFFFD9] break-keep whitespace-pre-line ${long && !more ? "line-clamp-4" : ""}`}>{intro}</p>
                        {long && !more && (
                            <button type="button" onClick={() => setMore(true)} className="mt-1 h-8 text-[13px] font-medium text-[#FFFFFF99] active:text-white">더 보기</button>
                        )}
                    </div>
                )}
                {rows.length > 0 && (
                    <dl className={`${intro ? "mt-4 pt-4 border-t border-[#FFFFFF0F]" : ""} space-y-2.5`}>
                        {rows.map((r) => (
                            <div key={r.k} className="flex gap-3 text-[14px]">
                                <dt className="w-[64px] shrink-0 text-[#FFFFFF80]">{r.k}</dt>
                                <dd className="flex-1 min-w-0 text-white break-keep">{r.v}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                {info?.membershipNotes && (
                    <p className="mt-3 text-[13px] leading-relaxed text-[#FFFFFF80] break-keep">{info.membershipNotes}</p>
                )}
            </Card>
        </Section>
    );
}
