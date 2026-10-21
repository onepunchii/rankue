/**
 * 종목에 맞는 축제(2026-10-21, 오너 "공개 페이지 + 종목별") — 등산 홈 · 낚시 홈의 한 줄.
 *  · 등산: '산행 길에 들를 축제' — 100대 명산 정상 5km 안에서 열리는 축제(그 산과 거리를 같이 적는다). 꽃 · 단풍 · 억새 축제가 앞
 *  · 낚시: '낚시 축제' — 산천어 · 송어 · 빙어 · 루어 · 낚시(겨울 축제라 넉 달 앞까지)
 * 고르는 규칙은 서버(GET /festivals/picks)와 shared/festivals 의 낱말. 없으면 칸이 없다. 사진은 자르지 않는다(FestivalThumb).
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FESTIVALS_PATH } from "@shared/festivals";
import { FestivalCard } from "./FestivalBits";
import { festivalPicksKey, type FestivalPicksData } from "../api";

const TONE = {
    HIKING: { title: "산행 길에 들를 축제", accent: "#F28C6A", text: "#F4EFE3", dim: "#F4EFE38C", link: "#F6D9A8" },
    FISHING: { title: "낚시 축제", accent: "#F4A963", text: "#F3ECDD", dim: "#F3ECDD80", link: "#F8DDB0" },
} as const;

export function FestivalPicks({ sport }: { sport: "HIKING" | "FISHING" }) {
    const { data } = useQuery<FestivalPicksData>({ queryKey: festivalPicksKey(sport), staleTime: 30 * 60_000 });
    const items = Array.isArray(data?.items) ? data!.items : [];
    if (!items.length || !data) return null;
    const t = TONE[sport];
    return (
        <section className="px-5 pt-8" data-testid={`festival-picks-${sport.toLowerCase()}`}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: t.text }}>{t.title}</h2>
                <Link href={FESTIVALS_PATH} className="shrink-0 text-[13px] font-medium active:opacity-70" style={{ color: t.link }} data-testid="festival-picks-all">전국 축제 지도</Link>
            </div>
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {items.map((f, i) => <FestivalCard key={f.id} f={f} today={data.today} eager={i < 2} accent={t.accent} note={f.mountain ? `${f.mountain.name}에서 ${f.mountain.km}km` : null} />)}
            </div>
            <p className="mt-2 text-[12px]" style={{ color: t.dim }}>자료 · 사진 한국관광공사 · 날짜는 바뀔 수 있어요</p>
        </section>
    );
}
