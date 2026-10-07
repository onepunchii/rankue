import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 통합 로그인의 화면 쪽 규칙(2026-10-07) — 소스를 읽어 지킨다(화면 시험은 shared/ 에 둔다: vitest 가 client 는 sim·golf 만 돈다).
 *  오너: "휴대폰 로그인 사용자를 카카오나 구글 로그인으로 통합" · "한국은 카카오 구글이 주 가입버튼, 애플이나 핸드폰번호는 서브".
 *  - 주·보조: 한국어 · 카카오가 되는 곳의 큰 단추는 카카오·구글. 애플(웹)·전화번호는 보조 줄. **iOS 앱의 애플 단추는 큰 묶음에 남는다**(App Store 4.8).
 *  - 잇기: 소셜로 새 계정이 만들어지면 "전에 전화번호로 쓰셨나요?"를 한 번 묻는다. 설정에서도 연다.
 *  - 구글 연결·해제: 설정 › 연결된 로그인, PIN 으로 본인 확인.
 * 서버 쪽 동작은 server/routes/modules/socialUnify.test.ts 가 본다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const client = (p: string) => root(`client/src/${p}`);
/** 주석 줄을 뺀 소스 */
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");
const LOCALES = ["ko", "en", "es", "vi", "tr"] as const;

const social = code(client("components/hiq/SocialLogin.tsx"));
const attach = code(client("components/hiq/AttachPhoneSheet.tsx"));
const google = code(client("components/hiq/GoogleLinkPanel.tsx"));
const settings = code(client("pages/hiq/settings.tsx"));

describe("주·보조 — 애플 단추가 어디에 서는가", () => {
    const appBranch = social.slice(social.indexOf("if (inApp) {"), social.indexOf("if (!GOOGLE_CLIENT_ID && !showKakao) return null;"));
    const webBranch = social.slice(social.indexOf("if (!GOOGLE_CLIENT_ID && !showKakao) return null;"));

    it("iOS 앱: 애플 단추는 보조 줄을 줘도 큰 묶음에 그대로 있다(4.8) — 조건은 '안드로이드가 아니다' 하나뿐", () => {
        expect(appBranch.length).toBeGreaterThan(0);
        const apple = appBranch.indexOf('onClick={() => nativeSignIn("apple")}');
        expect(apple).toBeGreaterThan(0);
        const guard = appBranch.lastIndexOf("{nativePlatform() !== \"android\" && (", apple);
        expect(guard).toBeGreaterThan(appBranch.indexOf('onClick={() => nativeSignIn("google")}'));
        // 그 조건과 단추 사이에 secondaryRow 가 끼어 있지 않다
        expect(appBranch.slice(guard, apple)).not.toContain("secondaryRow");
        // 큰 단추의 모양(다른 단추와 같은 look) 그대로다
        expect(appBranch.slice(apple, apple + 200)).toContain("className={look.apple}");
        // 앱 안의 보조 줄에는 애플을 넘기지 않는다(같은 단추가 두 번 서지 않게)
        expect(appBranch.match(/secondaryRow\?\.\(null\)/g)).toHaveLength(1);
        expect(appBranch).not.toMatch(/secondaryRow\?\.\(\s*(?!null)/);
    });

    it("웹: 보조 줄을 받으면 애플을 큰 묶음에서 빼고 보조 줄에 넘긴다 — 안 받으면 예전 그대로 큰 단추", () => {
        expect(webBranch).toContain("{APPLE_SERVICES_ID && !secondaryRow && (");
        expect(webBranch).toContain("{secondaryRow?.(APPLE_SERVICES_ID ? { onClick: () => { void handleAppleWeb(); }, disabled: !appleReady || busy } : null)}");
        // 카카오 · 구글은 조건이 바뀌지 않았다(보조 줄과 무관하게 큰 단추)
        expect(webBranch).toContain("{showKakao && (");
        expect(webBranch).toContain("{GOOGLE_CLIENT_ID && sheet && (");
        expect(webBranch).toContain("{GOOGLE_CLIENT_ID && !sheet && (");
    });

    it("보조 줄은 한국어 · 카카오가 되는 곳에서만 넘긴다 — 다른 언어의 모양은 그대로", () => {
        expect(code(client("components/hiq/LoginSheet.tsx"))).toContain("secondaryRow={kakaoShown ? secondaryRow : undefined}");
        const landing = code(client("pages/hiq/landing.tsx"));
        expect(landing).toContain("secondaryRow={kakaoFirst ? kakaoSecondaryRow : undefined}");
        // 전화 카드 아래의 소셜 묶음(다른 언어 · 카카오가 안 되는 곳)은 보조 줄 없이 예전 그대로
        expect(landing).toContain("<SocialLogin hint={false} kakao={!storeEntry} />");
    });
});

describe("잇기 — 소셜로 새 계정이 만들어진 직후 한 번 묻는다", () => {
    it("구글·애플 · 앱 안 카카오 · 웹 카카오 — 셋 다 '나'를 새로 받은 뒤, 새 계정일 때만", () => {
        const submit = social.slice(social.indexOf("const submitToken = useCallback("), social.indexOf("const nativeSignIn = useCallback("));
        expect(submit.indexOf("if (j.data?.isNew === true) offerAttachPhone();")).toBeGreaterThan(submit.indexOf("await refreshAfterLogin();"));
        const kakao = social.slice(social.indexOf("const nativeKakaoSignIn = useCallback("), social.indexOf("// GIS 버튼은"));
        expect(kakao.indexOf("if (data.isNew === true) offerAttachPhone();")).toBeGreaterThan(kakao.indexOf("await refreshAfterLogin();"));
        const callback = code(client("pages/hiq/kakao-callback.tsx"));
        const at = callback.indexOf("if (out.isNew) offerAttachPhone();");
        expect(at).toBeGreaterThan(callback.indexOf("await refreshAfterLogin();"));
        // 약관을 거절해 계정을 지우는 갈래보다 뒤다 — 지워질 계정에 묻지 않는다
        expect(at).toBeGreaterThan(callback.indexOf('askTerms("signup")'));
        expect(submit.indexOf("offerAttachPhone()")).toBeGreaterThan(submit.indexOf('askTerms("signup")'));
        expect(kakao.indexOf("offerAttachPhone()")).toBeGreaterThan(kakao.indexOf('askTerms("signup")'));
    });

    // 2026-10-07 오너: "신규 가입자한테 카카오 회원가입하고 또 휴대폰 번호 잇기 … 뎁스만 추가되는 거 같은데"
    it("처음 온 사람에게는 묻지 않는다 — 이 기기에서 전화번호 계정을 쓴 적이 있을 때만", () => {
        const offer = attach.slice(attach.indexOf("export function offerAttachPhone(): void {"), attach.indexOf("export function openAttachPhoneSheet"));
        // 표시가 없으면 아무 일도 없다 — 세션 저장소에 '물어볼 차례'도 남기지 않는다(주 종목 묻기가 기다리지 않는다)
        expect(offer.indexOf("if (!phoneSeenHere()) return;")).toBeGreaterThan(0);
        expect(offer.indexOf("if (!phoneSeenHere()) return;")).toBeLessThan(offer.indexOf("writeOffer(true);"));
        // 표시는 전화번호 계정으로 로그인해 있는 동안 남긴다 — 값은 "1" 뿐(번호·회원 id 를 적지 않는다)
        expect(attach).toContain("const phoneAccount = !!member && conn?.phone === true;");
        expect(attach).toContain("useEffect(() => { if (phoneAccount) markPhoneSeen(); }, [phoneAccount]);");
        expect(attach).toContain('window.localStorage.setItem(PHONE_SEEN_KEY, "1");');
        // 설정에서 직접 여는 길은 조건 없이 열린다
        const open = attach.slice(attach.indexOf("export function openAttachPhoneSheet(): void {"), attach.indexOf("function closeSheet(): void {"));
        expect(open).not.toContain("phoneSeenHere");
    });

    it("뜨는 조건은 '나'가 정한다 — 소셜로 가입한 계정(전화번호 없음 · PIN 없음)만, 새 가입 직후의 권유는 한국어 화면만", () => {
        expect(attach).toContain("const socialOnly = !!member && !!conn && conn.phone === false && conn.pin !== true;");
        expect(attach).toContain('const show = s.open && socialOnly && (s.source === "settings" || locale === "ko");');
        // 물어볼 계정이 아니면 표시를 치운다 — 주 종목 묻기가 기다리지 않게
        expect(attach).toContain("if (member && !socialOnly && (state.open || readOffer())) closeSheet();");
        expect(attach).toContain('if (locale !== "ko" && state.source === "signup" && (state.open || readOffer())) closeSheet();');
        // 닫으면(처음이에요 · 닫기 · 성공) 표시도 지운다
        const close = attach.slice(attach.indexOf("function closeSheet(): void {"), attach.indexOf("export function useAttachPhonePending"));
        expect(close).toContain("writeOffer(false);");
    });

    it("보내는 것은 번호와 PIN 뿐 — 성공하면 '나'를 새로 받고, 떠 있는 화면이 새 '나'를 읽게 한 뒤 닫는다", () => {
        const submit = attach.slice(attach.indexOf("const submit = async () => {"), attach.indexOf("return (", attach.indexOf("const submit = async () => {")));
        const call = submit.indexOf('await apiRequest("/api/hiq/social/attach-phone", { method: "POST", body: { phone, pin } });');
        const refresh = submit.indexOf("await refreshAfterLogin();");
        const rebind = submit.indexOf("rebindAuthWatchers();");
        const close = submit.indexOf("closeSheet();");
        expect(call).toBeGreaterThan(0);
        expect(refresh).toBeGreaterThan(call);
        expect(rebind).toBeGreaterThan(refresh);
        expect(close).toBeGreaterThan(rebind);
        // 실패는 서버가 만든 문구를 그대로 — PIN 은 지운다
        expect(submit).toContain('setError(e instanceof ApiError && e.message ? e.message : t("attach.failed"));');
        expect(submit).toContain('setPin("");');
        // 번호 10자리 · PIN 4자리가 안 되면 보내지 않는다
        expect(attach).toContain("const ready = phone.length >= 10 && pin.length >= 4;");
        expect(submit).toContain("if (busy || !ready) return;");
        // 브라우저 기본 창을 쓰지 않는다
        expect(attach).not.toMatch(/window\.(confirm|alert|prompt)\(|[^.\w](confirm|alert|prompt)\(/);
    });

    it("주 종목 묻기는 이 시트 뒤로 물러선다 — 이으면 계정이 바뀐다", () => {
        const gate = code(client("components/hiq/sport/PrimarySport.tsx"));
        expect(gate).toContain("const attachPending = useAttachPhonePending();");
        expect(gate).toMatch(/const need = [^;]*&& !attachPending/);
        // 호스트는 앱에 한 번
        expect(code(client("App.tsx")).match(/<AttachPhoneSheetHost \/>/g)).toHaveLength(1);
    });

    it("어두운 시트(골프)는 리터럴 색만 — 골프 테마가 유틸 색을 바꿔 끼운다", () => {
        const dark = attach.slice(attach.indexOf("    dark: {"), attach.indexOf("const PANEL_ID"));
        expect(dark.length).toBeGreaterThan(0);
        const classes = Array.from(dark.matchAll(/"([^"]+)"/g), (m) => m[1]).join(" ").split(/\s+/);
        for (const c of classes.filter((x) => /^(?:placeholder:|active:)?(?:bg|text|border)-/.test(x))) expect(c, c).toMatch(/-\[#[0-9A-Fa-f]{6,8}\]$/);
    });
});

describe("설정 › 연결된 로그인", () => {
    it("구글 연결·해제는 PIN 이 있는 계정에서만 — 해제는 전화번호라는 다른 길이 남을 때만", () => {
        expect(settings).toContain("const canLinkGoogle = googleLinkAvailable() && !!member?.profileId && conn.pin === true && !conn.google;");
        expect(settings).toContain("const canUnlinkGoogle = !!conn.google && conn.pin === true && !!conn.phone;");
        expect(settings).toContain('{c.key === "google" && googlePanel && (');
        // 카카오 해제 칸이 구글 줄 아래에 같이 뜨지 않는다
        expect(settings).toContain('{c.key === "kakao" && c.onUnlink && unlinkOpen && (');
        expect(settings).not.toContain("{c.onUnlink && unlinkOpen && (");
    });

    it("소셜로 가입한 계정에는 '전화번호 계정 잇기'가 있다 — 서버 문구(LINK_TAKEN)가 가리키는 그 단추", () => {
        expect(settings).toContain("const canAttachPhone = conn.phone === false && conn.pin !== true;");
        expect(settings).toContain('onLink: canAttachPhone ? openAttachPhoneSheet : undefined, linkLabel: t("settings.attachPhone")');
        expect(root("shared/i18n/ko.ts")).toMatch(/"err\.auth\.linkTaken": "[^"]*전화번호 계정 잇기[^"]*"/);
        expect(client("lib/i18n/ko.ts")).toContain('"settings.attachPhone": "전화번호 계정 잇기"');
    });

    it("구글 연결 칸 — PIN 과 토큰을 같이 보낸다. 웹은 PIN 을 넣기 전에 구글 단추가 눌리지 않는다", () => {
        expect(google).toContain('await apiRequest("/api/hiq/social/google/link", { method: "POST", body: { idToken, pin: live.current.pin } });');
        expect(google).toContain('await apiRequest("/api/hiq/social/google/link", { method: "DELETE", body: { pin } });');
        expect(google).toContain('${ready && !busy ? "" : "opacity-40 pointer-events-none"}');
        // 구글 단추(GIS)의 콜백은 ref 로 읽는다 — 부모가 다시 그려져도 단추를 다시 초기화하지 않는다
        expect(google).toContain("callback: (r) => { if (r.credential) void linkRef.current(r.credential); },");
        expect(google).toContain("}, [mode, inApp, locale]);");
        // 실패하면 PIN 을 지운다 · 숫자만 여덟 자까지
        expect(google).toContain('setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))');
        expect(google).not.toMatch(/window\.(confirm|alert|prompt)\(|[^.\w](confirm|alert|prompt)\(/);
    });
});

describe("문구 — 다섯 언어 사전", () => {
    const KEYS = ["attach.title", "attach.desc", "attach.submit", "attach.skip", "attach.note", "attach.done", "attach.doneDesc", "attach.failed",
        "settings.attachPhone", "link.pinDesc", "link.pinThenGoogle", "link.unlinkPinDesc", "link.linked", "link.unlinked", "link.failed", "link.unlinkFailed"];
    const used = (src: string) => Array.from(src.matchAll(/\bt\(\s*(?:[^"()]*\?\s*)?"([A-Za-z]+\.[A-Za-z0-9]+)"(?:\s*:\s*(?:[^"()]*\?\s*)?"([A-Za-z]+\.[A-Za-z0-9]+)")*/g), (m) => m[0])
        .flatMap((s) => Array.from(s.matchAll(/"([A-Za-z]+\.[A-Za-z0-9]+)"/g), (m) => m[1]));

    it("새 화면이 쓰는 키는 다섯 사전에 전부, 한 번씩 있다 — {provider} 자리도 같다", () => {
        const keys = new Set([...used(attach), ...used(google), ...KEYS]);
        expect(keys.size).toBeGreaterThanOrEqual(KEYS.length);
        for (const l of LOCALES) {
            const dict = client(`lib/i18n/${l}.ts`);
            for (const key of keys) {
                const hits = dict.match(new RegExp(`\\n  "${key.replace(".", "\\.")}": "`, "g")) ?? [];
                expect(hits, `${l} ${key}`).toHaveLength(1);
            }
            for (const key of ["attach.desc", "attach.doneDesc", "link.linked", "link.unlinked"]) {
                expect(new RegExp(`"${key.replace(".", "\\.")}": "[^"\\n]*\\{provider\\}`).test(dict), `${l} ${key}`).toBe(true);
            }
        }
    });

    it("안내는 기존 회원의 길을 말한다 — 전화번호로 로그인하고, 설정에서 연결해 두면 다음부터 한 번에", () => {
        expect(client("lib/i18n/ko.ts")).toMatch(/"login\.phoneExistingHint": "[^"]*전화번호로 로그인[^"]*설정에서 카카오[^"]*연결[^"]*"/);
        // 잇기 시트가 모든 사람에게 뜨지 않으므로 "바로 이어져요"라고 약속하지 않는다
        expect(client("lib/i18n/ko.ts")).not.toMatch(/"login\.phoneExistingHint": "[^"]*바로 이어져요/);
        expect(client("lib/i18n/ko.ts")).toMatch(/"attach\.desc": "[^"]*기록은 그대로[^"]*"/);
    });
});

// 2026-10-07 오너: "어드민에 휴대폰 번호로 진입하는 거 제거해주고 내 계정이면 들어가지게 해줘" · "가맹점 페이지도 … 바로 들어가지면 되네"
describe("관리 화면의 입구(/admin) — 번호 폼 없이 내 계정으로", () => {
    const entry = code(client("pages/hiq/admin.tsx"));

    it("순서: 관리 쿠키 → 내 계정으로 바로(SSO) → 번호 폼으로 들어와 있던 사장님 → 그 자리에서 로그인", () => {
        const stats = entry.indexOf('await apiRequest("/api/hiq/admin/stats")');
        const sso = entry.indexOf('await apiRequest("/api/hiq/partner/sso", { method: "POST" })');
        const store = entry.indexOf('await apiRequest("/api/hiq/partner/store")');
        expect(stats).toBeGreaterThan(0);
        expect(sso).toBeGreaterThan(stats);
        expect(store).toBeGreaterThan(sso);
        expect(entry).toContain('go(r.role === "super_admin" || r.role === "admin" ? "/admin/dashboard" : "/partner/dashboard")');
        // 이 화면에는 번호·PIN 입력 칸이 없다 — 저절로 번호 폼으로 보내지도 않는다(사장님이 직접 누를 때만)
        expect(entry).not.toMatch(/<input|<Input|type="tel"|type="password"/);
        expect(entry).not.toContain('let to = "/partner/login"');
        expect(entry.match(/setLocation\("\/partner\/login"\)/g)).toHaveLength(1);
    });

    it("로그인이 안 돼 있으면 그 자리에서 팝업을 연다 — 로그인 상태가 바뀌면 다시 확인한다", () => {
        expect(entry).toContain('if (!openLoginSheet({ from: "/admin", title: "관리 화면 로그인", desc: "랭큐 계정으로 로그인하면 바로 열려요." })) setLocation(loginPagePath("/admin"));');
        expect(entry).toContain("}, [setLocation, isLoading, memberId]);");
        // '나'를 받는 중에는 판단하지 않는다(로그인된 사람에게 로그인 단추를 먼저 보여 주지 않는다)
        expect(entry).toContain("if (isLoading) return;");
    });

    it("메뉴의 관리자 콘솔 · 관리 화면의 로그아웃도 입구로 간다", () => {
        expect(code(client("pages/hiq/menu.tsx"))).toContain('label: t("menu.adminConsole"), desc: t("menu.adminConsoleDesc"), onClick: () => setLocation("/admin") }]');
        const dash = code(client("pages/admin/dashboard.tsx"));
        const logout = dash.slice(dash.indexOf("const handleLogout = async () => {"), dash.indexOf("const todos"));
        expect(logout).toContain('setLocation("/admin");');
        expect(logout).not.toContain("/partner/login");
    });

    it("서버: 번호 폼은 관리자 계정을 들이지 않는다(PIN 을 보기 전에) · 바로 들어가기는 본인 확인을 거친 계정만", () => {
        const svc = root("server/services/hiqService.ts");
        const fn = svc.slice(svc.indexOf("async partnerLogin("), svc.indexOf("async getPartnerStore("));
        const refuse = fn.indexOf("if (profile && isAdminRole(profile.role)) {");
        expect(refuse).toBeGreaterThan(0);
        expect(refuse).toBeLessThan(fn.indexOf("verifyPassword(password, profile)"));
        const partner = root("server/routes/modules/partner.ts");
        const sso = partner.slice(partner.indexOf('router.post("/sso"'), partner.indexOf("const requirePartner"));
        const verified = sso.indexOf("const verified = !!profile.password || hasSocialLogin(profile);");
        expect(verified).toBeGreaterThan(0);
        // 두 거절(관리자인데 소셜 연결 없음 · 본인 확인 없는 계정) 모두 쿠키를 주기 전이다
        expect(sso.indexOf("res.cookie('hiq_partner_auth'")).toBeGreaterThan(sso.lastIndexOf('"SSO_UNVERIFIED"'));
        expect(sso.lastIndexOf('"SSO_UNVERIFIED"')).toBeGreaterThan(verified);
        expect(sso.match(/"SSO_UNVERIFIED"/g)).toHaveLength(2);
    });
});

// 2026-10-07 오너: "응 전체 로그인화면을 팝업이 기본이 되게 설정 잘해줘"
describe("팝업이 기본 — 로그인하러 보내는 길도 예시 홈 위의 팝업이다", () => {
    const sheet = code(client("components/hiq/LoginSheet.tsx"));
    const landing = code(client("pages/hiq/landing.tsx"));

    it("호스트가 ?login=1 을 읽어 팝업을 열고 주소에서 지운다 — '경로가 바뀌면 닫는다'보다 뒤에서", () => {
        const host = sheet.slice(sheet.indexOf("export function LoginSheetHost()"));
        const close = host.indexOf("useEffect(() => { closeLoginSheet(); }, [location]);");
        const open = host.indexOf('if (!p.has("login")) return;');
        expect(close).toBeGreaterThan(0);
        expect(open).toBeGreaterThan(close);
        // '나'를 받는 중에는 기다리고, 로그인 화면(/ · /hiq …)에서는 손대지 않는다
        expect(host).toContain("if (authLoading || LOGIN_SCREEN.test(location)) return;");
        // 돌아갈 곳은 거른 값만(열린 리다이렉트 방지) · 표시는 주소에서 지운다(새로 고침·뒤로 가기에 다시 뜨지 않게)
        expect(host).toContain('const from = safeReturnPath(p.get("redirect")) ?? undefined;');
        expect(host).toContain('p.delete("login");');
        expect(host).toContain('p.delete("redirect");');
        // 이미 로그인돼 있으면 팝업 없이 가려던 곳으로
        const signedIn = host.indexOf("if (isLoggedIn) { setLocation(from ?? here, { replace: true }); return; }");
        const openAt = host.indexOf("setState({ open: true, opts: { from } });");
        expect(signedIn).toBeGreaterThan(open);
        expect(openAt).toBeGreaterThan(signedIn);
        expect(host).toContain("}, [search, location, authLoading, isLoggedIn, setLocation]);");
    });

    it("전체 로그인 화면이 남는 곳은 전화번호 길(?phone)과 매장 전용 주소뿐 — 나머지는 팝업으로 넘긴다", () => {
        const first = landing.slice(landing.indexOf("const [popupFirst] = useState(() => {"), landing.indexOf("const storeEntry ="));
        expect(first.length).toBeGreaterThan(0);
        expect(first).toContain('if (p.has("phone") || p.has("store")) return false;');
        expect(first).toContain('return resolveStoreSlug() === "hiq";');
        // 팝업의 '전화번호로 계속하기' · 가입 첫 단계의 '이전'은 전화번호 카드로 간다(phone = true)
        expect(sheet).toContain("const toPhone = () => go(loginPagePath(back, true));");
        // 카카오에서 못 끝내고 돌아온 사람도 팝업으로
        expect(code(client("pages/hiq/kakao-callback.tsx"))).toContain('return loginPagePath(safeReturnPath(back) ?? "/dashboard");');
    });

    it("자동으로 보내는 곳(골프 전용 문 · 크루 만들기)은 그 자리에 팝업을 띄우지 않고 보낸다 — 가는 곳이 예시 홈 + 팝업", () => {
        const gate = code(client("components/hiq/LoginGate.tsx"));
        const page = gate.slice(gate.indexOf("export function goLoginPage"), gate.indexOf("export function goLogin("));
        expect(page).toContain("setLocation(loginPagePath(back));");
        expect(page).not.toContain("openLoginSheet");
        expect(code(client("App.tsx"))).toContain("goLoginPage((to) => setLocation(to, { replace: true }), window.location.pathname + window.location.search);");
        expect(code(client("pages/hiq/create-club.tsx"))).toContain('if (isGuest) goLoginPage(setLocation, "/club/create");');
    });
});

// 2026-10-07 오너: "관리자 계정 핀번호 막자"
describe("관리자 계정은 번호 + PIN 으로 들이지 않는다 — PIN 이 닿는 길을 전부 같은 규칙으로", () => {
    const svc = root("server/services/hiqService.ts");

    it("전화번호 로그인: 소셜 로그인이 연결된 관리자 계정이면 PIN 을 보기 전에 거절한다", () => {
        const fn = svc.slice(svc.indexOf("    async login(phone: string, storeSlug: string, password?: string) {"), svc.indexOf("    async socialLogin("));
        const refuse = fn.indexOf("if (profile && isAdminRole(profile.role) && hasSocialLogin(profile)) {");
        expect(refuse).toBeGreaterThan(0);
        // PIN 단계(requiresPassword)로 넘기기 전 · PIN 대조 전
        expect(refuse).toBeLessThan(fn.indexOf("requiresPassword: true"));
        expect(refuse).toBeLessThan(fn.indexOf("verifyPassword(password, profile)"));
    });

    it("가입으로 프로필에 붙기: 관리자 프로필은 거절 — 'PIN 없는 프로필 채우기'보다 먼저 본다", () => {
        const fn = svc.slice(svc.indexOf("    async register("), svc.indexOf("    async getProfile") > 0 ? svc.indexOf("    async getProfile") : undefined);
        const admin = fn.indexOf("} else if (isAdminRole(profile.role)) {");
        const backfill = fn.indexOf("} else if (!profile.password) {");
        expect(admin).toBeGreaterThan(0);
        expect(backfill).toBeGreaterThan(admin);
        expect(fn.indexOf("verifyPassword(data.password, profile)")).toBeGreaterThan(backfill);
    });

    it("전화번호 계정 잇기: 관리자 계정이 받는 쪽이면 PIN 을 보지 않고 거절한다", () => {
        const fn = svc.slice(svc.indexOf("    async attachSocialToPhone("), svc.indexOf("    async register("));
        const refuse = fn.indexOf('if (profile && isAdminRole(profile.role)) return { kind: "not-allowed" };');
        expect(refuse).toBeGreaterThan(0);
        expect(refuse).toBeLessThan(fn.indexOf("verifyPassword(pin, profile)"));
        expect(root("server/routes/modules/auth.ts")).toContain('if (out.kind === "not-allowed") return sendError(res, 409, "err.auth.attachNotAllowed", "ATTACH_NOT_ALLOWED");');
        for (const l of LOCALES) expect(root(`shared/i18n/${l}.ts`), l).toMatch(/"err\.auth\.attachNotAllowed": "[^"\n]+"/);
    });

    it("바로 들어가기(SSO): 관리자는 소셜 로그인이 연결돼 있어야 관리 쿠키를 받는다", () => {
        const partner = root("server/routes/modules/partner.ts");
        const sso = partner.slice(partner.indexOf('router.post("/sso"'), partner.indexOf("const requirePartner"));
        const need = sso.indexOf("if (isAdmin && !hasSocialLogin(profile)) {");
        expect(need).toBeGreaterThan(0);
        expect(sso.indexOf("res.cookie('hiq_partner_auth'")).toBeGreaterThan(need);
    });

    it("문구는 왜 안 되는지와 어떻게 들어오는지를 말한다 — 소셜로 가입한 계정에도 맞는 말이다", () => {
        expect(root("shared/i18n/ko.ts")).toMatch(/"err\.auth\.socialAccountOnly": "[^"]*전화번호로 로그인할 수 없어요[^"]*카카오·구글·애플[^"]*"/);
    });
});

// 2026-10-07 오너: "지금 사장님이 없잖아 — 앞으로 사장님들이 신청·승인했을 때를 생각해서 진행하자"
describe("파트너(사장님) 신청 — 화면은 랭큐 계정으로 신청하게 이끈다", () => {
    const listing = code(client("pages/store-listing.tsx"));
    const reg = code(client("pages/store-register.tsx"));
    const entry = code(client("pages/partner/login.tsx"));

    it("매장 페이지: 비로그인이 '사장님이신가요?'를 누르면 로그인(팝업)부터 — 끝나면 신청 창이 이어서 열린다", () => {
        const open = listing.slice(listing.indexOf("const openClaim = () => {"), listing.indexOf("const search = useSearch();"));
        expect(open).toContain("if (isGuest) { goLogin(setLocation, `${window.location.pathname}?claim=1`); return; }");
        expect(listing).toContain("onClick={openClaim}");
        expect(listing).not.toContain("onClick={() => setClaimOpen(true)}");
        // ?claim=1 은 로그인한 뒤에만 읽고, 주소에서 지운다
        const eff = listing.slice(listing.indexOf("const search = useSearch();"), listing.indexOf("}, [member, search, setLocation]);"));
        expect(eff.indexOf("if (!member) return;")).toBeLessThan(eff.indexOf('if (!p.has("claim")) return;'));
        expect(eff).toContain('p.delete("claim");');
        expect(eff).toContain("setClaimOpen(true);");
    });

    it("매장 페이지: 내 신청이 확인 중이면 단추 대신 상태를 보여 준다 — 승인되지 않았으면 사유와 함께 다시 신청할 수 있다", () => {
        expect(listing).toContain('const myClaim = myApps?.applications.find((a) => a.kind === "claim" && a.listingCode === code);');
        expect(listing).toContain('{!s.claimed && myClaim?.status === "pending" && (');
        expect(listing).toContain('{!s.claimed && myClaim?.status === "rejected" && (');
        expect(listing).toContain('{!s.claimed && myClaim?.status !== "pending" && (');
        // 내 신청은 로그인했을 때만 묻는다
        expect(listing).toMatch(/queryKey: MY_APPS,[\s\S]{0,160}enabled: !!member,/);
        // 어느 계정으로 신청되는지 창 안에서 말한다
        expect(listing).toContain('{t.claimAccount.replace("{name}", member.name || "RANKUE")}');
    });

    it("새 매장 등록: '사장님입니다'는 로그인한 계정으로 — 비로그인에게는 제출 단추 대신 로그인 단추", () => {
        expect(reg).toContain('{kind === "owner" && isGuest ? (');
        expect(reg).toContain("onClick={() => goLogin(setLocation)}");
        expect(reg).toContain("{t.ownerLoginCta}");
        expect(reg).toContain('{member ? t.ownerAccount.replace("{name}", member.name || "RANKUE") : t.ownerLogin}');
    });

    it("두 화면의 새 문구는 다섯 언어 전부", () => {
        for (const [src, keys] of [[listing, ["claimAccount", "claimLoginTitle", "claimLoginDesc", "claimPending", "claimPendingDesc", "claimRejected", "claimRejectedWhy"]], [reg, ["ownerLogin", "ownerLoginCta", "ownerAccount"]]] as const) {
            for (const k of keys) expect(src.match(new RegExp(`\\b${k}: "`, "g")), k).toHaveLength(5);
        }
    });

    it("파트너 입구: 내 신청의 상태가 먼저, 번호·PIN 폼은 접어 둔다 — 로그인 상태가 바뀌면 다시 확인한다", () => {
        expect(entry).toContain('queryKey: ["/api/hiq/partner/applications"],');
        expect(entry).toContain("{apps.length > 0 && (");
        expect(entry).toContain("const [legacyOpen, setLegacyOpen] = useState(false);");
        const form = entry.indexOf("<form onSubmit={handleSubmit(onSubmit)}");
        expect(entry.lastIndexOf("{legacyOpen && (", form)).toBeGreaterThan(0);
        expect(entry.match(/<form /g)).toHaveLength(1);
        // '나'를 받는 중에는 기다렸다가 한 번만 묻는다
        expect(entry).toContain("if (authLoading) return;");
        expect(entry).toContain("}, [setLocation, toast, authLoading, memberId]);");
        // 비로그인은 그 자리에서 로그인(팝업) · 신청 결과를 기다리는 동안에는 새 신청을 앞세우지 않는다
        expect(entry).toContain("onClick={() => goLogin(setLocation)}");
        expect(entry).toContain("{!waiting && (");
    });

    it("사장님 화면의 나가기는 앱 로그인을 끊지 않는다 — 매장 관리에서만 나간다", () => {
        const dash = code(client("pages/partner/dashboard.tsx"));
        const out = dash.slice(dash.indexOf("const handleLogout = async () => {"), dash.indexOf("const todos") > 0 ? dash.indexOf("const todos") : dash.indexOf("const handleLogout = async () => {") + 900);
        expect(out).toContain('await apiRequest("/api/hiq/partner/logout", { method: "POST" });');
        expect(out).not.toContain('"/api/hiq/logout"');
        expect(out).not.toContain("queryClient.clear()");
        expect(out).toContain('setLocation("/menu");');
    });

    it("메뉴의 파트너 카드는 실제로 되는 것만 말한다 — '대회 개최'를 약속하지 않는다", () => {
        expect(client("lib/i18n/ko.ts")).toMatch(/"menu\.partnerPromoDesc": "[^"]*매장 페이지[^"]*회원[^"]*"/);
        for (const [l, word] of [["ko", /대회/], ["en", /event|tournament/i], ["es", /torneo/i], ["vi", /giải/i], ["tr", /turnuva/i]] as const) {
            const m = /"menu\.partnerPromoDesc": "([^"\n]*)"/.exec(client(`lib/i18n/${l}.ts`));
            expect(m, l).not.toBeNull();
            expect(m![1], l).not.toMatch(word);
        }
    });
});
