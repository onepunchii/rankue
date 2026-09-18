import { computeLayout } from "../render/tableGeometry";
import type { SafeInsets } from "../render/Renderer";
import type { TableSpec } from "@shared/sim/params";

/**
 * 대화창이 **당구 천을 덮지 않는** 최대 높이(px, 2026-09-18 오너: "공이 있으면 안 보이잖아").
 *
 * 공은 천(쿠션 안쪽) 위에만 있다. 그래서 대화창 윗변이 천 아래끝보다 아래에 있으면 어떤 공도 가릴 수 없다 —
 * 투명도를 조절하거나 공 위치를 따질 필요가 없다. 천 아래끝은 렌더러와 **같은 함수(computeLayout)**로 구한다
 * (따로 어림하면 기종마다 어긋난다). 실측: 375×812 에서 천 아래 144 px, SE(375×667) 135 px, 430×932 146 px.
 *
 * 대화창은 바닥에서 bottomGap 만큼 떠 있으므로 그만큼 뺀다. 아무리 좁아도 입력줄은 들어가야 하니 floor 아래로는 안 내린다
 * (그때는 천을 조금 덮는다 — 입력을 못 하는 것보다 낫다).
 */
export function chatMaxHeight(o: {
    width: number;
    height: number;
    table: TableSpec;
    insets: SafeInsets;
    bottomGap: number;
    floor: number;
}): number {
    if (!(o.width > 0 && o.height > 0)) return o.floor;
    const L = computeLayout({ width: o.width, height: o.height }, o.table, o.insets);
    const clothBottom = L.play.y + L.play.h;
    return Math.max(o.floor, Math.floor(o.height - clothBottom - o.bottomGap));
}
