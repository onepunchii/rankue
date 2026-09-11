import { describe, it, expect } from "vitest";
import { isTermsAccepted, TERMS_MIN_VERSION, TERMS_VERSION } from "./terms";
import { TERMS_CONTENT, TERMS_CONTACT_EMAIL, termsLang } from "./termsContent";

// 약관 동의 판정 — 서버 문지기(requireTermsAccepted)와 화면 시트가 같은 함수를 쓴다.
describe("isTermsAccepted", () => {
    it("지금 버전에 동의했으면 통과", () => {
        expect(isTermsAccepted(TERMS_VERSION)).toBe(true);
    });

    it("동의 기록이 없거나 형식이 틀리면 미동의", () => {
        for (const v of [null, undefined, "", 20260911, "2026-9-11", "latest", " 2026-09-11"]) {
            expect(isTermsAccepted(v), String(v)).toBe(false);
        }
    });

    it("최소 버전보다 옛 동의는 무효 — 권리·의무가 바뀐 개정은 다시 묻는다", () => {
        expect(isTermsAccepted("2020-01-01")).toBe(false);
    });

    it("아직 없는 미래 버전은 거절 — 화면이 보낸 값으로 앞으로의 개정까지 미리 동의할 수 없다", () => {
        expect(isTermsAccepted("9999-12-31")).toBe(false);
    });

    it("최소 버전은 지금 버전보다 뒤일 수 없다(그러면 아무도 동의할 수 없다)", () => {
        expect(TERMS_MIN_VERSION <= TERMS_VERSION).toBe(true);
        expect(isTermsAccepted(TERMS_MIN_VERSION)).toBe(true);
    });
});

// 약관 원문 — 심사(App Store 1.2 · Play UGC) 근거 조항이 편집 중에 빠지지 않게 지킨다.
describe("TERMS_CONTENT", () => {
    const text = (lang: "ko" | "en") => {
        const d = TERMS_CONTENT[lang];
        return [d.intro, ...d.sections.flatMap((s) => [s.title, ...s.body.flat()]), d.effective].join("\n");
    };

    it("한국어본에 무관용·24시간 검토·삭제와 정지·신고·차단·계정 삭제·문의·준거법이 있다", () => {
        const ko = text("ko");
        for (const must of ["무관용", "24시간", "삭제", "이용을 정지", "신고", "차단", "계정 삭제", TERMS_CONTACT_EMAIL, "대한민국"]) {
            expect(ko, must).toContain(must);
        }
    });

    it("영어본에도 같은 조항이 있다", () => {
        const en = text("en");
        for (const must of ["zero tolerance", "24 hours", "removed", "suspended", "report", "Block", "Delete account", TERMS_CONTACT_EMAIL, "Republic of Korea"]) {
            expect(en, must).toContain(must);
        }
    });

    it("두 언어의 조항 수가 같다 — 한쪽만 고치고 다른 쪽을 잊지 않게", () => {
        expect(TERMS_CONTENT.en.sections.length).toBe(TERMS_CONTENT.ko.sections.length);
    });

    it("비공개 기능(골프)은 서비스 설명에 없다 — 오너 결정", () => {
        expect(text("ko")).not.toMatch(/골프/);
        expect(text("en").toLowerCase()).not.toContain("golf");
    });

    it("시행일 문구가 약관 버전 날짜와 맞다", () => {
        const [y, m, d] = TERMS_VERSION.split("-").map(Number);
        expect(TERMS_CONTENT.ko.effective).toContain(`${y}년 ${m}월 ${d}일`);
        expect(TERMS_CONTENT.en.effective).toContain(String(y));
    });
});

describe("termsLang", () => {
    it("한국어만 한국어본, 나머지 언어는 영어본", () => {
        expect(termsLang("ko")).toBe("ko");
        for (const l of ["en", "vi", "tr", "es", "", null, undefined]) expect(termsLang(l as any)).toBe("en");
    });
});
