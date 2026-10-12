import { describe, expect, it } from "vitest";
import { COURSES } from "../client/src/golf/data/golfCourses";
import { GUEST_SAMPLE } from "./guestSample";
import {
    STAMP_ALL_OPEN, STAMP_BOOKS, STAMP_INVITE_TOTAL, STAMP_OPEN_TOTAL, STAMP_TOTAL, STAMP_TROPHY_STEPS,
    bookStates, slotForCourseIds, slotForStamp, stampBook, stampSummary, type StampLike,
} from "./golfStampBooks";
import { GOLF_STAMP_FULL_SAMPLE, GOLF_STAMP_SAMPLE } from "./golfStampSample";

/**
 * 골프 도장첩(2026-10-12 오너: "엘리트 코스 60개를 세분화해서 … 장식장 및 수집욕구" → "추천대로 진행").
 * 묶음의 모양(누구나 일곱 권 36곳 + 초대장 두 권 20곳)과, 도장이 칸을 채우는 규칙을 못 박는다.
 */
const squash = (v: string) => v.replace(/\s+/g, "").toLowerCase();
const slots = STAMP_BOOKS.flatMap((b) => b.slots.map((s) => ({ book: b, slot: s })));
const stampAt = (key: string): StampLike => { const s = slots.find((x) => x.slot.key === key)!.slot; return { clubId: s.clubIds[0], name: s.ledgerNames[0] }; };

describe("도장첩의 모양", () => {
    it("누구나 일곱 권(서해 4 · 경기 8 · 강원 7 · 충청 3 · 호남 4 · 영남 3 · 제주 7) + 초대장 두 권(수도권 11 · 지방 9)", () => {
        expect(STAMP_BOOKS.map((b) => [b.id, b.kind, b.slots.length])).toEqual([
            ["seohae", "open", 4], ["gyeonggi", "open", 8], ["gangwon", "open", 7], ["chungcheong", "open", 3], ["honam", "open", 4], ["yeongnam", "open", 3], ["jeju", "open", 7],
            ["invite-capital", "invite", 11], ["invite-regional", "invite", 9],
        ]);
        expect([STAMP_OPEN_TOTAL, STAMP_INVITE_TOTAL, STAMP_TOTAL]).toEqual([36, 20, 56]);
        expect(stampBook("gangwon")!.name).toBe("강원");
        expect(stampBook("없는권")).toBeUndefined();
    });

    it("칸의 열쇠 · 원장 번호 · 원장 이름 · 공개 페이지 번호가 서로 겹치지 않는다", () => {
        const uniq = (list: (string | number)[]) => expect(new Set(list).size).toBe(list.length);
        uniq(slots.map((x) => x.slot.key));
        uniq(slots.flatMap((x) => [...x.slot.clubIds]));
        uniq(slots.flatMap((x) => x.slot.ledgerNames.map(squash)));
        uniq(slots.map((x) => x.slot.courseId));
        for (const x of slots) {
            expect(x.slot.clubIds.length, x.slot.key).toBe(x.slot.ledgerNames.length);
            for (const id of x.slot.clubIds) expect(id, x.slot.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
            // 도장에 찍히는 이름 — 원장의 꼬리(CC · 컨트리클럽 · ㈜ · 주식회사 표기)가 남아 있지 않다
            expect(x.slot.name, x.slot.key).not.toMatch(/CC|C\.C|컨트리클럽|골프클럽|골프장|㈜|\(주\)|GC/);
            expect([...x.slot.name].length, x.slot.key).toBeLessThanOrEqual(10);
        }
    });

    it("엘리트 명단(정적 목록의 isRankue60)의 모든 줄이 꼭 한 칸에 들어 있다 — 명단이 바뀌면 여기서 걸린다", () => {
        const elite = COURSES.filter((c) => c.isRankue60);
        expect(elite.length).toBe(67);
        const byName = new Map<string, string>();
        for (const x of slots) for (const n of x.slot.ledgerNames) byName.set(squash(n), x.slot.key);
        const used = new Set<string>();
        for (const c of elite) {
            const key = byName.get(squash(c.name));
            expect(key, c.name).toBeTruthy();
            used.add(key!);
        }
        // 원장에만 있는 이름(같은 골프장의 다른 줄)은 정적 목록에 없어도 된다 — 칸은 56개가 다 쓰인다
        expect(used.size).toBe(56);
        // 공개 페이지 번호는 그 칸의 골프장 줄이다
        for (const x of slots) {
            const row = COURSES.find((c) => c.id === x.slot.courseId)!;
            expect(row?.isRankue60, x.slot.key).toBe(true);
            expect(x.slot.ledgerNames.map(squash), x.slot.key).toContain(squash(row.name));
            expect(x.slot.courseIds, x.slot.key).toContain(x.slot.courseId);
        }
        // 칸마다의 줄 번호를 다 모으면 엘리트 명단의 줄 전부다(겹침 없이)
        const all = slots.flatMap((x) => [...x.slot.courseIds]);
        expect(new Set(all).size).toBe(all.length);
        expect([...all].sort((a, b) => a - b)).toEqual(elite.map((c) => c.id).sort((a, b) => a - b));
    });

    it("골프장 공개 페이지가 어느 칸인가 — 그 페이지의 줄 번호 가운데 하나라도 칸에 있으면 그 칸", () => {
        expect(slotForCourseIds([173])!.slot.key).toBe("sky72");
        expect(slotForCourseIds([174])!.slot.key).toBe("sky72");
        expect(slotForCourseIds([999999, 57])!.slot.key).toBe("seowon");
        expect(slotForCourseIds([57, 58])!.book.id).toBe("gyeonggi");
        const outside = COURSES.find((c) => !c.isRankue60)!;
        expect(slotForCourseIds([outside.id])).toBeNull();
        expect(slotForCourseIds([])).toBeNull();
        expect(slotForCourseIds(null)).toBeNull();
    });

    it("초대장 두 권은 명단에 회원제 줄만 있는 골프장이고, 누구나 일곱 권은 대중제 줄이 하나는 있다", () => {
        const elite = COURSES.filter((c) => c.isRankue60);
        for (const x of slots) {
            const rows = elite.filter((c) => x.slot.ledgerNames.map(squash).includes(squash(c.name)));
            const hasPublic = rows.some((c) => c.type === "Public");
            expect(hasPublic, `${x.book.id} ${x.slot.key}`).toBe(x.book.kind === "open");
        }
    });

    it("트로피는 찍은 골프장 10 · 20 · 30 · 45 · 전부", () => {
        expect(STAMP_TROPHY_STEPS).toEqual([10, 20, 30, 45, 56]);
        expect(STAMP_ALL_OPEN).toBe("all-open");
    });
});

describe("도장이 어느 칸인가", () => {
    it("원장 번호가 있으면 번호로 — 한 칸에 번호가 둘이면 어느 쪽이든 그 칸", () => {
        expect(slotForStamp({ clubId: "be910d3e-ba1a-4c64-8aa3-6c30ad8aafd8", name: "아무 이름" })!.slot.key).toBe("sky72");
        expect(slotForStamp({ clubId: "1874ef25-11a5-4872-99c8-6c0b14db9ccf", name: "" })!.slot.key).toBe("sky72");
        expect(slotForStamp({ clubId: "2503ff82-3e63-4800-8ea5-3b9d92546eee", name: "서원힐스 CC" })!.slot.key).toBe("seowon");
        expect(slotForStamp({ clubId: "2503ff82-3e63-4800-8ea5-3b9d92546eee", name: "서원힐스 CC" })!.book.id).toBe("gyeonggi");
    });

    it("번호가 있는데 명단 밖이면, 이름이 같아도 칸을 채우지 않는다", () => {
        expect(slotForStamp({ clubId: "00000000-0000-4000-8000-000000000000", name: "파주CC" })).toBeNull();
    });

    it("번호 없는 옛 기록은 원장 이름과 글자가 같을 때만(공백 · 대소문자 무시)", () => {
        expect(slotForStamp({ clubId: null, name: "파주 cc" })!.slot.key).toBe("paju");
        expect(slotForStamp({ clubId: null, name: "SK핀크스골프장" })!.slot.key).toBe("pinx");
        expect(slotForStamp({ clubId: null, name: "핀크스 GC" })!.slot.key).toBe("pinx");
        expect(slotForStamp({ clubId: null, name: "" })).toBeNull();
        expect(slotForStamp({ clubId: null, name: "알 수 없는 구장" })).toBeNull();
    });

    it("이름의 포함 관계로는 잇지 않는다 — 예전 엘리트 화면은 '경주신라'로 '경주'도, '블랙스톤 이천'으로 '블랙스톤 제주'도 채웠다", () => {
        expect(slotForStamp({ clubId: null, name: "경주신라C.C" })!.slot.key).toBe("gyeongju-silla");
        expect(slotForStamp({ clubId: null, name: "경주C.C" })!.slot.key).toBe("gyeongju");
        expect(slotForStamp({ clubId: null, name: "블랙스톤리조트이천" })!.slot.key).toBe("blackstone-icheon");
        expect(slotForStamp({ clubId: null, name: "블랙스톤리조트" })!.slot.key).toBe("blackstone-jeju");
        expect(slotForStamp({ clubId: null, name: "블랙스톤" })).toBeNull();
        expect(slotForStamp({ clubId: null, name: "경주" })).toBeNull();
        expect(slotForStamp({ clubId: null, name: "제주CC" })).toBeNull();
        expect(slotForStamp({ clubId: null, name: "코리아CC" })).toBeNull();
    });
});

describe("도장첩마다의 상태", () => {
    it("빈 도장으로는 전부 비어 있다 — 가장 가까운 것도 없다", () => {
        const st = bookStates([]);
        expect(st.map((s) => s.got)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
        expect(st.every((s) => !s.done)).toBe(true);
        expect(stampSummary(st)).toEqual({
            stamped: 0, total: 56, openStamped: 0, openTotal: 36, inviteStamped: 0, inviteTotal: 20,
            doneBooks: [], allOpenDone: false, markers: 0, trophies: 0, nextTrophy: { at: 10, left: 10 }, nearest: null,
        });
    });

    it("한 칸에 도장이 둘 걸리면(원장에 두 줄인 골프장을 둘 다 친 경우) 한 칸으로 센다 — 먼저 온 도장을 쓴다", () => {
        const a = { clubId: "be910d3e-ba1a-4c64-8aa3-6c30ad8aafd8", name: "SKY72 골프클럽(바다코스)", tag: "a" };
        const b = { clubId: "1874ef25-11a5-4872-99c8-6c0b14db9ccf", name: "SKY72 골프클럽(하늘코스)", tag: "b" };
        const seohae = bookStates([a, b])[0];
        expect(seohae.got).toBe(1);
        expect(seohae.slots.find((s) => s.slot.key === "sky72")!.stamp!.tag).toBe("a");
    });

    it("미인증 기록만 있는 골프장은 흐린 도장으로만 보이고 칸은 차지 않는다. 인증 도장이 있으면 기록은 보이지 않는다", () => {
        const paju = stampAt("paju"), ferrum = stampAt("ferrum");
        const gy = bookStates([paju], [paju, ferrum])[1];
        expect(gy.got).toBe(1);
        expect(gy.slots.find((s) => s.slot.key === "paju")).toMatchObject({ stamp: paju, record: null });
        expect(gy.slots.find((s) => s.slot.key === "ferrum")).toMatchObject({ stamp: null, record: ferrum });
        expect(stampSummary(bookStates([], [paju])).stamped).toBe(0);
    });

    it("명단 밖 골프장의 도장은 어디에도 세지 않는다", () => {
        const st = bookStates([{ clubId: "00000000-0000-4000-8000-000000000000", name: "동네 골프장" }, { clubId: null, name: "어느 골프장" }]);
        expect(stampSummary(st).stamped).toBe(0);
    });

    it("가장 가까운 것 — 시작한 누구나 도장첩 가운데 남은 칸이 가장 적은 권. 남은 칸이 같으면 더 많이 채운 권", () => {
        // 충청 2/3(1 남음) · 영남 1/3(2 남음) · 강원 6/7(1 남음) → 남은 칸 1 이 둘, 더 많이 채운 강원
        const keys = ["rainbowhills", "kingsdale", "gyeongju", "lavieestbelle", "bearcreek-chuncheon", "hilldeloci", "sagewood-hongcheon", "ecolian-jeongseon", "pineridge"];
        expect(stampSummary(bookStates(keys.map(stampAt))).nearest).toEqual({ bookId: "gangwon", left: 1 });
        // 초대장은 재촉하지 않는다 — 초대장만 시작했으면 가장 가까운 것이 없다
        expect(stampSummary(bookStates(["anyang", "namseoul"].map(stampAt))).nearest).toBeNull();
    });

    it("누구나 일곱 권을 다 채우면 볼마커가 여덟(권마다 하나 + 누구나 전부), 트로피는 30곳까지 셋", () => {
        const open = STAMP_BOOKS.filter((b) => b.kind === "open").flatMap((b) => b.slots.map((s) => stampAt(s.key)));
        const sm = stampSummary(bookStates(open));
        expect(sm).toMatchObject({ stamped: 36, openStamped: 36, inviteStamped: 0, allOpenDone: true, markers: 8, trophies: 3, nextTrophy: { at: 45, left: 9 }, nearest: null });
        expect(sm.doneBooks).toEqual(["seohae", "gyeonggi", "gangwon", "chungcheong", "honam", "yeongnam", "jeju"]);
    });

    it("56곳을 전부 찍으면 볼마커 열(아홉 권 + 누구나 전부) · 트로피 다섯 · 다음 트로피 없음", () => {
        const sm = stampSummary(bookStates(slots.map((x) => stampAt(x.slot.key))));
        expect(sm).toMatchObject({ stamped: 56, markers: 10, trophies: 5, nextTrophy: null });
    });

    it("트로피 단계의 경계 — 9곳은 없음, 10곳에 하나, 45곳에 넷", () => {
        const first = (n: number) => stampSummary(bookStates(slots.slice(0, n).map((x) => stampAt(x.slot.key))));
        expect(first(9)).toMatchObject({ trophies: 0, nextTrophy: { at: 10, left: 1 } });
        expect(first(10)).toMatchObject({ trophies: 1, nextTrophy: { at: 20, left: 10 } });
        expect(first(45)).toMatchObject({ trophies: 4, nextTrophy: { at: 56, left: 11 } });
    });
});

describe("예시 도장첩(처음 오는 사람에게 보여 주는 것)", () => {
    it("홈의 예시 인물과 같은 사람 — 공식 라운드 수만큼의 도장, 타수는 그 라운드의 타수", () => {
        const rounds = GUEST_SAMPLE.golf.recentScores.map((r) => r.score);
        expect(GOLF_STAMP_SAMPLE.length).toBe(GUEST_SAMPLE.golf.stats.totalRounds);
        expect(GOLF_STAMP_SAMPLE.map((s) => s.score)).toEqual(rounds);
        expect(Math.min(...GOLF_STAMP_SAMPLE.map((s) => s.score))).toBe(GUEST_SAMPLE.golf.stats.bestScore);
        for (const s of GOLF_STAMP_SAMPLE) {
            expect(s.sample).toBe(true);
            expect(s.date).toMatch(/^2026\.\d{2}\.\d{2}$/);
            expect(slotForStamp(s), s.name).not.toBeNull();
        }
        // 얻은 순서 = 날짜 순서
        const dates = GOLF_STAMP_SAMPLE.map((s) => s.date);
        expect([...dates].sort()).toEqual(dates);
    });

    it("한 화면에 '다 채운 권 · 채우는 중 · 빈 권'이 다 보인다 — 서해 4/4(볼마커) · 강원 3/7 · 경기 1/8", () => {
        const st = bookStates(GOLF_STAMP_SAMPLE);
        expect(st.map((s) => [s.book.id, s.got])).toEqual([
            ["seohae", 4], ["gyeonggi", 1], ["gangwon", 3], ["chungcheong", 0], ["honam", 0], ["yeongnam", 0], ["jeju", 0], ["invite-capital", 0], ["invite-regional", 0],
        ]);
        expect(stampSummary(st)).toMatchObject({ stamped: 8, doneBooks: ["seohae"], markers: 1, trophies: 0, nextTrophy: { at: 10, left: 2 }, nearest: { bookId: "gangwon", left: 4 } });
    });

    it("다 모았을 때의 예시(장식장 · '?' 안내) — 쉰여섯 칸이 다 찍혀 볼마커 열 · 트로피 다섯. 예시 인물과는 다른 예시다", () => {
        expect(GOLF_STAMP_FULL_SAMPLE.length).toBe(STAMP_TOTAL);
        const st = bookStates(GOLF_STAMP_FULL_SAMPLE);
        expect(st.every((s) => s.done)).toBe(true);
        expect(stampSummary(st)).toMatchObject({ stamped: 56, markers: 10, trophies: 5, nextTrophy: null, nearest: null, allOpenDone: true });
        for (const s of GOLF_STAMP_FULL_SAMPLE) {
            expect(s.sample).toBe(true);
            expect(s.date).toMatch(/^202[4-6]\.\d{2}\.\d{2}$/);
            expect(s.score).toBeGreaterThanOrEqual(84); expect(s.score).toBeLessThanOrEqual(96);
        }
        // 얻은 순서 = 날짜 순서, 날짜가 겹치지 않는다
        const dates = GOLF_STAMP_FULL_SAMPLE.map((s) => s.date);
        expect([...dates].sort()).toEqual(dates);
        expect(new Set(dates).size).toBe(dates.length);
        // 예시 인물의 도장(여덟 개)은 그대로다
        expect(GOLF_STAMP_SAMPLE.length).toBe(8);
    });
});
