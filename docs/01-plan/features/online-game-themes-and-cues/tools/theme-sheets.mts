import { chromium } from "/Users/choejeonghwan/rankue-app/store/screenshots/capture3-lib.mts";
import { writeFileSync } from "node:fs";
const DIR = "/Users/choejeonghwan/rankue-app/reports/sim-themes-1012";
const S = process.env.S!;
const T = [["now", "지금", "파란 천 · 갈색 테두리"], ["a", "A 대회장 블루", "파란 천 · 유광 마호가니"], ["b", "B 클래식 그린", "초록 천 · 월넛"], ["c", "C 미드나잇", "차콜 천 · 무광 블랙"], ["d", "D 민트 메이플", "청록 천 · 밝은 메이플"]];
const css = `body{margin:0;background:#0e0f11;color:#fff;font:500 22px -apple-system,'Apple SD Gothic Neo',sans-serif} h1{font-size:34px;font-weight:800;margin:0} .sub{color:#9aa0a6;font-size:20px;margin-top:6px} .wrap{padding:36px} .row{display:grid;gap:18px;margin-top:26px} figure{margin:0} figcaption{margin-top:10px} figcaption b{display:block;font-size:24px;font-weight:800} figcaption span{color:#9aa0a6;font-size:18px} img{display:block;width:100%;border-radius:18px;border:1px solid #2a2c30} .note{margin-top:26px;color:#9aa0a6;font-size:18px;line-height:1.5}`;
const shotSheet = (view: string, title: string, sub: string) => `<!doctype html><meta charset="utf-8"><style>${css}</style><div class="wrap"><h1>${title}</h1><p class="sub">${sub}</p><div class="row" style="grid-template-columns:repeat(5,1fr)">${T.map(([id, name, desc]) => `<figure><img src="file://${DIR}/shots/${id}-${view}.png"><figcaption><b>${name}</b><span>${desc}</span></figcaption></figure>`).join("")}</div><p class="note">시안 — 실제 게임 화면(혼자 치기, 3쿠션 대대)에 테마를 임시로 입혀 찍은 것입니다. 운영에는 아무것도 적용하지 않았습니다.</p></div>`;
const M = T.slice(1);
const matSheet = `<!doctype html><meta charset="utf-8"><style>${css} .cell img{aspect-ratio:1/1;object-fit:cover} .cue img{aspect-ratio:1/1;object-fit:cover;object-position:center}</style><div class="wrap"><h1>만든 재료 — 테두리 나무 · 큐대 무늬 · 대전방 배경</h1><p class="sub">OpenRouter(GPT 이미지 모델)로 만든 그림 원본입니다. 천은 색만 정하고 지금처럼 코드로 그립니다.</p>${M.map(([id, name]) => `<div class="row" style="grid-template-columns:220px repeat(3,1fr);align-items:center"><div><b style="font-size:26px;font-weight:800">${name}</b></div>${[["wood", "테두리 나무"], ["cue2", "큐대 무늬(가까이)"], ["room", "대전방 배경"]].map(([k, label]) => `<figure class="cell"><img src="file://${DIR}/raw/${id}-${k}.png"><figcaption><span>${label}</span></figcaption></figure>`).join("")}</div>`).join("")}<p class="note">시안 — 그림 속 장소·물건은 지어낸 것입니다(실제 대회장·브랜드가 아닙니다).</p></div>`;
const b = await chromium.launch();
for (const [name, html, w] of [["sheet-3d", shotSheet("player", "당구 온라인게임 테마 시안 — 3D 시점(치는 화면)", "왼쪽이 지금 모습, A~D 가 시안"), 2400], ["sheet-top", shotSheet("top", "당구 온라인게임 테마 시안 — 위에서 보기", "왼쪽이 지금 모습, A~D 가 시안"), 2400], ["sheet-materials", matSheet, 1800]] as const) {
    writeFileSync(`${S}/${name}.html`, html);
    const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    await p.goto(`file://${S}/${name}.html`);
    await p.waitForLoadState("networkidle");
    const broken = await p.evaluate(`[...document.images].filter((i) => i.naturalWidth === 0).length`);
    if (broken) throw new Error(`${name}: broken images ${broken}`);
    await p.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
    await p.close();
    console.log("ok", name);
}
await b.close();
