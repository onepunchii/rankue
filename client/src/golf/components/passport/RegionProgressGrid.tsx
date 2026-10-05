/**
 * 지역 정복 — 발자국 지도 아래 여섯 칸(2026-10-05 오너: "4번(지역 정복 지도)을 점과 합치자" → "응 순서대로" 3번).
 *
 * 예전엔 '지역 정복' 탭이 따로 있었고 큰 지도의 지역을 눌러 현황 시트를 열었다. 지도를 발자국 지도 하나로 합치면서
 * (가 본 지역이 지도에 칠해진다) 누르는 자리는 여기로 옮겼다 — 발자국 지도의 두드리기는 배지·확대가 이미 쓰고 있어서다.
 * 칸의 색이 지도의 칠과 같다: 가 본 지역은 라임, 20% 를 가 본 지역은 금색. 막대는 **금색까지** 얼마나 왔는지.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { MASTER_RATIO, regionChipColor, type RegionProgress } from "./regionProgress";

export function RegionProgressGrid({ regions, onPick }: { regions: readonly RegionProgress[]; onPick: (region: string) => void }) {
    // 골프장 수를 모르면(서버 응답 전·실패) 0/0 여섯 칸을 지어내지 않는다
    if (!regions.some((r) => r.total > 0)) return null;
    return (
        <section className="mt-5" aria-label="지역 정복">
            <div className="px-1 flex items-baseline justify-between gap-3">
                <h3 className="text-[14px] font-semibold text-[#FFFFFFCC]">지역 정복</h3>
                <p className="text-[12px] text-[#FFFFFF73]">{Math.round(MASTER_RATIO * 100)}% 가 보면 금색</p>
            </div>
            <ul className="mt-2 grid grid-cols-3 gap-2">
                {regions.map((r) => (
                    <li key={r.region} className="min-w-0">
                        <button
                            type="button"
                            onClick={() => onPick(r.region)}
                            aria-label={`${r.region} ${r.total}곳 중 ${r.visited}곳${r.mastered ? " · 금색 지역" : ""} — 정복 현황 보기`}
                            className="w-full min-w-0 rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] px-3 py-2.5 text-left active:bg-[#FFFFFF12]"
                        >
                            <span className="block text-[13px] font-semibold" style={{ color: regionChipColor(r) }}>{r.region}</span>
                            <span className="mt-0.5 block tabular-nums whitespace-nowrap leading-tight">
                                <span className="text-[18px] font-bold text-[#ffffff]">{r.visited}</span>
                                <span className="ml-1 text-[12px] text-[#FFFFFF73]">/ {r.total.toLocaleString()}</span>
                            </span>
                            <span aria-hidden="true" className="mt-2 block h-1 rounded-full bg-[#FFFFFF14] overflow-hidden">
                                <span className="block h-full rounded-full" style={{ width: `${r.visited ? Math.max(6, r.ratio * 100) : 0}%`, background: r.mastered ? "#FFD700" : "#64DD17" }} />
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
