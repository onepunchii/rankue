/**
 * 오른쪽 툴바(ToolRail) 높이 산술 — 순수. 페이지가 "툴바가 md(44 px) 로 열에 들어가는가" 를 버튼 수로 미리 계산해
 * 안 들어가면 compact(sm) 로 내려간다. 스크롤은 마지막 수단이다(잘린 버튼은 보이지 않아 있는 줄 모른다, 2026-09-07 리뷰).
 * 값은 ToolRail 의 Tailwind 클래스와 같아야 한다: md = h-11 · 묶음 안 gap-2 · 묶음 사이 gap-3, sm = h-10 · gap-1.5 · gap-2.
 */
export interface RailMetrics {
    /** 버튼 한 변(px). */
    readonly button: number;
    /** 묶음 안 버튼 간격(px). */
    readonly gap: number;
    /** 묶음 사이 간격(px). */
    readonly groupGap: number;
}

export const RAIL_MD: RailMetrics = { button: 44, gap: 8, groupGap: 12 };
export const RAIL_SM: RailMetrics = { button: 40, gap: 6, groupGap: 8 };

/** 묶음별 버튼 수로 툴바 전체 높이(px). 빈 묶음은 그려지지 않으므로 뺀다. */
export function railHeight(groupSizes: readonly number[], m: RailMetrics): number {
    let groups = 0;
    let n = 0;
    for (const size of groupSizes) {
        if (size > 0) { groups += 1; n += size; }
    }
    if (n === 0) return 0;
    return n * m.button + (n - groups) * m.gap + (groups - 1) * m.groupGap;
}

/**
 * md 툴바 + 열의 나머지 고정 높이(fixedMd: 여백·큐 슬라이더 최소·±·샷)가 열 높이(columnHeight)에 들어가는가.
 * columnHeight ≤ 0(아직 측정 전)이면 true — 측정 전엔 기본(md)으로 둔다.
 */
export function railFitsMd(columnHeight: number, groupSizes: readonly number[], fixedMd: number): boolean {
    if (columnHeight <= 0) return true;
    return railHeight(groupSizes, RAIL_MD) + fixedMd <= columnHeight;
}
