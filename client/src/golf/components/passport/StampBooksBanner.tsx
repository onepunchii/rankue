/**
 * 여권의 도장첩 입구(2026-10-12) — 예전 'RANKUE ELITE 60 · 0 / 60' 배너의 자리.
 *
 * 그 배너는 분모가 '60'으로 적혀 있었지만 명단은 골프장으로 56곳이었고, 엘리트 화면은 67줄로 나눠 숫자가 서로 달랐다.
 * 이제 분모는 규칙에서 읽고(shared/golfStampBooks STAMP_TOTAL), 세는 것도 도장첩과 같은 함수 하나다(bookStates · stampSummary) —
 * 원장 번호로 잇고, 이름의 포함 관계는 보지 않는다.
 * 여권은 회원 화면(GolfOnly)이라 예시를 그리지 않는다 — 받은 도장을 그대로 센다.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { bookStates, stampSummary, type StampLike } from "@shared/golfStampBooks";
import { MarkerArt, STAMPS_PATH, StampBar, bookName } from "@/golf/stamps/StampParts";

export function StampBooksBanner({ stamps }: { stamps: readonly StampLike[] }) {
    const summary = useMemo(() => stampSummary(bookStates(stamps)), [stamps]);
    const lastDone = summary.doneBooks.length ? summary.doneBooks[summary.doneBooks.length - 1] : null;
    const line = summary.stamped === 0
        ? "엘리트 골프장에서 18홀을 끝내면 도장첩에 찍혀요"
        : summary.nearest
            ? `${bookName(summary.nearest.bookId)} 도장첩, ${summary.nearest.left}곳 남았어요`
            : summary.nextTrophy ? `다음 트로피까지 ${summary.nextTrophy.left}곳` : "엘리트 골프장을 전부 찍었어요";
    return (
        <section className="mt-12 mb-8">
            <Link href={STAMPS_PATH} className="block rounded-[1.5rem] border border-[#E9B94940] bg-[#E9B94914] p-5 active:bg-[#E9B94924]" data-testid="passport-stamp-books">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-[16px] font-semibold tracking-tight text-[#FFD36B]">랭큐 엘리트 도장첩</h3>
                        <p className="mt-0.5 text-[12px] text-[#FFD36BB3] break-keep">아홉 권 · 한 권을 다 채우면 볼마커</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <span className="text-[22px] font-semibold tabular-nums leading-none text-[#FFD36B]">{summary.stamped}</span>
                        <span className="self-end text-[12px] tabular-nums text-[#FFD36B99]">/ {summary.total}</span>
                        <LucideChevronRight weight="bold" className="ml-0.5 h-4 w-4 text-[#FFD36B99]" aria-hidden />
                    </div>
                </div>
                <StampBar got={summary.stamped} total={summary.total} className="mt-3.5" />
                <div className="mt-3 flex items-center gap-2.5">
                    {lastDone && <MarkerArt bookId={lastDone} size={30} earned />}
                    <p className="min-w-0 flex-1 text-[13px] text-[#FFFFFFB3] break-keep">{line}</p>
                </div>
            </Link>
        </section>
    );
}
