import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { twMerge } from "tailwind-merge";
import { QueryClient, QueryObserver, hashKey } from "@tanstack/react-query";
import { safeReturnPath } from "./promoFunnel.js";

/**
 * 가입·로그인 팝업(2026-10-06).
 * 오너: "랭큐 직접 들어가면 로그인 페이지인데 이것도 샘플로. 내가 원하는 것은 저 회원가입 화면보다 누구나 어떠한 플랫폼인지 알아가기 쉽게.
 *        회원가입은 실제로 하려고 할 때 저 화면보다는 올라오는 간편 회원가입 팝업으로." · "회원가입이 어색하지 않고 자연스럽게 디자인."
 *
 * 지키는 것(화면 코드의 시험이지만 shared 에 둔다 — vitest 가 client/src 에서는 sim·golf 만 읽는다. 소스를 읽어 검사한다):
 *  - '로그인'을 누르는 곳(goLogin)은 화면을 옮기지 않고 그 자리에서 팝업을 연다. 화면이 뜨자마자 자동으로 보내는 곳만 로그인 화면으로 간다.
 *  - 팝업은 앱에 하나이고, 로그인 화면에서는 열리지 않는다.
 *  - 팝업의 로그인은 '나'를 새로 받은 뒤에 닫히고, 가려던 곳이 따로 있을 때만 옮긴다 — 보던 화면에 그대로 남는다.
 *  - 그 자리에 남으므로, 이미 떠 있는 화면들이 새 '나'를 읽게 해 준다.
 *  - 랭큐 첫 주소(/)를 그냥 연 비로그인은 로그인 폼이 아니라 예시 홈을 본다.
 */
const ROOT = resolve(__dirname, "../client/src");
const client = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** 주석만 있는 줄을 뺀다 — 설명에 적힌 낱말이 검사를 통과시키거나 막지 않게 */
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const LOCALES = ["ko", "en", "es", "tr", "vi"] as const;
const dictValue = (locale: string, key: string) =>
    new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]*)"`).exec(client(`lib/i18n/${locale}.ts`))?.[1];

/** 골프 테마(index.css :root[data-sport="GOLF"])가 다른 색으로 바꿔 끼우는 유틸 */
const SWAPPED_UTIL = /\b(?:bg|text|border|ring|divide)-(?:white|black)\b/;
/** 12px 보다 작은 글자 */
const TINY_TEXT = /\btext-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/;

const sheetRaw = client("components/hiq/LoginSheet.tsx");
const sheet = code(sheetRaw);
const gate = code(client("components/hiq/LoginGate.tsx"));
const guest = code(client("components/hiq/GuestGate.tsx"));
const social = code(client("components/hiq/SocialLogin.tsx"));
const landing = code(client("pages/hiq/landing.tsx"));
const app = client("App.tsx");

describe("goLogin — 로그인 화면으로 옮기지 않고 팝업을 연다", () => {
    const goLogin = gate.slice(gate.indexOf("export function goLogin("), gate.indexOf("interface LoginGateProps"));
    const goLoginPage = gate.slice(gate.indexOf("export function goLoginPage("), gate.indexOf("export function goLogin("));

    it("팝업을 열고, 열렸으면 거기서 끝난다 — 화면을 옮기지 않는다", () => {
        expect(goLogin.length).toBeGreaterThan(0);
        const open = goLogin.indexOf("if (openLoginSheet({ from })) return;");
        const page = goLogin.indexOf("goLoginPage(setLocation, from);");
        expect(open).toBeGreaterThan(0);
        // 못 열었을 때만(호스트가 아직 없다 · 지금 화면이 로그인 화면이다) 예전처럼 로그인 화면으로 — 안전망
        expect(page).toBeGreaterThan(open);
        // goLogin 이 직접 주소를 옮기는 일은 없다
        expect(goLogin).not.toMatch(/setLocation\(/);
        expect(gate).toContain('import { loginPagePath, openLoginSheet } from "./LoginSheet";');
    });

    it("goLoginPage 는 보낸다 — 예시 홈 위의 팝업으로(/dashboard?login=1&redirect=<돌아올 곳>), 돌아올 곳이 없으면 지금 주소", () => {
        expect(goLoginPage).toContain('const back = from ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");');
        expect(goLoginPage).toContain("setLocation(loginPagePath(back));");
        expect(goLoginPage).not.toContain("openLoginSheet");
        const path = sheet.slice(sheet.indexOf("export function loginPagePath"), sheet.indexOf("export function openLoginSheet"));
        // 2026-10-07 오너 "전체 로그인화면을 팝업이 기본이 되게": 기본은 예시 홈 위의 팝업(/dashboard?login=1…), 전화번호 길만 로그인 화면(/?login=1&phone=1…)
        expect(path).toContain("? `/?login=1&phone=1&redirect=${encodeURIComponent(back)}`");
        expect(path).toContain(": `${LOGIN_SHEET_HOME}?login=1&redirect=${encodeURIComponent(back)}`;");
        expect(sheet).toContain('export const LOGIN_SHEET_HOME = "/dashboard";');
        expect(path).toContain("export function loginPagePath(back: string, phone = false): string {");
    });

    it("호스트가 아직 붙지 않았으면 열지 않고 false — goLogin 이 로그인 화면으로 보낸다", () => {
        const open = sheet.slice(sheet.indexOf("export function openLoginSheet"), sheet.indexOf("export function closeLoginSheet"));
        const noHost = open.indexOf('if (!hostMounted || typeof window === "undefined") return false;');
        const show = open.indexOf("setState({ open: true, opts });");
        expect(noHost).toBeGreaterThan(0);
        expect(show).toBeGreaterThan(noHost);
        expect(open.indexOf("return true;")).toBeGreaterThan(show);
        // 호스트가 붙고 떨어질 때 센다
        expect(sheet).toContain("hostMounted++;");
        expect(sheet).toContain("hostMounted--;");
    });

    it("가입 안내(useGuestGate().guard)도 같은 팝업 — 제목·설명·돌아갈 곳을 넘긴다. 가입 유도 한 줄(GuestJoinCta)의 단추도", () => {
        expect(guest).toContain("if (openLoginSheet({ from: o?.from, title: o?.title, desc: o?.desc })) return;");
        expect(guest).toContain("if (!isGuest) { run(); return; }");
        expect(guest).toContain("return { isGuest, guard, sheet: null };");
        expect(guest).toContain("onClick={() => goLogin(setLocation, from)}");
        // 자기 시트는 없다(안내 한 장 → 로그인 화면의 두 단계가 한 단계로)
        expect(guest).not.toContain("<Sheet");
    });
});

describe("화면이 뜨자마자 자동으로 보내는 곳 — 팝업이 아니라 로그인 화면(goLoginPage)", () => {
    it("골프 전용 문(GolfOnly): 아무것도 그리지 않는 문이라 빈 화면 위에 팝업이 뜨면 안 된다", () => {
        const fn = code(app.slice(app.indexOf("function GolfOnly"), app.indexOf("function AppRoutes")));
        expect(fn).toMatch(/goLoginPage\(\(to\) => setLocation\(to, \{ replace: true \}\), window\.location\.pathname \+ window\.location\.search\);/);
        expect(fn).not.toMatch(/\bgoLogin\(/);
        expect(fn).not.toContain("openLoginSheet");
    });

    it("크루 만들기: 주소로 바로 들어온 비로그인은 로그인 화면으로 — 제출을 눌렀을 때는 팝업", () => {
        const src = code(client("pages/hiq/create-club.tsx"));
        expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(isGuest\) goLoginPage\(setLocation, "\/club\/create"\);\s*\}, \[isGuest\]\);/);
        const submit = src.slice(src.indexOf("const handleSubmit = () => {"));
        expect(submit).toContain('if (isGuest) goLogin(setLocation, "/club/create");');
    });

    /** dir 아래의 화면 소스(.ts·.tsx, 시험 제외) */
    function sources(dir: string): string[] {
        return readdirSync(dir).flatMap((name) => {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) return sources(p);
            return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
        });
    }

    /** 이름이 name 인 함수를 부르는 곳인가 — goLogin(…) · React.useEffect(…) 둘 다 */
    const calls = (node: ts.Node, names: string[]): node is ts.CallExpression => {
        if (!ts.isCallExpression(node)) return false;
        const fn = node.expression;
        const name = ts.isIdentifier(fn) ? fn.text : ts.isPropertyAccessExpression(fn) ? fn.name.text : "";
        return names.includes(name);
    };

    /** 소스 한 파일에서, effect(useEffect·useLayoutEffect) 안에서 goLogin 을 부르는 줄 번호들 — 글자 맞추기가 아니라 문법 나무로 본다 */
    function autoPopups(file: string, text: string): number[] {
        const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const lines: number[] = [];
        const walk = (node: ts.Node, inEffect: boolean) => {
            if (inEffect && calls(node, ["goLogin"])) lines.push(sf.getLineAndCharacterOfPosition(node.getStart()).line + 1);
            const enters = inEffect || calls(node, ["useEffect", "useLayoutEffect"]);
            ts.forEachChild(node, (child) => walk(child, enters));
        };
        walk(sf, false);
        return lines;
    }

    // 새로 생기는 자동 호출도 막는다
    it("어느 화면도 effect 안에서 goLogin(팝업)을 부르지 않는다 — 누르지도 않았는데 팝업이 올라오면 안 된다", () => {
        const callers = sources(ROOT).filter((p) => /\bgoLogin\(/.test(readFileSync(p, "utf8")));
        // 부르는 곳이 스무 군데가 넘는다 — 검사가 빈 목록으로 지나가지 않았는지 확인
        expect(callers.length).toBeGreaterThanOrEqual(20);
        for (const file of callers) expect(autoPopups(file, readFileSync(file, "utf8")), file).toEqual([]);
        // 검사 자체가 잡는지 — 자동으로 부르는 꼴과 눌러서 부르는 꼴
        expect(autoPopups("a.tsx", "useEffect(() => { if (isGuest) goLogin(setLocation); }, [isGuest]);")).toEqual([1]);
        expect(autoPopups("b.tsx", "React.useEffect(() => {\n  void (async () => { goLogin(nav, '/x'); })();\n});")).toEqual([2]);
        expect(autoPopups("c.tsx", "useEffect(() => { goLoginPage(setLocation); }, []);\nconst press = () => goLogin(setLocation);")).toEqual([]);
    });
});

describe("호스트(LoginSheetHost) — 앱에 하나, 로그인 화면에서는 열지 않는다", () => {
    it("App 에 한 번 — 약관 동의(TermsConsentProvider) 안쪽, 화면(AppRoutes) 다음", () => {
        expect(app).toContain('import { LoginSheetHost } from "@/components/hiq/LoginSheet";');
        expect(app.match(/<LoginSheetHost \/>/g)).toHaveLength(1);
        const at = app.indexOf("<LoginSheetHost />");
        // 바깥에 두면 useTermsGate 가 기본값(항상 통과)을 돌려줘 소셜 첫 가입이 약관 동의 없이 지나간다
        expect(at).toBeGreaterThan(app.indexOf("<TermsConsentProvider>"));
        expect(at).toBeGreaterThan(app.indexOf("<AppRoutes />"));
        expect(at).toBeLessThan(app.indexOf("</TermsConsentProvider>"));
        const terms = client("components/hiq/TermsConsent.tsx");
        expect(terms).toContain("ask: async () => true,");
    });

    it("로그인 화면('/' · '/hiq' · '/register' · '/auth/…')에서는 열지 않는다 — 그 화면이 곧 로그인이다(구글 단추는 전역 하나)", () => {
        const m = /const LOGIN_SCREEN = \/(.+)\/;/.exec(sheet);
        expect(m).toBeTruthy();
        const re = new RegExp(m![1]);
        for (const path of ["/", "/hiq", "/register", "/auth/kakao", "/auth/x/y"]) expect(re.test(path), path).toBe(true);
        for (const path of [
            "/dashboard", "/hiq/dashboard", "/golf/courses", "/golf/course/어느골프장", "/pba-player/123", "/menu", "/club/create",
            "/registered", "/register/x", "/author", "/authors/1", "/golf/auth/x", "/online-game",
        ]) expect(re.test(path), path).toBe(false);
        // 여는 함수가 열기 전에 본다 — 주소 표시줄의 경로로(앱도 같은 주소를 쓴다)
        const open = sheet.slice(sheet.indexOf("export function openLoginSheet"), sheet.indexOf("export function closeLoginSheet"));
        const check = open.indexOf("if (LOGIN_SCREEN.test(window.location.pathname)) return false;");
        expect(check).toBeGreaterThan(0);
        expect(check).toBeLessThan(open.indexOf("setState({ open: true, opts });"));
    });

    it("화면(경로)이 바뀌면 닫힌다 — 뒤로 가기 · 로그인 뒤 이동 · 로그인 화면으로 옮겨 감", () => {
        const host = sheet.slice(sheet.indexOf("export function LoginSheetHost"));
        expect(host).toContain("const [location, setLocation] = useLocation();");
        expect(host).toContain("useEffect(() => { closeLoginSheet(); }, [location]);");
        // 바깥 탭·ESC(Radix 가 onOpenChange(false) 로 알린다)
        expect(host).toContain("<Sheet open={s.open} onOpenChange={(open) => { if (!open) closeLoginSheet(); }}>");
    });

    it("열려 있는지 물어볼 수 있다 — 구독 가능한 작은 저장소(다른 팝업이 겹치지 않게)", () => {
        expect(sheet).toContain("export function isLoginSheetOpen(): boolean {");
        expect(sheet).toContain("export function subscribeLoginSheet(listener: () => void): () => void {");
        expect(sheet).toContain("export function useLoginSheetOpen(): boolean {");
        expect(sheet).toContain("return useSyncExternalStore(subscribeLoginSheet, isLoginSheetOpen, isLoginSheetOpen);");
        // 바뀔 때마다 구독자에게 알린다
        const set = sheet.slice(sheet.indexOf("function setState("), sheet.indexOf("export function subscribeLoginSheet"));
        expect(set).toContain("listeners.forEach((l) => l());");
        // 닫을 때 문구는 남긴다(내려가는 동안 글자가 바뀌지 않게)
        expect(sheet).toContain("if (state.open) setState({ open: false, opts: state.opts });");
    });

    it("색: 지금 종목이 골프면 어두운 시트, 아니면 밝은 시트", () => {
        expect(sheet).toContain('const tone: SheetTone = currentSport === "GOLF" ? "dark" : "light";');
        expect(sheet).toContain("const { currentSport } = useSport();");
    });
});

describe("모양 — 아래에서 올라오는 시트 하나", () => {
    it("아래에서 올라온다 · 손잡이 줄 · 앱 아이콘 · 제목과 한 줄 설명 · X", () => {
        expect(sheet).toContain('<SheetContent side="bottom" hideClose');
        // 위쪽만 둥글다
        expect(sheet).toContain("rounded-t-[24px]");
        expect(sheet).toContain('<span aria-hidden className={cn("h-1 w-10 rounded-full", c.grip)} />');
        const icon = sheet.slice(sheet.indexOf("<img"), sheet.indexOf("<SheetTitle"));
        expect(icon).toContain('src="/icon-192.png"');
        expect(icon).toContain("width={44}");
        expect(icon).toContain("h-11 w-11");
        expect(existsSync(resolve(__dirname, "../client/public/icon-192.png"))).toBe(true);
        // 부른 쪽(guard)이 준 제목·설명이 있으면 그것, 없으면 기본 문구
        expect(sheet).toContain('{opts.title ?? t("loginSheet.title")}</SheetTitle>');
        expect(sheet).toContain('{opts.desc ?? t("loginSheet.desc")}</SheetDescription>');
        expect(sheet).toContain('aria-label={t("loginSheet.close")}');
        expect(sheet).toMatch(/<button\s+type="button"\s+onClick=\{closeLoginSheet\}/);
    });

    // 보이는 판은 안쪽(LoginSheetPanel)이고, 공용 시트의 바깥 틀은 자리만 잡는다. 공용 시트의 기본 클래스(bg-white · border-t · p-6 · 그림자)가
    // 남으면 둥근 모서리 뒤로 네모난 판이 비친다 — 골프 테마는 bg-white 를 어두운 색으로 바꿔 끼우므로 더 눈에 띈다. 실제 합치기 도구로 확인한다.
    it("바깥 틀은 투명하다 — 공용 시트의 흰 바탕·윗선·안쪽 여백·그림자가 남지 않는다. 넓은 화면에서는 앱 폭으로 가운데", () => {
        const ui = client("components/ui/sheet.tsx");
        const base = /const sheetVariants = cva\(\s*"([^"]+)"/.exec(ui)?.[1];
        const bottom = /bottom:\s*"([^"]+)"/.exec(ui)?.[1];
        const mine = /<SheetContent side="bottom" hideClose className="([^"]+)">/.exec(sheet)?.[1];
        expect(base).toBeTruthy();
        expect(bottom).toBeTruthy();
        expect(mine).toBeTruthy();
        // SheetContent 가 하는 것과 같은 순서: cn(sheetVariants({ side }), className)
        const merged = twMerge(`${base} ${bottom}`, mine).split(/\s+/);
        for (const gone of ["bg-white", "border-t", "p-6"]) expect(merged, gone).not.toContain(gone);
        expect(merged.filter((c) => c.startsWith("shadow-"))).toEqual(["shadow-none"]);
        for (const kept of ["bg-transparent", "border-0", "p-0", "fixed", "z-50", "inset-x-0", "bottom-0", "mx-auto", "max-w-[448px]"]) expect(merged, kept).toContain(kept);
        // 올라오고 내려가는 움직임은 공용 시트 그대로
        expect(merged).toContain("data-[state=open]:slide-in-from-bottom");
        expect(merged).toContain("data-[state=closed]:slide-out-to-bottom");
        // 약관 동의 창(z-50, 나중에 붙는다)이 이 팝업 **위**에 떠야 한다 — 팝업의 z 를 올리면 약관 창이 뒤로 숨는다
        expect(merged.filter((c) => /^z-/.test(c))).toEqual(["z-50"]);
        expect(client("components/ui/dialog.tsx")).toContain("fixed left-[50%] top-[50%] z-50 ");
    });

    it("아래로 끌어 닫는다 — 충분히 내렸거나 빠르게 내렸을 때만, 아니면 제자리로", () => {
        for (const h of ["onPointerDown={onGripDown}", "onPointerMove={onGripMove}", "onPointerUp={(e) => endGrip(e, false)}", "onPointerCancel={(e) => endGrip(e, true)}"]) {
            expect(sheet, h).toContain(h);
        }
        expect(sheet).toContain("if (!cancelled && (dy > DRAG_CLOSE_PX || flick)) closeLoginSheet();");
        expect(sheet).toContain("else setDragY(0);");
        // 위로는 끌리지 않는다
        expect(sheet).toContain("setDragY(Math.max(0, e.clientY - g.y0));");
        // 끄는 동안 브라우저가 화면을 굴리지 않게
        expect(sheet).toContain("touch-none");
    });

    // 2026-10-06 검토: 예전 단언은 "단추 묶음 → 또는 → 전화번호(밑줄 글씨)" 한 가지 순서였다. 그런데 카카오가 꺼진 지금 한국어 화면에서
    // 로그인 화면(landing)은 전화번호 카드를 먼저 그리는데 팝업만 구글·애플을 크게 먼저 보여서, 전화번호로 가입한 기존 회원이 구글을 누르면
    // 빈 새 계정이 생기고 기록이 갈렸다. 한국어는 로그인 화면과 같은 규칙으로 순서를 정한다.
    it("단추 묶음은 SocialLogin 재사용 — 순서는 로그인 화면과 같은 규칙: 한국어는 카카오가 되는 곳만 소셜이 먼저, 아니면 전화번호가 먼저", () => {
        // 묶음은 한 번만 만든다(순서가 어느 쪽이든 한 팝업에 하나만 붙는다 — 구글 단추 GIS 는 전역 하나다)
        expect(sheet.match(/<SocialLogin /g)).toHaveLength(1);
        expect(sheet).toContain("const socialButtons = <SocialLogin hint={false} kakao={!storeEntry} tone={tone} redirect={back} onDone={done} secondaryRow={kakaoShown ? secondaryRow : undefined} />;");
        // 판정: 카카오 단추가 실제로 그려지는가(SocialLogin 의 showKakao 와 같은 식) → 한국어는 그때만 소셜이 먼저
        expect(sheet).toContain('const kakaoShown = !storeEntry && locale === "ko" && kakaoLoginAvailable();');
        expect(sheet).toContain('const phoneFirst = locale === "ko" ? !kakaoShown : !social;');
        expect(social).toContain('const showKakao = kakao && locale === "ko" && kakaoLoginAvailable();');
        // 로그인 화면의 식과 같은 꼴이다(landing: 한국어면 !kakaoFirst, 아니면 소셜을 못 쓸 때만 전화)
        expect(landing).toContain('const kakaoFirst = locale === "ko" && kakaoLoginAvailable() && !storeEntry;');
        expect(landing).toContain('(locale === "ko" ? !kakaoFirst : !socialLoginAvailable(locale))');

        const body = sheet.slice(sheet.indexOf("{!social ? ("));
        const only = body.indexOf("phoneButton");
        const first = body.indexOf(") : phoneFirst ? (");
        const socialFirst = body.indexOf(") : (", first + 1);
        expect(only).toBeGreaterThan(0);
        expect(first).toBeGreaterThan(only);
        expect(socialFirst).toBeGreaterThan(first);
        // 전화번호가 먼저: 큰 단추 → 또는 → 소셜 묶음
        const phoneFirstBlock = body.slice(first, socialFirst);
        const a = phoneFirstBlock.indexOf("{phoneButton}");
        const b = phoneFirstBlock.indexOf("{orRule}");
        const c = phoneFirstBlock.indexOf("{socialButtons}");
        expect(a).toBeGreaterThan(0);
        expect(b).toBeGreaterThan(a);
        expect(c).toBeGreaterThan(b);
        // 소셜이 먼저: 소셜 묶음 → 또는 → 전화번호(밑줄 글씨)
        const socialFirstBlock = body.slice(socialFirst);
        const x = socialFirstBlock.indexOf("{socialButtons}");
        const y = socialFirstBlock.indexOf("{orRule}");
        const z = socialFirstBlock.indexOf("onClick={toPhone}");
        expect(x).toBeGreaterThan(0);
        expect(y).toBeGreaterThan(x);
        expect(z).toBeGreaterThan(y);
        expect(socialFirstBlock).toContain('{t("loginSheet.phone")}');
        // 큰 전화번호 단추는 소셜 단추와 같은 높이(48px) · 같은 모서리
        const phoneButton = sheet.slice(sheet.indexOf("const phoneButton = ("), sheet.indexOf("return (", sheet.indexOf("const phoneButton = (")));
        expect(phoneButton).toContain('"h-12 w-full rounded-[12px] text-[15px] font-bold transition-transform active:scale-[0.98]", c.phone');
        expect(phoneButton).toContain("onClick={toPhone}");
        expect(sheet).toContain('{t("login.or")}');
        // 지금의 로그인 화면으로 — 돌아올 곳을 싣고, 전화번호 카드부터 열리게 표시한다
        expect(sheet).toContain("const toPhone = () => go(loginPagePath(back, true));");
        // 돌아올 곳: 부른 쪽이 준 주소(우리 사이트 안의 경로만), 없으면 지금 주소
        expect(sheet).toContain("const here = window.location.pathname + window.location.search;");
        expect(sheet).toContain("const back = safeReturnPath(s.opts.from) ?? here;");
        expect(safeReturnPath("/golf/courses?alert=1")).toBe("/golf/courses?alert=1");
        expect(safeReturnPath("//evil.example")).toBeNull();
    });

    // 2026-10-05 검토에서 로그인 화면에 넣은 두 안내가 팝업에는 없었다 — '로그인'을 누르면 이제 팝업이 먼저 뜨므로, 소셜 단추를 누르는 사람은
    // 그 화면을 거치지 않는다. 카카오 스위치가 켜지는 순간 코드 변경 없이 드러날 구멍이었다.
    it("계정이 갈리기 전에 알린다 — 카카오가 먼저인 팝업의 기존 전화번호 회원 안내 · 앱 안의 '카카오 가입자는 웹에서'", () => {
        // 2026-10-06 바뀐 것(앱 안 카카오 로그인 — 새 바이너리의 네이티브 플러그인): import 에 kakaoNativeAvailable 이 늘고, 앱 안 안내의 조건 끝에
        // `&& !kakaoNativeAvailable()` 가 붙었다. 카카오 단추가 있는 새 앱에는 "앱에는 아직 카카오 로그인이 없어"가 거짓말이라 띄우지 않는다 —
        // 플러그인이 없는 앱(1.2 이하)에는 예전 조건 그대로 뜬다(shared/kakaoNative.test.ts 가 그 판별을 지킨다).
        expect(sheet).toContain('import { kakaoLoginAvailable, kakaoLoginOpen, kakaoNativeAvailable } from "@/lib/kakaoLogin";');
        expect(sheet).toContain('import { isNativeApp } from "@/lib/nativeBridge";');
        // 조건은 로그인 화면과 같은 식 — 둘 다 스위치가 꺼지면 false 라, 닫혀 있는 동안 '카카오'라는 말이 어디에도 나오지 않는다
        expect(sheet).toContain('const kakaoWebOnlyHint = kakaoLoginOpen() && locale === "ko" && isNativeApp() && !kakaoNativeAvailable();');
        expect(landing).toContain('const kakaoWebOnlyHint = kakaoLoginOpen() && locale === "ko" && isNativeApp() && !kakaoNativeAvailable();');
        // (2026-10-06 미리보기: 스위치 = kakaoSwitchOn — 공개 스위치 || 이 기기의 미리보기 깃발. 깃발이 없으면 공개 스위치 그대로다)
        const lib = client("lib/kakaoLogin.ts");
        expect(lib).toMatch(/export function kakaoLoginAvailable\(\): boolean \{\s*if \(!kakaoSwitchOn\(\)\) return false;/);
        expect(lib).toContain("return kakaoSwitchOn() && !!KAKAO_JS_KEY;");
        expect(lib).toMatch(/function kakaoSwitchOn\(\): boolean \{\s*return KAKAO_OPEN \|\| kakaoPreviewOn\(\);\s*\}/);
        // 기존 회원 안내: 카카오 단추가 그려질 때만, '또는' 줄 뒤 · 전화번호 단추 바로 위(안내가 가리키는 길이 바로 아래 단추다)
        const body = sheet.slice(sheet.indexOf("{!social ? ("));
        // 2026-10-07 주·보조 정리(오너: "한국은 카카오 구글이 주 가입버튼, 애플이나 핸드폰번호는 서브"): 안내는 보조 줄(secondaryRow) 안으로 옮겼다 —
        // '또는' 줄 뒤 · 전화번호 링크 바로 위는 그대로다. 보조 줄은 카카오 단추가 그려질 때만 SocialLogin 에 넘긴다.
        const row = sheet.slice(sheet.indexOf("const secondaryRow = ("), sheet.indexOf("const socialButtons = "));
        const hint = row.indexOf('{t("login.phoneExistingHint")}');
        expect(hint).toBeGreaterThan(row.indexOf("{orRule}"));
        expect(row.indexOf("onClick={toPhone}")).toBeGreaterThan(hint);
        expect(sheet).toContain("secondaryRow={kakaoShown ? secondaryRow : undefined}");
        // 카카오가 되는 곳의 팝업은 묶음 하나뿐이다 — '또는'·안내·전화번호·애플(웹)은 보조 줄이 그린다
        expect(body).toMatch(/\) : kakaoShown \? \(\s*(?:\/\/[^\n]*\n\s*)*socialButtons\s*\) : \(/);
        // 애플(웹)은 전화번호 옆의 작은 링크 — SocialLogin 이 넘겨줄 때만(iOS 앱에서는 null: 애플 단추가 큰 묶음에 남는다 · App Store 4.8)
        expect(row.indexOf("{apple && (")).toBeGreaterThan(row.indexOf("onClick={toPhone}"));
        expect(row).toContain("onClick={apple.onClick}");
        expect(row).toContain("disabled={apple.disabled}");
        // 앱 안 안내: 단추 묶음 아래 · 약관 줄 위
        const webOnly = body.indexOf('{t("login.kakaoWebOnly")}');
        expect(body.lastIndexOf("{kakaoWebOnlyHint && (", webOnly)).toBeGreaterThan(body.lastIndexOf("onClick={toPhone}", webOnly));
        expect(body.indexOf("{legal.map(")).toBeGreaterThan(webOnly);
        // 색은 약관 줄과 같은 것(밝은 쪽 토큰 · 어두운 쪽 리터럴) — 새 클래스를 만들지 않는다. 글자 12px
        for (const key of ["login.phoneExistingHint", "login.kakaoWebOnly"]) {
            const line = sheet.split("\n").find((l) => l.includes(`{t("${key}")}`))!;
            expect(line, key).toContain("text-[12px]");
            expect(line, key).toContain(", c.legal)}>");
        }
    });

    it("세 단추는 같은 폭·같은 높이(48px)·같은 모서리 — 카카오(켜졌을 때만) · 구글 · 애플 순서", () => {
        expect(social).toContain('const SHEET_BTN = "w-full h-12 rounded-[12px] flex items-center justify-center gap-2.5 text-[15px] font-medium";');
        const looks = social.slice(social.indexOf("const SHEET_LOOK"), social.indexOf("const GIS_STRETCH_Y"));
        for (const tone of ["light", "dark"]) {
            const block = looks.slice(looks.indexOf(`  ${tone}: {`), looks.indexOf("  },", looks.indexOf(`  ${tone}: {`)));
            for (const key of ["google", "apple", "appleWeb", "update"]) expect(block, `${tone} ${key}`).toMatch(new RegExp(`${key}: \`\\$\\{SHEET_BTN\\} `));
        }
        // 카카오 단추: 팝업에서는 높이만 48px(모서리 12px·색은 카카오 가이드 그대로)
        const web = social.slice(social.indexOf("if (!GOOGLE_CLIENT_ID && !showKakao) return null;"));
        expect(web).toContain('className={`w-full ${sheet ? "h-12" : "h-[44px]"} rounded-[12px] bg-[#FEE500] text-[#191919] ');
        const kakao = web.indexOf("{showKakao && (");
        const google = web.indexOf("{GOOGLE_CLIENT_ID && sheet && (");
        const apple = web.indexOf("onClick={handleAppleWeb}");
        expect(kakao).toBeGreaterThan(0);
        expect(google).toBeGreaterThan(kakao);
        expect(apple).toBeGreaterThan(google);
        // 구글: 보이는 것은 우리 단추(48px), 눌리는 것은 그 위에 투명하게 덮은 공식 GIS 단추(40px 고정)를 세로로 늘린 것 — 칸을 꼭 덮는다
        expect(social).toContain("const GIS_STRETCH_Y = 1.25;");
        expect(40 * 1.25).toBeGreaterThanOrEqual(48);
        const overlay = web.slice(google, web.indexOf("{GOOGLE_CLIENT_ID && !sheet && ("));
        expect(overlay).toContain('<div className="absolute inset-0 opacity-0">');
        expect(overlay).toContain("ref={googleBtnRef}");
        expect(overlay).toContain("${GIS_STRETCH_Y})`");
        expect(overlay).toContain('<span aria-hidden className="pointer-events-none flex items-center gap-2.5">');
    });

    // 2026-10-06 검토: 팝업의 구글 단추는 보이는 그림(aria-hidden) 위에 투명한 GIS 단추(다른 출처의 iframe)를 덮은 것이라, Tab 으로 돌 때
    // 구글 차례에만 화면 어디에도 초점 표시가 없었다(닫기 · 애플 · 전화번호는 브라우저 기본 테가 나온다).
    it("팝업의 구글 단추에 키보드 초점이 오면 우리가 그린 틀에 테를 단다 — iframe 안의 초점은 CSS 로 잡히지 않아 직접 알아낸다", () => {
        // 색은 리터럴(밝은 시트 · 어두운 시트 각각), 로그인 화면은 공식 단추가 그대로 보여 따로 그리지 않는다
        const looks = social.slice(social.indexOf("const SHEET_LOOK"), social.indexOf("const GIS_STRETCH_Y"));
        expect(looks).toContain('googleFocus: "outline outline-2 outline-offset-2 outline-[#1A73E8]",');
        expect(looks).toContain('googleFocus: "outline outline-2 outline-offset-2 outline-[#8AB4F8]",');
        expect(social.slice(social.indexOf("const PAGE_LOOK"), social.indexOf("const SHEET_BTN"))).toContain('googleFocus: "",');
        // 초점이 iframe 으로 들어가면 이 창에 blur 가 나고 activeElement 가 그 iframe 이 된다 — 그때 GIS 칸 안에 초점이 있는지 본다
        const effect = social.slice(social.indexOf("if (!sheet || inApp || !GOOGLE_CLIENT_ID) return;"), social.indexOf("const submitToken = useCallback("));
        expect(effect.length).toBeGreaterThan(0);
        expect(effect).toContain("setGisFocused(!!box && box.contains(document.activeElement));");
        for (const on of ['window.addEventListener("blur", check);', 'window.addEventListener("focus", check);', 'document.addEventListener("focusin", check);', 'document.addEventListener("focusout", check);']) {
            expect(effect, on).toContain(on);
            expect(effect, on).toContain(on.replace("addEventListener", "removeEventListener"));
        }
        // 테는 React 가 가진 바깥 틀에 단다 — GIS 가 소유한 칸(googleBtnRef 안쪽)과 투명한 덮개는 건드리지 않는다
        const web = social.slice(social.indexOf("if (!GOOGLE_CLIENT_ID && !showKakao) return null;"));
        expect(web).toContain('${gisFocused ? ` ${look.googleFocus}` : ""}`}>');
        expect(web).toContain('<div className="absolute inset-0 opacity-0">');
    });

    it("두 색 모두에서 읽힌다 — 어두운 쪽은 리터럴 색만, 12px 보다 작은 글자 없음, 기본 confirm/alert 없음", () => {
        expect(sheet).not.toMatch(SWAPPED_UTIL);
        expect(sheet).not.toMatch(/\bbg-card\b/);
        expect(sheet).not.toMatch(TINY_TEXT);
        expect(sheet).not.toMatch(/(?<![.\w])(?:confirm|alert)\(/);
        // 팝업의 어두운 모양표: 색이 붙는 클래스는 전부 [#……] 꼴
        const colored = /(?:^|[\s"`])(?:active:)?(?:bg|text|border)-(?!\[#)([a-z][\w/.[\]-]*)/g;
        const sheetDark = sheet.slice(sheet.indexOf("    dark: {"), sheet.indexOf("    },", sheet.indexOf("    dark: {")));
        expect(sheetDark.length).toBeGreaterThan(0);
        expect(Array.from(sheetDark.matchAll(colored), (x) => x[0].trim())).toEqual([]);
        const looks = social.slice(social.indexOf("const SHEET_LOOK"), social.indexOf("const GIS_STRETCH_Y"));
        const socialDark = looks.slice(looks.indexOf("  dark: {"));
        // 글자 크기·정렬(text-[13px] · text-center)은 색이 아니다
        const dark = Array.from(socialDark.matchAll(colored), (x) => x[1]).filter((v) => !/^(?:center|\[\d)/.test(v));
        expect(dark).toEqual([]);
        // 팝업 모양표 전체(밝은 쪽 포함)에 테마가 바꿔 끼우는 유틸이 없다 — 밝은 쪽은 토큰과 회사 가이드 색(리터럴)
        expect(social.slice(social.indexOf("const SHEET_BTN"), social.indexOf("const GIS_STRETCH_Y"))).not.toMatch(SWAPPED_UTIL);
        expect(looks).not.toMatch(TINY_TEXT);
        // 어두운 시트에서 애플 단추는 흰색으로 뒤집는다(검정 단추는 어두운 바탕에 묻힌다)
        expect(socialDark).toContain("apple: `${SHEET_BTN} bg-[#FFFFFF] text-[#000000] ");
    });

    it("로그인 화면(tone 을 안 줬을 때)의 모양은 예전 그대로다", () => {
        const page = social.slice(social.indexOf("const PAGE_LOOK"), social.indexOf("const SHEET_BTN"));
        for (const line of [
            'stack: "w-full flex flex-col items-center gap-3",',
            'hint: "text-[12px] font-medium text-black/55 text-center",',
            'google: "w-full max-w-[320px] h-[44px] rounded-full bg-white border border-black/15 flex items-center justify-center gap-2.5 text-[15px] font-medium text-black/80 disabled:opacity-40 active:scale-[0.98] transition-transform",',
            'apple: "w-full max-w-[320px] h-[44px] rounded-full bg-black text-white flex items-center justify-center gap-2 text-[15px] font-medium disabled:opacity-40 active:scale-[0.98] transition-transform",',
            'appleWeb: "w-full h-[44px] rounded-full bg-black text-white flex items-center justify-center gap-2 text-[15px] font-medium disabled:opacity-40 transition-opacity",',
            'busy: "text-[12px] text-black/40",',
        ]) expect(page, line).toContain(line);
        expect(social).toContain("const look = tone ? SHEET_LOOK[tone] : PAGE_LOOK;");
        // 로그인 화면의 구글 단추는 보이는 공식 GIS 단추 그대로(44px 행)
        const web = social.slice(social.indexOf("if (!GOOGLE_CLIENT_ID && !showKakao) return null;"));
        const legacy = web.slice(web.indexOf("{GOOGLE_CLIENT_ID && !sheet && ("), web.indexOf("{APPLE_SERVICES_ID && ("));
        expect(legacy).toContain('<div className="w-full flex justify-center items-center h-[44px] relative">');
        expect(legacy).toContain("<div ref={googleBtnRef} />");
        // 로그인 화면은 새 prop 을 주지 않는다
        for (const use of landing.match(/<SocialLogin [^>]*\/>/g) ?? []) expect(use, use).not.toMatch(/tone=|redirect=|onDone=/);
    });
});

describe("문구 — 다섯 언어 사전, 약관 링크", () => {
    const KEYS = ["loginSheet.title", "loginSheet.desc", "loginSheet.phone", "loginSheet.legal", "loginSheet.terms", "loginSheet.privacy", "loginSheet.close"];

    it("팝업이 쓰는 키가 ko·en·es·tr·vi 에 전부, 한 번씩 있다", () => {
        const used = Array.from(sheet.matchAll(/t\("([A-Za-z]+\.[A-Za-z0-9]+)"\)/g), (m) => m[1]);
        // login.phoneExistingHint · login.kakaoWebOnly — 계정이 갈리기 전의 두 안내(2026-10-06 검토, 로그인 화면과 같은 키를 쓴다)
        // login.continueApple — 보조 줄의 애플 링크(2026-10-07, 큰 애플 단추와 같은 키)
        expect(new Set(used)).toEqual(new Set([...KEYS, "login.or", "login.phoneExistingHint", "login.kakaoWebOnly", "login.continueApple"]));
        for (const l of LOCALES) {
            const dict = client(`lib/i18n/${l}.ts`);
            for (const key of used) {
                expect(dictValue(l, key)?.trim(), `${l} ${key}`).toBeTruthy();
                // 같은 키가 두 번 있으면 뒤의 것이 조용히 이긴다
                expect(dict.split(`"${key}":`).length - 1, `${l} ${key}`).toBe(1);
            }
        }
    });

    it("한국어 문구", () => {
        expect(dictValue("ko", "loginSheet.title")).toBe("랭큐 시작하기");
        expect(dictValue("ko", "loginSheet.desc")).toBe("기록을 쌓으려면 계정이 필요해요. 보던 화면에서 바로 이어집니다.");
        expect(dictValue("ko", "loginSheet.phone")).toBe("전화번호로 계속하기");
        expect(dictValue("ko", "loginSheet.legal")).toBe("계속하면 {terms}과 {privacy}에 동의하게 됩니다");
        expect(dictValue("ko", "loginSheet.terms")).toBe("이용약관");
        expect(dictValue("ko", "loginSheet.privacy")).toBe("개인정보처리방침");
    });

    it("약관 안내 — 두 낱말이 /terms · /privacy 링크다(다섯 언어 모두 자리 표시가 하나씩)", () => {
        for (const l of LOCALES) {
            const line = dictValue(l, "loginSheet.legal")!;
            expect(line.split("{terms}").length - 1, l).toBe(1);
            expect(line.split("{privacy}").length - 1, l).toBe(1);
        }
        expect(sheet).toContain('const legal = t("loginSheet.legal").split(/(\\{terms\\}|\\{privacy\\})/);');
        expect(sheet).toContain('part === "{terms}" ? legalLink("/terms", t("loginSheet.terms"))');
        expect(sheet).toContain(': part === "{privacy}" ? legalLink("/privacy", t("loginSheet.privacy"))');
        const link = sheet.slice(sheet.indexOf("const legalLink = "), sheet.indexOf("return (", sheet.indexOf("const legalLink = ") + 80));
        expect(link).toContain("href={to}");
        // 형제 key 가 겹치지 않는다 — 링크는 주소, 글자 조각은 순번
        expect(link).toContain("key={to}");
        expect(sheet).toContain("<span key={`text-${i}`}>{part}</span>");
        // 두 문서 화면이 실제로 있다
        expect(app).toContain('<Route path="/terms" component={Terms} />');
        expect(app).toContain('<Route path="/privacy" component={Privacy} />');
    });

    it("사실과 다른 약속·술·돈·내기 말이 없다", () => {
        for (const key of KEYS) {
            const line = dictValue("ko", key)!;
            expect(line, key).not.toMatch(/\d\s*초|바로 가입|즉시|무료|혜택|포인트/);
            expect(line, key).not.toMatch(/술|맥주|소주|내기|판돈|\d\s*원|만\s*원/);
        }
    });
});

describe("팝업의 로그인 — '나'를 새로 받은 뒤에 닫고, 가려던 곳이 따로 있을 때만 옮긴다", () => {
    const submit = social.slice(social.indexOf("const submitToken = useCallback("), social.indexOf("const nativeSignIn = useCallback("));
    const finish = social.slice(social.indexOf("const finishInPlace = useCallback("), social.indexOf("const showKakao ="));

    it("순서: 약관 동의(기존 흐름) → refreshAfterLogin → 닫기(onDone) → 이동", () => {
        const terms = submit.indexOf('const agreed = await askTerms("signup");');
        const fresh = submit.indexOf("await refreshAfterLogin();");
        const inPlace = submit.indexOf("if (given.current.redirect !== undefined) { finishInPlace(back); return; }");
        expect(terms).toBeGreaterThan(0);
        expect(fresh).toBeGreaterThan(terms);
        expect(inPlace).toBeGreaterThan(fresh);
        const close = finish.indexOf("given.current.onDone?.();");
        const move = finish.indexOf("setLocation(dest, ");
        expect(close).toBeGreaterThan(0);
        expect(move).toBeGreaterThan(close);
        // 팝업 쪽: 끝났다는 알림에 닫는다
        const done = sheet.slice(sheet.indexOf("const done = useCallback("), sheet.indexOf("const storeEntry"));
        expect(done).toContain("closeLoginSheet();");
    });

    it("가려던 곳이 없거나 지금 주소와 같으면 그 자리에 그대로 — 새 회원도 같다(서버가 준 홈 주소로 보내지 않는다)", () => {
        expect(finish).toContain("const dest = safeReturnPath(back);");
        expect(finish).toContain("if (!dest || dest === window.location.pathname + window.location.search) return;");
        // 같은 화면에 표시만 붙는 주소(?alert=1 등)는 자리를 바꿔 끼운다
        expect(finish).toContain("setLocation(dest, { replace: dest.split(/[?#]/)[0] === window.location.pathname });");
        // 팝업 갈래는 서버가 준 redirectTo 를 보지 않는다
        expect(finish).not.toContain("redirectTo");
    });

    it("SocialLogin 은 redirect prop 을 주소(?redirect=)보다 먼저 본다 — 안 주면 예전 그대로", () => {
        const returnTo = social.slice(social.indexOf("const returnTo = useCallback("), social.indexOf("const finishInPlace = useCallback("));
        expect(returnTo).toContain('return fromCaller !== undefined ? fromCaller : new URLSearchParams(window.location.search).get("redirect");');
        expect(submit).toContain("const back = returnTo();");
        // 로그인 화면(prop 없음)의 마무리는 한 글자도 바뀌지 않았다
        expect(submit).toContain('setLocation(back?.startsWith("/") ? back : (j.data?.redirectTo || "/dashboard"));');
        // 부른 쪽 값은 ref 로 읽는다 — submitToken 이 흔들리면 구글 단추(GIS)가 다시 초기화된다
        expect(social).toContain("given.current = { redirect, onDone };");
        expect(submit).toMatch(/\}, \[setLocation, toast, t, askTerms, returnTo, finishInPlace\]\);\s*$/);
        expect(social).toContain("export default function SocialLogin({ hint = true, kakao = true, redirect, onDone, tone, secondaryRow }: SocialLoginProps) {");
    });
});

/**
 * 팝업의 로그인은 화면이 그대로다. refreshAfterLogin 은 옛 '나' 답을 통째로 버리고(removeQueries) 새 쿼리로 받는데,
 * TanStack Query 는 지워진 쿼리를 보던 구독자에게 알리지 않는다 — 그대로 두면 머리의 '로그인' 단추·예시 숫자가 남는다
 * ("로그인했는데 로그인이 안 됐다고 나온다"). 팝업이 그 구독자들을 적어 두었다가 새 답이 온 뒤 다시 맞춘다.
 */
describe("그 자리에 남는 로그인 — 이미 떠 있는 화면이 새 '나'를 읽는다", () => {
    const ME = ["/api/hiq/me"];
    const tick = () => new Promise((r) => setTimeout(r, 5));

    /** queryClient.refreshAfterLogin 과 같은 세 줄(그 파일의 소스가 그대로인지는 shared/loginRefresh.test.ts 가 지킨다) */
    async function refreshLikeApp(qc: QueryClient, member: unknown) {
        qc.removeQueries({ queryKey: ME });
        void qc.invalidateQueries();
        await qc.fetchQuery({ queryKey: ME, queryFn: async () => member, staleTime: 0 });
    }

    it("실제 라이브러리로: 지워진 '나'를 보던 구독자는 새 답을 모른다 → 같은 옵션으로 다시 맞추면 새 답에 붙고 화면에 알린다", async () => {
        const qc = new QueryClient();
        const seen: unknown[] = [];
        // 떠 있는 화면의 useAuth — 비로그인('나' = null)을 5분짜리 답으로 들고 있다
        const watcher = new QueryObserver(qc, { queryKey: ME, queryFn: async () => null, staleTime: 5 * 60 * 1000, retry: false });
        const stop = watcher.subscribe((r) => { seen.push(r.data); });
        await tick();
        expect(watcher.getCurrentResult().data).toBeNull();

        // queryClient 가 하는 일(lib/queryClient 5-0): '나' 쿼리가 지워질 때 그것을 보던 구독자를 적어 둔다
        const orphans = new Set<QueryObserver<any, any, any, any, any>>();
        const unwatch = qc.getQueryCache().subscribe((e) => {
            if (e.type === "removed" && e.query.queryHash === hashKey(ME)) e.query.observers.forEach((o) => orphans.add(o));
        });

        const member = { id: "m1", name: "회원" };
        await refreshLikeApp(qc, member);
        await tick();
        // 새 답은 캐시에 있다 — 그런데 떠 있던 구독자는 여전히 옛 답(null)이다. 이게 고쳐지면(라이브러리가 알리게 되면) 뒷정리는 없어도 된다
        expect(qc.getQueryData(ME)).toEqual(member);
        expect(watcher.getCurrentResult().data).toBeNull();
        expect(orphans.has(watcher)).toBe(true);

        // 다시 맞춘다 — 중간에 '확인 중'(답 없음)으로 뒤집히지 않고 곧장 새 답이 된다
        const before = seen.length;
        expect(seen[before - 1]).toBeNull();
        for (const o of orphans) if (o.hasListeners()) o.setOptions(o.options);
        expect(watcher.getCurrentResult().data).toEqual(member);
        expect(watcher.getCurrentResult().isLoading).toBe(false);
        await tick();
        const after = seen.slice(before);
        expect(after.length).toBeGreaterThan(0);
        for (const data of after) expect(data).toEqual(member);

        // 그새 화면에서 사라진 구독자(듣는 곳 없음)는 건드리지 않는다
        stop();
        expect(watcher.hasListeners()).toBe(false);
        unwatch();
        qc.clear();
    });

    // 2026-10-06 검토: 예전에는 적어 두는 일(캐시 구독)과 다시 맞추는 함수가 이 팝업 파일 안에 있었다. '앱에서 열기'(HandoffRedeemer)도
    // 화면을 옮기지 않는 로그인인데 그 함수를 부를 수 없어 종목 판단이 비로그인으로 남았다 — 공용 자리(lib/queryClient)로 옮겼다.
    // 소스가 그대로인지는 shared/loginRefresh.test.ts 가 본다. 여기서는 팝업이 그것을 **닫기 전에** 부르는지만 본다.
    it("팝업은 로그인이 끝났을 때(닫기 전에) 다시 맞춘다 — 적어 두는 일과 함수는 lib/queryClient 에 있다", () => {
        expect(sheet).toContain('import { rebindAuthWatchers } from "@/lib/queryClient";');
        // 팝업 파일에는 자기 벌이 없다
        expect(sheet).not.toMatch(/ME_HASH|orphans|noteRemovedAuthWatchers|getQueryCache\(\)/);
        expect(sheet).not.toContain("function rebindAuthWatchers");
        const qc = client("lib/queryClient.ts");
        expect(qc).toContain("export function rebindAuthWatchers(): void {");
        expect(qc).toContain("if (o.hasListeners()) o.setOptions(o.options);");
        // 끝났다는 알림은 '나'를 새로 받은 뒤에 온다(SocialLogin finishInPlace) — 그때 다시 맞추고 닫는다
        const done = sheet.slice(sheet.indexOf("const done = useCallback("), sheet.indexOf("const storeEntry"));
        expect(done.indexOf("rebindAuthWatchers();")).toBeGreaterThan(0);
        expect(done.indexOf("closeLoginSheet();")).toBeGreaterThan(done.indexOf("rebindAuthWatchers();"));
        expect(sheet.match(/rebindAuthWatchers\(\);/g)).toHaveLength(1);
    });
});

/**
 * 2026-10-06 검토에서 고친 것들 — 닫히는 동안의 색 · 기기의 '뒤로'.
 */
describe("닫히는 동안 · 뒤로", () => {
    // 골프 모드(어두운 시트)에서 '전화번호로 계속하기'·약관 링크를 누르면 주소가 밝은 화면(/ · /terms · /privacy)으로 바뀌고, 종목이 당구로
    // 판정돼 내려가는 0.3초 동안 시트가 밝은 색으로 뒤집혔다. 닫을 때 글자(opts)는 남기면서 색은 그러지 않았다.
    it("색은 열릴 때의 것을 들고 내려간다 — 닫히는 동안 종목이 바뀌어도 뒤집히지 않는다", () => {
        const panel = sheet.slice(sheet.indexOf("function LoginSheetPanel("), sheet.indexOf("export function LoginSheetHost"));
        expect(panel).toContain("function LoginSheetPanel({ tone: liveTone, opts, back, go }: {");
        expect(panel).toContain("const [tone] = useState(liveTone);");
        // 패널이 쓰는 색은 전부 그 값에서 나온다(지금 종목을 다시 읽지 않는다)
        expect(panel).toContain("const c = TONE[tone];");
        expect(panel.match(/\bliveTone\b/g)).toHaveLength(2); // 받는 자리 · 처음 값으로 넣는 자리
        expect(panel).not.toMatch(/useSport|currentSport/);
        // 호스트는 지금 종목으로 정해 건넨다(열릴 때마다 패널이 새로 붙어 그 순간의 값을 잡는다)
        expect(sheet).toContain("<LoginSheetPanel tone={tone} opts={s.opts} back={back} go={go} />");
    });

    // 팝업은 히스토리 항목이 없다 — 닫으려고 누른 '뒤로'가 보던 화면을 닫았다(검색에서 바로 들어온 사람은 사이트를 떠나고, 앱의 예시 홈에서는 앱이 꺼졌다).
    it("기기의 '뒤로'는 보던 화면이 아니라 팝업을 닫는다 — 앱은 뒤로가기 핸들러를 한 겹 얹고, 웹은 CloseWatcher", () => {
        const host = sheet.slice(sheet.indexOf("export function LoginSheetHost"));
        expect(sheet).toContain('import { useBackToClose } from "@/hooks/useBackToClose";');
        expect(host).toContain("useBackToClose(s.open, closeLoginSheet);");

        const hook = code(client("hooks/useBackToClose.ts"));
        expect(hook).toContain("export function useBackToClose(open: boolean, onClose: () => void): void {");
        // 열려 있는 동안만 건다
        expect(hook).toContain("if (!open) return;");
        expect(hook).toMatch(/\}, \[open\]\);/);
        // 앱: 한 겹 얹는다 — 닫고 true(처리 끝). 돌려받은 함수가 정리 함수가 되어 자기 것만 푼다
        const native = hook.slice(hook.indexOf("if (isNativeApp()) {"), hook.indexOf("const Watcher ="));
        expect(native).toMatch(/return pushBackHandler\(\(\) => \{\s*close\.current\(\);\s*return true;\s*\}\);/);
        // 웹: CloseWatcher 가 있을 때만. 닫힐 때(다른 길로 닫혀도) 거둔다
        const web = hook.slice(hook.indexOf("const Watcher ="));
        expect(web).toContain('if (typeof Watcher !== "function") return;');
        expect(web).toContain("watcher.onclose = () => close.current();");
        expect(web).toContain("watcher.destroy();");
        // 히스토리에 표식 항목을 쌓지 않는다 — 닫으면서 다른 화면으로 옮길 때 되감기가 그 이동을 되돌린다
        expect(hook).not.toMatch(/pushState|popstate|history\.back|history\.go/);

        // nativeBridge: 팝업의 핸들러는 따로 쌓는다 — 한 칸짜리 setBackHandler(게임 화면의 '나가기 확인')를 지우지 않는다
        const bridge = code(client("lib/nativeBridge.ts"));
        const push = bridge.slice(bridge.indexOf("export function pushBackHandler("), bridge.indexOf("export function initNativeBridge()"));
        expect(push).toContain("backLayers.push(fn);");
        expect(push).toMatch(/const at = backLayers\.lastIndexOf\(fn\);\s*if \(at !== -1\) backLayers\.splice\(at, 1\);/);
        expect(push).not.toContain("backHandler =");
        expect(client("sim/SimulatorPage.tsx")).toContain("return () => setBackHandler(null);");
        // 뒤로가기: 맨 나중에 얹은 팝업 → 화면이 건 핸들러 → 뒤로 가거나 종료
        const listener = bridge.slice(bridge.indexOf('App.addListener("backButton", (e) => {'), bridge.indexOf("initRouteMemory();"));
        const layers = listener.indexOf("for (let i = backLayers.length - 1; i >= 0; i--) {");
        const screen = listener.indexOf("if (backHandler && backHandler()) return;");
        expect(layers).toBeGreaterThan(0);
        expect(listener.indexOf("if (backLayers[i]()) return;")).toBeGreaterThan(layers);
        expect(screen).toBeGreaterThan(layers);
        expect(listener.indexOf("window.history.back();")).toBeGreaterThan(screen);
    });

    // 2026-10-06 검토: 비로그인은 이제 예시 홈에서 시작해 로그인 화면(/?login=1…)으로 **들어온다**(팝업의 '전화번호로 계속하기' 등).
    // 예전 규칙("주소가 '/' 이면 종료")은 로그인 화면이 앱의 첫 화면일 때의 것이라, 거기서 '뒤로'를 누르면 예시 홈으로 돌아가지 않고 앱이 꺼졌다.
    it("안드로이드 앱의 '뒤로': 뒤로 갈 곳이 있는지는 웹뷰가 알려 준 값(canGoBack)으로 본다 — 주소가 '/' 라고 끄지 않는다", () => {
        const bridge = code(client("lib/nativeBridge.ts"));
        const listener = bridge.slice(bridge.indexOf('App.addListener("backButton", (e) => {'), bridge.indexOf("initRouteMemory();"));
        expect(listener).toContain('const canGoBack = typeof e?.canGoBack === "boolean"');
        expect(listener).toContain("? e.canGoBack");
        // 값을 못 받는 바이너리에서만 옛 판단으로 떨어진다
        expect(listener).toContain(': !(window.location.pathname === "/" || window.history.length <= 1);');
        expect(listener).toMatch(/if \(!canGoBack\) void App\.exitApp\(\)\.catch\(\(\) => \{[^}]*\}\);\s*else window\.history\.back\(\);/);
        // 종료는 이 한 곳에서만
        expect(bridge.match(/App\.exitApp\(\)/g)).toHaveLength(1);
        // 로그인 화면으로 들어오는 길은 기록을 쌓는다(push) — 그래서 거기서는 뒤로 갈 곳이 있다
        expect(sheet).toMatch(/const go = useCallback\(\(to: string\) => \{\s*closeLoginSheet\(\);\s*setLocation\(to\);\s*\}, \[setLocation\]\);/);
    });
});

describe("랭큐 첫 주소(/) — 비로그인에게 로그인 폼 대신 예시 홈", () => {
    const bare = landing.slice(landing.indexOf("const [bareRoot] = useState(() => {"), landing.indexOf("const storeEntry ="));

    it("맨 '/' 인지는 화면이 붙을 때 한 번만 판단한다 — ?login · ?redirect · ?store · 매장 주소 · /hiq 는 로그인 화면 그대로", () => {
        expect(bare.length).toBeGreaterThan(0);
        expect(bare).toContain('if (window.location.pathname !== "/") return false;');
        expect(bare).toContain('if (p.has("login") || p.has("redirect") || p.has("store")) return false;');
        // 매장 서브도메인: 주소로 매장을 읽는 기존 함수 그대로
        expect(bare).toContain('return resolveStoreSlug() === "hiq";');
        // 상태로 한 번만(그릴 때마다 보면 PIN 확인 단계 같은 폼 상태가 날아간다)
        expect(landing.match(/const \[bareRoot\] = useState\(/g)).toHaveLength(1);
        // goLoginPage·'전화번호로 계속하기'가 만드는 주소에는 늘 login=1 이 실린다 — 호스트(팝업)와 로그인 화면(전화번호 카드)이 그것으로 알아본다
        expect(sheet).toContain("? `/?login=1&phone=1&redirect=");
        expect(sheet).toContain(": `${LOGIN_SHEET_HOME}?login=1&redirect=");
    });

    it("비로그인이 확인되면 /dashboard 로 자리를 바꿔 끼운다 — 로그인 폼을 그리기 전에", () => {
        const effect = landing.slice(landing.indexOf('const [authState, setAuthState] = useState<"checking" | "in" | "out">("checking");'), landing.indexOf("const { store: brand"));
        const signedIn = effect.indexOf('setAuthState("in");');
        const guestHome = effect.indexOf('if (bareRoot) { setLocation("/dashboard", { replace: true }); return; }');
        const out = effect.indexOf('setAuthState("out");');
        expect(signedIn).toBeGreaterThan(0);
        // 로그인돼 있으면 지금처럼(새로 받고 보던 곳이나 홈으로) — 그 갈래가 먼저다
        expect(guestHome).toBeGreaterThan(signedIn);
        // "out" 이 되기 전에 떠난다 — 폼은 authState 가 "out" 일 때만 그려진다
        expect(out).toBeGreaterThan(guestHome);
        expect(landing).toContain('if (authState !== "out" || isBrandLoading || !brand) {');
        expect(effect).toContain("}, [setLocation, bareRoot, popupFirst]);");
        // 2026-10-07 오너 "전체 로그인화면을 팝업이 기본이 되게": 로그인하러 왔어도 전화번호 길(?phone)·매장 주소가 아니면 폼을 그리지 않고
        // 예시 홈 위의 팝업으로 넘긴다 — 맨 '/' 갈래 다음, "out" 이 되기 전
        const popup = effect.indexOf("if (popupFirst) {");
        expect(popup).toBeGreaterThan(guestHome);
        expect(out).toBeGreaterThan(popup);
        expect(effect).toContain('setLocation(loginPagePath(safeReturnPath(new URLSearchParams(window.location.search).get("redirect")) ?? "/dashboard"), { replace: true });');
    });

    it("소개 화면(MarketingLanding)은 '/' 에서 더는 뜨지 않는다 — 컴포넌트와 /about 은 그대로", () => {
        expect(landing).not.toContain("MarketingLanding");
        expect(landing).not.toContain("rankue-intro-seen");
        expect(existsSync(resolve(ROOT, "pages/hiq/marketing-landing.tsx"))).toBe(true);
        expect(app).toContain('<Route path="/about" component={About} />');
        expect(app).toContain('<Route path="/" component={HiqLanding} />');
    });

    it("팝업의 '전화번호로 계속하기'(?phone=1)로 온 사람은 전화번호 카드부터 — 그냥 온 사람은 예전 순서", () => {
        expect(landing).toMatch(/const \[phoneMode, setPhoneMode\] = useState<boolean \| null>\(\(\) => \{\s*try \{ return new URLSearchParams\(window\.location\.search\)\.has\("phone"\) \? true : null; \} catch \{ return null; \}\s*\}\);/);
        // 무엇을 먼저 보일지 정하는 식은 그대로다(shared/kakaoLogin.test.ts 도 같은 줄을 지킨다)
        expect(landing).toContain('const showPhone = requiresPassword || (phoneMode ?? (locale === "ko" ? !kakaoFirst : !socialLoginAvailable(locale)));');
    });
});
