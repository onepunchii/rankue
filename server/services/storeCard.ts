/**
 * 당구장 카드 이미지 — 정사각형 1200×1200 PNG (2026-09-30 오너: "매장 검색에는 이미지가 없고, 하단에 선수 카드처럼 줄지어 나오게").
 *
 * 매장 페이지 1,199곳에 대표 이미지가 하나도 없어 네이버 결과가 글만 나왔다. 선수 카드(playerCard.ts)와 같은
 * 펠트 그린·상아 팔레트로, 우리가 가진 **객관 정보만** 싣는다(오너 정책: 소개·자유텍스트 요금은 싣지 않는다):
 * 이름 · 동네 · 테이블 수(대대·중대·포켓) · 10분당 요금 · 영업시간. 없는 칸은 뺀다.
 * 엔진·폰트는 선수 카드와 공용(지연 로드).
 */
import { engines, fonts, CARD_SIZE } from "./playerCard.js";

export interface StoreCardInput {
    name: string;
    /** "인천 서구" */
    area: string;
    tables: { label: string; n: number }[];
    /** "대대 10분당 1,800원" 같은 줄 — 최대 2줄 */
    rates: string[];
    hours?: string | null;
}

const FELT = "#0E4A36";
const FELT_DEEP = "#062A1E";
const IVORY = "#F5F1E6";
const GOLD = "#E8C46A";
const MUTED = "rgba(245,241,230,0.64)";
const LINE = "rgba(245,241,230,0.16)";

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });

function tree(p: StoreCardInput): El {
    const nameSize = p.name.length > 12 ? 72 : p.name.length > 8 ? 86 : 104;
    return h("div", {
        width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", justifyContent: "space-between",
        padding: "64px 72px 56px", fontFamily: "Pretendard", color: IVORY,
        backgroundImage: `linear-gradient(160deg, ${FELT} 0%, ${FELT_DEEP} 100%)`,
    },
        h("div", { justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 34, fontWeight: 800, letterSpacing: 3 },
                h("div", { width: 18, height: 18, borderRadius: 9, background: GOLD, marginRight: 14 }), "RANKUE"),
            h("div", { fontSize: 28, fontWeight: 700, color: GOLD, border: `2px solid ${GOLD}`, borderRadius: 999, padding: "6px 22px" }, "당구장"),
        ),
        // 이름 · 동네
        h("div", { flexDirection: "column" },
            h("div", { fontSize: 40, fontWeight: 700, color: MUTED }, p.area),
            h("div", { marginTop: 14, fontSize: nameSize, fontWeight: 800, letterSpacing: -3, lineHeight: 1.08, maxWidth: 1056 }, p.name),
        ),
        // 테이블 · 요금 · 영업시간
        h("div", { flexDirection: "column", gap: 22 },
            p.tables.length
                ? h("div", { gap: 20 }, ...p.tables.slice(0, 3).map((t) =>
                    h("div", { flexDirection: "column", flex: 1, background: "rgba(245,241,230,0.07)", border: `2px solid ${LINE}`, borderRadius: 30, padding: "22px 28px" },
                        h("div", { fontSize: 28, fontWeight: 500, color: MUTED }, `${t.label} 테이블`),
                        h("div", { alignItems: "baseline", marginTop: 6 },
                            h("div", { fontSize: 64, fontWeight: 800, letterSpacing: -2 }, String(t.n)),
                            h("div", { fontSize: 30, fontWeight: 700, color: MUTED, marginLeft: 6 }, "대"),
                        ),
                    )))
                : "",
            ...p.rates.slice(0, 2).map((r) => h("div", { fontSize: 38, fontWeight: 700, color: GOLD }, r)),
            p.hours ? h("div", { fontSize: 34, fontWeight: 500, color: MUTED }, `영업 ${p.hours}`) : "",
        ),
        h("div", { justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${LINE}`, paddingTop: 28 },
            h("div", { fontSize: 28, fontWeight: 700, color: MUTED }, "요금 · 영업시간 · 테이블"),
            h("div", { fontSize: 28, fontWeight: 700, color: MUTED, letterSpacing: 1 }, "www.rankue.co.kr"),
        ),
    );
}

export async function renderStoreCardPng(p: StoreCardInput): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}

/** 카드 주소 정본 — 프리렌더·사이트맵·클라이언트가 같은 규칙. 매장 코드는 영숫자라 그대로. */
export const storeCardUrl = (origin: string, code: string) => `${origin}/og/store/${encodeURIComponent(code)}.png`;
