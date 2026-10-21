// 허브 카드 여섯(2026-10-21) — 전국 축제 · 코리아둘레길 · 길 넷. client/public/og-hub/<이름>.jpg(1200 정사각, 다른 허브 카드와 같은 꼴:
// 위는 우리 그림, 작은 머리말 · 큰 이름 두 줄 · 한 줄 설명 · 아래 'RANKUE · www.rankue.co.kr'). 길 카드에는 그 길의 코스 선(두루누비 GPX — 공개 코스만)을 길의 색으로.
//   npx tsx server/scripts/make-festival-trail-hub-cards.ts      (맥에서 — JPEG 는 sips 로 바꾼다)
// 그림을 바꾸면 shared/ogCards 의 HUB_CARD_VERSION 을 올릴 것.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { engines, fonts, CARD_SIZE } from "../services/playerCard.js";
import { TRAIL_ROUTES } from "../../shared/koreaTrails.js";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const outDir = path.join(root, "client/public/og-hub");
const uri = (file: string) => `data:image/png;base64,${fs.readFileSync(path.join(root, file)).toString("base64")}`;
const trails = JSON.parse(fs.readFileSync(path.join(root, "server/assets/trails/korea-trails.json"), "utf8")) as { courses: { route: string; coarse: [number, number][] }[] };

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El => ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });
const img = (src: string, w: number, hgt: number, style: Record<string, unknown> = {}): El => ({ type: "img", props: { src, width: w, height: hgt, style: { width: w, height: hgt, ...style } } });

/** 길 하나의 코스 선들 — 한 상자에(위가 북쪽 · 위도 36° 코사인) */
function routeSketch(lines: [number, number][][], color: string, size: number): string {
    const pad = 30;
    const all = lines.flat();
    const xs = all.map((p) => p[1] * 0.81), ys = all.map((p) => -p[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min((size - pad * 2) / Math.max(1e-6, x1 - x0), (size - pad * 2) / Math.max(1e-6, y1 - y0));
    const ox = (size - (x1 - x0) * s) / 2, oy = (size - (y1 - y0) * s) / 2;
    const d = lines.map((l) => l.map((p, i) => `${i ? "L" : "M"}${(ox + (p[1] * 0.81 - x0) * s).toFixed(1)} ${(oy + (-p[0] - y0) * s).toFixed(1)}`).join(" ")).join(" ");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="40" fill="#13363F"/>`
        + `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="0.25" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`
        + `<path d="${d}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function card(p: { art: string; artTop: number; kicker: string; title: string[]; sub: string; color?: string; sketch?: string }): El {
    return h("div", { width: CARD_SIZE, height: CARD_SIZE, position: "relative", backgroundColor: "#0B1F26", fontFamily: "Pretendard", color: "#F4EFE3" },
        img(p.art, CARD_SIZE, CARD_SIZE, { position: "absolute", left: 0, top: p.artTop }),
        h("div", { position: "absolute", left: 0, top: 420, width: CARD_SIZE, height: 780, backgroundImage: "linear-gradient(180deg, rgba(11,31,38,0) 0%, rgba(11,31,38,0.9) 42%, #0B1F26 70%)" }),
        p.sketch ? img(p.sketch, 380, 380, { position: "absolute", right: 72, top: 430, borderRadius: 40, boxShadow: "0 12px 40px rgba(0,0,0,0.45)" }) : "",
        h("div", { position: "absolute", left: 72, bottom: 150, flexDirection: "column" },
            h("div", { fontSize: 44, fontWeight: 700, color: p.color ?? "#F28C6A" }, p.kicker),
            h("div", { flexDirection: "column", marginTop: 8 }, ...p.title.map((l) => h("div", { fontSize: 150, fontWeight: 800, letterSpacing: -5, lineHeight: 1.06 }, l))),
            h("div", { marginTop: 26, fontSize: 44, fontWeight: 500, color: "rgba(244,239,227,0.8)" }, p.sub),
        ),
        h("div", { position: "absolute", left: 72, right: 72, bottom: 64, justifyContent: "space-between", alignItems: "center", fontSize: 32, fontWeight: 700 },
            h("div", { alignItems: "center" }, h("div", { width: 18, height: 18, borderRadius: 9, background: "#F28C6A", marginRight: 14 }), "RANKUE"),
            h("div", { color: "rgba(244,239,227,0.7)" }, "www.rankue.co.kr"),
        ),
    );
}

const festArt = uri("server/assets/festivals/cover.png"), trailArt = uri("server/assets/trails/cover.png");
const jobs: { name: string; el: El }[] = [
    { name: "festivals", el: card({ art: festArt, artTop: -60, kicker: "랭큐", title: ["전국", "축제"], sub: "축제 지도 · 달력 · 이번 주말" }) },
    { name: "trails", el: card({ art: trailArt, artTop: -40, kicker: "랭큐 등산 · 국토종주", title: ["코리아", "둘레길"], sub: "해파랑 · 남파랑 · 서해랑 · DMZ 평화의 길" }) },
    ...TRAIL_ROUTES.map((r) => ({
        name: `trails-${r.id}`,
        el: card({ art: trailArt, artTop: -40, kicker: "코리아둘레길", title: r.name.length > 5 ? r.name.split(" ").reduce<string[]>((a, w) => (a.length && (a[a.length - 1] + w).length <= 5 ? [...a.slice(0, -1), `${a[a.length - 1]} ${w}`] : [...a, w]), []) : [r.name],
            sub: `${r.total}개 코스 · ${r.km.toLocaleString("en-US")}km`, color: r.color,
            sketch: routeSketch(trails.courses.filter((c) => c.route === r.id).map((c) => c.coarse), r.color, 380) }),
    })),
];
const { satori, Resvg } = await engines();
for (const j of jobs) {
    const svg = await satori(j.el as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
    const tmp = path.join(outDir, `${j.name}.png`);
    fs.writeFileSync(tmp, png);
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", tmp, "--out", path.join(outDir, `${j.name}.jpg`)], { stdio: "ignore" });
    fs.unlinkSync(tmp);
    console.log(j.name, Math.round(fs.statSync(path.join(outDir, `${j.name}.jpg`)).size / 1024), "KB");
}
process.exit(0);
