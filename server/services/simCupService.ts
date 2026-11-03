/**
 * 월대회의 굴림과 알림(2026-10-12 오너 "추천대로" · 2026-11-03 운영자가 여는 대회로). 저장소(storage/simCup.repo)가 "무슨 일이 났나"를 돌려주면 여기서 알린다.
 *  - publishAndAnnounce: 운영자가 대회를 열면 출전자에게 대진이 나왔다고 알린다.
 *  - rollCups: 치르는 중인 대회를 지금 시각까지 굴린다 — 대진 화면 · 대기실 · 대회 판이 끝난 화면 · 크론(10분마다). 몇 번 불러도 알림은 한 번이다.
 *  - remindDue: 경기가 하루 안으로 다가온 판의 두 사람에게 한 번 · callDue: 입장 시간이 열린 판의 두 사람에게 한 번(크론).
 *  - notifySchedule: 운영자가 경기 시각을 정하거나 바꾸면 그 판의 두 사람에게.
 * 시각은 알림에 적지 않는다 — 해외 회원이 있어 시간대가 갈린다. 대진표가 기기 시각으로 보여 준다.
 * 알림은 '내가 뛰는 대전' 묶음(pref sim)으로 나간다. 누르면 대진 화면(/online-game?cup=1). 알림이 실패해도 대진은 이미 적혔다 — 여기서 던지지 않는다.
 */
import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import { msg, type I18nText } from "../lib/i18n.js";
import { cupLosers } from "../../shared/simCup.js";
import type { CupGameRow, CupSyncEvents } from "../storage/simCup.repo.js";

export const CUP_URL = "/online-game?cup=1";

async function send(memberId: string | null | undefined, title: string | I18nText, body: string | I18nText): Promise<void> {
    if (!memberId) return;
    await notificationService.sendAndSaveNotification({ memberId, title, body, category: "BILLIARDS", type: "MATCH", pref: "sim", params: { url: CUP_URL } })
        .catch((e: unknown) => console.error("[CupNotify]", e));
}

async function namesOf(ids: readonly (string | null)[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const id of new Set(ids.filter((x): x is string => !!x))) {
        const m = await storage.getMemberById(id).catch(() => null);
        if (m?.name) out.set(id, String(m.name));
    }
    return out;
}

/** 한 판의 두 사람에게 — 본문에 서로의 이름 */
async function toBoth(games: readonly Pick<CupGameRow, "p1Id" | "p2Id">[], title: string, body: string): Promise<void> {
    const names = await namesOf(games.flatMap((g) => [g.p1Id, g.p2Id]));
    for (const g of games) {
        await send(g.p1Id, title, msg(body, { name: names.get(g.p2Id ?? "") ?? "" }));
        await send(g.p2Id, title, msg(body, { name: names.get(g.p1Id ?? "") ?? "" }));
    }
}

/** 굴리며 생긴 일을 알린다 */
export async function announce(ev: CupSyncEvents): Promise<void> {
    // 다음 상대가 정해졌다 — 두 사람 모두에게(시각이 이미 있으면 그 시각에, 없으면 운영자가 정하면 다시 알린다)
    await toBoth(ev.paired, "notif.cup.paired.title", "notif.cup.paired.body");
    // 기권으로 떨어진 사람 — 입장하지 않았다고 알린다(쳐서 진 사람은 끝난 화면에서 이미 안다)
    for (const g of ev.decided) {
        for (const l of cupLosers(g)) if (l.forfeit) await send(l.memberId, "notif.cup.out.title", "notif.cup.out.body");
    }
    // 대회가 끝났다 — 기권한 사람(위에서 알렸다)을 빼고 순위를 알린다
    for (const p of ev.finished ?? []) {
        if (p.forfeit) continue;
        await send(p.memberId, "notif.cup.done.title", msg(p.medal ? "notif.cup.done.medal" : "notif.cup.done.body", { place: p.place }));
    }
}

/** 치르는 중인 대회를 모두 굴린다. 하나가 실패해도 나머지는 굴린다 */
export async function rollCups(nowMs: number = Date.now()): Promise<{ cups: number; paired: number; decided: number; finished: number }> {
    const out = { cups: 0, paired: 0, decided: 0, finished: 0 };
    const ids = await storage.simCup.runningIds().catch((e: unknown) => { console.error("[cup running]", e); return [] as string[]; });
    for (const id of ids) {
        try {
            const ev = await storage.simCup.sync(id, nowMs);
            if (!ev) continue;
            out.cups++; out.paired += ev.paired.length; out.decided += ev.decided.length; out.finished += ev.finished ? 1 : 0;
            await announce(ev);
        } catch (e) { console.error("[cup sync]", id, e); }
    }
    return out;
}

/** 운영자가 대회를 열었다 — 출전자에게 대진이 나왔다고 알린다 */
export async function publishAndAnnounce(cupId: string, nowMs: number = Date.now()): Promise<{ ok: true; entrants: number } | { ok: false; why: string }> {
    const r = await storage.simCup.publish(cupId, nowMs);
    if ("ok" in r) return r;
    for (const memberId of r.entrants) await send(memberId, "notif.cup.open.title", msg("notif.cup.open.body", { n: r.cup.size }));
    // 부전승 등 열자마자 가려지는 칸을 굴린다(다음 칸에 앉힌다)
    await rollCups(nowMs).catch((e: unknown) => console.error("[cup roll]", e));
    return { ok: true, entrants: r.entrants.length };
}

/** 경기가 하루 안으로 다가온 판 — 두 사람에게 한 번 */
export async function remindDue(nowMs: number = Date.now()): Promise<number> {
    const games = await storage.simCup.dueReminders(nowMs);
    await toBoth(games, "notif.cup.remind.title", "notif.cup.remind.body");
    return games.length;
}

/** 입장 시간이 열렸다 — 두 사람에게 한 번 */
export async function callDue(nowMs: number = Date.now()): Promise<number> {
    const games = await storage.simCup.dueCalls(nowMs);
    await toBoth(games, "notif.cup.call.title", "notif.cup.call.body");
    return games.length;
}

/** 운영자가 이 판의 경기 시각을 정했다 · 바꿨다 — 두 사람이 정해졌을 때만 */
export async function notifySchedule(game: Pick<CupGameRow, "p1Id" | "p2Id">): Promise<void> {
    if (!game.p1Id || !game.p2Id) return;
    await toBoth([game], "notif.cup.schedule.title", "notif.cup.schedule.body");
}

/** 상대가 대기실에 들어왔다 — 아직 안 들어온 사람에게(처음 입장할 때 한 번) */
export async function notifyEntered(opponentId: string, name: string): Promise<void> {
    await send(opponentId, "notif.cup.waiting.title", msg("notif.cup.waiting.body", { name }));
}
