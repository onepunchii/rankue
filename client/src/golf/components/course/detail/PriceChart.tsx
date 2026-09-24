/**
 * 회원권 시세 1년 차트(2026-09-24). 시세가 있는 골프장에서만 불린다(lazy) — recharts 를 첫 화면 번들에 싣지 않으려고.
 * 축은 없다. 처음·끝 날짜만 아래에 적고, 값은 눌러서(툴팁) 본다. 마지막 점에 점 하나.
 */
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { manwonText } from "@shared/golfCourse";
import type { PricePoint } from "@/golf/lib/courseApi";

const ym = (d: string) => d.slice(0, 7).replace("-", ".");
const ymd = (d: string) => { const [y, m, dd] = d.split("-"); return `${y}.${Number(m)}.${Number(dd)}`; };

function Tip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as PricePoint;
    return (
        <div className="rounded-lg bg-[#1C1C1C] border border-[#FFFFFF1F] px-2.5 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)]">
            <div className="text-[12px] text-[#FFFFFF80] tabular-nums">{ymd(p.d)}</div>
            <div className="text-[14px] font-semibold text-white tabular-nums">{manwonText(p.p)}</div>
        </div>
    );
}

export default function PriceChart({ data, color, id }: { data: PricePoint[]; color: string; id: string }) {
    const vals = data.map((x) => x.p);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = hi === lo ? Math.max(1, hi * 0.08) : (hi - lo) * 0.18;
    const last = data.length - 1;
    const grad = `pg-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
    // 가로축은 **날짜**다 — 이력은 1년 전엔 주 1회, 최근엔 매일이라 점 순번으로 그리면 최근 몇 주가 그래프 절반을 차지한다.
    const series = data.map((x) => ({ ...x, t: Date.parse(`${x.d}T00:00:00Z`) }));
    return (
        <div>
            <div className="h-[150px] -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                        <defs>
                            <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                                <stop offset="100%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis type="number" dataKey="t" domain={["dataMin", "dataMax"]} hide />
                        <YAxis hide domain={[lo - pad, hi + pad]} />
                        <Tooltip content={<Tip />} cursor={{ stroke: "#FFFFFF33", strokeDasharray: "3 3" }} />
                        <Area
                            type="monotone" dataKey="p" stroke={color} strokeWidth={2} fill={`url(#${grad})`} isAnimationActive={false}
                            dot={(p: any) => p.index === last
                                ? <circle key="last" cx={p.cx} cy={p.cy} r={4} fill={color} stroke="#0A0A0A" strokeWidth={2} />
                                : <g key={p.index} />}
                            activeDot={{ r: 4, fill: color, stroke: "#0A0A0A", strokeWidth: 2 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-1 flex justify-between text-[12px] text-[#FFFFFF4D] tabular-nums">
                <span>{ym(data[0].d)}</span><span>{ym(data[last].d)}</span>
            </div>
        </div>
    );
}
