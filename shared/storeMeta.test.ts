import { describe, expect, it } from "vitest";
import { storeDescKo, storeJsonLd, storeLocality, storeTitleKo } from "./storeMeta.js";

describe("매장 주소 → 시군구·동(2026-09-24)", () => {
    it("지번·도로명·광역시·긴 시도 표기", () => {
        expect(storeLocality("경기 화성시 남양읍 역골로 17 6층", "경기")).toEqual({ city: "화성시", gu: null, dong: "남양읍" });
        expect(storeLocality("경기 수원시 권선구 권선동 1297-5 6층", "경기")).toEqual({ city: "수원시", gu: "권선구", dong: "권선동" });
        expect(storeLocality("서울 동작구 상도동 358-1 3층", "서울")).toEqual({ city: "동작구", gu: null, dong: "상도동" });
        expect(storeLocality("대전 서구 갈마중로 12 (갈마동) 2층", "대전")).toEqual({ city: "서구", gu: null, dong: "갈마동" });
        expect(storeLocality("세종 아름서1길 23 (아름동)3층", "세종")).toEqual({ city: null, gu: null, dong: "아름동" });
        expect(storeLocality("전북특별자치도 전주시 덕진구 아중1길 16 3층", "전북")).toEqual({ city: "전주시", gu: "덕진구", dong: null });
    });
    it("건물 이름의 '상가'는 동이 아니고, 시도로 시작하지 않는 주소는 읽지 않는다", () => {
        expect(storeLocality("경남 김해시 가야로 12 (대성상가) 3층", "경남").dong).toBeNull();
        expect(storeLocality("아양로40", "대구")).toEqual({ city: null, gu: null, dong: null });
    });
});

describe("매장 제목·설명·구조화데이터", () => {
    it("제목에 동네 — 읍·면은 꼬리를 떼고, 광역시는 시도+구+동", () => {
        expect(storeTitleKo("캐롬 그라운드", "경기", "경기 화성시 남양읍 역골로 17 6층")).toBe("캐롬 그라운드 화성 남양 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("와우당구클럽", "부산", "부산 사하구 감천동 476-6 5층")).toBe("와우당구클럽 부산 사하구 감천동 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("상상당구클럽", "전북", "전북 부안군 부안읍 봉덕리 592-4 2층")).toBe("상상당구클럽 부안 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("Jy캐롬클럽", "대구", "아양로40")).toBe("Jy캐롬클럽 대구 당구장 — 요금·영업시간 | 랭큐");
        // 이름에 '당구장'이 있으면 한 번만
        expect(storeTitleKo("허슬러1 당구장", "서울", "서울 중구 초동 158-1 2층")).toBe("허슬러1 당구장 서울 중구 초동 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("코빌당구장", "인천", "인천 미추홀구 주안동 1-1")).toBe("코빌당구장 인천 미추홀구 주안동 — 요금·영업시간 | 랭큐");
        // 주소를 안 넘기면(프리렌더 현재 호출) 예전 꼴 그대로
        expect(storeTitleKo("캐롬 그라운드", "경기")).toBe("캐롬 그라운드 — 경기 당구장 요금·영업시간 | 랭큐");
    });
    it("이름이 길면 짧은 동네로 내려간다", () => {
        const addr = "인천 남동구 인주대로 524 (구월동) A동 2층";
        expect(storeTitleKo("정정당당캐롬클럽", "인천", addr)).toBe("정정당당캐롬클럽 인천 남동구 구월동 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("정정당당캐롬클럽 본점 2관", "인천", addr)).toBe("정정당당캐롬클럽 본점 2관 인천 남동구 당구장 — 요금·영업시간 | 랭큐");
        expect(storeTitleKo("정정당당캐롬클럽 구월 본점 2관", "인천", addr)).toBe("정정당당캐롬클럽 구월 본점 2관 인천 당구장 — 요금·영업시간 | 랭큐");
    });
    it("설명은 요금이 먼저, 고정 꼬리 문장 없음", () => {
        const d = storeDescKo("캐롬 그라운드", "경기 화성시 남양읍 역골로 17 6층", { rate10Large: 2500, tableLarge: 8 }, "10:00 ~ 05:00");
        expect(d).toBe("대대 10분당 2,500원 — 캐롬 그라운드, 경기 화성시 남양읍 역골로 17 6층. 영업시간 10:00 ~ 05:00. 테이블 대대 8.");
        expect(d).not.toContain("디렉토리");
        expect(storeDescKo("A당구장", "서울 동작구 상도동 1", {}, null)).toBe("A당구장, 서울 동작구 상도동 1.");
    });
    it("100자를 넘으면 주소의 괄호·건물·층을 뗀다", () => {
        const d = storeDescKo("사사당구장", "서울 마포구 월드컵로 196 (성산동) 대명 비첸시티 B102,103 지하1층", { rate10Large: 2000, rate10Medium: 1700 }, "11:00 ~ 23:30");
        expect(d).toBe("대대 10분당 2,000원 · 중대 10분당 1,700원 — 사사당구장, 서울 마포구 월드컵로 196. 영업시간 11:00 ~ 23:30.");
    });
    it("JSON-LD — locality 는 시·군·구, region 은 시·도", () => {
        const ld = storeJsonLd({ code: "C00007", name: "캐롬 그라운드", region: "경기", address: "경기 화성시 남양읍 역골로 17 6층" }) as any;
        expect(ld.address).toEqual({ "@type": "PostalAddress", streetAddress: "경기 화성시 남양읍 역골로 17 6층", addressLocality: "화성시", addressRegion: "경기", addressCountry: "KR" });
        const sj = storeJsonLd({ code: "C1", name: "B", region: "세종", address: "세종 도담동 675" }) as any;
        expect(sj.address.addressLocality).toBeUndefined();
        expect(sj.address.addressRegion).toBe("세종");
    });
});
