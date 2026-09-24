/**
 * 골프 기본 공유 이미지 client/public/og-golf.png(1200×630) 한 번 그리기(2026-09-24).
 *
 * 왜: 골프장 490곳·골프 허브·조인·골프 랭킹 페이지가 전부 당구 브랜드 이미지(og.png, 큐대와 당구공)를 썼다.
 * 골프를 검색한 사람에게 당구공 썸네일이 보여 클릭률을 깎는다. 선수 카드와 같은 satori+resvg·Pretendard 로 그린다.
 * 서버가 매번 그리는 이미지가 아니라 정적 파일이다 — 문구(골프장 수)가 바뀌면 이 스크립트를 다시 돌려 커밋한다.
 *
 * 실행(저장소 루트):
 *   npx tsx server/scripts/og-golf-image.ts
 * DB 를 읽지 않는다. 골프장 수(490)는 2026-09-24 golf_course_pages 공개 행 수(사이트맵 golf-courses 와 같은 기준).
 */
import fs from "node:fs";
import path from "node:path";

const W = 1200, H = 630;
const COURSES = 490;
const OUT = path.join(process.cwd(), "client/public/og-golf.png");

const BG = "#0A0A0A";
const LIME = "#64DD17";
const INK = "#F5F5F4";
const MUTED = "rgba(245,245,244,0.66)";
const LINE = "rgba(245,245,244,0.14)";

// 폰트는 선수 카드(server/services/playerCard.ts)와 같은 Pretendard woff — 같은 폴더에서 읽는다
function fonts() {
    const dir = path.join(process.cwd(), "server/assets/fonts");
    return ([["Medium", 500], ["Bold", 700], ["ExtraBold", 800]] as const).map(([w, weight]) => ({
        name: "Pretendard", data: fs.readFileSync(path.join(dir, `Pretendard-${w}.woff`)), weight, style: "normal" as const,
    }));
}

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
// span 에 display: undefined 를 넘기면 satori 가 죽는다 — div 에만 flex 를 붙인다
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });

// 오른쪽 그림 — 그린(원)과 깃대 하나. 장식은 이것만.
const flag: El = {
    type: "svg",
    props: {
        width: 360, height: 420, viewBox: "0 0 360 420",
        children: [
            { type: "ellipse", props: { cx: 180, cy: 360, rx: 170, ry: 48, fill: "#141414", stroke: LINE, strokeWidth: 2 } },
            { type: "ellipse", props: { cx: 180, cy: 360, rx: 26, ry: 8, fill: "#000000" } },
            { type: "rect", props: { x: 176, y: 40, width: 8, height: 322, rx: 4, fill: INK } },
            { type: "path", props: { d: "M184 44 L318 88 L184 132 Z", fill: LIME } },
        ],
    },
};

const tree = h("div", { width: W, height: H, flexDirection: "column", padding: "64px 72px", backgroundColor: BG, fontFamily: "Pretendard", color: INK },
    // 헤더: 워드마크 + 종목
    h("div", { justifyContent: "space-between", alignItems: "center" },
        h("div", { alignItems: "center" },
            h("div", { width: 18, height: 18, borderRadius: 9, background: LIME, marginRight: 14 }),
            h("div", { fontSize: 34, fontWeight: 800, letterSpacing: 4 }, "RANKUE"),
        ),
        h("div", { fontSize: 24, fontWeight: 700, color: LIME, border: `2px solid ${LIME}`, borderRadius: 999, padding: "6px 20px", letterSpacing: 3 }, "GOLF"),
    ),
    // 본문 + 그림. 글자 사이 공백은 span 경계에서 잘려 띄움은 marginLeft 로 준다.
    h("div", { flex: 1, alignItems: "center", justifyContent: "space-between" },
        h("div", { flexDirection: "column" },
            h("div", { fontSize: 136, fontWeight: 800, letterSpacing: -4, lineHeight: 1.05 },
                h("span", {}, "랭큐"), h("span", { color: LIME, marginLeft: 32 }, "골프"),
            ),
            h("div", { fontSize: 50, fontWeight: 700, marginTop: 28, letterSpacing: -1 },
                h("span", {}, "전국 골프장"), h("span", { color: LIME, marginLeft: 14 }, `${COURSES}곳`),
            ),
            h("div", { fontSize: 34, fontWeight: 500, color: MUTED, marginTop: 14 }, "부킹 · 조인 · 그린피 · 회원권 시세"),
        ),
        flag,
    ),
    // 푸터
    h("div", { justifyContent: "flex-end", paddingTop: 18, borderTop: `2px solid ${LINE}` },
        h("div", { fontSize: 24, fontWeight: 700, color: MUTED, letterSpacing: 1 }, "www.rankue.co.kr"),
    ),
);

async function main() {
    const [{ default: satori }, { Resvg }] = await Promise.all([import("satori"), import("@resvg/resvg-js")]);
    const svg = await satori(tree as any, { width: W, height: H, fonts: fonts() });
    const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
    fs.writeFileSync(OUT, png);
    // 크기 확인 — PNG IHDR 의 가로·세로(바이트 16~23)
    const w = png.readUInt32BE(16), hgt = png.readUInt32BE(20);
    console.log(`[og-golf] ${OUT} ${w}x${hgt} ${(png.length / 1024).toFixed(1)}KB`);
    if (w !== W || hgt !== H) throw new Error(`size mismatch: ${w}x${hgt}`);
    if (png.length >= 300 * 1024) throw new Error(`too large: ${png.length} bytes`);
}

main().catch((e) => { console.error(e); process.exit(1); });
