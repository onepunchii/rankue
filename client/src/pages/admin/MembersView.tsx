/**
 * 어드민 · 회원 관리(2026-09-26 개편).
 * 예전: 14칸짜리 가로 표 하나 — 폰에서는 옆으로 한참 밀어야 했고, 거를 수도 줄 세울 수도 없었다.
 * 지금:
 *  - 거르기 칩(전체 · 오늘 접속 · 7일 활동 · 30일+ 이탈 · 7일 신규 · 정지) + 정렬 + 검색
 *  - 폰은 카드 목록, 넓은 화면은 핵심 칸만 남긴 표. 줄을 누르면 회원 상세(보기·수정·조치)가 열린다.
 *  - 한 번에 50명씩, '더 보기'로 이어서.
 *  - 앱 접속 요약·가입 코호트 리텐션은 접어 두는 칸으로(필요할 때만 펼친다).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideSearch, LucideChevronDown, LucideChevronRight, LucideDownload } from "@/lib/icons";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { type AdminMember, ADMIN_MEMBERS_KEY } from "./MemberDetailSheet";
import { PlatformIcon, CountryFlag, kstDate, lastSeenLabel, lastSeenTone, daysSince, isKstToday, phoneLabel, KpiTile } from "./adminUtils";

type Activity = {
    today: number; yesterday: number;
    dau: number; wau: number; mau: number; sessions7: number; avgMinutes7: number;
    cohorts: { week: string; signed: number; d1: number; d7: number; d30: number; d7Ready: boolean; d30Ready: boolean }[];
};

type Filter = "all" | "today" | "active7" | "dormant" | "new7" | "banned";
type Sort = "joined" | "seen" | "rp3" | "rp4" | "visits";

const FILTERS: { id: Filter; label: string; test: (m: AdminMember) => boolean }[] = [
    { id: "all", label: "전체", test: () => true },
    { id: "today", label: "오늘 접속", test: (m) => isKstToday(m.lastSeenAt) },
    { id: "active7", label: "7일 활동", test: (m) => daysSince(m.lastSeenAt) <= 7 },
    { id: "dormant", label: "30일+ 이탈", test: (m) => daysSince(m.lastSeenAt) > 30 },
    { id: "new7", label: "7일 신규", test: (m) => daysSince(m.createdAt) <= 7 },
    { id: "banned", label: "정지", test: (m) => m.status === "banned" },
];

const SORTS: { id: Sort; label: string }[] = [
    { id: "joined", label: "최근 가입순" },
    { id: "seen", label: "최근 접속순" },
    { id: "rp3", label: "3쿠션 RP 높은순" },
    { id: "rp4", label: "4구 RP 높은순" },
    { id: "visits", label: "방문 많은순" },
];

const PAGE = 50;

/** 리텐션 칸: 아직 그 기간이 안 지난 코호트는 '-' (숫자를 내면 낮게 보여 오해한다). */
function retentionCell(n: number, signed: number, ready: boolean) {
    if (!ready || signed === 0) return <span className="text-black/25">-</span>;
    const pct = Math.round((n / signed) * 100);
    return <span className={pct >= 40 ? "font-bold text-brand" : pct > 0 ? "text-[rgba(0,0,0,0.87)]" : "text-black/35"}>{pct}%<span className="text-black/35 text-[11px]"> ({n})</span></span>;
}

function sortMembers(rows: AdminMember[], sort: Sort) {
    const t = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);
    const copy = [...rows];
    switch (sort) {
        case "seen": return copy.sort((a, b) => t(b.lastSeenAt) - t(a.lastSeenAt));
        case "rp3": return copy.sort((a, b) => (b.rating3c ?? 0) - (a.rating3c ?? 0));
        case "rp4": return copy.sort((a, b) => (b.rating4c ?? 0) - (a.rating4c ?? 0));
        case "visits": return copy.sort((a, b) => (b.visitCount ?? 0) - (a.visitCount ?? 0));
        default: return copy.sort((a, b) => t(b.createdAt) - t(a.createdAt));
    }
}

export default function MembersView({ onOpenId }: {
    /** 줄을 누르면 — 상세 시트는 대시보드가 띄운다('오늘 접속'에서도 같은 시트를 쓴다) */
    onOpenId: (id: string) => void;
}) {
    const { data: members = [], isLoading } = useQuery<AdminMember[]>({ queryKey: ADMIN_MEMBERS_KEY });
    const { data: activity } = useQuery<Activity>({ queryKey: ["/api/hiq/admin/activity"] });
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState<Filter>("all");
    const [sort, setSort] = useState<Sort>("joined");
    const [limit, setLimit] = useState(PAGE);
    const [showRetention, setShowRetention] = useState(false);

    const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, members.filter(f.test).length])) as Record<Filter, number>, [members]);

    const rows = useMemo(() => {
        const f = FILTERS.find((x) => x.id === filter)!;
        const s = q.trim().toLowerCase();
        const filtered = members.filter((m) => f.test(m) && (!s || m.name?.toLowerCase().includes(s) || m.phone?.includes(s)));
        return sortMembers(filtered, sort);
    }, [members, filter, q, sort]);

    const shown = rows.slice(0, limit);

    const downloadExcel = () => {
        const data = rows.map((m) => ({
            "이름": m.name,
            "연락처": phoneLabel(m.phone),
            "성별": m.gender === "male" ? "남" : m.gender === "female" ? "여" : "",
            "출생연도": m.birthYear ?? "",
            "국가": m.countryCode ?? "",
            "기기": m.platform ?? "",
            "3쿠션 RP": m.rating3c ?? 0,
            "4구 RP": m.rating4c ?? 0,
            "방문": m.visitCount ?? 0,
            "마지막 접속": m.lastSeenAt ? kstDate(m.lastSeenAt) : "",
            "7일 접속일": m.activeDays7 ?? 0,
            "가입일": kstDate(m.createdAt),
            "상태": m.status === "banned" ? "정지" : "",
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "회원");
        XLSX.writeFile(wb, `랭큐_회원_${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)}.xlsx`);
    };

    return (
        <div className="space-y-4">
            {activity && (
                <div className="space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <KpiTile label="오늘 접속" value={activity.today} unit="명" tone="brand" sub={`어제 ${activity.yesterday}명`} onClick={() => setFilter("today")} />
                        <KpiTile label="7일 접속" value={activity.wau} unit="명" onClick={() => setFilter("active7")} />
                        <KpiTile label="30일 접속" value={activity.mau} unit="명" />
                        <KpiTile label="7일 세션" value={activity.sessions7} unit="회" />
                        <KpiTile label="평균 세션" value={activity.avgMinutes7} unit="분" />
                    </div>
                    <button onClick={() => setShowRetention((v) => !v)} className="flex items-center gap-1 text-[12.5px] font-bold text-black/50 hover:text-brand">
                        <LucideChevronDown className={`w-4 h-4 transition-transform ${showRetention ? "rotate-180" : ""}`} />
                        가입 주별 재방문(리텐션) {showRetention ? "접기" : "보기"}
                    </button>
                    {showRetention && (
                        <div className="rounded-2xl overflow-hidden border border-black/10 overflow-x-auto">
                            <table className="w-full text-left bg-white text-sm whitespace-nowrap">
                                <thead>
                                    <tr className="border-b border-black/10 bg-black/[0.02]">
                                        <th className="p-3 font-black text-black/55">가입 주</th>
                                        <th className="p-3 font-black text-black/55 text-right">가입</th>
                                        <th className="p-3 font-black text-black/55 text-right" title="가입 다음 날 다시 왔나">D1</th>
                                        <th className="p-3 font-black text-black/55 text-right" title="가입 후 7일 안에 다시 왔나">D7</th>
                                        <th className="p-3 font-black text-black/55 text-right" title="가입 후 30일 안에 다시 왔나">D30</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activity.cohorts.map((c) => (
                                        <tr key={c.week} className="border-b border-black/[0.06]">
                                            <td className="p-3 font-mono text-black/60">{c.week}~</td>
                                            <td className="p-3 text-right font-mono">{c.signed}</td>
                                            <td className="p-3 text-right font-mono">{retentionCell(c.d1, c.signed, true)}</td>
                                            <td className="p-3 text-right font-mono">{retentionCell(c.d7, c.signed, c.d7Ready)}</td>
                                            <td className="p-3 text-right font-mono">{retentionCell(c.d30, c.signed, c.d30Ready)}</td>
                                        </tr>
                                    ))}
                                    {activity.cohorts.length === 0 && (
                                        <tr><td colSpan={5} className="p-6 text-center text-black/45">최근 8주 가입자가 없습니다.</td></tr>
                                    )}
                                </tbody>
                            </table>
                            <p className="px-3 py-2 text-[11px] text-black/40 bg-white">접속 기록은 이 기능을 켠 날부터 쌓입니다. 그 전 가입자의 D1·D7은 기록이 없어 낮게 나옵니다.</p>
                        </div>
                    )}
                </div>
            )}

            {/* 도구 줄: 거르기 칩(가로로 밀림) · 검색 · 정렬 · 엑셀 */}
            <div className="sticky top-14 md:top-0 z-10 -mx-4 md:mx-0 px-4 md:px-0 py-2 bg-surface-0/95 backdrop-blur space-y-2">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
                    {FILTERS.map((f) => (
                        <button key={f.id} onClick={() => { setFilter(f.id); setLimit(PAGE); }}
                            className={cn("shrink-0 h-8 px-3 rounded-full text-[12.5px] font-bold tabular-nums transition-colors",
                                filter === f.id ? "bg-brand text-white" : "bg-white border border-black/[0.08] text-black/60")}>
                            {f.label} <span className={filter === f.id ? "text-white/80" : "text-black/35"}>{counts[f.id] ?? 0}</span>
                        </button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <LucideSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35" />
                        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="이름 또는 전화번호"
                            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-black/10 text-sm outline-none focus:border-brand/40" />
                    </div>
                    <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬"
                        className="h-10 px-2 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/65 outline-none">
                        {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                    <button onClick={downloadExcel} disabled={!rows.length} aria-label="엑셀 저장" title="지금 보이는 조건으로 엑셀 저장"
                        className="h-10 w-10 shrink-0 rounded-xl bg-white border border-black/10 flex items-center justify-center text-black/55 hover:text-brand disabled:opacity-40">
                        <LucideDownload className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <p className="text-[13px] font-bold text-black/50">
                {filter === "all" && !q ? "전체" : "조건에 맞는 회원"} <span className="text-brand tabular-nums">{rows.length.toLocaleString()}</span>명
            </p>

            {isLoading ? (
                <div className="rounded-2xl bg-white p-10 text-center text-black/45 text-sm">회원 불러오는 중…</div>
            ) : rows.length === 0 ? (
                <div className="rounded-2xl bg-white p-10 text-center text-black/45 text-sm">조건에 맞는 회원이 없습니다.</div>
            ) : (
                <>
                    {/* 폰: 카드 목록 */}
                    <ul className="md:hidden rounded-2xl bg-white border border-black/[0.08] divide-y divide-black/[0.05] overflow-hidden">
                        {shown.map((m) => (
                            <li key={m.id}>
                                <button onClick={() => onOpenId(m.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-black/[0.04]">
                                    <span className="shrink-0 w-9 h-9 rounded-full bg-black/[0.05] flex items-center justify-center text-[13px] font-bold text-black/60">{m.name?.slice(0, 1) || "?"}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                            <span className="font-bold text-[14px] truncate">{m.name}</span>
                                            {m.status === "banned" && <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 text-[10.5px] font-bold text-red-600">정지</span>}
                                            <PlatformIcon platform={m.platform} className="text-[12px]" />
                                            <CountryFlag code={m.countryCode} />
                                        </span>
                                        <span className="block text-[12px] text-black/45 tabular-nums truncate">
                                            {phoneLabel(m.phone)} · RP {m.rating3c ?? 0}/{m.rating4c ?? 0}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        <span className={cn("block text-[12.5px] tabular-nums", lastSeenTone(m.lastSeenAt))}>{lastSeenLabel(m.lastSeenAt)}</span>
                                        <span className="block text-[11px] text-black/35 tabular-nums">가입 {kstDate(m.createdAt)}</span>
                                    </span>
                                    <LucideChevronRight className="w-4 h-4 text-black/25 shrink-0" />
                                </button>
                            </li>
                        ))}
                    </ul>

                    {/* 넓은 화면: 핵심 칸만 남긴 표 */}
                    <div className="hidden md:block rounded-2xl overflow-hidden border border-black/10">
                        <table className="w-full text-left bg-white text-sm">
                            <thead>
                                <tr className="border-b border-black/10 bg-black/[0.02] text-[12px]">
                                    <th className="px-4 py-3 font-black text-black/55">회원</th>
                                    <th className="px-3 py-3 font-black text-black/55 text-center">기기·국가</th>
                                    <th className="px-3 py-3 font-black text-black/55 text-right">RP 3쿠션/4구</th>
                                    <th className="px-3 py-3 font-black text-black/55 text-right">방문</th>
                                    <th className="px-3 py-3 font-black text-black/55" title="앱을 마지막으로 연 시각">마지막 접속</th>
                                    <th className="px-3 py-3 font-black text-black/55 text-right" title="최근 7일 중 앱을 연 날 수">7일</th>
                                    <th className="px-3 py-3 font-black text-black/55">가입일</th>
                                    <th className="px-3 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((m) => (
                                    <tr key={m.id} onClick={() => onOpenId(m.id)} className="border-b border-black/[0.05] hover:bg-brand/[0.03] cursor-pointer">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-[rgba(0,0,0,0.87)]">{m.name}</span>
                                                {m.status === "banned" && <span className="rounded-full bg-red-500/10 px-1.5 text-[10.5px] font-bold text-red-600">정지</span>}
                                                {(m.role === "admin" || m.role === "super_admin") && <span className="rounded-full bg-black/[0.06] px-1.5 text-[10.5px] font-bold text-black/55">관리자</span>}
                                            </div>
                                            <div className="text-[12px] text-black/45 font-mono">{phoneLabel(m.phone)}</div>
                                        </td>
                                        <td className="px-3 py-3 text-center whitespace-nowrap"><PlatformIcon platform={m.platform} /> <CountryFlag code={m.countryCode} /></td>
                                        <td className="px-3 py-3 text-right font-mono font-bold text-brand whitespace-nowrap">{m.rating3c ?? 0} <span className="text-black/25">/</span> {m.rating4c ?? 0}</td>
                                        <td className="px-3 py-3 text-right font-mono text-black/60">{m.visitCount ?? 0}</td>
                                        <td className={cn("px-3 py-3 font-mono text-[12.5px] whitespace-nowrap", lastSeenTone(m.lastSeenAt))}>{lastSeenLabel(m.lastSeenAt)}</td>
                                        <td className="px-3 py-3 text-right font-mono">{(m.activeDays7 ?? 0) > 0 ? <b>{m.activeDays7}일</b> : <span className="text-black/25">-</span>}</td>
                                        <td className="px-3 py-3 text-black/50 font-mono text-[12.5px] whitespace-nowrap">{kstDate(m.createdAt)}</td>
                                        <td className="px-3 py-3 text-right"><LucideChevronRight className="w-4 h-4 text-black/25 inline" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {rows.length > shown.length && (
                        <button onClick={() => setLimit((n) => n + PAGE)} className="w-full h-11 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/60 hover:text-brand">
                            더 보기 ({shown.length.toLocaleString()} / {rows.length.toLocaleString()})
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
