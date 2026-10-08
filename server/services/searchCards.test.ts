import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { engines } from "./playerCard";
import { emOf, fitSize, nameLines, splitName } from "./cardText";
import { renderGolfCourseCardPng, golfCourseCardUrl } from "./golfCourseCard";
import { renderStoreCardPng, storeCardUrl, storeFactsLine, tableSvg } from "./storeCard";
import { inkBounds, pngSize, trimLogo } from "../lib/logoTrim";
import { CARD_VERSION, cardAlt } from "../../shared/ogCards";

/**
 * 검색 썸네일 둘째 판(2026-10-08 오너: "이미지 너무 별로인데 … 썸네일 시안 몇 개 만들어 줘 봐" → "골프는 시안 C, 당구장은 시안 B").
 * 골프장 = 로고 판, 당구장 = 당구대 그림. 그림은 운영 자료로 뽑아 눈으로 봤다 — 여기는 셈과 '그려지는가'를 고정한다
 * (satori 는 모르는 CSS·flex 없는 div 에서 던진다 — 던지면 카드 주소가 500 이다).
 * 아래 이름·숫자는 시험용으로 지어낸 값이다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
/** 시험용 PNG — 카드 엔진으로 SVG 를 그려 만든다(따로 인코더가 없다) */
async function pngOf(svg: string): Promise<Buffer> {
    const { Resvg } = await engines();
    return new Resvg(svg).render().asPng();
}
const svgBox = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;

describe("이름 글자 — 칸에 꽉 채우기", () => {
    it("너비 어림: 한글이 가장 넓고, 대문자 · 숫자 · 소문자 · 띄어쓰기 순", () => {
        expect(emOf("가")).toBeGreaterThan(emOf("C"));
        expect(emOf("C")).toBeGreaterThan(emOf("3"));
        expect(emOf("3")).toBeGreaterThan(emOf("a"));
        expect(emOf("a")).toBeGreaterThan(emOf(" "));
        // 접히지 않게 여유 있게 잡는다(한글 0.87 로 잡았다가 '설해원 / CC' 로 접혔다)
        expect(emOf("가")).toBeGreaterThanOrEqual(0.93);
    });

    it("fitSize — 가장 긴 줄이 들어가는 가장 큰 크기, 위아래 한도", () => {
        expect(fitSize(["가나다"], 1000, 400)).toBe(Math.floor(1000 / (0.93 * 3)));
        expect(fitSize(["가"], 1000, 200)).toBe(200);
        expect(fitSize(["가".repeat(200)], 1000, 200)).toBe(24);
        expect(fitSize([], 1000, 200)).toBe(200);
    });

    it("붙여 쓴 짧은 이름은 한 줄로 크게", () => {
        expect(nameLines("설해원CC", 1056, 176, 150)).toEqual({ lines: ["설해원CC"], size: 176 });
        expect(nameLines("세레니티CC", 1056, 176, 150).lines).toEqual(["세레니티CC"]);
        expect(nameLines("썬당구장", 1056, 168, 140).lines).toEqual(["썬당구장"]);
    });

    it("긴 이름은 두 줄 — 띄어쓰기에서, 없으면 '컨트리클럽·CC·당구클럽' 앞에서. 줄표는 띄어쓰기로 본다", () => {
        expect(nameLines("휘슬링락컨트리클럽", 1056, 240, 240).lines).toEqual(["휘슬링락", "컨트리클럽"]);
        expect(nameLines("김포마송 당구클럽", 1056, 250, 250).lines).toEqual(["김포마송", "당구클럽"]);
        expect(nameLines("마이다스-구미-골프아카데미", 1056, 176, 150).lines).toEqual(["마이다스 구미", "골프아카데미"]);
        expect(splitName("가나다라마바사아자차")).toEqual(["가나다라마", "바사아자차"]);
        // 두 줄일 때의 한도는 따로(세로 자리가 모자라다)
        expect(nameLines("김포마송 당구클럽", 1056, 250, 140).size).toBeLessThanOrEqual(140);
    });

    it("어느 쪽이든 줄은 칸을 넘지 않는다(어림 기준)", () => {
        for (const n of ["설해원CC", "레이크사이드CC", "강남300컨트리클럽", "골프존카운티 선운", "사우스링스영암컨트리클럽", "A", "더 플레이어스 골프클럽 춘천", "정 당구클럽"]) {
            const { lines, size } = nameLines(n, 1056, 176, 150);
            expect(lines.length, n).toBeLessThanOrEqual(2);
            for (const l of lines) expect(emOf(l) * size, `${n} / ${l}`).toBeLessThanOrEqual(1056);
        }
    });
});

describe("로고 여백 잘라 내기", () => {
    it("pngSize — IHDR 에서 읽고, PNG 가 아니면 null", async () => {
        expect(pngSize(await pngOf(svgBox(120, 80, `<rect width="120" height="80" fill="#fff"/>`)))).toEqual({ w: 120, h: 80 });
        expect(pngSize(Buffer.from("GIF89a..........................."))).toBeNull();
        expect(pngSize(new Uint8Array(4))).toBeNull();
    });

    it("inkBounds — 투명한 곳과(흰 판용이면) 흰 곳을 뺀 경계", () => {
        const w = 6, h = 4, px = new Uint8Array(w * h * 4);
        const set = (x: number, y: number, r: number, g: number, b: number, a: number) => px.set([r, g, b, a], (y * w + x) * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 255, 255, 255, 255);   // 흰 바탕
        set(2, 1, 10, 10, 10, 255); set(4, 2, 200, 0, 0, 255);
        expect(inkBounds(px, w, h, true)).toEqual({ x: 2, y: 1, w: 3, h: 2 });
        // 흰색뿐인 로고(어두운 판용)는 흰색도 잉크다 — 바탕이 불투명한 흰색이면 통째로 남는다
        expect(inkBounds(px, w, h, false)).toEqual({ x: 0, y: 0, w: 6, h: 4 });
        // 투명 바탕 위의 흰 로고
        const t = new Uint8Array(w * h * 4); t.set([255, 255, 255, 255], (1 * w + 3) * 4);
        expect(inkBounds(t, w, h, false)).toEqual({ x: 3, y: 1, w: 1, h: 1 });
        expect(inkBounds(t, w, h, true)).toBeNull();
        expect(inkBounds(new Uint8Array(w * h * 4), w, h, true)).toBeNull();
    });

    it("trimLogo — 흰 여백 속의 작은 그림을 그림 크기로 잘라 낸다(설해원 로고의 꼴)", async () => {
        const png = await pngOf(svgBox(200, 120, `<rect width="200" height="120" fill="#ffffff"/><rect x="80" y="40" width="40" height="20" fill="#123456"/>`));
        const cut = await trimLogo(png);
        expect(cut).not.toBeNull();
        expect([cut!.width, cut!.height]).toEqual([40, 20]);
        expect(cut!.uri.startsWith("data:image/png;base64,")).toBe(true);
        expect(pngSize(Buffer.from(cut!.uri.split(",")[1], "base64"))).toEqual({ w: 40, h: 20 });
    }, 30_000);

    it("trimLogo — 투명 바탕의 흰 로고는 light 로만 잘린다 · 깨진 그림과 빈 그림은 null", async () => {
        const white = await pngOf(svgBox(160, 100, `<rect x="30" y="20" width="100" height="50" fill="#ffffff"/>`));
        expect(await trimLogo(white)).toBeNull();
        const cut = await trimLogo(white, true);
        expect([cut!.width, cut!.height]).toEqual([100, 50]);
        expect(await trimLogo(Buffer.from("not a png"))).toBeNull();
        expect(await trimLogo(await pngOf(svgBox(50, 50, `<rect width="50" height="50" fill="#fff"/>`)))).toBeNull();
    }, 30_000);
});

describe("당구대 그림", () => {
    it("같은 매장 코드는 늘 같은 그림, 다른 코드는 다른 그림", () => {
        expect(tableSvg("C00017", 1200, 640)).toBe(tableSvg("C00017", 1200, 640));
        expect(tableSvg("C00017", 1200, 640)).not.toBe(tableSvg("C00108", 1200, 640));
    });

    it("공 셋은 펠트 안에, 서로 겹치지 않게 — 코드 200개", () => {
        for (let i = 0; i < 200; i++) {
            const svg = tableSvg(`C${String(i * 37).padStart(5, "0")}`, 1200, 640);
            const balls = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="34" fill="#(?:F7F3E8|F2C230|D8372C)"\/>/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
            expect(balls, String(i)).toHaveLength(3);
            for (const b of balls) {
                expect(b.x).toBeGreaterThanOrEqual(100 + 34); expect(b.x).toBeLessThanOrEqual(1100 - 34);
                expect(b.y).toBeGreaterThanOrEqual(100 + 34); expect(b.y).toBeLessThanOrEqual(540 - 34);
            }
            for (let a = 0; a < 3; a++) for (let c = a + 1; c < 3; c++) expect(Math.hypot(balls[a].x - balls[c].x, balls[a].y - balls[c].y), String(i)).toBeGreaterThan(68);
        }
    });

    it("사실은 글자 줄에만 — 테이블 수와 10분 요금", () => {
        expect(storeFactsLine({ tables: [{ label: "대대", n: 6 }, { label: "중대", n: 5 }], rate: "10분 1,800원~" })).toBe("대대 6대 · 중대 5대 · 10분 1,800원~");
        expect(storeFactsLine({ tables: [], rate: null })).toBe("");
        expect(storeFactsLine({ tables: [{ label: "대대", n: 4 }] })).toBe("대대 4대");
    });
});

describe("그려지는가 — 1200×1200 PNG", () => {
    const sq = { w: 1200, h: 1200 };

    it("골프장: 로고(흰 판) · 흰 로고(어두운 판) · 로고 없음(점 지도) · 아무것도 없음(이름 첫 글자)", async () => {
        const logo = await trimLogo(await pngOf(svgBox(300, 120, `<rect width="300" height="120" fill="#fff"/><rect x="20" y="30" width="260" height="60" fill="#0B3B2A"/>`)));
        const map = { uri: `data:image/svg+xml;base64,${Buffer.from(svgBox(372, 600, `<circle cx="180" cy="300" r="8" fill="#64DD17"/>`)).toString("base64")}`, width: 372, height: 600 };
        const base = { name: "시험컨트리클럽", where: "강원 양양", facts: "27홀 · 대중제" };
        for (const p of [
            { ...base, logo },
            { ...base, logo: { ...logo!, light: true } },
            { ...base, map },
            { ...base },
            { name: "마이다스-구미-골프아카데미", where: "", facts: "" },
        ]) expect(pngSize(await renderGolfCourseCardPng(p))).toEqual(sq);
    }, 60_000);

    it("당구장: 테이블·요금이 다 있는 곳 · 이름만 있는 곳", async () => {
        expect(pngSize(await renderStoreCardPng({ code: "C00001", name: "시험 당구클럽", area: "서울 중구", tables: [{ label: "대대", n: 6 }, { label: "중대", n: 4 }, { label: "포켓", n: 1 }], rate: "10분 1,600원~" }))).toEqual(sq);
        expect(pngSize(await renderStoreCardPng({ code: "C00002", name: "이름이아주긴어느동네의시험당구장빌리어드", area: "", tables: [], rate: null }))).toEqual(sq);
    }, 60_000);
});

describe("카드 주소와 재료", () => {
    it("주소는 한 곳(shared/ogCards)에서 — 판 번호가 붙고, 화면·프리렌더·사이트맵이 같은 함수를 쓴다", () => {
        expect(CARD_VERSION).toBeGreaterThanOrEqual(2);
        expect(golfCourseCardUrl("https://x.test", "세레니티CC")).toBe(`https://x.test/og/golf-course/${encodeURIComponent("세레니티CC")}.png?v=${CARD_VERSION}`);
        expect(storeCardUrl("https://x.test", "C00017")).toBe(`https://x.test/og/store/C00017.png?v=${CARD_VERSION}`);
        // 화면에 글자로 따로 적어 둔 주소가 없다(예전에는 판이 올라가도 화면만 옛 주소였을 것이다)
        for (const p of ["client/src/golf/pages/GolfCoursePage.tsx", "client/src/pages/store-listing.tsx"]) expect(code(root(p)), p).not.toMatch(/\/og\/(golf-course|store)\//);
        expect(code(root("client/src/golf/pages/GolfCoursePage.tsx")).match(/golfCourseCardUrl\(ORIGIN, d\.slug\)/g)).toHaveLength(2);
        expect(code(root("client/src/pages/store-listing.tsx")).match(/storeCardUrl\("https:\/\/www\.rankue\.co\.kr", s\.code \?\? code\)/g)).toHaveLength(2);
    });

    it("재료: 로고는 여백을 잘라서, 흰 로고는 어두운 판으로, 지도는 로고가 없을 때만 · 점만(윤곽선 자료 금지)", () => {
        const og = code(root("server/ogImage.ts"));
        expect(og).toContain("const cut = await trimLogo(new Uint8Array(await r.arrayBuffer()), light);");
        expect(og).toContain("if (cut) logo = { ...cut, light };");
        expect(og).toContain("map: logo ? null : courseCardMap(s.pages, p),");
        for (const p of ["server/ogImage.ts", "server/services/golfCourseCard.ts", "server/services/storeCard.ts", "server/lib/logoTrim.ts"]) expect(root(p), p).not.toMatch(/koreaMapData|KOREA_MAP_PATHS/);
    });

    it("재료: 매장 요금은 가장 싼 값 하나 — 테이블마다 다르면 '~'", () => {
        const og = code(root("server/ogImage.ts"));
        expect(og).toContain('const rate = r10.length ? `10분 ${won(Math.min(...r10))}${new Set(r10).size > 1 ? "~" : ""}` : null;');
    });

    it("그림 설명(alt)은 카드에 있는 것만 말한다 — 그린피·시세·영업시간 칸은 뺐다", () => {
        const pre = root("server/prerender.ts");
        expect(pre).not.toMatch(/그린피·회원권 시세 카드|요금·영업시간 카드/);
        expect(pre.match(/cardAlt\(\w+\.name, "골프장"\)/g)!.length).toBeGreaterThanOrEqual(3);
        expect(pre.match(/cardAlt\(\w+\.name, "당구장"\)/g)!.length).toBeGreaterThanOrEqual(3);
        // 이름에 이미 그 말이 있으면 되풀이하지 않는다
        expect(cardAlt("허슬러1 당구장", "당구장")).toBe("허슬러1 당구장 카드");
        expect(cardAlt("김포마송 당구클럽", "당구장")).toBe("김포마송 당구클럽 당구장 카드");
        expect(cardAlt("강화 선두리 골프장", "골프장")).toBe("강화 선두리 골프장 카드");
        expect(cardAlt("설해원CC", "골프장")).toBe("설해원CC 골프장 카드");
    });
});
