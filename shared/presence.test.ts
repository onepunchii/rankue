import { describe, it, expect } from "vitest";
import { pickArrivalsToShow, arrivalAction, PRESENCE_SAME_PERSON_MS, type PresenceArrival } from "./presence.js";

const a = (id: string, over: Partial<PresenceArrival> = {}): PresenceArrival => ({
    id, name: id, avatar: null, relation: "friend", sport: "BILLIARDS", crewId: null, crewName: null, openedAt: "2026-10-01T12:00:00Z", ...over,
});

describe("친구 접속 배너 고르기(2026-10-01)", () => {
    it("같은 사람은 6시간에 한 번", () => {
        const now = 1_000_000_000_000;
        expect(pickArrivalsToShow([a("m1")], { m1: now - 60_000 }, 0, now)).toHaveLength(0);
        expect(pickArrivalsToShow([a("m1")], { m1: now - PRESENCE_SAME_PERSON_MS - 1 }, 0, now)).toHaveLength(1);
    });
    it("앱을 한 번 여는 동안 3명까지", () => {
        const list = ["a", "b", "c", "d", "e"].map((x) => a(x));
        expect(pickArrivalsToShow(list, {}, 0, 0).map((x) => x.id)).toEqual(["a", "b", "c"]);
        expect(pickArrivalsToShow(list, {}, 2, 0).map((x) => x.id)).toEqual(["a"]);
        expect(pickArrivalsToShow(list, {}, 3, 0)).toHaveLength(0);
    });
    it("같은 사람이 두 줄로 와도 한 번", () => {
        expect(pickArrivalsToShow([a("m1"), a("m1", { relation: "crew" })], {}, 0, 0)).toHaveLength(1);
    });
    it("할 일 — 당구 친구는 대전 초대, 골프 친구는 1:1, 크루원은 크루 방", () => {
        expect(arrivalAction({ relation: "friend", sport: "BILLIARDS", crewId: null })).toBe("sim-invite");
        expect(arrivalAction({ relation: "friend", sport: "GOLF", crewId: null })).toBe("dm");
        expect(arrivalAction({ relation: "crew", sport: "GOLF", crewId: "c1" })).toBe("crew-chat");
    });
});
