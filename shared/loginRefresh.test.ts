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
        const fn = q.slice(q.indexOf("export async function refreshAfterLogin"), q.indexOf("// 5-1."));
        expect(fn.length).toBeGreaterThan(0);
        expect(fn).toContain('removeQueries({ queryKey: ["/api/hiq/me"] })');
        expect(fn).toContain("invalidateQueries()");
        expect(fn).toMatch(/fetchQuery\(\{ queryKey: \["\/api\/hiq\/me"\]/);
    });

    // 2026-10-05 카카오 로그인 검토: 카카오는 문서를 떠났다가 새 문서에서 로그인이 끝난다. 거기서 '뒤로'를 누르면 떠나기 전 문서가
    // 통째로 되살아나는데(bfcache), 그 문서의 '나 = 없음'은 5분 동안 그대로다 — refreshAfterLogin 은 새 문서의 캐시만 고쳤다.
    it("되살아난 문서(bfcache)는 답을 전부 낡은 것으로 본다 — 처음 뜨는 문서에는 아무 일도 하지 않는다", () => {
        const q = src("lib/queryClient.ts");
        const block = q.slice(q.indexOf("// 5-1."), q.indexOf("// 6. Persistence"));
        expect(block).toContain('window.addEventListener("pageshow", (e) => {');
        expect(block).toContain("if (e.persisted) void queryClient.invalidateQueries();");
        // '나'만이 아니라 전부(비로그인으로 받아 둔 다른 답도 낡았다) — 그리고 persisted 가 아닐 때는 부르지 않는다
        expect(block.match(/invalidateQueries\(/g)).toHaveLength(1);
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
        const all = src("components/hiq/SocialLogin.tsx");
        // 구글·애플의 길(submitToken)만 떼어 본다 — 같은 파일에 카카오에서 돌아온 길(아래)이 따로 있다
        const s = all.slice(all.indexOf("const submitToken = useCallback("), all.indexOf("const nativeSignIn = useCallback("));
        const at = s.indexOf("await refreshAfterLogin();");
        expect(at).toBeGreaterThan(0);
        expect(s.indexOf("setLocation(back?.startsWith", at)).toBeGreaterThan(at);
        // 이 길에서 화면을 옮기는 곳은 거기 하나뿐이다
        expect(s.match(/setLocation\(/g)).toHaveLength(1);
    });

    // 2026-10-05 카카오 로그인 검토: 카카오로 보냈던 로그인 화면이 되살아났을 때(뒤로 가기·새 탭에서 끝내고 돌아옴) 단추만 풀리고
    // 로그인 폼이 그대로였다 — 로그인 화면의 로그인 확인은 화면이 붙을 때 한 번만 돌기 때문이다. 이 길도 로그인되는 길이다.
    it("카카오에서 돌아와 되살아난 로그인 화면 — '나'를 다시 묻고, 새로 받은 뒤에 보던 곳(redirect)이나 홈으로 옮긴다", () => {
        const all = src("components/hiq/SocialLogin.tsx");
        const s = all.slice(all.indexOf("const onKakaoReturn = useCallback("), all.indexOf("const { busy: kakaoBusy, start: startKakao }"));
        const ask = s.indexOf('fetch("/api/hiq/me"');
        const out = s.indexOf("if (!me.ok) return;");
        const at = s.indexOf("await refreshAfterLogin();");
        expect(ask).toBeGreaterThan(0);
        // 로그인돼 있지 않으면 아무것도 하지 않는다(폼을 그대로 쓴다)
        expect(out).toBeGreaterThan(ask);
        expect(at).toBeGreaterThan(out);
        const move = s.indexOf("setLocation(safeReturnPath(", at);
        expect(move).toBeGreaterThan(at);
        expect(s.slice(move)).toContain('.get("redirect")) ?? "/dashboard", { replace: true });');
        expect(s.match(/setLocation\(/g)).toHaveLength(1);
        // 카카오 단추의 훅에 건넨다 — 훅은 이 문서가 카카오로 보냈을 때만 부른다(lib/kakaoLogin useKakaoStart)
        expect(all).toContain("}, onKakaoReturn);");
        const hook = src("lib/kakaoLogin.ts");
        expect(hook).toContain("if (wasAway) onReturnRef.current?.();");
    });

    it("가입 완료 — 환영 화면 동안 새로 받는다", () => {
        const s = src("pages/hiq/register.tsx");
        const done = s.indexOf("setIsCompleted(true)");
        const at = s.indexOf("refreshAfterLogin()", done);
        expect(at).toBeGreaterThan(done);
        expect(s.indexOf('setLocation(back ?? "/dashboard"', at)).toBeGreaterThan(at);
    });
});

/**
 * 2026-10-05 카카오 로그인(오너: "카카오도 오픈"). 로그인되는 길이 하나 늘었다 — 카카오에 다녀와 /auth/kakao 화면이 서버에 인가 코드를 넘긴다.
 * 이 길도 '나'를 새로 받은 뒤에 옮겨야 하고, 인가 코드는 한 번밖에 못 써서 서버를 두 번 부르면 두 번째가 실패한다.
 */
describe("카카오 로그인 — 돌아온 화면(/auth/kakao)", () => {
    // 주석 줄은 빼고 본다(설명에 적힌 낱말에 걸리지 않게)
    const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const s = code(src("pages/hiq/kakao-callback.tsx"));

    it("새로 받은 뒤에 화면을 옮긴다 — 가려던 곳은 safeReturnPath 로 거른다", () => {
        const signedIn = s.slice(s.indexOf('if (out.kind === "signed-in") {'), s.indexOf('if (out.why === "no-pending" && await signedInNow()) {'));
        const at = signedIn.indexOf("await refreshAfterLogin();");
        expect(at).toBeGreaterThan(0);
        // 꾸러미가 들고 온 ?redirect= → 서버가 준 곳 → 홈. 둘 다 거른다(열린 리다이렉트 방지)
        const dest = signedIn.indexOf('const dest = safeReturnPath(out.back) ?? safeReturnPath(out.redirectTo) ?? "/dashboard";', at);
        expect(dest).toBeGreaterThan(at);
        expect(signedIn.indexOf("go(dest);", dest)).toBeGreaterThan(dest);
        // 새로 받기 전에 화면을 옮기는 경우는 하나뿐이다 — 약관을 거절해 로그아웃된 사람을 로그인 화면으로
        const before = signedIn.slice(0, at);
        expect(before.match(/\bgo\(/g)).toHaveLength(1);
        expect(before).toContain("go(loginPath(out.back));");
        expect(before.indexOf('apiRequest("/api/hiq/logout"')).toBeLessThan(before.indexOf("go(loginPath(out.back));"));
        // 로그인 화면 주소에 싣는 redirect 도 거른 값만
        const loginPath = s.slice(s.indexOf("function loginPath"), s.indexOf("type FailView"));
        expect(loginPath).toContain("const safe = safeReturnPath(back);");
        // 이동은 전부 자리 바꿔 끼우기 — '뒤로'로 이 주소에 돌아와 같은 코드를 다시 보내지 않게
        expect(s).toContain("const go = (to: string) => live.current.setLocation(to, { replace: true });");
        expect(s.match(/setLocation\(/g)).toHaveLength(2);
        expect(s).toContain("setLocation(failView.to, { replace: true })");
    });

    it("약관 동의는 SocialLogin 과 같은 규칙 — 들어가기 전에 받고, 거절하면 로그아웃", () => {
        const signedIn = s.slice(s.indexOf('if (out.kind === "signed-in") {'), s.indexOf('if (out.why === "no-pending" && await signedInNow()) {'));
        const ask = signedIn.indexOf('await live.current.askTerms("signup")');
        expect(signedIn.indexOf("if (!isTermsAccepted(out.termsVersion)) {")).toBeGreaterThan(0);
        expect(ask).toBeGreaterThan(signedIn.indexOf("if (!isTermsAccepted(out.termsVersion)) {"));
        expect(signedIn.indexOf("await refreshAfterLogin();")).toBeGreaterThan(ask);
        expect(signedIn).toContain('queryClient.removeQueries({ queryKey: ["/api/hiq/me"] });');
    });

    it("서버는 한 번만 부른다 — 문서당 한 번, 부르기 전에 꾸러미와 주소의 code 를 지운다", () => {
        // 모듈 변수의 약속을 다시 쓴다: 화면이 두 번 그려지거나 다시 붙어도 같은 결과를 기다릴 뿐이다
        expect(s).toContain("let flight: Promise<Outcome> | null = null;");
        expect(s).toContain("flight ??= readAndExchange();");
        expect(s.match(/readAndExchange\(\)/g)).toHaveLength(2); // 정의 한 번 + 부르는 곳 한 번
        expect(s.match(/settleKakaoReturn\(\)/g)).toHaveLength(2);
        // 결과 처리도 한 번(StrictMode 의 두 번째 효과·살아 있지 않은 쪽은 건너뛴다)
        expect(s).toContain("if (!alive || handled.current) return;");

        const fn = s.slice(s.indexOf("async function readAndExchange"), s.indexOf("function loginPath"));
        const take = fn.indexOf("const pending = takeKakaoPending();");
        const strip = fn.indexOf('window.history.replaceState(window.history.state, "", KAKAO_REDIRECT_PATH)');
        const check = fn.indexOf("const check = checkKakaoReturn(pending, stateFromUrl, Date.now());");
        const call = fn.indexOf("apiRequest(");
        expect(take).toBeGreaterThan(0);
        expect(strip).toBeGreaterThan(take);
        expect(check).toBeGreaterThan(strip);
        expect(call).toBeGreaterThan(check);
        // 로그인·연결 API 는 각각 한 군데에서만 부른다
        expect(s.match(/apiRequest\("\/api\/hiq\/social\/kakao", /g)).toHaveLength(1);
        expect(s.match(/apiRequest\("\/api\/hiq\/social\/kakao\/link", /g)).toHaveLength(1);
        expect(s).not.toMatch(/fetch\("\/api\/hiq\/social/);
    });
});
