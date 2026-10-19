/**
 * 바다 예보 — 고른 해역의 반나절(오늘 오후 · 내일 오전 …) 물결 · 바람 · 날씨(기상청 해상예보, 2026-10-17).
 * 2026-10-19 FishingPage 에서 떼어 냈다 — 지도 팝업(SeaPopup)과 특보 보기의 바다 시트가 같이 쓴다.
 * 물결 막대는 4m 를 꼭대기로 그 칸의 높은 값까지 — 점수가 아니라 예보 값 그대로다. 받지 못했으면 아무것도 그리지 않는다.
 * ⚠️ 리터럴 색만. 글자 12px 이상.
 */
import { useQuery } from "@tanstack/react-query";
import { FISHING_COLORS as C } from "@shared/fishing";
import { SEA_FCST_SOURCE, waveLevel, waveText, windDirText, windSpeedText, type SeaFcst } from "@shared/fishingSeaFcst";
import { windArrowDeg } from "@shared/windDir";

// 물결의 크기(점수 아님) — 잔잔 · 보통 · 높음. 오늘의 바다 색과 같은 뜻의 갈래(옅은 물빛 · 모래빛 · 산호빛)
const WAVE_TONE = {
    calm: { bar: "#8FB3C2", text: "#F3ECDD" },
    mid: { bar: "#F8DDB0", text: "#F8DDB0" },
    high: { bar: "#EE7B5B", text: "#F7B9A6" },
} as const;

/**
 * 바다 예보 — 고른 해역의 반나절(오늘 오후 · 내일 오전 …) 물결 · 바람 · 날씨(기상청 해상예보, 2026-10-17).
 * 물결 막대는 4m 를 꼭대기로 그 칸의 높은 값까지 — 점수가 아니라 예보 값 그대로다. 받지 못했으면 아무것도 그리지 않는다.
 */
export function SeaForecast({ area, inset = "3.5" }: { area: string; /** 감싼 상자의 좌우 여백 — 가로 줄을 그 끝까지 민다 */ inset?: "3.5" | "4" }) {
    const { data } = useQuery<SeaFcst | null>({ queryKey: ["/api/hiq/fishing/sea/forecast", area], staleTime: 10 * 60_000 });
    const slots = Array.isArray(data?.slots) ? data!.slots.slice(0, 6) : [];
    if (!slots.length) return null;
    return (
        <div className="mt-3" data-testid="fishing-sea-forecast">
            <p className="text-[12.5px]" style={{ color: C.sun }}>바다 예보 <span style={{ color: C.dim }}>· {SEA_FCST_SOURCE}{data?.issued ? ` ${data.issued} 발표` : ""}</span></p>
            <ul className={`${inset === "4" ? "-mx-4 px-4" : "-mx-3.5 px-3.5"} mt-2 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
                {slots.map((s) => {
                    const tone = WAVE_TONE[waveLevel(s)];
                    const h = Math.max(8, Math.min(100, ((s.waveMax ?? 0) / 4) * 100));
                    const lo = s.waveMin != null ? Math.max(0, Math.min(100, (s.waveMin / 4) * 100)) : 0;
                    const deg = windArrowDeg(s.windTo ?? s.windFrom);
                    return (
                        <li key={s.key} className="w-[118px] shrink-0 rounded-xl px-3 pb-2.5 pt-2.5" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="fishing-sea-slot">
                            <p className="text-[12.5px] font-semibold" style={{ color: C.foam }}>{s.label}</p>
                            <div className="mt-2 flex items-end gap-2">
                                {/* 물결 — 낮은 값~높은 값의 띠 */}
                                <span className="relative h-11 w-2.5 shrink-0 overflow-hidden rounded-full" style={{ background: "#FFFFFF14" }} aria-hidden>
                                    <span className="absolute inset-x-0 rounded-full" style={{ bottom: `${lo}%`, height: `${Math.max(8, h - lo)}%`, background: tone.bar }} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[12px]" style={{ color: C.dim }}>물결</span>
                                    <span className="block text-[17px] font-semibold tabular-nums leading-tight" style={{ color: tone.text }}>{waveText(s)}</span>
                                </span>
                            </div>
                            <p className="mt-2 flex items-center gap-1 text-[12px]" style={{ color: C.dim }}>
                                바람
                                {deg != null && (
                                    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden style={{ transform: `rotate(${deg}deg)` }} className="shrink-0">
                                        <path d="M8 14 V3 M4 7 L8 3 L12 7" fill="none" stroke={C.sun} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                            </p>
                            <p className="mt-0.5 truncate text-[12.5px]" style={{ color: C.soft }}>{windDirText(s) || "–"}</p>
                            <p className="truncate text-[13px] font-semibold tabular-nums" style={{ color: C.foam }}>{windSpeedText(s) || "–"}</p>
                            <p className="mt-1 truncate text-[12px]" style={{ color: s.rain ? "#8EC5FF" : C.dim }}>{s.wf || "–"}</p>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

