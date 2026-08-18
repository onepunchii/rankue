// PBA 표기 유틸 — 클라이언트(pba.tsx·pba-player.tsx)와 서버 프리렌더가 공유한다.
// 프리렌더 금선(봇 문서 = React 렌더 결과, 문자 단위 일치)을 복제 대신 공유로 보장
// (shared/crewMeta.ts 와 같은 패턴).

// 시즌 라벨: 2025 → "25-26"
export const seasonLabel = (s: number) => `${String(s).slice(2)}-${String(s + 1).slice(2)}`;

// 상금 표기: ko는 억/만, 그 외는 ₩ 축약.
// 만 단위 반올림이 10,000만이 되면 억으로 캐리한다 ("1억 10,000만" 방지).
export function formatPrize(n: number, locale: string): string {
    if (locale === "ko") {
        if (n >= 1e8) {
            let eok = Math.floor(n / 1e8);
            let man = Math.round((n % 1e8) / 1e4);
            if (man === 10000) { eok += 1; man = 0; }
            return man > 0 ? `${eok}억 ${man.toLocaleString("ko-KR")}만` : `${eok}억`;
        }
        if (n >= 1e4) {
            const man = Math.round(n / 1e4);
            if (man === 10000) return "1억";
            return `${man.toLocaleString("ko-KR")}만`;
        }
        return n.toLocaleString("ko-KR");
    }
    if (n >= 1e6) return `₩${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `₩${Math.round(n / 1e3).toLocaleString()}K`;
    return `₩${n.toLocaleString()}`;
}

export const formatPrizeKo = (n: number) => formatPrize(n, "ko");

// ── "선수 연봉" 검색 대응 (오너 요청 2026-08-16) ──────────────────────────────
// 프로당구는 연봉제가 아니다. 선수 수입은 대회 상금이 중심이고, 구단 계약금은 공개되지 않는다.
// 그래서 상금 수치를 '연봉'으로 바꿔 부르지 않는다 — 그건 없는 사실을 만드는 것이다.
// 대신 "OOO 연봉"으로 들어온 사람에게 **정확한 답**(연봉제가 아니며 공개된 수치는 상금)을 주고,
// 그 답 안에서 통산 상금을 보여준다. 클라이언트와 프리렌더가 이 문구를 공유해 문자 단위로 맞춘다.
export const PBA_INCOME_NOTE_KO =
    "프로당구는 연봉제가 아닙니다. 선수 수입은 대회 상금이 중심이며 구단 계약금은 공개되지 않아, 랭큐는 공식 기록의 상금만 표시합니다.";

export const PBA_LIST_TITLE_KO = "PBA 투어 랭킹 · 프로당구 상금(연봉) 순위 | 랭큐";
export const PBA_LIST_DESC_KO =
    "프로당구 PBA·LPBA 시즌별 랭킹. 선수 상금 순위와 랭킹 포인트, 통산 기록을 랭큐에서. 프로당구는 연봉제가 아니라 대회 상금이 선수 수입의 중심입니다.";

export const pbaPlayerTitleKo = (nameKo: string, league: string) =>
    `${nameKo} 상금·연봉 — ${league} 프로당구 선수 | 랭큐`;

export const pbaPlayerDescKo = (
    nameKo: string, nameEn: string | null | undefined, league: string,
    careerPrize: number | null | undefined, average: unknown, highRun: unknown,
) =>
    `${nameKo}${nameEn ? ` (${nameEn})` : ""} — ${league} 통산 상금 ${careerPrize != null ? formatPrizeKo(careerPrize) : "-"}, 에버리지 ${average ?? "-"}, 하이런 ${highRun ?? "-"}. 프로당구는 연봉제가 아니라 상금 중심입니다.`;

/** "OOO 연봉 얼마?" 질문에 대한 정답 — FAQ 구조화데이터·화면 공용. */
export const pbaIncomeAnswerKo = (nameKo: string, careerPrize: number | null | undefined) =>
    `${nameKo} 선수는 연봉을 받는 것이 아니라 대회 성적에 따른 상금을 받습니다. 공식 기록 기준 통산 상금은 ${careerPrize != null ? `${formatPrizeKo(careerPrize)}원` : "집계 중"}입니다.`;

// ── PBA 다국어 (2026-08-18 감사) ────────────────────────────────────────
// PBA·LPBA 에는 베트남(Mã Minh Cẩm·Trần Quyết Chiến)·터키(Semih Saygıner)·
// 스페인(Daniel Sánchez) 선수가 뛴다. 그 나라 팬이 자국어로 선수명을 검색하는데
// 프리렌더는 ko 고정이라 481개 URL 이 한국어로만 나가고 있었다(실측).
// 제목은 각 언어의 실제 검색어를 쓴다: bida 3 băng / 3 bant bilardo / billar a tres bandas.
export const PBA_LANGS = ["ko", "en", "vi", "tr", "es"] as const;
export type PbaLang = (typeof PBA_LANGS)[number];

interface PbaL10n {
    listTitle: string;
    listDesc: string;
    playerTitle: (name: string, league: string) => string;
    playerDesc: (name: string, nameEn: string | null | undefined, league: string, prize: string, average: unknown, highRun: unknown) => string;
    incomeNote: string;
    incomeQ: (name: string) => string;
    incomeA: (name: string, prize: string) => string;
    careerPrize: string; seasonH: string; source: string; navList: string;
}

export const PBA_L10N: Record<PbaLang, PbaL10n> = {
    ko: {
        listTitle: PBA_LIST_TITLE_KO,
        listDesc: PBA_LIST_DESC_KO,
        playerTitle: (n, lg) => `${n} 상금·연봉 — ${lg} 프로당구 선수 | 랭큐`,
        playerDesc: (n, ne, lg, pz, avg, hr) => `${n}${ne ? ` (${ne})` : ""} — ${lg} 통산 상금 ${pz}, 에버리지 ${avg ?? "-"}, 하이런 ${hr ?? "-"}. 프로당구는 연봉제가 아니라 상금 중심입니다.`,
        incomeNote: PBA_INCOME_NOTE_KO,
        incomeQ: (n) => `${n} 선수 연봉은 얼마인가요?`,
        incomeA: (n, pz) => `${n} 선수는 연봉을 받는 것이 아니라 대회 성적에 따른 상금을 받습니다. 공식 기록 기준 통산 상금은 ${pz}입니다.`,
        careerPrize: "통산 상금", seasonH: "시즌별 기록", source: "출처: PBA 투어 공식 기록", navList: "PBA 투어 랭킹",
    },
    en: {
        listTitle: "PBA Tour Rankings — Korean Pro Billiards Prize Money | RANKUE",
        listDesc: "PBA and LPBA season rankings: prize money standings, ranking points and career records of Korean pro billiards players. Pro billiards pays prize money rather than a salary.",
        playerTitle: (n, lg) => `${n} — ${lg} Pro Billiards Prize Money & Career | RANKUE`,
        playerDesc: (n, ne, lg, pz, avg, hr) => `${n}${ne ? ` (${ne})` : ""} — ${lg} career prize money ${pz}, average ${avg ?? "-"}, high run ${hr ?? "-"}. Pro billiards players earn prize money, not a salary.`,
        incomeNote: "Pro billiards is not a salaried sport. Players earn tournament prize money, and club contracts are not disclosed, so RANKUE shows only official prize records.",
        incomeQ: (n) => `How much does ${n} earn?`,
        incomeA: (n, pz) => `${n} is not paid a salary but earns prize money based on tournament results. Official records put career prize money at ${pz}.`,
        careerPrize: "Career prize money", seasonH: "Season by season", source: "Source: PBA Tour official records", navList: "PBA Tour rankings",
    },
    vi: {
        listTitle: "BXH PBA Tour — Tiền thưởng bida chuyên nghiệp Hàn Quốc | RANKUE",
        listDesc: "BXH mùa giải PBA và LPBA: xếp hạng tiền thưởng, điểm xếp hạng và thành tích sự nghiệp của các cơ thủ bi-a chuyên nghiệp Hàn Quốc. Bida chuyên nghiệp trả tiền thưởng chứ không trả lương.",
        playerTitle: (n, lg) => `${n} — Tiền thưởng và sự nghiệp ${lg} | RANKUE`,
        playerDesc: (n, ne, lg, pz, avg, hr) => `${n}${ne ? ` (${ne})` : ""} — tổng tiền thưởng ${lg} ${pz}, average ${avg ?? "-"}, high run ${hr ?? "-"}. Cơ thủ chuyên nghiệp nhận tiền thưởng chứ không nhận lương.`,
        incomeNote: "Bida chuyên nghiệp không trả lương cứng. Cơ thủ nhận tiền thưởng theo giải, hợp đồng câu lạc bộ không công khai, nên RANKUE chỉ hiển thị tiền thưởng theo hồ sơ chính thức.",
        incomeQ: (n) => `${n} kiếm được bao nhiêu?`,
        incomeA: (n, pz) => `${n} không nhận lương mà nhận tiền thưởng theo thành tích thi đấu. Theo hồ sơ chính thức, tổng tiền thưởng là ${pz}.`,
        careerPrize: "Tổng tiền thưởng", seasonH: "Theo mùa giải", source: "Nguồn: hồ sơ chính thức PBA Tour", navList: "BXH PBA Tour",
    },
    tr: {
        listTitle: "PBA Tur Sıralaması — Kore profesyonel bilardo para ödülleri | RANKUE",
        listDesc: "PBA ve LPBA sezon sıralamaları: para ödülü sıralaması, sıralama puanları ve Koreli profesyonel bilardo oyuncularının kariyer kayıtları. Profesyonel bilardoda maaş değil turnuva ödülü kazanılır.",
        playerTitle: (n, lg) => `${n} — ${lg} bilardo para ödülü ve kariyeri | RANKUE`,
        playerDesc: (n, ne, lg, pz, avg, hr) => `${n}${ne ? ` (${ne})` : ""} — ${lg} kariyer para ödülü ${pz}, ortalama ${avg ?? "-"}, en yüksek seri ${hr ?? "-"}. Profesyonel oyuncular maaş değil turnuva ödülü kazanır.`,
        incomeNote: "Profesyonel bilardo maaşlı bir spor değildir. Oyuncular turnuva ödülü kazanır, kulüp sözleşmeleri açıklanmaz; bu yüzden RANKUE yalnızca resmî ödül kayıtlarını gösterir.",
        incomeQ: (n) => `${n} ne kadar kazanıyor?`,
        incomeA: (n, pz) => `${n} maaş almaz, turnuva sonuçlarına göre para ödülü kazanır. Resmî kayıtlara göre kariyer ödülü ${pz}.`,
        careerPrize: "Kariyer para ödülü", seasonH: "Sezonlara göre", source: "Kaynak: PBA Tour resmî kayıtları", navList: "PBA Tur sıralaması",
    },
    es: {
        listTitle: "Ranking PBA Tour — Premios del billar profesional coreano | RANKUE",
        listDesc: "Rankings de temporada PBA y LPBA: clasificación por premios, puntos de ranking y récords de los jugadores profesionales coreanos de billar. El billar profesional paga premios, no un sueldo.",
        playerTitle: (n, lg) => `${n} — Premios y carrera en ${lg} | RANKUE`,
        playerDesc: (n, ne, lg, pz, avg, hr) => `${n}${ne ? ` (${ne})` : ""} — premios acumulados en ${lg} ${pz}, promedio ${avg ?? "-"}, serie mayor ${hr ?? "-"}. Los profesionales cobran premios, no un sueldo.`,
        incomeNote: "El billar profesional no es un deporte con sueldo. Los jugadores cobran premios de torneo y los contratos de club no se hacen públicos, así que RANKUE muestra solo los premios de registro oficial.",
        incomeQ: (n) => `¿Cuánto gana ${n}?`,
        incomeA: (n, pz) => `${n} no cobra un sueldo, sino premios según sus resultados. Según el registro oficial, sus premios acumulados suman ${pz}.`,
        careerPrize: "Premios acumulados", seasonH: "Por temporada", source: "Fuente: registros oficiales del PBA Tour", navList: "Ranking PBA Tour",
    },
};

export const pbaL10n = (lang?: string | null): PbaL10n =>
    PBA_L10N[((PBA_LANGS as readonly string[]).includes(lang ?? "") ? lang : "ko") as PbaLang];
