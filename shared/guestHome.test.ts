import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
// 당구 홈의 예시 랭킹이 카드의 거르는 조건을 통과하는지 볼 때 쓴다(순수 자료 — DB·서버 모듈을 물지 않는다)
import { GUEST_SAMPLE } from "./guestSample.js";
// 예시 카드가 공개 API 에 묻는 에버리지가 서버가 받는 범위 안인지 볼 때 쓴다(순수 함수)
import { normalizeAvg } from "./proCompare.js";

/**
 * 2026-10-05 오너 결정: "골프·당구 홈을 비로그인도 다 볼 수 있게 열고, 가입 안 한 사람에겐 예시로 보여 주고,
 * 내 기록을 쌓으려 할 때 가입을 유도한다."
 *
 * 홈을 열면서 지켜야 하는 것들을 소스를 읽어 지킨다(화면 코드의 시험이지만 shared 에 둔다 — vitest 가 client/src 에서는
 * sim·golf 만 읽는다. shared/loginRefresh.test.ts 와 같은 방식).
 *  - 비로그인은 '내 것' API 를 부르지 않는다(전부 로그인 필수라 401 만 쌓인다 — 폴링이면 1분마다).
 *  - 예시 숫자를 그리는 카드에는 "예시" 표시가 있다. 없는 것을 '없다'고 그리지 않는다(거짓 빈 값).
 *  - 기록이 쌓이는 입구는 **입구에서** 가입 안내로 잇는다. 막다른 길(단추 없는 안내·말없이 홈으로 되돌림)을 두지 않는다.
 *  - 회원의 화면은 그대로다 — 가르는 조건은 늘 "비로그인이면".
 *
 * 종목별로 describe 를 나눈다: 아래는 골프 홈. 당구 홈의 시험은 "당구 홈" describe 로 이어 붙인다.
 */
const client = (p: string) => readFileSync(resolve(__dirname, "../client/src", p), "utf8");

/** 주석만 있는 줄을 뺀다 — 주석 속 낱말(예: "enabled")이 검사를 통과시키지 않게 */
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/**
 * marker(쿼리 키의 한 조각)가 들어 있는 useQuery(...) 호출 한 덩어리 — 괄호 짝을 세어 끝을 찾는다.
 * 끝을 `});` 로 찾으면 queryFn 안의 `new URLSearchParams({ … })` 에서 먼저 끊긴다.
 */
function queryCall(src: string, marker: string): string {
    const s = code(src);
    const at = s.indexOf(marker);
    if (at < 0) throw new Error(`쿼리 키를 못 찾음: ${marker}`);
    const start = s.lastIndexOf("useQuery", at);
    if (start < 0) throw new Error(`useQuery 를 못 찾음: ${marker}`);
    const open = s.indexOf("(", start);
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        if (s[i] === "(") depth++;
        else if (s[i] === ")" && --depth === 0) return s.slice(start, i + 1);
    }
    throw new Error(`괄호가 안 닫힘: ${marker}`);
}

/** 골프 테마(index.css :root[data-sport="GOLF"])가 다른 색으로 바꿔 끼우는 유틸 — 새로 쓰는 골프 화면 조각에는 없어야 한다 */
const SWAPPED_UTIL = /\b(?:bg|text|border|ring|divide)-(?:white|black)\b/;
/** 12px 보다 작은 글자 */
const TINY_TEXT = /\btext-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/;

describe("골프 홈", () => {
    describe("종목 전환(SportContext) — 한국어 비로그인 방문자도 골프가 될 수 있다", () => {
        const src = code(client("contexts/SportContext.tsx"));

        it("'쓸 수 있는가'(useGolfAccess)가 아니라 '볼 수 있는가'(useGolfVisible)로 가른다", () => {
            expect(src).toContain("const golfVisible = useGolfVisible();");
            // 훅 파일 이름(hooks/useGolfAccess)은 임포트 경로에 남는다 — 부르는 것만 본다
            expect(src).not.toContain("useGolfAccess()");
            expect(src).not.toMatch(/\bgolfOk\b/);
        });

        it("공용 화면의 종목 = 저장된 선호, 볼 수 없는 사람이면 당구 — 로그인·콘솔 화면과 주소 우선은 그대로", () => {
            // 2026-10-13 등산이 세 번째 종목으로 들어왔다 — 저장된 선호가 등산이면 등산을 쓸 수 있는 사람만, 그 밖은 예전 그대로
            expect(src).toContain('consolePath ? "BILLIARDS" : routeSport ?? (saved === "HIKING" ? (hikingOk ? "HIKING" : "BILLIARDS") : saved === "FISHING" ? (fishingOk ? "FISHING" : "BILLIARDS") : golfVisible ? saved : "BILLIARDS")');
        });

        it("종목 알약(setSport)도 같은 기준 — 볼 수 없는 사람이 골프를 고르면 당구로 되돌린다", () => {
            expect(src).toContain('(picked === "GOLF" && !golfVisible) || (picked === "HIKING" && !hikingOk) || (picked === "FISHING" && !fishingOk) ? "BILLIARDS" : picked');
        });

        it("한국어 화면은 로그인 확인을 기다리지 않는다 — 골프가 전면 공개인 동안엔 회원이든 방문자든 본다(당구를 먼저 그렸다 뒤집지 않는다)", () => {
            const hook = client("hooks/useGolfAccess.ts");
            const fn = code(hook.slice(hook.indexOf("export function useGolfVisible")));
            const ko = fn.indexOf('if (locale !== "ko") return false;');
            const open = fn.indexOf("if (GOLF_PUBLIC) return true;");
            const wait = fn.indexOf("if (isLoading) return false;");
            expect(ko).toBeGreaterThan(0);
            expect(open).toBeGreaterThan(ko);
            // 공개를 되돌리면 예전처럼 확인 중엔 false — 골프가 잠깐 보였다 사라지지 않게
            expect(wait).toBeGreaterThan(open);
            expect(fn).toContain("return access || isGuest;");
            expect(hook).toContain('import { GOLF_PUBLIC } from "@shared/golfAccess";');
        });

        it("문서 화면(약관·개인정보처리방침·고객지원·계정삭제)은 종목 테마를 타지 않는다 — 밝은 화면 한 가지라 골프색이 씌면 안 읽힌다", () => {
            const m = /const consolePath = \/(.+?)\/\.test\(location\)/.exec(src);
            expect(m).toBeTruthy();
            const re = new RegExp(m![1]);
            for (const path of ["/terms", "/privacy", "/support", "/account-delete", "/register", "/admin/golf", "/privacy?x=1"]) expect(re.test(path), path).toBe(true);
            // 앞에서 고정돼 있어 종목 화면의 같은 낱말은 걸리지 않는다
            for (const path of ["/golf/terms", "/billiards/terms", "/chat/support/1", "/dashboard", "/menu", "/supporters"]) expect(re.test(path), path).toBe(false);
        });

        it("직접 고른 종목(알약·주소)은 세션에 남긴다 — 뒤에 로그인해도 주 종목이 그 선택을 덮지 않는다", () => {
            const mark = src.slice(src.indexOf("function markSportChosen()"), src.indexOf("export function SportProvider"));
            expect(mark).toContain('sessionStorage.setItem(BOOT_KEY, "1")');
            // 알약(setSport)
            const set = src.slice(src.indexOf("const setSport = "), src.indexOf("return (", src.indexOf("const setSport = ")));
            expect(set).toContain("markSportChosen();");
            // 주소 — 저장값과 같을 때도 남긴다(다를 때만 남기면 골프가 이미 저장돼 있던 방문자가 빠진다)
            const route = src.slice(src.indexOf("if (!routeSport) return;"), src.indexOf("}, [routeSport, saved]);"));
            expect(route.indexOf("markSportChosen();")).toBeGreaterThan(0);
            expect(route.indexOf("markSportChosen();")).toBeLessThan(route.indexOf("if (routeSport !== saved) {"));
            // 주 종목 효과는 그대로 — 표시가 있으면 건너뛴다. '방문자였던 세션'이라고 찍지 않는다(새 폰의 골프 회원이 당구 홈에 떨어진다)
            expect(src).toContain("if (sessionStorage.getItem(BOOT_KEY)) return;");
            expect(src.match(/markSportChosen\(\);/g)).toHaveLength(2);
            expect(mark).not.toMatch(/isGuest|member/);
        });
    });

    // 2026-10-06 가입·로그인 팝업: goLogin 은 이제 **팝업**을 연다. 이 문은 아무것도 그리지 않는 채 자동으로 보내는 곳이라
    // (빈 화면 위에 팝업이 뜨고, 닫으면 갇힌다) 로그인 **화면**으로 보내는 goLoginPage 를 쓴다 — 아래 단언의 함수 이름을 그렇게 바꿨다.
    describe("골프 전용 문(GolfOnly) — 비로그인은 로그인으로, 끝나면 가려던 화면으로", () => {
        const app = client("App.tsx");
        const fn = code(app.slice(app.indexOf("function GolfOnly"), app.indexOf("function AppRoutes")));

        it("문은 여전히 useGolfAccess — 방문자에게 골프 전용 화면이 열리지 않는다", () => {
            expect(fn).toContain("const golfOk = useGolfAccess();");
            expect(fn).toContain("if (isLoading || !golfOk) return null;");
            expect(fn).not.toContain("useGolfVisible");
        });

        /** 로그인으로 보내는 갈래 — 한국어로 보는 비로그인만 */
        const GUEST_KO = 'if (isGuest && locale === "ko") {';

        it("한국어 비로그인(확인 끝)은 goLoginPage 로(로그인 화면 — 팝업이 아니다) — 지금 주소(경로 + 질의)를 돌아올 곳으로 넘긴다", () => {
            const guest = fn.slice(fn.indexOf(GUEST_KO));
            expect(fn.indexOf(GUEST_KO)).toBeGreaterThan(0);
            expect(guest).toMatch(/goLoginPage\([^;]*window\.location\.pathname \+ window\.location\.search\)/);
            // 팝업을 여는 goLogin 은 이 문에 없다
            expect(fn).not.toMatch(/\bgoLogin\(/);
            expect(app).toContain('import { goLoginPage } from "@/components/hiq/LoginGate";');
            // 로그인 화면에서 '뒤로' → 이 문 → 다시 로그인으로 튕기지 않게 자리를 바꿔 끼운다
            expect(guest).toContain("setLocation(to, { replace: true })");
        });

        it("한국어가 아닌 비로그인은 로그인으로 보내지 않는다 — 가입해도 이 문이 열리지 않는다(골프는 한국어 화면에서만)", () => {
            // 언어를 보지 않는 갈래가 남아 있지 않다
            expect(fn).not.toContain("if (isGuest) {");
            expect(fn).toContain("const { locale } = useT();");
            // 언어가 바뀌면 다시 판단한다
            expect(fn).toMatch(/\}, \[[^\]]*\blocale\b[^\]]*\]\);/);
            // goLoginPage 는 그 갈래 안 한 군데뿐
            expect(fn.match(/goLoginPage\(/g)).toHaveLength(1);
            expect(fn.indexOf("goLoginPage(")).toBeGreaterThan(fn.indexOf(GUEST_KO));
        });

        it("로그인했지만 골프 허용이 없는 사람·한국어가 아닌 비로그인은 홈으로 — 로그인 갈래 뒤에 온다", () => {
            const home = fn.indexOf('setLocation("/dashboard", { replace: true })');
            expect(home).toBeGreaterThan(fn.indexOf(GUEST_KO));
        });

        it("확인 중에는 아무 데도 보내지 않는다", () => {
            expect(fn).toContain("if (isLoading) return;");
            expect(fn.indexOf("if (isLoading) return;")).toBeLessThan(fn.indexOf("goLoginPage("));
        });

        it("초대 핀(?pin=)은 그대로 남긴다 — 그 주소로 곧장 돌아왔으면 지워서 두 번 들어가지 않게", () => {
            expect(fn).toContain('"rankue_golf_pending_pin"');
            expect(fn).toContain("sessionStorage.setItem(KEY, pin)");
            expect(fn.indexOf("sessionStorage.setItem(KEY, pin)")).toBeLessThan(fn.indexOf("goLoginPage("));
            expect(fn).toContain("if (pin && sessionStorage.getItem(KEY) === pin) sessionStorage.removeItem(KEY);");
        });
    });

    describe("'내 것' 쿼리 — 비로그인은 부르지 않는다(enabled)", () => {
        const enabledForMember = /enabled: !!(?:member|me)\b/;
        const cases: [string, string, string][] = [
            ["내 라운드 기록(useGolfStats)", "golf/hooks/useGolfStats.ts", '"/api/hiq/history"'],
            ["내 라운드 기록(골프 홈)", "golf/pages/Dashboard.tsx", '"/api/hiq/history"'],
            ["알림 수(머리줄, 60초 폴링 — 세 종목이 같이 쓰는 SportHeader)", "components/hiq/SportHeader.tsx", "UNREAD_COUNT_KEY, {"],
            ["진행 중 라운드", "golf/components/dashboard/ActiveRoundCard.tsx", '"/api/hiq/golf/match/active"'],
            ["내 크루", "golf/components/dashboard/MyCrewCard.tsx", '"/api/hiq/crews/mine"'],
            ["긴급 조인(60초 폴링)", "golf/components/dashboard/HotDealTicker.tsx", '"urgent-joins"'],
            ["특가 매물(60초 폴링)", "golf/components/dashboard/HotDealTicker.tsx", '"hot-deals"'],
        ];
        for (const [name, file, marker] of cases) {
            it(name, () => {
                expect(queryCall(client(file), marker)).toMatch(enabledForMember);
            });
        }

        it("골프 홈의 '나'가 없으면(null) 기록 쿼리 둘이 같이 잠긴다 — 같은 캐시 키", () => {
            const key = '["/api/hiq/history", { sport: "GOLF" }]';
            expect(queryCall(client("golf/pages/Dashboard.tsx"), '"/api/hiq/history"')).toContain(key);
            expect(queryCall(client("golf/hooks/useGolfStats.ts"), '"/api/hiq/history"')).toContain(key);
        });
    });

    describe("회원의 것은 비로그인에게 그리지 않는다 — 거짓 빈 값도 없다", () => {
        it("머리줄: 알림 종 자리에 로그인 단추(goLogin), 알림함은 회원에게만", () => {
            // 2026-10-13 머리줄 통일 — 골프 머리(GolfHeader)는 SportHeader 를 그대로 쓴다
            expect(code(client("golf/components/dashboard/GolfHeader.tsx"))).toContain('<SportHeader sport="GOLF"');
            const src = code(client("components/hiq/SportHeader.tsx"));
            const at = src.indexOf("{isGuest ? (");
            expect(at).toBeGreaterThan(0);
            const guest = src.slice(at, src.indexOf(") : (", at));
            expect(guest).toContain("goLogin(setLocation)");
            expect(guest).toContain("로그인");
            expect(guest).not.toContain("LucideBell");
            expect(guest).not.toMatch(SWAPPED_UTIL);
            expect(guest).not.toMatch(TINY_TEXT);
            expect(src).toContain("{!isGuest && <NotificationInbox");
            // 종목 알약은 가르지 않는다 — 방문자에게도 보이고 눌린다
            expect(src.indexOf("setSport('BILLIARDS')")).toBeLessThan(src.indexOf("{isGuest ? ("));
        });

        it("진행 중 라운드: 숨김", () => {
            expect(code(client("golf/components/dashboard/ActiveRoundCard.tsx"))).toContain("if (isGuest || !data) return null;");
        });

        it("긴급티: 숨김 — '지금 열린 긴급티가 없어요'도, 끝나지 않는 로딩도 그리지 않는다", () => {
            const src = code(client("golf/components/dashboard/HotDealTicker.tsx"));
            const hide = src.indexOf("if (isGuest) return null;");
            expect(hide).toBeGreaterThan(0);
            expect(hide).toBeLessThan(src.indexOf("if (isLoading) {"));
            expect(hide).toBeLessThan(src.indexOf("지금 열린 긴급티가 없어요"));
            // 훅을 다 부른 뒤에 돌려준다(조건부 훅 금지)
            for (const hook of ["useQuery<", "useMemo(", "useEffect(", "useCallback("]) expect(src.lastIndexOf(hook), hook).toBeLessThan(hide);
        });

        it("내 크루: '가입된 골프 크루가 없습니다' 대신 가입 안내 한 줄 + 크루 둘러보기(/club)", () => {
            const src = code(client("golf/components/dashboard/MyCrewCard.tsx"));
            const from = src.indexOf(") : isGuest ? (");
            const empty = src.indexOf("가입된 골프 크루가 없습니다");
            expect(from).toBeGreaterThan(0);
            expect(from).toBeLessThan(empty);
            const guest = src.slice(from, empty);
            expect(guest).toContain("가입하면 골프 크루에 들어갈 수 있어요");
            expect(guest).toContain('<Link href="/club">');
            expect(guest.slice(0, guest.lastIndexOf(") : ("))).not.toMatch(SWAPPED_UTIL);
            expect(guest.slice(0, guest.lastIndexOf(") : ("))).not.toMatch(TINY_TEXT);
            // 로그아웃 전 캐시가 남아 있어도 남의 크루를 내 것처럼 그리지 않는다
            expect(src).toContain("const primaryCrew = isGuest ? undefined : myCrews[0];");
        });
    });

    describe("예시 카드 — 숫자는 shared/guestSample, 카드마다 '예시' 표시", () => {
        const home = code(client("golf/pages/Dashboard.tsx"));

        it("골프 홈은 비로그인이 확인된 때만 예시를 쓴다 — 회원이면 null", () => {
            expect(home).toContain("const sample = isGuest ? GUEST_SAMPLE.golf : null;");
        });

        it("핸디캡 카드·스코어 트렌드에 예시 숫자를 넣을 때 sample 도 같이 넘긴다", () => {
            const handicap = home.slice(home.indexOf("<HandicapCard"), home.indexOf("<QuickActions"));
            expect(handicap).toContain("member={sample ? sample.member : me}");
            expect(handicap).toContain("avgScore={sample ? sample.avgScore : effectiveAvg}");
            expect(handicap).toContain("sample={!!sample}");
            const chart = home.slice(home.indexOf("<StatsChart"), home.indexOf("<GolfRankingCard"));
            expect(chart).toContain("recentScores={sample ? sample.recentScores : recentScores}");
            expect(chart).toContain("stats={sample ? sample.stats : {");
            expect(chart).toContain("sample={!!sample}");
        });

        it("HandicapCard: 예시를 그릴 때 SampleBadge(dark)", () => {
            const src = code(client("golf/components/dashboard/HandicapCard.tsx"));
            expect(src).toContain('{sample && <SampleBadge tone="dark"');
            expect(src).toContain("sample = false");
        });

        it("StatsChart: 예시를 그릴 때 SampleBadge(dark), 그리고 링크가 아니다", () => {
            const src = code(client("golf/components/dashboard/StatsChart.tsx"));
            expect(src).toContain('<SampleBadge tone="dark" />');
            expect(src).toContain("sample = false");
            const sampleReturn = src.indexOf("if (sample) return <div");
            expect(sampleReturn).toBeGreaterThan(0);
            // /history 링크는 예시가 아닐 때만 — 방문자가 그래프를 눌러 로그인 안내 카드에 떨어지지 않는다
            expect(sampleReturn).toBeLessThan(src.indexOf('<Link href="/history"'));
            expect(src.match(/<Link href="\/history"/g)).toHaveLength(1);
        });

        it("핸디캡 카드 바로 아래에 가입 안내 한 줄(GuestJoinCta dark) — 비로그인에게만", () => {
            const cta = home.slice(home.indexOf("{sample && ("), home.indexOf("<QuickActions"));
            expect(home.indexOf("<HandicapCard")).toBeLessThan(home.indexOf("{sample && ("));
            expect(cta).toContain("<GuestJoinCta");
            expect(cta).toContain('tone="dark"');
            expect(cta).toContain('title="가입하면 내 스코어가 이렇게 쌓여요"');
            // '골프장에서' — 홈의 큰 숫자·그래프는 현장 인증된 라운드만 센다. 조건을 빼면 집에서 적은 사람이 빈 홈을 본다
            expect(cta).toContain('desc="골프장에서 라운드를 적으면 핸디캡과 그래프가 만들어져요"');
        });
    });

    describe("기록이 쌓이는 입구 — 비로그인은 입구에서 가입 안내(useGuestGate dark)", () => {
        const quick = code(client("golf/components/dashboard/QuickActions.tsx"));
        const sheet = code(client("golf/components/dashboard/GameModeSheet.tsx"));

        it("기록이 쌓이는 홈 타일 셋(RANKUE MATCH · ENTER CODE · PASSPORT)이 guard 를 거친다 — 넷째(볼마커 장식장)는 방문자에게도 열려 있다", () => {
            expect(quick).toContain('const gate = useGuestGate("dark");');
            expect(quick).toContain("gate.guard(onOpenGameMode, {");
            expect(quick).toContain("gate.guard(onOpenJoin, {");
            expect(quick).toContain("gate.guard(() => setLocation('/golf/passport'), {");
            // 프로암 타일은 뺐다(2026-10-12 오너: "랭큐 프로암 빼주고") — 화면(/golf/proam)은 남아 있지만 홈에서 가는 길은 없다
            expect(quick).not.toContain("proam");
            // 그 자리의 장식장은 예시 장식장을 보여 주는 열린 화면이라 가입 안내를 거치지 않는다
            expect(quick).toContain("onClick={() => setLocation('/golf/shelf')}");
            // guard 없이 바로 여는 길이 남아 있지 않다
            expect(quick).not.toContain("onClick={onOpenGameMode}");
            expect(quick).not.toContain("onClick={onOpenJoin}");
            expect(quick).not.toContain("onClick={() => setLocation('/golf/passport')}");
        });

        it("가입 뒤 돌아올 곳(from)은 가려던 주소", () => {
            for (const from of ["/golf/game/new?mode=match", "/golf/game/new?mode=join", "/golf/passport"]) {
                expect(quick, from).toContain(`from: "${from}"`);
            }
        });

        it("라운드 고르기 시트: 새 게임·스코어카드 스캔도 guard — 사진을 찍기 전에 막는다", () => {
            expect(sheet).toContain('const gate = useGuestGate("dark");');
            expect(sheet).toContain("gate.guard(() => setLocation('/golf/game/new?mode=match'), {");
            expect(sheet).toContain("gate.guard(onOpenScanner, {");
            expect(sheet).not.toMatch(/onOpenChange\(false\);\s*onOpenScanner\(\);/);
        });

        it("받은 시트를 한 번씩 그린다 — 안 그리면 guard 가 열 것이 없다", () => {
            expect(quick.match(/\{gate\.sheet\}/g)).toHaveLength(1);
            expect(sheet.match(/\{gate\.sheet\}/g)).toHaveLength(1);
            // 라운드 고르기 시트가 닫혀도 남아 있게 그 시트 밖(형제)에 둔다
            expect(sheet.indexOf("{gate.sheet}")).toBeGreaterThan(sheet.indexOf("</Sheet>"));
        });

        it("안내 문구가 사실과 맞다 — 핸디캡·그래프는 '골프장에서' 적은 라운드", () => {
            // 홈의 평균·그래프는 현장 인증된 라운드만 센다(countsOnSite) — 조건 없이 '스코어를 적으면 쌓인다'고 하지 않는다
            for (const s of [quick, sheet]) {
                expect(s).toContain('desc: "골프장에서 스코어를 적으면 핸디캡과 그래프가 쌓여요.');
                expect(s).not.toMatch(/desc: "스코어를 적으면/);
            }
        });

        it("안내 문구에 가입 수단·걸리는 시간, 술·돈·내기 말이 없다", () => {
            const home = code(client("golf/pages/Dashboard.tsx"));
            const copy = [quick, sheet, home].flatMap((s) => Array.from(s.matchAll(/\b(?:title|desc)(?::\s*|=)"([^"]+)"/g), (m) => m[1]));
            // 가입 안내를 거치는 타일 셋 + 시트 둘은 제목·설명 둘씩, 홈의 한 줄도 둘(프로암 타일을 뺀 2026-10-12 뒤로 열둘)
            expect(copy.length).toBeGreaterThanOrEqual(12);
            for (const line of copy) {
                expect(line, line).not.toMatch(/\d\s*초|바로 가입|즉시|카카오|구글|애플|전화번호/);
                expect(line, line).not.toMatch(/술|맥주|소주|내기|판돈|\d\s*원|만\s*원/);
            }
        });
    });

    describe("막다른 길을 두지 않는다 — 하단 탭이 닿는 곳", () => {
        it("채팅: 비로그인 안내에 로그인 단추(goLogin)", () => {
            const src = code(client("pages/hiq/chat-hub.tsx"));
            const at = src.indexOf("{isGuest ? (");
            expect(at).toBeGreaterThan(0);
            const guest = src.slice(at, src.indexOf(") : !member ? (", at));
            expect(guest).toContain('t("chat.loginNeeded")');
            expect(guest).toContain("goLogin(setLocation)");
            expect(guest).toContain("<button");
        });

        it("초대 링크(/join/코드): goLogin 으로 — login=1 이 빠진 옛 주소를 쓰지 않는다", () => {
            const src = code(client("pages/hiq/join.tsx"));
            expect(src).toContain("goLogin(setLocation, `/join/${code}`)");
            expect(src).not.toContain('"/?redirect="');
        });

        // 2026-10-06 가입·로그인 팝업: 예전 단언은 goLogin 안의 주소 한 줄이었다. goLogin 은 이제 팝업을 열고,
        // 로그인 화면으로 가는 길(goLoginPage · 팝업의 '전화번호로 계속하기')은 주소를 loginPagePath 한 곳에서 만든다.
        it("로그인 화면 주소는 login=1 과 돌아올 곳을 같이 붙인다 — 만드는 곳은 loginPagePath 하나", () => {
            const gate = client("components/hiq/LoginGate.tsx");
            const page = gate.slice(gate.indexOf("export function goLoginPage"), gate.indexOf("export function goLogin("));
            expect(page).toContain("setLocation(loginPagePath(back));");
            const sheet = client("components/hiq/LoginSheet.tsx");
            const path = sheet.slice(sheet.indexOf("export function loginPagePath"), sheet.indexOf("export function openLoginSheet"));
            // 2026-10-07 오너 "전체 로그인화면을 팝업이 기본이 되게": 기본은 예시 홈 위의 팝업(/dashboard?login=1…), 전화번호 길만 로그인 화면(/?login=1&phone=1…)
            expect(path).toContain("? `/?login=1&phone=1&redirect=${encodeURIComponent(back)}`");
            expect(path).toContain(": `${LOGIN_SHEET_HOME}?login=1&redirect=${encodeURIComponent(back)}`;");
            expect(sheet).toContain('export const LOGIN_SHEET_HOME = "/dashboard";');
            // login=1 이 빠진 주소를 만드는 곳이 없다 — 맨 '/' 는 비로그인을 예시 홈으로 보낸다(landing)
            for (const src of [gate, sheet]) expect(src).not.toContain("`/?redirect=");
        });

        // 2026-10-06 검토: 가입(/register) 첫 단계의 '이전'은 setLocation("/") 였다. 맨 '/' 가 로그인 화면이던 때의 코드다 — 이제 맨 '/' 는
        // 비로그인을 예시 홈으로 보내므로, 번호를 고치려던 새 회원(아직 쿠키가 없다)이 가입 흐름 밖으로 떨어졌다.
        it("가입 첫 단계의 '이전'은 로그인 화면(전화번호 카드)으로 — 맨 '/' 로 보내지 않는다. 돌아갈 곳도 이어 준다", () => {
            const src = code(client("pages/hiq/register.tsx"));
            expect(src).toContain('import { loginPagePath } from "@/components/hiq/LoginSheet";');
            const prev = src.slice(src.indexOf("const prevStep = () => {"), src.indexOf("const requiredAgreed ="));
            expect(prev.length).toBeGreaterThan(0);
            // login=1 · phone=1 을 달고, 들고 온 ?redirect= 는 우리 사이트 안의 경로만 이어 준다
            expect(prev).toContain('setLocation(loginPagePath(safeReturnPath(queryParams.get("redirect")) ?? "/dashboard", true));');
            expect(prev).not.toContain('setLocation("/")');
            // 이 화면 어디에도 표시 없는 맨 '/' 로 기록을 쌓는 곳이 없다 — 번호 없이 직접 연 경우는 자리를 바꿔 끼운다('뒤로'로 돌아와 다시 튕기지 않게)
            expect(src).not.toContain('setLocation("/")');
            expect(src).toContain('setLocation("/", { replace: true });');
        });

        it("하단 탭: 내 것 배지 쿼리는 로그인했을 때만", () => {
            const src = client("components/hiq/HiqNavigation.tsx");
            expect(queryCall(src, '"/api/hiq/chat/unread"')).toContain("enabled: !!member");
            expect(queryCall(src, "queryKey: MY_REQUESTS_QUERY_KEY")).toContain("enabled: !!member &&");
        });
    });
});

/* ── 당구 홈 ─────────────────────────────────────────────────────────
 * 비로그인도 /dashboard 를 그대로 본다. '내 것'이 들어갈 자리 셋(내 실전 기록 · 점수판의 내 다마 · 매장 랭킹)은
 * 예시 인물 한 명(shared/guestSample)으로 그리고 "예시" 표시를 단다. 기록이 쌓이는 입구는 입구에서 가입 안내로 잇는다.
 */
describe("당구 홈", () => {
    const DASH = "components/hiq/dashboard";
    const home = code(client("pages/hiq/dashboard.tsx"));
    const billiards = home.slice(home.indexOf("function HiqDashboardBilliards"), home.indexOf("export default function HiqDashboard"));
    /** 홈이 그리는 본문(로딩 스피너 뒤의 큰 return) */
    const MAIN = '<div className="min-h-screen bg-surface-0 px-5 pb-nav">';
    const jsx = billiards.slice(billiards.indexOf(MAIN));

    const LOCALES = ["ko", "en", "es", "tr", "vi"] as const;
    const dictHas = (locale: string, key: string) => client(`lib/i18n/${locale}.ts`).includes(`"${key}":`);
    const koValue = (key: string) => new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]*)"`).exec(client("lib/i18n/ko.ts"))?.[1];

    describe("홈을 연다 — 비로그인도 로그인 안내 한 장으로 끝나지 않는다", () => {
        it("LoginGate 를 쓰지 않는다", () => {
            expect(billiards.indexOf(MAIN)).toBeGreaterThan(0);
            expect(home).not.toContain("LoginGate");
            expect(home).not.toContain("loginGate.");
        });

        it("로딩 스피너와 본문 사이에 '회원이 아니면 돌려보낸다'가 없다", () => {
            const loading = billiards.indexOf("if (isLoading) {");
            expect(loading).toBeGreaterThan(0);
            const between = billiards.slice(loading, billiards.indexOf(MAIN));
            expect(between).not.toMatch(/if \(!member\b/);
            expect(between).not.toMatch(/isGuest\)\s*(?:\{\s*)?return/);
            // 로딩 중 스피너는 그대로다
            expect(between).toContain("animate-spin");
        });

        it("훅은 전부 로딩 반환보다 앞에 있다 — 조건부 훅이 없다", () => {
            const loading = billiards.indexOf("if (isLoading) {");
            expect(billiards.indexOf("const gate = useGuestGate();")).toBeGreaterThan(0);
            expect(billiards.indexOf("const gate = useGuestGate();")).toBeLessThan(loading);
            expect(billiards.slice(loading)).not.toMatch(/\buse[A-Z]\w*\(/);
        });

        it("골프 분기는 비로그인 문보다 바깥 — 종목이 골프면 골프 홈을 끼운다", () => {
            const outer = home.slice(home.indexOf("export default function HiqDashboard"));
            expect(outer).toContain('currentSport === "GOLF" ? <GolfDashboard /> : <HiqDashboardBilliards />');
        });

        it("로그인 확인 중의 골프 홈은 돌림표 — 빈 숫자(0.0)를 먼저 그렸다가 예시·내 기록으로 바꾸지 않는다", () => {
            const outer = home.slice(home.indexOf("export default function HiqDashboard"));
            const wait = outer.indexOf('if (currentSport === "GOLF" && isLoading) {');
            expect(wait).toBeGreaterThan(0);
            expect(wait).toBeLessThan(outer.indexOf("<GolfDashboard />"));
            const spinner = outer.slice(wait, outer.indexOf("<GolfDashboard />"));
            expect(spinner).toContain("animate-spin");
            // 종목이 골프일 때 그려진다 — 골프 테마가 바꿔 끼우는 유틸(흰·검정)을 쓰지 않고 토큰만
            expect(spinner).not.toMatch(SWAPPED_UTIL);
            expect(spinner).not.toMatch(/-(?:white|black)\//);
        });

        it("본문에서 member 를 가드 없이 읽지 않는다(member.id 등) — 비로그인이면 undefined", () => {
            // sample.member.id 는 예시 인물이라 괜찮다 — 맨 앞이 member 인 것만 본다
            expect(jsx).not.toMatch(/(?<![.\w])member\.\w/);
            expect(jsx).toContain('currentMemberId={sample ? sample.member.id : member?.id ?? ""}');
            // 회원 행이 꼭 있어야 하는 창은 회원에게만 붙인다
            expect(jsx).toMatch(/\{member && \(\s*<ScoreCorrectionModal/);
        });

        it("회원 전용 효과(?sec=game · ?match=)는 그대로 — 비로그인이면 아무 일도 하지 않는다", () => {
            expect(billiards).toContain("if (!member || isLoading) return;");
            expect(billiards).toContain("if (!member || matchParamRef.current) return;");
        });
    });

    describe("'내 것' 쿼리 — 비로그인은 부르지 않는다(enabled)", () => {
        const cases: [string, string, string][] = [
            ["내 경기 기록", "hooks/useDashboardStats.ts", '"/api/hiq/history"'],
            ["매장 랭킹", "hooks/useDashboardStats.ts", "`/api/hiq/rankings`"],
            ["알림 수(머리 — 세 종목이 같이 쓰는 SportHeader)", "components/hiq/SportHeader.tsx", "UNREAD_COUNT_KEY, {"],
            ["진행 중 경기", `${DASH}/OngoingGameBanner.tsx`, '"/api/hiq/game/ongoing/mine"'],
            ["진행 중 온라인 대전", `${DASH}/SimMatchBanner.tsx`, "queryKey: MATCH_LIST_QUERY_KEY"],
            ["실전 비교(내 실력)", `${DASH}/HomeSkillCard.tsx`, '"/api/hiq/compare/real"'],
            ["온라인 에버 · 닮은 프로(내 실력)", `${DASH}/HomeSkillCard.tsx`, '"/api/hiq/sim/lookalike"'],
            ["내 온라인 다마수(내 실력)", `${DASH}/HomeSkillCard.tsx`, "queryKey: HANDICAP_QUERY_KEY"],
            ["열린 방 목록(20초 폴링)", `${DASH}/OnlineGameCard.tsx`, "queryKey: ROOMS_QUERY_KEY"],
            ["이번 주 드릴", `${DASH}/OnlineGameCard.tsx`, "queryKey: DRILL_WEEK_QUERY_KEY"],
        ];
        for (const [name, file, marker] of cases) {
            it(name, () => {
                expect(queryCall(client(file), marker)).toContain("enabled: !!member");
            });
        }
    });

    describe("머리(DashboardHeader) — 이름 대신 한 줄, 종 대신 로그인", () => {
        // 2026-10-13 머리줄 통일 — 이름 한 줄은 DashboardHeader 에, 종 · 로그인 · 종목 전환은 같이 쓰는 SportHeader 에 있다
        const src = code(client(`${DASH}/DashboardHeader.tsx`));
        const bar = code(client("components/hiq/SportHeader.tsx"));
        const first = src.indexOf("{isGuest ? (");
        const second = bar.indexOf("{isGuest ? (");
        const branch = (at: number, of: string = src) => of.slice(at, of.indexOf(") : (", at));

        it("이름 자리: '둘러보는 중이에요' — '님'만 남는 빈 인사말을 그리지 않는다", () => {
            expect(first).toBeGreaterThan(0);
            expect(branch(first)).toContain('t("guestHome.browsing")');
            expect(branch(first)).not.toContain("dashboardHeader.honorific");
            expect(koValue("guestHome.browsing")).toBe("둘러보는 중이에요");
        });

        it("알림 종 자리: 로그인 단추(goLogin — 끝나면 보던 홈으로), 알림함은 회원에게만", () => {
            expect(src).toContain('<SportHeader sport="BILLIARDS"');
            expect(second).toBeGreaterThan(0);
            expect(branch(second, bar)).toContain("goLogin(setLocation)");
            expect(branch(second, bar)).toContain('t("guestHome.login")');
            expect(branch(second, bar)).not.toContain("<LucideBell");
            expect(bar).toContain("{!isGuest && <NotificationInbox");
        });

        it("종목 알약은 '볼 수 있는가'(useGolfVisible)로 — 한국어 방문자도 골프 홈으로 넘어간다", () => {
            expect(bar).toContain("const golfVisible = useGolfVisible();");
            expect(bar).toContain('...(golfVisible || sport === "GOLF" ? [{ id: "GOLF" as const');
            expect(bar).not.toContain("useGolfAccess()");
            expect(bar).not.toMatch(/\bgolfOk\b/);
            // 등산은 등산이 열린 회원과, 등산을 연 뒤로는 한국어 방문자에게도(한국어 화면에서만)
            expect(bar).toContain('...(hikingOk || hikingGuest || sport === "HIKING" ? [{ id: "HIKING" as const');
            expect(bar).toContain('const hikingGuest = HIKING_PUBLIC && isGuest && locale === "ko";');
            // 방문자에게는 등산 홈이 없다 — 알약은 종목을 바꾸지 않고 공개 허브로 보낸다(저장된 종목을 덮지 않는다: SportContext 가 등산을 못 쓰는 사람의 /hiking 을 선택으로 치지 않는다)
            expect(bar).toContain('onClick={() => (s.id === "HIKING" && !hikingOk ? setLocation(HIKING_HUB_PATH) : s.id === "FISHING" && !fishingOk ? setLocation(FISHING_SPOTS_PATH) : setSport(s.id))}');
            expect(client("contexts/SportContext.tsx")).toContain('if (routeSport === "HIKING" && !hikingOk) return;');
            // 폭 320: 세 종목 + 로그인 + 메뉴가 한 줄에 안 들어가 메뉴 단추가 잘렸다 — 알약의 옆 여백만 340 미만에서 줄인다(세 종목이 똑같이)
            // 2026-10-18 낚시 공개 뒤 알약 넷 + 로그인이 360 을 넘었다 — 400 미만에서 한 번 더 줄인다(여전히 화면 폭으로만)
            expect(bar).toContain('const PILL_PAD = "px-2.5 max-[399px]:px-[5px] max-[339px]:px-[3px]";');
            // 낚시(2026-10-14)도 다른 종목과 같은 알약이다 — 따로 그리는 단추가 없다(고르면 그 자리에서 낚시 세계로 바뀐다)
            expect(bar.match(/\$\{PILL_PAD\}/g)?.length).toBe(2);
            expect(bar).not.toContain('setLocation("/fishing")');
            expect(bar).toContain('...(fishingOk || fishingGuest || sport === "FISHING" ? [{ id: "FISHING" as const, label: "낚시" }] : []),');
            // 언어 단추는 머리줄이 아니라 당구 홈의 이름 줄에 있다 — 머리줄에 넣으면 당구에서만 종목 전환과 종이 밀린다
            expect(bar).not.toMatch(/LanguageSheet|LucideTranslate/);
            expect(src).toContain("<LanguageSheet open={langOpen} onOpenChange={setLangOpen} />");
            expect(src).toContain('data-testid="home-lang"');
            expect(code(client("golf/components/dashboard/GolfHeader.tsx"))).not.toMatch(/LanguageSheet|LucideTranslate/);
            expect(code(client("hiking/pages/HikingHome.tsx"))).not.toMatch(/LanguageSheet|LucideTranslate/);
        });

        it("머리줄의 치수는 종목과 상관없이 하나다 — 크기를 줄이는 가지가 없고, 세 홈이 같은 자리(맨 위 · 붙어 따라옴)에 놓는다", () => {
            // 2026-10-13 오너: "헤더 크기가 일정하지 않다 — 카테고리를 바꾸더라도 이질감 없이 버튼이 고정되어 있게 · 등산처럼 헤더 고정"
            expect(bar).toContain("export const SPORT_HEADER_SIZE = { row: 56, side: 16, wordmark: 13, pill: 32, button: 34, gap: 4 } as const;");
            // 크기를 줄이던 변수(tight)와 종목 수로 가르던 가지가 없다 — Tailwind 의 leading-tight 는 그것이 아니다
            expect(bar).not.toMatch(/\bconst tight\b|\btight \?|sports\.length === 3|showLang/);
            // 크기는 치수 표에서만 온다(종목에 따라 갈리는 삼항이 색 말고는 없다)
            expect(bar).toContain("<RankueWordmark color={c.brand} height={z.wordmark} />");
            expect(bar).toContain("const iconSize = { width: z.button, height: z.button };");
            // 두 알약(고른 것 · 안 고른 것)이 같은 여백 상수를 쓴다 — 여백은 화면 폭으로만 갈리고 종목으로는 갈리지 않는다
            expect(bar.match(/\$\{PILL_PAD\} text-\[13px\]/g)?.length).toBe(2);
            // 고르지 않은 알약도 고른 것(굵은 글씨)과 같은 폭 — 종목을 바꿔도 전환 자리가 움직이지 않는다
            expect(bar).toContain('<span className="invisible font-semibold" aria-hidden>{s.label}</span>');
            // 세 종목 모두 맨 위에 붙는다 · 상태바 여백은 스스로(전역 규칙이 한 번 더 밀지 않게 rk-no-safe)
            expect(bar).toContain('const BAR_CLASS = "rk-no-safe sticky top-0 z-40 backdrop-blur-md";');
            expect(bar).toContain("marginTop: `calc(${-lift}px - env(safe-area-inset-top, 0px))`, paddingTop: \"env(safe-area-inset-top, 0px)\",");
            expect(bar.match(/className=\{`\$\{BAR_CLASS\} \$\{className \?\? ""\}`\} style=\{barStyle\(c, bleed, lift\)\}/g)?.length).toBe(2);
            // 홈마다 바탕 상자의 여백만 알려 준다 — 당구 px-5, 골프 p-6, 등산은 여백 없음
            expect(src).toContain('<SportHeader sport="BILLIARDS" bleed={20} />');
            expect(code(client("golf/components/dashboard/GolfHeader.tsx"))).toContain('<SportHeader sport="GOLF" bleed={24} lift={24} className="mb-5" />');
            expect(code(client("hiking/pages/HikingHome.tsx"))).toContain('<SportHeader sport="HIKING" />');
            // 붙어 따라오려면 화면 상자가 스크롤 상자여서는 안 된다 — 골프 홈은 가로 넘침을 clip 으로 자른다
            const golfHome = client("golf/pages/Dashboard.tsx");
            expect(golfHome).toContain('className="golf-home golf-home-clip min-h-screen bg-[#0A0A0A] text-white p-6 pb-32 font-sans relative"');
            expect(golfHome).not.toMatch(/golf-home[^"]*overflow-x-hidden/);
            expect(client("index.css")).toMatch(/\.golf-home-clip \{ overflow-x: hidden; \}\n@supports \(overflow: clip\) \{\n  \.golf-home-clip \{ overflow-x: clip; \}/);
        });

        it("아이폰 상태바 — 맨 위에 붙는 머리줄은 그만큼 끌어올린다(여백이 두 번 들어가지 않게) · 높이를 고정한 상자에 직접 걸지 않는다", () => {
            // 2026-10-13 오너의 아이폰 사진: 골프 조인 · 내 예약의 큰 빈칸(#root 여백 + 머리줄 여백), 채팅의 '선이 글자 가운데에'(h-14 상자에 여백이 밀려 들어감)
            const css = client("index.css");
            expect(css).toMatch(/\.fixed\.top-0:not\(\.rk-no-safe\), \.sticky\.top-0:not\(\.rk-no-safe\) \{\n    padding-top: env\(safe-area-inset-top\);\n  \}/);
            expect(css).toMatch(/\.sticky\.top-0:not\(\.rk-no-safe\) \{\n    margin-top: calc\(-1 \* env\(safe-area-inset-top\)\);\n  \}/);
            // 채팅 목록 · PBA 선수 — 바깥 상자에 sticky, 높이(h-14)는 안쪽 줄에. 채팅의 갈래 칩은 머리줄 밑(상태바만큼 더)에 붙는다
            const hub = client("pages/hiq/chat-hub.tsx");
            expect(hub).toContain('<header className="sticky top-0 z-40 bg-surface-0/90 backdrop-blur border-b border-surface-line" data-testid="chat-hub-header">');
            expect(hub).toContain('<div className="px-5 h-14 flex items-center justify-between gap-2">');
            expect(hub).toContain('style={{ top: "calc(3.5rem + env(safe-area-inset-top, 0px))" }}');
            expect(hub).not.toMatch(/sticky top-0[^"]*\bh-14\b/);
            expect(client("pages/hiq/pba-player.tsx")).not.toMatch(/sticky top-0[^"]*\bh-14\b/);
            // 화면의 맨 위가 아닌 sticky top-0 은 전역 규칙에서 뺀다(끌어올리면 위의 것을 덮는다)
            expect(client("golf/components/membership/MembershipTabs.tsx")).toContain('className="rk-no-safe sticky top-0 z-40');
            expect(client("pages/partner/dashboard.tsx")).toContain('store.impersonating ? "rk-no-safe sticky top-0 z-30');
            // 앱 전체에 '높이를 고정한 sticky top-0'(rk-no-safe 없이)이 남아 있지 않다 — 새로 만들 때도 같은 함정이다
            const walk = (dir: string): string[] => readdirSync(resolve(__dirname, "../client/src", dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".tsx") ? [`${dir}/${e.name}`] : []));
            const squeezed = walk(".").flatMap((f) => [...client(f).matchAll(/className="([^"]*)"/g)].map((m) => m[1]).filter((c) => /\bsticky\b/.test(c) && /\btop-0\b/.test(c) && !/rk-no-safe/.test(c) && /(^|\s)h-(\d+|\[\d)/.test(c)).map((c) => `${f}: ${c.slice(0, 80)}`));
            expect(squeezed).toEqual([]);
            // 머리줄을 둔 화면의 상자가 스크롤 상자(overflow-x-hidden)면 끌어올린 머리줄이 그 상자의 위 끝에 도로 붙는다 — 여백이 두 번(골프 '명문 코스')
            const boxed = walk(".").filter((f) => { const src = client(f); return /className="[^"]*\bsticky\b[^"]*\btop-0\b[^"]*"|className="[^"]*\btop-0\b[^"]*\bsticky\b[^"]*"|<SportBackHeader|<SportHeader |<HikingShell|<CourseShell/.test(src) && /className="[^"]*min-h-screen[^"]*overflow-(x-)?hidden[^"]*"|className="[^"]*overflow-(x-)?hidden[^"]*min-h-screen[^"]*"/.test(src); });
            expect(boxed).toEqual([]);
        });

        it("전체 메뉴 · 랭킹 · 커뮤니티 — 흘러가 버리던 머리를 같은 뒤로가기 머리줄로 고정", () => {
            // 2026-10-13 오너: "각 페이지에 헤더에 해당하는 부분을 고정시키기"
            const menu = client("pages/hiq/menu.tsx"), ranking = client("pages/hiq/ranking.tsx"), community = client("pages/hiq/community.tsx");
            expect(menu).toContain('<SportBackHeader sport={sport} title={t("menu.title")} bleed={20} lift={24} className="mb-6"');
            expect(ranking).toContain('<SportBackHeader sport={sport} title={currentSport === "GOLF" ? t("ranking.golfTitle") : t("ranking.title")} bleed={20} lift={24} />');
            expect(community).toContain('<SportBackHeader sport={sport} title={t("community.title")} bleed={20} lift={24} />');
            expect(client("pages/hiq/settings.tsx")).toContain('<SportBackHeader sport={sport} title={t("settings.title")} fallback="/menu" bleed={20} lift={24} className="mb-6" />');
            for (const src of [menu, ranking, community]) { expect(src).toContain("rk-clip-x min-h-screen"); expect(src).not.toMatch(/min-h-screen[^"]*overflow-x-hidden/); }
            // 게스트에게는 알림함 · 설정 단추를 그리지 않는다(예전 그대로)
            expect(menu).toContain("right={!isGuest ? (");
        });

        it("크루 화면에도 같은 고정 머리줄 — 세 종목이 한 화면을 쓴다 · '크루' 글자는 화면에 두지 않는다", () => {
            // 2026-10-13 오너: "헤더는 크루까지만 적용하자 — 당구 크루 · 골프 크루 · 등산 크루, 크루에 크루 텍스트는 제거"
            const club = client("pages/hiq/club.tsx");
            expect(club).toContain('<SportHeader sport={sport} inner="mx-auto max-w-md" />');
            expect(club).toContain('<h1 className="sr-only">{t("club.title")}</h1>');
            expect(club).not.toContain("<h1 className={CREW_TEXT.title}>");
            // 등산을 당구로 보고하는 currentSport 가 아니라 sport — 등산 크루에서는 등산의 색이다
            expect(club).toContain("const { sport } = useSport();");
        });

        it("당구의 친구 · 기록 — 골프 · 등산과 같은 뒤로가기 머리줄(맨 위에 붙는 한 줄: ‹ 제목)", () => {
            // 2026-10-13 오너: "당구에 친구 · 기록 페이지에 뒤로가기를 골프와 등산의 뒤로가기와 동일하게 — 골프와 등산의 뒤로가기 헤더가 깔끔하네"
            const friends = client("pages/hiq/friends.tsx"), history = client("pages/hiq/history.tsx");
            expect(friends).toContain("<SportBackHeader sport={sport} title={t(config.title)} bleed={20} lift={24}");
            expect(history).toContain("<SportBackHeader sport={sport} title={t(config.title)} bleed={20} lift={20} />");
            // 예전의 둥근 흰 단추 · 큰 제목은 없다
            for (const src of [friends, history]) expect(code(src)).not.toMatch(/LucideChevronLeft|text-\[26px\]|motion\.button/);
            // 붙어 따라오려면 화면 상자가 스크롤 상자여서는 안 된다
            for (const src of [friends, history]) { expect(src).toContain('className="rk-clip-x min-h-screen'); expect(src).not.toMatch(/min-h-screen[^"]*overflow-x-hidden/); }
            expect(client("index.css")).toMatch(/\.rk-clip-x \{ overflow-x: hidden; \}\n@supports \(overflow: clip\) \{\n  \.rk-clip-x \{ overflow-x: clip; \}/);
            // 뒤로: 돌아갈 데가 있으면 한 칸, 없으면 홈으로. 높이 · 색은 세 종목 머리줄과 같은 표에서
            expect(bar).toContain("const back = () => (window.history.length > 1 ? window.history.back() : setLocation(fallback));");
            expect(bar).toContain("const c = SPORT_HEADER_THEME[sport], z = SPORT_HEADER_SIZE;");
            expect(bar).toContain('<h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-tight" style={{ color: c.text }}>{title}</h1>');
        });
    });

    describe("회원의 것은 비로그인에게 그리지 않는다 — 캐시에 남은 옛 답도", () => {
        it("진행 중 경기 · 진행 중 온라인 대전: 숨김", () => {
            expect(code(client(`${DASH}/OngoingGameBanner.tsx`))).toContain("if (!member || !game) return null;");
            expect(code(client(`${DASH}/SimMatchBanner.tsx`))).toContain("if (!member || !first) return null;");
        });

        it("내 실력의 온라인 칸(HomeSkillCard): 비로그인에게 예시 숫자를 억지로 만들지 않는다 — 시작을 권한다", () => {
            const src = code(client(`${DASH}/HomeSkillCard.tsx`));
            expect(src).toContain("const playedHere = !sample && boards.some((b) => b.gameType === cur && b.matches > 0);");
            expect(src).toContain("const onlineDama = !sample ? handi?.target ?? null : null;");
            expect(src).toContain('const lk = !sample && cur === "3c" ? look.data : undefined;');
            expect(src).not.toContain("GUEST_SAMPLE");
        });

        it("프로필 완성 넛지는 회원에게만", () => {
            // 2026-10-20 — 성별 · 나이대 배너(창이 그 자리에서 열린다). 비었는지는 배너가 스스로 본다(shared/profileBasics needsProfileBasics)
            expect(jsx).toContain('{member && <ProfileNudge sport="BILLIARDS" className="mb-4" />}');
        });
    });

    describe("예시는 한 곳에서 고른다 — 비로그인이 확인된 때만", () => {
        it("홈: sample = isGuest ? GUEST_SAMPLE.billiards : null — 회원이면 null", () => {
            expect(billiards).toContain("const sample = gate.isGuest ? GUEST_SAMPLE.billiards : null;");
            expect(home.match(/GUEST_SAMPLE\.billiards/g)).toHaveLength(1);
        });

        it("예시를 그리는 카드 둘에 넘긴다 — 내 실력(실전 칸 · 내 다마) · 매장 랭킹", () => {
            const record = jsx.slice(jsx.indexOf("<HomeSkillCard"), jsx.indexOf("<CueCaseHub"));
            expect(record).toContain("sample={sample}");
            const ranking = jsx.slice(jsx.indexOf("<RankingListCard"), jsx.indexOf("<AppInstallCard"));
            expect(ranking).toContain("rankings={sampleRankings ?? rankings}");
            expect(ranking).toContain("sample={!!sample}");
        });

        it("예시 숫자를 그리는 카드마다 '예시' 표시(SampleBadge)가 있다", () => {
            for (const file of ["HomeSkillCard.tsx", "RealHandicapCard.tsx", "RankingListCard.tsx"]) {
                const src = code(client(`${DASH}/${file}`));
                expect(src, file).toMatch(/import \{[^}]*\bSampleBadge\b[^}]*\} from "@\/components\/hiq\/GuestGate";/);
                expect(src, file).toMatch(/\{?sample (?:&&|\?) .*<SampleBadge/);
            }
            // 홈 자신은 예시 숫자를 직접 그리지 않는다 — 카드에 넘기기만 한다
            expect(jsx).not.toMatch(/sample\.(?:real|history|percentile)\b/);
        });
    });

    describe("내 실전 기록(RealHandicapCard) — 사라지지 않고 예시로 같은 카드", () => {
        const src = code(client(`${DASH}/RealHandicapCard.tsx`));

        it("회원이 아니라고 통째로 null 을 돌려주지 않는다 — 예시가 있으면 그린다", () => {
            expect(src).not.toContain("if (!member) return null;");
            expect(src).toContain("const me = sample ? sample.member : member;");
            expect(src).toContain("if (!me) return null;");
        });

        it("서버 응답·경기 기록·상위 % 자리에 예시 값을 넣는다 — 그리는 코드는 회원과 같은 길", () => {
            expect(src).toContain("const data = sample ? sample.real : q.data;");
            expect(src).toContain("= sample ? sample.history : history;");
            expect(src).toContain("const pct = sample ? sample.percentile[cur] : getPercentile?.(cur) ?? null;");
            // 예시 값을 넣은 뒤로는 q.data 를 직접 읽지 않는다(캐시에 남은 옛 답이 섞이지 않게)
            expect(src.match(/\bq\.data\b/g)).toHaveLength(1);
        });

        it("제목 옆에 SampleBadge", () => {
            expect(src).toContain("{sample ? <div className=\"flex items-center gap-1.5 min-w-0\">{title}<SampleBadge /></div> : title}");
        });

        it("훅을 다 부른 뒤에 돌려준다(조건부 훅 금지)", () => {
            const out = src.indexOf("if (!me) return null;");
            for (const hook of ["useQuery<", "useState", "useEffect(", "useAuth()", "useToast()", "useLocation()", "useT()"]) {
                expect(src.lastIndexOf(hook), hook).toBeGreaterThan(0);
                expect(src.lastIndexOf(hook), hook).toBeLessThan(out);
            }
        });

        it("4구 전용 문구 둘은 예시용으로 바꾼다 — 예시 다섯 명 안의 순위가 '랭큐 회원 순위'로 읽히지 않게", () => {
            expect(src).toContain('t(sample ? "guestHome.sampleRank" : "real.rank4c")');
            expect(src).toContain('t(sample ? "guestHome.sampleNote" : "real.note4c")');
            expect(koValue("guestHome.sampleRank")).toContain("예시");
            expect(koValue("guestHome.sampleNote")).toContain("예시");
        });

        // 2026-10-06 오너: "실제 '나'를 우리 로고로 사용하고 프로도 실존 인물로 해줘. 그래야 실감나지" — 예전 단언은
        // "칸 이름(compare.me)과 같은 말의 첫 글자"였다. 이제 예시의 얼굴은 글자가 아니라 랭큐 로고(앱 아이콘)라 그 단언을 새 규칙으로 바꿨다.
        it("비교표 '나' 칸의 얼굴: 예시일 땐 MeAvatar(회원 사진, 없으면 한글 '나')가 아니라 랭큐 로고 — 금색 테는 그대로, 다섯 언어가 같은 그림", () => {
            const face = src.slice(src.indexOf("const meFace = sample"), src.indexOf(": <MeAvatar />;"));
            expect(face).toContain('? <CrewAvatar src="/icon-192.png"');
            expect(face).toContain("ring-2 ring-[#F5B721]");
            // 로고 파일이 실제로 있다(없으면 깨진 그림이 뜬다 — CrewAvatar 는 src 가 있으면 글자로 돌아가지 않는다)
            expect(() => readFileSync(resolve(__dirname, "../client/public/icon-192.png"))).not.toThrow();
            expect(src).toContain(": <MeAvatar />;");
            // MeAvatar 를 직접 그리는 자리는 그 한 군데(회원 갈래)뿐 — 비교표 두 곳은 meFace 를 쓴다
            expect(src.match(/<MeAvatar \/>/g)).toHaveLength(1);
            expect(src.match(/avatar: meFace \}/g)).toHaveLength(2);
            // 칸 이름은 여전히 사전 키
            for (const l of LOCALES) expect(dictHas(l, "compare.me"), l).toBe(true);
        });

        it("예시에서는 내 기록 화면(/history)으로 가지 않고, 공유도 없다", () => {
            expect(src).toContain('const openHistory = sample ? undefined : () => setLocation("/history");');
            expect(src.match(/setLocation\("\/history"\)/g)).toHaveLength(1);
            expect(src).toContain("onShare={sample ? undefined : () => void share()}");
        });

        /* ── 예시 카드의 실제 프로(2026-10-06 오너: "프로도 실존 인물로") ──
         * 예시 자료(GUEST_SAMPLE)에는 실제 선수를 넣지 않는다. 프로는 카드가 공개 API 로 그때 불러와 3쿠션 칸에 덧씌운다. */
        describe("예시의 닮은 프로 — 자료가 아니라 공개 API 에서", () => {
            const AVG_API = "/api/hiq/compare/avg?avg=";

            it("예시일 때만 공개 API 를 부른다 — 회원은 부르지 않는다(/compare/real 이 같은 값을 준다)", () => {
                const call = queryCall(client(`${DASH}/RealHandicapCard.tsx`), AVG_API);
                expect(call).toContain("useQuery<CompareAvgResponse>");
                expect(call).toContain("enabled: !!sample");
                expect(call).not.toContain("!!member");
                // 선수 페이지 '나와 비교하기'와 같은 키·같은 신선도(10분) — 캐시를 같이 쓴다. 실패하면 다시 묻지 않고 '회원끼리' 갈래로 남는다
                expect(call).toContain("staleTime: 10 * 60_000");
                expect(call).toContain("retry: false");
                expect(src.split(AVG_API)).toHaveLength(2);
                expect(code(client("components/hiq/compare/ProCompareCard.tsx"))).toContain("queryKey: [`/api/hiq/compare/avg?avg=${tryAvg.toFixed(2)}${exclude}`]");
            });

            it("묻는 값은 예시 인물의 3쿠션 에버리지, 소수 둘째 자리 — 서버가 받는 범위 안", () => {
                expect(src).toContain('const sampleAvg3c = sample?.real["3c"].avg ?? null;');
                expect(src).toContain("queryKey: [`/api/hiq/compare/avg?avg=${(sampleAvg3c ?? 0).toFixed(2)}`]");
                const avg = GUEST_SAMPLE.billiards.real["3c"].avg;
                expect(avg).not.toBeNull();
                expect(normalizeAvg(avg!.toFixed(2))).toBe(Number(avg!.toFixed(2)));
            });

            it("새 쿼리도 조기 반환 앞 — 그리고 예시가 아니면 답을 읽지 않는다(선수 페이지에서 받아 둔 같은 키의 캐시가 있어도)", () => {
                expect(src.indexOf("const twin = useQuery<CompareAvgResponse>(")).toBeGreaterThan(0);
                expect(src.indexOf("const twin = useQuery<CompareAvgResponse>(")).toBeLessThan(src.indexOf("if (!me) return null;"));
                expect(src).toContain('const twinRes = sample && cur === "3c" ? twin.data ?? null : null;');
                // twin.data 를 읽는 곳은 그 한 줄뿐 — 4구 탭·회원에게는 닿지 않는다
                expect(src.match(/\btwin\.data\b/g)).toHaveLength(1);
                expect(src).toContain('const twinLoading = !!sample && cur === "3c" && twin.isLoading;');
            });

            it("받은 pros[0]·tier·pos·members 를 3쿠션 칸에 덧씌운다 — 못 받으면 예시 자료 그대로('회원끼리' 갈래)", () => {
                expect(src).toContain("twinRes.pros[0] ?? null");
                const overlay = src.slice(src.indexOf("const d: RealSide = "), src.indexOf("const twinLoading"));
                expect(overlay).toContain("const d: RealSide = twinRes && twinPro");
                expect(overlay).toContain("? { ...data[cur], pro: twinPro, tier: twinRes.tier ?? null, pos: twinRes.pos ?? null, members: twinRes.members ?? null }");
                expect(overlay).toContain(": data[cur];");
                // 예시의 members(예시 다섯 명 안 순위)를 '랭큐 회원 상위 n%' 칩에 되살리지 않는다 — 응답에 없으면 칩이 빠진다
                expect(overlay).not.toMatch(/members: twinRes\.members \?\? (?!null)/);
            });

            it("옛 본문(CDN 캐시)에는 tier·pos 가 없다 — 타입이 선택 필드이고, 프로 머리는 없을 때 칩·사다리를 그리지 않는다", () => {
                const types = readFileSync(resolve(__dirname, "proCompare.ts"), "utf8");
                const res = types.slice(types.indexOf("export interface CompareAvgResponse"), types.indexOf("export interface CompareMyStats"));
                expect(res).toContain("tier?: 0 | 1 | 2 | 3 | 4 | null;");
                expect(res).toContain("pos?: number | null;");
                const ui = code(client("components/hiq/compare/lookalikeUi.tsx"));
                expect(ui).toContain("{tier != null && <TierChip tier={tier} />}");
                expect(ui).toContain("{tier != null && pos != null && <TierLadder tier={tier} pos={pos} />}");
            });

            /** 프로 갈래 — 3쿠션이고 닮은 프로가 있을 때 */
            const proBranch = src.slice(src.indexOf('if (d.type === "3c" && d.pro) {'), src.indexOf("const m = d.members;"));

            it("예시의 프로 갈래에는 공유 단추가 없다 — 프로 단추(공개 선수 페이지)는 둔다", () => {
                expect(proBranch.length).toBeGreaterThan(0);
                expect(proBranch).toContain("<CardActions primary={matchAction} onPro={openPro} onShare={sample ? undefined : () => void share()} sharing={sharing} />");
                // 가드 없는 공유가 카드 어디에도 남아 있지 않다 — 두 갈래 모두 예시면 undefined
                expect(src).not.toContain("onShare={() => void share()}");
                expect(src.match(/onShare=\{sample \? undefined : \(\) => void share\(\)\}/g)).toHaveLength(2);
                expect(proBranch).toContain("setLocation(`/pba-player/${encodeURIComponent(pro.memCode)}`)");
            });

            it("online.data 를 예시에서 읽지 않는다 — 로그아웃 뒤 캐시에 남은 이전 회원의 온라인 에버가 섞이지 않게", () => {
                const first = src.indexOf("online.data");
                expect(first).toBeGreaterThan(0);
                expect(src.slice(first - "!sample && ".length, first)).toBe("!sample && ");
                // 읽는 곳은 그 한 식뿐(ready · avg != null · avg.toFixed) — 전부 !sample 뒤에 묶여 있다
                expect(src).toContain('!sample && online.data?.ready && online.data.avg != null && d.type === "3c" ? fill(t("real.onlineAvg"), { v: online.data.avg.toFixed(2) }) : "",');
                expect(src.match(/\bonline\.data\b/g)).toHaveLength(3);
            });

            it("프로 갈래에도 예시임을 알리는 한 줄 — 내 숫자는 예시, 프로 기록은 실제. 제목 옆 SampleBadge 는 그대로", () => {
                expect(proBranch).toContain('{sample && <p className="text-[12px] text-ink-3 mt-1">{t("guestHome.sampleProNote")}</p>}');
                expect(proBranch).toContain("{head}");
                const line = koValue("guestHome.sampleProNote");
                expect(line).toBe("내 숫자는 예시예요. 프로 기록은 실제입니다. 가입하고 경기를 치면 내 기록으로 바뀌어요");
                for (const l of LOCALES) expect(dictHas(l, "guestHome.sampleProNote"), l).toBe(true);
            });

            it("'경기 시작' 단추는 프로 갈래에서도 같은 것 — 홈의 문(가입 안내)을 탄다", () => {
                expect(proBranch).toContain("primary={matchAction}");
            });

            it("받는 동안의 자리 잡기는 '회원끼리' 갈래에만, 받는 동안만", () => {
                expect(src.match(/\{twinLoading && /g)).toHaveLength(1);
                expect(src.indexOf("{twinLoading && ")).toBeGreaterThan(src.indexOf("const m = d.members;"));
            });

            it("예시 자료에는 실제 선수가 없다 — 프로는 그릴 때만 붙는다", () => {
                for (const type of ["3c", "4c"] as const) {
                    const side = GUEST_SAMPLE.billiards.real[type];
                    expect([side.pro, side.next, side.tier, side.pos]).toEqual([null, null, null, null]);
                }
                // 홈은 여전히 예시 자료만 넘긴다 — 프로를 부르는 것은 카드 안
                expect(home).not.toContain("/api/hiq/compare/avg");
            });
        });

        it("'경기 시작' 단추는 홈의 문을 거친다", () => {
            expect(src).toContain('const matchAction = { label: t("real.match"), icon: LucidePlay, onClick: onStartMatch };');
            expect(jsx).toContain('onStartMatch={() => handleStartGameClick("match")}');
        });

        it("홈의 내 실력 카드 바로 아래에 가입 안내 한 줄(GuestJoinCta) — 비로그인에게만", () => {
            const below = jsx.slice(jsx.indexOf("<HomeSkillCard"), jsx.indexOf("<CueCaseHub"));
            expect(below).toMatch(/\{sample && \(?\s*<GuestJoinCta/);
            expect(below).toContain('title={t("guestHome.recordCtaTitle")}');
            expect(below).toContain('desc={t("guestHome.recordCtaDesc")}');
            expect(koValue("guestHome.recordCtaTitle")).toBe("가입하면 내 실전 기록이 이렇게 쌓여요");
            expect(koValue("guestHome.recordCtaDesc")).toBe("점수판으로 친 경기가 수지와 전적이 됩니다");
        });
    });

    describe("실전 점수판(ScoreboardHero) — 입구 셋은 입구에서 가입 안내, 내 다마는 내 실력 카드의 예시", () => {
        const board = code(client(`${DASH}/ScoreboardHero.tsx`));

        it("내 다마: '—' 로 비우지 않고 예시 숫자 + SampleBadge — 맨 위 내 실력 카드가 그린다", () => {
            const skill = code(client(`${DASH}/HomeSkillCard.tsx`));
            expect(skill).toContain("const data = sample ? sample.real : real.data;");
            expect(skill).toContain("{sample && <SampleBadge />}");
            // 점수판 판의 숫자는 화면 미리 보기 — 예시 인물 · 내 기록을 읽지 않는다
            expect(board).toContain('t("home.boardPreview")');
            expect(board).not.toMatch(/sample|useQuery|useAuth/);
        });

        it("막는 자리는 홈의 두 함수 한 곳 — 경기 시작·혼자 연습은 handleStartGameClick, PIN 은 handleJoinGameClick", () => {
            const start = billiards.slice(billiards.indexOf("const handleStartGameClick"), billiards.indexOf("const handleJoinGameClick"));
            expect(start).toContain("gate.guard(() => {");
            expect(start).toContain("toggleModal('game', true);");
            expect(start).toContain('from: "/dashboard"');
            const join = billiards.slice(billiards.indexOf("const handleJoinGameClick"), billiards.indexOf("useEffect(", billiards.indexOf("const handleJoinGameClick")));
            expect(join).toContain("gate.guard(() => toggleModal('join', true), {");
            expect(join).toContain('from: "/dashboard"');
        });

        it("guard 를 거치지 않고 생성 창·PIN 창을 여는 길이 없다", () => {
            // PIN 창을 여는 곳은 guard 안 한 군데
            expect(billiards.match(/toggleModal\('join', true\)/g)).toHaveLength(1);
            // 생성 창을 여는 곳은 guard 안 + 채팅 카드에서 이어받는 효과(회원 전용) 둘뿐
            expect(billiards.match(/toggleModal\('game', true\)/g)).toHaveLength(2);
            const effect = billiards.slice(billiards.indexOf("if (!member || matchParamRef.current) return;"));
            expect(effect.indexOf("toggleModal('game', true)")).toBeGreaterThan(0);
            expect(billiards.indexOf("gate.guard(() => {")).toBeLessThan(billiards.indexOf("if (!member || matchParamRef.current) return;"));
        });

        it("입구가 전부 그 두 함수로 이어진다 — 점수판 판 · 혼자 연습 · PIN · 설명 창 · 내 실력의 실전 시작", () => {
            expect(jsx).toContain("<ScoreboardHero onStart={handleStartGameClick} onJoin={handleJoinGameClick} />");
            expect(jsx.match(/onStartGame=\{handleStartGameClick\}/g)).toHaveLength(1);
            expect(jsx.match(/onJoinGame=\{handleJoinGameClick\}/g)).toHaveLength(1);
            expect(board).toContain('onClick={() => onStart("match")}');
            expect(board).toContain('onClick={() => onStart("practice")}');
            expect(board).toContain("onClick={onJoin}");
            // 점수판 구역이 제 손으로 창을 열거나 서버를 부르지 않는다
            expect(board).not.toMatch(/toggleModal|GameCreationModal|PinCodeModal|apiRequest/);
        });

        it("받은 시트를 홈에 한 번 그린다", () => {
            expect(jsx.match(/\{gate\.sheet\}/g)).toHaveLength(1);
        });
    });

    describe("당구 게임(OnlineGameCard) — 혼자 치기는 그대로, 같이 치기는 가입 안내", () => {
        const src = code(client(`${DASH}/OnlineGameCard.tsx`));

        it("혼자 치기 · 길 찾기는 비로그인도 그대로 연다", () => {
            for (const to of ["/online-game?solo=1", "/online-game?path=1"]) {
                expect(src, to).toContain(`onClick={() => setLocation("${to}")}`);
            }
        });

        it("이번 주 드릴은 guard — 드릴 API 는 전부 로그인 필수라 그냥 보내면 '목록을 불러오지 못했어요'에서 끝난다", () => {
            expect(src).toContain('const openDrills = () => gate.guard(() => setLocation("/online-game?drills=1"), {');
            const drills = src.slice(src.indexOf("const openDrills = "), src.indexOf("const roomsRef"));
            // 가입 뒤에는 드릴 화면으로 돌아온다. 문구는 대전용(gateTogether*)이 아니라 드릴용
            expect(drills).toContain('from: "/online-game?drills=1"');
            expect(drills).toContain('title: t("guestHome.gateDrillTitle")');
            expect(drills).toContain('desc: t("guestHome.gateDrillDesc")');
            expect(drills).not.toContain("gateTogether");
            expect(src).toContain("onClick={openDrills}");
            // guard 없이 바로 가는 길이 남아 있지 않다
            expect(src).not.toContain('onClick={() => setLocation("/online-game?drills=1")}');
            expect(src.match(/setLocation\("\/online-game\?drills=1"\)/g)).toHaveLength(1);
        });

        it("드릴 값 자리: 비로그인에게 '시작 전'(거짓 빈 값) 대신 가입 안내", () => {
            expect(src).toContain('{drill ? `${drill.successes}/${drill.total}` : gate.isGuest ? t("guestHome.drillJoin") : t("home.drillStart")}');
            expect(koValue("guestHome.drillJoin")).toBe("가입 후 도전");
            // 서버가 드릴을 로그인 필수로 두는 동안만 맞는 문이다 — 비로그인에 열면 이 시험과 문을 함께 고친다
            const api = readFileSync(resolve(__dirname, "../server/routes/modules/simDrill.ts"), "utf8");
            expect(api).toMatch(/router\.get\("\/sim\/drills\/week",\s*requireAuth/);
        });

        it("같이 치기의 입구(멀티방 · 초대 · 코드 · 방 만들기 · 방 줄)는 전부 guard", () => {
            expect(src).toContain("const gate = useGuestGate();");
            expect(src).toContain("const together = (to: string) => gate.guard(() => setLocation(to), {");
            expect(src).toContain("from: to,");
            for (const to of ["/online-game?rooms=1", "/online-game?lobby=1", "/online-game?lobby=1&tab=join", "/online-game?lobby=1&public=1"]) {
                expect(src, to).toContain(`together("${to}")`);
            }
            expect(src).toContain("together(`/online-game?rooms=1&room=${m.id}`)");
            // guard 없이 바로 가는 길이 남아 있지 않다
            expect(src).not.toMatch(/setLocation\([`"]\/online-game\?(?:rooms|lobby)/);
            expect(src.match(/\{gate\.sheet\}/g)).toHaveLength(1);
        });

        it("'열린 방이 없어요'(거짓 빈 값) 대신 '가입하면 같이 칠 수 있어요'", () => {
            const guest = src.indexOf('? t("guestHome.togetherJoin")');
            expect(guest).toBeGreaterThan(src.indexOf("{gate.isGuest"));
            expect(guest).toBeLessThan(src.indexOf('t("sim.rooms.empty")'));
            expect(src.match(/t\("sim\.rooms\.empty"\)/g)).toHaveLength(1);
            expect(koValue("guestHome.togetherJoin")).toBe("가입하면 같이 칠 수 있어요");
        });

        it("캐시에 남은 옛 방 목록·내 방·드릴을 비로그인에게 그리지 않는다", () => {
            expect(src).toContain("const list = gate.isGuest ? [] : rooms.data ?? [];");
            expect(src).toContain("const myRoom = gate.isGuest ? null : openRoom;");
            expect(src).toContain("const drill = !gate.isGuest && week.data ? weekProgress(week.data) : null;");
        });
    });

    describe("매장 랭킹(RankingListCard) — 예시 다섯 줄, 1위가 예시 인물", () => {
        const src = code(client(`${DASH}/RankingListCard.tsx`));
        const B = GUEST_SAMPLE.billiards;

        it("예시일 때 SampleBadge — 회원은 기본값(false)이라 그대로", () => {
            expect(src).toContain("sample = false }: RankingListCardProps");
            expect(src).toContain('{sample && <SampleBadge className="ml-auto" />}');
        });

        it("홈: 지금 탭의 예시 줄을 넘기고 이름은 사전 키로 그린다(다섯 언어)", () => {
            expect(billiards).toContain("sample.rankings[rankingTab].map((r) => ({ ...r, name: t(r.nameKey) }))");
        });

        it("예시에 '실시간 상위 10명'이라고 쓰지 않는다", () => {
            expect(jsx).toContain(': sample ? t("guestHome.rankSubtitle") : t("rankingListCard.subtitle")}');
            expect(src).toContain('{sample ? t("guestHome.rankSubtitle") : t("rankingListCard.subtitle")}');
        });

        it("예시는 접지 않는다 — 다섯 줄뿐인데 '10위까지 펼치기' 단추를 달지 않는다", () => {
            expect(src).toContain("const pv = sample ? undefined : preview;");
            expect(src).toContain("previewRows(displayRankings, pv)");
            expect(src).toContain("<RankPreviewToggle preview={pv} total={displayRankings.length} />");
            // 받은 preview 를 그대로 쓰는 자리가 남아 있지 않다
            expect(src).not.toMatch(/preview=\{preview\}|previewRows\(displayRankings, preview\)/);
        });

        it("줄은 눌리지 않는다 — 회원 정보로 가는 길이 없다", () => {
            const row = src.slice(src.indexOf("<motion.div"), src.indexOf("</motion.div>"));
            expect(row.length).toBeGreaterThan(0);
            expect(row).not.toMatch(/onClick|setLocation|href=/);
        });

        for (const type of ["3c", "4c"] as const) {
            it(`${type}: 카드가 거르는 조건(랭킹 점수 > 0 · 탈퇴회원 아님)에 다섯 줄이 다 남고, 맨 위가 예시 인물`, () => {
                const field = type === "3c" ? "rating3c" : "rating4c";
                const rows = B.rankings[type];
                const eligible = [...rows].sort((a, b) => b[field] - a[field]).filter((r) => r[field] > 0 && r.name !== "탈퇴회원");
                expect(eligible).toHaveLength(5);
                expect(eligible[0].id).toBe(B.member.id);
                // 홈이 currentMemberId 로 넘기는 값 — 1위 줄이 '나'로 칠해진다. 숫자는 '내 실전 기록' 예시와 같다
                expect(eligible[0][field]).toBe(B.member[field]);
            });
        }
    });

    describe("문구 — 다섯 언어 사전, 사실과 다른 말 없음", () => {
        const files = ["pages/hiq/dashboard.tsx", "components/hiq/cueCase/CueCaseHub.tsx", ...["DashboardHeader", "HomeSkillCard", "RealHandicapCard", "QuickActions", "ScoreboardHero", "OnlineGameCard", "RankingListCard"].map((f) => `${DASH}/${f}.tsx`)];
        const used = new Set(files.flatMap((f) => Array.from(code(client(f)).matchAll(/"(guestHome\.[A-Za-z0-9]+)"/g), (m) => m[1])));

        it("화면이 쓰는 guestHome.* 키가 ko·en·es·tr·vi 에 전부 있다", () => {
            expect(used.size).toBeGreaterThanOrEqual(16);
            for (const key of used) for (const l of LOCALES) expect(dictHas(l, key), `${l} ${key}`).toBe(true);
        });

        it("다섯 언어의 guestHome.* 키 목록이 서로 같다 — 한 언어에만 있거나 빠진 키가 없다", () => {
            const keysOf = (l: string) => Array.from(client(`lib/i18n/${l}.ts`).matchAll(/"(guestHome\.[A-Za-z0-9]+)":/g), (m) => m[1]).sort();
            const ko = keysOf("ko");
            // 홈이 쓰는 키는 전부 사전에 있다(다른 화면이 같은 머리말로 키를 더해도 이 시험은 깨지지 않는다)
            for (const key of used) expect(ko, key).toContain(key);
            expect(new Set(ko).size).toBe(ko.length);
            for (const l of LOCALES) expect(keysOf(l), l).toEqual(ko);
        });

        it("가입 수단·걸리는 시간, 술·돈·내기 말이 없다", () => {
            for (const key of used) {
                const line = koValue(key);
                expect(line, key).toBeTruthy();
                expect(line, key).not.toMatch(/\d\s*초|바로 가입|즉시|카카오|구글|애플|전화번호/);
                expect(line, key).not.toMatch(/술|맥주|소주|내기|판돈|\d\s*원|만\s*원/);
            }
        });

        it("브라우저 기본 confirm/alert 를 쓰지 않는다", () => {
            for (const f of files) expect(code(client(f)), f).not.toMatch(/(?<![.\w])(?:confirm|alert)\(/);
        });
    });
});
