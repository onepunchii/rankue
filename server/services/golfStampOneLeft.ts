/**
 * 도장첩 '한 곳 남음' 알림(2026-10-12) — 무엇을 · 언제 알리는지는 shared/golfStampOneLeft 가 정하고, 여기는 보내기만 한다.
 *
 * 부르는 곳: golf.repo syncStampAwards(라운드를 끝낼 때 · 늦은 현장 인증으로 도장이 생길 때). 한 칸 남은 권이 없으면 부르지도 않는다.
 * 한 번만: 알림함에 남긴 params.reminderKey('stamp-one-left:<권>')로 본다. 알림함은 7일 뒤 지워지지만
 *   알릴 수 있는 창이 24시간이라(그 권의 마지막 도장이 그 안) 그 사이에 두 번 가지 않는다.
 * 밤(한국 21~08시): 기기를 울리지 않고 알림함에만 — 골프 알림의 조용한 시간과 같다(shared/golfPushQuiet).
 * 설정: type GOLF_STAMP → 골프 소식 칸. 끈 사람은 알림함에만 남는다(sendAndSaveNotification 이 가른다).
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import { isGolfQuietHour } from "../../shared/golfPushQuiet.js";
import type { DatedStamp } from "../../shared/golfStampAwards.js";
import { ONE_LEFT_TYPE, oneLeftFresh, oneLeftKey, oneLeftNotice, stampOneLeft } from "../../shared/golfStampOneLeft.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const textArray = (xs: readonly string[]) => `{${xs.map((x) => `"${x.replace(/["\\]/g, "")}"`).join(",")}}`;

export interface OneLeftResult { pushed: number; inboxOnly: number; already: number }

export async function notifyStampOneLeft(memberId: string, stamps: readonly DatedStamp[], nowMs = Date.now()): Promise<OneLeftResult> {
    const out: OneLeftResult = { pushed: 0, inboxOnly: 0, already: 0 };
    const fresh = oneLeftFresh(stampOneLeft(stamps), nowMs);
    // 흔한 길 — 알릴 것이 없으면 아무것도 읽지 않는다
    if (fresh.length === 0) return out;

    const keys = fresh.map((o) => oneLeftKey(o.bookId));
    const seen = new Set(rowsOf(await db.execute(sql`
        select params->>'reminderKey' as k from hiq_notifications
        where member_id::text = ${memberId} and type = ${ONE_LEFT_TYPE} and params->>'reminderKey' = any(${textArray(keys)}::text[])`)).map((r) => String(r.k)));

    const quiet = isGolfQuietHour(nowMs);
    for (const o of fresh) {
        const key = oneLeftKey(o.bookId);
        if (seen.has(key)) { out.already++; continue; }
        const t = oneLeftNotice(o);
        const base = { memberId, title: t.title, body: t.body, category: "GOLF", type: ONE_LEFT_TYPE, params: { url: t.url, reminderKey: key, book: o.bookId, slot: o.slotKey } };
        if (quiet) { await storage.createNotification({ ...base, isRead: false }); out.inboxOnly++; }
        else { await notificationService.sendAndSaveNotification(base); out.pushed++; }
    }
    return out;
}
