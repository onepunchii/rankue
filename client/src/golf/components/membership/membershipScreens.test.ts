/**
 * 회원권 시세 화면 — 지어낸 자료가 다시 들어오지 않게 소스를 읽어 지킨다(2026-10-06).
 *
 * 이 화면의 시세는 한 번 모은 정적 자료(data/crawledMembershipData.ts)다. 거기 실제로 있는 값은
 * 현재가 · 연간 최고 · 연간 최저뿐이고, 전일 값·호가·거래 내역·회원 평가는 없다.
 * 예전 화면은 없는 값을 지어내 실제처럼 그렸다(id 로 만든 등락, 현재가에서 더하고 뺀 양쪽 가격, 난수 거래 5건,
 * 고정 그림 그래프, 고정 평점과 예시 글). 그것들이 돌아오면 여기서 실패한다.
 * 코스 탭도 같다 — 자료에 없는 잔디 이름·난이도 막대·채워 넣은 태그를 그리지 않고, 전화 단추는 자료에 번호가 있을 때만 건다
 * (예전엔 번호 자리에 홈페이지 주소가 들어갔다).
 * 혜택 탭과 머리도 같다 — 모든 골프·콘도 종목에 똑같이 박혀 있던 예약 오픈 요일·시각과 취소 기한, 398종목 전부에 조건 없이 붙던
 * 금색 선정 배지를 뺐다(둘 다 자료에 없는 값). 금지 목록은 회원권 화면 파일에만 건다 — 골프장 페이지의 배지(course/CourseHero)는
 * 실제 선정 값으로 붙는 것이라 대상이 아니다.
 * 하단 단추는 자료에 있는 연락 길 하나만 그린다 — 번호가 있으면 전화, 없으면 그 종목의 홈페이지(새 창), 둘 다 없으면 그리지 않는다.
 *
 * 일부러 검사에서 뺀 파일(오너 결정 대기 — 이 시험이 그 결정을 막지 않는다):
 *  - data/membershipMock.ts 의 FAQ 본문, components/OrderModal.tsx(어디서도 부르지 않는다)
 *  - data/crawledMembershipData.ts(모은 자료 그 자체 — 골프장 소개 글에 어떤 낱말이든 나올 수 있다)
 */
import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// vitest 설정엔 '@' 별칭이 없다 — courseHomeEntry.test 와 같이 막아 둔다(클래스 합치기는 그리는 값과 상관없다)
vi.mock("@/lib/utils", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));

import * as React from "react";
import { CRAWLED_MEMBERSHIPS, MEMBERSHIP_DATA_DATE, membershipAsOfLabel, realPrice } from "../../data/membershipData";
import { membershipHomepage } from "../../hooks/useMembershipData";
import { MembershipMarketTab } from "./MembershipMarketTab";
import { MembershipActionFooter } from "./MembershipActionFooter";

// vitest 는 화면 파일의 JSX 를 React.createElement 로 옮긴다(앱 빌드는 자동 런타임이라 화면 파일은 React 를 들여오지 않는다).
// 시세 탭을 함수로 불러 보려면 그 이름이 전역에 있어야 한다 — 시험 안에서만 쓴다.
(globalThis as { React?: unknown }).React = React;

const golf = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(golf, rel), "utf8");
/** 주석을 걷는다 — 무엇을 왜 뺐는지 적은 주석이 금지어를 품고 있다. 주소(https://)의 // 는 남긴다. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const code = (rel: string) => strip(read(rel));

/** 회원권 화면·훅·자료 묶음 — 폴더를 읽어 새로 생긴 파일도 같이 본다 */
const SCREEN_FILES = [
    ...readdirSync(resolve(golf, "components/membership"))
        .filter((f) => /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f))
        .map((f) => `components/membership/${f}`),
    "components/MembershipFilter.tsx",
    "pages/MembershipDetail.tsx",
    "pages/MembershipExchange.tsx",
    "hooks/useMembershipData.ts",
    "hooks/useMembershipFilter.ts",
    "data/membershipData.ts",
];

const FORBIDDEN: [string, RegExp][] = [
    ["지어낸 후기·평점", /ReviewCard|REVIEWS|멤버 인사이트|전체 평점|싱글 골퍼|30대 남성/],
    ["최근 거래 내역", /Recent Transactions|최근 거래|거래\s?완료/],
    ["'실시간'", /실시간/],
    ["'상승세' 같은 평", /상승세|하락세|급상승|급등|급락/],
    ["호가 카드", /즉시 판매가|즉시 구매가|buyPrice|sellPrice|대기 \d+명/],
    ["전일 값 없이 만든 등락", /calculateTrend|전일\s?대비|trend\.(?:change|status)|changeRate|changeAmount|trendData|[▲▼]/],
    ["난수로 만든 값", /Math\.random/],
    // 코스 탭에 박혀 있던 것: 모든 골프장에 같은 잔디 이름, 빈 태그를 채운 같은 태그 하나, 난이도 자료 없이 그린 막대
    ["자료에 없는 코스 스펙", />\s*중지\s*<|#프리미엄|DIFFICULTY|코스 분석/],
    // 혜택 탭에 박혀 있던 것: 모든 골프·콘도 종목에 같은 예약 오픈 요일·시각과 취소 기한. 클럽별 실제 조건은 자료(특징 글)에서 온다 — 화면 파일에 적지 않는다
    ["모든 클럽 공통 예약·위약 규정", /예약 오픈|예약 방법 및 안내|위약금 발생|위약 규정|\d주\s?전 [월화수목금토일]요일|\d+일 전 \d{1,2}:\d{2}/],
    // 머리 사진 위에 조건 없이 붙던 금색 배지 — 회원권 자료엔 선정 여부 값이 없다
    ["근거 없는 선정 배지", /RANKUE\s?60/],
];

describe("회원권 화면 — 지어낸 자료가 없다", () => {
    it("검사할 파일을 실제로 읽는다(폴더가 비면 아래 시험이 헛돈다)", () => {
        expect(SCREEN_FILES.length).toBeGreaterThanOrEqual(15);
        for (const f of SCREEN_FILES) expect(existsSync(resolve(golf, f)), f).toBe(true);
    });

    for (const [what, pattern] of FORBIDDEN) {
        it(`${what} — 어느 파일에도 없다`, () => {
            const hits = SCREEN_FILES.filter((f) => pattern.test(code(f)));
            expect(hits).toEqual([]);
        });
    }

    it("예시 글 카드 파일이 없고, mock 파일은 FAQ 만 내보낸다", () => {
        expect(existsSync(resolve(golf, "components/membership/ReviewCard.tsx"))).toBe(false);
        const exported = [...code("data/membershipMock.ts").matchAll(/export\s+(?:const|let|var|function|class)\s+(\w+)/g)].map((m) => m[1]);
        expect(exported).toEqual(["FAQ_LIST"]);
    });

    it("화면이 mock 파일에서 가져오는 것은 FAQ 뿐이다", () => {
        const names = SCREEN_FILES.flatMap((f) =>
            [...code(f).matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][^"']*membershipMock["']/g)]
                .flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean)));
        expect([...new Set(names)]).toEqual(["FAQ_LIST"]);
    });
});

/** 그려진 글자만 모은다 — 시세 탭은 훅이 없어 함수로 불러 나무를 훑을 수 있다 */
const texts = (node: any): string[] => {
    if (node == null || typeof node === "boolean") return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap(texts);
    return texts(node.props?.children);
};
const drawn = (data: Record<string, unknown>) => texts(MembershipMarketTab({ data }));

describe("시세 탭 — 그려 보면", () => {
    it("값이 다 있으면 현재 시세 · 연간 최고 · 연간 최저 · 자료 날짜", () => {
        expect(drawn({ currentPrice: 32_000_000, highPrice: "3,300만", lowPrice: "3,200만", priceAsOfLabel: "2026.02.15 자료 기준" }))
            .toEqual(["현재 시세", "2026.02.15 자료 기준", "3,200만", "원", "연간 최고", "3,300만", "원", "연간 최저", "3,200만", "원"]);
    });

    it("연간 최고·최저가 없으면 그 칸이 없다 — 0 도 '-' 도 없다", () => {
        expect(drawn({ currentPrice: 150_000_000, highPrice: null, lowPrice: null, priceAsOfLabel: null })).toEqual(["현재 시세", "1억 5,000만", "원"]);
    });

    it("한쪽만 있으면 있는 쪽만", () => {
        expect(drawn({ currentPrice: 32_000_000, highPrice: "3,300만", lowPrice: null, priceAsOfLabel: null }))
            .toEqual(["현재 시세", "3,200만", "원", "연간 최고", "3,300만", "원"]);
    });

    it("자료 날짜를 모르면 날짜를 적지 않는다", () => {
        expect(drawn({ currentPrice: 32_000_000, highPrice: "3,300만", lowPrice: "3,200만" }).join(" ")).not.toMatch(/기준|\d{4}\.\d{2}/);
    });

    it("현재가가 없으면(0) 현재 시세 칸이 없고, 아무 값도 없으면 안내 한 줄뿐", () => {
        expect(drawn({ currentPrice: 0, highPrice: "3,300만", lowPrice: "3,200만" })).toEqual(["연간 최고", "3,300만", "원", "연간 최저", "3,200만", "원"]);
        expect(drawn({ currentPrice: 0, highPrice: null, lowPrice: null })).toEqual(["시세 자료가 없습니다."]);
    });
});

describe("시세 탭 — 자료에 있는 값만, 없으면 그리지 않는다", () => {
    const tab = code("components/membership/MembershipMarketTab.tsx");

    it("쓰는 값은 현재가 · 연간 최고 · 연간 최저 · 자료 날짜뿐이다", () => {
        const used = [...new Set([...tab.matchAll(/\bdata\.(\w+)/g)].map((m) => m[1]))].sort();
        expect(used).toEqual(["currentPrice", "highPrice", "lowPrice", "priceAsOfLabel"]);
    });

    it("칸마다 값이 있을 때만 그린다 — 0 이나 '-' 로 채우지 않는다", () => {
        expect(tab).toMatch(/data\.currentPrice > 0 \? data\.currentPrice : null/);
        expect(tab).toMatch(/\{current != null && \(/);
        expect(tab).toMatch(/\.filter\(\(cell\) => !!cell\.text\)/);
        expect(tab).toMatch(/\{yearRange\.length > 0 && \(/);
        expect(tab).toMatch(/\{data\.priceAsOfLabel && \(/);
        expect(tab).not.toMatch(/(?:\|\||\?\?)\s*(?:0\b|["']-["'])/);
    });

    it("고정 그림 그래프가 없다", () => {
        expect(tab).not.toMatch(/<svg|<path|linearGradient/);
    });

    it("형제 key 가 서로 다르다", () => {
        const keys = [...tab.matchAll(/\{ key: "(\w+)"/g)].map((m) => m[1]);
        expect(keys).toEqual(["high", "low"]);
        expect(tab).toContain("key={cell.key}");
    });

    it("골프 화면 규칙 — 리터럴 색만, 글자는 12px 이상", () => {
        expect(tab).not.toMatch(/\b(?:bg|text|border|ring|outline|from|via|to|fill|stroke)-(?:white|black)\b/);
        const sizes = [...tab.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
        expect(sizes.length).toBeGreaterThan(0);
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
        expect(tab).not.toMatch(/\btext-(?:\[(?:[0-9]|1[01])px\])/);
    });
});

describe("훅 — 연간 최고·최저는 자료에 없으면 null", () => {
    const hook = code("hooks/useMembershipData.ts");

    it("0 으로 메우지 않는다", () => {
        expect(hook).toContain("realPrice(membership.price.highYear)");
        expect(hook).toContain("realPrice(membership.price.lowYear)");
        expect(hook).toMatch(/highPrice: yearHigh != null \? formatPrice\(yearHigh\) : null/);
        expect(hook).toMatch(/lowPrice: yearLow != null \? formatPrice\(yearLow\) : null/);
        expect(hook).not.toMatch(/(?:highYear|lowYear)\s*(?:\|\||\?\?)\s*0/);
    });

    it("realPrice — 양수 금액만 값으로 친다", () => {
        expect(realPrice(32_000_000)).toBe(32_000_000);
        for (const v of [0, -1, NaN, Infinity, undefined, null, "3200", ""]) expect(realPrice(v), String(v)).toBeNull();
    });
});

describe("코스 탭·문의 단추 — 빈 값을 채워 넣지 않는다", () => {
    const tab = code("components/membership/MembershipCourseTab.tsx");
    const hook = code("hooks/useMembershipData.ts");

    it("코스 탭은 자료에 없는 잔디·난이도·태그를 그리지 않는다", () => {
        expect(tab).not.toMatch(/data\.(?:grass|tags|difficulty\w*|specs)\b/);
        expect(tab).not.toContain("LucideLeaf");
        // 반쯤 찬 막대 같은 고정 너비 그림이 없다
        expect(tab).not.toMatch(/w-\[\d+%\]/);
    });

    it("골프는 두 칸(위치 · 홀수) — 세로줄도 가운데 하나", () => {
        const golfCell = tab.slice(tab.indexOf("{data.category === 'Golf' ? (", tab.indexOf("{data.originalRegion}")), tab.indexOf(") : data.category === 'Condo' ? ("));
        expect(golfCell.match(/className="flex-1 flex flex-col items-center gap-1"/g)).toHaveLength(1);
        expect(golfCell).toContain("홀수");
        expect(tab).toContain('<div className="absolute left-1/2 top-1/2 -translate-y-1/2 w-px h-8 bg-[#FFFFFF1A]" />');
    });

    it("훅은 빈 태그를 채우지 않는다", () => {
        expect(hook).toContain("tags: membership.tags.map(t => `#${t}`),");
        expect(hook).not.toMatch(/tags:[^\n]*\?[^\n]*:\s*\[/);
    });

    it("전화는 자료의 번호만 — 홈페이지 주소를 번호 자리에 넣지 않는다", () => {
        expect(hook).not.toMatch(/phone:\s*membership\.info\.homepage/);
        expect(hook).toContain('phone: (membership.info.phone || "").split(/[/~,]/)[0].trim(),');
        // 홈페이지는 제 칸으로 나간다 — http(s) 주소만 통과시키는 함수를 거쳐서
        expect(hook).toContain("website: membershipHomepage(membership.info.homepage),");
        expect(hook).not.toMatch(/website:\s*membership\.info\.homepage/);
    });

    it("자료의 번호에 그 규칙을 걸면 걸 수 있는 번호 하나가 나온다 — 여러 번호가 붙은 값도, 주소가 섞인 값도 없다", () => {
        const phones = [...read("data/crawledMembershipData.ts").matchAll(/"phone":\s*"([^"]*)"/g)].map((m) => m[1]);
        expect(phones.length).toBeGreaterThan(300);
        const real = [...new Set(phones.filter(Boolean))];
        expect(real.length).toBeGreaterThan(5);
        for (const p of real) {
            expect(p, p).not.toMatch(/https?:|www\./);
            expect(p.split(/[/~,]/)[0].trim(), p).toMatch(/^0\d{1,2}-\d{3,4}-\d{4}$/);
        }
    });

    it("상세 화면은 번호와 홈페이지를 제 자리에 넘긴다 — 번호 자리에 주소를 넣지 않는다", () => {
        expect(code("pages/MembershipDetail.tsx")).toContain("<MembershipActionFooter phone={hybridData.phone} homepage={hybridData.clubInfo.website} />");
        expect(code("pages/MembershipDetail.tsx")).not.toMatch(/<MembershipActionFooter phone=\{hybridData\.(?:clubInfo\.website|homepage)/);
    });
});

/** 그려진 나무에서 링크(a)만 모은다 */
const anchors = (node: any): any[] => {
    if (node == null || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(anchors);
    return [...(node.type === "a" ? [node] : []), ...anchors(node.props?.children)];
};
/** 훅이 번호를 넘기는 규칙(위 시험이 훅에 이 줄이 있는지 본다) */
const dialable = (raw: string | undefined) => (raw || "").split(/[/~,]/)[0].trim();

describe("홈페이지 주소 — http(s) 로 시작하는 것만 링크로 나간다", () => {
    it("membershipHomepage — 주소는 그대로, 앞뒤 공백은 걷는다", () => {
        expect(membershipHomepage("http://www.example.com")).toBe("http://www.example.com");
        expect(membershipHomepage("https://www.example.com/")).toBe("https://www.example.com/");
        expect(membershipHomepage(" https://sub.example.co.kr/a/b.do?x=1 ")).toBe("https://sub.example.co.kr/a/b.do?x=1");
        expect(membershipHomepage("HTTPS://WWW.EXAMPLE.COM")).toBe("HTTPS://WWW.EXAMPLE.COM");
    });

    it("membershipHomepage — 주소가 아니면 빈 값. 짐작해서 고쳐 쓰지 않는다", () => {
        const notLinks = [
            "", " ", "-", "문의", "www.example.com", "example.com", "//example.com",
            "javascript:alert(1)", " javascript:alert(1)", "data:text/html,x", "tel:02-000-0000", "mailto:a@example.com", "ftp://example.com",
            "http://", "http:///x", "http://localhost", "http://www.example.com 02-000-0000", "http://www.example.com\nhttp://b.example.com",
            // 호스트 끝이 최상위 도메인 꼴이 아니다 — 점이 빠진 자료 값, 숫자로 끝나는 호스트, 끝에 점만 붙은 값
            "http://www.seoseoulcokr", "http://www.example.c", "http://www.example.abcdefg", "http://192.168.0.1/", "http://www.example.", "http://a@example.com",
            undefined, null, 0, {}, ["http://www.example.com"],
        ];
        for (const v of notLinks) expect(membershipHomepage(v), String(v)).toBe("");
    });

    it("membershipHomepage — 포트·경로·물음표가 붙은 주소는 그대로 통과한다", () => {
        for (const v of ["http://www.example.com:8080", "https://www.example.co.kr:8443/a?b=1#c", "http://example.net?x=1", "http://example.kr#top"]) {
            expect(membershipHomepage(v), v).toBe(v);
        }
    });

    it("자료의 주소는 호스트가 깨진 한 건만 빼고 통과한다 — 끝에 공백이 붙은 값도 공백만 걷혀서", () => {
        const pages = [...read("data/crawledMembershipData.ts").matchAll(/"homepage":\s*"([^"]*)"/g)].map((m) => m[1]);
        expect(pages.length).toBeGreaterThan(300);
        // 서서울cc 일반(01063001) — ".co.kr" 의 점이 빠져 있다. 실제 주소를 모르므로 고쳐 쓰지 않고 링크를 그리지 않는다.
        const broken = ["http://www.seoseoulcokr"];
        for (const p of pages.filter(Boolean)) expect(membershipHomepage(p), p).toBe(broken.includes(p.trim()) ? "" : p.trim());
        expect(pages.filter((p) => broken.includes(p.trim()))).toHaveLength(1);
    });
});

describe("하단 단추 — 자료에 있는 연락 길 하나만", () => {
    const one = (props: { phone?: string; homepage?: string }) => {
        const links = anchors(MembershipActionFooter(props));
        expect(links).toHaveLength(1);
        return links[0];
    };

    it("번호가 있으면 전화 링크 — 홈페이지가 같이 있어도 전화다(전화가 있는 종목은 예전 그대로)", () => {
        for (const homepage of [undefined, "", "https://www.example.com"]) {
            const a = one({ phone: "02-000-0000", homepage });
            expect(a.props.href).toBe("tel:02-000-0000");
            expect(a.props.target).toBeUndefined();
            expect(texts(a)).toEqual(["골프장에 문의하기"]);
        }
    });

    it("번호가 없고 홈페이지가 있으면 '홈페이지 보기' — 새 창, noopener noreferrer", () => {
        for (const phone of [undefined, "", " "]) {
            const a = one({ phone, homepage: "https://www.example.com/club" });
            expect(a.props.href).toBe("https://www.example.com/club");
            expect(a.props.target).toBe("_blank");
            expect(a.props.rel).toBe("noopener noreferrer");
            expect(texts(a)).toEqual(["홈페이지 보기"]);
        }
    });

    it("번호도 주소도 없으면 아무것도 그리지 않는다 — 주소가 아닌 글자가 넘어와도 링크로 걸지 않는다", () => {
        expect(MembershipActionFooter({})).toBeNull();
        expect(MembershipActionFooter({ phone: "", homepage: "" })).toBeNull();
        for (const homepage of ["-", "www.example.com", "javascript:alert(1)", "tel:02-000-0000", "http://", "http://www.example.com 02-000-0000"]) {
            expect(MembershipActionFooter({ phone: "", homepage }), homepage).toBeNull();
        }
    });

    it("자료의 종목마다 — 번호가 있으면 그 번호, 없으면 그 종목의 홈페이지. 번호 자리에 주소가 걸리는 일이 없다", () => {
        const drawnAs = { tel: 0, site: 0, none: 0 };
        for (const m of CRAWLED_MEMBERSHIPS) {
            const phone = dialable(m.info.phone);
            const homepage = membershipHomepage(m.info.homepage);
            const links = anchors(MembershipActionFooter({ phone, homepage }));
            if (phone) {
                drawnAs.tel++;
                expect(links.map((a) => a.props.href), m.id).toEqual([`tel:${phone}`]);
                expect(phone, m.id).not.toMatch(/https?:|www\./i);
            } else if (homepage) {
                drawnAs.site++;
                expect(links.map((a) => [a.props.href, a.props.target, a.props.rel]), m.id).toEqual([[homepage, "_blank", "noopener noreferrer"]]);
                expect(homepage, m.id).toMatch(/^https?:\/\/\S+$/i);
                expect(homepage, m.id).toBe((m.info.homepage || "").trim());
            } else {
                drawnAs.none++;
                expect(links, m.id).toEqual([]);
            }
        }
        // 지금 자료: 번호는 휘트니스 종목에만 있고, 골프·콘도 종목은 홈페이지로 나간다. 전에는 이 종목들에서 단추가 통째로 없었다
        expect(drawnAs.tel).toBeGreaterThan(5);
        expect(drawnAs.site).toBeGreaterThan(300);
        const noPhone = CRAWLED_MEMBERSHIPS.filter((m) => !dialable(m.info.phone));
        expect(noPhone.some((m) => m.category === "Golf") && noPhone.some((m) => m.category === "Condo")).toBe(true);
    });

    it("주소가 깨진 종목(서서울cc 일반)은 단추를 그리지 않는다 — 없는 호스트로 새 창이 열리지 않게", () => {
        const m = CRAWLED_MEMBERSHIPS.find((x) => x.id === "01063001")!;
        expect(m.info.homepage).toBe("http://www.seoseoulcokr"); // 자료가 고쳐지면 이 시험과 거름의 예외 목록을 같이 본다
        expect(dialable(m.info.phone)).toBe("");
        const homepage = membershipHomepage(m.info.homepage);
        expect(homepage).toBe("");
        expect(MembershipActionFooter({ phone: dialable(m.info.phone), homepage })).toBeNull();
        // 코스 탭의 '방문하기' 줄도 같은 값(clubInfo.website)이 비어 있으면 그리지 않는다
        expect(code("components/membership/MembershipCourseTab.tsx")).toContain("{data.clubInfo.website && data.clubInfo.website !== '' && (");
    });

    it("골프 화면 규칙 — 리터럴 색만, 글자는 12px 이상", () => {
        const footer = code("components/membership/MembershipActionFooter.tsx");
        expect(footer).not.toMatch(/\b(?:bg|text|border|ring|outline|from|via|to|fill|stroke)-(?:white|black)\b/);
        const sizes = [...footer.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
        expect(sizes.length).toBeGreaterThan(0);
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
        expect(footer).not.toMatch(/\btext-(?:xs|\[(?:[0-9]|1[01])px\])/);
    });
});

describe("혜택 탭·머리 — 모든 종목에 똑같이 박힌 표시가 없다", () => {
    const benefit = code("components/membership/MembershipBenefitTab.tsx");
    const hero = code("components/membership/MembershipHero.tsx");

    it("혜택 탭에 예약 안내 카드가 없다 — 제목도, 예약실 전화 칩도, 칩만 남은 빈 껍데기도", () => {
        expect(benefit).not.toMatch(/예약 방법|예약실|Reservation Guide|Booking Open|Cancellation/);
        expect(benefit).not.toMatch(/data\.phone|tel:/);
        expect(benefit).not.toMatch(/LucidePhone|LucideCalendarDays/);
    });

    it("혜택 탭이 쓰는 아이콘은 들여온 것과 같다 — 안 쓰는 import 가 남지 않는다", () => {
        const imported = (benefit.match(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        expect(imported).toEqual(["LucideInfo"]);
        for (const name of imported) expect(benefit.split(`<${name}`).length, name).toBeGreaterThan(1);
    });

    it("휘트니스 분기의 종목별 값(운영시간·휴장일)은 그대로 자료에서 그린다", () => {
        const fitness = benefit.slice(benefit.indexOf("if (data.category === 'Fitness') {"), benefit.indexOf("<FAQSection />"));
        expect(fitness).toContain("{data.clubInfo?.operatingHours || '-'}");
        expect(fitness).toContain("{data.clubInfo?.closedDays || '-'}");
        expect(benefit.match(/<FAQSection \/>/g)).toHaveLength(2);
    });

    it("머리에 선정 배지가 없고 지역 표시는 남아 있다", () => {
        expect(hero).not.toMatch(/LucideCrown|Rankue60/i);
        expect(hero).toContain("{data.region}");
        const imported = (hero.match(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/)?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        expect(imported).toEqual(["LucideStar", "LucideCamera"]);
        for (const name of imported) expect(hero.split(`<${name}`).length, name).toBeGreaterThan(1);
    });

    it("전화 링크는 하단 단추 한 곳에만 있다", () => {
        expect(SCREEN_FILES.filter((f) => /tel:/.test(code(f)))).toEqual(["components/membership/MembershipActionFooter.tsx"]);
    });
});

describe("문구와 자료 날짜", () => {
    it("탭은 '시세', 상세 단추는 '시세 보기'", () => {
        expect(code("components/membership/MembershipTabs.tsx")).toContain("{ id: 'MARKET', label: '시세' }");
        expect(code("pages/MembershipDetail.tsx")).toMatch(/>시세 보기</);
    });

    it("날짜는 값이 있을 때만 그린다 — 상세·목록", () => {
        expect(code("pages/MembershipDetail.tsx")).toMatch(/\{hybridData\.priceAsOfLabel && \(/);
        expect(code("pages/MembershipExchange.tsx")).toMatch(/\{PRICE_AS_OF_LABEL && filteredResaleList\.length > 0 && \(/);
        expect(code("hooks/useMembershipData.ts")).toContain("priceAsOfLabel: membershipAsOfLabel()");
    });

    it("membershipAsOfLabel — 날짜 모양일 때만 문구를 만든다", () => {
        expect(membershipAsOfLabel("2026-02-15")).toBe("2026.02.15 자료 기준");
        for (const v of [null, "", "2026-2-5", "어제", "2026.02.15"]) expect(membershipAsOfLabel(v), String(v)).toBeNull();
    });

    it("자료 날짜는 지어낸 값이 아니다 — 자료 파일 머리말의 생성 시각(한국 날짜)과 같다", () => {
        // 자료를 다시 만들었는데 날짜를 안 바꾸면 여기서 걸린다. 머리말을 못 읽으면 날짜도 없어야 한다(null).
        const stamp = read("data/crawledMembershipData.ts").slice(0, 400).match(/^\/\/ Date: (\S+)/m)?.[1];
        const made = stamp ? new Date(stamp) : null;
        const kstDay = made && !Number.isNaN(made.getTime()) ? new Date(made.getTime() + 9 * 3_600_000).toISOString().slice(0, 10) : null;
        expect(MEMBERSHIP_DATA_DATE).toBe(kstDay);
        expect(membershipAsOfLabel()).toBe(kstDay ? `${kstDay.replace(/-/g, ".")} 자료 기준` : null);
    });
});
