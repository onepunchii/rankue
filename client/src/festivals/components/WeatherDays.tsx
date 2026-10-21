/**
 * 날씨 칸 줄(2026-10-21) — 기상청 예보의 하루하루(축제 날 · 둘레길 코스 시작점). 요일 · 그림 · 하늘 · 최고/최저 · 비 30% 이상이면 확률.
 * 주말 칸은 종목 색으로 옅게, 오늘은 테두리. 하루의 하늘은 shared/festivals festivalWeatherDays 가 정한다(비 낀 반나절이 이긴다).
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { WX_LABEL, type WxKind } from "@shared/golfWeather";
import { weekdayKo, type FestivalWxDay } from "@shared/festivals";
import { WxIcon, WX_RAIN } from "@/golf/components/course/TeeWx";

export function WeatherDays({ days, today, accent, soon, text, testId }: { days: readonly FestivalWxDay[]; today: string; accent: string; soon: string; text: string; testId?: string }) {
    if (!days.length) return null;
    return (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid={testId}>
            {days.map((d) => {
                const ymd = d.date.replace(/-/g, ""), wd = weekdayKo(ymd), weekend = wd === "토" || wd === "일";
                return (
                    <div key={d.date} className="w-[74px] shrink-0 rounded-2xl px-1.5 py-3 text-center" style={{ background: weekend ? `${accent}1F` : "#FFFFFF0A", boxShadow: ymd === today ? `inset 0 0 0 1.5px ${accent}` : undefined }}>
                        <div className="text-[12.5px] font-medium" style={{ color: weekend ? soon : `${text}B3` }}>{ymd === today ? "오늘" : `${wd} ${Number(ymd.slice(6, 8))}일`}</div>
                        <WxIcon kind={d.kind as WxKind} className="mx-auto mt-2 h-7 w-7" />
                        <div className="mt-1.5 text-[12.5px]" style={{ color: `${text}CC` }}>{WX_LABEL[d.kind as WxKind] ?? ""}</div>
                        {d.tmx != null && <div className="mt-1 text-[14px] font-semibold tabular-nums" style={{ color: text }}>{Math.round(d.tmx)}°<span className="ml-1 text-[12.5px] font-normal" style={{ color: `${text}80` }}>{d.tmn != null ? `${Math.round(d.tmn)}°` : ""}</span></div>}
                        {d.pop != null && d.pop >= 30 && <div className="mt-0.5 text-[12px] font-medium tabular-nums" style={{ color: WX_RAIN }}>비 {d.pop}%</div>}
                    </div>
                );
            })}
        </div>
    );
}
