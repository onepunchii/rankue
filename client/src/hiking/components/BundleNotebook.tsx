/**
 * 묶음 수첩(2026-10-13 오너: "묶어서 찾기를 수첩처럼 이미지화" → "책 디자인 이미지 만들어도 되니 개선 — 진짜 소유욕이 들게").
 *
 * 목록 · 특성 묶음 하나가 천 표지의 산행 수첩 한 권이다. 표지 그림(client/public/hiking/art/book-<id>.webp)은 천의 결과 가운데의
 * 자수 문장뿐이고 — **이름 · 권 번호 · 숫자는 여기서 금박 글자로 찍는다**(그림에는 글자가 없다). 책등의 실 · 고무 밴드 · 책갈피 끈 ·
 * 종이의 두께도 여기서 그린다. 회원에게는 표지에 오른 산의 수(3 / 100)가 찍히고, 다 오르면 책갈피 끈이 금빛으로 바뀌고 '완주' 인장이 붙는다.
 * 허브의 책장(작게)과 묶음 화면의 머리(크게)가 같이 쓴다 — 크기는 width 하나로 정한다.
 * ⚠️ 리터럴 색만. 글자는 12px 이상, 굵기는 semibold 까지. 그림은 장식이라 alt 를 비운다.
 */
import { Link } from "wouter";
import { hikingListPath } from "@shared/hikingMountains";

/** 권의 차례 — 표지의 'No.' 와 책장에 꽂는 순서 */
const ORDER = ["kfs100", "kfs100plus", "nationalparks", "provincialparks", "highest50", "over1500", "over1000", "under500", "island", "azalea", "maple", "reeds", "snow"] as const;
/** 밝은 천의 표지 — 금박 대신 짙은 먹색으로 찍는다(금박이 안 읽힌다) */
const LIGHT = new Set(["under500", "azalea", "reeds", "snow"]);
/** 수첩의 색(목록 화면의 강조 · 지도의 띠) — 표지 천의 색과 같은 결 */
const INK: Readonly<Record<string, string>> = {
    kfs100: "#1F5560", kfs100plus: "#4A6076", nationalparks: "#3B5A3C", provincialparks: "#77733E", highest50: "#4A2F63",
    over1500: "#2A3560", over1000: "#3D4A5E", under500: "#6E9A4A", island: "#2E8794",
    azalea: "#C4606A", maple: "#B8412F", reeds: "#B97F2A", snow: "#7FA9BE",
};
/**
 * 책장(작은 표지)에 찍는 이름 — 한 줄에 들어가야 가운데의 문장과 겹치지 않는다. 긴 이름 셋만 줄여 찍는다
 * (제 이름은 묶음 화면의 머리와 읽어 주는 말에 그대로 나온다).
 */
const SHELF_NAME: Readonly<Record<string, string>> = { over1500: "하늘 가까운", under500: "가벼운 산", azalea: "철쭉 진달래" };
export const notebookInk = (id: string): string => INK[id] ?? "#1F5560";
export const hasNotebook = (id: string | null | undefined): boolean => !!id && (ORDER as readonly string[]).includes(id);
export const notebookSrc = (id: string): string => `/hiking/art/book-${id}.webp`;
const volume = (id: string): string => String((ORDER as readonly string[]).indexOf(id) + 1).padStart(2, "0");

const GOLD = { backgroundImage: "linear-gradient(180deg,#FFF3CC 0%,#EBCB7C 48%,#C99A3E 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", filter: "drop-shadow(0 1px 0.5px rgba(0,0,0,0.55))" } as const;
const DARK = { color: "#14232B", textShadow: "0 0 5px rgba(255,255,255,0.55), 0 1px 0 rgba(255,255,255,0.35)" } as const;

export interface NotebookProgress { got: number; total: number }

/** 수첩 한 권의 겉모습 — 누를 수 없는 그림. width 는 표지의 너비(px) */
export function BookCover({ id, name, count, progress, width, big = false, className }: {
    id: string;
    /** 표지에 찍는 이름(짧은 이름) */
    name: string;
    /** 이 묶음의 산 전체 수 */
    count: number;
    /** 회원의 진행 — 주면 '3 / 100' 을 찍는다 */
    progress?: NotebookProgress | null;
    /** 표지의 너비(px) — 안 주면 놓인 칸의 너비를 다 쓴다(책장의 격자) */
    width?: number;
    /** 크게 놓는 자리(묶음 화면의 머리) — 글자를 키운다 */
    big?: boolean;
    className?: string;
}) {
    const foil = LIGHT.has(id) ? DARK : GOLD;
    const done = !!progress && progress.total > 0 && progress.got >= progress.total;
    const title = big ? 16 : 13.5, small = big ? 12.5 : 12;
    const r = big ? 8 : 6;
    return (
        <span className={`relative block shrink-0 ${className ?? ""}`} style={{ width: width ?? "100%", aspectRatio: "100 / 138" }} data-notebook={id} data-done={done ? "1" : "0"} aria-hidden>
            {/* 종이의 두께 — 표지 뒤로 살짝 비친다 */}
            <span className="absolute" style={{ left: "3%", right: "-2.2%", top: "1.6%", bottom: "-1.6%", borderRadius: r, background: "linear-gradient(90deg,#CFC6B2,#F4EFE3 70%,#DAD2BF)", boxShadow: "0 6px 14px rgba(0,0,0,0.45)" }} />
            {/* 책갈피 끈 — 다 오른 권은 금빛 */}
            <span className="absolute" style={{ left: "66%", bottom: "-7.5%", width: "8%", height: "13%", background: done ? "linear-gradient(180deg,#F1D58A,#C99A3E)" : "linear-gradient(180deg,#F28C6A,#D2694A)", clipPath: "polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)", boxShadow: "0 1px 2px rgba(0,0,0,0.4)" }} />
            {/* 표지 */}
            <span className="absolute inset-0 overflow-hidden" style={{ borderRadius: r, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.22)" }}>
                <img src={notebookSrc(id)} alt="" width={400} height={552} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                {/* 빛 — 왼쪽 위에서 비스듬히 */}
                <span className="absolute inset-0" style={{ background: "linear-gradient(118deg,rgba(255,255,255,0.16) 0%,rgba(255,255,255,0) 32%,rgba(0,0,0,0) 62%,rgba(0,0,0,0.22) 100%)" }} />
                {/* 책등 — 접히는 골과 실 */}
                <span className="absolute inset-y-0 left-0" style={{ width: "9.5%", background: "linear-gradient(90deg,rgba(0,0,0,0.42),rgba(0,0,0,0.12) 62%,rgba(255,255,255,0.14) 82%,rgba(0,0,0,0.2))" }} />
                <span className="absolute left-0 flex flex-col justify-between" style={{ top: "9%", bottom: "9%", width: "9.5%" }}>
                    {[0, 1, 2, 3].map((k) => <span key={k} className="mx-auto block" style={{ width: "34%", height: big ? 9 : 7, borderRadius: 2, background: "rgba(246,217,168,0.82)", boxShadow: "0 1px 1px rgba(0,0,0,0.5)" }} />)}
                </span>
                {/* 고무 밴드 */}
                <span className="absolute inset-y-0" style={{ right: "7%", width: "6.5%", background: "linear-gradient(90deg,rgba(0,0,0,0.5),rgba(20,24,26,0.86) 30%,rgba(20,24,26,0.86) 70%,rgba(0,0,0,0.35))", boxShadow: "-1px 0 2px rgba(0,0,0,0.25)" }} />
                {/* 권 번호 */}
                <span className="absolute font-medium tabular-nums" style={{ left: "15%", top: "4.5%", fontSize: small, letterSpacing: "0.04em", lineHeight: 1, ...foil }}>No.{volume(id)}</span>
                {/* 글자 밑의 그늘 — 이름이 두 줄이면 문장의 아랫자락에 걸리는데, 그래도 읽히게 */}
                {!LIGHT.has(id) && <span className="absolute inset-x-0 bottom-0" style={{ height: "46%", background: "linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.36) 55%,rgba(0,0,0,0.46))" }} />}
                {/* 이름과 산의 수(또는 내 진행) — 표지 아래쪽에 붙여 쌓는다: 이름이 두 줄이어도 숫자와 겹치지 않고 위로 자란다 */}
                <span className="absolute flex flex-col items-center text-center" style={{ left: "12%", right: "15%", bottom: "5%", gap: big ? 7 : 4 }}>
                    <span className="font-semibold break-keep" style={{ fontSize: title, lineHeight: 1.16, letterSpacing: "0.01em", ...foil }}>{big ? name : SHELF_NAME[id] ?? name}</span>
                    <span className="font-medium tabular-nums" style={{ fontSize: small, lineHeight: 1, opacity: 0.92, ...foil }}>
                        {progress ? `${progress.got} / ${progress.total.toLocaleString("en-US")}` : `${count.toLocaleString("en-US")}곳`}
                    </span>
                </span>
                {/* 완주 인장 */}
                {done && (
                    <span className="absolute flex items-center justify-center rounded-full font-semibold" style={{ right: "17%", top: "3.5%", width: big ? 40 : 32, height: big ? 40 : 32, fontSize: 12, color: "#3A2A06", background: "radial-gradient(circle at 35% 30%,#FFF1C4,#E3BC5E 60%,#B98A2C)", boxShadow: "0 1px 3px rgba(0,0,0,0.5), inset 0 0 0 1.5px rgba(255,255,255,0.45)", transform: "rotate(-10deg)" }}>완주</span>
                )}
            </span>
        </span>
    );
}

/** 책장의 한 권 — 누르면 그 묶음의 지도와 산의 목록이 열린다 */
export function BundleNotebook({ id, name, count, progress }: { id: string; name: string; count: number; progress?: NotebookProgress | null }) {
    return (
        <Link href={hikingListPath(id)} className="block active:opacity-80" aria-label={`${name} · 산 ${count.toLocaleString("en-US")}곳${progress ? ` · ${progress.got}곳 올랐어요` : ""}`} data-testid={`hub-group-${id}`} data-track-as="hiking-notebook">
            <BookCover id={id} name={name} count={count} progress={progress} />
        </Link>
    );
}

export default BundleNotebook;
