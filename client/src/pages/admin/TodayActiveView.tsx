/**
 * 오늘 접속 — 한국 날짜 0시부터 앱을 연 회원(2026-09-26 오너: "오늘 활성화 사용자 보기 편하게").
 * 예전엔 회원 관리 탭 맨 위 숫자 하나("오늘 접속", 실제로는 최근 24시간)뿐이라 누가 들어왔는지 볼 수 없었다.
 *  - 숫자: 오늘 접속 · 지금 접속 중 · 어제 이 시각까지 대비 · 오늘 가입
 *  - 시간대 막대: 몇 시에 들어오는지(한국 시각, 지금 시각 강조)
 *  - 목록: 마지막 활동 순, 접속 중·신규 거르기, 이름/전화 검색. 누르면 회원 상세.
 * 1분마다 새로 읽는다.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideSearch, LucideRefreshCw, LucideChevronRight } from "@/lib/icons";
import { KpiTile, PlatformIcon, CountryFlag, kstTime, phoneLabel } from "./adminUtils";

export type TodayActiveData = {
    total: number;
    live: number;
    newToday: number;
    yesterdaySoFar: number;
    hourly: number[];
    platforms: Record<string, number>;
    members: {
        id: string; name: string; phone: string; countryCode: string | null; platform: string;
        sessions: number; minutes: number; firstAt: string; lastAt: string; live: boolean; isNew: boolean;
    }[];
};

export const TODAY_ACTIVE_KEY = ["/api/hiq/admin/activity/today"] as const;

export function useTodayActive() {
    return useQuery<TodayActiveData>({
        queryKey: TODAY_ACTIVE_KEY,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });
}

function currentKstHour() {
    return new Date(Date.now() + 9 * 3600_000).getUTCHours();
}

function HourlyBars({ hourly }: { hourly: number[] }) {
    const max = Math.max(1, ...hourly);
    const nowH = currentKstHour();
    return (
        <div>
            <div className="flex items-end gap-[3px] h-20" role="img" aria-label="시간대별 접속자 수">
                {hourly.map((n, h) => (
                    <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h}시 · ${n}명`}>
                        <div
                            className={`w-full rounded-t-[3px] ${h === nowH ? "bg-brand" : h > nowH ? "bg-black/[0.04]" : n > 0 ? "bg-brand/35" : "bg-black/[0.06]"}`}
                            style={{ height: `${h > nowH ? 4 : Math.max(4, (n / max) * 100)}%` }}
                        />
                    </div>
                ))}
            </div>
            <div className="mt-1 flex justify-between text-[10.5px] text-black/35 tabular-nums">
                <span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span>
            </div>
        </div>
    );
}

type Filter = "all" | "live" | "new";

export default function TodayActiveView({ compact = false, onOpenMember, onSeeAll }: {
    /** 대시보드 홈에 넣을 때 — 목록을 8명까지만 */
    compact?: boolean;
    onOpenMember?: (id: string) => void;
    onSeeAll?: () => void;
}) {
    const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useTodayActive();
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState<Filter>("all");

    const list = useMemo(() => {
        let rows = Array.isArray(data?.members) ? data!.members : [];
        if (filter === "live") rows = rows.filter((m) => m.live);
        if (filter === "new") rows = rows.filter((m) => m.isNew);
        const s = q.trim();
        if (s) rows = rows.filter((m) => m.name.includes(s) || m.phone.includes(s));
        return rows;
    }, [data, filter, q]);

    if (isLoading) return <div className="rounded-2xl bg-white border border-black/[0.08] p-8 text-center text-black/45 text-sm">오늘 접속 불러오는 중…</div>;
    // 모양까지 확인한다 — 옛 캐시나 오류 응답이 들어와도 화면 전체가 멈추지 않게(이 조각은 대시보드 홈에도 있다).
    if (!data || !Array.isArray(data.members) || !Array.isArray(data.hourly)) {
        return <div className="rounded-2xl bg-white border border-black/[0.08] p-8 text-center text-black/45 text-sm">오늘 접속 정보를 불러오지 못했습니다.</div>;
    }

    const diff = data.total - data.yesterdaySoFar;
    const shown = compact ? list.slice(0, 8) : list;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <KpiTile label="오늘 접속" value={data.total} unit="명" tone="brand"
                    sub={<span>어제 이 시각 {data.yesterdaySoFar}명 · <b className={diff >= 0 ? "text-brand" : "text-red-600"}>{diff >= 0 ? "+" : ""}{diff}</b></span>} />
                <KpiTile label="지금 접속 중" value={data.live} unit="명" sub="최근 30분 안에 활동" />
                <KpiTile label="오늘 가입" value={data.newToday} unit="명" sub="한국 날짜 기준" />
                <KpiTile label="기기" value={(data.platforms?.ios ?? 0) + (data.platforms?.android ?? 0)} unit="명"
                    sub={<span>🍎 {data.platforms?.ios ?? 0} · 🤖 {data.platforms?.android ?? 0} · 🌐 {data.platforms?.web ?? 0}</span>} />
            </div>

            <div className="rounded-2xl bg-white border border-black/[0.08] p-4">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[13px] font-bold text-black/60">시간대별 접속자 <span className="font-medium text-black/35">(한국 시각)</span></p>
                    <button onClick={() => refetch()} className="flex items-center gap-1 text-[12px] text-black/45 hover:text-brand" aria-label="새로고침">
                        <LucideRefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                        {kstTime(new Date(dataUpdatedAt).toISOString())}
                    </button>
                </div>
                <HourlyBars hourly={data.hourly} />
            </div>

            <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden">
                <div className="p-3 border-b border-black/[0.06] flex flex-col sm:flex-row gap-2 sm:items-center">
                    <div className="flex gap-1.5">
                        {([["all", `전체 ${data.members.length}`], ["live", `접속 중 ${data.live}`], ["new", `신규 ${data.members.filter((m) => m.isNew).length}`]] as [Filter, string][]).map(([k, label]) => (
                            <button key={k} onClick={() => setFilter(k)}
                                className={`h-8 px-3 rounded-full text-[12.5px] font-bold tabular-nums transition-colors ${filter === k ? "bg-brand text-white" : "bg-black/[0.05] text-black/55"}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {!compact && (
                        <div className="relative sm:ml-auto sm:w-64">
                            <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 또는 전화번호"
                                className="w-full h-9 pl-9 pr-3 rounded-lg bg-black/[0.04] text-sm outline-none focus:ring-1 focus:ring-brand/40" />
                        </div>
                    )}
                </div>

                {shown.length === 0 ? (
                    <p className="p-8 text-center text-[13px] text-black/40">
                        {data.members.length === 0 ? "오늘 아직 앱을 연 회원이 없습니다." : "조건에 맞는 회원이 없습니다."}
                    </p>
                ) : (
                    <ul className="divide-y divide-black/[0.05]">
                        {shown.map((m) => (
                            <li key={m.id}>
                                <button
                                    onClick={() => onOpenMember?.(m.id)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02] active:bg-black/[0.04]"
                                >
                                    <span className="relative shrink-0 w-9 h-9 rounded-full bg-black/[0.05] flex items-center justify-center text-[13px] font-bold text-black/60">
                                        {m.name.slice(0, 1) || "?"}
                                        {m.live && <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full bg-brand ring-2 ring-white" title="지금 접속 중" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                            <span className="font-bold text-[14px] text-[rgba(0,0,0,0.87)] truncate">{m.name}</span>
                                            {m.isNew && <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10.5px] font-bold text-brand">신규</span>}
                                            <PlatformIcon platform={m.platform} className="text-[12px]" />
                                            <CountryFlag code={m.countryCode} />
                                        </span>
                                        <span className="block text-[12px] text-black/45 tabular-nums truncate">
                                            {phoneLabel(m.phone)}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right tabular-nums">
                                        <span className={`block text-[13px] font-bold ${m.live ? "text-brand" : "text-black/70"}`}>
                                            {m.live ? "접속 중" : kstTime(m.lastAt)}
                                        </span>
                                        <span className="block text-[11.5px] text-black/40">
                                            {kstTime(m.firstAt)}부터 · {m.sessions}회 · {m.minutes}분
                                        </span>
                                    </span>
                                    <LucideChevronRight className="w-4 h-4 text-black/25 shrink-0" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {compact && list.length > shown.length && (
                    <button onClick={onSeeAll} className="w-full py-3 text-[13px] font-bold text-brand border-t border-black/[0.05] hover:bg-brand/[0.04]">
                        {list.length}명 모두 보기
                    </button>
                )}
            </div>
        </div>
    );
}
