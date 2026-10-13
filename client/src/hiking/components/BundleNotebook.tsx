/**
 * 묶음 수첩(2026-10-13 오너: "묶어서 찾기를 수첩처럼 뭔가 색다르게 이미지화하고") — 목록 · 특성 묶음 하나가 스프링 수첩 한 권이다.
 *
 * 표지 위쪽은 그 묶음의 그림과 이름, 아래쪽은 **그 묶음의 산이 어디에 있는지**를 찍은 작은 지도다(명산의 자리 — 허브가 준 좌표 그대로).
 * 수첩마다 제 색이 있다. 이름 · 숫자는 그림에 없고 화면이 적는다. 지도 윤곽선은 한 번만 그려 두고(<NotebookLand/>) 수첩마다 빌려 쓴다 —
 * 윤곽선 자료(골프의 점 지도가 쓰는 것)는 화면에서만 쓴다(MountainMap 의 설명과 같은 까닭).
 * ⚠️ 리터럴 색만. 글자는 12px 이상, 굵기는 semibold 까지. 그림은 장식이라 alt 를 비운다.
 */
import { Link } from "wouter";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { hikingListPath } from "@shared/hikingMountains";
import { hikingListCover } from "../theme";

/** 수첩의 색 — 묶음마다 하나(표지 띠 · 지도의 점) */
const INK: Readonly<Record<string, string>> = {
    kfs100: "#1F5560", kfs100plus: "#2F6F8F", nationalparks: "#2F6B4F", provincialparks: "#6B7F3A", highest50: "#5B4B8A",
    over1500: "#34507A", over1000: "#4A6FA5", under500: "#6E9A4A", island: "#22808F",
    azalea: "#B84E76", maple: "#C0522C", reeds: "#A97F2E", snow: "#5F86AE",
};
export const notebookInk = (id: string): string => INK[id] ?? "#1F5560";

const LAND_ID = "hk-notebook-land";
/** 작은 지도의 창 — 뭍이 꽉 차게(울릉도는 따로 찍는다) */
const VIEW = { x: 78, y: 28, w: 362, h: 600 };
const ULLEUNG = { x: 418, y: 150 };

/** 윤곽선 한 벌 — 수첩들이 놓이는 구역에 한 번만 둔다 */
export function NotebookLand() {
    return (
        <svg width="0" height="0" className="absolute" aria-hidden>
            <defs><g id={LAND_ID}>{Object.values(KOREA_MAP_PATHS).map((d, i) => <path key={i} d={d} />)}</g></defs>
        </svg>
    );
}

export interface NotebookSpot { lat: number | null; lng: number | null; sigungu?: string | null }

export function BundleNotebook({ id, name, count, spots }: {
    id: string;
    /** 표지에 적는 이름(짧은 이름) */
    name: string;
    /** 이 묶음의 산 전체 수 */
    count: number;
    /** 지도에 찍을 산(명산)의 자리 */
    spots: readonly NotebookSpot[];
}) {
    const ink = notebookInk(id);
    const dots = spots.filter((s) => s.lat != null && s.lng != null).map((s) => (s.sigungu === "울릉군" ? [ULLEUNG.x, ULLEUNG.y] : latLngToOutline(s.lat!, s.lng!)));
    // 점이 많으면 작게 — 백 곳을 찍어도 뭉개지지 않게
    const r = dots.length > 60 ? 8 : dots.length > 25 ? 10 : 12.5;
    return (
        <Link href={hikingListPath(id)} className="block active:opacity-80" data-testid={`hub-group-${id}`} data-track-as="hiking-notebook">
            <span className="relative block overflow-hidden rounded-[10px]" style={{ aspectRatio: "100 / 138", background: "#F4EFE3", boxShadow: "0 5px 12px rgba(0,0,0,0.38), inset 0 0 0 1px rgba(14,42,51,0.35)" }}>
                {/* 표지 위쪽 — 묶음의 그림에 수첩의 색을 입힌다 */}
                <span className="absolute inset-x-0 top-0" style={{ height: "36%", background: ink }}>
                    <img src={hikingListCover(id)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 62%", opacity: 0.55, mixBlendMode: "luminosity" }} />
                    <span className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${ink}F2 8%, ${ink}8C 58%, ${ink}D9)` }} aria-hidden />
                </span>
                {/* 물결 모양의 띠 끝 */}
                <svg viewBox="0 0 100 14" preserveAspectRatio="none" className="absolute inset-x-0" style={{ top: "calc(36% - 1px)", height: "9%" }} aria-hidden>
                    <path d="M0 0 H100 V3 C82 13 66 12 50 6 C34 0 18 1 0 10 Z" fill={ink} />
                </svg>
                {/* 묶음의 산이 있는 자리 */}
                <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" className="absolute" style={{ left: "16%", top: "39%", width: "80%", height: "59%" }} aria-hidden>
                    <use href={`#${LAND_ID}`} fill="#CBD4B6" />
                    <circle cx={ULLEUNG.x} cy={ULLEUNG.y} r="9" fill="#CBD4B6" />
                    {dots.map(([x, y], i) => <circle key={i} cx={x.toFixed(0)} cy={y.toFixed(0)} r={r} fill={ink} stroke="#F4EFE3" strokeWidth="2.5" />)}
                </svg>
                {/* 이름 */}
                <span className="absolute text-[13.5px] font-semibold leading-[1.22] text-[#FFFDF6] break-keep" style={{ left: "17%", right: "6%", top: "8%", textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}>{name}</span>
                {/* 스프링 */}
                <span className="absolute inset-y-0 left-0 flex flex-col justify-evenly py-1.5" style={{ width: "13%", background: "linear-gradient(90deg, rgba(0,0,0,0.28), rgba(0,0,0,0))" }} aria-hidden>
                    {Array.from({ length: 9 }, (_, i) => (
                        <span key={i} className="block" style={{ marginLeft: "-18%", width: "104%", height: 5, borderRadius: 3, background: "linear-gradient(180deg,#F4F6F7,#9AA5AA 55%,#5E6A70)", boxShadow: "0 1px 1px rgba(0,0,0,0.45)" }} />
                    ))}
                </span>
            </span>
            <span className="mt-1.5 flex h-8 items-center justify-center gap-1 rounded-lg text-[13px] tabular-nums text-[#F4EFE3]" style={{ background: "#FFFFFF12" }}>
                <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden><path d="M1 11 L5.5 3 L8 7 L10 4 L13 11 Z" fill="#F6D9A8" /></svg>
                {count.toLocaleString("en-US")}곳
            </span>
        </Link>
    );
}

export default BundleNotebook;
