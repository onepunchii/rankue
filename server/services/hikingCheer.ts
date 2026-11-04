/**
 * 산행 사진 응원 알림(2026-11-04 오너: "사진 응원 기능만 먼저 시행하자") — 응원을 받은 사람에게 한 통. 규칙은 shared/hikingPhotos(HIKING_CHEER_*).
 *
 *  · 같은 사람이 같은 사진에 보낸 응원은 **한 번만** 알린다(params.reminderKey) — 거뒀다 다시 눌러도 다시 가지 않는다.
 *  · 푸시는 30분에 한 번(HIKING_CHEER_PUSH_GAP_MIN) — 그 사이 것은 알림함에만 남긴다(사진 하나에 응원이 몰려도 휴대폰이 계속 울리지 않게).
 *  · 등산 알림함(category HIKING) · type COMMUNITY(알림 설정의 크루 · 커뮤니티 칸). 누르면 그 산의 '내 산행 사진'.
 * 보낸 사람의 이름은 사진에 적히는 이름과 같은 꼴(hikingPhotoCredit)이다. 실패는 부르는 쪽이 삼킨다 — 응원 자체는 막지 않는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import { photoPagePath } from "../storage/hikingPhotos.js";
import { HIKING_CHEER_PUSH_GAP_MIN, hikingCheerKey, hikingCheerNotice, hikingPhotoCredit } from "../../shared/hikingPhotos.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];

export async function notifyCheer(input: { photoId: string; cheererId: string; ownerId: string; mountainName: string | null; mountainSlug: string | null; count: number }): Promise<"sent" | "inbox" | "already"> {
    const key = hikingCheerKey(input.photoId, input.cheererId);
    const [dup] = rowsOf(await db.execute(sql`select 1 from hiq_notifications where member_id = ${input.ownerId}::uuid and params->>'reminderKey' = ${key} limit 1`));
    if (dup) return "already";
    const [recent] = rowsOf(await db.execute(sql`
        select 1 from hiq_notifications
        where member_id = ${input.ownerId}::uuid and params->>'cheer' = 'true' and coalesce(params->>'pushed', 'true') = 'true'
          and created_at > now() - make_interval(mins => ${HIKING_CHEER_PUSH_GAP_MIN}) limit 1`));
    const [who] = rowsOf(await db.execute(sql`select name from hiq_members where id = ${input.cheererId}::uuid`));
    const t = hikingCheerNotice(hikingPhotoCredit(who?.name ?? ""), input.mountainName, input.count);
    const ring = !recent;
    const base = {
        memberId: input.ownerId, title: t.title, body: t.body, category: "HIKING", type: "COMMUNITY",
        params: { url: photoPagePath({ mountainSlug: input.mountainSlug }) ?? "/hiking/album", reminderKey: key, cheer: true, pushed: ring },
    };
    if (ring) { await notificationService.sendAndSaveNotification(base); return "sent"; }
    await storage.createNotification({ ...base, isRead: false });
    return "inbox";
}
