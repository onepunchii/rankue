/**
 * 결과 화면의 도장 카드(2026-09-30 현장 인증) — 내 기록이 ✓ 현장 인증 도장인지 흐린 기록 도장인지, 왜 그런지 한 줄.
 *  - 기록 도장이어도 점수·평균은 그대로 남는다는 걸 같이 말한다.
 *  - 끝낸 뒤 30분 안이고 다시 해서 될 이유(위치 없음·멀었음)면 '지금 현장 확인' 단추 — 권한 창은 이 단추를 누를 때만.
 *  - 옛 기록(legacy)·내 기록이 없는 판(none: 18홀 미완성)은 그리지 않는다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { cn } from "@/lib/utils";
import type { OnSiteSummary } from "@shared/golfOnSite";
import { VERDICT_TEXT } from "../../lib/onSiteText";

/** 작은 도장 — 인증은 라임 이중 테두리, 기록은 흐린 점선 */
export function StampSeal({ onSite, size = 44 }: { onSite: boolean; size?: number }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "shrink-0 rounded-full flex items-center justify-center -rotate-12 font-bold",
                onSite ? "border-[3px] border-double border-[#8BE84A] text-[#9BEF5C] bg-[#64DD1714]" : "border-[1.5px] border-dashed border-[#FFFFFF4D] text-[#FFFFFF73]",
            )}
            style={{ width: size, height: size, fontSize: Math.round(size * (onSite ? 0.4 : 0.27)) }}
        >
            {onSite ? "✓" : "미인증"}
        </span>
    );
}

export function OnSiteStampNote({ summary, busy, onRetry }: { summary: OnSiteSummary | undefined; busy: boolean; onRetry: () => void }) {
    if (!summary || (summary.stamp !== "onsite" && summary.stamp !== "record")) return null;
    const ok = summary.stamp === "onsite";
    return (
        <section
            aria-label="여권 도장"
            className={cn("rounded-[1.5rem] px-5 py-4 ring-1 ring-inset", ok ? "bg-[#64DD1712] ring-[#64DD1733]" : "bg-[#FFFFFF06] ring-[#FFFFFF14]")}
        >
            <div className="flex items-center gap-3.5">
                <StampSeal onSite={ok} />
                <div className="flex-1 min-w-0">
                    <p className={cn("text-[15px] font-semibold", ok ? "text-[#9BEF5C]" : "text-[#FFFFFFCC]")}>{ok ? "현장 인증 도장" : "미인증"}</p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-[#FFFFFF8C] break-keep">
                        {ok
                            ? (summary.byCompanion ? "동반자 폰 위치로 현장이 확인됐어요" : VERDICT_TEXT.ok)
                            : `${VERDICT_TEXT[summary.reason ?? "no-checkin"]} · 점수·평균은 그대로 남고 도장만 흐리게 찍혀요`}
                    </p>
                </div>
            </div>
            {!ok && summary.retryUntil && (
                <div className="mt-3 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={onRetry}
                        disabled={busy}
                        className="shrink-0 h-10 px-4 rounded-full bg-[#FFFFFF14] text-[13.5px] font-semibold text-[#ffffff] active:bg-[#FFFFFF1F] disabled:opacity-60"
                    >
                        {busy ? "확인 중…" : "📍 지금 현장 확인"}
                    </button>
                    <span className="text-[12px] text-[#FFFFFF59] break-keep">끝낸 뒤 30분 안에만 돼요</span>
                </div>
            )}
        </section>
    );
}
