// 당구 온라인게임 테마 시안 — 진짜 게임 화면(로컬 Vite 5177, 혼자 치기)에 임시로 테마를 입혀 찍는다.
import { openShot, chromium, PASS, report } from "/Users/choejeonghwan/rankue-app/store/screenshots/capture3-lib.mts";
import { readFileSync } from "node:fs";
const RAW = "/Users/choejeonghwan/rankue-app/reports/sim-themes-1012/raw";
const OUT = "/Users/choejeonghwan/rankue-app/reports/sim-themes-1012/shots";
const U = (n: string) => `http://localhost:5177/__theme/${n}.png`;
export const THEMES: Record<string, any> = {
    now: null,
    a: { felt: { centre: "#2A69B8", edge: "#174479" }, wood: U("a-wood"), gloss: true, bg: U("a-room"), cue: { shaft: 0xd9b98a, butt: 0x1b1512, ferrule: 0xf0ead8, tip: 0x2f4a66 } },
    b: { felt: { centre: "#1A7A48", edge: "#0B5D3B" }, wood: U("b-wood"), bg: U("b-room"), cue: { shaft: 0xd2a45c, butt: 0x5a2318, ferrule: 0xefe6cf, tip: 0x2f4a66 } },
    c: { felt: { centre: "#4A5261", edge: "#2A2F3A" }, wood: U("c-wood"), bg: U("c-room"), cue: { shaft: 0x1c1c1f, butt: 0x2b2e35, ferrule: 0x141414, tip: 0x2a6fd6 } },
    d: { felt: { centre: "#1F9A94", edge: "#0F6B6B" }, wood: U("d-wood"), bg: U("d-room"), cue: { shaft: 0xe6cfa6, butt: 0x1f5e5a, ferrule: 0xf5f0e0, tip: 0x2f4a66 } },
};
const only = (process.env.ONLY || "").split(",").filter(Boolean);
const views = (process.env.VIEWS || "player,top").split(",");
const cfg = Buffer.from(JSON.stringify({ gameType: "3c", target: 20, tableId: "DAEDAE", record: false })).toString("base64url");
const browser = await chromium.launch();
for (const [id, theme] of Object.entries(THEMES)) {
    if (only.length && !only.includes(id)) continue;
    for (const view of views) {
        const shot = await openShot(browser, { sport: "BILLIARDS", storage: { "rankue.sim.view": view }, handler: () => PASS });
        await shot.page.route("**/__theme/*", (route) => {
            const name = route.request().url().split("/__theme/")[1];
            route.fulfill({ status: 200, contentType: "image/png", body: readFileSync(`${RAW}/${name}`) });
        });
        if (theme) await shot.ctx.addInitScript((t) => { (window as any).__simTheme = t; }, theme);
        await shot.page.setViewportSize({ width: 440, height: 956 });
        await shot.page.goto(`http://localhost:5177/online-game?cfg=${cfg}`, { waitUntil: "load" });
        await shot.page.waitForTimeout(6000);
        const loaded = await shot.page.evaluate(`window.__simThemeLoaded ?? 0`);
        if (theme) await shot.page.waitForTimeout(1500);
        await shot.page.screenshot({ path: `${OUT}/${id}-${view}.png` });
        console.log(`${id}-${view}: textures loaded ${loaded} · errors ${shot.errors.length}${shot.errors[0] ? " — " + shot.errors[0].slice(0, 140) : ""}`);
        await shot.ctx.close();
    }
}
await browser.close();
