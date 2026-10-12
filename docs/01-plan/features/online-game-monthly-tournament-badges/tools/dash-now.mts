// 온라인게임 진입 · 대시보드 · 랭킹의 지금 모습 — 로컬 Vite(5177) + 가짜 응답(숫자·이름은 예시).
import { openShot, chromium, PASS, ME, ME_ID, report } from "/Users/choejeonghwan/rankue-app/store/screenshots/capture3-lib.mts";
const OUT = "/Users/choejeonghwan/rankue-app/reports/sim-dash-1012/now";
const day = (d: number, h = 21) => { const x = new Date(Date.now() - d * 86_400_000); x.setHours(h, 5, 0, 0); return x.toISOString(); };
const sessions = Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, kind: "solo", gameType: "3c", tableId: "DAEDAE", cushionModel: "han2005", condition: 1, targetScore: 20, inningCap: 0,
    score: [20, 14, 20, 11, 20, 17, 9, 20, 20, 13, 20, 16, 20, 12][i], innings: [31, 30, 28, 30, 35, 30, 30, 26, 33, 30, 29, 30, 24, 30][i], highRun: [4, 3, 5, 2, 4, 3, 2, 6, 4, 3, 5, 3, 7, 3][i], shots: 60 + i, status: "finished", startedAt: day(14 - i), finishedAt: day(14 - i, 22) }));
const stats = {
    ratings: [{ gameType: "3c", tableId: "DAEDAE", sessions: 14, totalScore: 232, totalInnings: 416, bestAvg: 0.833, bestHighRun: 7, simRating: 1042, matches: 21, wins: 12, updatedAt: day(0) }],
    matchRatings: [{ gameType: "3c", rating: 1042, matches: 21, wins: 12 }, { gameType: "4c", rating: 1004, matches: 4, wins: 2 }],
    matchRecords: [{ gameType: "3c", tableId: "DAEDAE", wins: 12, losses: 9, draws: 0, total: 21 }, { gameType: "4c", tableId: "JUNGDAE_KR", wins: 2, losses: 2, draws: 0, total: 4 }],
    sessions, matchRanks: [{ gameType: "3c", rank: 2, total: 7, matches: 21 }, { gameType: "4c", rank: 3, total: 3, matches: 4 }],
    drillWeeks: [{ weekId: "2026-W40", attempts: 9, successes: 4, cushions: 3 }, { weekId: "2026-W41", attempts: 6, successes: 3, cushions: 3 }], currentWeekId: "2026-W42",
};
const rows = [["a", "파란초크", "KR", 1116, 64, 38], [ME_ID, ME.name, "KR", 1042, 21, 12], ["c", "Lobo Azul", "MX", 1031, 14, 8], ["d", "빨간공", null, 1012, 9, 5], ["e", "North Cue", "GB", 1004, 7, 4], ["f", "노란큐", "KR", 988, 12, 5], ["g", "하얀큐", null, 961, 6, 2]]
    .map(([memberId, name, country, rating, matches, wins], i) => ({ memberId, name, country, rating, matches, wins, rank: i + 1, countryRank: 1 }));
const browser = await chromium.launch();
for (const [name, url] of [["entry", "/online-game"], ["dash", "/online-game?dash=1"], ["rank", "/online-game?rank=1"]] as const) {
    const shot = await openShot(browser, { sport: "BILLIARDS", me: { ...ME, country: "KR" }, handler: ({ path }) => {
        if (path === "/api/hiq/sim/stats/me") return stats;
        if (path === "/api/hiq/sim/rank/me") return { placement: 3, boards: stats.matchRanks };
        if (path === "/api/hiq/sim/rank") return { rows, total: rows.length, countries: [], me: { rating: 1042, matches: 21, wins: 12, country: "KR", rank: 2, countryRank: 2 }, combos: [{ gameType: "3c", ranked: 7, myMatches: 21 }, { gameType: "4c", ranked: 3, myMatches: 4 }] };
        if (path === "/api/hiq/sim/matches") return [];
        return PASS;
    } });
    await shot.page.setViewportSize({ width: 440, height: 956 });
    await shot.page.goto(`http://localhost:5177${url}`, { waitUntil: "load" });
    await shot.page.waitForTimeout(4500);
    await shot.page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const h = await shot.page.evaluate(`document.documentElement.scrollHeight`);
    console.log(name, "height", h, "errors", shot.errors.length, shot.errors[0]?.slice(0, 120) ?? "", "| unknown:", [...shot.unknown].slice(0, 6).join(" "));
    await shot.ctx.close();
}
await browser.close();
