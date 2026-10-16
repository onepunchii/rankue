import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EXAMPLE_SPAN_DAYS, HIKING_EXAMPLE_COPY, exampleSummits, isHikingExample, withHikingExample } from "./hikingStampExample";
import { hikingBookStates, hikingBooks, mountainStamps, type StampMountain } from "./hikingStamps";
import { hikingGrade, HIKING_GRADES } from "./hikingGrade";

const root = resolve(__dirname, "..");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");
const NOW = Date.UTC(2026, 9, 13, 3, 0);

// 2026-10-13 오너: "등산에 도장첩 예시 만들어줘 수집욕이 올라가게 — 지금 골프는 예시 버튼 잘 활용하는데 등산은 부족하네"
describe("등산 도장첩의 예시 — 다 모은 모습", () => {
    it("주소 — ?example=1 로 켜고 끈다(책장과 각 권이 같이 본다)", () => {
        expect(isHikingExample("?example=1")).toBe(true);
        expect(isHikingExample("m=1&example=1")).toBe(true);
        expect(isHikingExample("?example=0")).toBe(false);
        expect(isHikingExample("")).toBe(false);
        expect(isHikingExample(null)).toBe(false);
        expect(withHikingExample("/hiking/stamps")).toBe("/hiking/stamps?example=1");
        expect(withHikingExample("/hiking/stamps/kfs-gangwon?x=1")).toBe("/hiking/stamps/kfs-gangwon?x=1&example=1");
        expect(withHikingExample("/hiking/stamps?example=1", false)).toBe("/hiking/stamps");
    });
    it("모든 산에 인증 도장 — 같은 목록 · 같은 날이면 늘 같은 결과, 날은 지난 세 해 안, 앞날은 없다", () => {
        const ids = Array.from({ length: 120 }, (_, i) => `Q${1000 + i}`);
        const a = exampleSummits(ids, NOW), b = exampleSummits([...ids, ...ids], NOW + 3_600_000);
        expect(a).toEqual(b);
        expect(new Set(a.map((s) => s.mountainId)).size).toBe(120);
        expect(a.every((s) => s.verified && s.id.startsWith("example:"))).toBe(true);
        for (const s of a) {
            const t = Date.parse(s.at);
            expect(t).toBeLessThan(NOW);
            expect(t).toBeGreaterThan(NOW - (EXAMPLE_SPAN_DAYS + 2) * 86_400_000);
        }
        // 넷에 하나꼴로는 다른 철에 한 번 더 — 도장 밑에 철이 쌓이는 모습
        const twice = mountainStamps(a).filter((s) => s.count > 1);
        expect(twice.length).toBeGreaterThan(5);
        expect(twice.length).toBeLessThan(60);
        expect(twice.some((s) => s.seasons.length > 1)).toBe(true);
    });
    it("그 기록으로 도장첩을 만들면 모든 권이 채워진다 · 산행 등급은 맨 위", () => {
        const regions = ["capital", "gangwon", "chungcheong", "jeonbuk", "jeonnam", "gyeongbuk", "gyeongnam", "jeju"];
        const famous: StampMountain[] = Array.from({ length: 100 }, (_, i) => ({
            id: `Q${i}`, slug: `산${i}`, name: `산${i}`, heightM: 400 + i * 15, region: regions[i % 8], tier: 1,
            lists: i % 3 ? ["kfs100"] : ["kfs100", "nationalparks"], traits: i % 5 ? [] : ["maple"],
        }));
        const books = hikingBooks(famous);
        expect(books.length).toBeGreaterThan(0);
        const states = hikingBookStates(books, mountainStamps(exampleSummits(books.flatMap((b) => b.slots.map((x) => x.id)), NOW)));
        expect(states.every((s) => s.done && s.got === s.total)).toBe(true);
        expect(hikingGrade(100).index).toBe(HIKING_GRADES.length - 1);
    });
    it("문구 — 예시라고 밝힌다 · 빠르기 · 궂은 날씨를 부추기지 않는다", () => {
        expect(HIKING_EXAMPLE_COPY.banner).toContain("예시");
        expect(HIKING_EXAMPLE_COPY.bookBanner).toContain("예시");
        expect(Object.values(HIKING_EXAMPLE_COPY).join(" ")).not.toMatch(/빨리|최단|야간|도전|극한|상금|경품/);
    });
    it("화면 — 기록은 부르지 않고 만든다 · 순번은 만들지 않는다 · 예시의 띠 · 내 것으로 가는 길(배낭 · 사진첩)은 두지 않는다", () => {
        const hook = read("client/src/hiking/stamps/useHikingStamps.ts");
        expect(hook).toContain("const my = useQuery<MyStampsResponse>({ queryKey: MY_STAMPS_KEY, enabled: member && !example });");
        // 받은 것도 만든다(다 모은 모습) — 순번은 0 으로 두고 화면은 예시일 때 순번을 적지 않는다
        expect(hook).toContain("const awards = example ? exampleAwards(computed, stamps) : member ? my.data?.awards ?? [] : [];");
        expect(hook).toContain("out.push({ id: hikingAwardId(kind, key), kind, key, serial: 0, earnedAt: new Date(at).toISOString() });");
        expect(hook).toContain("? exampleSummits(hikingBooks(famous).flatMap((b) => b.slots.map((x) => x.id)), Date.now())");
        const shelf = read("client/src/hiking/pages/StampShelf.tsx");
        expect(shelf).toContain("const example = isHikingExample(useSearch());");
        expect(shelf).toContain('data-testid="hk-example-btn"');
        expect(shelf).toContain('data-testid="hk-example-banner"');
        expect(shelf).toContain("const fresh = s.member && !example && !s.isLoading && got === 0;");
        expect(shelf).toContain("{!example && <AlbumEntry from=\"shelf\" className=\"mt-2.5\" />}");
        // 방문자의 가입 안내는 예시에서도 남는다(진짜 회원인가로 가른다)
        expect(shelf).toContain("{!s.member && <div className=\"px-5 pt-8\"><HikingCta /></div>}");
        const book = read("client/src/hiking/pages/StampBookPage.tsx");
        expect(book).toContain("const s = useHikingStamps({ example });");
        expect(book).toContain("{EX.bookBanner}");
        expect(book).toContain("const hasPhoto = s.member && !example && slots.some((x) => photoOf.has(x.m.id));");
        // 책장의 줄 — 예시에서 권으로 들어가도 예시가 이어진다
        expect(read("client/src/hiking/stamps/StampParts.tsx")).toContain("<Link href={example ? withHikingExample(hikingBookPath(book.id)) : hikingBookPath(book.id)}");
        // 배낭도 예시로(오너: "도장첩 예시에 배낭도 예시로 보여지게") — 예시 책장의 등급 · 요약이 예시 배낭으로 간다
        const pack = read("client/src/hiking/pages/PackPage.tsx");
        expect(pack).toContain("const s = useHikingStamps({ example });");
        expect(pack).toContain("{EX.packBanner}");
        expect(pack).toContain("{!example && <AlbumEntry from=\"pack\" className=\"mt-2.5\" />}");
        expect(pack).toContain("{a ? (example ? stampDate(a.earnedAt) : `${a.serial}번째 · ${stampDate(a.earnedAt)}`) : p.how}");
        expect(pack).toContain("{!s.member && <div className=\"px-5 pt-8\"><HikingCta /></div>}");
        expect(shelf.match(/href=\{example \? withHikingExample\(HIKING_PACK_PATH\) : HIKING_PACK_PATH\}/g)?.length).toBe(2);
        expect(book).toContain("(example ? `다 채워서 받은 와펜 · ${stampDate(award.earnedAt)}`");
        for (const src of [shelf, book, pack]) {
            for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(12);
            expect(src.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/font-(bold|extrabold|black)/);
        }
    });
});
