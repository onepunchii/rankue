/**
 * 라운드 화면의 그림(2026-10-13 오너: "스코어카드는 스코어카드 느낌 나고, 라운드 만들기에도 골프장 느낌이 들어가면 어때? 라운드 완료 시에도").
 *
 * 골프 홈 카드와 같은 포스터 화풍의 그림 세 장(client/public/golf/round-art — 지어낸 풍경, 글자 없음)을 놓는 법을 한곳에 둔다.
 *  - NewRoundBanner : 라운드 만들기 맨 위 — 해 뜨기 전의 1번 티. 글은 어두운 왼쪽에, 깃대는 오른쪽에.
 *  - ScorecardBand  : 기록표 카드의 머리 띠 — 종이 스코어카드 윗단의 그림 띠처럼. 깃대가 오른쪽 4분의 1 에 서 있어 글은 왼쪽에만 둔다.
 *  - ResultHeroArt  : 라운드 완료 화면의 배경 — 해 질 녘의 마지막 그린. 하늘이 밝아(금색) 글을 그 위에 바로 얹지 않는다:
 *                     위에는 어두운 알약 안의 한 줄만, 제목부터는 그림이 검게 잦아든 아래쪽에 둔다.
 * 그림은 꾸밈이다(alt="") — 뜻은 전부 글이 진다. 받기 전 · 못 받았을 때는 바탕색만 보인다(자리 크기는 그대로).
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 왼쪽으로 당겨 놓지 않으니 lazy 를 쓰지 않아도 되지만, 첫 화면 그림이라 그냥 바로 받는다.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const ART = "/golf/round-art";

/** scan: 홈의 '스코어카드 스캔'에서 온 길 — 무엇을 하면 되는지 한 줄로 말해 준다 */
export function NewRoundBanner({ className, scan }: { className?: string; scan?: boolean }) {
    return (
        <div className={cn("relative isolate h-[108px] overflow-hidden rounded-2xl bg-[#07140A] ring-1 ring-inset ring-[#FFFFFF14]", className)} data-testid="new-round-banner">
            <img src={`${ART}/new.webp`} alt="" width={800} height={322} decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover object-[78%_center]" />
            {/* 글이 놓이는 왼쪽을 한 번 더 누른다 */}
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#07140AF2] via-[#07140A99] to-[#07140A00]" />
            <div className="flex h-full flex-col justify-center px-4">
                <p className="text-[17px] font-semibold tracking-tight text-[#FFFFFF]">{scan ? "스코어카드로 기록하기" : "오늘의 라운드"}</p>
                <p className="mt-1 max-w-[62%] text-[12.5px] leading-snug text-[#FFFFFFB3] break-keep">{scan ? "골프장을 고르고 시작하면 카드를 올리는 창이 열려요" : "골프장과 방식을 고르면 바로 시작해요"}</p>
            </div>
        </div>
    );
}

export function ScorecardBand({ title, sub, right }: { title: string; sub?: string | null; right?: ReactNode }) {
    return (
        <div className="relative isolate h-[68px] overflow-hidden bg-[#07140A]" data-testid="scorecard-band">
            <img src={`${ART}/card.webp`} alt="" width={800} height={234} decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_35%]" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#07140AE6] via-[#07140A80] to-[#07140A00]" />
            {/* 종이 카드의 윗단처럼 — 띠 아래에 가는 금 */}
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-[#64DD1740]" />
            <div className="flex h-full items-center gap-3 px-4">
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold tracking-tight text-[#FFFFFF]">{title}</p>
                    {sub ? <p className="mt-0.5 max-w-[78%] truncate text-[12px] text-[#FFFFFFB3]">{sub}</p> : null}
                </div>
                {right}
            </div>
        </div>
    );
}

/** 완료 화면 배경 — 부모는 relative. 높이 HERO_ART_H 만큼 차지하고 아래로 검게 잦아든다 */
export const HERO_ART_H = 236;
export function ResultHeroArt() {
    return (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: HERO_ART_H }} data-testid="result-hero-art">
            <img src={`${ART}/done.webp`} alt="" width={800} height={500} decoding="async" className="h-full w-full object-cover object-[center_30%]" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#05050559] via-[#05050500] to-[#050505]" />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-[#05050500] to-[#050505]" />
        </div>
    );
}
