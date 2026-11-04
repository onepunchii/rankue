import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    HIKING_VISITED_PATH, VISITED_AFTER_LOGIN_MAX_MS, VISITED_LABEL, VISITED_MAX,
    cleanVisitedIds, visitedAfterLoginRead, visitedAfterLoginRecord, visitedLoginAsk,
} from "./hikingVisited";

const read = (f: string) => readFileSync(resolve(__dirname, "..", f), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("다녀온 산 한 번에 고르기(2026-11-04)", () => {
    it("요청의 산 목록 — 글자만, 겹친 것은 하나로, 120곳까지(빈 목록 · 다른 꼴은 거절)", () => {
        expect(cleanVisitedIds(["a", "b", "a", "list:만행산:전북 남원"])).toEqual(["a", "b", "list:만행산:전북 남원"]);
        expect(cleanVisitedIds([])).toBeNull();
        expect(cleanVisitedIds("a")).toBeNull();
        expect(cleanVisitedIds(["a", 1])).toBeNull();
        expect(cleanVisitedIds(["x".repeat(81)])).toBeNull();
        expect(cleanVisitedIds(["a\nb"])).toBeNull();
        expect(cleanVisitedIds(Array.from({ length: VISITED_MAX }, (_, i) => `m${i}`))).toHaveLength(VISITED_MAX);
        expect(cleanVisitedIds(Array.from({ length: VISITED_MAX + 1 }, (_, i) => `m${i}`))).toBeNull();
    });
    it("방문자 때 고른 것 — 한 시간 안, 미래 · 꼴이 틀린 것은 버린다", () => {
        const T = 1_800_000_000_000;
        const rec = visitedAfterLoginRecord(["a", "b"], T);
        expect(visitedAfterLoginRead(rec, T + 1000)).toEqual(["a", "b"]);
        expect(visitedAfterLoginRead(rec, T + VISITED_AFTER_LOGIN_MAX_MS + 1)).toBeNull();
        expect(visitedAfterLoginRead(rec, T - 1)).toBeNull();
        expect(visitedAfterLoginRead(JSON.stringify({ ids: [], at: T }), T)).toBeNull();
        expect(visitedAfterLoginRead("nope", T)).toBeNull();
        expect(visitedAfterLoginRead(undefined, T)).toBeNull();
    });
    it("글 — 수를 그대로, 재촉 · 보상을 부풀리는 말이 없다(흐린 도장은 와펜 · 등급에 들지 않는다)", () => {
        expect(visitedLoginAsk(12).title).toBe("다녀온 산 12곳을 도장첩에 남겨요");
        expect(VISITED_LABEL.save(3)).toBe("3곳 도장첩에 남기기");
        expect(VISITED_LABEL.join(3)).toBe("가입하고 3곳 남기기");
        expect(VISITED_LABEL.done(0)).toBe("이미 다 남겨 둔 산이에요");
        const all = [...Object.values(VISITED_LABEL).filter((v) => typeof v === "string"), visitedLoginAsk(1).desc].join(" ");
        expect(all).not.toMatch(/빨리|서두|지금 바로|놓치|와펜을 받|등급이 올라/);
        expect(all).toContain("정상에서 인증하면");
    });
});

describe("고정: 서버 — 흐린 도장만, 아는 산만, 이미 남긴 산은 건너뛴다", () => {
    it("라우트: 등산을 쓰는 회원만 · 요청의 목록을 거르고 아는 산만 · 날짜는 오늘", () => {
        const r = code(read("server/routes/modules/hiking.ts"));
        expect(r).toContain('router.post("/summits/record-many", ...requireHikingAccess, asyncHandler(async (req: AuthRequest, res: any) => {');
        expect(r).toContain("const ids = cleanVisitedIds(req.body?.mountainIds);");
        expect(r).toContain("const added = await addRecords(req.userId!, ids.filter((id) => known.has(id)), Date.now());");
    });
    it("저장: verified 는 false 로 못 박고, 그 회원이 이미 남긴 산은 넣지 않는다(날짜와 무관)", () => {
        const s = code(read("server/storage/hikingStamps.ts"));
        const f = s.slice(s.indexOf("export async function addRecords("), s.indexOf("export async function removeRecord("));
        expect(f).toContain("if (!mountainIds.length) return 0;");
        expect(f).toContain("false, null, ${kstDay(atMs)}");
        expect(f).toContain("where not exists (select 1 from hiking_summits s where s.member_id = ${memberId}::uuid and s.mountain_id = x.id)");
        expect(f).not.toMatch(/\btrue\b/);
    });
    it("흐린 도장은 등급 · 와펜 · 연간 리포트 · 산악회 도장에 들지 않는다 — 한꺼번에 골라도 부풀 것이 없다", () => {
        const st = read("shared/hikingStamps.ts");
        expect(st).toContain("const stamps = mountainStamps(summits).filter((s) => s.verified);");
        expect(read("shared/hikingYear.ts")).toContain("const mine = summits.filter((s) => s.verified);");
        expect(read("server/storage/hikingStamps.ts")).toContain("where s.verified\n");
    });
});

describe("고정: 화면", () => {
    it("주소 · 검색에 싣지 않음 · 하단 탭 없음 · 방문자는 틀의 바닥 줄(설치 팝업 표식)", () => {
        expect(HIKING_VISITED_PATH).toBe("/hiking/visited");
        expect(read("client/src/App.tsx")).toContain('<Route path="/hiking/visited" component={HikingVisitedRoute} />');
        const p = code(read("client/src/hiking/pages/VisitedPage.tsx"));
        expect(p).toContain("noindex: true");
        expect(p).toContain("<HikingShell title={L.title} nav={false} cta={null} bar={guest ? bar : undefined}>");
        // 방문자: 기기에 적고 가입 팝업 → 가입하고 돌아오면 남긴다(한 번)
        expect(p).toContain("localStorage.setItem(VISITED_AFTER_LOGIN_KEY, visitedAfterLoginRecord(ids, Date.now()))");
        expect(p).toContain("if (!openLoginSheet(visitedLoginAsk(n))) goLoginPage(setLocation);");
        expect(p).toContain("localStorage.removeItem(VISITED_AFTER_LOGIN_KEY)");
        expect(p).toContain('apiRequest("/api/hiq/hiking/summits/record-many", { method: "POST", body: JSON.stringify({ mountainIds: ids }) })');
        // 와펜 판의 누름은 발자국에 남기지 않는다(백 번 눌린다) · 이미 남긴 산은 잠긴다
        expect(p.match(/data-notrack onClick=\{\(\) => toggle\(m\)\}/g)?.length).toBe(3);
        expect(p).toContain("if (had.has(m.id)) return;");
    });
    it("입구 넷 — 허브 · 권역/100대 명산 목록 · 홈(남긴 산이 셋 미만) · 산 화면의 도장 카드(방문자)", () => {
        expect(read("client/src/hiking/pages/HikingHub.tsx")).toContain('<div className="px-5 pt-4"><VisitedEntry /></div>');
        expect(read("client/src/hiking/pages/HikingListPage.tsx")).toContain('{(region || group?.id === "kfs100") && <div className="px-5 pt-4"><VisitedEntry region={region?.id} /></div>}');
        expect(read("client/src/hiking/pages/HikingHome.tsx")).toContain('{s.stamps.length < 3 && <div className="px-5 pt-2"><VisitedEntry /></div>}');
        const m = read("client/src/hiking/pages/MountainPage.tsx");
        expect(m).toContain('<Link href={visitedPath(d.region)} data-track-as="hiking-visited-open" data-testid="mountain-visited-open"');
        expect(read("client/src/hiking/components/VisitedEntry.tsx")).toContain('data-track-as="hiking-visited-open"');
    });
});
