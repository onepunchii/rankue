/**
 * 당구 대회 허브·시즌·대회 페이지(2026-09-24) 공용 조각 — 문구표, 날짜·이름 표기, 머리줄, 상태 칩.
 * 문구는 이 화면들에만 쓰여 사전(ko.ts 등)에 넣지 않고 페이지 쪽 표로 둔다(rankingExtraParts 와 같은 방식).
 * 제목·설명(SEO)은 여기 말고 shared/tournamentMeta.ts — 프리렌더와 같은 함수여야 한다.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { LucideChevronLeft } from "@/lib/icons";
import { ShareButton } from "@/components/hiq/ShareButton";
import { regionName } from "@/components/hiq/umb/types";
import { formatPrize } from "@shared/pbaMeta";
import { fedNameKo } from "@shared/umbCountryMeta";
import {
    cityKo, dateRangeKo, isJuniorEvent, seasonLabelFull, shortRange,
    type PbaTourLeague, type TourStatus, type UmbEventSummary,
} from "@shared/tournamentMeta";

const ORIGIN = "https://www.rankue.co.kr";

interface TourText {
    hubTitle: string; hubSub: string;
    upcoming: string; upcomingEmpty: string; umbCalFail: string; live: string; postponed: string;
    pbaSeasons: string; seasonCounts: (tours: number, finished: number) => string; winnersTop: string; openWinners: (n: number) => string;
    umbEvents: string; umbEventsDesc: string; playersWithPoints: (n: number) => string; year: (y: string) => string;
    showMore: (n: number) => string; official: string; umbCalendar: string; source: string;
    loading: string; loadError: string; retry: string; notFound: string; notFoundDesc: string; allTournaments: string; back: string;
    seasonSub: string; all: string; toursTile: string; finishedTile: string; upcomingTile: string; otherSeasons: string; season: (label: string) => string;
    winner: string; noTourPage: string;
    info: string; totalPrize: string; winnerPrize: string; participants: string; people: (n: number) => string;
    winnerH: string; winnerPending: string; noWinner: string; careerNote: string; average: string; highRun: string; bankShot: string;
    record: (w: number, l: number, d: number) => string; recordLabel: string; careerPrize: string;
    history: string; historyDesc: string; prev: string; next: string; seasonAll: string; officialPage: string;
    status: Record<TourStatus, string>;
    umbName: (e: Pick<UmbEventSummary, "kind" | "city" | "date" | "categories">) => string;
    /** 해 묶음 안에서 쓰는 짧은 이름(연도 없이) */
    umbShort: (e: Pick<UmbEventSummary, "kind" | "city" | "categories">) => string;
    kind: { worldcup: string; worldchamp: string };
    pointsH: string; pointsDesc: (edition: string) => string; krH: string; playersTile: string; krTile: string; topTile: string;
    org: string; dateLabel: string; others: string; umbSite: string; pts: (n: number) => string; cat: Record<string, string>;
    pbaRanking: string; worldRanking: string;
}

const KO: TourText = {
    hubTitle: "당구 대회", hubSub: "PBA·UMB 3쿠션 대회 일정과 결과",
    upcoming: "다가오는 대회", upcomingEmpty: "앞으로 1년 안에 잡힌 대회 일정이 아직 없어요", umbCalFail: "UMB 공식 달력을 지금 불러오지 못했어요",
    live: "진행 중", postponed: "연기",
    pbaSeasons: "PBA 시즌별 대회", seasonCounts: (t, f) => `대회 ${t} · 종료 ${f}`, winnersTop: "PBA·LPBA 우승자", openWinners: (n) => `우승자 ${n}명 보기`,
    umbEvents: "UMB 월드컵·세계선수권", umbEventsDesc: "UMB 세계랭킹에 포인트가 남아 있는 대회", playersWithPoints: (n) => `포인트 ${n.toLocaleString("ko-KR")}명`, year: (y) => `${y}년`,
    showMore: (n) => `${n}개 더 보기`, official: "공식 안내", umbCalendar: "UMB 공식 달력", source: "출처: PBA 투어 공식 기록 · UMB 공식 랭킹·달력",
    loading: "불러오는 중...", loadError: "대회 정보를 불러오지 못했어요", retry: "다시 시도",
    notFound: "대회를 찾을 수 없어요", notFoundDesc: "요청한 당구 대회 정보가 없습니다", allTournaments: "당구 대회 전체 보기", back: "뒤로",
    seasonSub: "대회 일정·우승자", all: "전체", toursTile: "대회", finishedTile: "종료", upcomingTile: "남은 대회", otherSeasons: "다른 시즌",
    season: (l) => `${l} 시즌`, winner: "우승", noTourPage: "공식 투어 코드가 없는 일정",
    info: "대회 정보", totalPrize: "총상금", winnerPrize: "우승상금", participants: "참가", people: (n) => `${n.toLocaleString("ko-KR")}명`,
    winnerH: "우승자", winnerPending: "대회가 끝나면 우승자가 나와요", noWinner: "우승자 기록이 없어요",
    careerNote: "통산(누적) 기록이에요 — 이 대회만의 기록이 아니에요", average: "통산 에버리지", highRun: "하이런", bankShot: "뱅크샷",
    record: (w, l, d) => `${w}승 ${l}패${d ? ` ${d}무` : ""}`, recordLabel: "통산 전적", careerPrize: "통산 상금",
    history: "같은 대회 역대 우승자", historyDesc: "해마다 열리는 같은 스폰서 대회만 묶었어요", prev: "이전 대회", next: "다음 대회",
    seasonAll: "시즌 전체 일정", officialPage: "PBA 공식 대회 안내",
    status: { upcoming: "예정", live: "진행 중", finished: "종료" },
    umbName: (e) => `${e.date.slice(0, 4)} ${cityKo(e.city)} ${isJuniorEvent(e) ? "주니어 " : ""}3쿠션 ${e.kind === "worldcup" ? "월드컵" : "세계선수권"}`,
    umbShort: (e) => `${cityKo(e.city)} ${isJuniorEvent(e) ? "주니어 " : ""}3쿠션 ${e.kind === "worldcup" ? "월드컵" : "세계선수권"}`,
    kind: { worldcup: "3쿠션 월드컵", worldchamp: "3쿠션 세계선수권" },
    pointsH: "획득 랭킹 포인트", pointsDesc: (ed) => `UMB 세계랭킹 ${ed} 회차에 이 대회 몫으로 적힌 포인트예요. 대회 순위가 아니에요.`,
    krH: "한국 선수", playersTile: "포인트 받은 선수", krTile: "한국 선수", topTile: "최고 포인트",
    org: "주관", dateLabel: "대회일(UMB 표기)", others: "같은 대회 다른 해", umbSite: "UMB 공식 사이트", pts: (n) => `${n.toLocaleString("ko-KR")}점`,
    cat: { players: "남자", ladies: "여자", juniors: "주니어" },
    pbaRanking: "PBA 투어 랭킹", worldRanking: "당구 세계랭킹",
};

const EN: TourText = {
    hubTitle: "Billiards tournaments", hubSub: "PBA & UMB 3-cushion schedule and results",
    upcoming: "Upcoming", upcomingEmpty: "Nothing scheduled in the next 12 months yet", umbCalFail: "Couldn't load the UMB calendar right now",
    live: "Live", postponed: "Postponed",
    pbaSeasons: "PBA seasons", seasonCounts: (t, f) => `${t} events · ${f} finished`, winnersTop: "PBA · LPBA winners", openWinners: (n) => `Show ${n} winners`,
    umbEvents: "UMB World Cups & Championships", umbEventsDesc: "Events that still carry points in the UMB ranking", playersWithPoints: (n) => `${n} players`, year: (y) => y,
    showMore: (n) => `Show ${n} more`, official: "Official page", umbCalendar: "UMB calendar", source: "Source: PBA Tour records · UMB rankings & calendar",
    loading: "Loading...", loadError: "Couldn't load tournaments", retry: "Try again",
    notFound: "Tournament not found", notFoundDesc: "We have no record of this tournament", allTournaments: "All tournaments", back: "Back",
    seasonSub: "Schedule and winners", all: "All", toursTile: "Events", finishedTile: "Finished", upcomingTile: "Remaining", otherSeasons: "Other seasons",
    season: (l) => `Season ${l}`, winner: "Winner", noTourPage: "No official tour code yet",
    info: "Event info", totalPrize: "Total prize", winnerPrize: "Winner's prize", participants: "Players", people: (n) => n.toLocaleString("en-US"),
    winnerH: "Winner", winnerPending: "The winner will appear once the event ends", noWinner: "No winner on record",
    careerNote: "Career totals — not stats from this event", average: "Career average", highRun: "High run", bankShot: "Bank shots",
    record: (w, l, d) => `${w}W ${l}L${d ? ` ${d}D` : ""}`, recordLabel: "Career record", careerPrize: "Career prize money",
    history: "Past winners of this event", historyDesc: "Same sponsor's event across seasons", prev: "Previous", next: "Next",
    seasonAll: "Full season schedule", officialPage: "PBA official event page",
    status: { upcoming: "Upcoming", live: "Live", finished: "Finished" },
    umbName: (e) => `${e.date.slice(0, 4)} ${e.city} ${isJuniorEvent(e) ? "Junior " : ""}3-Cushion ${e.kind === "worldcup" ? "World Cup" : "World Championship"}`,
    umbShort: (e) => `${e.city} ${isJuniorEvent(e) ? "Junior " : ""}3-Cushion ${e.kind === "worldcup" ? "World Cup" : "World Championship"}`,
    kind: { worldcup: "3-cushion World Cup", worldchamp: "3-cushion World Championship" },
    pointsH: "Ranking points earned", pointsDesc: (ed) => `Points credited to this event in UMB ranking edition ${ed}. Not the final standings.`,
    krH: "Korean players", playersTile: "Players with points", krTile: "Korean players", topTile: "Top points",
    org: "Organizer", dateLabel: "Date (UMB)", others: "Other years", umbSite: "UMB official site", pts: (n) => `${n.toLocaleString("en-US")} pts`,
    cat: { players: "Men", ladies: "Women", juniors: "Juniors" },
    pbaRanking: "PBA Tour ranking", worldRanking: "World ranking",
};

const VI: TourText = {
    ...EN,
    hubTitle: "Giải đấu bi-a", hubSub: "Lịch và kết quả PBA · UMB 3 băng",
    upcoming: "Sắp diễn ra", upcomingEmpty: "Chưa có giải nào trong 12 tháng tới", umbCalFail: "Không tải được lịch UMB lúc này",
    live: "Đang diễn ra", postponed: "Hoãn",
    pbaSeasons: "PBA theo mùa", seasonCounts: (t, f) => `${t} giải · ${f} đã xong`, winnersTop: "Vô địch PBA · LPBA", openWinners: (n) => `Xem ${n} nhà vô địch`,
    umbEvents: "World Cup & VĐTG UMB", umbEventsDesc: "Các giải còn điểm trong BXH UMB", playersWithPoints: (n) => `${n} cơ thủ`,
    showMore: (n) => `Xem thêm ${n}`, official: "Trang chính thức", umbCalendar: "Lịch UMB", source: "Nguồn: PBA Tour · BXH và lịch UMB",
    loading: "Đang tải...", loadError: "Không tải được giải đấu", retry: "Thử lại",
    notFound: "Không tìm thấy giải", notFoundDesc: "Chúng tôi không có dữ liệu giải này", allTournaments: "Tất cả giải đấu", back: "Quay lại",
    seasonSub: "Lịch và nhà vô địch", all: "Tất cả", toursTile: "Giải", finishedTile: "Đã xong", upcomingTile: "Còn lại", otherSeasons: "Mùa khác",
    season: (l) => `Mùa ${l}`, winner: "Vô địch", noTourPage: "Chưa có mã giải chính thức",
    info: "Thông tin giải", totalPrize: "Tổng giải thưởng", winnerPrize: "Giải vô địch", participants: "Cơ thủ", people: (n) => n.toLocaleString("vi-VN"),
    winnerH: "Nhà vô địch", winnerPending: "Nhà vô địch sẽ hiện khi giải kết thúc", noWinner: "Chưa có dữ liệu vô địch",
    careerNote: "Thành tích cả sự nghiệp — không phải của riêng giải này", average: "Average sự nghiệp", highRun: "High run", bankShot: "Bank shot",
    record: (w, l, d) => `${w} thắng ${l} thua${d ? ` ${d} hòa` : ""}`, recordLabel: "Thành tích", careerPrize: "Tổng tiền thưởng",
    history: "Các nhà vô địch giải này", historyDesc: "Cùng giải của cùng nhà tài trợ qua các mùa", prev: "Giải trước", next: "Giải sau",
    seasonAll: "Toàn bộ lịch mùa", officialPage: "Trang giải PBA chính thức",
    status: { upcoming: "Sắp tới", live: "Đang diễn ra", finished: "Đã xong" },
    pointsH: "Điểm xếp hạng nhận được", pointsDesc: (ed) => `Điểm tính cho giải này trong BXH UMB kỳ ${ed}. Không phải thứ hạng chung cuộc.`,
    krH: "Cơ thủ Hàn Quốc", playersTile: "Cơ thủ có điểm", krTile: "Cơ thủ Hàn Quốc", topTile: "Điểm cao nhất",
    org: "Tổ chức", dateLabel: "Ngày (UMB)", others: "Các năm khác", umbSite: "Trang UMB", pts: (n) => `${n.toLocaleString("vi-VN")} điểm`,
    cat: { players: "Nam", ladies: "Nữ", juniors: "Trẻ" },
    pbaRanking: "BXH PBA Tour", worldRanking: "BXH thế giới",
};

const TR: TourText = {
    ...EN,
    hubTitle: "Bilardo turnuvaları", hubSub: "PBA ve UMB 3 bant takvimi ve sonuçları",
    upcoming: "Yaklaşan", upcomingEmpty: "Önümüzdeki 12 ayda planlanmış turnuva yok", umbCalFail: "UMB takvimi şu an yüklenemedi",
    live: "Devam ediyor", postponed: "Ertelendi",
    pbaSeasons: "PBA sezonları", seasonCounts: (t, f) => `${t} turnuva · ${f} bitti`, winnersTop: "PBA · LPBA şampiyonları", openWinners: (n) => `${n} şampiyonu göster`,
    umbEvents: "UMB Dünya Kupaları ve Şampiyonaları", umbEventsDesc: "UMB sıralamasında puanı süren turnuvalar", playersWithPoints: (n) => `${n} oyuncu`,
    showMore: (n) => `${n} tane daha`, official: "Resmî sayfa", umbCalendar: "UMB takvimi", source: "Kaynak: PBA Tour kayıtları · UMB sıralama ve takvimi",
    loading: "Yükleniyor...", loadError: "Turnuvalar yüklenemedi", retry: "Tekrar dene",
    notFound: "Turnuva bulunamadı", notFoundDesc: "Bu turnuvaya ait kayıt yok", allTournaments: "Tüm turnuvalar", back: "Geri",
    seasonSub: "Takvim ve şampiyonlar", all: "Tümü", toursTile: "Turnuva", finishedTile: "Biten", upcomingTile: "Kalan", otherSeasons: "Diğer sezonlar",
    season: (l) => `${l} sezonu`, winner: "Şampiyon", noTourPage: "Henüz resmî turnuva kodu yok",
    info: "Turnuva bilgisi", totalPrize: "Toplam ödül", winnerPrize: "Şampiyonluk ödülü", participants: "Oyuncu", people: (n) => n.toLocaleString("tr-TR"),
    winnerH: "Şampiyon", winnerPending: "Şampiyon turnuva bitince görünür", noWinner: "Şampiyon kaydı yok",
    careerNote: "Kariyer toplamı — bu turnuvaya ait değil", average: "Kariyer ortalaması", highRun: "En yüksek seri", bankShot: "Bant atışı",
    record: (w, l, d) => `${w}G ${l}M${d ? ` ${d}B` : ""}`, recordLabel: "Kariyer", careerPrize: "Kariyer ödülü",
    history: "Bu turnuvanın şampiyonları", historyDesc: "Aynı sponsorun turnuvası, sezonlar boyunca", prev: "Önceki", next: "Sonraki",
    seasonAll: "Sezonun tüm takvimi", officialPage: "PBA resmî turnuva sayfası",
    status: { upcoming: "Yaklaşan", live: "Devam ediyor", finished: "Bitti" },
    umbName: (e) => `${e.date.slice(0, 4)} ${e.city} ${isJuniorEvent(e) ? "Gençler " : ""}3 Bant ${e.kind === "worldcup" ? "Dünya Kupası" : "Dünya Şampiyonası"}`,
    umbShort: (e) => `${e.city} ${isJuniorEvent(e) ? "Gençler " : ""}3 Bant ${e.kind === "worldcup" ? "Dünya Kupası" : "Dünya Şampiyonası"}`,
    kind: { worldcup: "3 bant Dünya Kupası", worldchamp: "3 bant Dünya Şampiyonası" },
    pointsH: "Kazanılan sıralama puanı", pointsDesc: (ed) => `UMB sıralamasının ${ed} sürümünde bu turnuvaya yazılan puan. Final sıralaması değildir.`,
    krH: "Koreli oyuncular", playersTile: "Puan alan oyuncu", krTile: "Koreli oyuncu", topTile: "En yüksek puan",
    org: "Düzenleyen", dateLabel: "Tarih (UMB)", others: "Diğer yıllar", umbSite: "UMB resmî sitesi", pts: (n) => `${n.toLocaleString("tr-TR")} puan`,
    cat: { players: "Erkekler", ladies: "Kadınlar", juniors: "Gençler" },
    pbaRanking: "PBA Tur sıralaması", worldRanking: "Dünya sıralaması",
};

const ES: TourText = {
    ...EN,
    hubTitle: "Torneos de billar", hubSub: "Calendario y resultados PBA y UMB a tres bandas",
    upcoming: "Próximos", upcomingEmpty: "Aún no hay torneos en los próximos 12 meses", umbCalFail: "No se pudo cargar el calendario de la UMB",
    live: "En curso", postponed: "Aplazado",
    pbaSeasons: "Temporadas PBA", seasonCounts: (t, f) => `${t} torneos · ${f} terminados`, winnersTop: "Campeones PBA · LPBA", openWinners: (n) => `Ver ${n} campeones`,
    umbEvents: "Copas y Campeonatos del Mundo UMB", umbEventsDesc: "Torneos que aún suman puntos en el ranking UMB", playersWithPoints: (n) => `${n} jugadores`,
    showMore: (n) => `Ver ${n} más`, official: "Página oficial", umbCalendar: "Calendario UMB", source: "Fuente: PBA Tour · ranking y calendario UMB",
    loading: "Cargando...", loadError: "No se pudieron cargar los torneos", retry: "Reintentar",
    notFound: "Torneo no encontrado", notFoundDesc: "No tenemos datos de este torneo", allTournaments: "Todos los torneos", back: "Atrás",
    seasonSub: "Calendario y campeones", all: "Todos", toursTile: "Torneos", finishedTile: "Terminados", upcomingTile: "Pendientes", otherSeasons: "Otras temporadas",
    season: (l) => `Temporada ${l}`, winner: "Campeón", noTourPage: "Aún sin código oficial",
    info: "Datos del torneo", totalPrize: "Premio total", winnerPrize: "Premio al campeón", participants: "Jugadores", people: (n) => n.toLocaleString("es-ES"),
    winnerH: "Campeón", winnerPending: "El campeón aparecerá al terminar el torneo", noWinner: "Sin campeón registrado",
    careerNote: "Totales de carrera — no son de este torneo", average: "Promedio de carrera", highRun: "Serie mayor", bankShot: "Tiros de banda",
    record: (w, l, d) => `${w}G ${l}P${d ? ` ${d}E` : ""}`, recordLabel: "Balance", careerPrize: "Premios de carrera",
    history: "Campeones de este torneo", historyDesc: "El torneo del mismo patrocinador, temporada a temporada", prev: "Anterior", next: "Siguiente",
    seasonAll: "Calendario completo", officialPage: "Página oficial del torneo PBA",
    status: { upcoming: "Próximo", live: "En curso", finished: "Terminado" },
    umbName: (e) => `${e.kind === "worldcup" ? "Copa del Mundo" : "Campeonato del Mundo"} ${isJuniorEvent(e) ? "Junior " : ""}de 3 bandas ${e.city} ${e.date.slice(0, 4)}`,
    umbShort: (e) => `${e.kind === "worldcup" ? "Copa del Mundo" : "Campeonato del Mundo"} ${isJuniorEvent(e) ? "Junior " : ""}de 3 bandas ${e.city}`,
    kind: { worldcup: "Copa del Mundo a 3 bandas", worldchamp: "Campeonato del Mundo a 3 bandas" },
    pointsH: "Puntos de ranking obtenidos", pointsDesc: (ed) => `Puntos asignados a este torneo en la edición ${ed} del ranking UMB. No es la clasificación final.`,
    krH: "Jugadores coreanos", playersTile: "Jugadores con puntos", krTile: "Coreanos", topTile: "Máximo",
    org: "Organiza", dateLabel: "Fecha (UMB)", others: "Otros años", umbSite: "Sitio oficial UMB", pts: (n) => `${n.toLocaleString("es-ES")} pts`,
    cat: { players: "Hombres", ladies: "Mujeres", juniors: "Juveniles" },
    pbaRanking: "Ranking PBA Tour", worldRanking: "Ranking mundial",
};

export const TOUR_TEXT: Record<Locale, TourText> = { ko: KO, en: EN, vi: VI, tr: TR, es: ES };

/* ── 표기 ── */

const LEAGUE_LABEL: Record<Locale, Record<PbaTourLeague, string>> = {
    ko: { PBA: "PBA", LPBA: "LPBA", DREAM: "드림투어", CHALLENGE: "챌린지투어", TEAM: "팀리그" },
    en: { PBA: "PBA", LPBA: "LPBA", DREAM: "Dream Tour", CHALLENGE: "Challenge Tour", TEAM: "Team League" },
    vi: { PBA: "PBA", LPBA: "LPBA", DREAM: "Dream Tour", CHALLENGE: "Challenge Tour", TEAM: "Team League" },
    tr: { PBA: "PBA", LPBA: "LPBA", DREAM: "Dream Tour", CHALLENGE: "Challenge Tour", TEAM: "Takım Ligi" },
    es: { PBA: "PBA", LPBA: "LPBA", DREAM: "Dream Tour", CHALLENGE: "Challenge Tour", TEAM: "Liga por equipos" },
};
export const leagueLabel = (lg: PbaTourLeague, locale: Locale) => (LEAGUE_LABEL[locale] ?? LEAGUE_LABEL.en)[lg];

/**
 * 날짜 범위 — 한국어는 프리렌더와 같은 문장, 그 밖은 "Oct 22 – 28, 2025" 꼴.
 * omitYear(올해 연도)를 주면 시작·끝이 모두 그해일 때 연도를 뺀다 — 목록 줄이 좁아 장소가 잘린다.
 */
export function rangeLabel(start: string, end: string, locale: Locale, omitYear?: string): string {
    const sameYear = !!omitYear && start.slice(0, 4) === omitYear && end.slice(0, 4) === omitYear;
    if (locale === "ko") return sameYear ? dateRangeKo(start, end).replace(`${omitYear}년 `, "") : dateRangeKo(start, end);
    try {
        const f = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
        const d = (s: string) => new Date(`${s}T00:00:00Z`);
        const y = !sameYear && start.slice(0, 4) === end.slice(0, 4) ? `, ${end.slice(0, 4)}` : "";
        if (start === end) return sameYear ? f.format(d(start)) : `${f.format(d(start))}, ${start.slice(0, 4)}`;
        return `${f.format(d(start))} – ${f.format(d(end))}${y}`;
    } catch {
        return `${shortRange(start, end)}, ${start.slice(0, 4)}`;
    }
}

export const prizeLabel = (n: number, locale: Locale) => (locale === "ko" ? `${formatPrize(n, "ko")}원` : formatPrize(n, locale));
export const countryLabel = (code: string | null, fallback: string | null, locale: Locale) =>
    code ? (locale === "ko" ? fedNameKo(code) : regionName(code, locale)) : fallback ?? "";
export const cityLabel = (city: string, locale: Locale) => (locale === "ko" ? cityKo(city) : city);
export const seasonChip = (s: number) => seasonLabelFull(s);

/** 한국 날짜 기준 남은 날 */
export function daysUntil(today: string, date: string): number {
    return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/* ── 조각 ── */

export function PageHeader({ title, sub, onBack, backLabel, shareUrl, shareTitle }: {
    title: string; sub?: string; onBack: () => void; backLabel: string; shareUrl?: string; shareTitle?: string;
}) {
    return (
        <div className="flex items-center gap-3 mb-5 relative z-10">
            <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onBack}
                className="w-11 h-11 shrink-0 rounded-full bg-white flex items-center justify-center transition-transform text-ink-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                aria-label={backLabel}
            >
                <LucideChevronLeft className="w-5 h-5" />
            </motion.button>
            <div className="min-w-0">
                <h1 className="text-[22px] font-bold tracking-tight text-ink-1 leading-tight line-clamp-2">{title}</h1>
                {sub && <p className="text-[13px] font-medium text-ink-3 mt-1 truncate">{sub}</p>}
            </div>
            {shareUrl && <ShareButton className="ml-auto shrink-0" url={`${ORIGIN}${shareUrl}`} title={shareTitle} />}
        </div>
    );
}

/** 상태 칩 — 진행 중(초록 채움) · D-n · 종료 */
export function StatusChip({ status, days, L }: { status: TourStatus; days: number; L: TourText }) {
    return (
        <span className={cn(
            "inline-flex items-center h-6 px-2 rounded-full text-[12px] font-bold leading-none tabular-nums whitespace-nowrap",
            status === "live" ? "bg-brand text-brand-fg" : status === "upcoming" ? "bg-brand/10 text-brand" : "bg-surface-3 text-ink-3",
        )}>
            {status === "live" ? L.live : status === "upcoming" ? `D-${days}` : L.status.finished}
        </span>
    );
}

export function CenterCard({ children }: { children: ReactNode }) {
    return <div className="rk-card p-8 text-center">{children}</div>;
}

export function LoadState({ isLoading, notFound, failed, onRetry, retrying, L, backHref, onNavigate }: {
    isLoading: boolean; notFound: boolean; failed: boolean; onRetry: () => void; retrying: boolean; L: TourText;
    backHref: string; onNavigate: (href: string) => void;
}) {
    if (notFound) {
        return (
            <CenterCard>
                <p className="text-[15px] font-bold text-ink-1">{L.notFound}</p>
                <p className="text-[13px] font-medium text-ink-3 mt-1.5">{L.notFoundDesc}</p>
                <button onClick={() => onNavigate(backHref)} className="inline-flex mt-5 h-11 px-5 items-center rounded-full bg-brand text-brand-fg text-[14px] font-bold">
                    {L.allTournaments}
                </button>
            </CenterCard>
        );
    }
    if (failed) {
        return (
            <CenterCard>
                <p className="text-[14px] font-semibold text-ink-2">{L.loadError}</p>
                <button onClick={onRetry} disabled={retrying} className="inline-flex mt-4 h-11 px-5 items-center rounded-full bg-surface-3 text-[13.5px] font-semibold text-ink-1 disabled:opacity-50">
                    {L.retry}
                </button>
            </CenterCard>
        );
    }
    if (isLoading) return <CenterCard><span className="text-[13.5px] font-medium text-ink-3">{L.loading}</span></CenterCard>;
    return null;
}
