/**
 * 월대회의 굴림과 알림(2026-10-12 오너 "추천대로"). 저장소(storage/simCup.repo)가 "무슨 일이 났나"를 돌려주면 여기서 알린다.
 *  - openAndAnnounce: 달 마감 뒤 대회를 열고 출전자에게 대진이 나왔다고 알린다(하루 한 번 도는 정리 작업).
 *  - rollCups: 치르는 중인 대회를 지금 시각까지 굴린다 — 대진 화면을 열 때 · 대회 판이 끝난 화면 · 매시 크론. 몇 번 불러도 알림은 한 번이다.
 *  - remindDue: 기한이 하루 안으로 남은 판의 두 사람에게 한 번 알린다(매시 크론).
 * 알림은 '내가 뛰는 대전' 묶음(pref sim)으로 나간다 — 방 열림 방송과 따로 끌 수 있다. 누르면 대진 화면(/online-game?cup=1).
 * 알림이 실패해도 대진은 이미 적혔다 — 여기서 던지지 않는다.
 */
import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import { msg, type I18nText } from "../lib/i18n.js";
import { cupLosers } from "../../shared/simCup.js";
import type { CupSyncEvents } from "../storage/simCup.repo.js";

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

/** 굴리며 생긴 일을 알린다 */
export async function announce(ev: CupSyncEvents): Promise<void> {
    const names = await namesOf([...ev.paired.flatMap((g) => [g.p1Id, g.p2Id])]);
    // 다음 상대가 정해졌다 — 두 사람 모두에게
    for (const g of ev.paired) {
        await send(g.p1Id, "notif.cup.paired.title", msg("notif.cup.paired.body", { name: names.get(g.p2Id ?? "") ?? "" }));
        await send(g.p2Id, "notif.cup.paired.title", msg("notif.cup.paired.body", { name: names.get(g.p1Id ?? "") ?? "" }));
    }
    // 기권으로 떨어진 사람 — 기한을 넘겼다고 알린다(쳐서 진 사람은 끝난 화면에서 이미 안다)
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

/** 달 마감 뒤 — 대회를 열고 출전자에게 알린다 */
export async function openAndAnnounce(nowMs: number = Date.now()): Promise<{ month: string; gameType: string; status: string; size: number; entrants: number }[]> {
    const opened = await storage.simCup.openCups(nowMs);
    for (const o of opened) {
        for (const memberId of o.entrants) await send(memberId, "notif.cup.open.title", msg("notif.cup.open.body", { n: o.cup.size }));
    }
    return opened.map((o) => ({ month: o.cup.month, gameType: o.cup.gameType, status: o.cup.status, size: o.cup.size, entrants: o.entrants.length }));
}

/** 기한이 하루 안으로 남은 판 — 두 사람에게 한 번 */
export async function remindDue(nowMs: number = Date.now()): Promise<number> {
    const games = await storage.simCup.dueReminders(nowMs);
    const names = await namesOf(games.flatMap((g) => [g.p1Id, g.p2Id]));
    for (const g of games) {
        await send(g.p1Id, "notif.cup.remind.title", msg("notif.cup.remind.body", { name: names.get(g.p2Id ?? "") ?? "" }));
        await send(g.p2Id, "notif.cup.remind.title", msg("notif.cup.remind.body", { name: names.get(g.p1Id ?? "") ?? "" }));
    }
    return games.length;
}

/** 상대가 대회 방에서 기다린다 */
export async function notifyWaiting(opponentId: string, hostName: string): Promise<void> {
    await send(opponentId, "notif.cup.waiting.title", msg("notif.cup.waiting.body", { name: hostName }));
}
