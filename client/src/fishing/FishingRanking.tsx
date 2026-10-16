import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { FISH_UNIT_LABEL } from "@shared/fishingFish";
import type { FishingRankBoard, FishingRankSpecies } from "@shared/fishingRank";
import { UgcActionMenu } from "@/components/hiq/community/UgcActionMenu";

const MEDAL = ["#E8B64C", "#C9D1D9", "#D08A5B"];

export function FishingRanking() {
    const { data: species = [], isLoading } = useQuery<FishingRankSpecies[]>({ queryKey: ["/api/hiq/fishing/ranking/species"], staleTime: 60_000 });
    const [pick, setPick] = useState<string | null>(null);
    const current = pick ?? species[0]?.species ?? null;
    const { data: board } = useQuery<FishingRankBoard>({
        queryKey: ["/api/hiq/fishing/ranking", current],
        queryFn: () => apiRequest(`/api/hiq/fishing/ranking?species=${encodeURIComponent(current ?? "")}`),
        enabled: !!current,
        staleTime: 60_000,
    });

    if (isLoading) return <div className="h-40 rounded-2xl bg-[#FFFFFF0A]" aria-busy="true" />;
    if (species.length === 0) return (
        <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-5 text-[14px] leading-relaxed text-[#F3ECDDB3] break-keep" data-testid="fishing-rank-empty">
            아직 랭킹에 올라온 조과가 없어요. 조과를 적을 때 '랭킹에 올리기'를 켜면 그 어종의 순위에 들어가요.
        </p>
    );
    return (
        <div data-testid="fishing-rank">
            <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="어종">
                {species.map((s) => {
                    const on = s.species === current;
                    return (
                        <button key={s.species} type="button" onClick={() => setPick(s.species)} aria-pressed={on}
                            className="h-10 shrink-0 rounded-full px-3.5 text-[14px] font-semibold"
                            style={on ? { background: "#F4A963", color: "#2A1606" } : { background: "#FFFFFF14", color: "#F3ECDDCC" }}>
                            {s.species}<span className="ml-1 text-[12px] font-medium opacity-70">{s.people}</span>
                        </button>
                    );
                })}
            </div>
            <ol className="mt-3 overflow-hidden rounded-2xl bg-[#FFFFFF0A]">
                {(board?.rows ?? []).map((r, i) => (
                    <li key={`${r.rank}-${i}`} className={`flex min-h-[60px] items-center gap-3 px-3.5 py-2 ${i ? "border-t border-[#FFFFFF14]" : ""}`} style={r.mine ? { background: "#F4A9631F" } : undefined}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold tabular-nums" style={r.rank <= 3 ? { background: MEDAL[r.rank - 1], color: "#1B1B1F" } : { color: "#F3ECDD99" }}>{r.rank}</span>
                        {r.thumbUrl ? <img src={r.thumbUrl} alt="" className="h-11 w-14 shrink-0 rounded-md object-cover" loading="lazy" /> : <span className="h-11 w-14 shrink-0 rounded-md bg-[#FFFFFF0F]" aria-hidden />}
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold text-[#F3ECDD]">{r.name}{r.mine && <span className="ml-1.5 text-[12.5px] font-medium text-[#F4A963]">나</span>}</span>
                            <span className="block text-[12.5px] tabular-nums text-[#F3ECDD80]">{r.day}</span>
                        </span>
                        <span className="shrink-0 text-[17px] font-semibold tabular-nums text-[#F3ECDD]">{r.value}{board ? FISH_UNIT_LABEL[board.unit] : ""}</span>
                        {/* 남의 줄 — 신고 · 차단(서로 다른 3명이 신고하면 서버가 가린다, 신고 대상 fishing_catch) */}
                        {!r.mine && r.catchId ? (
                            <UgcActionMenu targetType="fishing_catch" targetId={r.catchId} authorId={r.memberId} authorName={r.name}
                                className="-mr-1.5 h-10 w-8 rounded-full text-[#F3ECDD80] hover:text-[#F3ECDD] active:bg-[#FFFFFF1A]" iconClassName="h-5 w-5" />
                        ) : <span className="w-6 shrink-0" aria-hidden />}
                    </li>
                ))}
            </ol>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#F3ECDD80] break-keep">사람마다 가장 좋은 한 줄만 올라가요. 이름 · 값 · 날짜 · 사진만 보이고, 잡은 곳과 자리는 보이지 않아요. 이상한 기록은 ⋯ 에서 신고할 수 있어요.</p>
        </div>
    );
}
