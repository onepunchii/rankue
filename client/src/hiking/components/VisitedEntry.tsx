/**
 * '다녀온 산 고르기'로 가는 입구(2026-11-04 — shared/hikingVisited). 와펜 세 장 · 한 줄 · 화살표.
 * 놓는 곳: 등산 허브(/hiking) · 권역 화면(그 권역의 100대 명산으로) · 등산 홈(남긴 산이 적은 회원) · 산 화면의 도장 카드(작은 줄).
 * 누름은 hiking-visited-open 으로 센다(어디서 눌렀는지는 발자국의 화면 주소). 방문자에게도 보인다 — 고르는 데는 가입이 필요 없다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LucideChevronRight } from "@/lib/icons";
import { hikingRegion } from "@shared/hikingMountains";
import { HIKING_VISITED_PATH, VISITED_LABEL } from "@shared/hikingVisited";
import { MountainPatch } from "../stamps/MountainPatch";
import { HIKING_HUB_KEY, type HikingHubData } from "../lib/api";

export const visitedPath = (region?: string | null) => (region ? `${HIKING_VISITED_PATH}?region=${encodeURIComponent(region)}` : HIKING_VISITED_PATH);

export function VisitedEntry({ region, className }: { region?: string | null; className?: string }) {
    const hub = useQuery<HikingHubData>({ queryKey: HIKING_HUB_KEY, staleTime: 10 * 60_000 });
    const r = hikingRegion(region);
    const kfs = (hub.data?.famous ?? []).filter((m) => m.lists.includes("kfs100") && (!r || m.region === r.id)).sort((a, b) => (a.kfsNo ?? 999) - (b.kfsNo ?? 999));
    if (!kfs.length) return null;
    const art = kfs.slice(0, 3);
    return (
        <Link href={visitedPath(r?.id)} data-track-as="hiking-visited-open" data-testid="hiking-visited-entry"
            className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 active:opacity-80 ${className ?? ""}`} style={{ background: "linear-gradient(135deg,#1F5560,#0E2A33)", boxShadow: "inset 0 0 0 1px #FFFFFF1F" }}>
            <span className="flex shrink-0 -space-x-3.5" aria-hidden>
                {art.map((m) => <MountainPatch key={m.id} id={m.id} region={m.region} size={34} earned />)}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug text-[#F4EFE3] break-keep">{r ? VISITED_LABEL.entryRegion(r.name) : VISITED_LABEL.entry}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-[#F4EFE3B3] break-keep">{VISITED_LABEL.entrySub}</span>
            </span>
            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F6D9A8]" aria-hidden />
        </Link>
    );
}
