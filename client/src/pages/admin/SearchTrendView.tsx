/**
 * 어드민 · 검색 수요(2026-10-05 오너: "순서대로 하자"의 4번) — 네이버 검색어 트렌드로 "사람들이 무엇을 찾나"를 잰다.
 * 무엇을 만들지 정할 때 쓴다: 골프장에 날씨를 먼저 붙인 것도 이 숫자(날씨 100 · 맛집 30 · 그린피 3)에서 나왔다.
 *
 * 읽는 법이 중요해서 화면에 적어 둔다 — 값은 한 조회 안에서의 상대값이고, 따로 잰 결과끼리는 견줄 수 없다.
 * 견주려면 묶음을 한 번에 같이 넣는다(다섯 개까지). 묶음 하나의 검색어 여럿은 합쳐진다(띄어쓰기 다른 말을 한데).
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    TREND_MAX_GROUPS, TREND_MAX_KEYWORDS, TREND_PRESETS, courseSuffixGroups,
    type TrendGroup, type TrendGroupInput, type TrendMonths, type TrendResult, type TrendUnit,
} from "@shared/searchTrend";
import { FilterChips, Panel } from "./adminUtils";

type Row = { name: string; keywords: string };
const toRows = (gs: TrendGroupInput[]): Row[] => {
    const rows = gs.slice(0, TREND_MAX_GROUPS).map((g) => ({ name: g.name, keywords: g.keywords.join(", ") }));
    while (rows.length < TREND_MAX_GROUPS) rows.push({ name: "", keywords: "" });
    return rows;
};
const toGroups = (rows: Row[]): TrendGroupInput[] =>
    rows.map((r) => ({ name: r.name.trim(), keywords: r.keywords.split(/[,\n]/).map((k) => k.trim()).filter(Boolean).slice(0, TREND_MAX_KEYWORDS) })).filter((g) => g.keywords.length > 0);

/** 묶음마다 다른 색 — 막대와 선이 같은 색을 쓴다 */
const COLORS = ["#FF6B00", "#2563EB", "#16A34A", "#9333EA", "#DB2777"];
const periodLabel = (p: string, unit: TrendUnit) => (unit === "month" ? `${p.slice(2, 4)}.${p.slice(5, 7)}` : `${+p.slice(5, 7)}/${+p.slice(8, 10)}`);

/** 추이 — 묶음들을 한 눈금(0~그 조회의 최댓값)에 겹쳐 그린다 */
function TrendChart({ groups, colorOf, unit }: { groups: TrendGroup[]; colorOf: (name: string) => string; unit: TrendUnit }) {
    const periods = useMemo(() => [...new Set(groups.flatMap((g) => g.data.map((p) => p.period)))].sort(), [groups]);
    if (periods.length < 2) return null;
    const W = 640, H = 200, L = 30, R = 8, T = 10, B = 24;
    const max = Math.max(...groups.flatMap((g) => g.data.map((p) => p.ratio)), 1);
    const x = (i: number) => L + (i / (periods.length - 1)) * (W - L - R);
    const y = (v: number) => T + (1 - v / max) * (H - T - B);
    const step = Math.max(1, Math.ceil(periods.length / 8));
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="기간별 추이">
            {[0, 0.5, 1].map((f) => (
                <g key={f}>
                    <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="rgba(0,0,0,0.08)" />
                    <text x={L - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="rgba(0,0,0,0.4)">{Math.round(max * f)}</text>
                </g>
            ))}
            {periods.map((p, i) => (i % step === 0 || i === periods.length - 1) && (
                <text key={p} x={x(i)} y={H - 6} textAnchor={i === periods.length - 1 ? "end" : i === 0 ? "start" : "middle"} fontSize="10" fill="rgba(0,0,0,0.4)">{periodLabel(p, unit)}</text>
            ))}
            {groups.map((g) => {
                // 검색량이 0 인 구간은 응답에 없다 — 0 으로 채워야 선이 건너뛰지 않는다
                const by = new Map(g.data.map((p) => [p.period, p.ratio]));
                const pts = periods.map((p, i) => `${x(i).toFixed(1)},${y(by.get(p) ?? 0).toFixed(1)}`).join(" ");
                return <polyline key={g.name} points={pts} fill="none" stroke={colorOf(g.name)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />;
            })}
        </svg>
    );
}

export default function SearchTrendView() {
    const { toast } = useToast();
    const [rows, setRows] = useState<Row[]>(() => toRows(TREND_PRESETS[0].groups));
    const [months, setMonths] = useState<TrendMonths>(12);
    const [unit, setUnit] = useState<TrendUnit>("month");
    const [course, setCourse] = useState("");
    const [result, setResult] = useState<TrendResult | null>(null);
    // 색은 **재 본 그때의** 넣은 순서로 정한다 — 결과가 평균순으로 다시 줄을 서도, 그 뒤에 칸을 고쳐도 묶음의 색은 그대로
    const [order, setOrder] = useState<string[]>([]);

    const run = useMutation({
        mutationFn: async (groups: TrendGroupInput[]) => apiRequest("/api/hiq/admin/search-trend", { method: "POST", body: { groups, months, unit } }) as Promise<TrendResult>,
        onSuccess: (r, groups) => { setResult(r); setOrder(groups.map((g) => g.name || g.keywords[0].slice(0, 20))); },
        onError: (e: any) => toast({ title: e?.message || "불러오지 못했습니다", variant: "destructive" }),
    });
    const go = (gs?: TrendGroupInput[]) => {
        const groups = gs ?? toGroups(rows);
        if (!groups.length) { toast({ title: "검색어를 하나 이상 넣어 주세요", variant: "destructive" }); return; }
        run.mutate(groups);
    };
    const usePreset = (gs: TrendGroupInput[]) => { setRows(toRows(gs)); go(gs); };
    const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    const colorOf = (name: string) => COLORS[Math.max(0, order.indexOf(name)) % COLORS.length];

    return (
        <div className="space-y-4 max-w-[860px]">
            <div>
                <h2 className="text-[20px] font-black tracking-tight">검색 수요</h2>
                <p className="mt-1 text-[13px] text-black/55 leading-relaxed break-keep">
                    네이버에서 사람들이 무엇을 얼마나 찾는지 견줘 봅니다. 새 페이지나 기능을 정하기 전에 먼저 재 보세요.
                </p>
            </div>

            <Panel className="p-4 space-y-3">
                <div>
                    <p className="text-[12px] font-bold text-black/50 mb-1.5">자주 재 보는 묶음</p>
                    <div className="flex flex-wrap gap-1.5">
                        {TREND_PRESETS.map((p) => (
                            <button key={p.id} onClick={() => usePreset(p.groups)} disabled={run.isPending}
                                className="h-8 px-3 rounded-full text-[12.5px] font-bold bg-white border border-black/[0.08] text-black/65 hover:border-brand/40 disabled:opacity-50">
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="text-[12px] font-bold text-black/50 mb-1.5">골프장 하나 — 그 이름에 무엇을 붙여 찾나</p>
                    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const n = course.trim(); if (n) usePreset(courseSuffixGroups(n, n.replace(/(CC|GC|컨트리클럽|골프클럽)$/i, "").trim() !== n ? [n.replace(/(CC|GC|컨트리클럽|골프클럽)$/i, "").trim()] : [])); }}>
                        <Input value={course} onChange={(e) => setCourse(e.target.value)} placeholder="예: 레이크사이드CC" className="h-10 max-w-[260px]" />
                        <Button type="submit" variant="outline" disabled={run.isPending || !course.trim()} className="h-10">날씨·맛집·그린피·회원권·예약 견주기</Button>
                    </form>
                </div>
            </Panel>

            <Panel className="p-4 space-y-3">
                <p className="text-[12px] font-bold text-black/50">직접 넣기 — 묶음 다섯 개까지, 검색어는 쉼표로</p>
                <div className="space-y-2">
                    {rows.map((r, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} aria-hidden />
                            <Input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder={`묶음 ${i + 1} 이름`} className="h-10 w-[130px] shrink-0" maxLength={20} />
                            <Input value={r.keywords} onChange={(e) => setRow(i, { keywords: e.target.value })} placeholder="검색어, 검색어 (띄어쓰기 다른 꼴도 같이)" className="h-10 flex-1 min-w-0" />
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <FilterChips value={String(months) as "12" | "24" | "36"} onChange={(v) => setMonths(Number(v) as TrendMonths)}
                        options={[{ id: "12", label: "1년" }, { id: "24", label: "2년" }, { id: "36", label: "3년" }]} />
                    <FilterChips value={unit} onChange={setUnit} options={[{ id: "month", label: "달" }, { id: "week", label: "주" }]} />
                    <Button onClick={() => go()} disabled={run.isPending} className="h-10 ml-auto">{run.isPending ? "재는 중…" : "재 보기"}</Button>
                </div>
            </Panel>

            {result && (
                <Panel className="p-4 space-y-4">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[14px] font-black">기간 평균 — 가장 큰 묶음을 100 으로</p>
                        <p className="text-[11.5px] text-black/45 tabular-nums">{result.startDate} ~ {result.endDate}</p>
                    </div>
                    <ul className="space-y-2.5">
                        {result.groups.map((g) => (
                            <li key={g.name}>
                                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                                    <span className="font-bold truncate" title={g.keywords.join(", ")}>{g.name}</span>
                                    <span className="shrink-0 tabular-nums text-black/55">
                                        <b className="text-[15px] text-black/85">{g.share}</b>
                                        {g.peak && <span className="ml-2 text-[11.5px] text-black/40">가장 많은 때 {periodLabel(g.peak.period, result.unit)}</span>}
                                    </span>
                                </div>
                                <div className="mt-1 h-2 rounded-full bg-black/[0.05] overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${Math.max(g.share, g.avg > 0 ? 1 : 0)}%`, backgroundColor: colorOf(g.name) }} />
                                </div>
                            </li>
                        ))}
                    </ul>
                    <TrendChart groups={result.groups} colorOf={colorOf} unit={result.unit} />
                    <p className="text-[11.5px] text-black/45 leading-relaxed break-keep">
                        네이버 검색량의 <b>상대값</b>입니다. 한 번에 넣은 묶음들 가운데 가장 많이 찾은 구간이 100 이고, 따로 잰 결과끼리는 견줄 수 없습니다 —
                        견줄 검색어는 한 번에 같이 넣으세요. 달 단위는 꽉 찬 달만 셉니다(이번 달 제외). 출처: 네이버 데이터랩 검색어 트렌드.
                    </p>
                </Panel>
            )}
        </div>
    );
}
