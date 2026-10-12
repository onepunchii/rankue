/**
 * /golf/stamps — 도장첩 책장(2026-10-12 오너: "도장깨기가 우리 골프 콘텐츠의 핵심 … 엘리트 코스를 세분화해서 … 장식장 및 수집욕구" → "추천대로 진행").
 * 기획서: docs/01-plan/features/golf-stamp-collection.md
 *
 * 예전 엘리트 화면(/golf/elite60)의 '0 / 60' 한 줄을 **다 채울 수 있는 작은 권**으로 바꿨다:
 * 누구나 도장첩 일곱 권 + 초대장 두 권. 한 권을 다 채우면 그 권의 볼마커를 받는다.
 *
 * 로그인 없이 열린다 — 방문자에게는 예시 도장첩을 보여 준다(오너: "처음 오는 사람도 예시를 보여줘서 와 하게"). 예시일 때는 구역마다 "예시" 표시가 붙는다.
 * 회원은 **늘 내 도장첩**이다(비어 있어도). 다 모으면 어떻게 되는지는 머리줄의 '?' 단추가 연다(StampHelp) —
 * 오너(2026-10-12): "도장깨기의 디폴트가 예시라서 내 도장첩이 우선이 되게, 예시 토글이 아니라 그냥 ? 버튼 누르면 자연스럽게 보여지게".
 * 도장이 아직 없는 회원에게는 맨 위에 그 안내로 가는 한 줄을 둔다.
 *
 * ⚠️ 리터럴 색만(StampParts 머리말). 글자 12px 이상.
 */
import { useState } from "react";
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { STAMP_ALL_OPEN, STAMP_INVITE_TOTAL, STAMP_OPEN_TOTAL } from "@shared/golfStampBooks";
import { CourseShell } from "@/golf/components/course/CourseShell";
import { Skel } from "@/golf/components/course/detail/ui";
import { useStampCollection } from "@/golf/stamps/useStampCollection";
import { TROPHIES } from "@/golf/stamps/bookArt";
import { StampGuide, StampHelpButton, StampHelpSheet } from "@/golf/stamps/StampHelp";
import { BookCover, BookWide, MarkerArt, MarkerCatalog, SHELF_PATH, STAMPS_PATH, SampleJoin, SampleNotice, StampBar, StampSection, bookName, bookPath } from "@/golf/stamps/StampParts";
import { useSeo } from "@/hooks/useSeo";
import { stampsHubSeo } from "@shared/golfStampGuide";

export default function StampBooks() {
    // 검색 · 공유의 제목과 설명 — 검색용 화면(server/seo/golfStamps)과 같은 글(shared/golfStampGuide)
    const seo = stampsHubSeo();
    useSeo({ title: seo.title, description: seo.desc, path: seo.path });
    const col = useStampCollection();
    const { states, summary, sample } = col;
    const open = states.filter((s) => s.book.kind === "open");
    const invite = states.filter((s) => s.book.kind === "invite");
    const [help, setHelp] = useState(false);
    // 회원인데 아직 도장이 없다 — 내 도장첩(빈 칸)을 그대로 보여 주되, 다 모은 모습으로 가는 한 줄을 맨 위에 둔다
    const fresh = !col.isGuest && !col.isLoading && summary.stamped === 0;

    return (
        <CourseShell title="도장깨기" backTo="/dashboard" hideBottomCta right={<StampHelpButton onClick={() => setHelp(true)} />}>
            <StampHelpSheet open={help} onOpenChange={setHelp} />
            {col.isLoading ? (
                <div className="px-5 pt-6 space-y-4" aria-busy="true">
                    <Skel className="h-24" />
                    <div className="grid grid-cols-3 gap-2.5">{[0, 1, 2, 3, 4, 5].map((i) => <Skel key={i} className="aspect-[3/4]" />)}</div>
                </div>
            ) : (
                <div className="pb-10" data-testid="stamp-books" data-sample={sample ? "1" : "0"}>
                    <div className="px-5 pt-5">
                        <SampleNotice col={col} />
                        {fresh && (
                            <button
                                type="button" onClick={() => setHelp(true)} data-testid="stamp-first-hint"
                                className="flex w-full items-center gap-3 rounded-2xl border border-[#E9B94959] bg-[#E9B94914] px-3.5 py-3 text-left active:bg-[#E9B94924]"
                            >
                                <MarkerArt bookId="gangwon" size={44} earned />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] font-semibold text-[#FFFFFF] break-keep">아직 도장이 없어요</span>
                                    <span className="mt-0.5 block text-[13px] text-[#FFFFFF99] break-keep">다 모으면 어떻게 되는지 먼저 볼까요?</span>
                                </span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFD36B]" aria-hidden />
                            </button>
                        )}
                    </div>

                    {/* 예시를 보는 사람에게 — 무엇을 모으는지부터(누가 가진 것이 아니라 목록이다) */}
                    {sample && (
                        <StampSection title="한 권을 다 채우면 받는 볼마커" aside="열 가지" className="pt-5">
                            <MarkerCatalog />
                        </StampSection>
                    )}

                    {/* 한눈에 — 찍은 도장 · 다 채운 권 · 볼마커. 누르면 장식장 */}
                    <div className="px-5 pt-4">
                        <Link href={SHELF_PATH} className="flex items-center rounded-2xl bg-[#FFFFFF0A] border border-[#FFFFFF14] py-3.5 active:bg-[#FFFFFF14]" data-testid="stamp-summary">
                            {([[summary.stamped, `찍은 도장 · ${summary.total}`], [summary.doneBooks.length, "다 채운 도장첩"], [summary.markers, "볼마커"]] as const).map(([n, label]) => (
                                <div key={label} className="flex-1 text-center">
                                    <div className="text-[24px] font-semibold tabular-nums leading-none text-[#FFFFFF]">{n}</div>
                                    <div className="mt-1.5 text-[12px] text-[#FFFFFF8C]">{label}</div>
                                </div>
                            ))}
                            <LucideChevronRight weight="bold" className="mr-2 h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                        </Link>
                    </div>

                    {/* 지금 가장 가까운 권 — 시작한 누구나 도장첩 가운데 남은 칸이 가장 적은 것 */}
                    {summary.nearest && (
                        <div className="px-5 pt-2.5">
                            <Link href={bookPath(summary.nearest.bookId)} className="flex items-center gap-3 rounded-2xl border border-[#64DD1759] bg-[#64DD170F] px-3.5 py-3 active:bg-[#64DD171F]" data-testid="stamp-nearest">
                                <MarkerArt bookId={summary.nearest.bookId} size={48} earned={false} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-semibold text-[#FFFFFF] break-keep">{bookName(summary.nearest.bookId)} 도장첩, {summary.nearest.left}곳 남았어요</p>
                                    <p className="mt-0.5 text-[13px] text-[#FFFFFF99] break-keep">다 채우면 {bookName(summary.nearest.bookId)} 볼마커를 받아요</p>
                                </div>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#64DD17]" aria-hidden />
                            </Link>
                        </div>
                    )}

                    <StampSection title="누구나 도장첩" sample={sample} aside={`대중제 코스가 있는 ${STAMP_OPEN_TOTAL}곳`}>
                        <div className="grid grid-cols-3 gap-x-2.5 gap-y-4">
                            {open.map((s) => <BookCover key={s.book.id} state={s} />)}
                            {/* 일곱 권을 전부 채우면 받는 큰 볼마커 — 권이 아니라 묶음의 묶음이라 장식장으로 간다 */}
                            <Link href={SHELF_PATH} className="block active:opacity-80" data-testid={`stamp-book-${STAMP_ALL_OPEN}`}>
                                <div className="relative flex aspect-[3/4] items-end justify-center rounded-[10px] overflow-hidden pb-[14%]" style={{ background: "radial-gradient(circle at 50% 45%,#17573A,#092A1C)" }}>
                                    <div className="absolute left-2.5 top-2.5 right-1.5 text-[17px] font-semibold leading-tight text-[#FFFFFF]">
                                        누구나 {STAMP_OPEN_TOTAL}
                                        <span className="block mt-0.5 text-[12px] font-normal text-[#FFFFFFBF]">일곱 권 전부</span>
                                    </div>
                                    <MarkerArt bookId={STAMP_ALL_OPEN} size={72} earned={summary.allOpenDone} className={summary.allOpenDone ? undefined : "!opacity-60"} />
                                </div>
                                <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[#FFFFFFB3]">
                                    <span className="tabular-nums"><b className="font-semibold text-[#FFFFFF]">{summary.openStamped}</b>/{summary.openTotal}</span>
                                    <StampBar got={summary.openStamped} total={summary.openTotal} className="flex-1" />
                                </div>
                            </Link>
                            {/* 장식장 — 볼마커와 트로피가 놓이는 곳 */}
                            <Link href={SHELF_PATH} className="block active:opacity-80" data-testid="stamp-book-shelf">
                                <div className="relative flex aspect-[3/4] items-end justify-center rounded-[10px] overflow-hidden bg-[#141414] border border-[#FFFFFF14]">
                                    <div className="absolute left-2.5 top-2.5 right-1.5 text-[17px] font-semibold leading-tight text-[#FFFFFF]">
                                        장식장
                                        <span className="block mt-0.5 text-[12px] font-normal text-[#FFFFFFBF]">볼마커 · 트로피</span>
                                    </div>
                                    <img src={TROPHIES[2].src} alt="" className="w-[92%] -mb-[4%]" loading="lazy" decoding="async" draggable={false} />
                                </div>
                                <div className="mt-1.5 flex items-center gap-1 text-[13px] text-[#FFFFFFB3]">
                                    <span className="flex-1 tabular-nums">볼마커 <b className="font-semibold text-[#FFFFFF]">{summary.markers}</b></span>
                                    <LucideChevronRight weight="bold" className="h-3.5 w-3.5 text-[#FFFFFF66]" aria-hidden />
                                </div>
                            </Link>
                        </div>
                    </StampSection>

                    <SampleJoin col={col} from={STAMPS_PATH} className="pt-6" />

                    <StampSection title="초대장 도장첩" sample={sample} aside={`회원제 ${STAMP_INVITE_TOTAL}곳`}>
                        <div className="grid grid-cols-2 gap-2.5">
                            {invite.map((s) => <BookWide key={s.book.id} state={s} sub={`${s.total}곳 · ${s.got}/${s.total}`} />)}
                        </div>
                        <p className="mt-2.5 text-[13px] leading-snug text-[#FFFFFF8C] break-keep">회원제 골프장이라 회원과 함께 가야 하는 곳이에요. 다녀오면 금빛 도장이 찍혀요.</p>
                    </StampSection>

                    <StampSection title="도장은 이렇게 찍혀요">
                        {/* 가이드 — 그림 붙은 세 단계(2026-10-12 오너: "도장깨기 가이드 … 우리가 만든 이미지 같이 들어가면"). '?' 안내 시트와 같은 조각이다 */}
                        <StampGuide />
                        <button type="button" onClick={() => setHelp(true)} className="mt-3 flex w-full items-center gap-1 text-left text-[14px] text-[#FFFFFFB3] active:text-[#FFFFFF]" data-testid="stamp-help-link">
                            <span className="flex-1 break-keep">다 모으면 어떻게 되는지 보기</span>
                            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                        </button>
                        <Link href="/golf/passport" className="mt-3 flex items-center gap-1 text-[14px] text-[#FFFFFFB3] active:text-[#FFFFFF]">
                            <span className="flex-1 break-keep">도장첩 밖의 골프장 도장은 골프 여권에 모여요</span>
                            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                        </Link>
                    </StampSection>
                </div>
            )}
        </CourseShell>
    );
}
