import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const read = (f: string) => readFileSync(path.resolve(process.cwd(), f), "utf8");
/** 주석은 빼고 본다 — 규칙을 설명하는 주석이 규칙을 지킨 것처럼 보이면 안 된다. */
const code = (f: string) => read(f).split("\n").filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*")).join("\n");

const CARDS = ["match-invite", "sim-invite", "game-result", "store", "my-stats", "golf-booking", "golf-match", "golf-round"];

/**
 * 채팅 카드는 서버만 만든다(2026-09-23). 화면이 metadata 를 보내는 길은 없고, 카드 라우트마다 방 접근·종목 검사와
 * 응답 전 푸시(서버리스)가 있어야 한다 — 라우트 하나가 빠지면 아무 오류 없이 가짜 카드나 알림 유실이 된다.
 */
describe("채팅 카드 라우트", () => {
    const src = code("server/routes/modules/chatCards.ts");

    it("여덟 종류가 모두 있고 각각 openRoom 을 거친다", () => {
        for (const c of CARDS) {
            const marker = `router.post("/rooms/:key/cards/${c}"`;
            const i = src.indexOf(marker);
            expect(i, `${c} 라우트가 없다`).toBeGreaterThan(-1);
            const block = src.slice(i, src.indexOf("router.post(", i + marker.length) === -1 ? undefined : src.indexOf("router.post(", i + marker.length));
            expect(block, `${c} 가 openRoom 을 안 거친다`).toContain("await openRoom(req, res,");
            expect(block, `${c} 가 postCard 로 끝나지 않는다`).toContain("return postCard(res, room,");
        }
    });

    it("종목 검사 — 당구 카드는 BILLIARDS, 골프 카드는 GOLF, 내 기록만 ANY", () => {
        const want = (c: string) => {
            const i = src.indexOf(`router.post("/rooms/:key/cards/${c}"`);
            return /await openRoom\(req, res, "([A-Z]+)"\)/.exec(src.slice(i))?.[1];
        };
        for (const c of ["match-invite", "sim-invite", "game-result", "store"]) expect(want(c), c).toBe("BILLIARDS");
        for (const c of ["golf-booking", "golf-match", "golf-round"]) expect(want(c), c).toBe("GOLF");
        expect(want("my-stats")).toBe("ANY");
    });

    it("카드 행은 type 'card' 로 저장하고 응답 전에 방 사람들에게 푸시한다", () => {
        expect(src).toContain('type: "card"');
        expect(src).toContain("await notifyRoom(ref, me.id, opts?.push ?? summary.slice(0, 80), heading, room.sport, opts?.url)");
        // 푸시 제목은 종류별 사전 키(받는 사람 언어로 풀린다)
        expect(src).toContain("msg(`notif.chat.card.${type}`");
    });

    it("보내기 라우트는 여전히 metadata 를 받지 않는다 — 카드는 이 파일에서만 생긴다", () => {
        const chat = code("server/routes/modules/chat.ts");
        const i = chat.indexOf('router.post("/rooms/:key/messages"');
        const block = chat.slice(i, chat.indexOf("router.", i + 10));
        expect(block).toContain('type: "text"');
        expect(block).not.toContain("metadata");
        expect(chat).toContain("export async function notifyRoom(");
    });

    it("남의 경기·남의 기록은 막힌다", () => {
        expect(src).toContain('sendError(res, 403, "err.chat.card.notYourGame"');
        expect(src).toContain("h.memberId !== room.me.id");
    });

    it("대전 방 만들기는 simMatch.ts 의 한 함수를 같이 쓴다(기본값이 갈라지지 않게)", () => {
        expect(src).toContain("createHostMatch(me.id, simCreateSchema.parse(");
        const sim = code("server/routes/modules/simMatch.ts");
        expect(sim).toContain("export async function createHostMatch(");
        expect(sim).toContain("export const createSchema");
    });

    it("라우터는 /chat 아래에 붙는다", () => {
        const idx = code("server/routes/index.ts");
        expect(idx).toContain('router.use("/chat", chatCardsRouter)');
    });
});

describe("2026-09-23 리뷰로 잠근 것", () => {
    const src = read("server/routes/modules/chatCards.ts");
    it("온라인 대전: 비밀번호 방은 재사용하지 않고, 푸시는 참가 화면으로 바로 간다", () => {
        // 비밀번호 방을 재사용하면 카드에는 코드만 실려 받는 사람이 한 번에 못 들어온다.
        expect(src).toContain("!x.passwordHash");
        expect(src).toContain('url: `/online-game?join=${encodeURIComponent(code)}&auto=1${m.handicap ? "" : "&same=1"}`');
    });
    it("랭큐매치 핀은 살아 있는 내 세션을 다시 쓴다 — 새로 만들면 '진행 중 라운드' 가 빈 방으로 바뀐다", () => {
        expect(src).toContain("getActiveGolfMatch(room.me.id)");
    });
    it("푸시 본문은 사전 키로 — 요약을 그대로 쓰면 외국어 회원에게 한국어가 박힌다", () => {
        for (const k of ["body.SIM_INVITE.", "body.GAME_RESULT.", "body.MY_STATS", "body.STORE", "body.GOLF_BOOKING.", "body.GOLF_MATCH", "body.GOLF_ROUND"]) {
            expect(src).toContain(`notif.chat.card.${k}`);
        }
    });
});

describe("온라인 대전 — 고른 설정(2026-09-23 오너: 대대·중대·핸디전 선택)", () => {
    const src = read("server/routes/modules/chatCards.ts");
    it("종목·테이블·핸디전이 다르면 옛 방을 다시 쓰지 않는다", () => {
        expect(src).toContain("(!wantTable || x.tableId === wantTable)");
        expect(src).toContain("(wantHandi === undefined || x.handicap === wantHandi)");
    });
    it("테이블 기본값은 화면과 같다 — 4구를 늘 대대로 만들지 않는다", () => {
        expect(src).toContain('wantTable ?? (gameType === "3c" ? "DAEDAE" : "JUNGDAE_KR")');
    });
    it("같은 점수 방은 링크에 same=1 — 들어오는 쪽이 자기 다마수를 안 보낸다", () => {
        expect(src).toContain('"&same=1"');
        const page = read("client/src/sim/SimulatorPage.tsx");
        expect(page).toContain('const sameTarget = params.get("same") === "1";');
        expect(page).toContain("sameTarget ? undefined :");
    });
});

describe("크루 방 카드 — 정모·투표·공지(2026-09-26 크루 채팅 1단계)", () => {
    const src = code("server/routes/modules/chatCards.ts");
    const block = (c: string) => {
        const i = src.indexOf(`router.post("/rooms/:key/cards/${c}"`);
        const j = src.indexOf("router.post(", i + 10);
        return src.slice(i, j === -1 ? undefined : j);
    };
    it("크루 방에서만 열리고, 그 크루의 것만 붙는다", () => {
        expect(src).toContain('parseRoomKey(String(req.params.key ?? ""))?.kind !== "crew"');
        for (const c of ["crew-meetup", "crew-poll", "crew-notice"]) {
            const b = block(c);
            expect(b, c).toContain("await openCrewRoom(req, res)");
            expect(b, c).toContain("return postCard(res, room,");
            expect(b, c).toMatch(/\.crewId !== room\.ref\.id/);
        }
    });
    it("공지는 운영진만, 공지 글만", () => {
        const b = block("crew-notice");
        expect(b).toContain("if (!room.info.canManage)");
        expect(b).toContain("!post.isNotice");
    });
    it("방금 만든 정모·투표는 카드 푸시를 건너뛴다(만들 때 크루 알림이 이미 갔다)", () => {
        expect(src).toContain("if (!opts?.silent) await notifyRoom(");
        expect(block("crew-meetup")).toContain("silent: isFresh(a.createdAt, a.creatorId, room.me)");
        expect(block("crew-poll")).toContain("silent: isFresh(poll.createdAt, poll.authorId, room.me)");
        expect(block("crew-notice")).not.toContain("silent");
    });
    it("화면이 부르는 경로와 그리는 종류가 서버와 같다", () => {
        const page = read("client/src/pages/hiq/chat-room.tsx");
        for (const c of ["crew-meetup", "crew-poll", "crew-notice"]) expect(page).toContain(`"${c}"`);
        const card = read("client/src/components/hiq/chat/ChatCard.tsx");
        for (const k of ["CREW_MEETUP", "CREW_POLL", "CREW_NOTICE"]) {
            expect(src).toContain(`"${k}"`);
            expect(card).toContain(`case "${k}":`);
        }
    });
    it("푸시 사전 키가 다섯 언어에 다 있다", () => {
        for (const l of ["ko", "en", "es", "tr", "vi"]) {
            const dict = read(`shared/i18n/${l}.ts`);
            for (const k of ["CREW_MEETUP", "CREW_POLL", "CREW_NOTICE"]) {
                expect(dict, `${l} ${k}`).toContain(`"notif.chat.card.${k}"`);
                expect(dict, `${l} body ${k}`).toContain(`"notif.chat.card.body.${k}"`);
            }
        }
    });
});
