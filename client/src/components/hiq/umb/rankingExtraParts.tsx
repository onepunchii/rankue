/**
 * 국가별 세계랭킹·순위 변동 페이지(2026-09-24) 공용 조각 — 문구표, 순위·날짜 표기, 선수 줄.
 * 문구는 두 페이지에만 쓰여 사전(ko.ts 등)에 넣지 않고 pba.tsx 처럼 페이지 쪽 표로 둔다.
 * 제목·설명(SEO)은 여기 말고 shared/umbCountryMeta.ts — 프리렌더와 같은 함수여야 한다.
 */
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";
import { editionDateKo, type UmbMoveRow, type UmbCat } from "@shared/umbCountryMeta";

export const EXTRA_TEXT: Record<Locale, {
    countrySub: string; moversTitle: string; moversSub: string;
    nationRank: string; ofNations: (n: number) => string; top5: string;
    listed: string; top100: string; top300: string; best: string;
    risers: string; fallers: string; cutNow: (n: number) => string; cutPrev: (n: number) => string;
    all: string; others: string; moversLink: string; allRanking: string; krCountry: string;
    notFound: string; notFoundDesc: string; vsPrev: (ed: string, date: string) => string; asOf: (ed: string, date: string) => string;
    newTag: string; outTag: string; people: (n: number) => string;
    changed: string; up: string; down: string; same: string; entries: string; dropouts: string;
    risersAll: string; fallersAll: string; entriesList: string; dropoutsList: string;
    kr: string; krDesc: (n: number, cut: number) => string; rank: (n: number) => string; loadMore: (n: number) => string;
    noMovers: string; loadError: string; retry: string; shownOf: (shown: number, total: number) => string;
}> = {
    ko: {
        countrySub: "UMB 3쿠션 세계랭킹 · 국가별", moversTitle: "순위 변동", moversSub: "최신 UMB 회차와 직전 회차 비교",
        nationRank: "국가 순위", ofNations: (n) => `/ ${n}개국`, top5: "상위 5명 합산",
        listed: "등재 선수", top100: "톱 100", top300: "톱 300", best: "최고 순위",
        risers: "순위가 오른 선수", fallers: "순위가 내린 선수", cutNow: (n) => `현재 ${n}위 안`, cutPrev: (n) => `직전 ${n}위 안`,
        all: "전체 순위", others: "다른 나라", moversLink: "이번 회차 순위 변동", allRanking: "당구 세계랭킹 전체", krCountry: "대한민국 선수 세계랭킹",
        notFound: "국가를 찾을 수 없어요", notFoundDesc: "이 국가의 선수가 최신 UMB 세계랭킹에 없습니다",
        vsPrev: (ed, d) => `직전 ${ed} 회차(${d}) 대비`, asOf: (ed, d) => `${ed} 회차 · ${d}`,
        newTag: "신규", outTag: "이탈", people: (n) => `${n.toLocaleString("ko-KR")}명`,
        changed: "순위 변동", up: "상승", down: "하락", same: "그대로", entries: "신규 등재", dropouts: "랭킹 이탈",
        risersAll: "가장 많이 오른 선수", fallersAll: "가장 많이 내린 선수", entriesList: "새로 등재된 선수", dropoutsList: "랭킹에서 빠진 선수",
        kr: "한국 선수 순위 변동", krDesc: (n, c) => `한국 선수 ${n}명 · 아래는 현재·직전 ${c}위 안`, rank: (n) => `${n}위`, loadMore: (n) => `${n}명 더 보기`,
        noMovers: "비교할 두 회차가 아직 없어요", loadError: "세계랭킹을 불러오지 못했어요", retry: "다시 시도", shownOf: (s, t) => `${t}명 중 ${s}명`,
    },
    en: {
        countrySub: "UMB 3-cushion world ranking · by country", moversTitle: "Ranking changes", moversSub: "Latest UMB edition vs the previous one",
        nationRank: "Country rank", ofNations: (n) => `of ${n}`, top5: "Top-5 points",
        listed: "Ranked players", top100: "Top 100", top300: "Top 300", best: "Best ranked",
        risers: "Moved up", fallers: "Moved down", cutNow: (n) => `now inside top ${n}`, cutPrev: (n) => `was inside top ${n}`,
        all: "Full list", others: "Other countries", moversLink: "This edition's ranking changes", allRanking: "Full world ranking", krCountry: "South Korea's players",
        notFound: "Country not found", notFoundDesc: "No player from this country is in the latest UMB ranking",
        vsPrev: (ed, d) => `vs edition ${ed} (${d})`, asOf: (ed, d) => `Edition ${ed} · ${d}`,
        newTag: "NEW", outTag: "Out", people: (n) => n.toLocaleString("en-US"),
        changed: "Changed", up: "Up", down: "Down", same: "Same", entries: "New entries", dropouts: "Dropped out",
        risersAll: "Biggest risers", fallersAll: "Biggest fallers", entriesList: "New entries", dropoutsList: "Dropped out",
        kr: "Korean players", krDesc: (n, c) => `${n} Korean players · top ${c} (now or before) shown`, rank: (n) => `No.${n}`, loadMore: (n) => `Show ${n} more`,
        noMovers: "Two editions are needed to compare", loadError: "Couldn't load the world ranking", retry: "Try again", shownOf: (s, t) => `${s} of ${t}`,
    },
    vi: {
        countrySub: "BXH 3 băng UMB · theo quốc gia", moversTitle: "Biến động thứ hạng", moversSub: "Kỳ UMB mới nhất so với kỳ trước",
        nationRank: "Hạng quốc gia", ofNations: (n) => `/ ${n}`, top5: "Tổng điểm top 5",
        listed: "Cơ thủ có hạng", top100: "Top 100", top300: "Top 300", best: "Hạng cao nhất",
        risers: "Tăng hạng", fallers: "Giảm hạng", cutNow: (n) => `hiện trong top ${n}`, cutPrev: (n) => `trước đó trong top ${n}`,
        all: "Toàn bộ", others: "Quốc gia khác", moversLink: "Biến động kỳ này", allRanking: "BXH thế giới đầy đủ", krCountry: "Cơ thủ Hàn Quốc",
        notFound: "Không tìm thấy quốc gia", notFoundDesc: "Không có cơ thủ nào của quốc gia này trong BXH UMB mới nhất",
        vsPrev: (ed, d) => `so với kỳ ${ed} (${d})`, asOf: (ed, d) => `Kỳ ${ed} · ${d}`,
        newTag: "MỚI", outTag: "Rời BXH", people: (n) => n.toLocaleString("vi-VN"),
        changed: "Đổi hạng", up: "Tăng", down: "Giảm", same: "Giữ nguyên", entries: "Mới vào", dropouts: "Rời BXH",
        risersAll: "Tăng nhiều nhất", fallersAll: "Giảm nhiều nhất", entriesList: "Mới vào BXH", dropoutsList: "Rời BXH",
        kr: "Cơ thủ Hàn Quốc", krDesc: (n, c) => `${n} cơ thủ Hàn Quốc · hiển thị top ${c} (hiện tại hoặc trước đó)`, rank: (n) => `hạng ${n}`, loadMore: (n) => `Xem thêm ${n}`,
        noMovers: "Cần hai kỳ để so sánh", loadError: "Không tải được BXH thế giới", retry: "Thử lại", shownOf: (s, t) => `${s}/${t}`,
    },
    tr: {
        countrySub: "UMB 3 bant dünya sıralaması · ülkeye göre", moversTitle: "Sıralama değişimleri", moversSub: "Son UMB sürümü ile öncekinin karşılaştırması",
        nationRank: "Ülke sırası", ofNations: (n) => `/ ${n}`, top5: "İlk 5 toplamı",
        listed: "Sıralamadaki oyuncu", top100: "İlk 100", top300: "İlk 300", best: "En iyi sıra",
        risers: "Yükselenler", fallers: "Düşenler", cutNow: (n) => `şu an ilk ${n} içinde`, cutPrev: (n) => `önceden ilk ${n} içinde`,
        all: "Tam liste", others: "Diğer ülkeler", moversLink: "Bu sürümün değişimleri", allRanking: "Tüm dünya sıralaması", krCountry: "Güney Kore oyuncuları",
        notFound: "Ülke bulunamadı", notFoundDesc: "Bu ülkeden son UMB sıralamasında oyuncu yok",
        vsPrev: (ed, d) => `${ed} sürümüne (${d}) göre`, asOf: (ed, d) => `Sürüm ${ed} · ${d}`,
        newTag: "YENİ", outTag: "Çıktı", people: (n) => n.toLocaleString("tr-TR"),
        changed: "Değişen", up: "Yükselen", down: "Düşen", same: "Aynı", entries: "Yeni giren", dropouts: "Çıkan",
        risersAll: "En çok yükselenler", fallersAll: "En çok düşenler", entriesList: "Yeni girenler", dropoutsList: "Sıralamadan çıkanlar",
        kr: "Koreli oyuncular", krDesc: (n, c) => `${n} Koreli oyuncu · şimdi veya önceden ilk ${c} gösteriliyor`, rank: (n) => `${n}.`, loadMore: (n) => `${n} tane daha`,
        noMovers: "Karşılaştırma için iki sürüm gerekli", loadError: "Dünya sıralaması yüklenemedi", retry: "Tekrar dene", shownOf: (s, t) => `${t} içinden ${s}`,
    },
    es: {
        countrySub: "Ranking mundial UMB tres bandas · por país", moversTitle: "Cambios en el ranking", moversSub: "Última edición UMB frente a la anterior",
        nationRank: "Puesto del país", ofNations: (n) => `de ${n}`, top5: "Suma top 5",
        listed: "Jugadores en el ranking", top100: "Top 100", top300: "Top 300", best: "Mejor clasificado",
        risers: "Suben", fallers: "Bajan", cutNow: (n) => `ahora en el top ${n}`, cutPrev: (n) => `antes en el top ${n}`,
        all: "Lista completa", others: "Otros países", moversLink: "Cambios de esta edición", allRanking: "Ranking mundial completo", krCountry: "Jugadores de Corea del Sur",
        notFound: "País no encontrado", notFoundDesc: "Ningún jugador de este país figura en el último ranking UMB",
        vsPrev: (ed, d) => `frente a la edición ${ed} (${d})`, asOf: (ed, d) => `Edición ${ed} · ${d}`,
        newTag: "NUEVO", outTag: "Fuera", people: (n) => n.toLocaleString("es-ES"),
        changed: "Cambian", up: "Suben", down: "Bajan", same: "Igual", entries: "Nuevos", dropouts: "Salen",
        risersAll: "Los que más suben", fallersAll: "Los que más bajan", entriesList: "Nuevos en el ranking", dropoutsList: "Salen del ranking",
        kr: "Jugadores coreanos", krDesc: (n, c) => `${n} jugadores coreanos · se muestra el top ${c} (actual o anterior)`, rank: (n) => `N.º ${n}`, loadMore: (n) => `Ver ${n} más`,
        noMovers: "Hacen falta dos ediciones para comparar", loadError: "No se pudo cargar el ranking mundial", retry: "Reintentar", shownOf: (s, t) => `${s} de ${t}`,
    },
};

const DATE_LOCALE: Record<Locale, string> = { ko: "ko-KR", en: "en-US", vi: "vi-VN", tr: "tr-TR", es: "es-ES" };

/** 회차 날짜 "YYYY-MM-DD" 표기 — UTC 로 고정해 읽는다(브라우저 시간대가 날짜를 하루 밀지 않게). 한국어는 프리렌더와 같은 함수. */
export function editionDate(ymd: string | null | undefined, locale: Locale): string {
    if (!ymd) return "";
    if (locale === "ko") return editionDateKo(ymd);
    try {
        return new Intl.DateTimeFormat(DATE_LOCALE[locale], { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
            .format(new Date(`${ymd.slice(0, 10)}T00:00:00Z`));
    } catch {
        return ymd;
    }
}

export const playerPath = (cat: UmbCat, id: string) => `/player/${cat}/${encodeURIComponent(id)}`;

/** 변동 표시 — 직전 회차가 없으면 비교가 없어 아무것도 그리지 않는다 */
export function MoveTag({ row, hasPrev, locale }: { row: UmbMoveRow; hasPrev: boolean; locale: Locale }) {
    const L = EXTRA_TEXT[locale] ?? EXTRA_TEXT.en;
    if (!hasPrev) return null;
    if (row.rank === null) return <span className="shrink-0 text-[12px] font-semibold text-ink-3">{L.outTag}</span>;
    if (row.move === null) {
        return <span className="shrink-0 h-6 px-2 inline-flex items-center rounded-full bg-[#F5B721]/15 text-[12px] font-bold text-[#8a6a0a]">{L.newTag}</span>;
    }
    if (row.move > 0) return <span className="shrink-0 text-[13px] font-bold tabular-nums text-brand">▲{row.move}</span>;
    if (row.move < 0) return <span className="shrink-0 text-[13px] font-bold tabular-nums text-red-600">▼{-row.move}</span>;
    return <span className="shrink-0 text-[13px] font-medium text-ink-4">–</span>;
}

/**
 * 선수 한 줄 — 선수 페이지로 가는 진짜 링크(<a>)라 크롤러도 따라간다.
 * 왼쪽 칸은 현재 순위(이탈이면 직전 순위를 흐리게), 가운데 이름 + 보조 줄, 오른쪽 변동·포인트.
 */
export function PlayerLinkRow({ cat, row, hasPrev, locale, sub, showPrev }: {
    cat: UmbCat; row: UmbMoveRow; hasPrev: boolean; locale: Locale; sub?: string; showPrev?: boolean;
}) {
    const main = locale === "ko" && row.nativeName ? row.nativeName : row.playerName;
    const second = sub ?? (locale === "ko" && row.nativeName ? row.playerName : "");
    const L = EXTRA_TEXT[locale] ?? EXTRA_TEXT.en;
    return (
        <Link href={playerPath(cat, row.playerUmbId)} className="flex items-center gap-3 px-3.5 py-3 hover:bg-black/[0.03] transition-colors">
            <span className={cn("w-11 shrink-0 text-center text-[14px] font-bold tabular-nums", row.rank === null ? "text-ink-4" : "text-ink-2")}>
                {row.rank ?? row.prevRank}
            </span>
            <span className="flex-1 min-w-0">
                <span className="block truncate text-[14px] font-semibold text-ink-1">{main}</span>
                {(second || (showPrev && hasPrev && row.prevRank !== null && row.rank !== null)) && (
                    <span className="block truncate text-[12px] font-medium text-ink-3 mt-0.5 tabular-nums">
                        {showPrev && hasPrev && row.prevRank !== null && row.rank !== null ? `${L.rank(row.prevRank)} → ${L.rank(row.rank)}` : ""}
                        {showPrev && second && row.prevRank !== null && row.rank !== null ? " · " : ""}
                        {second}
                    </span>
                )}
            </span>
            <MoveTag row={row} hasPrev={hasPrev} locale={locale} />
            {/* 이탈한 선수는 직전 회차 포인트라 순위처럼 흐리게 — 현재 포인트로 읽히지 않게 */}
            <span className={cn("w-11 shrink-0 text-right text-[14px] font-bold tabular-nums", row.rank === null ? "text-ink-4" : "text-ink-1")}>{row.points ?? row.prevPoints ?? "–"}</span>
        </Link>
    );
}
