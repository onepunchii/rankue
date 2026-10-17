import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { HOME_ART } from "./HomeArt";

/**
 * 골프 홈 카드의 그림(2026-10-12 오너: "이미지 써도 되니 홈에 긴급티 배너랑 랭큐매치 골프코스 카드 등등 변경이 필요하고 더 완벽하게").
 * 화면은 갈무리로 확인했다(440 · 360 폭, 회원 · 방문자 · 글이 있는 날 · 없는 날). 여기는 그때 찾은 함정이 다시 생기지 않게 소스를 읽어 묶는다.
 */
const root = resolve(__dirname, "../../../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const DASH = "client/src/golf/components/dashboard";
const art = code(read(`${DASH}/HomeArt.tsx`));
const fn = (name: string) => { const at = art.indexOf(`export function ${name}(`); const next = art.indexOf("export function ", at + 10); return art.slice(at, next < 0 ? undefined : next); };

describe("그림 파일", () => {
    it("다섯 장이 우리 폴더에 있고 가볍다(한 장 40KB 아래 · 합쳐 100KB 아래)", () => {
        const sizes = Object.values(HOME_ART).map((src) => {
            const file = resolve(root, "client/public", src.replace(/^\//, ""));
            expect(existsSync(file), src).toBe(true);
            return statSync(file).size;
        });
        expect(sizes).toHaveLength(5);
        for (const n of sizes) expect(n).toBeLessThan(40_000);
        expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(100_000);
    });

    it("홈과 라운드 고르기 시트는 바깥 서버의 그림을 부르지 않는다 — 예전 움직이는 그림(lottie.host) 셋이 없다", () => {
        for (const f of ["QuickActions.tsx", "GameModeSheet.tsx", "HomeArt.tsx", "HotDealTicker.tsx"]) {
            const src = code(read(`${DASH}/${f}`));
            expect(src, f).not.toMatch(/lottie/i);
            expect(src, f).not.toMatch(/https?:\/\//);
        }
    });

    it("전부 장식이다 — 읽어 주지 않고(alt 없음 · aria-hidden) 손가락을 받지 않는다", () => {
        const imgs = art.match(/<img\b[^]*?\/>/g) ?? [];
        expect(imgs).toHaveLength(4);
        for (const tag of imgs) { expect(tag).toContain('alt=""'); expect(tag).toContain("draggable={false}"); }
        for (const name of ["MatchTileArt", "MatchTileHill", "JoinTileArt", "UrgentArt", "CoursesArt"]) {
            expect(fn(name), name).toContain("aria-hidden");
            expect(fn(name), name).toContain("pointer-events-none");
        }
        const sheet = code(read(`${DASH}/GameModeSheet.tsx`));
        expect(sheet.match(/src=\{HOME_ART\.(match|scan)\} alt="" aria-hidden/g)).toHaveLength(2);
    });

    it("리터럴 색만 — 골프 테마가 바꿔 끼우는 유틸(white · black)을 쓰지 않는다", () => {
        expect(art).not.toMatch(/\b(?:bg|text|border|ring|outline|from|via|to|fill|stroke)-(?:white|black)\b/);
    });
});

describe("RANKUE MATCH · ENTER CODE 타일", () => {
    const quick = code(read(`${DASH}/QuickActions.tsx`));

    it("두 타일이 우리 그림을 쓴다 — 옛 '#' 아이콘과 움직이는 골퍼는 없다", () => {
        expect(quick).toContain("<MatchTileArt />");
        expect(quick).toContain("<JoinTileArt />");
        expect(quick).not.toContain("LucideHash");
        expect(quick).not.toContain("DotLottieReact");
    });

    it("앞 언덕은 제목 상자 안에 있다 — 제목이 언덕을 데리고 다닌다(타일 높이의 몇 % 로 잡으면 좁은 기기에서 제목이 골퍼의 다리와 겹친다)", () => {
        const box = quick.slice(quick.indexOf('<div className="relative isolate z-10 w-full">'), quick.indexOf("RANKUE<br />MATCH"));
        expect(box).toContain("<MatchTileHill />");
        // 언덕은 상자의 24px 위에서 타일 바닥까지, 타일의 안쪽 여백만큼 양옆으로 넘친다. 상자 안의 맨 뒤(-z-10)
        expect(fn("MatchTileHill")).toContain("absolute -inset-x-6 -top-6 -bottom-6 -z-10");
        // 꼬리말은 폭 360 기기에서 한 줄 — 두 줄이 되면 언덕이 올라와 그림을 다 가린다
        expect(quick).toContain('min-[350px]:whitespace-nowrap">스코어 기록 · 동반자 게임</p>');
    });

    it("타일의 면과 제목은 그대로다 — 라임 면 · 어두운 면에 라임 테두리, 홈의 굵기(extrabold)", () => {
        expect(quick).toContain("bg-gradient-to-br from-[#64DD17] to-[#388E3C]");
        expect(quick).toContain("bg-[#1a1a1a] border border-[#64DD17]/30");
        expect(quick.match(/<h3 className="text-2xl font-extrabold /g)!.length).toBe(2);
        // 아래 줄 두 타일(여권 · 장식장)은 폭 360 에서 한 단계 작게 — 굵기는 그대로(2026-10-17, 제목이 상자 끝에 닿던 것)
        expect(quick.match(/<h3 className="text-\[21px\] min-\[400px\]:text-2xl font-extrabold /g)!.length).toBe(2);
        expect(quick.match(/className="min-h-\[196px\] rounded-\[2rem\] bg-white\/\[0\.03\]/g)!.length).toBe(2);
    });
});

describe("긴급티 배너", () => {
    const src = code(read(`${DASH}/HotDealTicker.tsx`));

    it("뼈대는 하나다 — 로딩 · 빈 상태 · 매물이 같은 그림을 같은 자리에 둔다", () => {
        expect(src.match(/<UrgentArt \/>/g)).toHaveLength(3);
        expect(src).toContain('const SHELL = "relative isolate overflow-hidden w-full rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#E85200]');
    });

    it("그림은 카드 안의 맨 뒤, 땅 선이 구분선에 맞는다(바닥에서 40px · 제 높이의 37.8% 내림) — 깃대가 아랫줄의 글자를 가로지르지 않는다", () => {
        const a = fn("UrgentArt");
        expect(a).toContain("absolute -z-10 right-0 bottom-[40px] aspect-square w-[59%] max-w-[250px] translate-y-[37.8%]");
        // 왼쪽(값 · 설명이 놓이는 곳)은 지운다
        expect(a).toContain('fade("linear-gradient(to right, transparent 0%, #000 46%)")');
    });
});

describe("전국 골프장 카드", () => {
    it("그림은 지도가 시작하는 곳에서 끝난다 — 상자의 오른쪽 끝이 지도 폭(62% · 최대 205)에 묶여 있다", () => {
        const a = fn("CoursesArt");
        expect(a).toContain('right: "calc(min(62%, 205px) - 16px)"');
        expect(a).toContain("overflow-hidden");
        const card = code(read("client/src/golf/components/course/list/CourseHomeEntry.tsx"));
        // 지도의 폭이 바뀌면 그림 상자도 같이 바꿔야 한다
        expect(card).toContain('w-[62%] max-w-[205px]');
        // 그림 → 지도 → 글 순서로 쌓인다
        expect(card.indexOf("<CoursesArt />")).toBeGreaterThan(card.indexOf('aria-label="전국 골프장 보기"'));
        expect(card.indexOf("<CoursesArt />")).toBeLessThan(card.indexOf("<CourseDotMap"));
    });

    it("늦게 받기(lazy)를 붙이지 않는다 — 폭 0 인 그림이 상자 밖에 놓여 끝내 받지 않았다. 크기도 적어 둔다", () => {
        const a = fn("CoursesArt");
        expect(a).not.toContain("loading=");
        expect(a).toContain("width={640} height={1000}");
        // 해가 제목 · 한 줄 설명 아래로 오게 44px 내려 놓는다
        expect(a).toContain("top-[44px] h-[384px]");
    });

    it("숫자 줄은 그림 위에서도 읽힌다 — 짙은 유리 바탕", () => {
        const card = code(read("client/src/golf/components/course/list/CourseHomeEntry.tsx"));
        expect(card).toContain("bg-[#120803BF] ring-1 ring-inset ring-[#FFFFFF24] backdrop-blur-[6px]");
    });
});
