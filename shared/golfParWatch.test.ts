import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canRevert, parseParLock, parsDiff, parsOf, seenStatus } from "./golfParWatch";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const A = [4, 4, 3, 5, 4, 4, 3, 5, 4], B = [4, 4, 3, 5, 4, 3, 4, 5, 4];

describe("골프 파 자동 반영 감시", () => {
    it("파 열쇠 · 9칸만 · 다른 홀", () => {
        expect(parsOf("443544354")).toEqual(A);
        expect(parsOf(A)).toEqual(A);
        expect(parsOf("44354435")).toBeNull();
        expect(parsOf("443544359")).toBeNull();
        expect(parsOf([4, 4])).toBeNull();
        expect(parsDiff(A, B)).toEqual([5, 6]);
        expect(parsDiff(A, null)).toEqual([]);
    });

    it("카드가 본 코스의 상태 — 같음 · 한 사람 더 · 다름 · 잠김 · 없음", () => {
        const base = { pars: A, current: A, courseExists: true, locked: false, promoteMembers: 2 };
        expect(seenStatus({ ...base, members: 1 })).toBe("same");
        expect(seenStatus({ ...base, members: 1, current: B })).toBe("pending");
        expect(seenStatus({ ...base, members: 2, current: B })).toBe("applied-differs");
        expect(seenStatus({ ...base, members: 2, current: B, locked: true })).toBe("blocked");
        expect(seenStatus({ ...base, members: 2, current: null, courseExists: false })).toBe("missing");
    });

    it("되돌리기 — 카드가 바꾼 줄이고 명부가 그 값 그대로일 때만", () => {
        expect(canRevert({ kind: "fixed", from: A, to: B, current: B })).toBe(true);
        expect(canRevert({ kind: "fixed", from: A, to: B, current: A })).toBe(false);
        expect(canRevert({ kind: "added", from: null, to: B, current: B })).toBe(false);
        expect(canRevert({ kind: "admin", from: A, to: B, current: B })).toBe(false);
        expect(parseParLock({ at: "x", by: "오너", reason: "공식 사이트로 확인" })).toEqual({ at: "x", by: "오너", reason: "공식 사이트로 확인" });
        expect(parseParLock({})).toBeNull();
    });

    it("카드가 바꾸는 길이 잠금을 보고 · 바뀐 것을 적는다", () => {
        const src = read("server/services/golfScanRound.ts");
        const promote = src.slice(src.indexOf("export async function promoteSeenCourse"), src.indexOf("async function parLocked"));
        // 잠금 확인이 파를 바꾸는 update 보다 먼저
        expect(promote.indexOf("await parLocked(cur.id)")).toBeGreaterThan(0);
        expect(promote.indexOf("await parLocked(cur.id)")).toBeLessThan(promote.indexOf("db.update(rankueGolfCourses)"));
        for (const k of ["added", "fixed", "blocked"]) expect(promote).toContain(`kind: "${k}"`);
        expect(src).toMatch(/\} catch \(e\) \{ console\.warn\("\[GolfScan\] par change note"/);
    });

    it("운영자 손 수정도 같은 기록에 · 되돌리면 잠근다", () => {
        expect(read("server/routes/modules/adminGolf/courses.ts")).toMatch(/await noteParChange\(\{ clubId: r\.nine\.clubId, courseId: rowId, courseName: r\.nine\.name, kind: "admin"/);
        const st = read("server/storage/adminGolfPars.ts");
        const revert = st.slice(st.indexOf("export async function revertParChange"));
        expect(revert).toContain("await saveNinePars(String(p.course_id), from, to)");
        expect(revert).toMatch(/await setParLock\(String\(p\.course_id\), \{ at, by: who\.by, reason: `되돌림 — \$\{who\.reason\}` \}\)/);
        expect(read("server/routes/modules/adminGolf/index.ts")).toContain('router.use("/pars", pars);');
    });
});
