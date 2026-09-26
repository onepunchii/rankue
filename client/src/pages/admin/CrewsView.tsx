/**
 * 어드민 · 크루 현황(2026-09-26 정리).
 * 예전: 서버가 최근 20개만 줬고(getAllCrews 기본값), 종목 칩 셋만 있었다.
 * 지금: 전부 · 종목 거르기 · 검색(이름·리더·장소·지역) · 정렬(인원·최근·가입 대기) · 합계 숫자 · 크루 페이지 바로가기.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LucideUsers, LucideExternalLink } from "@/lib/icons";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, KpiTile, kstDate } from "./adminUtils";

export type AdminCrew = {
    id: string; name: string; description: string;
    sportCategory: "BILLIARDS" | "GOLF" | "MIXED";
    region: string | null; joinType: string; maxMembers: number;
    memberCount: number; pendingCount: number;
    leaderName: string; storeName: string; createdAt: string;
};

const SPORT: Record<string, { label: string; tone: "brand" | "info" | "warn" }> = {
    BILLIARDS: { label: "당구", tone: "info" },
    GOLF: { label: "골프", tone: "brand" },
    MIXED: { label: "당구·골프", tone: "warn" },
};

export default function CrewsView() {
    const { data: crews = [], isLoading } = useQuery<AdminCrew[]>({ queryKey: ["/api/hiq/admin/crews"] });
    const [sport, setSport] = useState<"ALL" | "BILLIARDS" | "GOLF">("ALL");
    const [q, setQ] = useState("");
    const [sort, setSort] = useState<"members" | "new" | "pending">("members");
    const [limit, setLimit] = useState(60);

    const inSport = (c: AdminCrew, s: typeof sport) => s === "ALL" || c.sportCategory === s || c.sportCategory === "MIXED";
    const rows = useMemo(() => {
        const s = q.trim();
        const list = crews.filter((c) => inSport(c, sport) && (!s || [c.name, c.leaderName, c.storeName, c.region].some((v) => v?.includes(s))));
        if (sort === "members") return [...list].sort((a, b) => b.memberCount - a.memberCount);
        if (sort === "pending") return [...list].sort((a, b) => b.pendingCount - a.pendingCount || b.memberCount - a.memberCount);
        return list; // 서버가 최근 만든 순으로 준다
    }, [crews, sport, q, sort]);

    const totalMembers = crews.reduce((a, c) => a + c.memberCount, 0);
    const newThisWeek = crews.filter((c) => Date.now() - Date.parse(c.createdAt) < 7 * 86_400_000).length;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
                <KpiTile label="전체 크루" value={crews.length} unit="개" />
                <KpiTile label="크루 멤버 합" value={totalMembers.toLocaleString()} unit="명" tone="brand" />
                <KpiTile label="이번 주 새 크루" value={newThisWeek} unit="개" />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <FilterChips value={sport} onChange={(v) => { setSport(v); setLimit(60); }} options={[
                    { id: "ALL", label: "전체", count: crews.length },
                    { id: "BILLIARDS", label: "당구", count: crews.filter((c) => inSport(c, "BILLIARDS")).length },
                    { id: "GOLF", label: "골프", count: crews.filter((c) => inSport(c, "GOLF")).length },
                ]} />
                <div className="flex gap-2 sm:ml-auto">
                    <SearchBox value={q} onChange={(v) => { setQ(v); setLimit(60); }} placeholder="크루·리더·장소·지역" className="flex-1 sm:w-60" />
                    <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="정렬"
                        className="h-10 px-2 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/65 outline-none">
                        <option value="members">인원 많은순</option>
                        <option value="new">최근 만든순</option>
                        <option value="pending">가입 대기순</option>
                    </select>
                </div>
            </div>

            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>{crews.length ? "조건에 맞는 크루가 없습니다." : "등록된 크루가 없습니다."}</EmptyState> : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {rows.slice(0, limit).map((c) => {
                            const sp = SPORT[c.sportCategory] ?? SPORT.BILLIARDS;
                            const full = c.maxMembers > 0 && c.memberCount >= c.maxMembers;
                            return (
                                <Panel key={c.id} className="p-4 flex flex-col">
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        <Pill tone={sp.tone}>{sp.label}</Pill>
                                        {c.joinType === "approval" && <Pill>승인제</Pill>}
                                        {c.pendingCount > 0 && <Pill tone="alert">가입 대기 {c.pendingCount}</Pill>}
                                        <span className="ml-auto text-[11.5px] text-black/40 tabular-nums">{kstDate(c.createdAt)}</span>
                                    </div>
                                    <h3 className="text-[16px] font-bold truncate">{c.name}</h3>
                                    <p className="text-[12.5px] text-black/50 line-clamp-2 min-h-[2.4em]">{c.description || "소개 없음"}</p>
                                    <div className="mt-3 pt-3 border-t border-black/[0.06] flex items-center gap-2 text-[12.5px]">
                                        <span className="flex items-center gap-1 font-bold tabular-nums">
                                            <LucideUsers className="w-3.5 h-3.5 text-black/45" />
                                            <span className={full ? "text-amber-700" : ""}>{c.memberCount}</span><span className="text-black/35">/{c.maxMembers}</span>
                                        </span>
                                        <span className="text-black/50 truncate">리더 {c.leaderName}</span>
                                        <a href={`/crew/${c.id}`} target="_blank" rel="noreferrer" className="ml-auto shrink-0 text-brand font-bold flex items-center gap-0.5">
                                            보기 <LucideExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    </div>
                                    <p className="mt-1 text-[12px] text-black/40 truncate">{c.storeName}{c.region ? ` · ${c.region}` : ""}</p>
                                </Panel>
                            );
                        })}
                    </div>
                    {rows.length > limit && (
                        <button onClick={() => setLimit((n) => n + 60)} className="w-full h-11 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/60 hover:text-brand">
                            더 보기 ({limit} / {rows.length})
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
