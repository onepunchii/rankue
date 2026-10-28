/**
 * 쇼츠 화면 글자 — 채널 언어별(en = RANKUE 본 채널, vi = RANKUE — Bida Việt Nam).
 * 베트남어는 현지 당구 말로: 쿠션 = băng, 득점 = ăn điểm, 회전 = xoáy, 밀어치기 = đẩy, 끌어치기 = kéo.
 */
export type Lang = "en" | "vi";

export interface Strings {
    hook: [string, string];
    hookSub: string;
    rewind: string;
    when: (iso: string) => string;
    tag: string;
    player: (letter: string) => string;
    toShoot: string;
    inning: (n: number) => string;
    raceTo: (n: number) => string;
    cushions: (n: number) => string;
    score: string;
    power: string;
    strength: (pct: number) => string;
    side: (a: number) => string;
    vert: (b: number) => string;
    reshot: [string, (n: number) => string];
    reshotSub: string;
    made: (n: number) => string;
    rate: (hits: number, trials: number) => string;
    outro: [string, string];
    outroSub: string;
    ios: [string, string];
    android: [string, string];
    search: string;
}

const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000);

export const STRINGS: Record<Lang, Strings> = {
    en: {
        hook: ["Will it", "go in?"],
        hookSub: "Count the cushions",
        rewind: "◀◀  REWIND",
        when: (iso) => {
            const k = kst(iso), h = k.getUTCHours();
            const day = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][k.getUTCDay()];
            const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][k.getUTCMonth()];
            return `${day}, ${mon} ${k.getUTCDate()} · ${((h + 11) % 12) + 1}:${String(k.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"} KST`;
        },
        tag: "3-CUSHION · REPLAY",
        player: (l) => `PLAYER ${l}`,
        toShoot: "TO SHOOT",
        inning: (n) => `INNING ${n}`,
        raceTo: (n) => `RACE TO ${n}`,
        cushions: (n) => (n === 1 ? "CUSHION" : "CUSHIONS"),
        score: "SCORE!",
        power: "POWER",
        strength: (p) => (p >= 80 ? "HARD" : p >= 55 ? "MEDIUM" : "SOFT"),
        side: (a) => (a > 0.08 ? "Right english" : a < -0.08 ? "Left english" : "No english"),
        vert: (b) => (b > 0.15 ? "Follow" : b < -0.15 ? "Draw" : "Center"),
        reshot: ["We re-shot it", (n) => `${n.toLocaleString("en-US")} times`],
        reshotSub: "with tiny human errors in aim, power and spin",
        made: (n) => `${n} made it`,
        rate: (h, t) => (h === 0 ? "Not a single one." : `${(h / t * 100).toFixed(1)}% success rate`),
        outro: ["Could YOU", "make this shot?"],
        outroSub: "Same layout. Real 3-cushion physics.",
        ios: ["Download on the", "App Store"],
        android: ["GET IT ON", "Google Play"],
        search: "Search “RANKUE”",
    },
    vi: {
        hook: ["Cú này", "có vào không?"],
        hookSub: "Đếm số băng nhé",
        rewind: "◀◀  TUA LẠI",
        when: (iso) => {
            const k = kst(iso);
            const day = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][k.getUTCDay()];
            return `${day}, ${k.getUTCDate()}/${k.getUTCMonth() + 1} · ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")} (giờ Hàn)`;
        },
        tag: "BIDA 3 BĂNG · XEM LẠI",
        player: (l) => `CƠ THỦ ${l}`,
        toShoot: "ĐANG ĐÁNH",
        inning: (n) => `LƯỢT ${n}`,
        raceTo: (n) => `CHẠM ${n}`,
        cushions: () => "BĂNG",
        score: "ĂN ĐIỂM!",
        power: "LỰC",
        strength: (p) => (p >= 80 ? "MẠNH" : p >= 55 ? "VỪA" : "NHẸ"),
        side: (a) => (a > 0.08 ? "Xoáy phải" : a < -0.08 ? "Xoáy trái" : "Không xoáy"),
        vert: (b) => (b > 0.15 ? "Đẩy" : b < -0.15 ? "Kéo" : "Giữa"),
        reshot: ["Đánh lại", (n) => `${n.toLocaleString("vi-VN")} lần`],
        reshotSub: "sai số nhỏ như tay người: hướng, lực và xoáy",
        made: (n) => `${n} lần vào`,
        rate: (h, t) => (h === 0 ? "Không lần nào vào." : `Tỉ lệ vào ${(h / t * 100).toFixed(1).replace(".", ",")}%`),
        outro: ["Bạn có", "đánh được không?"],
        outroSub: "Cùng thế bi. Vật lý bida 3 băng thật.",
        ios: ["Tải về trên", "App Store"],
        android: ["TẢI NỘI DUNG TRÊN", "Google Play"],
        search: "Tìm “RANKUE”",
    },
};
