/**
 * 종목에 맞는 축제 줄(2026-10-21, 오너 "공개 페이지 + 종목별" → "골프도 축제가 중요해") — 골프 · 등산 · 낚시 홈과 각 종목의 축제 화면.
 *  · 골프: '라운드 길에 들를 축제' — 골프장 10km 안(그 골프장과 거리를 같이 적는다)
 *  · 등산: '산행 길에 들를 축제' — 100대 명산 정상 5km 안(그 산과 거리). 꽃 · 단풍 · 억새 축제가 앞
 *  · 낚시: '낚시 축제' — 산천어 · 송어 · 빙어 · 루어 · 낚시(겨울 축제라 넉 달 앞까지)
 * 고르는 규칙은 서버(GET /festivals/picks). 없으면 칸이 없다. 색과 주소는 그 종목의 것(FestThemeScope) — 누르면 그 종목 안의 축제 화면.
 * 사진은 자르지 않는다(FestivalThumb). ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { FestivalSport } from "@shared/festivals";
import { FestivalCard } from "./FestivalBits";
import { FestThemeScope, festTheme } from "../theme";
import { festivalPicksKey, type FestivalPicksData } from "../api";

export function FestivalPicks({ sport, inHub = false, golfHome = false }: { sport: FestivalSport; inHub?: boolean; /** 골프 홈 — 바깥이 이미 24px 안쪽 여백이라 그만큼만 */ golfHome?: boolean }) {
    const { data } = useQuery<FestivalPicksData>({ queryKey: festivalPicksKey(sport), staleTime: 30 * 60_000 });
    const items = Array.isArray(data?.items) ? data!.items : [];
    if (!items.length || !data) return null;
    const t = festTheme(sport);
    return (
        <FestThemeScope sport={sport}>
            <section className={golfHome ? "relative z-10 mb-8" : "px-5 pt-8"} data-testid={`festival-picks-${sport.toLowerCase()}`}>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                    <h2 className="text-[18px] font-semibold tracking-tight" style={{ color: t.text }}>{t.picksTitle}</h2>
                    {!inHub && <Link href={t.base} className="shrink-0 text-[13px] font-medium active:opacity-70" style={{ color: t.soon }} data-testid="festival-picks-all">전국 축제 지도</Link>}
                </div>
                <div className={`${golfHome ? "-mx-6 px-6" : "-mx-5 px-5"} flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
                    {items.map((f, i) => <FestivalCard key={f.id} f={f} today={data.today} eager={i < 2} note={f.mountain ? `${f.mountain.name}에서 ${f.mountain.km}km` : null} />)}
                </div>
                <p className="mt-2 text-[12px]" style={{ color: `${t.text}80` }}>자료 · 사진 한국관광공사 · 날짜는 바뀔 수 있어요</p>
            </section>
        </FestThemeScope>
    );
}
