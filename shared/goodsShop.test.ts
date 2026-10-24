/**
 * 마스코트 · 굿즈샵 출시 알림(2026-10-24 오너: "이 그림 우리 굿즈로 · 큐 케이스 어디 작게 · 나중에 굿즈샵 실물 판매" → "추천대로 순서대로").
 * ① 큐 케이스 가죽 뚜껑의 금박 패치 ② 맨 아래 '랭큐 굿즈 곧 나와요' + 출시 알림 신청.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { GOODS_SHOP_ITEMS, cleanShopItems } from "./goodsShop";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("품목", () => {
    it("오너가 말한 옷 · 큐 · 큐 케이스가 들어 있고, 이름은 다섯 언어", () => {
        const ids = GOODS_SHOP_ITEMS.map((x) => x.id);
        for (const id of ["cap", "apparel", "cue", "cue-case"]) expect(ids).toContain(id);
        for (const x of GOODS_SHOP_ITEMS) for (const l of ["ko", "en", "es", "vi", "tr"] as const) expect(x.name[l].length, `${x.id} ${l}`).toBeGreaterThan(0);
    });
    it("고른 것 검사 — 아는 것만 · 겹치지 않게 · 목록 차례로, 모양이 틀리면 null, 빈 목록은 거두기", () => {
        expect(cleanShopItems(["cue-case", "cap", "nope", "cap"])).toEqual(["cap", "cue-case"]);
        expect(cleanShopItems([])).toEqual([]);
        expect(cleanShopItems("cap")).toBeNull();
        expect(cleanShopItems([1, 2])).toBeNull();
        expect(cleanShopItems(Array.from({ length: 40 }, () => "cap"))).toBeNull();
    });
});

describe("연결", () => {
    it("그림 둘 — 금박 패치 · 색 흉상(운동화 위에서 자른 것), 가볍다", () => {
        for (const p of ["client/public/billiards/case/mascot-foil.webp", "client/public/billiards/goods/mascot-bust.webp"]) {
            const b = readFileSync(resolve(root, p));
            expect(b.subarray(8, 12).toString("ascii"), p).toBe("WEBP");
            expect(statSync(resolve(root, p)).size, p).toBeLessThan(80 * 1024);
        }
    });
    it("저장 — 더하기만 · 로그인한 사람만 · 탈퇴하면 지운다 · 어드민에 품목별 수", () => {
        const m = read("migrations/goods_shop_interest.sql");
        expect(m).toContain("create table if not exists goods_shop_interest");
        expect(m.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")).not.toMatch(/\bdrop\b|\bdelete\s+from\b|\bupdate\s+\w+\s+set\b/i);
        const r = read("server/routes/modules/goodsShop.ts");
        expect(r).toContain('router.get("/goods-shop/me", requireAuth,');
        expect(r).toContain('router.post("/goods-shop/interest", requireAuth,');
        expect(read("server/routes/index.ts")).toContain('router.use("/", goodsShopRouter);');
        expect(read("server/storage/withdrawPurge.ts")).toContain('await run("goods_shop_interest", sql`delete from goods_shop_interest where member_id = ${memberId}::uuid returning member_id`);');
        expect(read("server/routes/modules/adminGoods.ts")).toContain('router.get("/shop-interest", asyncHandler(');
        expect(read("client/src/pages/admin/GoodsView.tsx")).toContain("<ShopInterestPanel />");
    });
    it("큐 케이스 — 뚜껑의 패치를 누르면 굿즈 칸으로, 맨 아래 굿즈 칸(비회원은 가입 안내)", () => {
        const page = read("client/src/pages/hiq/cue-case.tsx");
        expect(page).toContain('data-testid="cue-case-patch"');
        expect(page).toContain("document.getElementById(GOODS_TEASER_ID)?.scrollIntoView(");
        expect(page).toContain("<GoodsTeaser l={l} signedIn={!!member} onGuest={() => gate.guard(() => undefined)} />");
        const teaser = read("client/src/components/hiq/cueCase/GoodsTeaser.tsx");
        expect(teaser).toContain("if (!signedIn) return onGuest();");
        for (const l of ["ko", "en", "es", "vi", "tr"]) {
            const f = read(`client/src/lib/i18n/${l}.ts`);
            for (const k of ["shop.title", "shop.desc", "shop.notify", "shop.saved", "shop.update", "shop.cancel", "shop.pickOne", "shop.waiting", "shop.patch", "shop.failed"]) expect(f, `${l} ${k}`).toContain(`"${k}":`);
        }
    });
    it("굿즈 증정 — 받을 회원이 오너/관리자인지 · 앱 계정인지 보이고, 앱에서 연 적 없는 계정이면 경고(오너 '선물이 안 오네' 10/24)", () => {
        const v = read("client/src/pages/admin/GoodsView.tsx");
        expect(v).toContain("<AccountChips m={m} />");
        expect(v).toContain('data-testid="admin-goods-no-app"');
    });
    it("선물 언박싱 — 공 · 초크 · 장갑(정사각)은 네모 자리에, 큐 · 상대만 긴 홈에", () => {
        expect(read("client/src/pages/hiq/gift.tsx")).toContain('{g.shape === "cue" ? (');
    });
});
