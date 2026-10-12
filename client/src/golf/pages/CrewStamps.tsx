/**
 * /crew/:id/stamps — 크루 도장첩(2026-10-12 크루 도장깨기. 오너: "크루끼리 도장깨기 하러 가듯").
 *
 * 크루 도장은 같은 라운드에서 크루원 둘 이상이 현장 인증한 골프장이다(shared/golfCrewStamps). 넷이 한 조를 채우면 금테.
 * 도장첩은 개인 것과 같은 아홉 권 · 같은 칸이다 — 권을 다 채우면 크루 깃발을 받는다(가운데 패치에 크루 엠블럼).
 * 빈 칸을 누르면 그 골프장의 공개 페이지(조인 · 부킹 · 날씨)로 간다 — 다음 원정지를 고르는 길이다.
 *
 * 누구에게나 열려 있다(크루 홈과 같다). 사람 이름은 없다 — 골프장 · 날짜 · 라운드 수뿐.
 * 예시는 그리지 않는다: 크루의 실제 도장첩이고, 비어 있으면 규칙과 빈 칸이 보인다.
 * ⚠️ 리터럴 색만(StampParts 머리말). 글자는 12px 이상.
 */
import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideChevronDown } from "@/lib/icons";
import { CourseShell } from "@/golf/components/course/CourseShell";
import { Skel } from "@/golf/components/course/detail/ui";
import { BOOK_ART, PLAIN_STAMP, coverSrc } from "@/golf/stamps/bookArt";
import { InkStamp } from "@/golf/stamps/InkStamp";
import { CREW_STAMP_RULE, CREW_STAMP_RULE_JOIN, CrewFlagPiece, flagLabel, flagLook, useCrewStamps } from "@/golf/stamps/CrewStampParts";
import { StampBar, StampPaper, StampSection } from "@/golf/stamps/StampParts";
import { stampDate } from "@/golf/stamps/stampDate";
import { stampLabel } from "@/golf/stamps/stampLabel";
import { crewBookStates, crewFlagLook, crewStampIsElite, crewStampSummary, type CrewFlagLook } from "@shared/golfCrewStamps";

/** 손으로 찍은 것처럼 칸마다 조금씩 다른 기울기(도) */
const TILT = [-5, 4, -2, 6, -4, 3, -6, 5, -3, 2, -5];
/** 깃발 다섯 가지 — 무엇을 하면 받는지 */
const FLAG_KINDS: readonly { look: CrewFlagLook; name: string; how: string }[] = [
    { look: "green", name: "깃발", how: "누구나 도장첩 한 권을 다 채움" },
    { look: "crimson", name: "1호", how: "그 권을 처음 다 채운 크루" },
    { look: "navy", name: "풀조", how: "한 권 전부를 넷이 한 조로" },
    { look: "purple", name: "초대장", how: "초대장 도장첩 한 권" },
    { look: "gold", name: "누구나 36", how: "누구나 일곱 권 전부" },
];

export default function CrewStampsPage() {
    const [, params] = useRoute("/crew/:id/stamps");
    const id = params?.id;
    const { data: crewData, isLoading: crewLoading } = useQuery<{ crew: { id: string; name: string; emblem?: string | null; sportCategory?: string } }>({ queryKey: [`/api/hiq/crews/${id}`], enabled: !!id });
    const { data, isLoading } = useCrewStamps(id);
    const crew = crewData?.crew;
    const stamps = data?.stamps ?? [];
    const flags = data?.flags ?? [];
    const states = useMemo(() => crewBookStates(stamps), [stamps]);
    const sum = useMemo(() => crewStampSummary(stamps), [stamps]);
    const outside = useMemo(() => stamps.filter((s) => !crewStampIsElite(s)), [stamps]);
    // 처음에 펼쳐 둘 권 — 채우는 중인 권 가운데 남은 칸이 가장 적은 것, 없으면 첫 권
    const first = useMemo(() => [...states].filter((s) => !s.done && s.got > 0).sort((a, b) => (a.total - a.got) - (b.total - b.got))[0]?.book.id ?? states[0]?.book.id ?? null, [states]);
    const [open, setOpen] = useState<string | null | undefined>(undefined);
    const opened = open === undefined ? first : open;
    const brand = { name: crew?.name ?? "크루", emblem: crew?.emblem ?? null };
    const back = id ? `/crew/${id}` : "/";

    if (!crewLoading && crew && crew.sportCategory !== "GOLF") {
        return (
            <CourseShell title="크루 도장첩" backTo={back} hideBottomCta>
                <div className="px-5 pt-16 text-center">
                    <p className="text-[15px] text-[#FFFFFFB3] break-keep">크루 도장첩은 골프 크루에만 있어요.</p>
                    <Link href={back} className="mt-4 inline-flex h-11 items-center rounded-full bg-[#64DD17] px-5 text-[14px] font-semibold text-[#051907]">크루로 돌아가기</Link>
                </div>
            </CourseShell>
        );
    }

    return (
        <CourseShell title="크루 도장첩" backTo={back} hideBottomCta>
            {isLoading || crewLoading ? (
                <div className="px-5 pt-6 space-y-4" aria-busy="true"><Skel className="h-20" /><Skel className="h-40" /><Skel className="h-64" /></div>
            ) : (
                <div className="pb-10" data-testid="crew-stamps" data-count={sum.total}>
                    <div className="px-5 pt-5">
                        <p className="text-[13px] text-[#D7F5B8]">크루 도장깨기</p>
                        <h1 className="mt-0.5 text-[22px] font-semibold tracking-tight text-[#FFFFFF] break-keep">{brand.name}</h1>
                        <div className="mt-3.5 flex rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF0A] py-3.5" data-testid="crew-stamp-summary">
                            {([[sum.total, "크루 도장"], [sum.full, "금테"], [sum.books, "다 채운 권"], [flags.length, "깃발"]] as const).map(([n, label]) => (
                                <div key={label} className="flex-1 text-center">
                                    <div className="text-[24px] font-semibold tabular-nums leading-none text-[#FFFFFF]">{n}</div>
                                    <div className="mt-1.5 text-[12px] text-[#FFFFFF8C]">{label}</div>
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 text-[13.5px] leading-snug text-[#FFFFFFB3] break-keep" data-testid="crew-stamp-rule">{CREW_STAMP_RULE} {CREW_STAMP_RULE_JOIN}</p>
                    </div>

                    {/* 깃발 — 받은 깃발 먼저, 그 아래 다섯 가지가 무엇인지 */}
                    <StampSection title="크루 깃발" aside="도장첩을 다 채우면 하나">
                        {flags.length > 0 && (
                            <ul className="mb-3 rounded-2xl bg-[#FFFFFF08]" data-testid="crew-flags">
                                {flags.map((f, i) => (
                                    <li key={f.id} className={`flex items-center gap-3 px-3 py-2${i ? " border-t border-[#FFFFFF0F]" : ""}`}>
                                        <CrewFlagPiece look={flagLook(f)} size={60} crew={brand} />
                                        <span className="min-w-0 flex-1 text-[14.5px] font-medium text-[#FFFFFF] break-keep">{flagLabel(f)}</span>
                                        <span className="shrink-0 text-[13px] tabular-nums text-[#FFFFFF99]">{f.serial}번째 · {stampDate(f.earnedAt)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <ul className="grid grid-cols-5 gap-x-1 rounded-2xl bg-[#FFFFFF08] px-1.5 py-3.5" data-testid="crew-flag-kinds">
                            {FLAG_KINDS.map((k) => {
                                // 1호(진홍)는 기본 깃발의 한 가지다 — 1호를 받은 크루도 기본 깃발을 가진 것으로 보인다
                                const got = flags.some((f) => flagLook(f) === k.look || (k.look === "green" && f.kind === "flag" && crewFlagLook("flag", f.key, null) === "green"));
                                return (
                                    <li key={k.look} className="flex flex-col items-center text-center">
                                        <CrewFlagPiece look={k.look} size={54} crew={brand} earned={got} />
                                        <span className="mt-1 text-[12.5px] font-medium leading-tight" style={{ color: got ? "#FFFFFF" : "#FFFFFFB3" }}>{k.name}</span>
                                        <span className="mt-0.5 px-0.5 text-[12px] leading-snug text-[#FFFFFF73] break-keep">{k.how}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </StampSection>

                    {/* 도장첩 아홉 권 — 한 권씩 펼친다. 빈 칸은 그 골프장으로 */}
                    <StampSection title="크루 도장첩" aside="개인 도장첩과 같은 아홉 권">
                        <ul className="space-y-2.5">
                            {states.map((st) => {
                                const art = BOOK_ART[st.book.id];
                                const on = opened === st.book.id;
                                return (
                                    <li key={st.book.id} data-testid={`crew-book-${st.book.id}`} data-open={on ? "1" : "0"}>
                                        <button
                                            type="button" onClick={() => setOpen(on ? null : st.book.id)} aria-expanded={on}
                                            className="relative block h-[76px] w-full overflow-hidden rounded-xl bg-[#1A1A1A] text-left active:opacity-80"
                                        >
                                            <img src={coverSrc(st.book.id)} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 62%" }} loading="lazy" decoding="async" draggable={false} />
                                            <span className="absolute inset-0" style={{ background: "linear-gradient(90deg,#000000C7,#00000040)" }} aria-hidden />
                                            <span className="absolute left-3 right-12 top-2.5">
                                                <span className="block text-[15px] font-semibold text-[#FFFFFF] break-keep">{st.book.name}{st.done && <span className="ml-1.5 text-[12.5px] font-medium text-[#FFD36B]">다 채웠어요</span>}</span>
                                                <span className="mt-0.5 block text-[12.5px] tabular-nums text-[#FFFFFFBF]">{st.got}/{st.total}곳</span>
                                                <StampBar got={st.got} total={st.total} className="mt-1.5 max-w-[190px]" />
                                            </span>
                                            <LucideChevronDown weight="bold" className={`absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#FFFFFFCC] transition-transform ${on ? "rotate-180" : ""}`} aria-hidden />
                                        </button>
                                        {on && (
                                            <StampPaper className="mt-2 px-2.5 pt-4 pb-3.5">
                                                <div className="grid grid-cols-3 gap-x-1 gap-y-3.5">
                                                    {st.slots.map((s, i) => (
                                                        <Link
                                                            key={s.slot.key} href={`/golf/course/${s.slot.courseId}`}
                                                            className="flex flex-col items-center gap-1 text-center active:opacity-70"
                                                            data-testid={`crew-slot-${s.slot.key}`} data-state={s.stamp ? "on" : "empty"}
                                                        >
                                                            <div className="w-full max-w-[112px] px-0.5">
                                                                <InkStamp
                                                                    name={s.slot.name} date={s.stamp ? stampDate(new Date(s.stamp.firstAt)) : null} ink={art?.ink ?? "#2F6BD6"} glyph={art?.glyph ?? "tree"}
                                                                    state={s.stamp ? "on" : "empty"} tilt={s.stamp ? TILT[i % TILT.length] : 0}
                                                                    depth={s.stamp ? { gold: s.stamp.full } : null}
                                                                />
                                                            </div>
                                                            <span className="text-[12.5px] leading-tight break-keep" style={{ color: s.stamp ? "#1F1C16" : "#5C5444", fontWeight: s.stamp ? 600 : 400 }}>{s.slot.name}</span>
                                                            {s.stamp
                                                                ? <span className="text-[12px] tabular-nums" style={{ color: s.stamp.full ? "#8A5E00" : "#6B6456", fontWeight: s.stamp.full ? 600 : 400 }}>{s.stamp.full ? "금테 · " : ""}{s.stamp.rounds}번</span>
                                                                : <span className="inline-flex h-6 items-center rounded-full bg-[#DDEBC8] px-2 text-[12px] text-[#2F6A0C]">골프장 보기</span>}
                                                        </Link>
                                                    ))}
                                                </div>
                                            </StampPaper>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </StampSection>

                    {/* 도장첩 밖의 골프장 — 깃발에는 세지 않지만 같이 간 곳은 남는다 */}
                    {outside.length > 0 && (
                        <StampSection title="도장첩 밖의 골프장" aside={`${outside.length}곳`}>
                            <StampPaper className="px-2.5 pt-4 pb-3.5">
                                <div className="grid grid-cols-3 gap-x-1 gap-y-3.5" data-testid="crew-outside">
                                    {outside.map((s, i) => (
                                        <div key={s.clubKey} className="flex flex-col items-center gap-1 text-center">
                                            <div className="w-full max-w-[112px] px-0.5">
                                                <InkStamp name={stampLabel(s.name)} date={stampDate(new Date(s.firstAt))} ink={PLAIN_STAMP.ink} glyph={PLAIN_STAMP.glyph} tilt={TILT[i % TILT.length]} depth={{ gold: s.full }} />
                                            </div>
                                            <span className="text-[12.5px] font-semibold leading-tight text-[#1F1C16] break-keep">{stampLabel(s.name)}</span>
                                            <span className="text-[12px] tabular-nums text-[#6B6456]">{s.full ? "금테 · " : ""}{s.rounds}번</span>
                                        </div>
                                    ))}
                                </div>
                            </StampPaper>
                        </StampSection>
                    )}

                    <div className="px-5 pt-8">
                        <Link href={back} className="flex h-12 items-center justify-center rounded-xl bg-[#64DD17] text-[15px] font-semibold text-[#051907] active:bg-[#58C614]">크루로 돌아가기</Link>
                    </div>
                </div>
            )}
        </CourseShell>
    );
}
