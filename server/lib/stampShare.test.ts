import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { STAMP_SHARE_TTL_SEC, signStampShare, stampCardPath, verifyStampShare } from "./stampShare";
import { signFootprintShare } from "./footprintShare";
import { STAMP_BOOKS } from "../../shared/golfStampBooks";
import { chipSize, fitText, kstDot } from "../services/golfStampCard";

/**
 * 도장첩 완성 카드(2026-10-12) — 서명된 주소로만 열리는 개인 카드. 그림은 내 기계에서 그려 눈으로 봤다(네 권).
 * 여기는 ① 주소의 서명 ② 카드가 열리는 조건(본인 · 다 채운 권 · 서명) ③ 서버 전체를 죽였던 길(정적 임포트 · 빠진 자산)을 묶는다.
 */
const A = "00000000-0000-4000-8000-0000000000a1", B = "00000000-0000-4000-8000-0000000000b2";
const NOW = 1_800_000_000;
const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

describe("주소의 서명", () => {
    const old = process.env.COOKIE_SECRET;
    beforeEach(() => { process.env.COOKIE_SECRET = "test-secret-for-stamp-share"; });
    afterEach(() => { if (old === undefined) delete process.env.COOKIE_SECRET; else process.env.COOKIE_SECRET = old; });

    it("서명한 주소는 그 회원 · 그 권 · 30일 안에서만 열린다", () => {
        const s = signStampShare(A, "gangwon", NOW)!;
        expect(s.exp).toBe(NOW + STAMP_SHARE_TTL_SEC);
        expect(verifyStampShare(A, "gangwon", s.token, NOW)).toBe(true);
        expect(verifyStampShare(A, "gangwon", s.token, NOW + STAMP_SHARE_TTL_SEC)).toBe(true);
        expect(verifyStampShare(A, "gangwon", s.token, NOW + STAMP_SHARE_TTL_SEC + 1)).toBe(false);
        // 다른 회원 · 다른 권으로는 안 열린다
        expect(verifyStampShare(B, "gangwon", s.token, NOW)).toBe(false);
        expect(verifyStampShare(A, "seohae", s.token, NOW)).toBe(false);
    });

    it("고친 주소 · 모양이 틀린 값은 전부 거절한다", () => {
        const s = signStampShare(A, "gangwon", NOW)!;
        const [exp, sig] = s.token.split(".");
        const flipped = `${exp}.${sig.slice(0, -1)}${sig.endsWith("A") ? "B" : "A"}`;
        // 만료를 늘려 적으면 서명이 안 맞는다
        const later = `${(parseInt(exp, 36) + 86_400).toString(36)}.${sig}`;
        for (const t of [flipped, later, "", "x", `${exp}.`, `${exp}.${sig}x`, null, undefined, 123, ["a"], "a".repeat(200)]) expect(verifyStampShare(A, "gangwon", t, NOW), String(t)).toBe(false);
        expect(verifyStampShare("not-a-uuid", "gangwon", s.token, NOW)).toBe(false);
        expect(verifyStampShare(A, "../etc", s.token, NOW)).toBe(false);
        expect(signStampShare("not-a-uuid", "gangwon", NOW)).toBeNull();
        expect(signStampShare(A, "GANGWON", NOW)).toBeNull();
    });

    it("비밀이 없으면 만들지도 열지도 않는다 — 빈 열쇠로 서명하지 않는다", () => {
        const s = signStampShare(A, "gangwon", NOW)!;
        delete process.env.COOKIE_SECRET;
        expect(signStampShare(A, "gangwon", NOW)).toBeNull();
        expect(verifyStampShare(A, "gangwon", s.token, NOW)).toBe(false);
    });

    it("발자국 카드의 서명과 열쇠가 다르다 — 한쪽의 주소가 다른 쪽을 열지 못한다", () => {
        const stamp = signStampShare(A, "gangwon", NOW)!;
        const foot = signFootprintShare(A, null, NOW)!;
        expect(stamp.token.split(".")[1]).not.toBe(foot.token.split(".")[1]);
        expect(verifyStampShare(A, "gangwon", foot.token, NOW)).toBe(false);
        const src = code(read("server/lib/stampShare.ts"));
        expect(src).toContain('update("rankue:golf-stamp-card:v1")');
        expect(src).toContain("timingSafeEqual(want, got)");
    });

    it("주소의 모양 — 도장첩 목록의 이름표는 전부 서명할 수 있다", () => {
        const s = signStampShare(A, "invite-capital", NOW)!;
        expect(stampCardPath(A, "invite-capital", s.token)).toBe(`/og/golf-stamp/${A}/invite-capital.png?t=${encodeURIComponent(s.token)}`);
        for (const b of STAMP_BOOKS) expect(signStampShare(A, b.id, NOW), b.id).not.toBeNull();
    });
});

describe("카드가 열리는 조건", () => {
    const og = code(read("server/ogImage.ts"));
    const route = og.slice(og.indexOf('app.get("/og/golf-stamp/:memberId/:book.png"'), og.indexOf('app.get("/og/pba-player/:memCode.png"'));
    const build = og.slice(og.indexOf("export async function buildGolfStampCard("), og.indexOf("export async function buildGolfFootprintsCard("));

    it("서명을 먼저 본다 — 틀리면 아무것도 읽지 않고 404(있는지 없는지도 알리지 않는다)", () => {
        const check = route.indexOf("if (!verifyStampShare(memberId, bookId, req.query.t)) return notFound();");
        expect(check).toBeGreaterThan(0);
        expect(check).toBeLessThan(route.indexOf("buildGolfStampCard(memberId, bookId)"));
        expect(route).toContain('res.status(404).setHeader("Cache-Control", "no-store")');
    });

    it("본인 기기에만 캐시하고 검색엔진에 싣지 않는다", () => {
        expect(route).toContain('res.setHeader("Cache-Control", "private, max-age=600");');
        expect(route).toContain('res.setHeader("X-Robots-Tag", "noindex, nofollow, noimageindex");');
        expect(route).toContain('res.setHeader("Referrer-Policy", "no-referrer");');
        expect(route).not.toContain("Access-Control-Allow-Origin");
    });

    it("다 채운 권만 · 인증 도장으로 센다 · 탈퇴한 회원의 카드는 닫는다 · 순번은 받은 기록에 있을 때만", () => {
        expect(build).toContain("if (!state || !state.done) return null;");
        expect(build).toContain("storage.getGolfPassportStats(memberId)");
        expect(build).toContain("bookStates((stats?.stamps ?? [])");
        expect(build).not.toContain("recordStamps");
        expect(build).toContain('if (!m || m.phone?.startsWith("del-")) return null;');
        expect(build).toContain("serial: award?.serial ?? null,");
    });

    it("주소를 만들어 주는 곳 — 로그인한 본인의, 다 채운 권만. 저장하지 않고 캐시하지 않는다", () => {
        const api = code(read("server/routes/modules/golf.ts"));
        const at = api.indexOf('router.get("/stamp-share", requireAuth,');
        expect(at).toBeGreaterThan(0);
        const fn = api.slice(at, api.indexOf("}));", at));
        expect(fn).toContain("storage.getGolfPassportStats(req.userId!)");
        expect(fn).toContain('if (!state?.done) return sendError(res, 404, "다 채운 도장첩만 카드로 만들 수 있어요");');
        expect(fn).toContain("signStampShare(req.userId!, book.id)");
        expect(fn).toContain('res.setHeader("Cache-Control", "no-store");');
        // 남의 번호를 받지 않는다
        expect(fn).not.toMatch(/req\.(params|body)/);
        expect(fn).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    });

    it("화면 — 내가 다 채운 권에서만 단추와 시트가 있다(예시 · 채우는 중에는 없다). 서명 주소를 저장 캐시에 두지 않는다", () => {
        const page = code(read("client/src/golf/pages/StampBook.tsx"));
        expect(page).toContain("{done && !col.sample && <StampShareSheet open={share} onClose={() => setShare(false)} bookId={book.id} bookName={book.name} />}");
        expect(page.match(/\{done && !col\.sample && \(/g)!.length).toBe(1);
        expect(page).toContain('data-testid="stamp-share"');
        const sheet = code(read("client/src/golf/stamps/StampShareSheet.tsx"));
        expect(sheet).toContain("apiRequest(`/api/hiq/golf/stamp-share?book=${encodeURIComponent(bookId)}`)");
        expect(sheet).not.toMatch(/useQuery|localStorage/);
    });
});

describe("서버 전체를 죽였던 길을 다시 밟지 않는다", () => {
    const card = read("server/services/golfStampCard.ts");

    it("그림 엔진을 정적으로 임포트하지 않는다 — 선수 카드의 지연 로드(engines)를 쓴다", () => {
        expect(card).not.toMatch(/^import .*["'](satori|@resvg\/resvg-js)["']/m);
        expect(card).toContain('import { engines, fonts, CARD_SIZE } from "./playerCard.js";');
        expect(card).toContain("const { satori, Resvg } = await engines();");
    });

    it("카드에 쓰는 그림이 권마다 다 있고(표지 jpg · 볼마커 png) 배포 묶음에 실린다", () => {
        for (const b of STAMP_BOOKS) {
            expect(existsSync(resolve(root, `server/assets/golf-stamp/cover-${b.id}.jpg`)), `cover-${b.id}`).toBe(true);
            expect(existsSync(resolve(root, `server/assets/golf-stamp/marker-${b.id}.png`)), `marker-${b.id}`).toBe(true);
        }
        expect(read("vercel.json")).toContain('"server/assets/**"');
        // 그림 파일 이름은 도장첩 목록의 이름표로만 만든다(주소에서 온 글자를 그대로 쓰지 않는다)
        const og = code(read("server/ogImage.ts"));
        expect(og).toContain("const book = stampBook(bookId);\n  if (!book) return null;");
    });

    it("글자 다듬기 — 긴 이름은 줄이고, 칸이 많은 권은 이름표를 작게, 날짜는 한국 날짜", () => {
        expect(fitText("아주긴닉네임을쓰는사람입니다", 9)).toBe("아주긴닉네임을쓰는…");
        expect(fitText("버디헌터", 9)).toBe("버디헌터");
        expect([chipSize(4), chipSize(8), chipSize(11)]).toEqual([40, 34, 28]);
        // UTC 10/11 16:00 = 한국 10/12 01:00
        expect(kstDot(Date.UTC(2026, 9, 11, 16, 0))).toBe("2026.10.12");
    });
});
