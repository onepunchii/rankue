/**
 * 현장 인증 문구(2026-09-30) — 경기 화면 칩·끝내기 확인창·결과 화면이 같은 말을 쓴다. 규칙은 shared/golfOnSite.ts.
 * 인증이 안 된 라운드도 점수·평균은 남는다는 걸 늘 같이 말한다 — '기록이 날아간다'로 읽히면 안 된다.
 */
import type { VerdictReason } from "@shared/golfOnSite";
import type { OnSiteView } from "../hooks/useOnSiteCheckin";

const HEAD: Record<Extract<OnSiteView, { kind: "unverified" }>["why"], string> = {
    far: "골프장 2km 밖이에요",
    coarse: "위치가 흐려요(정확한 위치를 켜 주세요)",
    denied: "위치 권한이 꺼져 있어요",
    unavailable: "위치를 잡지 못했어요",
    prompt: "위치를 허용하면 현장 인증돼요",
    error: "지금은 확인하지 못했어요",
};

/** 칩 아래 한 줄 — 왜 인증이 안 됐고, 이대로 끝내면 어떻게 되나 */
export function whyLine(view: OnSiteView): string | null {
    if (view.kind === "no-course") return "이 골프장은 위치 정보가 없어요 · 도장은 기록 도장으로 남아요";
    if (view.kind !== "unverified") return null;
    return `${HEAD[view.why]} · 인증 없이 끝내면 기록 도장이 돼요`;
}

/** 결과 화면 — 기록 도장이 된 이유 */
export const VERDICT_TEXT: Record<VerdictReason, string> = {
    ok: "골프장 2km 안에서 확인됐어요",
    "too-fast": "18홀을 30분 안에 다 적어 현장 인증이 되지 않았어요",
    "no-course": "이 골프장은 위치 정보가 없어 현장 인증을 할 수 없어요",
    "no-checkin": "라운드 중 위치 확인이 없었어요",
    far: "라운드 중 골프장 2km 안에서 위치가 잡히지 않았어요",
    "no-fix": "라운드 중 위치를 잡지 못했어요",
};
