import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { splitChatLinks } from "./chatLinks";

const links = (t: string) => splitChatLinks(t).filter((p) => p.kind === "link").map((p) => (p as { href: string }).href);
const joined = (t: string) => splitChatLinks(t).map((p) => p.text).join("");

describe("splitChatLinks — 오너 글의 링크 조각", () => {
    it("이어 붙이면 원문 그대로다", () => {
        for (const t of ["", "링크 없음", "https://a.com", "앞 https://a.com/x?y=1#z 뒤", "(www.rankue.co.kr/golf), 그리고 https://b.kr."]) {
            expect(joined(t), t).toBe(t);
        }
    });

    it("http(s) · www. · 우리 주소(앞을 뺀 꼴)를 잡는다", () => {
        expect(links("가입은 https://www.rankue.co.kr/i/ABC 에서")).toEqual(["https://www.rankue.co.kr/i/ABC"]);
        expect(links("www.naver.com 보세요")).toEqual(["https://www.naver.com/"]);
        expect(links("rankue.co.kr/golf/stamps 열어 보세요")).toEqual(["https://rankue.co.kr/golf/stamps"]);
        expect(links("http://open.kakao.com/o/abc")).toEqual(["http://open.kakao.com/o/abc"]);
    });

    it("한글이 바로 붙어도 한글은 주소가 아니다 · 끝 문장부호와 짝 없는 괄호는 문장 쪽", () => {
        expect(links("https://a.com/x에서 받으세요")).toEqual(["https://a.com/x"]);
        expect(links("여기(https://a.com/x).")).toEqual(["https://a.com/x"]);
        expect(links("https://a.com/x!!")).toEqual(["https://a.com/x"]);
        expect(links("https://ko.wikipedia.org/wiki/A_(B)")).toEqual(["https://ko.wikipedia.org/wiki/A_(B)"]);
    });

    it("링크가 아닌 것 — 낱말 한가운데 · 점 없는 호스트 · 다른 스킴", () => {
        expect(links("me@rankue.co.kr/x")).toEqual([]);
        expect(links("abc.www.x")).toEqual([]);
        expect(links("https://localhost/x")).toEqual([]);
        expect(links("javascript:alert(1) data:text/html,x")).toEqual([]);
    });

    it("여러 개", () => {
        expect(links("https://a.com 그리고 https://b.com/c")).toEqual(["https://a.com/", "https://b.com/c"]);
    });
});

describe("화면 — 링크는 오너의 글(trusted)에만", () => {
    const room = readFileSync(path.resolve(process.cwd(), "client/src/components/hiq/chat/ChatRoom.tsx"), "utf8");
    it("말풍선은 trusted 일 때만 ChatText 로 그린다", () => {
        expect(room).toContain("m.trusted ? <ChatText text={m.message} pressAt={pressAtRef} mine={mine} /> : m.message");
    });
    it("서버가 trusted 를 붙이는 곳은 역할 super_admin 하나", () => {
        const repo = readFileSync(path.resolve(process.cwd(), "server/storage/chat.repo.ts"), "utf8");
        expect(repo).toContain('...(r.senderRole === "super_admin" ? { trusted: true as const } : {})');
    });
});
