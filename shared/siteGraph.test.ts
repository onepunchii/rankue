import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BRAND_GOLF_KO, BRAND_KO, SITE_APP, SITE_ORGANIZATION, SITE_VERIFICATION_META, SITE_WEBSITE, WR_TITLE_KO,
  golfRankingDesc, golfRankingPath, golfRankingTitle, golferDesc, golferTitle, umbPlayerDesc, umbPlayerTitle, worldRankingSeo,
} from "./siteGraph.js";

// 봇 홈(server/prerender.ts)은 정적 셸을 대체한다 — 셸의 @graph·소유확인 메타와 한 글자라도 다르면 여기서 깨진다(2026-09-24).
describe("client/index.html 과 같은 값", () => {
  const html = readFileSync(fileURLToPath(new URL("../client/index.html", import.meta.url)), "utf8");

  it("Organization·WebSite·MobileApplication", () => {
    const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    const graph = JSON.parse(m![1])["@graph"] as Array<Record<string, unknown>>;
    const byType = (t: string) => graph.find((n) => n["@type"] === t);
    expect(byType("Organization")).toEqual(SITE_ORGANIZATION);
    expect(byType("WebSite")).toEqual(SITE_WEBSITE);
    expect(byType("MobileApplication")).toEqual(SITE_APP);
  });

  it("WebSite 이름은 랭큐 하나(검색결과 사이트 이름)", () => {
    expect(SITE_WEBSITE.name).toBe("랭큐");
    expect(SITE_WEBSITE.alternateName).toEqual(["RANKUE", "랭큐 RANKUE"]);
  });

  it("소유확인 메타 3개", () => {
    const metas = [...html.matchAll(/<meta name="((?:naver|google)-site-verification)" content="([^"]+)"/g)].map((x) => ({ name: x[1], content: x[2] }));
    expect(metas).toEqual([...SITE_VERIFICATION_META]);
    expect(metas).toHaveLength(3);
  });
});

describe("브랜드 꼬리말", () => {
  it("당구는 | 랭큐, 골프는 | 랭큐 골프", () => {
    expect(WR_TITLE_KO).toBe("당구 세계랭킹 — UMB 공식 3쿠션 랭킹 | 랭큐");
    expect(BRAND_KO).toBe(" | 랭큐");
    expect(BRAND_GOLF_KO).toBe(" | 랭큐 골프");
  });
});

describe("세계랭킹 허브 제목·설명", () => {
  it("언어판마다 — 화면이 locale 로, 프리렌더가 ?lang= 로 같은 함수를 부른다", () => {
    expect(worldRankingSeo("ko")).toEqual({ title: WR_TITLE_KO, desc: expect.stringMatching(/^UMB 공식 3쿠션 세계랭킹을 매주 업데이트/) });
    expect(worldRankingSeo("en").title).toBe("Billiards World Ranking — Official UMB 3-Cushion Rankings | RANKUE");
    expect(worldRankingSeo("tr").title).toBe("Bilardo Dünya Sıralaması — Resmî UMB 3 Bant Sıralaması | RANKUE");
    // 언어판이 없는 언어(ja·zh)는 ko — 프리렌더도 ko 로 떨어진다
    expect(worldRankingSeo("ja")).toEqual(worldRankingSeo("ko"));
  });
});

describe("UMB 선수 제목·설명", () => {
  const cho = { category: "players" as const, playerName: "CHO Myung Woo", nativeName: "조명우", fed: "KR", rank: 1, points: 499, bestRank: 1, nationalRank: 1 };

  it("한국어 — 한글 이름 · 순위 · 점수, 영문은 설명으로", () => {
    expect(umbPlayerTitle("ko", cho)).toBe("조명우 3쿠션 세계랭킹 1위 · 499점 | 랭큐");
    expect(umbPlayerDesc("ko", cho)).toBe("조명우(CHO Myung Woo·대한민국) UMB 3쿠션 남자 세계랭킹 1위, 499점. 역대 최고 1위, 대한민국 선수 중 1위.");
  });

  it("한글 이름이 없으면 로마자 — 괄호가 겹치지 않고 국가는 한국어 이름", () => {
    const p = { category: "players" as const, playerName: "CATANO Huberney", nativeName: null, fed: "CO", rank: 23, points: 180, bestRank: 12, nationalRank: 2 };
    expect(umbPlayerTitle("ko", p)).toBe("CATANO Huberney 3쿠션 세계랭킹 23위 · 180점 | 랭큐");
    const d = umbPlayerDesc("ko", p);
    expect(d).toBe("CATANO Huberney(콜롬비아) UMB 3쿠션 남자 세계랭킹 23위, 180점. 역대 최고 12위, 콜롬비아 선수 중 2위.");
    expect(d).not.toMatch(/\)\s*\(/);
    expect(d).not.toContain("확인하세요");
  });

  it("여자·주니어는 부문을 넣고, 0점은 적지 않는다", () => {
    const p = { category: "juniors" as const, playerName: "KANG Michael", nativeName: null, fed: "US", rank: 1942, points: 0, bestRank: 1689 };
    expect(umbPlayerTitle("ko", p)).toBe("KANG Michael 3쿠션 주니어 세계랭킹 1942위 | 랭큐");
    expect(umbPlayerDesc("ko", p)).toBe("KANG Michael(미국) UMB 3쿠션 주니어 세계랭킹 1942위. 역대 최고 1689위.");
  });

  it("다른 언어판은 예전 문안 그대로(로마자 이름·| RANKUE)", () => {
    expect(umbPlayerTitle("en", cho)).toBe("CHO Myung Woo — 3-Cushion Billiards World Ranking No.1 | RANKUE");
    expect(umbPlayerDesc("en", cho)).toBe("CHO Myung Woo (KR) is No.1 in the official UMB 3-cushion men's world ranking with 499 points. Career best No.1. Weekly rank history and points by tournament on RANKUE.");
    expect(umbPlayerTitle("vi", cho)).toBe("CHO Myung Woo — BXH Bida 3 băng Thế giới hạng 1 | RANKUE");
    // 모르는 언어는 한국어
    expect(umbPlayerTitle("ja", cho)).toBe(umbPlayerTitle("ko", cho));
  });
});

describe("골프 랭킹 목록 제목·설명", () => {
  const row = (rank: number, playerName: string, country: string, nameKo: string | null = null) => ({ rank, playerName, nameKo, country });
  const owgr = [
    row(1, "Scottie Scheffler", "USA", "스코티 셰플러"), row(2, "Rory McIlroy", "NIR"), row(3, "Cameron Young", "USA"),
    ...Array.from({ length: 21 }, (_, i) => row(4 + i, `P${4 + i}`, "ENG")),
    row(25, "Tom Kim", "KOR", "김주형"),
    ...Array.from({ length: 30 }, (_, i) => row(26 + i, `Q${26 + i}`, "USA")),
  ];

  it("제목 — 투어 이름 순위 — 1위 이름 | 랭큐 골프", () => {
    expect(golfRankingTitle("ko", "owgr", owgr)).toBe("남자 세계 골프랭킹 순위 — 1위 스코티 셰플러 | 랭큐 골프");
    expect(golfRankingTitle("en", "owgr", owgr)).toBe("Men's World Golf Ranking — No.1 Scottie Scheffler | RANKUE");
    expect(golfRankingTitle("ko", "owgr", [])).toBe("남자 세계 골프랭킹 순위 | 랭큐 골프");
  });

  it("설명 — 기준일 · 1~3위 · 한국 선수 최고 순위(세계 랭킹만)", () => {
    expect(golfRankingDesc("ko", "owgr", "2026-09-21", owgr))
      .toBe("남자 세계 골프랭킹(OWGR) 9월 21일 기준 1위 스코티 셰플러·2위 Rory McIlroy·3위 Cameron Young, 한국 선수 최고 김주형 25위.");
    const allKo = [row(1, "A", "USA", "셰플러"), row(2, "B", "NIR", "매킬로이"), row(3, "C", "USA", "영"), row(14, "D", "KOR", "김시우")];
    expect(golfRankingDesc("ko", "owgr", "2026-09-21", allKo))
      .toBe("남자 세계 골프랭킹(OWGR) 9월 21일 기준 1위 셰플러·2위 매킬로이·3위 영, 한국 선수 최고 김시우 14위. 톱 50 매주 갱신.");
    expect(golfRankingDesc("en", "owgr", "2026-09-21", owgr))
      .toBe("Men's World Golf Ranking as of 2026-09-21: No.1 Scottie Scheffler, No.2 Rory McIlroy, No.3 Cameron Young; top Korean Tom Kim No.25. Top 50 updated weekly.");
  });

  it("톱 50 밖의 한국 선수는 말하지 않는다(목록에 없는 사실)", () => {
    const noKr = owgr.map((r) => (r.country === "KOR" ? { ...r, country: "ENG" } : r));
    const withLate = [...noKr, row(51, "Late Korean", "KOR", "늦은선수")];
    expect(golfRankingDesc("ko", "owgr", "2026-09-21", withLate)).not.toContain("한국 선수");
  });

  it("투어 랭킹(KPGA)은 한국 선수 절이 없고 대회마다 갱신", () => {
    const kpga = [row(1, "Jang Yubin", "KOR", "장유빈"), row(2, "Kim Minkyu", "KOR", "김민규"), row(3, "Lee Jaekyung", "KOR", "이재경")];
    expect(golfRankingDesc("ko", "kpga", "2026-09-22", kpga)).toBe("KPGA 코리안투어 9월 22일 기준 1위 장유빈·2위 김민규·3위 이재경. 톱 50 대회마다 갱신.");
  });

  it("100자를 넘으면 갱신 주기 꼬리를 뗀다", () => {
    const long = [row(1, "Scottie Scheffler", "USA"), row(2, "Rory McIlroy", "NIR"), row(3, "Cameron Young", "USA"), row(14, "Si Woo Kim", "KOR")];
    const d = golfRankingDesc("ko", "owgr", "2026-09-20", long);
    expect(d).toBe("남자 세계 골프랭킹(OWGR) 9월 20일 기준 1위 Scottie Scheffler·2위 Rory McIlroy·3위 Cameron Young, 한국 선수 최고 Si Woo Kim 14위.");
    expect(d.length).toBeLessThanOrEqual(110);
  });

  it("네 투어의 설명이 서로 다르다", () => {
    const tours = ["owgr", "rolex", "kpga", "klpga"] as const;
    const descs = tours.map((t) => golfRankingDesc("ko", t, "2026-09-21", owgr));
    expect(new Set(descs).size).toBe(4);
  });

  it("정본 주소 — owgr 은 맨 /golf-ranking", () => {
    expect(golfRankingPath("owgr")).toBe("/golf-ranking");
    expect(golfRankingPath("owgr", "en")).toBe("/golf-ranking?lang=en");
    expect(golfRankingPath("rolex")).toBe("/golf-ranking?tour=rolex");
    expect(golfRankingPath("rolex", "en")).toBe("/golf-ranking?tour=rolex&lang=en");
    expect(golfRankingPath("kpga", "vi")).toBe("/golf-ranking?tour=kpga");
  });
});

describe("골퍼 제목·설명", () => {
  const jang = { playerName: "Yubin Jang", nameKo: "장유빈", country: "KOR", rank: 1, points: 5210 };
  const young = { playerName: "Cameron Young", nameKo: null, country: "USA", rank: 3, points: 7.8512 };

  it("한국어 — 꼬리말은 | 랭큐 골프", () => {
    expect(golferTitle("ko", "kpga", jang)).toBe("장유빈 (Yubin Jang) — KPGA 코리안투어 1위 | 랭큐 골프");
    expect(golferTitle("ko", "owgr", young)).toBe("Cameron Young — 남자 세계 골프랭킹 3위 | 랭큐 골프");
    expect(golferTitle("ko", "owgr", { ...young, rank: null })).toBe("Cameron Young — 남자 세계 골프랭킹 | 랭큐 골프");
  });

  it("한국어 설명 — 괄호 하나, 포인트, 확인하세요 꼬리 없음", () => {
    expect(golferDesc("ko", "kpga", jang, 1)).toBe("장유빈(Yubin Jang·KOR) KPGA 코리안투어 1위, 시즌 포인트 5,210. 역대 최고 1위.");
    expect(golferDesc("ko", "owgr", young, 3)).toBe("Cameron Young(USA) 남자 세계 골프랭킹 3위, 평균 포인트 7.85. 역대 최고 3위.");
    expect(golferDesc("ko", "owgr", { ...young, rank: null, points: null }, 9)).toBe("Cameron Young(USA) 남자 세계 골프랭킹 선수. 역대 최고 9위.");
  });

  it("영어판은 로마자 이름만(이름이 두 번 나오지 않는다)", () => {
    expect(golferTitle("en", "kpga", jang)).toBe("Yubin Jang — KPGA Korean Tour No.1 | RANKUE");
    // ko·en 밖의 언어는 ko 로 떨어진다(프리렌더와 같은 규칙)
    expect(golferTitle("vi", "kpga", jang)).toBe(golferTitle("ko", "kpga", jang));
  });
});
