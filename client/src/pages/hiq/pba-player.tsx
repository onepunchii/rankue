import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import { LucideChevronLeft, LucideChevronRight, LucideChevronDown, LucideGlobe, LucideTrophy, LucideHeart, LucideClock } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT, type Locale } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/hooks/useSeo";
import { cn } from "@/lib/utils";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { ShareButton } from "@/components/hiq/ShareButton";
import { PlayerCardShareButton } from "@/components/hiq/PlayerCardShareButton";
import { PlayerCheers } from "@/components/hiq/umb/PlayerCheers";
import { ProCompareCard } from "@/components/hiq/compare/ProCompareCard";
import { Chip } from "@/components/hiq/umb/ui";
import { goLogin } from "@/components/hiq/LoginGate";
import { pbaCardUrl } from "@/lib/playerCard";
import { seasonLabel, formatPrize } from "./pba";
import { PBA_INCOME_NOTE_KO, formatPrizeKo, pbaL10n, pbaLatestSeasonRank } from "@shared/pbaMeta";
import { PBA_RECORDS_MIN_GAMES } from "@shared/pbaRecordsMeta";
import { crewColors } from "@shared/crewBrand";
import {
    pbaAge, pbaDisplayName, pbaGames, pbaPlayerFaq, pbaPlayerLdNodes, pbaPlayerSummary, pbaPrizeLabel, type PbaPlayerProfile,
} from "@shared/pbaPlayerProfile";

/**
 * PBA 선수 상세(2026-09-27 개편, 오너 승인 시안 — "완벽하고 풍성하게, 들어오면 머물게, SEO·AEO·GEO").
 * 순서: 머리(이름·배지·한 문장 요약·팔로우·카드) → 시즌 상금랭킹·통산 상금 → 통산 기록 4칸(기록 순위·리그 평균 막대) →
 * 나와 비교 → 우승 → 시즌별 기록(그래프 전환·표) → 비슷한 순위 선수 → UMB 세계랭킹 → 응원 → 자주 묻는 질문 → 갱신일·출처.
 * 사진은 쓰지 않는다(초상권) — 국기·이름·숫자만. 한 문장 요약·FAQ·구조화데이터는 프리렌더와 같은 함수(shared/pbaPlayerProfile).
 * 색은 토큰만(bg-surface-*, text-ink-*) — 그래프(recharts)는 CSS 변수를 못 받아 브랜드 색 리터럴을 쓴다.
 */

const BRAND = "#006241";
const AXIS = "rgba(0,0,0,0.4)";
const GRID = "rgba(0,0,0,0.06)";
const SEASON_FOLD = 3;
const API_FOLLOW = (memCode: string) => `/api/hiq/pba/players/pba/${memCode}/follow`;

type Metric = "prizeRank" | "pointRank" | "prize";

const L: Record<Locale, Record<string, string>> = {
    ko: {
        head: "PBA 선수", back: "PBA 랭킹", notFound: "선수를 찾을 수 없어요", age: "{n}세",
        follow: "팔로우", following: "팔로우 중", followOn: "관심 선수로 담았어요", followLogin: "로그인하면 선수를 팔로우할 수 있어요",
        seasonRank: "{s} 시즌 상금랭킹", rankUnit: "위", seasonSub: "포인트 {p} · 상금 {m}", careerPrize: "통산 상금", careerPrizeRank: "{lg} 통산 {n}위",
        career: "통산 기록", allRecords: "전체 기록 순위", average: "에버리지", highRun: "하이런", bank: "뱅크샷", winRate: "승률",
        rankChip: "{lg} {n}위", leagueAvg: "리그 평균 {v}", leagueTop: "리그 최고 {v}", wld: "{w}승 {l}패 {d}무", wl: "{w}승 {l}패",
        topPct: "상위 {n}%", minGames: "{n}경기 이상 선수 기준",
        compare: "나와 비교하기", compareMine: "내 3쿠션 에버 {me} → 이 선수까지 {gap}", compareAhead: "내 3쿠션 에버 {me} — 이 선수보다 높아요!",
        compareLogin: "로그인하고 내 에버리지와 비교해 보세요", compareNoRecord: "경기를 기록하면 내 에버리지와 비교할 수 있어요",
        wins: "우승", winsN: "우승 {n}회", winLine: "{s} 시즌 · {d}", winPrize: "상금 {m}",
        seasons: "시즌별 기록", mPrizeRank: "상금 순위", mPointRank: "포인트 순위", mPrize: "상금",
        colSeason: "시즌", colPrizeRank: "상금 순위", colPoint: "포인트", colPrize: "상금", more: "{n}시즌 더 보기", less: "접기",
        near: "비슷한 순위의 선수", nearMeta: "{s} {lg} 상금랭킹",
        umb: "UMB 세계랭킹", umbRank: "UMB 세계랭킹 {n}위", umbSub: "세계 무대 기록·순위 변화 보기",
        faq: "자주 묻는 질문", updated: "기록 갱신 {d}", source: "출처: PBA 투어 공식 기록(pbatour.org)",
    },
    en: {
        head: "PBA player", back: "PBA Rankings", notFound: "Player not found", age: "age {n}",
        follow: "Follow", following: "Following", followOn: "Added to your players", followLogin: "Log in to follow players",
        seasonRank: "{s} prize ranking", rankUnit: "", seasonSub: "{p} pts · {m}", careerPrize: "Career prize", careerPrizeRank: "No. {n} in {lg}",
        career: "Career record", allRecords: "All records", average: "Average", highRun: "High run", bank: "Bank shot", winRate: "Win rate",
        rankChip: "No. {n} {lg}", leagueAvg: "League avg {v}", leagueTop: "League best {v}", wld: "{w}W {l}L {d}D", wl: "{w}W {l}L",
        topPct: "Top {n}%", minGames: "Players with {n}+ games",
        compare: "Compare with me", compareMine: "My 3-cushion avg {me} → {gap} to go", compareAhead: "My 3-cushion avg {me} — higher than this player!",
        compareLogin: "Log in to compare with your average", compareNoRecord: "Record a game to compare your average",
        wins: "Titles", winsN: "{n} titles", winLine: "{s} season · {d}", winPrize: "Prize {m}",
        seasons: "Season by season", mPrizeRank: "Prize rank", mPointRank: "Points rank", mPrize: "Prize",
        colSeason: "Season", colPrizeRank: "Prize rank", colPoint: "Points", colPrize: "Prize", more: "{n} more seasons", less: "Show less",
        near: "Players nearby", nearMeta: "{s} {lg} prize ranking",
        umb: "UMB World Ranking", umbRank: "UMB World No. {n}", umbSub: "World ranking history",
        faq: "FAQ", updated: "Updated {d}", source: "Source: PBA Tour official records (pbatour.org)",
    },
    vi: {
        head: "Cơ thủ PBA", back: "BXH PBA", notFound: "Không tìm thấy cơ thủ", age: "{n} tuổi",
        follow: "Theo dõi", following: "Đang theo dõi", followOn: "Đã theo dõi", followLogin: "Đăng nhập để theo dõi",
        seasonRank: "BXH tiền thưởng {s}", rankUnit: "", seasonSub: "{p} điểm · {m}", careerPrize: "Tổng tiền thưởng", careerPrizeRank: "Hạng {n} {lg}",
        career: "Thành tích sự nghiệp", allRecords: "Tất cả kỷ lục", average: "Average", highRun: "High run", bank: "Bank shot", winRate: "Tỷ lệ thắng",
        rankChip: "Hạng {n} {lg}", leagueAvg: "TB giải {v}", leagueTop: "Cao nhất giải {v}", wld: "{w}T {l}B {d}H", wl: "{w}T {l}B",
        topPct: "Top {n}%", minGames: "Cơ thủ từ {n} trận",
        compare: "So sánh với tôi", compareMine: "Average 3 băng của tôi {me} → còn {gap}", compareAhead: "Average của tôi {me} — cao hơn!",
        compareLogin: "Đăng nhập để so sánh", compareNoRecord: "Ghi trận đấu để so sánh",
        wins: "Vô địch", winsN: "{n} lần vô địch", winLine: "Mùa {s} · {d}", winPrize: "Thưởng {m}",
        seasons: "Theo mùa giải", mPrizeRank: "Hạng thưởng", mPointRank: "Hạng điểm", mPrize: "Tiền thưởng",
        colSeason: "Mùa", colPrizeRank: "Hạng thưởng", colPoint: "Điểm", colPrize: "Thưởng", more: "Thêm {n} mùa", less: "Thu gọn",
        near: "Cơ thủ cùng hạng", nearMeta: "BXH {lg} {s}",
        umb: "BXH thế giới UMB", umbRank: "Hạng {n} thế giới UMB", umbSub: "Lịch sử BXH thế giới",
        faq: "Câu hỏi thường gặp", updated: "Cập nhật {d}", source: "Nguồn: PBA Tour (pbatour.org)",
    },
    tr: {
        head: "PBA oyuncusu", back: "PBA Sıralaması", notFound: "Oyuncu bulunamadı", age: "{n} yaş",
        follow: "Takip et", following: "Takipte", followOn: "Takibe alındı", followLogin: "Takip için giriş yapın",
        seasonRank: "{s} ödül sıralaması", rankUnit: ".", seasonSub: "{p} puan · {m}", careerPrize: "Kariyer ödülü", careerPrizeRank: "{lg} {n}.",
        career: "Kariyer", allRecords: "Tüm rekorlar", average: "Ortalama", highRun: "En yüksek seri", bank: "Bank atışı", winRate: "Kazanma",
        rankChip: "{lg} {n}.", leagueAvg: "Lig ort. {v}", leagueTop: "Lig en iyi {v}", wld: "{w}G {l}M {d}B", wl: "{w}G {l}M",
        topPct: "İlk %{n}", minGames: "{n}+ maçlı oyuncular",
        compare: "Benimle karşılaştır", compareMine: "3 bant ortalamam {me} → {gap} fark", compareAhead: "Ortalamam {me} — daha yüksek!",
        compareLogin: "Karşılaştırmak için giriş yapın", compareNoRecord: "Karşılaştırmak için maç kaydedin",
        wins: "Şampiyonluklar", winsN: "{n} şampiyonluk", winLine: "{s} sezonu · {d}", winPrize: "Ödül {m}",
        seasons: "Sezonlara göre", mPrizeRank: "Ödül sırası", mPointRank: "Puan sırası", mPrize: "Ödül",
        colSeason: "Sezon", colPrizeRank: "Ödül sırası", colPoint: "Puan", colPrize: "Ödül", more: "{n} sezon daha", less: "Daralt",
        near: "Yakın sıradakiler", nearMeta: "{s} {lg} ödül sıralaması",
        umb: "UMB Dünya Sıralaması", umbRank: "UMB Dünya {n}.", umbSub: "Dünya sıralaması geçmişi",
        faq: "Sık sorulanlar", updated: "Güncelleme {d}", source: "Kaynak: PBA Tour (pbatour.org)",
    },
    es: {
        head: "Jugador PBA", back: "Ranking PBA", notFound: "Jugador no encontrado", age: "{n} años",
        follow: "Seguir", following: "Siguiendo", followOn: "Ahora lo sigues", followLogin: "Inicia sesión para seguir jugadores",
        seasonRank: "Ranking de premios {s}", rankUnit: ".º", seasonSub: "{p} pts · {m}", careerPrize: "Premios acumulados", careerPrizeRank: "{n}.º del {lg}",
        career: "Carrera", allRecords: "Todos los récords", average: "Promedio", highRun: "Serie máxima", bank: "Bank shot", winRate: "Victorias",
        rankChip: "{n}.º {lg}", leagueAvg: "Prom. liga {v}", leagueTop: "Mejor liga {v}", wld: "{w}V {l}D {d}E", wl: "{w}V {l}D",
        topPct: "Top {n}%", minGames: "Jugadores con {n}+ partidos",
        compare: "Compárate", compareMine: "Mi promedio 3 bandas {me} → faltan {gap}", compareAhead: "Mi promedio {me} — ¡más alto!",
        compareLogin: "Inicia sesión para compararte", compareNoRecord: "Registra una partida para compararte",
        wins: "Títulos", winsN: "{n} títulos", winLine: "Temporada {s} · {d}", winPrize: "Premio {m}",
        seasons: "Por temporada", mPrizeRank: "Puesto premios", mPointRank: "Puesto puntos", mPrize: "Premio",
        colSeason: "Temporada", colPrizeRank: "Premios", colPoint: "Puntos", colPrize: "Premio", more: "{n} temporadas más", less: "Ver menos",
        near: "Jugadores cercanos", nearMeta: "Ranking {lg} {s}",
        umb: "Ranking Mundial UMB", umbRank: "UMB mundial {n}.º", umbSub: "Historial del ranking mundial",
        faq: "Preguntas frecuentes", updated: "Actualizado {d}", source: "Fuente: PBA Tour (pbatour.org)",
    },
};

const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m));

function Card({ className, children }: { className?: string; children: ReactNode }) {
    return <section className={cn("rk-card p-4 min-w-0", className)}>{children}</section>;
}
function CardHead({ title, right, onRight }: { title: ReactNode; right?: string; onRight?: () => void }) {
    return (
        <div className="flex items-center justify-between gap-2 mb-3 min-h-7">
            <h2 className="text-[17px] font-semibold text-ink-1">{title}</h2>
            {right && (
                <button type="button" onClick={onRight} className="shrink-0 inline-flex items-center gap-0.5 text-[13px] font-semibold text-ink-3 min-h-11 -my-2">
                    {right}<LucideChevronRight className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}

/** 통산 기록 한 칸 — 값 · 기록 순위 칩 · 리그 평균 대비 막대 · 한 줄 설명 */
function StatTile({ label, value, chip, pct, mark, sub }: { label: string; value: string; chip?: string | null; pct?: number | null; mark?: number | null; sub?: string }) {
    return (
        <div className="rounded-tile bg-surface-3 p-3 min-w-0">
            <div className="text-[12px] font-semibold text-ink-3">{label}</div>
            <div className="rk-num text-[23px] font-bold text-ink-1 leading-tight mt-0.5">{value}</div>
            <div className="min-h-7 mt-1">{chip && <Chip tone="gold">{chip}</Chip>}</div>
            {pct != null && (
                <div className="relative mt-2 h-1.5 rounded-full bg-surface-line" aria-hidden="true">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} />
                    {mark != null && <div className="absolute -top-1 w-0.5 h-3.5 bg-ink-3" style={{ left: `${Math.max(0, Math.min(99, mark))}%` }} />}
                </div>
            )}
            {sub && <div className="text-[11.5px] font-medium text-ink-3 mt-1.5 truncate">{sub}</div>}
        </div>
    );
}

export default function HiqPbaPlayer() {
    const { locale } = useT();
    const t = L[locale] ?? L.ko;
    const [, setLocation] = useLocation();
    const [, params] = useRoute("/pba-player/:memCode");
    const memCode = params?.memCode || "";
    const { member } = useAuth();
    const { toast } = useToast();
    const qc = useQueryClient();
    const [metric, setMetric] = useState<Metric>("prizeRank");
    const [allSeasons, setAllSeasons] = useState(false);

    const { data: p, isLoading } = useQuery<PbaPlayerProfile>({
        // v2 — 응답에 extra 가 붙었다(2026-09-27). 쿼리 캐시가 localStorage 에 남아 옛 응답을 보이지 않게 키를 올린다.
        queryKey: [`/api/hiq/pba/player/${memCode}`, "v2"],
        queryFn: async () => apiRequest(`/api/hiq/pba/player/${memCode}?v=2`),
        enabled: !!memCode,
        staleTime: 10 * 60 * 1000,
        retry: false,
    });
    // 팔로우는 보는 사람마다 다르다 — 캐시되는 선수 응답과 따로 읽는다
    const followKey = [API_FOLLOW(memCode)];
    const follow = useQuery<{ following: boolean; followers: number }>({ queryKey: followKey, enabled: !!memCode && !!p, staleTime: 60_000 });
    const [followBusy, setFollowBusy] = useState(false);
    const toggleFollow = async () => {
        if (followBusy) return;
        if (!member) { toast({ title: t.followLogin }); goLogin(setLocation); return; }
        const cur = follow.data ?? { following: false, followers: p?.extra?.followers ?? 0 };
        const next = !cur.following;
        setFollowBusy(true);
        qc.setQueryData(followKey, { following: next, followers: Math.max(0, cur.followers + (next ? 1 : -1)) });
        try {
            const r = await apiRequest(API_FOLLOW(memCode), { method: "PUT", body: { on: next } }) as { following: boolean; followers: number };
            qc.setQueryData(followKey, r);
            if (next) toast({ title: t.followOn });
        } catch {
            qc.setQueryData(followKey, cur);
        } finally { setFollowBusy(false); }
    };

    const x = p?.extra;
    const lang = locale;
    const name = p ? pbaDisplayName(p, lang) : "";
    const age = p ? pbaAge(p.birthday) : null;
    const games = p ? pbaGames(p) : 0;
    const winRate = p && games > 0 ? (p.win ?? 0) / games : null;
    const latest = p ? pbaLatestSeasonRank(p.seasons) : null;
    const latestRow = p && latest ? p.seasons.find((s) => s.season === latest.season) : undefined;
    const rk = x?.recordRanks ?? {};
    const prizeMoney = (n: number) => (lang === "ko" ? pbaPrizeLabel(n, "ko") : formatPrize(n, lang));
    const cardUrl = p ? pbaCardUrl(memCode, locale) : undefined;
    const L10 = pbaL10n(lang);
    // 제목·설명의 상금 표기 — 프리렌더와 같은 식(ko "원", 그 밖 " KRW")
    const prizeStr = p?.careerPrize != null ? `${formatPrizeKo(p.careerPrize)}${lang === "ko" ? "원" : " KRW"}` : "-";

    useSeo({
        // 선수 카드 PNG — 프리렌더와 같은 주소. 제목·설명·구조화데이터도 프리렌더와 같은 함수·같은 인자.
        image: cardUrl,
        title: p ? L10.playerTitle(name, p.league, prizeStr) : "PBA | 랭큐",
        description: p
            ? L10.playerDesc(name, lang === "ko" ? p.nameEn : null, p.league, prizeStr, p.average, p.highRun, latest, x?.wins.length)
            : "PBA 선수 프로필",
        path: `/pba-player/${memCode}`,
        locale,
        jsonLd: p && cardUrl ? { "@context": "https://schema.org", "@graph": pbaPlayerLdNodes(p, lang, cardUrl) } : null,
    });

    const faq = p ? pbaPlayerFaq(p, lang) : [];
    const chartData = (p?.seasons ?? []).map((s) => ({
        name: seasonLabel(s.season),
        prizeRank: s.prizeRank,
        pointRank: s.pointRank,
        prize: Math.round(s.prize / 1e6) / 100, // 억 단위
    }));
    const seasonsDesc = [...(p?.seasons ?? [])].reverse();
    const shownSeasons = allSeasons ? seasonsDesc : seasonsDesc.slice(0, SEASON_FOLD);
    const rankUnit = (n: number) => (lang === "ko" ? `${n}위` : `${n}${t.rankUnit}`);

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 pb-nav overflow-x-hidden">
            <header className="sticky top-0 z-20 bg-surface-0/95 backdrop-blur flex items-center gap-1 h-14 px-1">
                <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/pba"))} aria-label={t.back} className="w-11 h-11 rounded-full flex items-center justify-center text-ink-2 active:bg-surface-2">
                    <LucideChevronLeft className="w-6 h-6" />
                </button>
                <span className="flex-1 text-[16px] font-semibold truncate">{t.head}</span>
                {p && <ShareButton className="mr-1" url={`https://www.rankue.co.kr/pba-player/${memCode}`} title={name} />}
            </header>

            {isLoading && (
                <div className="px-4 flex flex-col gap-3">
                    <div className="h-56 rounded-card bg-surface-3 animate-pulse" />
                    <div className="h-28 rounded-card bg-surface-3 animate-pulse" />
                    <div className="h-64 rounded-card bg-surface-3 animate-pulse" />
                </div>
            )}
            {!isLoading && !p && (
                <div className="px-6 py-20 text-center">
                    <p className="text-[15px] font-semibold text-ink-2">{t.notFound}</p>
                    <button type="button" onClick={() => setLocation("/pba")} className="mt-4 h-11 px-5 rounded-full bg-brand text-brand-fg text-[14px] font-semibold">{t.back}</button>
                </div>
            )}

            {p && (
                <main className="px-4 flex flex-col gap-3">
                    {/* 머리 — 이름·배지·한 문장 요약(AI 검색이 인용하는 첫 문장)·팔로우·카드 */}
                    <Card className="pt-5">
                        <div className="flex items-center gap-3.5">
                            <span className="relative shrink-0 w-[72px] h-[72px] rounded-full flex items-center justify-center text-white text-[30px] font-bold"
                                style={{ background: `linear-gradient(135deg, ${crewColors(p.memCode)[0]}, ${crewColors(p.memCode)[1]})` }} aria-hidden="true">
                                {name.trim().charAt(0)}
                                {p.nationCode && <span className="absolute -right-0.5 -bottom-0.5 text-[20px] leading-none">{flagEmoji(p.nationCode)}</span>}
                            </span>
                            <div className="min-w-0 flex-1">
                                <h1 className="text-[24px] font-bold tracking-tight leading-tight truncate">{name}</h1>
                                <p className="text-[13px] font-medium text-ink-3 truncate">
                                    {[lang === "ko" ? p.nameEn : (p.nameEn ? p.nameKo : null), age != null ? fill(t.age, { n: age }) : null].filter(Boolean).join(" · ")}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    <Chip className="bg-brand text-brand-fg">{p.league}</Chip>
                                    {x && x.wins.length > 0 && <Chip tone="gold">🏆 {fill(t.winsN, { n: x.wins.length })}</Chip>}
                                    {rk.average && <Chip>{t.average} {rankUnit(rk.average.rank)}</Chip>}
                                </div>
                            </div>
                        </div>
                        <p className="mt-3.5 text-[13.5px] leading-relaxed text-ink-2">{pbaPlayerSummary(p, lang)}</p>
                        <div className="flex gap-2 mt-3.5">
                            <button
                                type="button" onClick={() => void toggleFollow()} disabled={followBusy} aria-pressed={!!follow.data?.following}
                                className={cn("flex-1 h-11 rounded-full text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-60",
                                    follow.data?.following ? "bg-brand/10 text-brand" : "bg-brand text-brand-fg")}
                            >
                                <LucideHeart className="w-[18px] h-[18px]" weight={follow.data?.following ? "fill" : "regular"} />
                                {follow.data?.following ? t.following : t.follow}
                                {(follow.data?.followers ?? x?.followers ?? 0) > 0 && <span className="rk-num opacity-80">· {(follow.data?.followers ?? x?.followers ?? 0).toLocaleString()}</span>}
                            </button>
                            <PlayerCardShareButton
                                cardUrl={pbaCardUrl(memCode, locale)}
                                filename={`rankue-pba-${memCode}.png`}
                                title={name}
                                text={`${name} — ${p.league} · https://www.rankue.co.kr/pba-player/${memCode}`}
                            />
                        </div>
                    </Card>

                    {/* 핵심 숫자 — 최근 시즌 상금랭킹 · 통산 상금 */}
                    <div className="rounded-card bg-brand text-brand-fg p-4 flex items-stretch">
                        {latest && latestRow ? (
                            <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-semibold opacity-80">{fill(t.seasonRank, { s: seasonLabel(latest.season) })}</div>
                                <div className="flex items-baseline gap-1 mt-0.5">
                                    <span className="rk-num text-[40px] font-bold leading-none">{latest.rank}</span>
                                    {lang === "ko" && <span className="text-[16px] font-bold">위</span>}
                                </div>
                                <div className="text-[12px] opacity-80 mt-1 rk-num">{fill(t.seasonSub, { p: latestRow.rankingPoint.toLocaleString(), m: prizeMoney(latestRow.prize) })}</div>
                            </div>
                        ) : null}
                        {latest && latestRow && <div className="w-px bg-white/25 mx-3.5" />}
                        <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold opacity-80">{t.careerPrize}</div>
                            <div className="rk-num text-[24px] font-bold mt-1.5 leading-tight">{p.careerPrize != null ? prizeMoney(p.careerPrize) : "-"}</div>
                            {rk.careerPrize && <div className="text-[12px] opacity-80 mt-0.5">{fill(t.careerPrizeRank, { lg: p.league, n: rk.careerPrize.rank })}</div>}
                        </div>
                    </div>

                    {/* 통산 기록 4칸 — 기록 순위 칩 · 리그 평균 대비 막대(막대 끝 = 리그 최고, 세로 금 = 리그 평균) */}
                    <Card>
                        <CardHead title={t.career} right={t.allRecords} onRight={() => setLocation("/pba/records")} />
                        <div className="grid grid-cols-2 gap-2">
                            <StatTile
                                label={t.average} value={p.average != null ? p.average.toFixed(3) : "-"}
                                chip={rk.average ? fill(t.rankChip, { lg: p.league, n: rk.average.rank }) : null}
                                pct={p.average != null ? (p.average / 2) * 100 : null} mark={x?.bench.average != null ? (x.bench.average / 2) * 100 : null}
                                sub={[x?.bench.average != null ? fill(t.leagueAvg, { v: x.bench.average.toFixed(3) }) : "", rk.average ? fill(t.topPct, { n: Math.max(1, Math.round((rk.average.rank / rk.average.of) * 100)) }) : ""].filter(Boolean).join(" · ")}
                            />
                            <StatTile
                                label={t.highRun} value={p.highRun != null ? String(p.highRun) : "-"}
                                chip={rk.highRun ? fill(t.rankChip, { lg: p.league, n: rk.highRun.rank }) : null}
                                pct={p.highRun != null && x?.bench.highRunTop ? (p.highRun / x.bench.highRunTop) * 100 : null}
                                sub={x?.bench.highRunTop != null ? fill(t.leagueTop, { v: x.bench.highRunTop }) : undefined}
                            />
                            <StatTile
                                label={t.bank} value={p.bankShotRate != null ? `${p.bankShotRate.toFixed(1)}%` : "-"}
                                chip={rk.bankShotRate ? fill(t.rankChip, { lg: p.league, n: rk.bankShotRate.rank }) : null}
                                pct={p.bankShotRate != null ? p.bankShotRate * 2 : null} mark={x?.bench.bankShotRate != null ? x.bench.bankShotRate * 2 : null}
                                sub={x?.bench.bankShotRate != null ? fill(t.leagueAvg, { v: `${x.bench.bankShotRate.toFixed(1)}%` }) : undefined}
                            />
                            <StatTile
                                label={t.winRate} value={winRate != null ? `${Math.round(winRate * 100)}%` : "-"}
                                chip={rk.winRate ? fill(t.rankChip, { lg: p.league, n: rk.winRate.rank }) : null}
                                pct={winRate != null ? winRate * 100 : null} mark={x?.bench.winRate != null ? x.bench.winRate * 100 : null}
                                sub={p.win != null ? (p.draw ? fill(t.wld, { w: p.win, l: p.lose ?? 0, d: p.draw }) : fill(t.wl, { w: p.win, l: p.lose ?? 0 })) : undefined}
                            />
                        </div>
                        <p className="text-[11.5px] text-ink-4 mt-2.5">{fill(t.minGames, { n: PBA_RECORDS_MIN_GAMES })}</p>
                        {/* "선수 연봉" 으로 들어온 방문자에게 주는 정확한 답 — 상금을 연봉이라 부르지 않는다 */}
                        {lang === "ko" && <p className="text-[11.5px] text-ink-3 leading-relaxed mt-1.5">{PBA_INCOME_NOTE_KO}</p>}
                    </Card>

                    {/* 나와 비교하기(2026-09-27) — 가입 전에는 넣어 보고, 회원은 내 기록으로. UMB 선수 페이지와 같은 부품 */}
                    <ProCompareCard
                        proName={name} proAvg={p.average} proHighRun={p.highRun} proWinRate={winRate}
                        excludeMemCode={p.memCode} umbRank={x?.umbRank ?? null}
                    />

                    {/* 우승 — 누르면 그 대회 페이지 */}
                    {x && x.wins.length > 0 && (
                        <Card>
                            <CardHead title={fill(t.winsN, { n: x.wins.length })} />
                            <ul className="divide-y divide-surface-line -my-1">
                                {x.wins.map((w) => (
                                    <li key={w.path}>
                                        <a href={w.path} onClick={(e) => { e.preventDefault(); setLocation(w.path); }} className="flex items-center gap-3 py-2.5 min-h-14">
                                            <span className="w-10 h-10 shrink-0 rounded-xl bg-[#F5B721]/15 text-[#8a6a0a] flex items-center justify-center"><LucideTrophy className="w-5 h-5" /></span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-[14px] font-semibold truncate">{w.title}</span>
                                                <span className="block text-[12px] text-ink-3 rk-num">
                                                    {fill(t.winLine, { s: seasonLabel(w.season), d: w.startDate.replace(/-/g, ".") })}{w.winnerPrize ? ` · ${fill(t.winPrize, { m: prizeMoney(w.winnerPrize) })}` : ""}
                                                </span>
                                            </span>
                                            <LucideChevronRight className="w-4 h-4 text-ink-4 shrink-0" />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}

                    {/* 시즌별 기록 — 그래프 전환(상금 순위·포인트 순위·상금) + 표. 시즌이 하나여도 표는 보인다 */}
                    {p.seasons.length > 0 && (
                        <Card className="overflow-hidden">
                            <CardHead title={t.seasons} />
                            {chartData.length > 1 && (
                                <>
                                    <div className="flex gap-1.5 mb-2" role="tablist">
                                        {(["prizeRank", "pointRank", "prize"] as Metric[]).map((m) => (
                                            <button key={m} type="button" role="tab" aria-selected={metric === m} onClick={() => setMetric(m)}
                                                className={cn("h-8 px-3 rounded-full text-[12.5px] font-semibold", metric === m ? "bg-ink-1 text-surface-1" : "bg-surface-3 text-ink-2")}>
                                                {m === "prizeRank" ? t.mPrizeRank : m === "pointRank" ? t.mPointRank : t.mPrize}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="h-[170px] min-w-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={chartData} margin={{ top: 18, right: 12, bottom: 0, left: -18 }}>
                                                <CartesianGrid vertical={false} stroke={GRID} />
                                                <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: AXIS }} axisLine={false} tickLine={false} />
                                                {metric === "prize" ? (
                                                    <YAxis tick={{ fontSize: 10, fill: AXIS }} axisLine={false} tickLine={false} />
                                                ) : (
                                                    <YAxis reversed allowDecimals={false} domain={[1, "dataMax"]} tick={{ fontSize: 10, fill: AXIS }} axisLine={false} tickLine={false} />
                                                )}
                                                <Tooltip
                                                    formatter={(v: any) => (metric === "prize" ? [`${v}${lang === "ko" ? "억" : "00M"}`, t.mPrize] : [rankUnit(Number(v)), metric === "prizeRank" ? t.mPrizeRank : t.mPointRank])}
                                                    contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.12)", fontSize: 12 }}
                                                />
                                                {metric === "prize" ? (
                                                    <Bar dataKey="prize" fill={BRAND} opacity={0.8} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                                                ) : (
                                                    <Line dataKey={metric} stroke={BRAND} strokeWidth={2.5} dot={{ r: 4, fill: "#fff", stroke: BRAND, strokeWidth: 2.5 }} connectNulls isAnimationActive={false}>
                                                        <LabelList dataKey={metric} position="top" formatter={(v: any) => (v == null ? "" : rankUnit(Number(v)))} style={{ fontSize: 10.5, fontWeight: 700, fill: BRAND }} />
                                                    </Line>
                                                )}
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </>
                            )}
                            <table className="w-full mt-2 text-[13px] rk-num">
                                <thead>
                                    <tr className="text-[11.5px] text-ink-3 font-semibold">
                                        <th className="text-left font-semibold py-2">{t.colSeason}</th>
                                        <th className="text-left font-semibold">{t.colPrizeRank}</th>
                                        <th className="text-left font-semibold">{t.colPoint}</th>
                                        <th className="text-right font-semibold">{t.colPrize}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shownSeasons.map((s) => (
                                        <tr key={s.season} className="border-t border-surface-line">
                                            <td className="py-2.5 font-semibold">{seasonLabel(s.season)}</td>
                                            <td className="font-semibold text-brand">{s.prizeRank != null ? rankUnit(s.prizeRank) : "-"}</td>
                                            <td>{s.rankingPoint.toLocaleString()}</td>
                                            <td className="text-right">{prizeMoney(s.prize)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {seasonsDesc.length > SEASON_FOLD && (
                                <button type="button" onClick={() => setAllSeasons((v) => !v)} className="w-full min-h-11 mt-1 inline-flex items-center justify-center gap-1 text-[12.5px] font-semibold text-ink-3">
                                    {allSeasons ? t.less : fill(t.more, { n: seasonsDesc.length - SEASON_FOLD })}
                                    <LucideChevronDown className={cn("w-3.5 h-3.5 transition-transform", allSeasons && "rotate-180")} />
                                </button>
                            )}
                        </Card>
                    )}

                    {/* 비슷한 순위의 선수 — 옆으로 넘기며 다른 선수로 이어진다 */}
                    {x?.neighbors && (
                        <Card>
                            <CardHead title={t.near} right={fill(t.nearMeta, { s: seasonLabel(x.neighbors.season), lg: x.neighbors.league })} onRight={() => setLocation("/pba")} />
                            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
                                {x.neighbors.rows.map((r) => {
                                    const nm = lang === "ko" ? r.nameKo : (r.nameEn || r.nameKo);
                                    const [c0, c1] = crewColors(r.memCode);
                                    return (
                                        <a key={r.memCode} href={`/pba-player/${encodeURIComponent(r.memCode)}`}
                                            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0 }); setLocation(`/pba-player/${encodeURIComponent(r.memCode)}`); }}
                                            className="w-[84px] shrink-0 flex flex-col items-center text-center py-1 active:opacity-80">
                                            <span className="relative">
                                                <span className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[16px] font-bold" style={{ background: `linear-gradient(135deg, ${c0}, ${c1})` }}>{nm.trim().charAt(0)}</span>
                                                <span className="absolute -left-1.5 -top-1 rk-num text-[10.5px] font-bold bg-surface-1 border border-surface-line rounded-full px-1.5">{r.prizeRank}</span>
                                            </span>
                                            <span className="mt-1.5 text-[12.5px] font-semibold w-full truncate">{nm}</span>
                                            <span className="text-[11px] text-ink-4">{flagEmoji(r.nationCode ?? "")}</span>
                                        </a>
                                    );
                                })}
                            </div>
                        </Card>
                    )}

                    {/* UMB 세계랭킹 — 양쪽 페이지를 잇는다 */}
                    {p.umbPlayerId && p.umbCategory && (
                        <a href={`/player/${p.umbCategory}/${p.umbPlayerId}`} onClick={(e) => { e.preventDefault(); setLocation(`/player/${p.umbCategory}/${p.umbPlayerId}`); }}
                            className="rounded-card bg-ink-1 text-surface-1 p-4 flex items-center gap-3 active:opacity-90">
                            <span className="w-10 h-10 rounded-xl bg-surface-1/15 flex items-center justify-center"><LucideGlobe className="w-5 h-5" /></span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[14px] font-semibold">{x?.umbRank ? fill(t.umbRank, { n: x.umbRank }) : t.umb}</span>
                                <span className="block text-[12px] opacity-70">{t.umbSub}</span>
                            </span>
                            <LucideChevronRight className="w-4 h-4 shrink-0" />
                        </a>
                    )}

                    {/* 응원 한마디 — UMB·골프 선수와 같은 부품·같은 안전장치(category=pba) */}
                    <Card>
                        <PlayerCheers category="pba" playerUmbId={memCode} basePath="/api/hiq/pba/players" />
                    </Card>

                    {/* 자주 묻는 질문 — FAQPage 구조화데이터와 같은 목록. details 라 닫혀 있어도 본문이 문서에 있다 */}
                    {faq.length > 0 && (
                        <Card>
                            <CardHead title={t.faq} />
                            <div className="divide-y divide-surface-line -my-1">
                                {faq.map((f, i) => (
                                    <details key={f.q} open={i === 0} className="group py-1">
                                        <summary className="list-none flex items-center justify-between gap-2 min-h-11 cursor-pointer text-[14px] font-semibold">
                                            <h3 className="min-w-0">{f.q}</h3>
                                            <LucideChevronDown className="w-4 h-4 text-ink-4 shrink-0 transition-transform group-open:rotate-180" />
                                        </summary>
                                        <p className="text-[13px] text-ink-2 leading-relaxed pb-2">{f.a}</p>
                                    </details>
                                ))}
                            </div>
                        </Card>
                    )}

                    <p className="flex items-center gap-1 text-[11.5px] text-ink-4 px-1 pb-2">
                        <LucideClock className="w-3 h-3 shrink-0" />
                        <span>{x?.updated ? `${fill(t.updated, { d: x.updated.replace(/-/g, ".") })} · ` : ""}{t.source}</span>
                    </p>
                </main>
            )}
            <HiqNavigation />
        </div>
    );
}
