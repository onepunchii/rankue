/**
 * 당구대 로고 · 광고(2026-10-24 오너: "이 로고를 투명도 있게 온라인게임 당구대에 · 어드민에서 교체해서 광고" → "니 추천대로").
 */
import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_BRAND_IMAGE, brandLive, cleanBrandInput, isBrandImage, parseBrandView, pickBrands, type TableBrandRow } from "./tableBrand";
import { brandRects } from "../client/src/sim/render/tableBrandArt";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 24, 6);
const row = (o: Partial<TableBrandRow>): TableBrandRow => ({
    id: "x", title: "t", image: DEFAULT_BRAND_IMAGE, opacity: 0.16, scale: 0.6, place: "center", tone: "original", sponsor: null,
    tables: ["DAEDAE", "JUNGDAE_KR"], startsAt: null, endsAt: null, enabled: true, createdAt: NOW - 100 * H, updatedAt: NOW - 100 * H, ...o,
});
const BLOB = "https://abc123.public.blob.vercel-storage.com/hiq/table-brand/b-0011223344556677.png";

describe("지금 걸 것(pickBrands)", () => {
    const base = row({ id: "default", title: "랭큐 기본" });
    it("아무 캠페인이 없으면 랭큐 기본, 줄이 하나도 없으면 로고 없음", () => {
        expect(pickBrands([base], NOW).DAEDAE?.id).toBe("default");
        expect(pickBrands([], NOW)).toEqual({ DAEDAE: null, JUNGDAE_KR: null });
    });
    it("기간 있는 협찬이 기본보다 먼저 — 고른 테이블에만, 다른 테이블은 기본", () => {
        const sp = row({ id: "sp", image: BLOB, sponsor: "○○큐", tables: ["DAEDAE"], startsAt: NOW - H, endsAt: NOW + 24 * H });
        const p = pickBrands([base, sp], NOW);
        expect(p.DAEDAE).toMatchObject({ id: "sp", sponsor: "○○큐", image: BLOB });
        expect(p.JUNGDAE_KR?.id).toBe("default");
    });
    it("끝난 · 아직인 · 꺼진 캠페인은 안 걸린다(끝은 그 시각 전까지)", () => {
        const ended = row({ id: "ended", startsAt: NOW - 48 * H, endsAt: NOW });
        const future = row({ id: "future", startsAt: NOW + H });
        const off = row({ id: "off", startsAt: NOW - H, enabled: false });
        expect(pickBrands([base, ended, future, off], NOW).DAEDAE?.id).toBe("default");
        expect(brandLive(ended, NOW - 1)).toBe(true);
    });
    it("겹치면 시작이 늦은 것, 같으면 나중에 만든 것", () => {
        const a = row({ id: "a", startsAt: NOW - 10 * H, createdAt: NOW - 20 * H });
        const b = row({ id: "b", startsAt: NOW - 2 * H, createdAt: NOW - 30 * H });
        const c = row({ id: "c", startsAt: NOW - 2 * H, createdAt: NOW - 5 * H });
        expect(pickBrands([a, b, c, base], NOW).DAEDAE?.id).toBe("c");
    });
});

describe("값 검사", () => {
    it("그림은 우리 정적 로고나 우리 저장소의 table-brand PNG 만", () => {
        expect(isBrandImage(DEFAULT_BRAND_IMAGE)).toBe(true);
        expect(isBrandImage(BLOB)).toBe(true);
        expect(isBrandImage("https://evil.example.com/a.png")).toBe(false);
        expect(isBrandImage("https://abc.public.blob.vercel-storage.com/hiq/golf-logo/g-1.png")).toBe(false);
        expect(isBrandImage("/billiards/table/../x.png")).toBe(false);
    });
    it("만들 때는 이름 · 그림이 있어야, 숫자는 범위로 자르고, 기간 순서를 본다", () => {
        expect(cleanBrandInput({ image: DEFAULT_BRAND_IMAGE }, false).ok).toBe(false);
        const ok = cleanBrandInput({ title: " 협찬 ", image: BLOB, opacity: 0.9, scale: 0.05, tables: ["DAEDAE", "DAEDAE"], sponsor: " ○○큐 " }, false);
        expect(ok).toEqual({ ok: true, value: { title: "협찬", image: BLOB, opacity: 0.5, scale: 0.2, tables: ["DAEDAE"], sponsor: "○○큐" } });
        expect(cleanBrandInput({ startsAt: NOW, endsAt: NOW - 1 }, true).ok).toBe(false);
        expect(cleanBrandInput({ tables: [] }, true).ok).toBe(false);
        expect(cleanBrandInput({ place: "corner" }, true).ok).toBe(false);
    });
    it("화면이 받는 값은 다시 자른다 — 모양이 틀리면 로고를 안 그린다", () => {
        expect(parseBrandView({ id: "a", image: DEFAULT_BRAND_IMAGE, opacity: 3, scale: -1, place: "x", tone: "x" })).toEqual({ id: "a", image: DEFAULT_BRAND_IMAGE, opacity: 0.5, scale: 0.2, place: "center", tone: "original", sponsor: null });
        expect(parseBrandView({ id: "a", image: "https://evil.example.com/a.png" })).toBeNull();
        expect(parseBrandView(null)).toBeNull();
    });
});

describe("자리(brandRects)", () => {
    const t = { width: 1.422, length: 2.844 };
    it("가운데 하나 — 폭은 테이블 폭 × 크기, 세로는 그림 비율대로", () => {
        const [r] = brandRects(t, { scale: 0.6, place: "center" }, 2);
        expect(r).toMatchObject({ cx: 0.711, cy: 1.422, rot: 0 });
        expect(r.w).toBeCloseTo(0.8532, 4);
        expect(r.h).toBeCloseTo(0.4266, 4);
    });
    it("양 끝 둘 — 작게, 풋 쪽은 반 바퀴 돌려 그쪽에서 읽히게, 스팟(¼ · ¾) 바깥", () => {
        const rs = brandRects(t, { scale: 0.6, place: "ends" }, 2);
        expect(rs).toHaveLength(2);
        expect(rs[1].rot).toBeCloseTo(Math.PI);
        expect(rs[0].cy + rs[0].h / 2).toBeLessThan(t.length / 4);
        expect(rs[1].cy - rs[1].h / 2).toBeGreaterThan((t.length * 3) / 4);
    });
});

describe("연결", () => {
    it("기본 로고 — 투명 바탕 webp, 가볍다", () => {
        const p = resolve(root, "client/public", DEFAULT_BRAND_IMAGE.slice(1));
        const b = readFileSync(p);
        expect(b.subarray(8, 12).toString("ascii")).toBe("WEBP");
        expect(b.subarray(12, 16).toString("ascii")).toBe("VP8X"); // 알파가 있는 webp
        expect(statSync(p).size).toBeLessThan(200 * 1024);
    });
    it("저장 — 더하기만(표 하나 + 기본 한 줄은 없을 때만)", () => {
        const m = read("migrations/sim_table_brands.sql");
        expect(m).toContain("create table if not exists sim_table_brands");
        expect(m).toContain("where not exists (select 1 from sim_table_brands)");
        expect(m.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")).not.toMatch(/\bdrop\b|\bdelete\s+from\b|\bupdate\s+\w+\s+set\b|\btruncate\b/i);
    });
    it("게임이 묻는 길 — 로그인 없이 · CDN 30초(길면 고친 것이 안 보인다 — 오너 제보), 관리자 길은 슈퍼관리자(adminBilliards 안)", () => {
        const sim = read("server/routes/modules/simMatch.ts");
        expect(sim).toContain('router.get("/sim/table-brand", asyncHandler(');
        expect(sim).toContain('res.set("CDN-Cache-Control", "public, s-maxage=30, stale-while-revalidate=30");');
        const adm = read("server/routes/modules/adminBilliards.ts");
        expect(adm.indexOf('router.use("/table-brands", tableBrandRouter);')).toBeGreaterThan(adm.indexOf("router.use(checkSuperAdmin);"));
        expect(read("server/routes/modules/adminTableBrand.ts")).toContain("const clean = stripImageMetadata(");
    });
    it("렌더러 둘 · 화면 둘 — 지금 렌더러에 루프가 건다(3D 로 바뀌어도), 협찬이면 '○○ 협찬'", () => {
        expect(read("client/src/sim/render/ThreeRenderer.ts")).toContain("this.applyBrand();");
        expect(read("client/src/sim/render/Canvas2DRenderer.ts")).toContain("this.drawBrand(ctx, L);");
        for (const f of ["client/src/sim/SimulatorPage.tsx", "client/src/sim/watch/WatchPage.tsx"]) {
            const s = read(f);
            expect(s, f).toContain("setBrand?.(brandRef.current)");
            expect(s, f).toContain('t("sim.brand.sponsor")');
        }
        // 다른 출처(저장소) 그림은 crossOrigin 으로 — 안 그러면 3D 질감이 SecurityError
        expect(read("client/src/sim/render/tableBrandArt.ts")).toContain('img.crossOrigin = "anonymous"');
    });
    it("어드민 '당구대 광고' 탭", () => {
        const d = read("client/src/pages/admin/dashboard.tsx");
        expect(d).toContain('{ id: "billiards-table-brand", label: "당구대 광고", icon: LucideMegaphone }');
        expect(d).toContain('{tab === "billiards-table-brand" && <BilliardsTableBrandView />}');
    });
});
