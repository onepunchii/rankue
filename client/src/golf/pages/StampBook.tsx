/**
 * /golf/stamps/:book — 도장첩 한 권(2026-10-12). 표지 · 다 채우면 받는 볼마커 · 도장 칸(종이 위).
 *
 * 빈 칸은 이름과 함께 보인다 — 무엇이 남았는지 알아야 가고 싶어진다. 칸을 누르면 그 골프장의 공개 페이지(조인 · 부킹 · 날씨 · 시세)로 간다.
 * 미인증 기록만 있는 골프장은 흐린 도장으로 보이고 칸은 차지 않는다(현장 인증 규칙 — shared/golfOnSite).
 *
 * 로그인 없이 열린다(예시 도장첩). ⚠️ 리터럴 색만(StampParts 머리말) — 종이 위의 글자도 hex.
 */
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { LucideChevronRight, LucideShare2 } from "@/lib/icons";
import { CourseShell } from "@/golf/components/course/CourseShell";
import { Skel } from "@/golf/components/course/detail/ui";
import { BOOK_ART, coverSrc } from "@/golf/stamps/bookArt";
import { InkStamp } from "@/golf/stamps/InkStamp";
import { StampHelpButton, StampHelpSheet } from "@/golf/stamps/StampHelp";
import { StampShareSheet } from "@/golf/stamps/StampShareSheet";
import { awardWhen, useStampAwards } from "@/golf/stamps/useStampAwards";
import { useStampCollection } from "@/golf/stamps/useStampCollection";
import { MarkerArt, STAMPS_PATH, SampleJoin, SampleNotice, StampBar, StampPaper, StampSection, bookPath } from "@/golf/stamps/StampParts";
import { lastEmptySlot } from "@shared/golfStampOneLeft";
import { useSeo } from "@/hooks/useSeo";
import { stampBookSeo } from "@shared/golfStampGuide";

/** 손으로 찍은 것처럼 칸마다 조금씩 다른 기울기(도) */
const TILT = [-5, 4, -2, 6, -4, 3, -6, 5, -3, 2, -5];

export default function StampBookPage() {
    const [, params] = useRoute("/golf/stamps/:book");
    const col = useStampCollection();
    const state = col.states.find((s) => s.book.id === params?.book);
    const [help, setHelp] = useState(false);
    const [share, setShare] = useState(false);
    // 검색 · 공유의 제목과 설명 — 검색용 화면(server/seo/golfStamps)과 같은 글. 없는 권이면 건드리지 않는다
    const seo = state ? stampBookSeo(state.book) : null;
    useSeo(seo ? { title: seo.title, description: seo.desc, path: seo.path } : null);
    // 받은 기록(몇 번째 · 받은 날) — 회원의 것만. 예시에는 붙이지 않는다
    const awards = useStampAwards();

    if (!state) {
        return (
            <CourseShell title="도장첩" backTo={STAMPS_PATH} hideBottomCta>
                <div className="px-5 pt-16 text-center">
                    <p className="text-[15px] text-[#FFFFFFB3]">없는 도장첩이에요.</p>
                    <Link href={STAMPS_PATH} className="mt-4 inline-flex h-11 items-center rounded-full bg-[#64DD17] px-5 text-[14px] font-semibold text-[#051907]">도장첩 책장으로</Link>
                </div>
            </CourseShell>
        );
    }

    const { book, slots, got, total, done } = state;
    const art = BOOK_ART[book.id];
    const invite = book.kind === "invite";
    const left = total - got;
    const records = slots.filter((s) => s.record).length;
    const award = col.sample ? undefined : awards.of("book", book.id);
    // '한 곳 남음' — 내 도장첩에서 빈 칸이 딱 하나일 때(누구나 권만). 알림(서버)과 같은 셈이다. 예시에는 붙이지 않는다
    const last = col.sample ? null : lastEmptySlot(state);

    return (
        <CourseShell title={`${book.name} 도장첩`} backTo={STAMPS_PATH} hideBottomCta right={<StampHelpButton onClick={() => setHelp(true)} />}>
            <StampHelpSheet open={help} onOpenChange={setHelp} />
            {/* 완성 카드 — 내가 다 채운 권에서만 열린다(예시 · 채우는 중에는 단추가 없다) */}
            {done && !col.sample && <StampShareSheet open={share} onClose={() => setShare(false)} bookId={book.id} bookName={book.name} />}
            <div className="pb-10" data-testid="stamp-book" data-book={book.id} data-sample={col.sample ? "1" : "0"}>
                {/* 표지 — 위쪽 하늘에 제목 */}
                <div className="relative h-[232px] overflow-hidden">
                    <img src={coverSrc(book.id)} alt="" className="absolute inset-x-0 top-0 w-full" draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0A0A0A00 45%,#0A0A0A 98%)" }} aria-hidden />
                    <div className="absolute left-5 top-4" style={{ color: art?.darkSky ? "#FFFFFF" : "#17324A" }}>
                        <h1 className="text-[28px] font-semibold tracking-tight leading-none">{book.name}</h1>
                        <p className="mt-1.5 text-[13px] opacity-80">랭큐 도장첩 · {total}곳</p>
                    </div>
                </div>

                <div className="px-5 pt-1">
                    <SampleNotice col={col} />
                </div>

                {col.isLoading ? (
                    <div className="px-5 pt-4 space-y-3" aria-busy="true"><Skel className="h-20" /><Skel className="h-64" /></div>
                ) : (
                    <>
                        {/* 다 채우면 받는 것 */}
                        <div className="px-5 pt-3.5">
                            <div className="flex items-center gap-3.5 rounded-2xl border px-3.5 py-3" style={{ background: "#FFFFFF0A", borderColor: done ? "#E9B94980" : "#FFFFFF14" }} data-testid="stamp-reward">
                                <MarkerArt bookId={book.id} size={66} earned={done} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12px] text-[#FFD36B] break-keep" data-testid="stamp-reward-when">{done ? (award ? `다 채워서 받은 볼마커 · ${awardWhen(award)}` : "다 채워서 받은 볼마커") : "다 채우면 받는 볼마커"}</p>
                                    <p className="mt-0.5 text-[16px] font-semibold text-[#FFFFFF] break-keep">
                                        {book.name} 볼마커
                                        {!done && <span className="ml-1.5 text-[13px] font-normal text-[#FFFFFF99]">{left}곳 남음</span>}
                                    </p>
                                    <StampBar got={got} total={total} className="mt-2" />
                                </div>
                                <div className="text-[17px] font-semibold tabular-nums text-[#FFFFFF]">{got}<span className="text-[13px] font-normal text-[#FFFFFF99]">/{total}</span></div>
                            </div>
                        </div>

                        {/* 다 채운 권 — 완성 카드를 내보낸다(서명된 주소 · 30일). 예시에는 없다 */}
                        {done && !col.sample && (
                            <div className="px-5 pt-2.5">
                                <button type="button" onClick={() => setShare(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#E9B94924] text-[15px] font-semibold text-[#FFD36B] ring-1 ring-inset ring-[#E9B94959] active:bg-[#E9B9493D]" data-testid="stamp-share">
                                    <LucideShare2 weight="bold" className="h-[18px] w-[18px]" aria-hidden />
                                    완성 카드 공유
                                </button>
                            </div>
                        )}

                        {/* 한 곳 남음 — 마지막 골프장으로 가는 줄. 조인 · 날씨 · 관심 알림은 그 골프장 화면에 있다 */}
                        {last && (
                            <div className="px-5 pt-2.5">
                                <Link href={`/golf/course/${last.slot.courseId}`} className="flex items-center gap-3 rounded-2xl bg-[#E9B94914] px-3.5 py-3 ring-1 ring-inset ring-[#E9B94940] active:bg-[#E9B94926]" data-testid="stamp-one-left" data-slot={last.slot.key}>
                                    <span className="shrink-0 rounded-[10px] bg-[#F4EFE3] p-1" aria-hidden>
                                        <InkStamp name={last.slot.name} ink={art?.ink ?? "#2F6BD6"} glyph={art?.glyph ?? "tree"} size={46} state="empty" tilt={0} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13px] text-[#FFD36B]">한 곳 남았어요</span>
                                        <span className="mt-0.5 block text-[16px] font-semibold text-[#FFFFFF] break-keep">{last.slot.name}</span>
                                        <span className="mt-0.5 block text-[13px] leading-snug text-[#FFFFFFB3] break-keep">조인 · 날씨를 보고, 관심을 켜 두면 자리가 날 때 알려 드려요</span>
                                    </span>
                                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFD36B]" aria-hidden />
                                </Link>
                            </div>
                        )}

                        <StampSection title={`도장 ${total}칸`} sample={col.sample} aside={invite ? "회원제 골프장" : "골프장에서 18홀을 끝내면 찍혀요"}>
                            <StampPaper className="px-2.5 pt-4 pb-3.5">
                                <div className="grid grid-cols-3 gap-x-1 gap-y-3.5">
                                    {slots.map((s, i) => {
                                        const shownStamp = s.stamp ?? s.record;
                                        return (
                                            <Link
                                                key={s.slot.key} href={`/golf/course/${s.slot.courseId}`}
                                                className="flex flex-col items-center gap-1 text-center active:opacity-70"
                                                data-testid={`stamp-slot-${s.slot.key}`} data-state={s.stamp ? "on" : s.record ? "record" : "empty"}
                                            >
                                                <div className="w-full max-w-[112px] px-0.5">
                                                    <InkStamp
                                                        name={s.slot.name} date={shownStamp?.date} ink={art?.ink ?? "#2F6BD6"} glyph={art?.glyph ?? "tree"}
                                                        state={s.stamp ? "on" : s.record ? "faded" : "empty"} tilt={s.stamp ? TILT[i % TILT.length] : 0}
                                                    />
                                                </div>
                                                <span className="text-[12.5px] leading-tight break-keep" style={{ color: s.stamp ? "#1F1C16" : "#5C5444", fontWeight: s.stamp ? 600 : 400 }}>{s.slot.name}</span>
                                                {s.stamp
                                                    ? (s.stamp.score != null && <span className="text-[12px] tabular-nums text-[#6B6456]">베스트 {s.stamp.score}</span>)
                                                    : s.record
                                                        ? <span className="text-[12px] text-[#8A6A1A]">미인증 기록</span>
                                                        : <span className="inline-flex h-6 items-center rounded-full bg-[#DDEBC8] px-2 text-[12px] text-[#2F6A0C]">골프장 보기</span>}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </StampPaper>
                            {records > 0 && (
                                <p className="mt-2.5 text-[13px] leading-snug text-[#FFFFFF8C] break-keep">흐린 도장은 현장 인증 없이 적은 기록이에요. 그 골프장에서 라운드를 끝내면 또렷한 도장으로 바뀌어요.</p>
                            )}
                            {invite && (
                                <p className="mt-2.5 text-[13px] leading-snug text-[#FFFFFF8C] break-keep">회원제 골프장이라 회원과 함께 가야 하는 곳이에요. 서두르지 않아도 돼요 — 다녀온 만큼만 찍혀요.</p>
                            )}
                        </StampSection>

                        <SampleJoin col={col} from={bookPath(book.id)} className="pt-6" />

                        <div className="px-5 pt-6">
                            <Link href={STAMPS_PATH} className="flex items-center gap-1 text-[14px] text-[#FFFFFFB3] active:text-[#FFFFFF]">
                                <span className="flex-1">다른 도장첩 보기</span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </CourseShell>
    );
}
