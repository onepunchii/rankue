import { describe, expect, it } from "vitest";
import {
    CHAT_CODES, CHAT_COOLDOWN_MS, CHAT_EXTRA_CODES, CHAT_MAX_CHARS, CHAT_MAX_PER_MATCH, CHAT_QUICK_CODES,
    chatLength, chatReject, clampChatText, isChatCode, normalizeChatText,
} from "./chat";
import { MATCH_EMOJIS } from "./rules/session";

const NOW = Date.UTC(2026, 8, 16, 12, 0, 0);
const at = (msAgo: number) => NOW - msAgo;

describe("글자 세기", () => {
    it("코드포인트로 센다 — 이모지 하나는 한 글자다", () => {
        const thumb = String.fromCodePoint(0x1f44d);
        expect(chatLength(thumb)).toBe(1);
        expect(thumb.length).toBe(2);              // 왜 직접 세는지 보여 주는 대조군
        expect(chatLength("나이스" + thumb)).toBe(4);
    });

    it("자르기도 코드포인트 기준 — 이모지가 반쪽으로 잘리지 않는다", () => {
        const thumb = String.fromCodePoint(0x1f44d);
        const cut = clampChatText("가".repeat(CHAT_MAX_CHARS - 1) + thumb + thumb);
        expect(chatLength(cut)).toBe(CHAT_MAX_CHARS);
        expect(cut.endsWith(thumb)).toBe(true);    // 서러게이트 반쪽이 남지 않았다
        expect(clampChatText("짧은 말")).toBe("짧은 말");
    });
});

describe("normalizeChatText", () => {
    it("줄바꿈·제어문자를 없애고 연속 공백을 한 칸으로 줄인다", () => {
        expect(normalizeChatText("아  깝다\n\n그거")).toBe("아 깝다 그거");
        expect(normalizeChatText("  앞뒤 공백  ")).toBe("앞뒤 공백");
        expect(normalizeChatText("탭\t사이")).toBe("탭 사이");
    });

    it("공백뿐이면 빈 문자열 — 라우트가 이걸로 빈 전송을 막는다", () => {
        expect(normalizeChatText("   \n  ")).toBe("");
    });
});

describe("고정 문구 목록", () => {
    it("상단 띠의 이모지 6개를 하나도 빠짐없이 담는다", () => {
        // 갈라지면 진행 중인 대전 행·옛 채팅 줄에 있는 코드가 화면에서 조용히 사라진다.
        for (const c of MATCH_EMOJIS) expect(CHAT_CODES).toContain(c);
    });

    it("급해서 타이핑할 수 없는 말만 더했다 — 자유 입력이 주 기능이다", () => {
        expect(CHAT_EXTRA_CODES).toEqual(["oops", "wait", "thanks"]);
        expect(CHAT_CODES).toHaveLength(MATCH_EMOJIS.length + CHAT_EXTRA_CODES.length);
        // 칩 열이 두 줄을 넘으면 테이블을 덮는다
        expect(CHAT_CODES.length).toBeLessThanOrEqual(10);
    });

    it("중복이 없다", () => {
        expect(new Set(CHAT_CODES).size).toBe(CHAT_CODES.length);
        expect(new Set(CHAT_QUICK_CODES).size).toBe(CHAT_QUICK_CODES.length);
    });

    it("패널에 그리는 여섯은 전부 서버가 받아 주는 코드다", () => {
        for (const c of CHAT_QUICK_CODES) expect(CHAT_CODES).toContain(c);
    });

    it("패널은 여섯 — 320px 두 줄이 상한이다(세 줄이면 당구대를 덮는다)", () => {
        expect(CHAT_QUICK_CODES).toHaveLength(6);
        // 새로 넣은 셋은 패널에서만 보낼 수 있으니 반드시 들어 있어야 한다
        for (const c of CHAT_EXTRA_CODES) expect(CHAT_QUICK_CODES).toContain(c);
    });
});

describe("isChatCode", () => {
    it("허용 목록에 있는 코드만 통과한다", () => {
        expect(isChatCode("nice", ["hi", "nice"])).toBe(true);
        expect(isChatCode("아무거나", ["hi", "nice"])).toBe(false);
        expect(isChatCode(42, ["hi"])).toBe(false);
    });
});

describe("chatReject", () => {
    const base = { status: "playing", turn: 1, from: 0 as const, kind: "text" as const, count: 0, lastMineAt: null, now: NOW };

    it("상대 차례면 보낼 수 있다", () => {
        expect(chatReject(base)).toBeNull();
    });

    it("내 차례엔 글을 못 쓴다 — 키보드가 조작을 덮고 40초가 도는 중이다", () => {
        expect(chatReject({ ...base, turn: 0 })).toBe("your-turn");
    });

    it("고정 인사는 내 차례에도 보낼 수 있다 — 키보드가 없다", () => {
        expect(chatReject({ ...base, turn: 0, kind: "code" })).toBeNull();
    });

    it("끝난 대전엔 못 쓴다", () => {
        expect(chatReject({ ...base, status: "finished" })).toBe("gone");
    });

    it("쿨다운은 **내** 마지막 전송만 본다 — 상대가 사이에 보내도 내 간격은 안 풀린다", () => {
        // 이모지 쿨다운의 버그가 정확히 이것이다: 대전 행에 마지막 발신자 하나만 두고
        // `emojiFrom === from` 일 때만 간격을 봐서, 상대가 끼어들면 내 쿨다운이 즉시 꺼졌다.
        const mineJustNow = { ...base, lastMineAt: at(500), lastAnyAt: at(500) };
        expect(chatReject(mineJustNow)).toBe("cooldown");
        // 상대가 내 뒤에 보냈다 — lastAnyAt 이 더 최근이지만 내 쿨다운은 그대로다
        expect(chatReject({ ...mineJustNow, lastAnyAt: at(100) })).toBe("cooldown");
        // 반대로 상대가 방금 보냈고 나는 오래전이면 나는 보낼 수 있다
        expect(chatReject({ ...base, lastMineAt: at(CHAT_COOLDOWN_MS + 1), lastAnyAt: at(100) })).toBeNull();
    });

    it("쿨다운 경계", () => {
        expect(chatReject({ ...base, lastMineAt: at(CHAT_COOLDOWN_MS - 1) })).toBe("cooldown");
        expect(chatReject({ ...base, lastMineAt: at(CHAT_COOLDOWN_MS) })).toBeNull();
    });

    it("대전당 상한은 폭주 계정용이라 정상 사용에선 안 걸린다", () => {
        expect(chatReject({ ...base, count: CHAT_MAX_PER_MATCH - 1 })).toBeNull();
        expect(chatReject({ ...base, count: CHAT_MAX_PER_MATCH })).toBe("limit");
        expect(CHAT_MAX_PER_MATCH).toBeGreaterThanOrEqual(50);
    });

    it("끝난 대전이 차례보다 먼저 판정된다 — 끝난 판에 '내 차례'는 의미가 없다", () => {
        expect(chatReject({ ...base, status: "finished", turn: 0 })).toBe("gone");
    });
});
