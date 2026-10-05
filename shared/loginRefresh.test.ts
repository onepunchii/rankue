import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 2026-10-05 오너 제보: "로그인했는데 로그인이 안 됐다고 나온다".
 * 비로그인으로 공개 페이지를 보던 사람은 '나 = 없음'이 5분짜리 답으로 캐시에 있다. 로그인에 성공한 화면이 그 답을 버리지 않고
 * 화면만 옮겨서, 돌아간 화면이 비로그인으로 그려졌다. 로그인되는 길은 셋(전화·소셜·가입) — 하나라도 빠지면 같은 증상이 돌아온다.
 */
// 화면 코드의 시험이지만 shared 에 둔다 — vitest 가 client/src 에서는 sim·golf 만 읽는다(vitest.config include)
const src = (p: string) => readFileSync(resolve(__dirname, "../client/src", p), "utf8");

describe("로그인 직후 '나'를 새로 받는다", () => {
    it("공용 함수가 옛 답을 버리고, 다른 답을 낡은 것으로 표시하고, '나'를 먼저 받아 둔다", () => {
        const q = src("lib/queryClient.ts");
        const fn = q.slice(q.indexOf("export async function refreshAfterLogin"), q.indexOf("// 6. Persistence"));
        expect(fn).toContain('removeQueries({ queryKey: ["/api/hiq/me"] })');
        expect(fn).toContain("invalidateQueries()");
        expect(fn).toMatch(/fetchQuery\(\{ queryKey: \["\/api\/hiq\/me"\]/);
    });

    it("전화 로그인 — 기존 회원은 새로 받은 뒤에 화면을 옮긴다", () => {
        const s = src("pages/hiq/landing.tsx");
        const at = s.indexOf("if (!res.isNew) await refreshAfterLogin();");
        expect(at).toBeGreaterThan(0);
        expect(s.indexOf("setLocation(dest)", at)).toBeGreaterThan(at);
    });

    it("이미 로그인된 채 로그인 화면에 오면 — 새로 받고, 보던 곳(redirect)으로 돌려보낸다", () => {
        const s = src("pages/hiq/landing.tsx");
        const block = s.slice(s.indexOf('setAuthState("in")'), s.indexOf('setAuthState("out")'));
        expect(block).toContain("await refreshAfterLogin()");
        expect(block).toContain("setLocation(safeReturnPath(");
        expect(block).toContain('.get("redirect")) ?? "/dashboard"');
    });

    it("소셜 로그인 — 새로 받은 뒤에 화면을 옮긴다", () => {
        const s = src("components/hiq/SocialLogin.tsx");
        const at = s.indexOf("await refreshAfterLogin();");
        expect(at).toBeGreaterThan(0);
        expect(s.indexOf("setLocation(back?.startsWith", at)).toBeGreaterThan(at);
    });

    it("가입 완료 — 환영 화면 동안 새로 받는다", () => {
        const s = src("pages/hiq/register.tsx");
        const done = s.indexOf("setIsCompleted(true)");
        const at = s.indexOf("refreshAfterLogin()", done);
        expect(at).toBeGreaterThan(done);
        expect(s.indexOf('setLocation(back ?? "/dashboard"', at)).toBeGreaterThan(at);
    });
});
