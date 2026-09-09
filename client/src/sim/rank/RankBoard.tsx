import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { tierFor } from "@shared/sim/rank";
import type { RankRow } from "./rankApi";
import { countryName } from "./country";
import { rankFlag } from "./flag";

/**
 * 랭킹 리더보드(2026-09-09 오너: "이런 디자인 형태로 가도 돼 — 랭킹 페이지만 디자인 규칙 해제").
 * 게임 리더보드 그대로: 보라 판 + 금색 테두리 + 리본 제목, 순위마다 색이 다른 알약 줄(1 금 · 2 하늘 · 3 산호 · 4위부터 옅은 흰색).
 * 그라데이션·광택은 여기서만 쓴다(.rank-arcade 스코프, index.css). 다른 화면에 옮기지 말 것.
 * 아바타는 이름 첫 글자 — 프로필 사진은 랭킹 API 에 없다(있으면 나중에 img 로 바꾸면 된다).
 */
function rowTone(rank: number): string {
    return rank === 1 ? "arc-row-1" : rank === 2 ? "arc-row-2" : rank === 3 ? "arc-row-3" : "";
}
/** 4위부터는 순위가 내려갈수록 옅어진다(원본 리더보드와 같은 느낌). */
function restOpacity(rank: number): number {
    if (rank <= 3) return 1;
    return Math.max(0.45, 1 - (rank - 3) * 0.07);
}

function Avatar({ name, dark }: { name: string; dark: boolean }) {
    const ch = (name || "?").trim().charAt(0).toUpperCase();
    return (
        <span
            aria-hidden="true"
            className={cn(
                "w-9 h-9 shrink-0 rounded-pill flex items-center justify-center text-[15px] font-black",
                dark ? "bg-white/85 text-[color:var(--arc-ink)]" : "bg-[color:var(--arc-ink)] text-white",
            )}
        >
            {ch}
        </span>
    );
}

function Coin({ value, dark }: { value: number; dark: boolean }) {
    return (
        <span className={cn("shrink-0 inline-flex items-center gap-1.5 rounded-pill pl-1 pr-2.5 h-8", dark ? "bg-white/35" : "bg-black/25")}>
            <span className="arc-coin w-5 h-5 rounded-pill flex items-center justify-center text-[10px] font-black text-[color:var(--arc-ink)]">R</span>
            <span className={cn("rk-num text-[14px] font-black", dark ? "text-[color:var(--arc-ink)]" : "text-white")}>{value}</span>
        </span>
    );
}

const Row = memo(function Row({ r, mine, locale }: { r: RankRow; mine: boolean; locale: string }) {
    const { t } = useT();
    const top3 = r.rank <= 3;
    const tier = tierFor(r.rating);
    return (
        <li
            className={cn("arc-row rounded-pill h-14 px-2 flex items-center gap-2.5", rowTone(r.rank), mine && "ring-2 ring-white")}
            style={{ opacity: restOpacity(r.rank) }}
            aria-current={mine ? "true" : undefined}
        >
            <span className={cn("rk-num w-7 shrink-0 text-center text-[20px] font-black", top3 ? "text-[color:var(--arc-ink)]" : "text-white")}>
                {r.rank}
            </span>
            <Avatar name={r.name} dark={top3} />
            <span className="flex-1 min-w-0 flex flex-col">
                <span className={cn("text-[14px] font-black truncate", top3 ? "text-[color:var(--arc-ink)]" : "text-white")}>
                    {r.name}{mine ? ` · ${t("sim.rank.meMark")}` : ""}
                </span>
                <span className={cn("text-[11px] font-bold truncate", top3 ? "text-[color:var(--arc-ink)] opacity-75" : "text-white/70")}>
                    {r.country && <span title={countryName(r.country, locale)}>{rankFlag(r.country) || r.country} </span>}
                    {t(tier.nameKey)}
                    {` · ${t("sim.entry.record").replace("{w}", String(r.wins)).replace("{l}", String(r.matches - r.wins))}`}
                    <span className="sr-only">{r.country ? countryName(r.country, locale) : ""}</span>
                </span>
            </span>
            <Coin value={r.rating} dark={top3} />
        </li>
    );
});

export interface RankBoardProps {
    rows: readonly RankRow[];
    myMemberId?: string;
    locale: string;
    className?: string;
}

export const RankBoard = memo(function RankBoard({ rows, myMemberId, locale, className }: RankBoardProps) {
    const { t } = useT();
    if (rows.length === 0) return null;
    return (
        <div className={cn("rank-arcade", className)}>
            {/* 리본 제목 */}
            <div className="relative flex justify-center">
                <span className="arc-ribbon relative z-[1] inline-flex items-center h-10 px-7 rounded-lg text-white text-[16px] font-black tracking-wide">
                    {t("sim.rank.board")}
                </span>
            </div>
            <ol className="arc-board rounded-[26px] -mt-4 pt-7 px-3 pb-3 space-y-2" aria-label={t("sim.rank.listAria")}>
                {rows.map((r) => (
                    <Row key={r.memberId} r={r} mine={!!myMemberId && r.memberId === myMemberId} locale={locale} />
                ))}
            </ol>
        </div>
    );
});

export default RankBoard;
