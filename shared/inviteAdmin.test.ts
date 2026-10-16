import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INVITE_BURST, inviteFlags } from "./inviteAdmin";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const NOW = Date.parse("2026-10-16T12:00:00Z");
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

describe("친구 초대 — 다시 볼 것", () => {
    it("가입하고 하루가 지나도 경기가 없으면 표시, 하루 안이면 아직 아니다", () => {
        expect(inviteFlags({ at: at(60 * 25), games: 0, withdrawn: false, siblingsAt: [] }, NOW).map((f) => f.id)).toEqual(["noPlay"]);
        expect(inviteFlags({ at: at(60 * 3), games: 0, withdrawn: false, siblingsAt: [] }, NOW)).toEqual([]);
        expect(inviteFlags({ at: at(60 * 25), games: 1, withdrawn: false, siblingsAt: [] }, NOW)).toEqual([]);
    });

    it("탈퇴한 사람은 '탈퇴'만 — 경기 없음과 겹쳐 적지 않는다", () => {
        expect(inviteFlags({ at: at(60 * 48), games: 0, withdrawn: true, siblingsAt: [] }, NOW).map((f) => f.id)).toEqual(["withdrawn"]);
    });

    it(`같은 사람의 초대가 한 시간 안에 ${INVITE_BURST.count}명을 넘으면 몰림 표시`, () => {
        const five = [0, 5, 10, 20, 30].map(at);
        expect(inviteFlags({ at: five[0], games: 3, withdrawn: false, siblingsAt: five }, NOW)).toEqual([]);
        const six = [...five, at(40)];
        const f = inviteFlags({ at: six[0], games: 3, withdrawn: false, siblingsAt: six }, NOW);
        expect(f.map((x) => x.id)).toEqual(["burst"]);
        expect(f[0].text).toContain("6명");
        // 두 시간 떨어진 초대는 세지 않는다
        expect(inviteFlags({ at: at(0), games: 3, withdrawn: false, siblingsAt: [at(0), ...[130, 140, 150, 160, 170].map(at)] }, NOW)).toEqual([]);
    });
});

describe("친구 초대 취소 — 표시만 하고 어디서도 세지 않는다", () => {
    it("마이그레이션은 칸을 더하기만 한다", () => {
        const body = read("migrations/invite_cancel.sql").split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
        expect(body.length).toBe(3);
        for (const l of body) expect(l).toMatch(/^alter table hiq_referrals add column if not exists \w+ (timestamptz|text);$/);
    });

    it("어드민은 줄을 지우지 않고 canceled_at 을 적는다", () => {
        const src = read("server/routes/modules/adminBilliards.ts");
        expect(src).not.toMatch(/delete from hiq_referrals/);
        expect(src).toMatch(/update hiq_referrals set canceled_at = now\(\)/);
        // 운영자가 증정한 물건은 거두지 않는다
        expect(src).toMatch(/hiq_goods_grants g where g\.member_id = \$\{inviter\}::uuid and g\.sport = 'billiards'/);
    });

    it("초대 수 · 단계 보상 · 한정 큐 고르기는 취소한 초대를 빼고 센다", () => {
        expect(read("server/routes/modules/invite.ts")).toMatch(/from hiq_referrals where inviter_id = \$\{memberId\}::uuid and canceled_at is null/);
        expect(read("server/storage/cueCase.repo.ts")).toMatch(/from hiq_referrals where inviter_id = \$\{memberId\}::uuid and canceled_at is null/);
    });

    it("취소된 사람도 '이미 초대로 셈'으로 남아 코드를 다시 넣지 못한다", () => {
        const src = read("server/routes/modules/invite.ts");
        expect(src).toMatch(/select 1 from hiq_referrals where invitee_id = \$\{me\}::uuid`/);
    });
});
