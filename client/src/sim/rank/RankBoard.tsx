import { memo } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { tierFor } from "@shared/sim/rank";
import type { RankRow } from "./rankApi";
import { countryName } from "./country";
import { rankFlag } from "./flag";
import { RankMedal, TierEmblem } from "./TierEmblem";

/**
 * 랭킹 목록 — '진열장' 모양(2026-10-12 오너: 시안 A·B 가운데 "B 로 가고 … 게임 느낌도 나고 진짜 소유욕이 들게끔").
 * 어두운 카드 줄: 1~3등은 메달, 그 아래는 숫자 · 등급 배지 그림 · 이름(국기·등급·전적) · 레이팅.
 * 예전의 보라 판(.rank-arcade, 2026-09-09)은 이 화면에서 뺐다 — 방 목록·드릴·관전 목록도 같은 날 옮겨 그 배색은 지웠다.
 * 여기 색·광택은 .rank-hall 아래에만 둔다(index.css). 랭킹 화면은 디자인 규칙을 풀어 둔 곳이다(2026-09-09 오너).
 */
const Row = memo(function Row({ r, mine, locale, onOpen }: { r: RankRow; mine: boolean; locale: string; onOpen?: (memberId: string) => void }) {
    const { t } = useT();
    const tier = tierFor(r.rating);
    const top3 = r.rank >= 1 && r.rank <= 3;
    const body = (
        <>
            <span className="w-11 shrink-0 flex items-center justify-center">
                {top3
                    ? <RankMedal rank={r.rank as 1 | 2 | 3} size={42} />
                    : <span className="rk-num text-[19px] font-black text-white/90">{r.rank}</span>}
            </span>
            <TierEmblem tier={tier.id} size={46} />
            <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[14.5px] font-black text-white truncate">
                    {r.name}{mine ? ` · ${t("sim.rank.meMark")}` : ""}
                </span>
                <span className="text-[11.5px] font-bold text-white/60 truncate">
                    {r.country && <span title={countryName(r.country, locale)}>{rankFlag(r.country) || r.country} </span>}
                    {t(tier.nameKey)}
                    {` · ${t("sim.entry.record").replace("{w}", String(r.wins)).replace("{l}", String(r.matches - r.wins))}`}
                    <span className="sr-only">{r.country ? countryName(r.country, locale) : ""}</span>
                </span>
            </span>
            <span className="hall-rating rk-num shrink-0 h-8 px-3 inline-flex items-center rounded-pill text-[14px] font-black text-white">{r.rating}</span>
        </>
    );
    const inner = "pl-2 pr-3 flex items-center gap-2";
    return (
        <li
            className={cn("hall-row h-[62px]", !onOpen && inner, top3 && "hall-row-top", mine && "hall-row-mine")}
            aria-current={mine ? "true" : undefined}
        >
            {/* 줄을 누르면 그 사람의 장식장(2026-10-12) */}
            {onOpen
                ? <button type="button" onClick={() => onOpen(r.memberId)} aria-label={t("sim.shelf.open").replace("{name}", r.name)} data-track-as="랭킹 줄 장식장" className={cn("w-full h-full text-left rounded-[18px] active:bg-white/[0.06]", inner)}>{body}</button>
                : body}
        </li>
    );
});

export interface RankBoardProps {
    rows: readonly RankRow[];
    myMemberId?: string;
    locale: string;
    className?: string;
    /** 줄을 누르면 그 사람의 장식장으로 */
    onOpen?: (memberId: string) => void;
}

export const RankBoard = memo(function RankBoard({ rows, myMemberId, locale, className, onOpen }: RankBoardProps) {
    const { t } = useT();
    if (rows.length === 0) return null;
    return (
        <div className={className}>
            <h2 className="px-1 mb-2 text-[12px] font-black tracking-wide text-white/55">{t("sim.rank.board")}</h2>
            <ol className="space-y-2" aria-label={t("sim.rank.listAria")}>
                {rows.map((r) => (
                    <Row key={r.memberId} r={r} mine={!!myMemberId && r.memberId === myMemberId} locale={locale} onOpen={onOpen} />
                ))}
            </ol>
        </div>
    );
});

export default RankBoard;
