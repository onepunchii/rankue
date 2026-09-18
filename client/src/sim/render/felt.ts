import type { TableSpec } from "@shared/sim/params";

/**
 * 라사(천) 색. 2026-09-18 사용자 의견 → 오너: "대대는 그린 다이 말고 블루 다이 어때?"
 * 대대(국제 규격 3쿠션)는 대회 테이블처럼 파란 천, 중대는 그대로 초록. 두 렌더러(2D·3D)가 같은 값을 쓴다.
 * 가운데가 살짝 밝고 가장자리로 어두워지는 비네트라 색은 두 개다.
 */
export interface FeltColors {
    readonly centre: string;
    readonly edge: string;
}

const GREEN: FeltColors = { centre: "#1A7A48", edge: "#0B5D3B" };
const BLUE: FeltColors = { centre: "#2A69B8", edge: "#174479" };

export function feltColors(table: Pick<TableSpec, "id"> | null | undefined): FeltColors {
    return table?.id === "DAEDAE" ? BLUE : GREEN;
}
