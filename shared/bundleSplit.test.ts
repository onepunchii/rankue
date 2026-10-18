import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 첫 화면 묶음(2026-10-18) — App.tsx 가 무거운 화면을 바로 import 하면 모든 손님(검색으로 온 매장 · 선수 · 산 · 낚시터 페이지 손님까지)이
 * 그 라이브러리를 받는다. 실측: 7.1MB · gzip 1.9MB → 열 때만 받게 바꿔 gzip 1.07MB.
 *   3D 골프(three · @react-three/fiber) · 사장님 대시보드(xlsx · html2canvas) · 관리자 콘솔(xlsx) · 골프 화면 열세 개
 * 이 화면들을 다시 바로 import 하지 말 것 — lazy(() => import(...)) 나 lazyPage 로.
 */
const app = readFileSync(resolve(__dirname, "../client/src/App.tsx"), "utf8");
const HEAVY = [
    "@/golf/pages/GolfPlay", "@/golf/pages/MiniGolfPlay", "@/golf/arcade/GolfArcadePage",
    "@/pages/partner/dashboard", "@/pages/admin/dashboard",
    "@/golf/pages/GolfCoursePage", "@/golf/pages/GolfCourseHub", "@/golf/pages/NewGame", "@/golf/pages/GamePage", "@/golf/pages/GameResult",
    "@/golf/pages/Passport", "@/golf/pages/CourseRanking", "@/golf/pages/BookingList", "@/golf/pages/MyBookings", "@/golf/pages/ProAm",
    "@/golf/pages/MembershipExchange", "@/golf/pages/MembershipDetail", "@/golf/field/RangePage",
];

describe("첫 화면 묶음에 무거운 화면을 싣지 않는다", () => {
    it.each(HEAVY)("%s 는 열 때만 받는다", (path) => {
        expect(app).not.toMatch(new RegExp(`^import \\w+ from "${path.replace(/[/.]/g, "\\$&")}";`, "m"));
        expect(app).toContain(`import("${path}")`);
    });
    it("App 은 three · xlsx · html2canvas 를 직접 부르지 않는다", () => {
        expect(app).not.toMatch(/from "(three|xlsx|html2canvas|@react-three\/fiber)"/);
    });
    it("recharts 는 그래프 전용 파일에서만 — 화면은 그 파일을 lazy 로 받는다(첫 화면 묶음에서 그래프 라이브러리를 뺀다)", () => {
        const { execSync } = require("node:child_process") as typeof import("node:child_process");
        const files = execSync('grep -rl \'from "recharts"\' client/src || true', { cwd: resolve(__dirname, ".."), encoding: "utf8" }).trim().split("\n").filter(Boolean).filter((f) => !/\.test\./.test(f)).sort();
        expect(files).toEqual([
            "client/src/components/hiq/charts/RankTrendChart.tsx",
            "client/src/components/hiq/history/GrowthChart.tsx",
            "client/src/components/ui/chart.tsx",
            "client/src/golf/components/course/detail/PriceChart.tsx",
            "client/src/golf/components/dashboard/ScoreTrendArea.tsx",
        ]);
        const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
        expect(read("client/src/pages/hiq/pba-player.tsx")).toContain('lazy(() => import("@/components/hiq/charts/SeasonChart"))');
        expect(read("client/src/pages/hiq/history.tsx")).toContain('lazy(() => import("@/components/hiq/history/GrowthChart")');
        expect(read("client/src/golf/components/dashboard/StatsChart.tsx")).toContain('lazy(() => import("./ScoreTrendArea"))');
    });
});
