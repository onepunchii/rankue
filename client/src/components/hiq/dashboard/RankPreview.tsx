/**
 * 홈 랭킹 카드 접기(2026-10-04 오너: "세계랭킹 나열된 부분도 드롭으로?" → 제안 "3위까지 보이고 펼치기").
 * 세계·PBA·매장 카드가 10명씩 그려 홈 아래가 길었다. 기본 3명, 누르면 그 자리에서 10명까지.
 * 펼친 상태는 폰에 남긴다(다음에 와도 그대로). 카드가 다른 화면에서 쓰일 땐 preview 를 안 넘기면 예전처럼 10명.
 */
import { useState } from "react";
import { ChevronDown, ChevronUp } from "@/lib/icons";
import { useT } from "@/lib/i18n";

export const RANK_PREVIEW_ROWS = 3;
const KEY = "rankue_home_rank_open";

export type RankPreview = { expanded: boolean; onToggle: () => void };

export function useRankPreview(): RankPreview {
    const [expanded, setExpanded] = useState(() => {
        try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
    });
    const onToggle = () => setExpanded((v) => {
        const next = !v;
        try { localStorage.setItem(KEY, next ? "1" : "0"); } catch { /* 저장소를 못 쓰면 이번만 */ }
        return next;
    });
    return { expanded, onToggle };
}

/** 보여 줄 줄 — preview 가 없으면 그대로(다른 화면), 접혀 있으면 3줄 */
export function previewRows<T>(rows: T[], preview?: RankPreview): T[] {
    return preview && !preview.expanded ? rows.slice(0, RANK_PREVIEW_ROWS) : rows;
}

export function RankPreviewToggle({ preview, total }: { preview?: RankPreview; total: number }) {
    const { t } = useT();
    if (!preview || total <= RANK_PREVIEW_ROWS) return null;
    const Icon = preview.expanded ? ChevronUp : ChevronDown;
    return (
        <button
            type="button"
            onClick={preview.onToggle}
            aria-expanded={preview.expanded}
            className="w-full h-10 rounded-2xl bg-black/[0.035] flex items-center justify-center gap-1 text-[13px] font-semibold text-black/60 hover:bg-black/[0.06] active:scale-[0.99] transition-all"
        >
            {preview.expanded ? t("home.rankCollapse") : t("home.rankExpand")}
            <Icon className="w-4 h-4" />
        </button>
    );
}
