/**
 * 날씨 그림과, 조인·부킹 글 한 줄에 붙는 티타임 날씨(2026-10-05 오너 "응" — 라운드 브리핑 4번: 글에 그 티타임 날씨).
 *
 * 글 줄에는 **그림 + 티오프 기온**만, 비 확률이 30% 이상일 때만 확률을 덧붙인다(shared/golfRoundBrief teeWxText).
 * 상자를 만들지 않는다 — 글 줄의 흐린 글자 사이에 끼어 앉는다(줄마다 알약이 하나씩 늘면 목록이 시끄럽다).
 * 한 줄 평·근거는 눌러 들어간 골프장 상세의 '날씨'에 있다. 여기서는 title 로만 준다.
 * 넓은 지역 예보(닷새째부터)는 기온이 없어 그림만, 비 올 때만 확률.
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면에 쓰인다 — 색은 리터럴만(CourseShell 머리말).
 */
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { LucideCloud, LucideCloudMoon, LucideCloudRain, LucideCloudSnow, LucideCloudSun, LucideMoon, LucideSun } from "@/lib/icons";
import { WX_LABEL, type WxKind } from "@shared/golfWeather";
import { teeWxText, type TeeWx } from "@shared/golfRoundBrief";

export const WX_RAIN = "#4DA3FF";
export const WX_AMBER = "#FFC43D";
const KIND_COLOR: Record<WxKind, string> = {
    clear: WX_AMBER, partly: "#E6E6E6", cloudy: "#A6A6A6", rain: WX_RAIN, shower: WX_RAIN, sleet: "#8CC4FF", snow: "#CFE8FF",
};

export function WxIcon({ kind, night, className, style }: { kind: WxKind; night?: boolean; className?: string; style?: CSSProperties }) {
    const I = kind === "clear" ? (night ? LucideMoon : LucideSun)
        : kind === "partly" ? (night ? LucideCloudMoon : LucideCloudSun)
        : kind === "cloudy" ? LucideCloud
        : kind === "snow" || kind === "sleet" ? LucideCloudSnow
        : LucideCloudRain;
    const color = night && (kind === "clear" || kind === "partly") ? "#C9D1FF" : KIND_COLOR[kind];
    return <I weight="fill" className={className} style={{ color, ...style }} aria-hidden />;
}

/** 강수확률 색 — 30% 미만은 조용히, 60% 부터는 또렷하게 */
export const popColor = (pop: number | null | undefined) => (pop == null || pop < 30 ? "#FFFFFF59" : pop < 60 ? "#8CC4FF" : WX_RAIN);

/** 글 한 줄 안의 티타임 날씨 — 그림 + "9°" (+ "비 60%"). 날씨가 없으면 아무것도 그리지 않는다 */
export function TeeWxInline({ wx, className, iconClassName, compact }: {
    wx: TeeWx | null | undefined; className?: string; iconClassName?: string;
    /** 좁은 칸(앱 안 카드의 시계 칸) — 비 올 땐 기온 대신 확률만("60%") */
    compact?: boolean;
}) {
    if (!wx) return null;
    const rainy = (wx.pop ?? 0) >= 30;
    const text = compact ? (rainy ? `${wx.pop}%` : wx.tmp != null ? `${wx.tmp}°` : "") : teeWxText(wx);
    const label = wx.verdict ? `티타임 날씨 — ${wx.verdict}${wx.reason ? ` (${wx.reason})` : ""}` : `그 날 날씨 — ${WX_LABEL[wx.kind]}${rainy ? `, 비 ${wx.pop}%` : ""}`;
    return (
        <span className={cn("inline-flex items-center gap-1 align-middle tabular-nums whitespace-nowrap", className)} title={label} aria-label={label}>
            <WxIcon kind={wx.kind} className={cn("w-[14px] h-[14px] shrink-0", iconClassName)} />
            {text && <span aria-hidden style={rainy ? { color: popColor(wx.pop) } : undefined}>{text}</span>}
        </span>
    );
}
