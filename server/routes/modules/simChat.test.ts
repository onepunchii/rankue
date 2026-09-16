import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { canReadChat } from "./simMatch";

const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
/** 주석은 빼고 본다 — 규칙을 설명하는 주석이 규칙을 지킨 것처럼 보이면 안 된다. */
const code = (f: string) => read(f).split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");

describe("채팅을 읽을 수 있는 사람", () => {
    const m = { hostId: "h", guestId: "g" };

    it("두 선수만 읽고 쓴다", () => {
        expect(canReadChat(m, "h")).toBe(true);
        expect(canReadChat(m, "g")).toBe(true);
    });

    it("관전자는 안 된다 — 신고·차단을 이번에 안 만든 근거가 이 한 줄이다", () => {
        expect(canReadChat(m, "watcher")).toBe(false);
        expect(canReadChat({ hostId: "h", guestId: null }, "watcher")).toBe(false);
    });

    it("채팅 라우트는 isWatchable 을 쓰지 않는다 — 샷 라우트와 일부러 다르다", () => {
        const src = code("server/routes/modules/simMatch.ts");
        // /chats 와 /chat 라우트 블록만 잘라 본다(다음 라우트 선언 전까지)
        for (const marker of ['router.get("/sim/matches/:id/chats"', 'router.post("/sim/matches/:id/chat"']) {
            const i = src.indexOf(marker);
            expect(i, `${marker} 라우트가 없다`).toBeGreaterThan(-1);
            const block = src.slice(i, src.indexOf("router.", i + marker.length));
            expect(block).toContain("canReadChat");
            expect(block).not.toContain("isWatchable");
        }
    });
});

/**
 * 폴링 카운터의 **키 이름**. 서버와 클라이언트가 다른 이름을 쓰면 아무 오류 없이 기능만 죽는다 —
 * parseMatch 가 화이트리스트라 모르는 키를 조용히 버리고, 카운터가 늘 0 이라 /chats 를 한 번도 안 부른다.
 * 화면에는 내가 보낸 줄만 보이고 상대 말은 영영 안 온다. QA 에서도 "상대가 말을 안 하네"로 읽힌다.
 */
describe("채팅 카운터 키 이름이 서버·클라이언트에서 같다", () => {
    it("publicMatch 가 chatSeq 를 싣고 parseMatch 가 raw.chatSeq 를 읽는다", () => {
        expect(code("server/routes/modules/simMatch.ts")).toContain("chatSeq: myIndex >= 0");
        expect(code("client/src/sim/matchApi.ts")).toContain("raw.chatSeq");
    });
});

/**
 * 한마디를 보냈다고 40초 시계가 다시 시작되거나 상대 화면이 스냅되면 안 된다.
 * sendChat 이 대전 행의 그 컬럼들을 건드리지 않는지 소스로 확인한다(DB 없이 도는 검사).
 */
describe("sendChat 은 경기 상태를 건드리지 않는다", () => {
    it("version·lastShotAt·turnSeenAt·emoji 를 쓰지 않는다", () => {
        const src = code("server/storage/simMatch.repo.ts");
        const i = src.indexOf("async sendChat(");
        expect(i).toBeGreaterThan(-1);
        const block = src.slice(i, src.indexOf("\n    async ", i + 20));
        for (const banned of ["version", "lastShotAt", "turnSeenAt", "emojiCode", "emojiAt", "emojiFrom"]) {
            expect(block, `sendChat 이 ${banned} 를 건드린다`).not.toContain(banned);
        }
        // 대신 채팅 카운터만 올린다
        expect(block).toContain("chatSeq: seq");
    });
});
