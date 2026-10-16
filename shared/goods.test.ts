import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { GOODS_SPORTS, goodsCatalog, goodsCollectionUrl, goodsItem } from "./goods";
import { HIKING_THEME_BOOKS } from "./goodsGolfHiking";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("굿즈 증정 목록(2026-10-16)", () => {
    it("네 종목 — 열쇠는 겹치지 않고 그림 파일이 다 있다", () => {
        const counts: Record<string, number> = {};
        for (const sport of GOODS_SPORTS) {
            const list = goodsCatalog(sport);
            counts[sport] = list.length;
            expect(new Set(list.map((x) => x.key)).size, sport).toBe(list.length);
            for (const x of list) if (x.image) expect(fs.existsSync(`client/public${x.image}`), `${sport} ${x.key} ${x.image}`).toBe(true);
        }
        expect(counts.billiards).toBe(95 + 18 + 17 + 8);
        expect(counts.fishing).toBe(24);
        expect(counts.golf).toBe(9 + 1 + 16 + 5 + 21 + 8 + 3);
        expect(counts.hiking).toBe(16 + 6 + 4 + 2 + 8 + 7);
    });
    it("한정은 그 수를 그대로 · 모르는 열쇠는 null", () => {
        expect(goodsItem("billiards", "cue-lt-inv-jelly")?.limit).toBe(10);
        expect(goodsItem("fishing", "goldanchor")?.limit).toBe(99);
        expect(goodsItem("golf", "book:gangwon")?.name).toBe("강원 볼마커");
        expect(goodsItem("hiking", "grade:summit")?.name).toBe("등급 · 정상");
        expect(goodsItem("golf", "book:nope")).toBeNull();
        expect(goodsItem("billiards", "cue-nope")).toBeNull();
    });
    it("등산 특성 도장첩 이름은 도장첩 쪽 표와 같다", () => {
        const src = read("shared/hikingStamps.ts");
        for (const [id, name] of HIKING_THEME_BOOKS) expect(src).toContain(`["${id}", "${name}"`);
    });
    it("보러 가는 곳", () => {
        expect(goodsCollectionUrl("billiards", "chalk-welcome")).toBe("/cue-case?sec=chalk");
        expect(goodsCollectionUrl("billiards", "cue-first")).toBe("/cue-case");
        expect(goodsCollectionUrl("golf", "pin:first-stamp")).toBe("/golf/shelf");
        expect(goodsCollectionUrl("hiking", "pin:first")).toBe("/hiking/stamps");
        expect(goodsCollectionUrl("fishing", "kelp")).toBe("/fishing/tank");
    });
});

describe("증정 · 회수 · 받은 화면 — 서버", () => {
    it("증정은 한정을 넘지 않고(having) · 이미 가진 것은 넣지 않고 · 번호가 겹치면 다시 센다", () => {
        const g = read("server/storage/goodsGrants.ts");
        expect(g.match(/having coalesce\(max\(serial\), 0\) < \$\{cap\}/g)?.length).toBe(3);
        expect(g).toContain('if (have) return { ok: false, reason: "have" };');
        expect(g).toContain('if (code(e) === "23505" && attempt < 4) continue;');
    });
    it("회수는 증정 기록으로만(증정한 줄만) · 회수한 기록은 남긴다", () => {
        const g = read("server/storage/goodsGrants.ts");
        expect(g).toContain("select member_id, sport, item, revoked_at from hiq_goods_grants where id = ${o.grantId}::uuid");
        expect(g).toContain("update hiq_goods_grants set revoked_at = now()");
        expect(read("migrations/goods_grants.sql").split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")).not.toMatch(/\b(drop|delete|truncate|update)\b/i);
    });
    it("어드민 길은 가드 뒤 · 받은 화면은 본인 것만(회수한 것은 없다) · 까닭은 내보내지 않는다", () => {
        expect(read("server/routes/modules/adminGoods.ts")).toContain("router.use(checkSuperAdmin);");
        const gift = read("server/routes/modules/gifts.ts");
        expect(gift).toContain("and member_id = ${req.userId!}::uuid and revoked_at is null");
        expect(gift).toContain("select sport, item, serial, message, created_at from hiq_goods_grants");
    });
    it("밤에는 기기를 울리지 않는다", () => {
        expect(read("server/routes/modules/adminGoods.ts")).toContain("if (isGolfQuietHour(Date.now())) await storage.createNotification(");
    });
});

describe("증정 받은 것이 화면에 '받음'으로(골프 · 등산은 도장으로 다시 계산하던 곳)", () => {
    it("골프 — 볼마커 · 누구나 36 · 트로피 · 블랙/자개 · 시즌 태그", () => {
        const col = read("client/src/golf/stamps/useStampCollection.ts");
        expect(col).toContain('const states = raw.map((s) => (!s.done && awards.of("book", s.book.id) ? { ...s, done: true } : s));');
        expect(col).toContain('const allOpenDone = sum.allOpenDone || !!awards.of("all", STAMP_ALL_OPEN);');
        expect(read("client/src/golf/stamps/StampParts.tsx")).toContain("const earned = stamped >= t.at || !!granted?.(t.at);");
        const depth = read("client/src/golf/stamps/useStampDepth.ts");
        expect(depth).toContain('for (const a of awards.list) if ((a.kind === "pearl" || a.kind === "black")');
        expect(depth).toContain('const granted = SEASON_TAG_TIERS.filter((x) => !!awards.of("tag", seasonTagKey(t.year, x.id)));');
    });
    it("등산 — 와펜 · 큰 와펜 · 등급", () => {
        const h = read("client/src/hiking/stamps/useHikingStamps.ts");
        expect(h).toContain('computed.map((st) => (!st.done && aw.has(hikingAwardId("patch", st.book.id)) ? { ...st, done: true } : st))');
        expect(h).toContain('aw.has(hikingAwardId("grade", g.id))');
        expect(read("client/src/hiking/pages/StampShelf.tsx")).toContain('const all = books.every((b) => b.done) || (!!grand && !!s.award("grand", grand.id));');
    });
});

describe("선물 도착 화면 2차(2026-10-16 오너: '디자인을 더 완벽하게')", () => {
    it("포장 → 열기 → 종목의 진열 · 동작 줄이기면 처음부터 열린 모습", () => {
        const g = read("client/src/pages/hiq/gift.tsx");
        expect(g).toContain('const [stage, setStage] = useState<"wrapped" | "opening" | "open">(still ? "open" : "wrapped");');
        for (const sport of ["billiards", "golf", "hiking", "fishing"]) expect(g).toContain(`${sport}: {`);
        expect(g).toContain('data-testid="gift-wrapped"');
        expect(read("client/src/index.css")).toContain(".gift-wrap-opening .gift-lid { animation: gift-lid-off");
    });
});
