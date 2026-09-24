import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { flagEmoji } from "@/lib/flag";
import { useT, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronLeft, LucideChevronRight } from "@/lib/icons";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { ShareButton } from "@/components/hiq/ShareButton";
import { Section, Chip, List } from "@/components/hiq/umb/ui";
import { PBA_INCOME_NOTE_KO } from "@shared/pbaMeta";
import {
    PBA_RECORDS_MIN_GAMES, PBA_RECORDS_PATH, PBA_RECORDS_RULE_KO, PBA_RECORDS_TITLE, PBA_RECORDS_TOP, PBA_RECORD_DEFS,
    PBA_RECORD_KEYS, PBA_RECORD_LEAGUES, cutKo, dateKo, eligibleKo, pbaRecordsDescription, pbaRecordsLdNodes, recordLeague,
    recordLineKo, recordSection, recordValue,
    type PbaLeague, type PbaRecordKey, type PbaRecordRow, type PbaRecordSection, type PbaRecordsReport,
} from "@shared/pbaRecordsMeta";

// PBA·LPBA 통산 기록 순위(2026-09-24) — /pba/records. 공개 페이지(검색 유입 대상, 봇에게는 server/seo/pbaRecords.ts 가 같은 내용을 준다).
// pba_players 에 이미 적재한 통산 기록(에버리지·하이런·뱅크샷·승·패·무·상금)만으로 리그별 톱 20.
// 순위·제목·설명·한국어 표기는 shared/pbaRecordsMeta — 프리렌더와 같은 함수다. 사진 없이 국기·이름·숫자만(초상권).

// 문구는 이 페이지에만 쓰여 사전(ko.ts 등)에 넣지 않고 pba.tsx 처럼 페이지 쪽 표로 둔다.
// 한국어는 shared 문구(PBA_RECORD_DEFS·PBA_RECORDS_RULE_KO)를 그대로 써서 봇 문서와 글자까지 같다.
interface Text {
    title: string; sub: string; back: string; top: (n: number) => string; leader: string;
    label: Record<PbaRecordKey, string>; desc: Record<PbaRecordKey, string>; rule: string;
    eligible: (key: PbaRecordKey, n: number) => string; line: (r: PbaRecordRow) => string;
    /** 톱 20 경계에서 잘린 공동 순위 안내 */
    cut: (c: NonNullable<PbaRecordSection["cut"]>) => string;
    players: (n: number) => string; qualified: (n: number) => string; updated: (d: string) => string;
    empty: string; loadError: string; retry: string; source: string; seasonLink: string;
}

const KO_LABEL = Object.fromEntries(PBA_RECORD_KEYS.map((k) => [k, PBA_RECORD_DEFS[k].label])) as Record<PbaRecordKey, string>;
const KO_DESC = Object.fromEntries(PBA_RECORD_KEYS.map((k) => [k, PBA_RECORD_DEFS[k].desc])) as Record<PbaRecordKey, string>;
const MIN = PBA_RECORDS_MIN_GAMES;
const minOf = (k: PbaRecordKey) => PBA_RECORD_DEFS[k].minGames;

const DATE_LOCALE: Record<Locale, string> = { ko: "ko-KR", en: "en-US", vi: "vi-VN", tr: "tr-TR", es: "es-ES" };
/** "YYYY-MM-DD" 를 UTC 로 고정해 읽는다(브라우저 시간대가 날짜를 하루 밀지 않게) */
function dateIn(ymd: string, locale: Locale): string {
    if (locale === "ko") return dateKo(ymd);
    try {
        return new Intl.DateTimeFormat(DATE_LOCALE[locale], { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
            .format(new Date(`${ymd.slice(0, 10)}T00:00:00Z`));
    } catch {
        return ymd;
    }
}

const TEXT: Record<Locale, Text> = {
    ko: {
        title: "통산 기록 순위", sub: "PBA·LPBA 프로당구 통산 기록", back: "PBA 투어 랭킹", top: (n) => `톱 ${n}`, leader: "1위",
        label: KO_LABEL, desc: KO_DESC, rule: PBA_RECORDS_RULE_KO,
        eligible: eligibleKo, line: recordLineKo, cut: cutKo,
        players: (n) => `기록 있는 선수 ${n}명`, qualified: (n) => `${MIN}경기 이상 ${n}명`,
        updated: (d) => `${d} 갱신 · 선수별로 돌아가며`,
        empty: "아직 순위에 들 선수가 없어요", loadError: "통산 기록을 불러오지 못했어요", retry: "다시 시도",
        source: "출처: PBA 투어 공식 기록", seasonLink: "PBA 투어 시즌 랭킹",
    },
    en: {
        title: "Career records", sub: "PBA · LPBA pro billiards career leaders", back: "PBA Tour rankings", top: (n) => `Top ${n}`, leader: "No.1",
        label: { average: "Career average", highRun: "High run", bankShotRate: "Bank shot rate", winRate: "Win rate", careerPrize: "Career prize money" },
        desc: {
            average: "Points per inning — the career average from PBA official records.",
            highRun: "Best unbroken run in a single inning (PBA official records). Every player counts, regardless of matches played.",
            bankShotRate: "The bank-shot figure (%) as published in PBA official records. A bank shot hits a cushion before the first object ball and is worth 2 points under PBA rules.",
            winRate: "Wins ÷ (wins + losses + draws), shown to one decimal place.",
            careerPrize: "Career prize money (KRW) from PBA official records. Every player counts, regardless of matches played.",
        },
        rule: `Average, bank-shot rate and win rate only rank players with at least ${MIN} career matches (W+L+D), so a handful of matches can't top a rate. High run and prize money count everyone. Equal records share a rank; the player with more matches is listed first.`,
        eligible: (k, n) => (minOf(k) ? `of ${n} with ${MIN}+ matches` : `of ${n} with a record`),
        line: (r) => `${r.games} matches · ${r.win}W ${r.lose}L${r.draw ? ` ${r.draw}D` : ""}`,
        cut: (c) => `${c.tied} players share No.${c.rank}; only the ${c.shown} with the most matches are listed.`,
        players: (n) => `${n} with career stats`, qualified: (n) => `${n} with ${MIN}+ matches`,
        updated: (d) => `Updated ${d} · players refreshed in rotation`,
        empty: "No player qualifies yet", loadError: "Couldn't load career records", retry: "Try again",
        source: "Source: PBA Tour official records", seasonLink: "PBA Tour season rankings",
    },
    vi: {
        title: "Thành tích sự nghiệp", sub: "Dẫn đầu sự nghiệp PBA · LPBA", back: "BXH PBA", top: (n) => `Top ${n}`, leader: "Hạng 1",
        label: { average: "Average sự nghiệp", highRun: "High run", bankShotRate: "Tỷ lệ bank shot", winRate: "Tỷ lệ thắng", careerPrize: "Tổng tiền thưởng" },
        desc: {
            average: "Điểm trung bình mỗi lượt cơ — average sự nghiệp theo hồ sơ chính thức PBA.",
            highRun: "Chuỗi điểm liên tiếp cao nhất trong một lượt (hồ sơ chính thức PBA). Tính mọi cơ thủ, không phụ thuộc số trận.",
            bankShotRate: "Chỉ số bank shot (%) đúng như hồ sơ chính thức PBA công bố. Bank shot là cú đánh chạm băng trước bi mục tiêu đầu tiên, được 2 điểm theo luật PBA.",
            winRate: "Thắng ÷ (thắng + thua + hòa), làm tròn một chữ số thập phân.",
            careerPrize: "Tổng tiền thưởng sự nghiệp (KRW) theo hồ sơ chính thức PBA. Tính mọi cơ thủ, không phụ thuộc số trận.",
        },
        rule: `Average, tỷ lệ bank shot và tỷ lệ thắng chỉ xếp hạng cơ thủ có từ ${MIN} trận sự nghiệp (thắng+thua+hòa), để vài trận lẻ không đứng đầu. High run và tiền thưởng tính mọi cơ thủ. Thành tích bằng nhau thì đồng hạng; ai đấu nhiều trận hơn đứng trước.`,
        eligible: (k, n) => (minOf(k) ? `trong ${n} cơ thủ từ ${MIN} trận` : `trong ${n} cơ thủ có số liệu`),
        line: (r) => `${r.games} trận · ${r.win}T ${r.lose}B${r.draw ? ` ${r.draw}H` : ""}`,
        cut: (c) => `${c.tied} cơ thủ đồng hạng ${c.rank}; chỉ liệt kê ${c.shown} cơ thủ đấu nhiều trận nhất.`,
        players: (n) => `${n} cơ thủ có số liệu`, qualified: (n) => `${n} cơ thủ từ ${MIN} trận`,
        updated: (d) => `Cập nhật ${d} · luân phiên từng cơ thủ`,
        empty: "Chưa có cơ thủ đủ điều kiện", loadError: "Không tải được thành tích sự nghiệp", retry: "Thử lại",
        source: "Nguồn: hồ sơ chính thức PBA Tour", seasonLink: "BXH mùa giải PBA Tour",
    },
    tr: {
        title: "Kariyer rekorları", sub: "PBA · LPBA kariyer liderleri", back: "PBA Sıralaması", top: (n) => `İlk ${n}`, leader: "1.",
        label: { average: "Kariyer ortalaması", highRun: "En yüksek seri", bankShotRate: "Bank atışı oranı", winRate: "Kazanma oranı", careerPrize: "Kariyer para ödülü" },
        desc: {
            average: "Istaka başına ortalama sayı — PBA resmî kayıtlarındaki kariyer ortalaması.",
            highRun: "Tek istakada kesintisiz en yüksek seri (PBA resmî kayıtları). Maç sayısından bağımsız olarak tüm oyuncular sayılır.",
            bankShotRate: "PBA resmî kayıtlarında yayımlanan bank atışı değeri (%). Bank atışı, ilk hedef topa değmeden önce bandı bulan sayıdır ve PBA kurallarında 2 puandır.",
            winRate: "Galibiyet ÷ (galibiyet + mağlubiyet + beraberlik), bir ondalık basamakla.",
            careerPrize: "PBA resmî kayıtlarındaki kariyer para ödülü (KRW). Maç sayısından bağımsız olarak tüm oyuncular sayılır.",
        },
        rule: `Ortalama, bank atışı oranı ve kazanma oranı yalnızca en az ${MIN} kariyer maçı (G+M+B) olan oyuncuları sıralar; birkaç maç bir oranı zirveye taşımasın diye. En yüksek seri ve para ödülü herkesi sayar. Eşit rekorlar aynı sırayı paylaşır; daha çok maçı olan önce yazılır.`,
        eligible: (k, n) => (minOf(k) ? `${MIN}+ maçlı ${n} oyuncu içinden` : `kaydı olan ${n} oyuncu içinden`),
        line: (r) => `${r.games} maç · ${r.win}G ${r.lose}M${r.draw ? ` ${r.draw}B` : ""}`,
        cut: (c) => `${c.rank}. sırayı ${c.tied} oyuncu paylaşıyor; yalnızca en çok maçı olan ${c.shown} oyuncu yazıldı.`,
        players: (n) => `Kariyer verisi olan ${n} oyuncu`, qualified: (n) => `${MIN}+ maçlı ${n} oyuncu`,
        updated: (d) => `${d} güncellendi · oyuncular sırayla`,
        empty: "Henüz koşulu sağlayan oyuncu yok", loadError: "Kariyer rekorları yüklenemedi", retry: "Tekrar dene",
        source: "Kaynak: PBA Tour resmî kayıtları", seasonLink: "PBA Tur sezon sıralaması",
    },
    es: {
        title: "Récords de carrera", sub: "Líderes de carrera PBA · LPBA", back: "Ranking PBA", top: (n) => `Top ${n}`, leader: "N.º 1",
        label: { average: "Promedio de carrera", highRun: "Serie mayor", bankShotRate: "Tasa de bank shot", winRate: "Porcentaje de victorias", careerPrize: "Premios acumulados" },
        desc: {
            average: "Carambolas por entrada — el promedio de carrera de los registros oficiales de la PBA.",
            highRun: "La mejor serie sin fallo en una sola entrada (registros oficiales de la PBA). Cuenta a todos los jugadores, sin importar los partidos jugados.",
            bankShotRate: "La cifra de bank shot (%) tal como la publica la PBA. Un bank shot toca banda antes de la primera bola y vale 2 puntos en las reglas de la PBA.",
            winRate: "Victorias ÷ (victorias + derrotas + empates), con un decimal.",
            careerPrize: "Premios acumulados (KRW) según los registros oficiales de la PBA. Cuenta a todos los jugadores, sin importar los partidos jugados.",
        },
        rule: `Promedio, tasa de bank shot y porcentaje de victorias solo clasifican a jugadores con al menos ${MIN} partidos de carrera (V+D+E), para que unos pocos partidos no encabecen una tasa. Serie mayor y premios cuentan a todos. Los récords iguales comparten puesto; primero va quien jugó más partidos.`,
        eligible: (k, n) => (minOf(k) ? `de ${n} con ${MIN}+ partidos` : `de ${n} con registro`),
        line: (r) => `${r.games} partidos · ${r.win}V ${r.lose}D${r.draw ? ` ${r.draw}E` : ""}`,
        cut: (c) => `${c.tied} jugadores comparten el puesto ${c.rank}; solo se listan los ${c.shown} con más partidos.`,
        players: (n) => `${n} con datos de carrera`, qualified: (n) => `${n} con ${MIN}+ partidos`,
        updated: (d) => `Actualizado ${d} · por turnos`,
        empty: "Todavía no hay jugadores que cumplan el mínimo", loadError: "No se pudieron cargar los récords", retry: "Reintentar",
        source: "Fuente: registros oficiales del PBA Tour", seasonLink: "Ranking de temporada PBA Tour",
    },
};

const playerPath = (memCode: string) => `/pba-player/${encodeURIComponent(memCode)}`;

/** 선수 한 줄 — 선수 페이지로 가는 진짜 링크(<a>)라 크롤러도 따라간다 */
function RecordRow({ row, k, locale, T }: { row: PbaRecordRow; k: PbaRecordKey; locale: Locale; T: Text }) {
    const main = locale === "ko" ? row.nameKo : (row.nameEn || row.nameKo);
    const other = locale === "ko" ? row.nameEn : (row.nameEn ? row.nameKo : null);
    return (
        <Link href={playerPath(row.memCode)} className="flex items-center gap-3 px-3.5 py-3 hover:bg-black/5 transition-colors">
            <span className={cn("w-8 shrink-0 text-center text-[14px] font-bold tabular-nums", row.rank <= 3 ? "text-brand" : "text-ink-3")}>
                {row.rank}
            </span>
            <span className="text-[16px] leading-none shrink-0" aria-hidden>{flagEmoji(row.nationCode) || "🏳️"}</span>
            <span className="flex-1 min-w-0">
                <span className="block truncate text-[14px] font-semibold text-ink-1">
                    {main}
                    {other && <span className="ml-1.5 text-[12px] font-medium text-ink-3">{other}</span>}
                </span>
                <span className="block truncate text-[12px] font-medium text-ink-3 mt-0.5 tabular-nums">{T.line(row)}</span>
            </span>
            <span className="shrink-0 text-right text-[15px] font-bold tabular-nums text-ink-1">{recordValue(k, row.value, locale)}</span>
        </Link>
    );
}

export default function HiqPbaRecords() {
    const { locale } = useT();
    const T = TEXT[locale] ?? TEXT.en;
    const [, setLocation] = useLocation();
    const [league, setLeague] = useState<PbaLeague>("PBA");
    const [key, setKey] = useState<PbaRecordKey>("average");

    const { data, isLoading, isError, refetch, isFetching } = useQuery<PbaRecordsReport>({
        queryKey: ["/api/hiq/pba/records"],
        queryFn: async () => apiRequest("/api/hiq/pba/records"),
        staleTime: 10 * 60 * 1000,
    });

    // 제목·설명은 프리렌더와 같은 함수(shared/pbaRecordsMeta) — 화면 언어와 상관없이 한국어 정본 주소의 메타.
    // jsonLd 는 useSeo 의 effect 의존값이라 매 렌더 새 객체면 탭을 누를 때마다 <head> 스크립트를 지웠다 다시 단다 — 묶어 둔다
    const seo = useMemo(() => data ? {
        title: PBA_RECORDS_TITLE,
        description: pbaRecordsDescription(data),
        path: PBA_RECORDS_PATH,
        jsonLd: { "@context": "https://schema.org", "@graph": pbaRecordsLdNodes(data) },
    } : null, [data]);
    useSeo(seo);

    const lg = data ? recordLeague(data, league) : undefined;
    const sec = lg ? recordSection(lg, key) : undefined;
    const def = PBA_RECORD_DEFS[key];
    const top = sec?.rows[0];
    const empty = !!data && data.leagues.every((l) => l.players === 0);

    return (
        <div className="min-h-screen bg-surface-0 text-ink-1 px-5 pt-6 pb-nav relative overflow-x-hidden font-sans">
            <div className="flex items-center gap-3 mb-5 relative z-10">
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setLocation("/pba")}
                    className="w-11 h-11 shrink-0 rounded-full bg-surface-1 flex items-center justify-center transition-transform text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    aria-label={T.back}
                >
                    <LucideChevronLeft className="w-5 h-5" />
                </motion.button>
                <div className="min-w-0">
                    <h1 className="text-[24px] font-bold tracking-tight text-ink-1 leading-tight truncate">{T.title}</h1>
                    <p className="text-[13px] font-medium text-ink-3 mt-1 truncate">{T.sub}</p>
                </div>
                <ShareButton className="ml-auto shrink-0" url={`https://www.rankue.co.kr${PBA_RECORDS_PATH}`} title={PBA_RECORDS_TITLE} />
            </div>

            {isLoading && (
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[60px] rounded-2xl bg-black/5 animate-pulse" />)}
                </div>
            )}
            {/* 불러오기 실패는 '기록이 없다'와 다르다 — 같은 문구로 뭉개면 데이터가 없는 것처럼 읽힌다 */}
            {!isLoading && isError && !data && (
                <div className="rk-card p-8 text-center">
                    <p className="text-[14px] font-semibold text-ink-2">{T.loadError}</p>
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="inline-flex mt-4 h-11 px-5 items-center rounded-full bg-surface-3 text-[13.5px] font-semibold text-ink-1 disabled:opacity-50"
                    >
                        {T.retry}
                    </button>
                </div>
            )}
            {empty && <div className="rk-card p-8 text-center text-[14px] font-semibold text-ink-3">{T.empty}</div>}

            {data && !empty && lg && (
                <div className="flex flex-col gap-4 relative z-10">
                    {locale === "ko" && (
                        <p className="text-[13.5px] font-medium text-ink-2 leading-relaxed px-1">{pbaRecordsDescription(data)}</p>
                    )}

                    {/* 리그 탭 — /pba 와 같은 모양 */}
                    <div className="flex gap-1.5">
                        {PBA_RECORD_LEAGUES.map((l) => (
                            <button
                                key={l}
                                onClick={() => setLeague(l)}
                                className={cn(
                                    "h-9 px-4 rounded-full text-[13.5px] font-semibold transition-colors",
                                    league === l ? "bg-ink-1 text-white" : "bg-surface-1 text-ink-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                                )}
                            >
                                {l}
                            </button>
                        ))}
                    </div>

                    <div className="rk-card p-5 flex flex-col gap-5">
                        {/* 기록 고르기 — 다섯 개라 좁은 화면에서는 옆으로 민다 */}
                        <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-0.5 scrollbar-hide">
                            {PBA_RECORD_KEYS.map((k) => (
                                <button
                                    key={k}
                                    onClick={() => setKey(k)}
                                    className={cn(
                                        "shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors",
                                        key === k ? "bg-brand text-brand-fg" : "bg-surface-3 text-ink-2",
                                    )}
                                >
                                    {PBA_RECORD_DEFS[k].emoji} {T.label[k]}
                                </button>
                            ))}
                        </div>

                        {/* 1위 — 초록 히어로 밴드 하나(선수 페이지 디자인 언어) */}
                        {top && (
                            <Link href={playerPath(top.memCode)} className="rounded-2xl bg-brand text-brand-fg px-4 py-4 block active:scale-[0.99] transition-transform">
                                <div className="text-[12px] font-semibold text-white/70 truncate">
                                    {def.emoji} {league} {T.label[key]} {T.leader}
                                </div>
                                {/* 상금("10억 4,150만원")처럼 값이 길면 375px 에서 이름이 두세 글자로 잘린다 — 그때는 값이 다음 줄 오른쪽으로 내려간다 */}
                                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <span className="min-w-0 max-w-full truncate text-[18px] font-bold leading-snug">
                                        {flagEmoji(top.nationCode)} {locale === "ko" ? top.nameKo : (top.nameEn || top.nameKo)}
                                    </span>
                                    <span className="ml-auto shrink-0 text-[26px] font-bold leading-none tabular-nums">{recordValue(key, top.value, locale)}</span>
                                </div>
                                <div className="mt-1.5 text-[12px] font-semibold text-white/70 tabular-nums">{T.line(top)}</div>
                            </Link>
                        )}

                        <Section
                            emoji={def.emoji}
                            title={`${T.label[key]} ${T.top(PBA_RECORDS_TOP)}`}
                            meta={sec ? T.eligible(key, sec.eligible) : undefined}
                        >
                            <p className="text-[12px] font-medium text-ink-3 leading-snug -mt-1.5 mb-3">{T.desc[key]}</p>
                            {sec && sec.rows.length ? (
                                <>
                                    <List>
                                        {sec.rows.map((r) => <RecordRow key={r.memCode} row={r} k={key} locale={locale} T={T} />)}
                                    </List>
                                    {sec.cut && (
                                        <p className="text-[12px] font-medium text-ink-3 leading-snug mt-2 px-1">{T.cut(sec.cut)}</p>
                                    )}
                                </>
                            ) : (
                                <div className="rounded-2xl bg-surface-3 p-6 text-center text-[13.5px] font-semibold text-ink-3">{T.empty}</div>
                            )}
                        </Section>
                    </div>

                    {/* 인원·갱신일 — 긴 문장 대신 칩 */}
                    <div className="flex flex-wrap gap-1.5">
                        <Chip>👥 <span className="tabular-nums">{T.players(lg.players)}</span></Chip>
                        <Chip tone="brand">📏 <span className="tabular-nums">{T.qualified(lg.qualified)}</span></Chip>
                        {/* 영어·베트남어 문구는 375px 에서 한 줄(nowrap 칩)을 넘는다 — 이 칩만 줄바꿈을 허용한다 */}
                        {lg.updated && (
                            <Chip className="h-auto min-h-7 py-1.5 whitespace-normal leading-snug">🗓 {T.updated(dateIn(lg.updated, locale))}</Chip>
                        )}
                    </div>
                    <p className="text-[12.5px] font-medium text-ink-3 leading-relaxed px-1">{T.rule}</p>
                    {/* "선수 연봉" 검색 대응 — 상금을 연봉으로 부르지 않고 사실을 밝힌다(/pba 와 같은 문구) */}
                    {locale === "ko" && (
                        <p className="text-[12.5px] font-medium text-ink-3 leading-relaxed px-1">{PBA_INCOME_NOTE_KO}</p>
                    )}

                    <Link href="/pba" className="h-12 px-5 rounded-2xl bg-surface-1 text-ink-1 text-[14px] font-semibold flex items-center justify-between shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                        {T.seasonLink} <LucideChevronRight className="w-4 h-4 text-ink-3" />
                    </Link>
                    <a href="https://www.pbatour.org" target="_blank" rel="noopener noreferrer" className="text-center text-[12px] font-medium text-ink-3 py-2">
                        {T.source}
                    </a>
                </div>
            )}

            <HiqNavigation />
        </div>
    );
}
