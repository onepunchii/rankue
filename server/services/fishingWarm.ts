/**
 * 낚시 공공자료 데우기(2026-10-17) — 매시 50분 크론(/api/cron/fishing-warm)과 어드민 '지금 받기'가 부른다.
 * 낚시지수 지도(전국 · 엿새 — 조과 저장이 그날의 바다를 여기서 읽는다)와 바다 특보를 받아 둔다. 낡지 않았으면 읽기만 한다.
 * 못 받은 것이 있으면 크론 실행 기록(hiq_cron_runs 'fishing_warm')에 한 줄 — 어드민 › 낚시 › 공공자료가 보여 준다.
 */
import { loadIndexAll } from "./fishingPort.js";
import { getSeaNow } from "./fishingSea.js";
import { recordCronRun, errorText } from "../storage/cronRuns.js";

export async function warmFishingFeeds(nowMs = Date.now()): Promise<{ index: boolean; sea: boolean; ms: number; skipped?: string }> {
    const t0 = Date.now();
    if (!process.env.DATA_GO_KR_KEY) return { index: false, sea: false, ms: 0, skipped: "DATA_GO_KR_KEY 없음" };
    try {
        // 낚시지수는 '새로 받았는가'로 본다 — 받다 실패해도 가진 낡은 지도가 돌아와 성공처럼 보였다(10/17 18:50: 한 쪽이 시간 초과였는데 기록이 없었다)
        const [idx, sea] = await Promise.all([loadIndexAll(nowMs).catch(() => ({ data: null, fresh: false, ageMs: null })), getSeaNow(nowMs).catch(() => null)]);
        const out = { index: idx.fresh && !!idx.data?.length, sea: !!sea, ms: Date.now() - t0 };
        if (!out.index || !out.sea) {
            const old = !out.index && idx.data?.length && idx.ageMs != null ? `(가진 지도는 ${Math.round(idx.ageMs / 3600_000)}시간 전 것)` : "";
            await recordCronRun("fishing_warm", false, { ...out, error: [!out.index && `낚시지수${old}`, !out.sea && "바다 특보"].filter(Boolean).join(" · ") + " 못 받음" });
        }
        return out;
    } catch (e) {
        await recordCronRun("fishing_warm", false, { error: errorText(e) });
        return { index: false, sea: false, ms: Date.now() - t0 };
    }
}
