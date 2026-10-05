import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// 당구 홈의 예시 랭킹이 카드의 거르는 조건을 통과하는지 볼 때 쓴다(순수 자료 — DB·서버 모듈을 물지 않는다)
import { GUEST_SAMPLE } from "./guestSample.js";

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
            expect(src).toContain('consolePath ? "BILLIARDS" : routeSport ?? (golfVisible ? saved : "BILLIARDS")');
        });

        it("종목 알약(setSport)도 같은 기준 — 볼 수 없는 사람이 골프를 고르면 당구로 되돌린다", () => {
            expect(src).toContain('sport === "GOLF" && !golfVisible ? "BILLIARDS" : sport');
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

        it("한국어 비로그인(확인 끝)은 goLogin 으로 — 지금 주소(경로 + 질의)를 돌아올 곳으로 넘긴다", () => {
            const guest = fn.slice(fn.indexOf(GUEST_KO));
            expect(fn.indexOf(GUEST_KO)).toBeGreaterThan(0);
            expect(guest).toMatch(/goLogin\([^;]*window\.location\.pathname \+ window\.location\.search\)/);
            // 로그인 화면에서 '뒤로' → 이 문 → 다시 로그인으로 튕기지 않게 자리를 바꿔 끼운다
            expect(guest).toContain("setLocation(to, { replace: true })");
        });

        it("한국어가 아닌 비로그인은 로그인으로 보내지 않는다 — 가입해도 이 문이 열리지 않는다(골프는 한국어 화면에서만)", () => {
            // 언어를 보지 않는 갈래가 남아 있지 않다
            expect(fn).not.toContain("if (isGuest) {");
            expect(fn).toContain("const { locale } = useT();");
            // 언어가 바뀌면 다시 판단한다
            expect(fn).toMatch(/\}, \[[^\]]*\blocale\b[^\]]*\]\);/);
            // goLogin 은 그 갈래 안 한 군데뿐
            expect(fn.match(/goLogin\(/g)).toHaveLength(1);
            expect(fn.indexOf("goLogin(")).toBeGreaterThan(fn.indexOf(GUEST_KO));
        });

        it("로그인했지만 골프 허용이 없는 사람·한국어가 아닌 비로그인은 홈으로 — 로그인 갈래 뒤에 온다", () => {
            const home = fn.indexOf('setLocation("/dashboard", { replace: true })');
            expect(home).toBeGreaterThan(fn.indexOf(GUEST_KO));
        });

        it("확인 중에는 아무 데도 보내지 않는다", () => {
            expect(fn).toContain("if (isLoading) return;");
            expect(fn.indexOf("if (isLoading) return;")).toBeLessThan(fn.indexOf("goLogin("));
        });

        it("초대 핀(?pin=)은 그대로 남긴다 — 그 주소로 곧장 돌아왔으면 지워서 두 번 들어가지 않게", () => {
            expect(fn).toContain('"rankue_golf_pending_pin"');
            expect(fn).toContain("sessionStorage.setItem(KEY, pin)");
            expect(fn.indexOf("sessionStorage.setItem(KEY, pin)")).toBeLessThan(fn.indexOf("goLogin("));
            expect(fn).toContain("if (pin && sessionStorage.getItem(KEY) === pin) sessionStorage.removeItem(KEY);");
        });
    });

    describe("'내 것' 쿼리 — 비로그인은 부르지 않는다(enabled)", () => {
        const enabledForMember = /enabled: !!(?:member|me)\b/;
        const cases: [string, string, string][] = [
            ["내 라운드 기록(useGolfStats)", "golf/hooks/useGolfStats.ts", '"/api/hiq/history"'],
            ["내 라운드 기록(골프 홈)", "golf/pages/Dashboard.tsx", '"/api/hiq/history"'],
            ["알림 수(머리줄, 60초 폴링)", "golf/components/dashboard/GolfHeader.tsx", "UNREAD_COUNT_KEY, {"],
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
            const src = code(client("golf/components/dashboard/GolfHeader.tsx"));
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

        it("홈 타일 넷(RANKUE MATCH · ENTER CODE · PASSPORT · PRO-AM)이 guard 를 거친다", () => {
            expect(quick).toContain('const gate = useGuestGate("dark");');
            expect(quick).toContain("gate.guard(onOpenGameMode, {");
            expect(quick).toContain("gate.guard(onOpenJoin, {");
            expect(quick).toContain("gate.guard(() => setLocation('/golf/passport'), {");
            expect(quick).toContain("gate.guard(() => setLocation('/golf/proam'), {");
            // guard 없이 바로 여는 길이 남아 있지 않다
            expect(quick).not.toContain("onClick={onOpenGameMode}");
            expect(quick).not.toContain("onClick={onOpenJoin}");
            expect(quick).not.toContain("onClick={() => setLocation('/golf/passport')}");
            expect(quick).not.toContain("onClick={() => setLocation('/golf/proam')}");
        });

        it("가입 뒤 돌아올 곳(from)은 가려던 주소", () => {
            for (const from of ["/golf/game/new?mode=match", "/golf/game/new?mode=join", "/golf/passport", "/golf/proam"]) {
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

        it("안내 문구가 사실과 맞다 — 핸디캡·그래프는 '골프장에서' 적은 라운드, 프로암은 '준비 중'", () => {
            // 홈의 평균·그래프는 현장 인증된 라운드만 센다(countsOnSite) — 조건 없이 '스코어를 적으면 쌓인다'고 하지 않는다
            for (const s of [quick, sheet]) {
                expect(s).toContain('desc: "골프장에서 스코어를 적으면 핸디캡과 그래프가 쌓여요.');
                expect(s).not.toMatch(/desc: "스코어를 적으면/);
            }
            // 프로암은 아직 응모를 열지 않았다(pages/ProAm.tsx) — 열려 있다고도, 소식·알림을 보내 준다고도 하지 않는다
            const proam = quick.slice(quick.indexOf("gate.guard(() => setLocation('/golf/proam'), {"), quick.indexOf('from: "/golf/proam"'));
            expect(proam).toContain("준비 중");
            expect(proam).not.toMatch(/열려 있어요|소식|알림/);
        });

        it("안내 문구에 가입 수단·걸리는 시간, 술·돈·내기 말이 없다", () => {
            const home = code(client("golf/pages/Dashboard.tsx"));
            const copy = [quick, sheet, home].flatMap((s) => Array.from(s.matchAll(/\b(?:title|desc)(?::\s*|=)"([^"]+)"/g), (m) => m[1]));
            // 타일 넷 + 시트 둘은 제목·설명 둘씩, 홈의 한 줄도 둘
            expect(copy.length).toBeGreaterThanOrEqual(14);
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

        it("goLogin 은 login=1 과 돌아올 곳을 같이 붙인다", () => {
            const src = client("components/hiq/LoginGate.tsx");
            expect(src).toContain("setLocation(`/?login=1&redirect=${encodeURIComponent(back)}`)");
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
            ["3쿠션 랭킹(상위 % 용)", "pages/hiq/dashboard.tsx", 'queryKey: ["/api/hiq/rankings", "3c"]'],
            ["내 경기 기록", "hooks/useDashboardStats.ts", '"/api/hiq/history"'],
            ["매장 랭킹", "hooks/useDashboardStats.ts", "`/api/hiq/rankings`"],
            ["알림 수(머리)", `${DASH}/DashboardHeader.tsx`, "UNREAD_COUNT_KEY, {"],
            ["진행 중 경기", `${DASH}/OngoingGameBanner.tsx`, '"/api/hiq/game/ongoing/mine"'],
            ["진행 중 온라인 대전", `${DASH}/SimMatchBanner.tsx`, "queryKey: MATCH_LIST_QUERY_KEY"],
            ["실전 비교(내 실전 기록)", `${DASH}/RealHandicapCard.tsx`, '"/api/hiq/compare/real"'],
            ["온라인 에버(내 실전 기록)", `${DASH}/RealHandicapCard.tsx`, '"/api/hiq/sim/lookalike"'],
            ["실전 비교(내 다마)", `${DASH}/QuickActions.tsx`, '"/api/hiq/compare/real"'],
            ["열린 방 목록(20초 폴링)", `${DASH}/OnlineGameCard.tsx`, "queryKey: ROOMS_QUERY_KEY"],
            ["이번 주 드릴", `${DASH}/OnlineGameCard.tsx`, "queryKey: DRILL_WEEK_QUERY_KEY"],
            ["닮은 프로(온라인)", `${DASH}/LookalikeProCard.tsx`, '"/api/hiq/sim/lookalike"'],
            ["내 온라인 다마수", `${DASH}/LookalikeProCard.tsx`, "queryKey: HANDICAP_QUERY_KEY"],
        ];
        for (const [name, file, marker] of cases) {
            it(name, () => {
                expect(queryCall(client(file), marker)).toContain("enabled: !!member");
            });
        }
    });

    describe("머리(DashboardHeader) — 이름 대신 한 줄, 종 대신 로그인", () => {
        const src = code(client(`${DASH}/DashboardHeader.tsx`));
        const first = src.indexOf("{isGuest ? (");
        const second = src.indexOf("{isGuest ? (", first + 1);
        const branch = (at: number) => src.slice(at, src.indexOf(") : (", at));

        it("이름 자리: '둘러보는 중이에요' — '님'만 남는 빈 인사말을 그리지 않는다", () => {
            expect(first).toBeGreaterThan(0);
            expect(branch(first)).toContain('t("guestHome.browsing")');
            expect(branch(first)).not.toContain("dashboardHeader.honorific");
            expect(koValue("guestHome.browsing")).toBe("둘러보는 중이에요");
        });

        it("알림 종 자리: 로그인 단추(goLogin — 끝나면 보던 홈으로), 알림함은 회원에게만", () => {
            expect(second).toBeGreaterThan(first);
            expect(branch(second)).toContain("goLogin(setLocation)");
            expect(branch(second)).toContain('t("guestHome.login")');
            expect(branch(second)).not.toContain("<Bell");
            expect(src).toContain("{!isGuest && <NotificationInbox");
        });

        it("종목 알약은 '볼 수 있는가'(useGolfVisible)로 — 한국어 방문자도 골프 홈으로 넘어간다", () => {
            expect(src).toContain("const golfVisible = useGolfVisible();");
            expect(src).toContain("{golfVisible && <button");
            expect(src).not.toContain("useGolfAccess()");
            expect(src).not.toMatch(/\bgolfOk\b/);
        });
    });

    describe("회원의 것은 비로그인에게 그리지 않는다 — 캐시에 남은 옛 답도", () => {
        it("진행 중 경기 · 진행 중 온라인 대전: 숨김", () => {
            expect(code(client(`${DASH}/OngoingGameBanner.tsx`))).toContain("if (!member || !game) return null;");
            expect(code(client(`${DASH}/SimMatchBanner.tsx`))).toContain("if (!member || !first) return null;");
        });

        it("내 온라인 실력(LookalikeProCard): 숨김 그대로 — 예시를 억지로 만들지 않는다", () => {
            const src = code(client(`${DASH}/LookalikeProCard.tsx`));
            expect(src).toContain("if (!member) return null;");
            expect(src).not.toContain("GUEST_SAMPLE");
        });

        it("프로필 완성 넛지는 회원에게만", () => {
            expect(jsx).toContain("{member && (!(member as any).gender || !(member as any).birthYear) && (");
        });
    });

    describe("예시는 한 곳에서 고른다 — 비로그인이 확인된 때만", () => {
        it("홈: sample = isGuest ? GUEST_SAMPLE.billiards : null — 회원이면 null", () => {
            expect(billiards).toContain("const sample = gate.isGuest ? GUEST_SAMPLE.billiards : null;");
            expect(home.match(/GUEST_SAMPLE\.billiards/g)).toHaveLength(1);
        });

        it("예시를 그리는 카드 셋에 넘긴다 — 내 실전 기록 · 점수판(내 다마) · 매장 랭킹", () => {
            const record = jsx.slice(jsx.indexOf("<RealHandicapCard"), jsx.indexOf("<section"));
            expect(record).toContain("sample={sample}");
            expect(jsx).toContain("<ScoreboardActions onStartGame={handleStartGameClick} onJoinGame={handleJoinGameClick} sample={sample} />");
            const ranking = jsx.slice(jsx.indexOf("<RankingListCard"), jsx.indexOf("<AppInstallCard"));
            expect(ranking).toContain("rankings={sampleRankings ?? rankings}");
            expect(ranking).toContain("sample={!!sample}");
        });

        it("예시 숫자를 그리는 카드마다 '예시' 표시(SampleBadge)가 있다", () => {
            for (const file of ["RealHandicapCard.tsx", "QuickActions.tsx", "RankingListCard.tsx"]) {
                const src = code(client(`${DASH}/${file}`));
                expect(src, file).toContain('import { SampleBadge } from "@/components/hiq/GuestGate";');
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

        it("비교표 '나' 칸의 얼굴: 예시일 땐 MeAvatar(회원 사진, 없으면 한글 '나')가 아니라 칸 이름과 같은 말의 첫 글자 — 다섯 언어", () => {
            expect(src).toContain('? <CrewAvatar name={t("compare.me")}');
            expect(src).toContain(": <MeAvatar />;");
            // MeAvatar 를 직접 그리는 자리는 그 한 군데(회원 갈래)뿐 — 비교표 두 곳은 meFace 를 쓴다
            expect(src.match(/<MeAvatar \/>/g)).toHaveLength(1);
            expect(src.match(/avatar: meFace \}/g)).toHaveLength(2);
            for (const l of LOCALES) expect(dictHas(l, "compare.me"), l).toBe(true);
        });

        it("예시에서는 내 기록 화면(/history)으로 가지 않고, 공유도 없다", () => {
            expect(src).toContain('const openHistory = sample ? undefined : () => setLocation("/history");');
            expect(src.match(/setLocation\("\/history"\)/g)).toHaveLength(1);
            expect(src).toContain("onShare={sample ? undefined : () => void share()}");
        });

        it("'경기 시작' 단추는 홈의 문을 거친다", () => {
            expect(src).toContain('const matchAction = { label: t("real.match"), icon: LucidePlay, onClick: onStartMatch };');
            expect(jsx).toContain('onStartMatch={() => handleStartGameClick("match")}');
        });

        it("카드 바로 아래에 가입 안내 한 줄(GuestJoinCta) — 비로그인에게만", () => {
            const below = jsx.slice(jsx.indexOf("<RealHandicapCard"), jsx.indexOf("<section"));
            expect(below).toMatch(/\{sample && \(\s*<GuestJoinCta/);
            expect(below).toContain('title={t("guestHome.recordCtaTitle")}');
            expect(below).toContain('desc={t("guestHome.recordCtaDesc")}');
            expect(koValue("guestHome.recordCtaTitle")).toBe("가입하면 내 실전 기록이 이렇게 쌓여요");
            expect(koValue("guestHome.recordCtaDesc")).toBe("점수판으로 친 경기가 수지와 전적이 됩니다");
        });
    });

    describe("점수판 — 내 다마는 예시, 입구 셋은 입구에서 가입 안내", () => {
        const quick = code(client(`${DASH}/QuickActions.tsx`));

        it("내 다마: '—' 로 비우지 않고 예시 숫자 + SampleBadge", () => {
            expect(quick).toContain("const data = sample ? sample.real : q.data;");
            expect(quick).toContain("const s = data?.[type];");
            expect(quick).toContain('{sample && <SampleBadge className="mr-auto" />}');
            expect(quick).toContain("<MyDamaPanel sample={sample} />");
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

        it("입구가 전부 그 두 함수로 이어진다 — 점수판 카드·혼자 연습·PIN·설명 창", () => {
            expect(jsx.match(/onStartGame=\{handleStartGameClick\}/g)).toHaveLength(2);
            expect(jsx.match(/onJoinGame=\{handleJoinGameClick\}/g)).toHaveLength(2);
            expect(quick).toContain('onClick={() => onStartGame("match")}');
            expect(quick).toContain('onClick={() => onStartGame("practice")}');
            expect(quick).toContain("onClick={onJoinGame}");
            // 점수판 구역이 제 손으로 창을 열거나 서버를 부르지 않는다
            expect(quick).not.toMatch(/toggleModal|GameCreationModal|PinCodeModal|apiRequest/);
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
        const files = ["pages/hiq/dashboard.tsx", ...["DashboardHeader", "RealHandicapCard", "QuickActions", "OnlineGameCard", "RankingListCard"].map((f) => `${DASH}/${f}.tsx`)];
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
