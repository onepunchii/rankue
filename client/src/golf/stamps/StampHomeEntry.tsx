/**
 * 골프 홈의 도장깨기 입구(2026-10-12 오너: "도장깨기가 우리 골프 콘텐츠의 핵심", "처음 오는 사람도 예시를 보여줘서 와 하게").
 *
 * 도장첩 일곱 권의 표지를 한 줄로 보여 주고(표지는 자료가 아니라 목록이라 누구에게나 같은 그림이다), 그 아래에 한 줄:
 *   방문자            예시 인물의 진행("예시" 표시) — 홈의 다른 예시 카드와 같은 사람(shared/golfStampSample)
 *   도장 없는 회원     0 / 56 그대로 + 첫 도장을 찍는 법. 가짜 숫자를 내 것처럼 보여 주지 않는다(예시는 도장첩 화면 안에서)
 *   도장 있는 회원     내 진행 + 지금 가장 가까운 권
 * 카드 전체가 /golf/stamps 로 가는 링크다.
 *
 * ⚠️ 홈(golf-home)은 굵기를 낮추지 않는 화면이지만 색은 리터럴만 — 방문자에게도 열린다.
 */
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { SampleBadge } from "@/components/hiq/GuestGate";
import { coverSrc } from "./bookArt";
import { GOLD, MarkerArt, STAMPS_PATH, bookName } from "./StampParts";
import { useStampCollection } from "./useStampCollection";

export function StampHomeEntry() {
    const col = useStampCollection();
    // 홈에서는 회원에게 예시 숫자를 보이지 않는다 — 도장이 없으면 0 그대로(예시 전환은 도장첩 화면에 있다)
    const guestSample = col.isGuest;
    const open = col.states.filter((s) => s.book.kind === "open");
    const stamped = guestSample || !col.canSwitch ? col.summary.stamped : 0;
    const summary = guestSample || !col.canSwitch ? col.summary : null;
    const lastDone = summary?.doneBooks.length ? summary.doneBooks[summary.doneBooks.length - 1] : null;

    let line: string;
    if (col.isLoading) line = "도장첩을 불러오는 중이에요";
    else if (!summary || summary.stamped === 0) line = "골프장에서 18홀을 끝내면 첫 도장이 찍혀요";
    else if (summary.nearest) line = `${bookName(summary.nearest.bookId)} 도장첩, ${summary.nearest.left}곳 남았어요`;
    else if (summary.nextTrophy) line = `다음 트로피까지 ${summary.nextTrophy.left}곳`;
    else line = "엘리트 골프장을 전부 찍었어요";

    return (
        <Link
            href={STAMPS_PATH}
            className="relative z-10 mb-4 block w-full rounded-[2rem] bg-[#141414] p-5 ring-1 ring-inset ring-[#FFFFFF1A] active:scale-[0.99] transition-transform"
            data-testid="stamp-home-entry" data-sample={guestSample ? "1" : "0"}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-lg font-extrabold text-[#FFFFFF]">
                        도장깨기
                        {guestSample && <SampleBadge tone="dark" />}
                    </h3>
                    <p className="mt-0.5 text-[13px] font-medium text-[#FFFFFF99] break-keep">엘리트 {col.summary.total}곳 · 도장첩 아홉 권</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <span className="text-2xl font-extrabold tabular-nums leading-none text-[#FFFFFF]">{col.isLoading ? "–" : stamped}</span>
                    <span className="self-end pb-0.5 text-[13px] font-medium tabular-nums text-[#FFFFFF80]">/ {col.summary.total}</span>
                    <LucideChevronRight weight="bold" className="ml-0.5 h-4 w-4 text-[#FFFFFF66]" aria-hidden />
                </div>
            </div>

            {/* 누구나 도장첩 일곱 권 — 다 채운 권은 금테, 시작 안 한 권도 표지는 그대로 보인다 */}
            <div className="mt-4 grid grid-cols-7 gap-1.5" aria-hidden>
                {open.map((s) => {
                    const done = !!summary && s.done;
                    return (
                        <div key={s.book.id} className="relative aspect-[3/4] overflow-hidden rounded-[6px] bg-[#1F1F1F]" style={done ? { boxShadow: `0 0 0 1.5px ${GOLD}` } : undefined}>
                            <img src={coverSrc(s.book.id)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} />
                        </div>
                    );
                })}
            </div>

            <div className="mt-3.5 flex items-center gap-2.5">
                {lastDone && <MarkerArt bookId={lastDone} size={34} earned />}
                <p className="min-w-0 flex-1 text-[13.5px] font-semibold text-[#FFFFFFCC] break-keep">
                    {lastDone && <span className="text-[#FFD36B]">{bookName(lastDone)} 볼마커 · </span>}
                    {line}
                </p>
            </div>
        </Link>
    );
}

export default StampHomeEntry;
