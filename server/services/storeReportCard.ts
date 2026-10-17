/**
 * 사장님 리포트 카드 — 1200×1500 PNG(2026-10-18 오너: 당구장 사장님 모집 제안). 어드민 '손님이 찾는 매장'에서 받아
 * 사장님께 전화 · 방문 때 보여 드리는 한 장이다. **공개 카드가 아니다** — 어드민 쿠키로만 열린다(routes/modules/adminStoreDemand).
 * 인증한 사장님은 자기 매장 것만 대시보드에서 받는다(owner — 아래 줄이 신청 권유 대신 매장 QR, routes/modules/partner /page-report.png).
 *
 *   위(420)   그 매장의 당구대 그림(storeCard 의 tableSvg — 같은 코드 = 같은 그림) + 'RANKUE 매장 리포트' · 기간
 *   가운데    동네 · 이름 · 큰 숫자 셋(본 사람 · 길찾기 · 전화 · 주소 · 네이버 비율) · 날마다 본 사람 막대(가장 많은 날에 숫자)
 *   아래      인증하면 할 수 있는 것 · 매장 페이지 주소 · 셈의 기준
 * 숫자는 shared/storeDemand 의 셈 그대로(받은 값 — 어림 · 반올림 말고는 손대지 않는다). 엔진 · 폰트는 선수 카드와 공용.
 */
import { engines, fonts } from "./playerCard.js";
import { fitSize, nameLines } from "./cardText.js";
import { tableSvg } from "./storeCard.js";
import { demandRangeText, reportStats, type StoreReport } from "../../shared/storeDemand.js";

const W = 1200, H = 1500, PAD = 72, ART_H = 420;
const FELT_DEEP = "#062A1E", IVORY = "#F5F1E6", GOLD = "#E8C46A", MUTED = "rgba(245,241,230,0.62)", LINE = "rgba(245,241,230,0.14)";

type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
    ({ type, props: { style: type === "div" ? { display: "flex", ...style } : style, children: children.length === 1 ? children[0] : children } });

const md = (d: string) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(d); return m ? `${Number(m[1])}월 ${Number(m[2])}일` : d; };

/** 날마다 본 사람 — 막대. 가장 많은 날에만 숫자, 처음 · 끝 날짜를 밑에 */
function bars(daily: StoreReport["daily"], width: number, height: number): El {
    const max = Math.max(1, ...daily.map((d) => d.visitors));
    const peak = daily.reduce((a, d) => (d.visitors > a.visitors ? d : a), daily[0] ?? { day: "", visitors: 0 });
    const n = Math.max(1, daily.length), gap = n > 20 ? 6 : 12, bw = Math.max(6, Math.floor((width - gap * (n - 1)) / n));
    const top = 46, chartH = height - top - 40;
    return h("div", { position: "relative", width, height, flexDirection: "column" },
        h("div", { position: "absolute", left: 0, top, width, height: chartH, alignItems: "flex-end" },
            ...daily.map((d, i) => {
                const bh = d.visitors > 0 ? Math.max(8, Math.round((d.visitors / max) * chartH)) : 4;
                const isPeak = d.day === peak.day && peak.visitors > 0;
                return h("div", { width: bw, height: bh, marginRight: i < n - 1 ? gap : 0, borderRadius: 6, background: isPeak ? GOLD : d.visitors > 0 ? "rgba(245,241,230,0.55)" : "rgba(245,241,230,0.16)" });
            })),
        ...(peak.visitors > 0 ? [h("div", { position: "absolute", top: 0, left: Math.min(width - 300, Math.max(0, daily.indexOf(peak) * (bw + gap) + bw / 2 - 150)), width: 300, justifyContent: "center", fontSize: 30, fontWeight: 700, color: GOLD, whiteSpace: "nowrap" }, `${md(peak.day)} ${peak.visitors.toLocaleString("ko-KR")}명`)] : []),
        h("div", { position: "absolute", left: 0, bottom: 0, width, justifyContent: "space-between", fontSize: 26, color: MUTED },
            h("div", {}, daily[0] ? md(daily[0].day) : ""), h("div", {}, daily.length > 1 ? md(daily[daily.length - 1].day) : "")),
    );
}

function tree(r: StoreReport, owner: boolean): El {
    const room = W - PAD * 2;
    const name = nameLines(r.name, room, 120, 100);
    const art = `data:image/svg+xml;base64,${Buffer.from(tableSvg(r.code, W, ART_H)).toString("base64")}`;
    const range = demandRangeText(r.from, r.to);
    const stats = reportStats(r);
    // 주소가 동네 이름으로 시작하면 주소만("대구 · 대구 북구 …"가 되지 않게)
    const where = r.address && r.region && r.address.startsWith(r.region) ? r.address : [r.region, r.address].filter(Boolean).join(" · ");
    return h("div", { width: W, height: H, flexDirection: "column", fontFamily: "Pretendard", color: IVORY, backgroundColor: FELT_DEEP, position: "relative" },
        { type: "img", props: { src: art, width: W, height: ART_H, style: { position: "absolute", left: 0, top: 0, width: W, height: ART_H } } },
        h("div", { position: "absolute", left: 0, top: 0, width: W, height: ART_H, backgroundImage: "linear-gradient(180deg, rgba(6,42,30,0.55) 0%, rgba(6,42,30,0) 40%, rgba(6,42,30,0.9) 100%)" }),
        h("div", { position: "absolute", left: 60, top: 52, width: W - 120, justifyContent: "space-between", alignItems: "center" },
            h("div", { alignItems: "center", fontSize: 32, fontWeight: 800, letterSpacing: 2 }, h("div", { width: 18, height: 18, borderRadius: 9, background: GOLD, marginRight: 14 }), "RANKUE 매장 리포트"),
            range ? h("div", { fontSize: 28, fontWeight: 700, color: "#1E1606", background: GOLD, borderRadius: 999, padding: "8px 24px" }, range) : ""),
        h("div", { position: "absolute", left: PAD, top: ART_H - 40, width: room, flexDirection: "column" },
            where ? h("div", { fontSize: fitSize([where], room, 38), fontWeight: 700, color: GOLD, whiteSpace: "nowrap" }, where) : "",
            h("div", { flexDirection: "column", marginTop: 8 }, ...name.lines.map((l) => h("div", { fontSize: name.size, fontWeight: 800, letterSpacing: -name.size * 0.035, lineHeight: 1.05, whiteSpace: "nowrap" }, l))),
            h("div", { marginTop: 22, fontSize: 32, color: MUTED }, "랭큐 매장 페이지에서"),
            // 큰 숫자 셋
            h("div", { marginTop: 22, width: room, justifyContent: "space-between" },
                ...stats.map((s, i) => h("div", { width: Math.floor((room - 40) / 3), flexDirection: "column", paddingTop: 22, borderTop: `3px solid ${i === 0 ? GOLD : LINE}` },
                    h("div", { alignItems: "flex-end" }, h("div", { fontSize: 92, fontWeight: 800, letterSpacing: -3, lineHeight: 1 }, s.value), s.unit ? h("div", { fontSize: 38, fontWeight: 700, marginLeft: 6, marginBottom: 8, color: MUTED }, s.unit) : ""),
                    h("div", { marginTop: 12, fontSize: 27, color: MUTED, lineHeight: 1.3 }, s.label)))),
            h("div", { marginTop: 50, fontSize: 30, fontWeight: 700 }, "날마다 본 사람"),
            h("div", { marginTop: 10 }, bars(r.daily, room, 330)),
        ),
        // 아래 — 인증하면
        h("div", { position: "absolute", left: PAD, bottom: 64, width: room, flexDirection: "column", borderTop: `2px solid ${LINE}`, paddingTop: 30 },
            // 인증한 사장님이 받은 카드(사장님 대시보드)는 신청 권유 대신 매장 QR 한 줄
            h("div", { fontSize: 34, fontWeight: 700 }, owner ? "매장 QR로 가입한 손님은 우리 매장 회원이 돼요" : "사장님 인증하면 — 영업시간 · 요금 · 소개를 직접 고치세요"),
            h("div", { marginTop: 12, justifyContent: "space-between", alignItems: "flex-end" },
                h("div", { fontSize: 30, color: GOLD, fontWeight: 700 }, `rankue.co.kr/stores/${r.code}`),
                h("div", { fontSize: 22, color: MUTED }, "본 사람 = 브라우저 하나 · 랭큐 방문 기록")),
        ),
    );
}

export async function renderStoreReportPng(r: StoreReport, opts: { owner?: boolean } = {}): Promise<Buffer> {
    const { satori, Resvg } = await engines();
    const svg = await satori(tree(r, opts.owner === true) as any, { width: W, height: H, fonts: fonts() });
    return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}
