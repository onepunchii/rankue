// 랭킹 '진열장' — 로컬 Vite(5177) + 가짜 응답(이름·숫자는 예시). MODE=real: 지금 운영과 비슷한 분포(브론즈 위주) · MODE=all: 일곱 등급이 다 보이는 분포 · MODE=new: 배치 전
import { openShot, chromium, PASS, ME, ME_ID, report } from "/Users/choejeonghwan/rankue-app/store/screenshots/capture3-lib.mts";
const OUT = "/Users/choejeonghwan/rankue-app/reports/sim-rank-b-1012/shots";
const MODE = process.env.MODE ?? "real";
const W = Number(process.env.W ?? 440);
const base: [string, string, string | null, number, number, number][] = MODE === "all"
    ? [["a", "파란초크", "KR", 1486, 212, 141], ["b", "Lobo Azul", "MX", 1392, 160, 98], ["c", "빨간공", null, 1287, 120, 70], [ME_ID, ME.name, "KR", 1172, 64, 38], ["e", "North Cue", "GB", 1094, 40, 22], ["f", "노란큐", "KR", 1003, 21, 10], ["g", "하얀큐", null, 912, 9, 2]]
    : [["a", "파란초크", "KR", 1116, 64, 38], [ME_ID, ME.name, "KR", 1042, 21, 12], ["c", "Lobo Azul", "MX", 1031, 14, 8], ["d", "빨간공", null, 1012, 9, 5], ["e", "North Cue", "GB", 1004, 7, 4], ["f", "노란큐", "KR", 988, 12, 5], ["g", "하얀큐", null, 931, 6, 2]];
const rows = base.map(([memberId, name, country, rating, matches, wins], i) => ({ memberId, name, country, rating, matches, wins, rank: i + 1, countryRank: 1 }));
const mine = rows.find((r) => r.memberId === ME_ID)!;
const me = MODE === "new" ? { rating: 1000, matches: 1, wins: 1, country: "KR", rank: null, countryRank: null } : { rating: mine.rating, matches: mine.matches, wins: mine.wins, country: "KR", rank: mine.rank, countryRank: 1 };
const calls: string[] = [];
const browser = await chromium.launch();
const shot = await openShot(browser, { sport: "BILLIARDS", me: { ...ME, country: "KR" }, handler: ({ path }) => {
    if (path === "/api/hiq/sim/rank") { calls.push(path); return { rows: MODE === "new" ? rows.filter((r) => r.memberId !== ME_ID) : rows, total: rows.length, countries: [], me, combos: [{ gameType: "3c", ranked: 7, myMatches: me.matches }, { gameType: "4c", ranked: 3, myMatches: 0 }] }; }
    return PASS;
} });
const failed: string[] = [];
shot.page.on("response", (r) => { if (r.url().includes("/sim/rank/") && r.status() >= 400) failed.push(`${r.status()} ${r.url().split("/").pop()}`); });
await shot.page.setViewportSize({ width: W, height: 956 });
await shot.page.goto("http://localhost:5177/online-game?rank=1", { waitUntil: "load" });
await shot.page.waitForTimeout(4000);
const info = await shot.page.evaluate(`(() => {
    const imgs = [...document.querySelectorAll('.rank-hall img')];
    const broken = imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src'));
    const hall = document.querySelector('.rank-hall');
    const me = document.querySelector('[data-testid=rank-me]');
    const over = [...hall.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length;
    const top = getComputedStyle(document.querySelector('.hall-top')).backgroundImage.includes('hall.webp');
    return { imgs: imgs.length, broken, overflowRight: over, hallBg: top, meText: me?.innerText.replace(/\\s+/g, ' ').slice(0, 120), rows: [...document.querySelectorAll('ol li')].length, pageH: document.querySelector('.rank-hall').scrollHeight };
})()`);
console.log(MODE, W, JSON.stringify(info), "| failed:", failed.join(","));
await shot.page.screenshot({ path: `${OUT}/hall-${MODE}-${W}.png` });
if (process.env.FULL) { const el = shot.page.locator(".rank-hall"); await el.screenshot({ path: `${OUT}/hall-${MODE}-${W}-full.png` }); }
report(shot, `hall-${MODE}`);
await browser.close();
