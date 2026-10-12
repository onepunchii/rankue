/**
 * 산 와펜(2026-10-13 오너: "100대 명산은 와펜이나 이미지 제작") — 산림청 100대 명산 한 곳마다 한 장.
 *
 * 그림(client/public/hiking/art/mt/<산의 id>.webp)은 가장자리까지 꽉 찬 자수 그림이고, **모양과 테두리는 여기서 그린다** —
 * 백 장이 한 벌로 가지런하고, 권역의 색(regionInk)이 테두리 실의 색이 된다. 모양은 정상석을 닮은 아치다(도장첩 와펜의 원 · 방패 · 육각과 다르다).
 * 그림은 그 산의 사진이 아니다 — 소개 글에 나오는 소재(억새 · 암릉 · 계곡 …)와 높이로 그린 휘장이다. 산 이름은 그림에 없고 화면이 적는다.
 * 정상에서 인증하면 제 색이 되고, 그 전에는 흐리다. preview 는 받을 수 있는 것을 제 색으로 보여 줄 때(방문자 · 산의 소개 · 목록).
 * 그림은 화면에 들어올 때 받는다(목록에 백 장이 놓인다). ⚠️ 리터럴 색만. 장식이라 alt 는 비운다.
 */
import { mountainPatchSrc } from "../theme";
import { regionInk } from "./SummitStamp";

/** 100×112 안의 아치(위는 반원, 아래 모서리는 둥글게) — 바깥 선과 안쪽 선 사이가 테두리 실이다 */
const OUTER = "M5 99 V47 A45 45 0 0 1 95 47 V99 A8 8 0 0 1 87 107 H13 A8 8 0 0 1 5 99 Z";
const INNER = "M11.5 97.5 V47 A38.5 38.5 0 0 1 88.5 47 V97.5 A3 3 0 0 1 85.5 100.5 H14.5 A3 3 0 0 1 11.5 97.5 Z";
const STITCH = "M8.3 98.2 V47 A41.7 41.7 0 0 1 91.7 47 V98.2 A5.5 5.5 0 0 1 86.2 103.7 H13.8 A5.5 5.5 0 0 1 8.3 98.2 Z";

export function MountainPatch({ id, region, size, earned, preview, className }: { id: string; region: string | null | undefined; size: number; earned: boolean; preview?: boolean; className?: string }) {
    const on = earned || !!preview;
    const ink = regionInk(region);
    return (
        <span aria-hidden data-mountain-patch={id} data-earned={earned ? "1" : "0"} className={`relative block shrink-0 ${className ?? ""}`}
            style={{ width: size, height: Math.round(size * 1.12), filter: on ? "drop-shadow(0 3px 5px rgba(0,0,0,0.45))" : "grayscale(1) brightness(0.85)", opacity: on ? 1 : 0.5 }}>
            {/* 그림은 테두리 실 밑에 깔린다 — 모서리 반지름이 아치의 안쪽 선과 바깥 선 사이에 놓인다 */}
            <img src={mountainPatchSrc(id)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute object-cover"
                style={{ left: "7%", top: "4.5%", width: "86%", height: "89.3%", borderRadius: "50% 50% 7% 7% / 43% 43% 6% 6%", background: ink }} />
            <svg viewBox="0 0 100 112" className="absolute inset-0 h-full w-full">
                <path d={`${OUTER} ${INNER}`} fillRule="evenodd" fill={ink} />
                <path d={OUTER} fill="none" stroke="#000000" strokeOpacity="0.28" strokeWidth="1.2" />
                <path d={INNER} fill="none" stroke="#000000" strokeOpacity="0.3" strokeWidth="1" />
                <path d={STITCH} fill="none" stroke="#FFFFFF" strokeOpacity="0.42" strokeWidth="4.2" strokeDasharray="1.1 1.5" />
            </svg>
        </span>
    );
}
