/**
 * 도장깨기 안내 — '?' 단추와 그 단추가 여는 시트(2026-10-12 오너: "도장깨기의 디폴트가 예시라서 내 도장첩이 우선이 되게,
 * 예시 토글이 아니라 그냥 ? 버튼 누르면 자연스럽게 보여지게").
 *
 * 회원의 화면은 늘 내 도장첩이다(비어 있어도). 다 모으면 어떻게 되는지는 이 시트가 보여 준다:
 *   1) 도장은 이렇게 찍혀요 — 세 단계(표지 · 종이에 찍힌 도장 · 볼마커)
 *   2) 다 채운 도장첩 한 권(예시)
 *   3) 다 모은 장식장(예시) — 볼마커 열 개 · 트로피 다섯 개
 * 2) · 3)은 '다 모았을 때의 예시'(shared/golfStampSample GOLF_STAMP_FULL_SAMPLE)라 "예시" 표시가 붙는다.
 *
 * ⚠️ 리터럴 색만(StampParts 머리말) — 방문자에게도 열린다. 시트의 기본 닫기 단추는 테마 색을 따라 어두운 바탕에서 안 보일 수 있어
 *    숨기고, 보이는 닫기 단추를 따로 둔다.
 */
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SampleBadge } from "@/components/hiq/GuestGate";
import { useBackToClose } from "@/hooks/useBackToClose";
import { BOOK_ART, coverSrc } from "./bookArt";
import { InkStamp } from "./InkStamp";
import { MarkerArt, MarkerCase, StampPaper, TrophyShelf } from "./StampParts";
import { FULL_SAMPLE_STATES, FULL_SAMPLE_SUMMARY } from "./useStampCollection";
import { STAMP_GUIDE_STEPS } from "@shared/golfStampGuide";

/** 안내의 설명 그림 · 다 채운 한 권의 예시에 쓰는 권 */
const GUIDE_BOOK = "gangwon";
const TILT = [-5, 4, -2, 6, -4, 3, -6];

/** 머리줄의 '?' 단추 — CourseShell 의 right 자리에 놓는다 */
export function StampHelpButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button" onClick={onClick} aria-label="도장깨기 안내" data-testid="stamp-help-button"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFFFFF14] text-[15px] font-semibold leading-none text-[#FFFFFF] active:bg-[#FFFFFF29]"
        >
            ?
        </button>
    );
}

/** 도장은 이렇게 찍혀요 — 세 단계. 그림은 설명용이다(누가 가진 것이 아니다): 표지 → 종이에 찍힌 도장 → 볼마커 */
export function StampGuide() {
    return (
        <ol className="space-y-2.5" data-testid="stamp-guide">
            <li className="flex items-center gap-3.5 rounded-2xl bg-[#FFFFFF08] p-3">
                <span className="relative block w-[54px] shrink-0 aspect-[3/4] overflow-hidden rounded-[8px] bg-[#1A1A1A]" aria-hidden>
                    <img src={coverSrc(GUIDE_BOOK)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-[#64DD17]">{1} · {STAMP_GUIDE_STEPS[0].title}</span>
                    <span className="mt-0.5 block text-[14px] leading-snug text-[#FFFFFFCC] break-keep">{STAMP_GUIDE_STEPS[0].body}</span>
                </span>
            </li>
            <li className="flex items-center gap-3.5 rounded-2xl bg-[#FFFFFF08] p-3">
                <span className="block shrink-0 rounded-[10px] bg-[#F4EFE3] p-1" aria-hidden>
                    <InkStamp name="도장깨기" ink={BOOK_ART[GUIDE_BOOK].ink} glyph={BOOK_ART[GUIDE_BOOK].glyph} size={46} tilt={-6} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-[#64DD17]">{2} · {STAMP_GUIDE_STEPS[1].title}</span>
                    <span className="mt-0.5 block text-[14px] leading-snug text-[#FFFFFFCC] break-keep">{STAMP_GUIDE_STEPS[1].body}</span>
                </span>
            </li>
            <li className="flex items-center gap-3.5 rounded-2xl bg-[#FFFFFF08] p-3">
                <span className="flex w-[54px] shrink-0 justify-center" aria-hidden><MarkerArt bookId={GUIDE_BOOK} size={54} earned /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[12px] text-[#64DD17]">{3} · {STAMP_GUIDE_STEPS[2].title}</span>
                    <span className="mt-0.5 block text-[14px] leading-snug text-[#FFFFFFCC] break-keep">{STAMP_GUIDE_STEPS[2].body}</span>
                </span>
            </li>
        </ol>
    );
}

const head = (title: string, sample = false) => (
    <h3 className="mb-3 mt-7 flex items-center gap-2 text-[16px] font-semibold text-[#FFFFFF]">
        {title}
        {sample && <SampleBadge tone="dark" />}
    </h3>
);

export function StampHelpSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    useBackToClose(open, () => onOpenChange(false));
    const book = FULL_SAMPLE_STATES.find((s) => s.book.id === GUIDE_BOOK)!;
    const art = BOOK_ART[GUIDE_BOOK];
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="flex max-h-[88dvh] flex-col gap-0 rounded-t-[1.75rem] border-t border-[#FFFFFF1A] bg-[#0A0A0A] p-0 text-[#FFFFFF] outline-none ring-0 [&>button]:hidden"
                data-testid="stamp-help-sheet"
            >
                <div className="flex items-center gap-3 px-5 pb-3 pt-5">
                    <div className="min-w-0 flex-1">
                        <SheetTitle className="text-[18px] font-semibold tracking-tight text-[#FFFFFF]">도장깨기는 이렇게</SheetTitle>
                        <SheetDescription className="mt-0.5 text-[13px] text-[#FFFFFF99]">도장을 모아 도장첩을 채우고, 볼마커와 트로피를 받아요.</SheetDescription>
                    </div>
                    <button type="button" onClick={() => onOpenChange(false)} className="h-9 shrink-0 rounded-full bg-[#FFFFFF14] px-3.5 text-[13px] font-semibold text-[#FFFFFF] active:bg-[#FFFFFF29]" data-testid="stamp-help-close">
                        닫기
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
                    <StampGuide />

                    {head("다 채운 도장첩 한 권", true)}
                    <StampPaper className="px-2.5 pt-4 pb-3.5">
                        <div className="grid grid-cols-4 gap-x-1 gap-y-3" data-testid="stamp-help-book">
                            {book.slots.map((s, i) => (
                                <div key={s.slot.key} className="flex flex-col items-center gap-1 text-center">
                                    <div className="w-full max-w-[84px] px-0.5">
                                        <InkStamp name={s.slot.name} date={s.stamp?.date} ink={art.ink} glyph={art.glyph} tilt={TILT[i % TILT.length]} />
                                    </div>
                                    <span className="text-[12px] font-semibold leading-tight text-[#1F1C16] break-keep">{s.slot.name}</span>
                                </div>
                            ))}
                            <div className="flex flex-col items-center justify-center gap-1 text-center">
                                <MarkerArt bookId={GUIDE_BOOK} size={62} earned />
                                <span className="text-[12px] font-semibold leading-tight text-[#8A6A1A] break-keep">{book.book.name} 볼마커</span>
                            </div>
                        </div>
                    </StampPaper>
                    <p className="mt-2 text-[13px] leading-snug text-[#FFFFFF8C] break-keep">일곱 칸을 다 찍으면 그 권역의 볼마커를 받아요.</p>

                    {head("다 모은 장식장", true)}
                    <MarkerCase states={FULL_SAMPLE_STATES} summary={FULL_SAMPLE_SUMMARY} />
                    <div className="mt-3"><TrophyShelf stamped={FULL_SAMPLE_SUMMARY.stamped} /></div>
                    <p className="mt-3 text-[13px] leading-snug text-[#FFFFFF8C] break-keep">볼마커는 도장첩마다 하나, 트로피는 찍은 엘리트 골프장 수로 받아요.</p>
                </div>
            </SheetContent>
        </Sheet>
    );
}
