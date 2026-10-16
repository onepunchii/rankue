/**
 * 장식장으로 가는 한 줄(2026-10-12) — 랭킹의 내 카드 · 대시보드에 놓는다. 장식장 그림 · "내 장식장" · 오른쪽 화살표.
 * 장식장 화면(./ShelfPage)과 따로 둔 까닭: 이달의 랭킹(./MonthlyRank)이 이 줄을 쓰고, 장식장 화면은 이달의 랭킹의 글자 틀을 쓴다 — 서로 물리지 않게.
 */
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** 장식장 그림 — 등급 배지와 같은 화풍(public/sim/rank). 홈 배너 · 랭킹 · 대시보드의 입구와 장식장 화면의 머리가 이 그림을 쓴다 */
export const SHELF_ICON_SRC = "/sim/rank/icon-cabinet.webp";
/** 큐 케이스 그림(2026-10-16) — 장식장이 큐 케이스 안으로 들어간 뒤로 들어가는 길(이 줄 · 홈 배너의 칸 · 큐 케이스 머리)은 이 그림을 쓴다 */
export const CASE_ICON_SRC = "/billiards/case/icon-case.webp";

export function ShelfLink({ onClick, sub, className, testId = "shelf-link" }: { onClick: () => void; sub?: string; className?: string; testId?: string }) {
    const { t } = useT();
    return (
        <button type="button" onClick={onClick} data-testid={testId} data-track-as="장식장 열기"
            className={cn("w-full min-h-12 pl-2 pr-3 py-1.5 rounded-2xl border border-[rgba(232,196,106,0.28)] bg-white/[0.05] flex items-center gap-2 text-left active:bg-white/10", className)}>
            <img src={CASE_ICON_SRC} width={36} height={36} alt="" aria-hidden="true" decoding="async" draggable={false} className="w-9 h-9 shrink-0 object-contain" style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }} />
            <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-black text-white truncate">{t("sim.shelf.mine")}</span>
                {sub && <span className="block rk-num text-[11.5px] font-bold text-white/60 truncate">{sub}</span>}
            </span>
            <span className="shrink-0 text-[15px] font-black text-white/45" aria-hidden="true">›</span>
        </button>
    );
}

export default ShelfLink;
