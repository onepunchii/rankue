import { describe, it, expect } from "vitest";
import {
    GEAR_EMOJI, PACK_BASE, PACK_DESC, PACK_FAQ, PACK_FIRST, PACK_KEYS, PACK_SEASONS, PACK_TITLE, PACK_WEATHER, gearEmoji, packJsonLd, parsePackChecked,
} from "./golfPack";
import { roundBrief } from "./golfRoundBrief";
import type { WxHour } from "./golfWeather";

// 준비물 체크리스트 — 글은 화면과 검색엔진용 화면이 같이 쓴다. 날씨별 줄이 라운드 브리핑의 규칙과 어긋나지 않는지가 시험의 절반이다.
const D = "20261006";
const SUN = { rise: "06:30", set: "18:08" };
const h = (hr: number, over: Partial<WxHour> = {}): WxHour => ({ t: `${D}${String(hr).padStart(2, "0")}`, tmp: 18, pop: 0, kind: "clear", wsd: 2, pcp: null, ...over });
const day = (f: (hr: number) => Partial<WxHour> = () => ({})) => Array.from({ length: 17 }, (_, i) => h(i + 5, f(i + 5)));
const gearAt = (tee: number, f?: (hr: number) => Partial<WxHour>) => roundBrief(day(f), tee, SUN)!.gear;

/** 2019년 이후 이모지(오래된 안드로이드에 없다) — 쓰지 않기로 한 것들 */
const TOO_NEW = (cp: number) => cp >= 0x1fa70 || (cp >= 0x1f7e0 && cp <= 0x1f7eb) || [0x1f9ca, 0x1f9f4, 0x1f9c6, 0x1f9c7, 0x1f9c8, 0x1f9c9, 0x1f9cb].includes(cp);

describe("늘 챙기는 것", () => {
    it("아홉 가지 — key 는 저장되는 값이라 겹치지 않고 영문 소문자다", () => {
        expect(PACK_BASE).toHaveLength(9);
        expect(new Set(PACK_KEYS).size).toBe(PACK_BASE.length);
        for (const p of PACK_BASE) { expect(p.key).toMatch(/^[a-z]+$/); expect(p.label.length).toBeGreaterThan(1); expect(p.emoji).not.toBe(""); }
    });
    it("저장된 체크 표시 — 모르는 key·깨진 값은 버리고 목록 순서로 돌려준다", () => {
        expect(parsePackChecked('["shoes","clubs","nope"]')).toEqual(["clubs", "shoes"]);
        for (const bad of [null, undefined, "", "{", '{"a":1}', "3", '"clubs"']) expect(parsePackChecked(bad)).toEqual([]);
    });
});

describe("그림", () => {
    it("라운드 브리핑이 고를 수 있는 준비물에는 전부 그림이 있다", () => {
        const seen = new Set<string>();
        const temps = [-3, 2, 8, 12, 20, 25, 30, 33];
        for (const tee of [6, 7, 12, 15, 17]) for (const t0 of temps) for (const rise of [0, 10]) for (const pop of [0, 40, 70]) for (const kind of ["clear", "rain", "snow"] as const) {
            for (const g of gearAt(tee, (hr) => ({ tmp: t0 + (hr >= tee + 3 ? rise : 0), pop, kind: kind === "clear" || hr !== tee + 1 ? "clear" : kind }))) seen.add(g);
        }
        expect(seen.size).toBeGreaterThanOrEqual(9);
        for (const g of seen) expect(gearEmoji(g), g).not.toBe("");
        // 그림표에 죽은 낱말이 없다 — 규칙에서 이름을 바꾸면 여기서 걸린다
        for (const g of Object.keys(GEAR_EMOJI)) expect(seen.has(g), g).toBe(true);
    });
    it("이모지는 2017년 이전 것만", () => {
        const all = [...PACK_BASE.map((p) => p.emoji), ...Object.values(GEAR_EMOJI), ...PACK_SEASONS.flatMap((s) => [s.emoji, ...s.items.map((i) => i.emoji)])];
        for (const e of all) for (const ch of e) { const cp = ch.codePointAt(0)!; if (cp !== 0xfe0f) expect(TOO_NEW(cp), `${e} ${cp.toString(16)}`).toBe(false); }
    });
});

describe("날씨별 줄 — 라운드 브리핑(gearOf)의 규칙을 말로 옮긴 것", () => {
    const row = (word: string) => PACK_WEATHER.find((w) => w.when.includes(word))!;
    it("줄에 적힌 준비물은 전부 그림표에 있는 낱말이다", () => {
        for (const w of PACK_WEATHER) for (const g of w.gear) expect(GEAR_EMOJI[g], g).toBeTruthy();
    });
    it("눈 → 방한 장갑", () => {
        expect(row("눈").gear).toEqual(["방한 장갑"]);
        expect(gearAt(7, (hr) => (hr === 8 ? { kind: "snow", tmp: -1 } : { tmp: 1 }))).toContain("방한 장갑");
    });
    it("비 오거나 60% 이상 → 우산·비옷과 여벌 장갑 · 30% 이상 → 우산", () => {
        expect(row("60%").gear).toEqual(["우산·비옷", "여벌 장갑"]);
        expect(gearAt(12, () => ({ pop: 60 }))).toEqual(expect.arrayContaining(["우산·비옷", "여벌 장갑"]));
        expect(gearAt(12, () => ({ pop: 59 }))).not.toContain("우산·비옷");
        expect(row("30%").gear).toEqual(["우산"]);
        expect(gearAt(12, () => ({ pop: 30 }))).toContain("우산");
        expect(gearAt(12, () => ({ pop: 29 }))).not.toContain("우산");
    });
    it("3° 아래 → 핫팩 · 10° 이하 티오프 → 바람막이", () => {
        expect(row("3°").gear).toEqual(["핫팩"]);
        expect(gearAt(12, () => ({ tmp: 3 }))).toContain("핫팩");
        expect(gearAt(12, () => ({ tmp: 4 }))).not.toContain("핫팩");
        expect(row("10° 이하").gear).toEqual(["바람막이"]);
        expect(gearAt(12, () => ({ tmp: 10 }))).toContain("바람막이");
        expect(gearAt(12, () => ({ tmp: 11 }))).not.toContain("바람막이");
    });
    it("11~14°에서 시작해 9° 넘게 오르면 → 겹쳐 입기", () => {
        expect(row("11~14°").gear).toEqual(["겹쳐 입기"]);
        expect(gearAt(7, (hr) => ({ tmp: hr >= 12 ? 21 : 12 }))).toContain("겹쳐 입기");
        expect(gearAt(7, (hr) => ({ tmp: hr >= 12 ? 20 : 12 }))).not.toContain("겹쳐 입기"); // 8° 차
        expect(gearAt(7, (hr) => ({ tmp: hr >= 12 ? 25 : 15 }))).not.toContain("겹쳐 입기"); // 15° 시작
    });
    it("28° 이상 → 얼음물 · 22° 이상 맑은 낮 → 선크림·모자 · 해 진 뒤까지 → 라이트 코스 확인", () => {
        expect(row("28°").gear).toEqual(["얼음물"]);
        expect(gearAt(12, () => ({ tmp: 28 }))).toContain("얼음물");
        expect(gearAt(12, () => ({ tmp: 27 }))).not.toContain("얼음물");
        expect(row("22°").gear).toEqual(["선크림·모자"]);
        expect(gearAt(12, () => ({ tmp: 22 }))).toContain("선크림·모자");
        expect(gearAt(12, () => ({ tmp: 21 }))).not.toContain("선크림·모자");
        expect(row("해가 진").gear).toEqual(["라이트 코스 확인"]);
        expect(gearAt(17)).toContain("라이트 코스 확인");
    });
});

describe("공개 페이지 글", () => {
    it("제목·설명 — 찾는 말(골프 라운딩 준비물)이 들어 있고 설명은 160자 안", () => {
        expect(PACK_TITLE).toContain("골프 라운딩 준비물");
        expect(PACK_DESC).toContain("골프 라운딩 준비물 9가지");
        expect(PACK_DESC.length).toBeLessThanOrEqual(160);
    });
    it("자주 묻는 것의 답은 목록에서 나온다 — 목록의 이름이 답에 다 들어 있다", () => {
        expect(PACK_FAQ).toHaveLength(4);
        for (const p of PACK_BASE) expect(PACK_FAQ[0].a).toContain(p.label.replace(/ · /g, "·"));
        const rain = PACK_SEASONS.find((s) => s.key === "rain")!;
        const faqRain = PACK_FAQ.find((f) => f.q.includes("비 오는 날"))!;
        for (const i of rain.items) expect(faqRain.a).toContain(i.label);
        expect(PACK_FAQ.find((f) => f.q.includes("겨울"))!.a).toContain("컬러볼");
    });
    it("구조화 데이터는 화면의 질문·답과 같은 글", () => {
        const ld: any = packJsonLd("https://www.rankue.co.kr");
        expect(ld["@type"]).toBe("FAQPage");
        expect(ld.url).toBe("https://www.rankue.co.kr/golf/checklist");
        expect(ld.mainEntity.map((q: any) => [q.name, q.acceptedAnswer.text])).toEqual(PACK_FAQ.map((f) => [f.q, f.a]));
    });
    it("금액을 적지 않는다 — 골프장마다 다르다", () => {
        const text = [...PACK_BASE.map((p) => p.note ?? ""), ...PACK_FIRST, ...PACK_FAQ.map((f) => f.a), ...PACK_SEASONS.flatMap((s) => [s.lead, ...s.items.map((i) => i.note ?? "")])].join(" ");
        expect(text).not.toMatch(/\d[\d,]*\s*(원|만원|만 원)/);
    });
});
