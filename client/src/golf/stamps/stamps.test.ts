/**
 * 골프 도장첩 화면(2026-10-12 오너: "추천대로 진행 · 처음 오는 사람도 예시를 보여줘서 와 하게").
 * 규칙(어느 도장이 어느 칸인가 · 예시의 숫자)은 shared/golfStampBooks.test.ts 가 본다. 여기는 화면이 지키는 것:
 * 그림 파일이 다 있는가 · 예시에는 "예시" 표시가 붙는가 · 방문자가 내 것을 부르지 않는가 · 골프 화면 규칙(리터럴 색 · 12px · semibold 까지).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { STAMP_ALL_OPEN, STAMP_BOOKS, STAMP_TROPHY_STEPS } from "@shared/golfStampBooks";
import { ALL_OPEN_MARKER, BOOK_ART, GLYPH_PATHS, PLAIN_STAMP, TROPHIES, coverSrc, markerSrc } from "./bookArt";
import { stampNameSize, stampSeed } from "./InkStamp";
import { stampDate } from "./stampDate";
import { stampMoment } from "./stampMoment";
import { STAMP_LABEL_MAX, stampLabel } from "./stampLabel";
import { bookStates } from "@shared/golfStampBooks";

const ROOT = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const pub = (src: string) => resolve(ROOT, "client/public", src.replace(/^\//, ""));
/** 주석을 뺀 코드 — 설명에 적은 옛 낱말에 걸리지 않게 */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\{\/\*)/.test(l)).join("\n");
const SCREENS = [
    "client/src/golf/stamps/StampParts.tsx", "client/src/golf/stamps/InkStamp.tsx", "client/src/golf/stamps/StampHomeEntry.tsx",
    "client/src/golf/pages/StampBooks.tsx", "client/src/golf/pages/StampBook.tsx", "client/src/golf/pages/GolfShelf.tsx",
    "client/src/golf/components/passport/StampBooksBanner.tsx", "client/src/golf/stamps/StampResultCard.tsx",
    "client/src/golf/stamps/CourseStampBlock.tsx", "client/src/golf/stamps/HomeTileArt.tsx", "client/src/golf/components/passport/StampList.tsx",
];

describe("그림", () => {
    it("권마다 잉크 색 · 무늬가 있고, 표지 · 볼마커 그림 파일이 있다", () => {
        expect(Object.keys(BOOK_ART).sort()).toEqual(STAMP_BOOKS.map((b) => b.id).sort());
        for (const b of STAMP_BOOKS) {
            expect(BOOK_ART[b.id].ink, b.id).toMatch(/^#[0-9A-F]{6}$/);
            expect(GLYPH_PATHS[BOOK_ART[b.id].glyph]?.length, b.id).toBeGreaterThan(0);
            expect(existsSync(pub(coverSrc(b.id))), coverSrc(b.id)).toBe(true);
            expect(existsSync(pub(markerSrc(b.id))), markerSrc(b.id)).toBe(true);
        }
        expect(ALL_OPEN_MARKER).toBe(`/golf/stamp-art/marker-${STAMP_ALL_OPEN}.webp`);
        expect(existsSync(pub(ALL_OPEN_MARKER))).toBe(true);
    });

    it("쓰지 않는 그림을 싣지 않는다 — 폴더에는 표지 9 · 볼마커 10 · 트로피 5 뿐", () => {
        const files = readdirSync(pub("/golf/stamp-art")).filter((f) => !f.startsWith(".")).sort();
        const want = [
            ...STAMP_BOOKS.map((b) => `cover-${b.id}.webp`), ...STAMP_BOOKS.map((b) => `marker-${b.id}.webp`), `marker-${STAMP_ALL_OPEN}.webp`,
            ...STAMP_TROPHY_STEPS.map((_, i) => `trophy-${i + 1}.webp`),
        ].sort();
        expect(files).toEqual(want);
    });

    it("트로피 다섯 — 단계는 규칙에서 읽고, 숫자가 들어갈 깃발 네모는 그림 안에 넉넉하게 있다", () => {
        expect(TROPHIES.map((t) => t.at)).toEqual([...STAMP_TROPHY_STEPS]);
        for (const t of TROPHIES) {
            expect(existsSync(pub(t.src)), t.src).toBe(true);
            const f = t.flag;
            expect(f.x).toBeGreaterThan(0); expect(f.y).toBeGreaterThan(0);
            expect(f.x + f.w).toBeLessThan(1); expect(f.y + f.h).toBeLessThan(1);
            // 두 자리 숫자가 들어가려면 네모가 높이보다 넓어야 한다(2026-10-12 오너: "깃발에 숫자 잘 들어가게")
            expect(f.w / f.h, String(t.at)).toBeGreaterThan(1.4);
        }
        // 맨 위 트로피만 상아색 깃발이라 짙은 글자
        expect(TROPHIES.map((t) => t.ink)).toEqual(["#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#5B4300"]);
    });
});

describe("잉크 도장", () => {
    it("이름이 길수록 글자가 작아진다 — 열 자까지 고리 안에", () => {
        expect(stampNameSize("88")).toBe(14.5);
        expect(stampNameSize("파인리즈")).toBe(14.5);
        expect(stampNameSize("사우스케이프")).toBe(12.5);
        expect(stampNameSize("세이지우드 홍천")).toBe(10.8);
        expect(stampNameSize("세이지우드 여수경도")).toBe(9.4);
        // 도장첩의 모든 이름이 가장 작은 단계 안에 든다(고리 둘레 ≈ 116 눈금, 글자 한 자 ≈ 글자 크기)
        for (const b of STAMP_BOOKS) for (const s of b.slots) expect([...s.name].length * stampNameSize(s.name), s.name).toBeLessThan(112);
    });

    it("번짐 무늬는 이름에서 나온다 — 다시 그려도 같은 도장은 같은 무늬", () => {
        expect(stampSeed("설해원")).toBe(stampSeed("설해원"));
        expect(stampSeed("설해원")).not.toBe(stampSeed("파인리즈"));
        for (const b of STAMP_BOOKS) for (const s of b.slots) { const v = stampSeed(s.name); expect(Number.isInteger(v) && v >= 0 && v < 89, s.name).toBe(true); }
    });

    it("찍은 날은 한국 날짜로 — 새벽 라운드가 전날로 찍히지 않는다", () => {
        expect(stampDate("2026-10-03T03:10:00.000Z")).toBe("2026.10.03");
        expect(stampDate("2026-10-02T21:30:00.000Z")).toBe("2026.10.03");
        expect(stampDate("2026-01-01T14:59:59.000Z")).toBe("2026.01.01");
        expect(stampDate("2026-01-01T15:00:00.000Z")).toBe("2026.01.02");
        expect(stampDate("글자")).toBe("");
    });
});

describe("예시(처음 오는 사람)", () => {
    const hook = code(read("client/src/golf/stamps/useStampCollection.ts"));

    it("방문자는 내 도장을 부르지 않는다(401 만 돌아온다) — 예시만 그린다", () => {
        expect(hook).toContain("enabled: !!member,");
        expect(hook).toContain("const sample = isGuest || (empty && (choice ?? true));");
    });

    it("도장이 아직 없는 회원은 예시부터 보고 '내 도장첩'으로 바꿀 수 있다. 도장이 있으면 예시가 없다", () => {
        expect(hook).toContain("const empty = !!member && !loading && mine.summary.stamped === 0;");
        expect(hook).toContain("canSwitch: empty,");
        const parts = code(read("client/src/golf/stamps/StampParts.tsx"));
        expect(parts).toContain('data-testid={on ? "stamp-view-sample" : "stamp-view-mine"}');
        expect(parts).toContain("if (!col.canSwitch) return null;");
    });

    it("예시를 그리는 구역에는 \"예시\" 표시가 붙는다 — 책장 · 한 권 · 장식장의 숫자 구역 전부", () => {
        const parts = code(read("client/src/golf/stamps/StampParts.tsx"));
        expect(parts).toContain('{sample && <SampleBadge tone="dark" />}');
        expect(code(read("client/src/golf/pages/StampBooks.tsx")).match(/<StampSection title="[^"]+" sample=\{sample\}/g)).toEqual([
            '<StampSection title="누구나 도장첩" sample={sample}', '<StampSection title="초대장 도장첩" sample={sample}',
        ]);
        expect(code(read("client/src/golf/pages/StampBook.tsx"))).toContain("<StampSection title={`도장 ${total}칸`} sample={col.sample}");
        expect(code(read("client/src/golf/pages/GolfShelf.tsx")).match(/<StampSection title="[^"]+" sample=\{sample\}/g)).toEqual([
            '<StampSection title="볼마커 수집함" sample={sample}', '<StampSection title="엘리트 트로피" sample={sample}',
        ]);
        // 방문자에게는 맨 위에 한 줄 + 그림 아래에 가입으로 가는 길
        for (const p of ["client/src/golf/pages/StampBooks.tsx", "client/src/golf/pages/StampBook.tsx", "client/src/golf/pages/GolfShelf.tsx"]) {
            const s = code(read(p));
            expect(s, p).toContain("<SampleNotice col={col} />");
            expect(s, p).toContain("<SampleJoin col={col} from=");
        }
    });

    it("볼마커 목록(모을 수 있는 것)은 예시를 볼 때만 — 가진 것처럼 보이지 않게 제목이 '받는 볼마커'다", () => {
        const s = code(read("client/src/golf/pages/StampBooks.tsx"));
        expect(s).toContain('{sample && (\n                        <StampSection title="한 권을 다 채우면 받는 볼마커"');
    });

    it("홈의 카드는 회원에게 예시 숫자를 보이지 않는다 — 도장이 없으면 0 그대로, 방문자에게만 \"예시\"", () => {
        const s = code(read("client/src/golf/stamps/StampHomeEntry.tsx"));
        expect(s).toContain("const guestSample = col.isGuest;");
        expect(s).toContain("const stamped = guestSample || !col.canSwitch ? col.summary.stamped : 0;");
        expect(s).toContain('{guestSample && <SampleBadge tone="dark" />}');
    });
});

describe("찍히는 순간(라운드 결과 화면)", () => {
    const slot = (key: string) => STAMP_BOOKS.flatMap((b) => b.slots).find((x) => x.key === key)!;
    const st = (key: string, which = 0) => ({ clubId: slot(key).clubIds[which], name: slot(key).ledgerNames[which] });
    const states = bookStates([st("lavieestbelle"), st("hilldeloci"), st("sky72", 1), st("orangedunes"), st("bearsbest"), st("island")]);

    it("라운드의 골프장 번호가 내 도장의 번호와 같으면 그 칸 — 권의 진행과 남은 칸을 같이 준다", () => {
        const m = stampMoment(states, { courseId: slot("hilldeloci").clubIds[0], courseName: "아무 이름" })!;
        expect(m.mine.slot.key).toBe("hilldeloci");
        expect([m.state.book.id, m.state.got, m.state.total, m.left]).toEqual(["gangwon", 2, 7, 5]);
    });

    it("번호가 달라도(옛 번호로 적힌 라운드) 골프장 이름이 도장의 이름과 같으면 그 칸", () => {
        expect(stampMoment(states, { courseId: "74", courseName: "라비에벨 컨트리클럽" })!.mine.slot.key).toBe("lavieestbelle");
        expect(stampMoment(states, { courseId: null, courseName: "sky72 골프클럽(하늘코스)" })!.mine.slot.key).toBe("sky72");
    });

    it("한 권을 다 채운 라운드면 남은 칸이 0 — 화면이 볼마커를 보여 준다", () => {
        const m = stampMoment(states, { courseId: slot("island").clubIds[0] })!;
        expect([m.state.book.id, m.state.done, m.left]).toEqual(["seohae", true, 0]);
    });

    it("도장이 없으면 아무것도 없다 — 엘리트 골프장이어도 아직 도장이 없거나(미인증), 명단 밖이거나, 골프장을 모르는 라운드", () => {
        expect(stampMoment(states, { courseId: slot("pineridge").clubIds[0], courseName: "파인리즈컨트리클럽" })).toBeNull();
        expect(stampMoment(states, { courseId: "00000000-0000-4000-8000-000000000000", courseName: "동네 골프장" })).toBeNull();
        expect(stampMoment(states, { courseId: null, courseName: "" })).toBeNull();
        expect(stampMoment(states, {})).toBeNull();
    });

    it("결과 화면은 내 기록이 현장 인증 도장일 때만 카드를 켜고, 들어올 때 도장 통계를 새로 받는다", () => {
        const page = code(read("client/src/golf/pages/GameResult.tsx"));
        expect(page).toContain('enabled={onSite.summary?.stamp === "onsite"}');
        expect(page).toContain("courseId={session.courseId} courseName={session.courseName} finishedAt={session.finishedAt || session.updatedAt}");
        const card = code(read("client/src/golf/stamps/StampResultCard.tsx"));
        expect(card).toContain('refetchOnMount: "always",');
        expect(card).toContain("enabled,");
        // 방금 찍힌 도장 = 도장을 얻은 날이 라운드를 끝낸 날. 볼마커를 '받았어요'는 그 라운드로 다 찼을 때만
        expect(card).toContain("const fresh = !!finishedAt && mine.stamp.date === stampDate(finishedAt);");
        expect(card).toContain("const justDone = fresh && state.done;");
    });
});

describe("우리가 만든 그림이 들어가는 곳(2026-10-12 오너: \"랭큐 프로암 빼주고 도장깨기 가이드나 골프 코스도 해당 우리가 만든 이미지 같이 들어가면\")", () => {
    it("홈 아래 줄: 프로암 타일은 없고, 여권 타일과 장식장 타일이 우리 그림을 쓴다", () => {
        const quick = code(read("client/src/golf/components/dashboard/QuickActions.tsx"));
        expect(quick).not.toMatch(/proam|PRO-AM|프로암/);
        expect(quick).toContain("<PassportTileArt />");
        expect(quick).toContain("<ShelfTileArt />");
        // 여권 타일의 옛 꼬리말('도장깨기 & 가이드')은 맞지 않는다 — 가이드 탭은 없어졌고 도장깨기는 따로 생겼다
        expect(quick).not.toContain("도장깨기 & 가이드");
        // 두 타일의 그림은 장식이다 — 도장에 골프장 이름을 적지 않는다(누가 다녀온 것처럼 보이지 않게)
        const art = code(read("client/src/golf/stamps/HomeTileArt.tsx"));
        expect([...art.matchAll(/<InkStamp name="([^"]+)"/g)].map((m) => m[1])).toEqual(["골프 여권", "도장깨기"]);
    });

    it("도장깨기 가이드의 세 단계에 그림이 붙는다 — 표지 · 종이에 찍힌 도장 · 볼마커", () => {
        const s = code(read("client/src/golf/pages/StampBooks.tsx"));
        const guide = s.slice(s.indexOf('data-testid="stamp-guide"'), s.indexOf("</ol>", s.indexOf('data-testid="stamp-guide"')));
        expect(guide).toContain("coverSrc(GUIDE_BOOK)");
        expect(guide).toContain('<InkStamp name="도장깨기"');
        expect(guide).toContain("<MarkerArt bookId={GUIDE_BOOK} size={54} earned />");
        expect(guide.match(/<li /g)?.length).toBe(3);
    });

    it("골프장 공개 페이지: 도장첩의 골프장이면 그 권의 표지와 내 도장을 보여 준다. 방문자는 내 것을 부르지 않는다", () => {
        const page = code(read("client/src/golf/pages/GolfCoursePage.tsx"));
        expect(page).toContain("<CourseStampBlock key={`stamp:${d.slug}`} courseIds={d.courseIds}");
        const block = code(read("client/src/golf/stamps/CourseStampBlock.tsx"));
        expect(block).toContain("slotForCourseIds(courseIds)");
        expect(block).toContain("enabled: !!member && !!at,");
        expect(block).toContain("if (!at) return null;");
        expect(block).toContain("coverSrc(book.id)");
    });

    it("여권의 도장도 종이 위 잉크 도장 — 도장첩의 골프장은 그 권의 색 · 칸 이름, 밖의 골프장은 먹색 깃대 도장", () => {
        const list = code(read("client/src/golf/components/passport/StampList.tsx"));
        expect(list).toContain("const at = slotForStamp(stamp);");
        expect(list).toContain("const art = (at && BOOK_ART[at.book.id]) || PLAIN_STAMP;");
        expect(list).toContain("const name = at ? at.slot.name : stampLabel(stamp.name);");
        expect(list.match(/<StampPaper /g)?.length).toBe(2);
        expect(PLAIN_STAMP).toEqual({ ink: "#4A4A4A", glyph: "flag" });
        expect(GLYPH_PATHS.flag.length).toBeGreaterThan(0);
    });

    it("도장첩 밖 골프장의 도장 이름 — 꼬리를 떼고 열 자까지", () => {
        expect(stampLabel("써닝포인트컨트리클럽")).toBe("써닝포인트");
        expect(stampLabel("천안상록 CC")).toBe("천안상록");
        expect(stampLabel("㈜보문골프클럽")).toBe("보문");
        expect(stampLabel("골프존카운티 선산")).toBe("골프존카운티 선산");
        expect(stampLabel("CC")).toBe("CC");
        const long = stampLabel("아주아주아주 긴 이름을 가진 어느 골프장");
        expect([...long].length).toBeLessThanOrEqual(STAMP_LABEL_MAX);
    });
});

describe("길", () => {
    it("도장첩 · 장식장은 로그인 없이 열린다(GolfOnly 밖). 옛 엘리트 주소는 책장으로 간다", () => {
        const app = code(read("client/src/App.tsx"));
        expect(app).toContain('<Route path="/golf/stamps" component={GolfStampBooksRoute} />');
        expect(app).toContain('<Route path="/golf/stamps/:book" component={GolfStampBookRoute} />');
        expect(app).toContain('<Route path="/golf/shelf" component={GolfShelfRoute} />');
        expect(app).toContain('<Route path="/golf/elite60"><Redirect to="/golf/stamps" replace /></Route>');
        expect(app).not.toContain("GolfElite60");
    });

    it("골프 홈에 입구가 있고, 여권의 배너는 도장첩과 같은 셈을 쓴다 — '/ 60' 은 없다", () => {
        expect(code(read("client/src/golf/pages/Dashboard.tsx"))).toContain("<StampHomeEntry />");
        const passport = code(read("client/src/golf/pages/Passport.tsx"));
        expect(passport.match(/<StampBooksBanner stamps=\{stamps\} \/>/g)?.length).toBe(2);
        const banner = code(read("client/src/golf/components/passport/StampBooksBanner.tsx"));
        expect(banner).toContain("stampSummary(bookStates(stamps))");
        expect(banner).toContain("/ {summary.total}");
        expect(banner).not.toMatch(/\/ ?60\b/);
    });

    it("빈 칸 · 도장을 누르면 그 골프장의 공개 페이지로 간다", () => {
        expect(code(read("client/src/golf/pages/StampBook.tsx"))).toContain("href={`/golf/course/${s.slot.courseId}`}");
    });
});

describe("골프 화면 규칙", () => {
    it("리터럴 색만 — 테마가 뒤집는 낱말(bg-white · text-black · 토큰 색)을 쓰지 않는다", () => {
        for (const p of SCREENS) {
            const s = code(read(p));
            expect(s, p).not.toMatch(/\b(bg|text|border|ring)-(white|black)\b/);
            expect(s, p).not.toMatch(/\b(text-ink-|bg-surface-|border-surface-|bg-brand|text-brand|bg-card\b|text-foreground|text-muted)/);
        }
    });

    it("글자 12px 이상 · 굵기는 semibold 까지(홈 카드만 홈의 굵기를 따른다)", () => {
        for (const p of SCREENS) {
            const s = code(read(p));
            for (const m of s.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) expect(Number(m[1]), `${p} ${m[0]}`).toBeGreaterThanOrEqual(12);
            expect(s, p).not.toMatch(/\bfont-black\b|\bitalic\b/);
            if (!p.endsWith("StampHomeEntry.tsx")) expect(s, p).not.toMatch(/\bfont-(bold|extrabold)\b/);
        }
    });

    it("당구의 배지(둥근 다마 메달 · 방패 · 육각 판)를 골프 화면에 섞지 않는다", () => {
        for (const p of SCREENS) expect(code(read(p)), p).not.toMatch(/RealMedal|TierEmblem|OnlineDamaBadge|\/sim\/rank\//);
    });
});
