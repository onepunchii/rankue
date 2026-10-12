/**
 * 월대회의 그림과 입구 줄(2026-10-12). 대회 화면(./CupPage)과 따로 둔 까닭: 장식장 · 이달의 랭킹 · 홈 배너가 이 그림과 줄만 쓴다 —
 * 대회 화면 전체(대진 · 폴링)를 끌어오지 않게.
 *
 * 그림은 client/public/sim/rank/ 에 있다(등급 배지와 같은 화풍):
 *  - icon-cup.webp — 대회 아이콘(왕관 · 월계수 · 큐 둘).
 *  - cup-1~5.webp — 월대회 메달(우승 금 · 준우승 은 · 3위 동 · 4위 보랏빛 강철 · 8강 청록빛 강철). **가운데에 트로피가 새겨져 있다** —
 *    이달의 랭킹 메달(가운데 빈 판에 등수를 얹는다, rank/TierEmblem RankMedal)과 한눈에 갈린다. 글자 · 숫자는 그림에 없다.
 */
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { CupMedal } from "@shared/simCup";

const BASE = "/sim/rank";
export const CUP_ICON_SRC = `${BASE}/icon-cup.webp`;
export const cupMedalSrc = (medal: CupMedal): string => `${BASE}/cup-${medal}.webp`;
export const CUP_MEDALS: readonly CupMedal[] = [1, 2, 3, 4, 5];

/** 월대회 메달 — locked 면 아직 못 받은 것(어둡게) */
export function CupMedalArt({ medal, size, locked = false, label }: { medal: CupMedal; size: number; locked?: boolean; label?: string }) {
    return (
        <img
            src={cupMedalSrc(medal)} width={size} height={size} alt={label ?? ""} aria-hidden={label ? undefined : true} decoding="async" draggable={false}
            style={{ width: size, height: size, flex: "none", objectFit: "contain", filter: locked ? "grayscale(1) brightness(0.55)" : "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }}
        />
    );
}

/** 월대회로 가는 한 줄(랭킹의 내 카드 · 장식장) — 대회 그림 · "월대회" · 한 줄 설명 · 오른쪽 화살표 */
export function CupLink({ onClick, sub, className, testId = "cup-link" }: { onClick: () => void; sub?: string; className?: string; testId?: string }) {
    const { t } = useT();
    return (
        <button type="button" onClick={onClick} data-testid={testId} data-track-as="월대회 열기"
            className={cn("w-full min-h-12 pl-2 pr-3 py-1.5 rounded-2xl border border-[rgba(232,196,106,0.28)] bg-white/[0.05] flex items-center gap-2 text-left active:bg-white/10", className)}>
            <img src={CUP_ICON_SRC} width={36} height={36} alt="" aria-hidden="true" decoding="async" draggable={false} className="w-9 h-9 shrink-0 object-contain" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }} />
            <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-black text-white truncate">{t("sim.cup.title")}</span>
                <span className="block rk-num text-[11.5px] font-bold text-white/60 truncate">{sub ?? t("sim.cup.linkSub")}</span>
            </span>
            <span className="shrink-0 text-[15px] font-black text-white/45" aria-hidden="true">›</span>
        </button>
    );
}

export default CupMedalArt;
