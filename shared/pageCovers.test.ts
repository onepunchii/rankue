import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_COVERS, PBA_COVER, STORES_COVER, STORE_COVERS, STORE_THRONE, NOT_FOUND_ART, coverSrc, golferCover, storeCover, umbCover } from "./pageCovers";
import { HUB_CARD_NAMES, HUB_CARD_SIZE, HUB_CARD_VERSION, HUB_STAMP_BOOKS, hubCard, hubCardName } from "./ogCards";
import { STAMP_BOOKS } from "./golfStampBooks";
import { GOLF_TOURS } from "./golfTours";

/**
 * 선수 · 매장 페이지의 표지 그림과 허브 페이지의 썸네일(2026-10-12 오너: "골프 플레이어 페이지나 당구 플레이어 페이지에 이미지 넣을 만한 거 넣어서
 * 시각적으로 좋게 하고 유입을 극대화도 추가 … 매장 등 조금 아쉬운 부분을 이미지 제작해서 더 시각적으로 풍부하고 디자인 업그레이드").
 * 화면은 갈무리로 확인했다(선수 세 종류 · 투어 넷 · 매장 그림 넷 · 360 폭 · 넓은 화면). 여기는 그림이 다 있는지와 어느 페이지에 어느 그림인지를 묶는다.
 */
const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const pub = (p: string) => resolve(root, "client/public", p.replace(/^\//, ""));

describe("표지 그림", () => {
    it("쓰는 그림이 다 있고 가볍다 — 폴더에 남는 파일이 없다", () => {
        const files = readdirSync(pub("/covers")).filter((f) => !f.startsWith(".")).sort();
        // 표지 12장 + 매장 '명예의 전당'의 빈 왕관 한 장 + 없는 주소(404)의 이정표 한 장
        expect(files).toEqual([...ALL_COVERS, "store-throne", "not-found"].map((n) => `${n}.webp`).sort());
        expect(STORE_THRONE).toBe("/covers/store-throne.webp");
        expect(NOT_FOUND_ART).toBe("/covers/not-found.webp");
        expect(statSync(pub(NOT_FOUND_ART)).size).toBeLessThan(100_000);
        for (const n of ALL_COVERS) expect(statSync(pub(coverSrc(n))).size, n).toBeLessThan(100_000);
        expect(ALL_COVERS).toHaveLength(12);
    });

    it("당구 세계랭킹 선수 — 부문마다 한 장. 모르는 부문은 남자 부문 그림", () => {
        expect([umbCover("players"), umbCover("ladies"), umbCover("juniors")]).toEqual(["/covers/umb-players.webp", "/covers/umb-ladies.webp", "/covers/umb-juniors.webp"]);
        expect(umbCover("nope")).toBe(umbCover("players"));
        expect(umbCover(null)).toBe(umbCover("players"));
        expect(PBA_COVER).toBe("/covers/pba.webp");
    });

    it("골프 선수 — 투어마다 한 장. 투어가 늘면 그림도 정해야 한다", () => {
        const covers = GOLF_TOURS.map((t) => golferCover(t));
        expect(new Set(covers).size).toBe(GOLF_TOURS.length);
        for (const c of covers) expect(existsSync(pub(c)), c).toBe(true);
        expect(golferCover("nope")).toBe(golferCover("owgr"));
    });

    it("매장 — 네 장을 코드로 나눠 쓴다. 같은 매장은 늘 같은 그림, 잇닿은 번호는 다른 그림", () => {
        expect(STORE_COVERS).toHaveLength(4);
        expect(storeCover("C00007")).toBe(storeCover("C00007"));
        const run = ["C00007", "C00008", "C00009", "C00010"].map((c) => storeCover(c));
        expect(new Set(run).size).toBe(4);
        for (let i = 1; i < 60; i++) expect(storeCover(`C${String(i).padStart(5, "0")}`)).not.toBe(storeCover(`C${String(i + 1).padStart(5, "0")}`));
        // 숫자가 없는 코드 · 빈 값도 네 장 가운데 하나
        for (const c of ["", "abc", null, undefined, "매장"]) expect(STORE_COVERS.map(coverSrc)).toContain(storeCover(c as string));
        expect(STORE_COVERS.map(coverSrc)).toContain(STORES_COVER);
    });
});

describe("표지를 얹는 화면", () => {
    it("장식이다 — 읽어 주지 않는다(alt 없음 · aria-hidden). 그 선수 · 그 매장의 사진이라고 말하지 않는다", () => {
        const cover = code(read("client/src/components/hiq/PageCover.tsx"));
        expect(cover).toContain('<img src={src} alt="" aria-hidden');
        for (const p of ["client/src/pages/store-listing.tsx", "client/src/pages/stores.tsx"]) {
            const s = code(read(p));
            expect(s, p).toMatch(/<img src=\{(storeCover\(s\.code\)|STORES_COVER)\} alt="" aria-hidden/);
        }
    });

    it("선수 세 페이지 — 부문 · 투어에 맞는 그림을 고른다. 본문 카드는 그림보다 위에 놓인다", () => {
        expect(code(read("client/src/pages/hiq/world-player.tsx"))).toContain('<PageCover src={umbCover(category)} className="-mx-5 -mt-6">');
        expect(code(read("client/src/pages/hiq/golfer.tsx"))).toContain('<PageCover src={golferCover(tour)} className="-mx-5 -mt-6">');
        const pba = code(read("client/src/pages/hiq/pba-player.tsx"));
        expect(pba).toContain("<PageCover src={PBA_COVER}");
        // 그림(relative)이 뒤따르는 카드를 덮지 않게 카드도 자리를 잡는다
        expect(pba).toContain('<Card className="pt-5 relative z-10">');
        // 골프 화면은 테마가 흰색 · 검정 유틸을 바꿔 끼운다 — 그림 위의 글씨는 리터럴 색
        expect(code(read("client/src/pages/hiq/golfer.tsx"))).toContain("text-[#FFFFFF] [text-shadow:");
    });

    it("랭킹 목록 세 곳도 같은 그림을 얇게 단다 — 고른 부문 · 투어의 그림이라 선수 페이지로 넘어가도 이어진다", () => {
        expect(code(read("client/src/pages/hiq/world-ranking.tsx"))).toContain('<PageCover src={umbCover(category)} className="-mx-5 -mt-6 mb-3" height={132} overlap={0} fadeFrom={46}>');
        // PBA 는 그림을 위쪽으로 — 가운데로 두면 제목 밑의 한 줄이 당구대의 금테와 겹친다
        expect(code(read("client/src/pages/hiq/pba.tsx"))).toContain('<PageCover src={PBA_COVER} className="-mx-5 -mt-6 mb-3" height={132} overlap={0} fadeFrom={46} position="50% 6%">');
        expect(code(read("client/src/pages/hiq/golf-ranking.tsx"))).toContain('<PageCover src={golferCover(tour)} className="-mx-5 -mt-6 mb-3" height={132} overlap={0} fadeFrom={46}>');
        // 그림을 아래 탭 줄과 겹치지 않는다(overlap 0) — 겹치면 그림이 탭을 덮는다
        // 제목(h1)은 그대로 한 번
        for (const p of ["world-ranking", "pba", "golf-ranking"]) expect(code(read(`client/src/pages/hiq/${p}.tsx`)).match(/<h1\b/g), p).toHaveLength(1);
    });

    it("매장의 빈 왕좌 — 의자 이모지 대신 우리가 그린 빈 왕관(장식)", () => {
        const s = code(read("client/src/pages/store-listing.tsx"));
        expect(s).toContain('<img src={STORE_THRONE} alt="" aria-hidden');
        expect(s).not.toContain("🪑");
    });

    it("매장 — 이름(h1)이 그림 위에 놓이고, 뒤로 가기는 밝은 그림 위에서도 읽히게 어두운 알약에 담는다", () => {
        const s = code(read("client/src/pages/store-listing.tsx"));
        const hero = s.slice(s.indexOf('data-testid="store-cover"'), s.indexOf("</header>", s.indexOf('data-testid="store-cover"')));
        expect(hero).toContain('<h1 className="text-[26px] font-bold tracking-tight text-[#FFFFFF]">{s.name}</h1>');
        expect(hero).toContain("rounded-full bg-[#00000059] backdrop-blur-[6px]");
        expect(s.match(/<h1\b/g)).toHaveLength(1);
    });
});

describe("허브 페이지의 썸네일", () => {
    it("쓰는 카드가 다 있다(1200 정사각 JPEG) — 폴더에 남는 파일이 없다", () => {
        const files = readdirSync(pub("/og-hub")).filter((f) => !f.startsWith(".")).sort();
        expect(files).toEqual([...HUB_CARD_NAMES].map((n) => `${n}.jpg`).sort());
        for (const n of HUB_CARD_NAMES) expect(statSync(pub(`/og-hub/${n}.jpg`)).size, n).toBeLessThan(260_000);
        // 도장첩 카드는 도장첩 목록과 같은 권이다
        expect([...HUB_STAMP_BOOKS]).toEqual(STAMP_BOOKS.map((b) => b.id));
    });

    it("어느 주소에 어느 카드인가", () => {
        const cases: [string, string | null][] = [
            ["/world-ranking", "world-ranking"], ["/world-ranking/movers", "world-ranking"], ["/world-ranking/country/KR", "world-ranking"],
            ["/pba", "pba"], ["/pba/records", "pba"], ["/stores", "stores"], ["/stores/", "stores"],
            ["/billiards/terms", "terms"], ["/billiards/terms/%EB%8B%A4%EB%A7%88", "terms"], ["/golf/terms", "golf-terms"], ["/golf/terms/%EB%B2%84%EB%94%94", "golf-terms"],
            ["/golf/courses", "golf-courses"], ["/golf/courses/gangwon", "golf-courses"], ["/golf/courses/gangwon/chuncheon", "golf-courses"],
            ["/golf/stamps", "golf-stamps"], ["/golf/shelf", "golf-stamps"], ["/golf/stamps/gangwon", "golf-stamps-gangwon"], ["/golf/stamps/invite-capital", "golf-stamps-invite-capital"],
            // 없는 권은 도장깨기 카드로
            ["/golf/stamps/nowhere", "golf-stamps"],
        ];
        for (const [path, name] of cases) expect(hubCardName(path), path).toBe(name);
    });

    it("고유 카드가 있는 페이지 · 그 밖의 페이지는 허브 카드를 받지 않는다", () => {
        // /terms 는 이용약관이다(용어 사전이 아니다)
        for (const path of ["/", "/terms", "/stores/C00007", "/stores/register", "/pba-player/M0016551", "/player/players/0364", "/golfer/owgr/18417", "/golf/course/pinx", "/golf-ranking", "/world-rankings", "/pbax", "/dashboard"]) {
            expect(hubCardName(path), path).toBeNull();
            expect(hubCard("https://www.rankue.co.kr", path), path).toBeNull();
        }
    });

    it("주소 — 정적 파일(/og-hub/…)이고 판 번호가 붙는다. /og/… 는 서버 함수로 가는 길이라 쓰지 않는다", () => {
        expect(hubCard("https://www.rankue.co.kr", "/stores?region=seoul")).toEqual({ url: `https://www.rankue.co.kr/og-hub/stores.jpg?v=${HUB_CARD_VERSION}`, width: HUB_CARD_SIZE, height: HUB_CARD_SIZE, alt: "전국 당구장 찾기 — 랭큐" });
        expect(read("vercel.json")).toContain('"/og/(.*)"');
        expect(read("vercel.json")).not.toContain("og-hub");
    });

    it("프리렌더와 화면이 같은 카드를 쓴다 — 고유 카드가 먼저, 골프 공용 그림보다는 허브 카드가 먼저", () => {
        const pre = code(read("server/prerender.ts"));
        expect(pre).toContain("const img = (p.image && p.image.url !== OG_GOLF_IMAGE ? p.image : null) ?? hub ?? p.image ?? null;");
        expect(pre).toContain('<meta property="og:image" content="${esc(img?.url ?? OG_IMAGE)}" />');
        expect(pre).toContain('<meta name="twitter:image" content="${esc(img?.url ?? OG_IMAGE)}" />');
        expect(code(read("client/src/hooks/useSeo.ts"))).toContain("const img = image ?? hubCard(ORIGIN, path)?.url;");
    });
});
