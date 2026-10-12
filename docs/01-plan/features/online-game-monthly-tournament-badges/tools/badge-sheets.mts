import { chromium } from "/Users/choejeonghwan/rankue-app/store/screenshots/capture3-lib.mts";
import { writeFileSync } from "node:fs";
const DIR = "/Users/choejeonghwan/rankue-app/reports/sim-badges-1012";
const WOOD = "/Users/choejeonghwan/rankue-app/reports/sim-themes-1012/raw/b-wood.png";
const S = process.env.S!;
const raw = (n: string) => `file://${DIR}/raw/${n}.png`;
const TIERS = [["iron", "아이언"], ["bronze", "브론즈"], ["silver", "실버"], ["gold", "골드"], ["platinum", "플래티넘"], ["diamond", "다이아"], ["master", "마스터"]];
const MEDALS = [["medal-1", "1", "#5b3d0c", "rgba(255,236,170,.55)"], ["medal-2", "2", "#3d434c", "rgba(255,255,255,.6)"], ["medal-3", "3", "#4a240d", "rgba(255,200,160,.45)"], ["medal-4b", "4", "#3a3550", "rgba(255,255,255,.55)"], ["medal-5b", "5", "#2f4a4a", "rgba(255,255,255,.55)"]];
const medal = (m: string[], size: number, extra = "") => `<span class="medal" style="width:${size}px;height:${size}px;${extra}"><img src="${raw(m[0])}"><b style="font-size:${Math.round(size * 0.23)}px;color:${m[2]};text-shadow:0 1px 0 ${m[3]}">${m[1]}</b></span>`;
const base = `body{margin:0;background:#0e0f11;color:#fff;font:500 22px -apple-system,'Apple SD Gothic Neo',sans-serif} h1{font-size:34px;font-weight:800;margin:0} h2{font-size:24px;font-weight:800;margin:34px 0 14px} .sub{color:#9aa0a6;font-size:20px;margin-top:6px} .wrap{padding:36px} .note{margin-top:26px;color:#9aa0a6;font-size:18px;line-height:1.5} .medal{position:relative;display:inline-block} .medal img{width:100%;height:100%;display:block} .medal b{position:absolute;left:0;right:0;top:63.5%;transform:translateY(-50%);text-align:center;font-weight:900;font-family:'SF Pro Rounded','Helvetica Neue',sans-serif;letter-spacing:-.02em}`;

// ── 1. 배지 모음 ─────────────────────────────────────────────
const sheet1 = `<!doctype html><meta charset="utf-8"><style>${base} .row{display:grid;gap:14px} figure{margin:0;text-align:center} figure img{width:100%;display:block;border-radius:14px} figcaption{margin-top:8px;font-size:20px;font-weight:800} figcaption span{display:block;color:#9aa0a6;font-size:16px;font-weight:500}</style>
<div class="wrap"><h1>온라인게임 배지 시안</h1><p class="sub">티어 배지 일곱 · 월대회 순위 메달 다섯. 숫자와 글자는 그림이 아니라 화면에서 얹습니다.</p>
<h2>티어 배지 — 등급이 오를수록 장식이 는다</h2>
<div class="row" style="grid-template-columns:repeat(7,1fr)">${TIERS.map(([id, name]) => `<figure><img src="${raw("tier-" + id)}"><figcaption>${name}</figcaption></figure>`).join("")}</div>
<h2>월대회 순위 메달 — 1등부터 5등</h2>
<div class="row" style="grid-template-columns:repeat(5,1fr);max-width:1400px">${MEDALS.map((m) => `<figure>${medal(m, 262)}<figcaption>월대회 ${m[1]}등</figcaption></figure>`).join("")}</div>
<p class="note">시안 — AI 이미지 모델로 만든 그림입니다. 실제로 넣을 때는 배경을 투명하게 따고 작은 크기(이름 옆 24px)에서도 구분되는지 다시 봅니다.</p></div>`;

// ── 2. 화면 시안: 장식장 · 랭킹 줄 ──────────────────────────────
const shelf = (title: string, hint: string, inner: string) => `<section class="shelf"><div class="shelf-h"><b>${title}</b><span>${hint}</span></div><div class="shelf-b">${inner}</div><div class="plank"></div></section>`;
const tierItem = (id: string, name: string, n: number) => `<div class="it ${n ? "" : "off"}"><img src="${raw("tier-" + id)}"><em>${n ? "×" + n : "–"}</em><i>${name}</i></div>`;
const medalItem = (m: string[], n: number) => `<div class="it ${n ? "" : "off"}">${medal(m, 74)}<em>${n ? "×" + n : "–"}</em><i>${m[1]}등</i></div>`;
const phoneCss = `.phones{display:flex;gap:40px;align-items:flex-start;margin-top:26px} .phone{width:440px;border-radius:38px;border:1px solid #2a2c30;background:#121314;overflow:hidden;font-size:15px} .ph-h{display:flex;align-items:center;gap:10px;padding:18px 18px 12px;font-size:18px;font-weight:800} .ph-h small{margin-left:auto;font-size:11px;font-weight:700;color:#0e0f11;background:#e8c46a;border-radius:99px;padding:3px 8px}
.me{display:flex;align-items:center;gap:12px;margin:4px 16px 14px;padding:14px;border-radius:18px;background:#1b1c1e;border:1px solid #2a2c30} .me img{width:64px;height:64px;mix-blend-mode:lighten} .me b{font-size:17px;font-weight:800;display:block} .me span{color:#9aa0a6;font-size:13px} .me .tot{margin-left:auto;text-align:right} .me .tot b{font-size:22px}
.shelf{margin:0 16px 14px;border-radius:18px;overflow:hidden;border:1px solid #2a2c30;background:radial-gradient(120% 90% at 50% 0%, #3a2c1e 0%, #1c1611 55%, #120e0b 100%)} .shelf-h{display:flex;align-items:baseline;gap:8px;padding:12px 14px 2px} .shelf-h b{font-size:15px;font-weight:800} .shelf-h span{color:#b9a58a;font-size:12px} .shelf-b{display:flex;justify-content:space-around;align-items:flex-end;padding:6px 6px 0} .plank{height:14px;background:url(file://${WOOD}) center/600px;box-shadow:0 -1px 0 rgba(255,255,255,.12) inset, 0 6px 14px rgba(0,0,0,.6)}
.it{position:relative;text-align:center;width:14%} .shelf-b.five .it{width:19%} .it img{width:100%;display:block;mix-blend-mode:lighten} .it .medal{width:100%!important;height:auto!important;aspect-ratio:1/1} .it .medal img{mix-blend-mode:lighten} .it em{position:absolute;right:-2px;top:0;font-style:normal;font-size:12px;font-weight:900;color:#0e0f11;background:#e8c46a;border-radius:99px;padding:1px 6px} .it i{display:block;font-style:normal;font-size:11px;color:#cdbfa8;margin:-2px 0 6px} .it.off img{filter:grayscale(1) brightness(.38)} .it.off em{background:#3a3b3e;color:#9aa0a6} .it.off i{color:#6b6f75} .it.off .medal b{opacity:.25}
.list{margin:0 16px 18px;border-radius:18px;background:#1b1c1e;border:1px solid #2a2c30} .list p{margin:0;display:flex;align-items:center;gap:10px;padding:11px 14px;border-top:1px solid #26282b;font-size:14px} .list p:first-child{border-top:0} .list p > b{font-weight:800;width:74px} .list p span{color:#9aa0a6} .list p img{width:26px;height:26px;mix-blend-mode:lighten;margin-left:auto} .list p .medal{margin-left:0}
.rk p{margin:0;display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid #1f2123;font-size:15px} .rk p:first-of-type{border-top:0} .rk .no{width:22px;color:#9aa0a6;font-weight:800;text-align:center} .rk img.t{width:34px;height:34px;mix-blend-mode:lighten} .rk b{font-weight:800} .rk .pts{margin-left:auto;font-weight:800;font-variant-numeric:tabular-nums} .rk .pts small{color:#9aa0a6;font-weight:500;font-size:12px} .rk .mine{background:#1d2a22} .rk .cut{justify-content:center;color:#e8c46a;font-size:12px;font-weight:800;padding:6px 16px;background:repeating-linear-gradient(90deg,#3a3320 0 10px,#2a2618 10px 20px);border-top:0} .rk .st{font-style:normal;font-size:11px;font-weight:800;border-radius:99px;padding:2px 8px;margin-left:6px} .rk .st.ok{background:#1f3a22;color:#7be37f} .rk .st.wait{background:#3a3320;color:#e8c46a}
.br{display:flex;gap:8px;padding:0 12px 18px} .br .col{flex:1;min-width:0} .br h4{margin:0 0 8px;font-size:11.5px;color:#9aa0a6;font-weight:700} .m{border:1px solid #2a2c30;border-radius:10px;background:#1b1c1e;margin-bottom:8px;overflow:hidden} .m p{margin:0;display:flex;justify-content:space-between;gap:4px;padding:6px 8px;font-size:12px;color:#8d9299} .m p + p{border-top:1px solid #26282b} .m p.w{color:#fff;font-weight:800} .m p b{font-weight:800;font-variant-numeric:tabular-nums} .m p span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .m em{display:block;font-style:normal;font-size:10px;color:#e8c46a;padding:3px 8px;background:#2a2618}
.podium{margin-top:10px;border:1px solid #2a2c30;border-radius:10px;background:radial-gradient(120% 90% at 50% 0%, #3a2c1e 0%, #1c1611 60%, #120e0b 100%);padding:6px 6px 4px} .podium p{margin:0;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;padding:1px 0} .podium .medal img{mix-blend-mode:lighten}
.cap{padding:0 18px 12px;color:#9aa0a6;font-size:12.5px;line-height:1.5} .tabs{display:flex;gap:6px;padding:0 16px 10px} .tabs span{padding:6px 12px;border-radius:99px;background:#1b1c1e;border:1px solid #2a2c30;font-size:13px;font-weight:700;color:#9aa0a6} .tabs span.on{background:#64dd17;color:#0b1a03;border-color:transparent}`;
const earnedT: Record<string, number> = { iron: 1, bronze: 2, silver: 3, gold: 2, platinum: 0, diamond: 0, master: 0 };
const earnedM = [1, 2, 0, 1, 0];
const cabinet = `<div class="phone"><div class="ph-h">‹ &nbsp;장식장 <small>예시</small></div>
<div class="me"><img src="${raw("tier-gold")}"><div><b>은빛큐</b><span>골드 · 레이팅 1,172 · 대회 포인트 190</span></div><div class="tot"><b>12</b><span>모은 배지</span></div></div>
${shelf("월대회 메달", "우승부터 8강까지", `</div><div class="shelf-b five">${MEDALS.map((m, i) => medalItem(m, earnedM[i])).join("")}`)}
${shelf("티어 배지", "달마다 받은 등급", TIERS.map(([id, name]) => tierItem(id, name, earnedT[id])).join(""))}
<div class="list"><p><b>10월</b><span>출전 확정 · 대진 추첨 전</span><img src="${raw("tier-gold")}"></p><p><b>9월</b><span>준우승 · 포인트 70</span>${medal(MEDALS[1], 26, "margin-left:auto")}<img src="${raw("tier-gold")}" style="margin-left:0"></p><p><b>8월</b><span>우승 · 포인트 100</span>${medal(MEDALS[0], 26, "margin-left:auto")}<img src="${raw("tier-silver")}" style="margin-left:0"></p><p><b>7월</b><span>출전권 없음</span><img src="${raw("tier-silver")}"></p></div></div>`;
const RK = [["1", "gold", "파란초크", "1,214", "", "출전"], ["2", "gold", "은빛큐", "1,172", "mine", "출전"], ["3", "silver", "빨간공", "1,121", "", "출전"], ["4", "silver", "노란큐", "1,088", "", "2판 더"], ["5", "silver", "하얀큐", "1,064", "", "출전"], ["CUT"], ["6", "bronze", "초록천", "1,031", "", ""], ["7", "bronze", "새싹큐", "987", "", ""]];
const ranking = `<div class="phone"><div class="ph-h">‹ &nbsp;11월 월대회 · 출전권 <small>예시</small></div><div class="tabs"><span class="on">출전권</span><span>대진표</span><span>지난 대회</span></div>
<p class="cap">레이팅 1,050 이상 + 이번 달 5판 이상이면 출전 · 25일 밤 12시에 확정 · 최대 16명</p>
<div class="rk">${RK.map(([no, tier, name, pts, cls, st]) => no === "CUT" ? `<p class="cut">출전 기준 · 레이팅 1,050</p>` : `<p class="${cls}"><span class="no">${no}</span><img class="t" src="${raw("tier-" + tier)}"><b>${name}</b>${st ? `<i class="st ${st === "출전" ? "ok" : "wait"}">${st}</i>` : ""}<span class="pts">${pts}</span></p>`).join("")}</div><p class="cap" style="padding-top:12px">이름 옆 배지 = 지금 등급. 눌러서 그 사람의 장식장을 봅니다.</p></div>`;
const M = (a, b, sa, sb, note = "") => { const aw = typeof sa === "string" ? true : sa > sb; return `<div class="m"><p class="${aw ? "w" : ""}"><span>${a}</span><b>${sa}</b></p><p class="${aw ? "" : "w"}"><span>${b}</span><b>${sb}</b></p>${note ? `<em>${note}</em>` : ""}</div>`; };
const bracket = `<div class="phone"><div class="ph-h">‹ &nbsp;10월 월대회 · 대진표 <small>예시</small></div><div class="tabs"><span>출전권</span><span class="on">대진표</span><span>지난 대회</span></div>
<p class="cap">라운드마다 이틀 안에 친다 · 기한까지 안 들어오면 기권 · 8명이 나온 달의 예</p>
<div class="br"><div class="col"><h4>8강 · 26~27일</h4>${M("파란초크", "새싹큐", 20, 9)}${M("노란큐", "하얀큐", 20, 17)}${M("은빛큐", "초록천", "기권승", "불참", "기한 안에 들어오지 않음")}${M("빨간공", "검은팁", 14, 20)}</div>
<div class="col"><h4>4강 · 28~29일</h4>${M("파란초크", "노란큐", 20, 15)}${M("은빛큐", "검은팁", 20, 18)}<h4 style="margin-top:14px">3·4위전</h4>${M("노란큐", "검은팁", 20, 12)}</div>
<div class="col"><h4>결승 · 30~31일</h4>${M("파란초크", "은빛큐", 20, 16)}<div class="podium"><p>${medal(MEDALS[0], 34)}<span>파란초크</span></p><p>${medal(MEDALS[1], 34)}<span>은빛큐</span></p><p>${medal(MEDALS[2], 34)}<span>노란큐</span></p><p>${medal(MEDALS[3], 34)}<span>검은팁</span></p><p>${medal(MEDALS[4], 34)}<span>8강 4명</span></p></div></div></div></div>`;
const sheet2 = `<!doctype html><meta charset="utf-8"><style>${base}${phoneCss}</style><div class="wrap"><h1>화면 시안 — 장식장 · 출전권 · 대진표</h1><p class="sub">이름과 숫자는 전부 지어낸 예시입니다.</p><div class="phones">${cabinet}${ranking}${bracket}</div><p class="note">시안 — 실제 화면이 아니라 구성을 보여 주는 그림입니다.</p></div>`;

const b = await chromium.launch();
for (const [name, html, w] of [["badges", sheet1, 1900], ["screens", sheet2, 1490]] as const) {
    writeFileSync(`${S}/badge-${name}.html`, html);
    const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    await p.goto(`file://${S}/badge-${name}.html`); await p.waitForLoadState("networkidle");
    const broken = await p.evaluate(`[...document.images].filter((i) => i.naturalWidth === 0).length`);
    if (broken) throw new Error(`${name}: broken images ${broken}`);
    await p.screenshot({ path: `${DIR}/sheet-${name}.png`, fullPage: true }); await p.close(); console.log("ok", name);
}
await b.close();
