/**
 * /golf/shelf — 골프 장식장(2026-10-12). 볼마커 수집함 + 엘리트 트로피.
 *
 * 볼마커는 도장첩 한 권을 다 채우면 하나(권 아홉 + 누구나 일곱 권 전부 = 열 칸), 트로피는 찍은 엘리트 골프장 수(10 · 20 · 30 · 45 · 전부).
 * 못 받은 것도 윤곽이 보인다 — 무엇이 남았는지 알아야 모으고 싶어진다.
 * 당구의 장식장(온라인게임의 메달 · 등급 배지)과는 다른 물건이다 — 당구 배지를 여기에 섞지 않는다.
 *
 * 로그인 없이 열린다(예시 장식장). ⚠️ 리터럴 색만(StampParts 머리말).
 */
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { STAMP_BOOKS, STAMP_TROPHY_STEPS } from "@shared/golfStampBooks";
import { CourseShell } from "@/golf/components/course/CourseShell";
import { Skel } from "@/golf/components/course/detail/ui";
import { useStampCollection } from "@/golf/stamps/useStampCollection";
import { MarkerCase, SHELF_PATH, STAMPS_PATH, SampleJoin, SampleNotice, StampBar, StampSection, TrophyShelf, bookName, bookPath } from "@/golf/stamps/StampParts";

export default function GolfShelf() {
    const col = useStampCollection();
    const { states, summary, sample } = col;
    const lastStep = STAMP_TROPHY_STEPS[STAMP_TROPHY_STEPS.length - 1];
    // 볼마커는 권마다 하나 + 누구나 일곱 권 전부
    const markerTotal = STAMP_BOOKS.length + 1;

    return (
        <CourseShell title="골프 장식장" backTo={STAMPS_PATH} hideBottomCta>
            {col.isLoading ? (
                <div className="px-5 pt-6 space-y-4" aria-busy="true"><Skel className="h-16" /><Skel className="h-56" /><Skel className="h-40" /></div>
            ) : (
                <div className="pb-10" data-testid="golf-shelf" data-sample={sample ? "1" : "0"}>
                    <div className="px-5 pt-5">
                        <SampleNotice col={col} />
                    </div>

                    <div className="px-5 pt-4">
                        <div className="flex rounded-2xl bg-[#FFFFFF0A] border border-[#FFFFFF14] py-3.5" data-testid="shelf-summary">
                            {([[summary.markers, `볼마커 · ${markerTotal}`], [summary.trophies, `트로피 · ${STAMP_TROPHY_STEPS.length}`], [summary.stamped, `찍은 도장 · ${summary.total}`]] as const).map(([n, label]) => (
                                <div key={label} className="flex-1 text-center">
                                    <div className="text-[24px] font-semibold tabular-nums leading-none text-[#FFFFFF]">{n}</div>
                                    <div className="mt-1.5 text-[12px] text-[#FFFFFF8C]">{label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <StampSection title="볼마커 수집함" sample={sample} aside="도장첩을 다 채우면 한 개">
                        <MarkerCase states={states} summary={summary} />
                        {summary.nearest && (
                            <Link href={bookPath(summary.nearest.bookId)} className="mt-3 flex items-center gap-1 text-[14px] text-[#FFFFFFB3] active:text-[#FFFFFF]" data-testid="shelf-nearest">
                                <span className="flex-1 break-keep">다음 볼마커는 {bookName(summary.nearest.bookId)} — {summary.nearest.left}곳 남았어요</span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                            </Link>
                        )}
                    </StampSection>

                    <StampSection title="엘리트 트로피" sample={sample} aside="찍은 엘리트 골프장 수">
                        <TrophyShelf stamped={summary.stamped} />
                        <div className="mt-3" data-testid="shelf-next-trophy">
                            {summary.nextTrophy ? (
                                <>
                                    <div className="flex items-baseline justify-between text-[13px] text-[#FFFFFFB3]">
                                        <span className="break-keep">다음 트로피까지 {summary.nextTrophy.left}곳</span>
                                        <span className="tabular-nums">{summary.stamped} / {summary.nextTrophy.at === lastStep ? "전부" : summary.nextTrophy.at}</span>
                                    </div>
                                    <StampBar got={summary.stamped} total={summary.nextTrophy.at} className="mt-2" />
                                </>
                            ) : (
                                <p className="text-[13px] text-[#FFD36B]">엘리트 골프장을 전부 찍었어요.</p>
                            )}
                        </div>
                    </StampSection>

                    <SampleJoin col={col} from={SHELF_PATH} className="pt-7" />

                    <div className="px-5 pt-8">
                        <Link href={STAMPS_PATH} className="flex h-12 items-center justify-center rounded-xl bg-[#64DD17] text-[15px] font-semibold text-[#051907] active:bg-[#58C614]">
                            도장첩 책장 보기
                        </Link>
                    </div>
                </div>
            )}
        </CourseShell>
    );
}
