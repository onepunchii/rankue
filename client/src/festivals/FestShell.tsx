/**
 * 축제 화면의 종목 틀(2026-10-21) — theme.tsx 와 나눴다: 종목 홈에 얹는 축제 줄(FestivalPicks)이 틀(머리줄 · 하단 탭 · 다른 종목의 틀)을 끌고 오지 않게.
 * ⚠️ 리터럴 색만.
 */
import type { ReactNode } from "react";
import type { FestivalSport } from "@shared/festivals";
import { HikingShell } from "@/hiking/components/HikingShell";
import { CourseShell } from "@/golf/components/course/CourseShell";
import { FishingShell } from "@/fishing/FishingShell";
import { FestThemeCtx, festTheme } from "./theme";

/** 종목의 틀 — 등산은 HikingShell, 골프는 CourseShell(아래 띠 없이), 낚시는 FishingShell */
export function FestShell({ sport, title, back, right, children }: { sport: FestivalSport | null; title: string; back: string; right?: ReactNode; children: ReactNode }) {
    const t = festTheme(sport);
    const body = <FestThemeCtx.Provider value={t}>{children}</FestThemeCtx.Provider>;
    if (sport === "GOLF") return <CourseShell title={title} backTo={back} right={right} hideBottomCta>{body}</CourseShell>;
    // 낚시는 낚시의 공개 틀 — 회원은 하단 탭, 방문자는 '로그인' + 아래 가입 단추(2026-10-24)
    if (sport === "FISHING") return <FishingShell title={title} backTo={back} right={right}><div data-fishing-festivals="1">{body}</div></FishingShell>;
    return <HikingShell title={title} backTo={back} right={right}>{body}</HikingShell>;
}
