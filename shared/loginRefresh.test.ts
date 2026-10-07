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

    // 2026-10-06 검토: 화면을 옮기지 않는 로그인(가입·로그인 팝업 · '앱에서 열기')은 떠 있는 화면이 그대로다. removeQueries 는 지워진 '나'를
    // 보던 구독자에게 알리지 않아, 다시 맞춰 주지 않으면 머리의 '로그인' 단추·종목 판단(SportProvider)이 비로그인인 채로 남는다.
    // 예전에는 이 뒷정리가 팝업 파일 안에만 있어 '앱에서 열기'는 부를 수 없었다 — 공용 자리(queryClient)로 옮겼다.
    it("그 자리에 남는 로그인의 뒷정리 — 지워질 때 구독자를 적어 두고, 부르면 같은 옵션으로 다시 맞춘다", () => {
        const q = src("lib/queryClient.ts");
        const block = q.slice(q.indexOf("// 5-0."), q.indexOf("// 5-1."));
        expect(block.length).toBeGreaterThan(0);
        expect(block).toContain('const ME_HASH = hashKey(["/api/hiq/me"]);');
        // 적는 일은 캐시의 '지워짐' 알림에서 — 화면이 붙어 있는지와 무관하게 늘 듣는다
        expect(block).toContain("queryClient.getQueryCache().subscribe((e) => {");
        expect(block).toContain('if (e.type !== "removed" || e.query.queryHash !== ME_HASH) return;');
        expect(block).toContain("e.query.observers.forEach((o) => orphans.add(o));");
        // 쌓이지 않게: 적을 때마다 사라진 구독자는 버린다
        expect(block).toContain("orphans.forEach((o) => { if (!o.hasListeners()) orphans.delete(o); });");
        const rebind = block.slice(block.indexOf("export function rebindAuthWatchers(): void {"));
        expect(rebind).toContain("orphans.clear();");
        expect(rebind).toContain("if (o.hasListeners()) o.setOptions(o.options);");
        // refreshAfterLogin 이 저절로 하지는 않는다 — 화면을 옮기는 로그인에서는 떠나는 화면이 한 번 더 그려질 뿐이다. 그 자리에 남는 두 길만 부른다
        const fn = q.slice(q.indexOf("export async function refreshAfterLogin"), q.indexOf("// 5-0."));
        expect(fn).not.toContain("rebindAuthWatchers");
        expect(src("components/hiq/LoginSheet.tsx")).toContain('import { rebindAuthWatchers } from "@/lib/queryClient";');
        expect(src("components/hiq/HandoffRedeemer.tsx")).toContain('import { apiRequest, queryClient, rebindAuthWatchers, refreshAfterLogin } from "@/lib/queryClient";');
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

    // 2026-10-06 가입·로그인 팝업(LoginSheet, 오너: "회원가입은 … 올라오는 간편 회원가입 팝업으로"). 로그인되는 길이 또 하나다 —
    // 화면을 옮기지 않는 길이라 더 조심해야 한다: '나'를 새로 받기 전에 닫으면 보던 화면이 비로그인인 채로 남는다.
    it("가입·로그인 팝업 — 새로 받은 뒤에 닫고, 가려던 곳이 따로 있을 때만 옮긴다", () => {
        const all = src("components/hiq/SocialLogin.tsx");
        // 구글·애플: 부른 쪽(팝업)이 돌아갈 곳을 정했으면 그 자리 마무리(finishInPlace)로 — 새로 받은 뒤, 로그인 화면의 이동(setLocation)보다 앞에서
        const submit = all.slice(all.indexOf("const submitToken = useCallback("), all.indexOf("const nativeSignIn = useCallback("));
        const fresh = submit.indexOf("await refreshAfterLogin();");
        const inPlace = submit.indexOf("if (given.current.redirect !== undefined) { finishInPlace(back); return; }");
        expect(fresh).toBeGreaterThan(0);
        expect(inPlace).toBeGreaterThan(fresh);
        expect(inPlace).toBeLessThan(submit.indexOf("setLocation(back?.startsWith"));
        // 새로 받기 전에는 닫지도 옮기지도 않는다
        expect(submit.slice(0, fresh)).not.toMatch(/finishInPlace\(|onDone|setLocation\(/);
        // 카카오에서 되살아난 화면도 같다
        const kakao = all.slice(all.indexOf("const onKakaoReturn = useCallback("), all.indexOf("const { busy: kakaoBusy, start: startKakao }"));
        expect(kakao.indexOf("if (given.current.redirect !== undefined) { finishInPlace(null); return; }")).toBeGreaterThan(kakao.indexOf("await refreshAfterLogin();"));

        // 그 자리 마무리: 닫고(onDone) → 가려던 곳이 지금 주소와 다를 때만 옮긴다(우리 사이트 안의 경로만)
        const finish = all.slice(all.indexOf("const finishInPlace = useCallback("), all.indexOf("const showKakao ="));
        const close = finish.indexOf("given.current.onDone?.();");
        const dest = finish.indexOf("const dest = safeReturnPath(back);");
        const stay = finish.indexOf("if (!dest || dest === window.location.pathname + window.location.search) return;");
        const move = finish.indexOf("setLocation(dest, ");
        expect(close).toBeGreaterThan(0);
        expect(dest).toBeGreaterThan(close);
        expect(stay).toBeGreaterThan(dest);
        expect(move).toBeGreaterThan(stay);
        expect(finish.match(/setLocation\(/g)).toHaveLength(1);

        // 팝업은 로그인을 스스로 하지 않는다 — 서버를 부르는 것은 SocialLogin 뿐이고, 팝업은 끝났다는 알림(onDone)에 닫기만 한다
        // (주석 줄은 빼고 본다 — 설명에는 refreshAfterLogin 이라는 낱말이 나온다)
        const sheet = src("components/hiq/LoginSheet.tsx").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
        expect(sheet).not.toMatch(/\bfetch\(|apiRequest\(|refreshAfterLogin/);
        expect(sheet).toContain("<SocialLogin hint={false} kakao={!storeEntry} tone={tone} redirect={back} onDone={done} secondaryRow={kakaoShown ? secondaryRow : undefined} />");
    });

    // 2026-10-06 검토: 다른 탭에서 로그인한 뒤 먼저 열어 둔 탭으로 돌아오면 화면은 '나 = 없음'을 5분 동안 쥐고 있다. 예전에는 '로그인'을
    // 누르면 로그인 화면이 서버에 물어 보던 곳으로 되돌려 주었는데(위 "이미 로그인된 채 로그인 화면에 오면"), 팝업은 묻지 않고 단추부터 보였다 —
    // 로그인된 사람이 구글·애플을 다시 누르면 새 계정이 만들어지고 세션이 그쪽으로 바뀐다. 이 길도 '나'를 새로 받은 뒤에 닫는다.
    it("가입·로그인 팝업이 붙을 때 — 이미 로그인돼 있으면 새로 받은 뒤에 닫는다(단추를 다시 누르게 하지 않는다)", () => {
        const all = src("components/hiq/SocialLogin.tsx");
        // 카카오 훅 다음, 구글·애플의 길(submitToken) 앞에 있는 효과 하나
        const s = all.slice(all.indexOf("}, [startKakao, returnTo]);"), all.indexOf("const submitToken = useCallback("));
        const popupOnly = s.indexOf("if (given.current.redirect === undefined) return;");
        const ask = s.indexOf('fetch("/api/hiq/me", { credentials: "include" })');
        const signedIn = s.indexOf("if (me.ok) {");
        const fresh = s.indexOf("await refreshAfterLogin();");
        const finish = s.indexOf("if (alive) finishInPlace(returnTo());");
        const unlock = s.indexOf("if (alive) setChecking(false);");
        // 팝업일 때만 돈다 — 로그인 화면의 확인은 landing 이 한다(두 번 묻지 않는다)
        expect(popupOnly).toBeGreaterThan(0);
        expect(ask).toBeGreaterThan(popupOnly);
        expect(signedIn).toBeGreaterThan(ask);
        // 새로 받은 **뒤에** 팝업의 마무리(닫고, 가려던 곳이 따로 있을 때만 옮긴다)
        expect(fresh).toBeGreaterThan(signedIn);
        expect(finish).toBeGreaterThan(fresh);
        // 로그인돼 있지 않으면(또는 못 물어봤으면) 단추를 푼다
        expect(unlock).toBeGreaterThan(finish);
        // 이 효과가 직접 화면을 옮기지는 않는다
        expect(s).not.toMatch(/setLocation\(/);
        // 확인하는 동안은 단추 묶음이 누름을 받지 않는다 — 그 사이 구글·애플을 눌러 새 계정이 생기는 틈을 막는다.
        // 로그인 화면(redirect 를 안 줬다)은 처음부터 풀려 있다. 틀 셋(옛 앱 안내 · 앱 · 웹) 모두 같은 틀을 쓴다
        expect(all).toContain("const [checking, setChecking] = useState(redirect !== undefined);");
        expect(all).toContain("const stackClass = checking ? `${look.stack} pointer-events-none` : look.stack;");
        expect(all.match(/className=\{stackClass\}/g)).toHaveLength(3);
        expect(all).not.toContain("className={look.stack}");
        // 카카오 단추의 잠금 조건은 건드리지 않았다(스위치가 켜지면 그대로 살아난다)
        expect(all).toContain("disabled={kakaoBusy || busy}");
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
        // 2026-10-07: 가는 곳은 전체 로그인 화면이 아니라 예시 홈 위의 팝업(loginPagePath) — 싣는 값은 여전히 거른 것만
        expect(loginPath).toContain('return loginPagePath(safeReturnPath(back) ?? "/dashboard");');
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

/**
 * 2026-10-06 '앱에서 열기'(오너: "웹에서 로그인한 사람이 앱을 깔았을 때 다시 로그인하지 않고 그대로 이어 쓰게").
 * 로그인되는 길이 또 하나 늘었다 — 웹이 받은 한 번짜리 토큰을 받는 쪽(HandoffRedeemer)이 쿠키와 바꾼다. 이 길도 '나'를 새로 받아야 한다.
 *
 * 2026-10-06 검토 — 처음에는 주소(?handoff=)에 실려 온 토큰을 어느 화면에서든, 웹 브라우저에서든, 묻지 않고 바꿨다. 그래서 공격자가
 * 자기 토큰이 든 링크를 보내면 받은 사람이 **공격자의 계정**으로 로그인됐다(링크형 로그인 CSRF). 지금은:
 *   · 주소에 실려 온 토큰은 지우기만 하고 쓰지 않는다. 쓰는 것은 앱이 커스텀 스킴으로 받아 건넨 토큰뿐이다(웹 브라우저에서는 서버를 부르지 않는다).
 *   · 바꾸기 전에 서버에 로그인 여부를 다시 확인하고(화면이 비로그인으로 알고 있어도), 사람에게 묻는다.
 *   · 성공하면 어느 계정으로 들어왔는지 이름과 함께 알린다.
 */
describe("앱에서 열기 — 받는 쪽(HandoffRedeemer)", () => {
    const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const s = code(src("components/hiq/HandoffRedeemer.tsx"));
    const strip = s.indexOf('window.history.replaceState(window.history.state, "", taken.cleaned);');
    const call = s.indexOf('redeemed = await apiRequest("/api/hiq/handoff/redeem", { method: "POST", body: { token } });');
    /** 주소를 지우는 효과 · 앱이 건넨 토큰을 받는 효과 · 바꾸는 효과 */
    const first = s.slice(s.indexOf("useLayoutEffect(() => {"), s.indexOf("}, [search]);"));
    const inbox = s.slice(s.indexOf("}, [search]);"), s.indexOf("return onHandoffDelivered(take);"));
    const redeem = s.slice(s.indexOf("return onHandoffDelivered(take);"), s.indexOf("}, [arrived, isLoading]);"));

    it("주소에 실려 온 토큰은 지우기만 한다 — 쓰지 않는다(웹 브라우저든 앱이든)", () => {
        const take = first.indexOf("const taken = takeHandoffFromUrl(window.location.href);");
        expect(take).toBeGreaterThan(0);
        expect(strip).toBeGreaterThan(0);
        expect(call).toBeGreaterThan(strip);
        // 지우는 일은 그리기 직전 효과 안에서 끝난다 — 그 안에는 기다림(await)도 로그인 확인도 없다
        expect(first).toContain("taken.cleaned");
        expect(first).not.toMatch(/await |isLoading|isLoggedIn/);
        // 실려 있으면 꼴이 틀린 값이어도 지운다
        expect(first.indexOf("if (!taken.present) return;")).toBeLessThan(first.indexOf("window.history.replaceState("));
        // ★ 주소에서 꺼낸 토큰을 어디에도 넘기지 않는다 — 예전에는 여기서 pending 에 담아 바꾸러 갔다
        expect(first).not.toMatch(/taken\.token|pending|setArrived/);
        // 주소가 바뀔 때마다 다시 본다 — 앱이 켜진 채 받은 링크는 화면을 새로 띄우지 않는다
        expect(s).toContain("const search = useSearch();");
        // 토큰을 기기 저장소나 주소에 다시 적지 않는다
        expect(s).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    });

    it("쓰는 토큰은 앱이 커스텀 스킴으로 받아 건넨 것뿐이다 — 웹 브라우저에서는 받지도 바꾸지도 않는다", () => {
        expect(s).toContain('import { isNativeApp, onHandoffDelivered, takeDeliveredHandoff } from "@/lib/nativeBridge";');
        // 받는 효과: 앱이 아니면 듣지 않는다. 붙기 전에 도착한 것(콜드 스타트)부터 꺼내고, 그 뒤로는 도착할 때마다
        const gate = inbox.indexOf("if (!isNativeApp()) return;");
        const takeNow = inbox.indexOf("take();");
        expect(gate).toBeGreaterThan(0);
        expect(inbox.indexOf("const token = takeDeliveredHandoff();")).toBeGreaterThan(gate);
        expect(inbox).toContain("pending.current = token;");
        expect(takeNow).toBeGreaterThan(gate);
        // pending 에 담는 곳은 여기 하나다
        expect(s.match(/pending\.current = token;/g)).toHaveLength(1);
        // 바꾸는 효과도 한 번 더 막는다 — isNativeApp() 이 아니면 서버를 부르지 않는다
        const guard = redeem.indexOf("if (!isNativeApp()) return;");
        expect(guard).toBeGreaterThan(0);
        expect(guard).toBeLessThan(redeem.indexOf("await apiRequest("));
        expect(guard).toBeLessThan(redeem.indexOf("appConfirm("));

        // 건네는 쪽(nativeBridge): 토큰은 경로에서 떼어 모듈 변수로 — 저장소에 적지 않고, 한 번 꺼내면 비운다
        const bridge = code(src("lib/nativeBridge.ts"));
        const open = bridge.slice(bridge.indexOf("function openDeepLink("), bridge.indexOf("function initDeepLinks("));
        expect(open).toContain("const { path, handoff } = openedAppLink(url);");
        expect(open).toContain("deliveredHandoff = handoff;");
        expect(open).toContain("navigateInApp(path, replace);");
        expect(open).not.toContain("deepLinkToPath(");
        const takeFn = bridge.slice(bridge.indexOf("export function takeDeliveredHandoff()"), bridge.indexOf("export function onHandoffDelivered("));
        expect(takeFn).toContain("deliveredHandoff = null;");
        expect(bridge.match(/deliveredHandoff = /g)).toHaveLength(2); // 건넬 때 · 꺼낼 때
        expect(bridge).not.toMatch(/storageSet\([^)]*deliveredHandoff|storageSet\([^)]*handoff\b/);
    });

    it("받는 쪽이 refreshAfterLogin 을 부른다 — 바꾼 뒤 '나'를 새로 받고, 떠 있는 화면을 다시 맞춘 뒤에 알린다. 화면은 옮기지 않는다", () => {
        const at = s.indexOf("await refreshAfterLogin();");
        const rebind = s.indexOf("rebindAuthWatchers();");
        const toast = s.indexOf("live.current.toast({");
        expect(call).toBeGreaterThan(0);
        expect(at).toBeGreaterThan(call);
        // 화면을 옮기지 않는 로그인이다 — 다시 맞추지 않으면 종목 판단(SportProvider)·대전 배너가 다음 화면 이동까지 비로그인인 채로 남는다.
        // 예전에는 직후의 토스트가 화면을 우연히 다시 그려서 홈만 바뀌었다
        expect(rebind).toBeGreaterThan(at);
        expect(toast).toBeGreaterThan(rebind);
        expect(s.match(/refreshAfterLogin\(\)/g)).toHaveLength(1);
        expect(s.match(/rebindAuthWatchers\(\);/g)).toHaveLength(1);
        // 그 자리에 그대로 둔다
        expect(s).not.toMatch(/setLocation\(|useLocation|navigate\(|location\.href\s*=|location\.assign|location\.replace/);
    });

    it("서버는 토큰마다 한 번만 부른다 — 로그인 확인이 끝난 뒤에, 서버에 다시 확인하고, 로그인돼 있으면 부르지 않는다", () => {
        expect(s.match(/apiRequest\(/g)).toHaveLength(1);
        expect(s).not.toMatch(/fetch\("\/api\/hiq\/handoff/);
        const wait = redeem.indexOf("if (!token || isLoading) return;");
        const once = redeem.indexOf("if (sent.current.has(token)) return;");
        const mark = redeem.indexOf("sent.current.add(token);");
        const check = redeem.indexOf('const me = await queryClient.fetchQuery({ queryKey: ["/api/hiq/me"], staleTime: ME_TRUST_MS });');
        const exchange = redeem.indexOf("await apiRequest(");
        expect(wait).toBeGreaterThan(0);
        expect(once).toBeGreaterThan(wait);
        expect(mark).toBeGreaterThan(once);
        // 보낸 것으로 적는 일이 기다림(await)보다 먼저다 — 효과가 다시 돌아도 두 번 보내지 않는다
        expect(mark).toBeLessThan(redeem.search(/await /));
        expect(check).toBeGreaterThan(mark);
        expect(exchange).toBeGreaterThan(check);
        // ★ 서버 확인은 화면이 '비로그인'으로 알고 있어도 한다(2026-10-06 검토). 예전에는 `if (looksSignedIn) {` 안에서만 했다 —
        //   로그인 확인이 오류(순간 끊김 · 5xx)로 끝나면 화면에는 비로그인으로 보여, 확인 없이 바꾸러 가서 쓰던 계정이 말없이 바뀌었다.
        expect(s).not.toMatch(/looksSignedIn|isLoggedIn/);
        const guard = redeem.slice(check, exchange);
        // 로그인돼 있으면(또는 확인하지 못하면) 토큰을 쓰지 않고 끝낸다
        expect(guard).toContain("if (me) return;");
        expect(guard).toMatch(/catch \{\s*return;/);
    });

    it("바꾸기 전에 묻는다 — 남이 보낸 링크로 그 사람의 계정에 들어가지 않게", () => {
        expect(s).toContain('import { appConfirm } from "@/components/AppDialog";');
        const ask = redeem.indexOf("const agreed = await appConfirm({");
        const no = redeem.indexOf("if (!agreed) return;");
        const exchange = redeem.indexOf("await apiRequest(");
        expect(ask).toBeGreaterThan(redeem.indexOf("if (me) return;"));
        expect(no).toBeGreaterThan(ask);
        expect(exchange).toBeGreaterThan(no);
        // 브라우저 기본 창은 쓰지 않는다
        expect(s).not.toMatch(/appAlert|\balert\(|(?<![A-Za-z])confirm\(/);
        // 무엇을 묻는지: 방금 웹에서 '앱에서 열기'를 눌렀는가 — 누르지 않았다면 취소(계정이 없는 사람은 이름만으로는 판단하지 못한다)
        const ko = src("lib/i18n/ko.ts");
        expect(ko).toMatch(/"handoff\.confirmDesc": "[^"]*앱에서 열기[^"]*취소[^"]*다른 사람의 계정[^"]*"/);
        expect(ko).toContain('"handoff.confirmTitle": "웹에서 쓰던 계정으로 들어갈까요?",');
    });

    it("실패하면 조용히 끝낸다 — 알림은 성공했을 때 한 번뿐이고, 어느 계정인지 이름을 같이 보여 준다", () => {
        const after = s.slice(call);
        expect(after).toMatch(/^[^\n]*\n\s*\} catch \{\s*return;/);
        expect(s.match(/toast\(\{/g)).toHaveLength(1);
        const toast = s.slice(s.indexOf("live.current.toast({"));
        expect(toast).toContain('title: live.current.t("handoff.welcome"),');
        expect(toast).toContain('description: name ? live.current.t("handoff.welcomeAccount").replace("{name}", name) : undefined,');
        // 이름은 새로 받은 '나'에서(화면에 보이는 별명이 먼저)
        expect(s).toContain('const name = (me?.nickname || me?.name || redeemed?.member?.name || "").trim();');
    });

    it("문구는 다섯 언어 사전에 있고, 앱 틀 안쪽에 한 번 붙어 있다", () => {
        const used = Array.from(new Set(Array.from(s.matchAll(/t\("(handoff\.[A-Za-z]+)"\)/g), (m) => m[1]))).sort();
        expect(used).toEqual(["handoff.confirmDesc", "handoff.confirmOk", "handoff.confirmTitle", "handoff.welcome", "handoff.welcomeAccount"]);
        for (const l of ["ko", "en", "es", "tr", "vi"]) {
            const dict = src(`lib/i18n/${l}.ts`);
            for (const key of used) {
                expect(dict, `${l} ${key}`).toMatch(new RegExp(`\\n  "${key.replace(".", "\\.")}": ".+",\\n`));
                expect(dict.split(`"${key}":`).length - 1, `${l} ${key}`).toBe(1);
            }
            // 이름 자리는 하나
            expect(dict.match(/"handoff\.welcomeAccount": "([^"]*)"/)?.[1].split("{name}"), l).toHaveLength(2);
        }
        expect(src("lib/i18n/ko.ts")).toContain('"handoff.welcome": "웹에서 쓰던 계정으로 들어왔어요",');
        const app = src("App.tsx");
        expect(app).toContain('import { HandoffRedeemer } from "@/components/hiq/HandoffRedeemer";');
        expect(app.match(/<HandoffRedeemer \/>/g)).toHaveLength(1);
        // QueryClient·i18n 안쪽이고, 화면(AppRoutes)보다 앞이다
        const at = app.indexOf("<HandoffRedeemer />");
        expect(at).toBeGreaterThan(app.indexOf("<I18nProvider>"));
        expect(at).toBeGreaterThan(app.indexOf("<QueryClientProvider client={queryClient}>"));
        expect(at).toBeLessThan(app.indexOf("<AppRoutes />"));
        expect(at).toBeLessThan(app.indexOf("</I18nProvider>"));
    });
});
