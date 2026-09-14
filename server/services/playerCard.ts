/**
 * 선수 카드 이미지 — 정사각형 1200×1200 PNG (2026-09-14 오너: "선수 카드 이미지 기가막히게, 정사각형 썸네일").
 *
 * 왜 서버가 그리나: 구글 검색결과 썸네일과 카톡·페북 미리보기는 페이지에 **내용과 관련된 실제 이미지**가
 * 있어야 붙는다. UMB·PBA·골프 출처는 선수 사진을 주지 않으니(초상권도 없음) 이름·순위·기록·추이로 카드를
 * 만든다. satori(플렉스 레이아웃 → SVG) + resvg(SVG → PNG). 폰트는 Pretendard woff(OFL) — server/assets/fonts,
 * vercel.json builds[0].config.includeFiles 로 서버리스 번들에 실린다. 이모지·국기는 폰트가 없어 안 쓴다.
 *
 * 렌더러는 종목을 모른다 — 헤더·히어로(순위)·타일 3칸·추이선·푸터의 **내용은 호출자(server/ogImage.ts)가
 * 채운다**. UMB(세계랭킹)·골프(투어 랭킹)·PBA(시즌 상금 순위)가 같은 카드 한 장을 나눠 쓴다.
 *
 * 디자인 언어: 당구대 펠트(딥 그린) 위에 카드 한 장. 큰 숫자 하나 + 이름 + 타일 3칸 + 추이선.
 * 앱의 선수 페이지(ui.tsx Section/Tile)와 같은 문법 — 정보는 많이, 장식은 없이.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ⚠️ satori·resvg 는 **지연 로드**한다. satori 가 끌어오는 harfbuzzjs 는 require 시점에 hb.wasm 을 읽고,
// 그게 실패하면 프로세스가 죽는다. 2026-09-14 첫 배포에서 정적 import 로 두었다가 서버리스 번들에
// hb.wasm 이 빠져 **/api 전체가 FUNCTION_INVOCATION_FAILED** 로 내려갔다(롤백). 지연 로드면 최악의 경우
// /og 만 500 이다. wasm·네이티브 바이너리는 vercel.json includeFiles 로 함께 싣는다.
type SatoriFn = (typeof import("satori"))["default"];
type ResvgCtor = (typeof import("@resvg/resvg-js"))["Resvg"];
let enginesCache: Promise<{ satori: SatoriFn; Resvg: ResvgCtor }> | null = null;
function engines() {
  enginesCache ??= Promise.all([import("satori"), import("@resvg/resvg-js")])
    .then(([s, r]) => ({ satori: s.default, Resvg: r.Resvg }))
    .catch((e) => { enginesCache = null; throw e; });
  return enginesCache;
}

export const CARD_SIZE = 1200;

export interface CardTile { label: string; value: string; unit?: string }
export interface CardTrend {
  label: string;
  /** 오래된 → 최신 */
  values: number[];
  /** true 면 값이 작을수록 위(순위). false 면 클수록 위(포인트·상금) */
  invert: boolean;
}

export interface PlayerCardInput {
  lang: string;
  /** 큰 이름 — ko 는 한글(있으면), 그 외는 로마자 */
  nameMain: string;
  /** 작은 이름 — ko 에서 로마자 병기. 없으면 생략 */
  nameSub?: string | null;
  fed: string;
  /** "남자 3쿠션" · "KPGA 코리안투어" · "PBA 투어" 같은 부문 라벨 */
  categoryLabel: string;
  /** 히어로 숫자. null 이면 "—"(최신 회차에 없음) */
  rank: number | null;
  /** 히어로 아래 작은 설명 — PBA "2025-26 시즌 상금 순위" 처럼 순위의 성격을 밝힐 때 */
  heroLabel?: string | null;
  /** 직전 회차 대비 순위 변동 — 양수가 상승 */
  delta: number | null;
  /** 세계 1위 통산 주 — 0 이면 생략 */
  weeksNo1?: number;
  /** 타일 최대 3칸 */
  tiles: CardTile[];
  trend: CardTrend | null;
  /** 추이선을 그릴 수 없을 때(회차 1개뿐인 골프 등) 그 자리에 대신 놓는 두 번째 타일 줄 — 시즌 기록 등 */
  extraTiles?: CardTile[];
  /** "2026년 9월" 같은 회차 라벨 */
  editionLabel: string;
  /** 푸터 출처 — "UMB 공식 세계랭킹" */
  source: string;
}

const L10N: Record<string, { rank: (r: number) => [string, string]; no1: (w: number) => string; up: string; down: string; same: string }> = {
  ko: { rank: (r) => [String(r), "위"], no1: (w) => `세계 1위 통산 ${w}주`, up: "상승", down: "하락", same: "유지" },
  en: { rank: (r) => ["No.", String(r)], no1: (w) => `${w} weeks at world No.1`, up: "up", down: "down", same: "steady" },
  tr: { rank: (r) => [String(r), "."], no1: (w) => `${w} hafta dünya 1 numarası`, up: "yükseldi", down: "düştü", same: "sabit" },
  vi: { rank: (r) => ["Hạng", String(r)], no1: (w) => `${w} tuần số 1 thế giới`, up: "tăng", down: "giảm", same: "giữ" },
  es: { rank: (r) => ["N.º", String(r)], no1: (w) => `${w} semanas como N.º 1`, up: "sube", down: "baja", same: "igual" },
};

/** "30위" / "No. 30" — 호출자가 타일 값에 쓸 때도 같은 표기 */
export function rankWord(lang: string, r: number): string {
  const T = L10N[lang] ?? L10N.en;
  const [a, b] = T.rank(r);
  return lang === "ko" || lang === "tr" ? `${a}${b}` : `${a} ${b}`;
}

// ── 폰트 ──────────────────────────────────────────────────────────
type FontSpec = { name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" };
let fontsCache: FontSpec[] | null = null;
function fontDir(): string {
  const candidates = [
    path.join(process.cwd(), "server/assets/fonts"),
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/fonts"),
  ];
  for (const c of candidates) if (fs.existsSync(path.join(c, "Pretendard-Bold.woff"))) return c;
  throw new Error(`[playerCard] fonts not found: ${candidates.join(", ")}`);
}
function fonts(): FontSpec[] {
  if (fontsCache) return fontsCache;
  const dir = fontDir();
  fontsCache = ([["Medium", 500], ["Bold", 700], ["ExtraBold", 800]] as const).map(([w, weight]) => ({
    name: "Pretendard", data: fs.readFileSync(path.join(dir, `Pretendard-${w}.woff`)), weight, style: "normal",
  }));
  return fontsCache;
}

// ── 팔레트 — 펠트 그린 + 상아 + 골드 포인트 ─────────────────────────
const FELT = "#0E4A36";
const FELT_DEEP = "#062A1E";
const IVORY = "#F5F1E6";
const GOLD = "#E8C46A";
const MUTED = "rgba(245,241,230,0.62)";
const LINE = "rgba(245,241,230,0.14)";

// satori 는 React 없이도 {type, props} 트리를 받는다.
type El = { type: string; props: Record<string, unknown> & { children?: unknown } };
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El =>
  ({ type, props: { style: { display: type === "div" ? "flex" : undefined, ...style }, children: children.length === 1 ? children[0] : children } });

/** 추이선 path — invert 면 작은 값이 위(순위), 아니면 큰 값이 위(포인트·상금). */
function trendPath(values: number[], invert: boolean, w: number, hgt: number): { d: string; area: string; last: { x: number; y: number } } {
  const pts = values.slice(-24);
  if (pts.length < 2) return { d: "", area: "", last: { x: w, y: hgt / 2 } };
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  // 변동이 없으면(계속 1위) 가운데 수평선 — 위쪽에 붙어 면이 통째로 칠해지는 걸 막는다
  const ys = pts.map((v) => {
    if (span === 0) return hgt / 2;
    const t = (v - min) / span;               // 0(min) ~ 1(max)
    const top = invert ? t : 1 - t;           // 0 = 위쪽
    return 8 + top * (hgt - 16);
  });
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const area = `${d} L${w},${hgt} L0,${hgt} Z`;
  return { d, area, last: { x: xs[xs.length - 1], y: ys[ys.length - 1] } };
}

function tile(t: CardTile): El {
  const long = t.value.length > 7;
  return h("div", { flexDirection: "column", flex: 1, background: "rgba(245,241,230,0.07)", border: `2px solid ${LINE}`, borderRadius: 28, padding: "20px 28px", minWidth: 0 },
    h("div", { fontSize: 26, fontWeight: 500, color: MUTED }, t.label),
    h("div", { alignItems: "baseline", marginTop: 6 },
      h("div", { fontSize: long ? 42 : 56, fontWeight: 800, color: IVORY, letterSpacing: -2 }, t.value),
      t.unit ? h("div", { fontSize: 28, fontWeight: 700, color: MUTED, marginLeft: 6 }, t.unit) : "",
    ),
  );
}

export function playerCardTree(p: PlayerCardInput): El {
  const T = L10N[p.lang] ?? L10N.en;
  const rankIsNumberFirst = p.lang === "ko" || p.lang === "tr";
  const [rankA, rankB] = p.rank == null ? ["—", ""] : T.rank(p.rank);
  const nameLen = p.nameMain.length;
  const nameSize = nameLen > 20 ? 56 : nameLen > 14 ? 68 : 84;
  const deltaText = p.delta == null ? "" : p.delta > 0 ? `▲ ${p.delta} ${T.up}` : p.delta < 0 ? `▼ ${-p.delta} ${T.down}` : `— ${T.same}`;
  const deltaColor = p.delta == null ? MUTED : p.delta > 0 ? "#8FE3A8" : p.delta < 0 ? "#F19A8E" : MUTED;
  const TW = 1040, TH = 130;
  const tr = p.trend ? trendPath(p.trend.values, p.trend.invert, TW, TH) : { d: "", area: "", last: { x: 0, y: 0 } };
  // 추이선이 없으면(값 2개 미만) 빈 공간 대신 두 번째 타일 줄을 놓는다
  const extra = !tr.d && p.extraTiles?.length ? p.extraTiles.slice(0, 3) : null;
  const big = (s: string) => h("div", { fontSize: 270, fontWeight: 800, lineHeight: 0.88, letterSpacing: -12, color: IVORY }, s);
  const small = (s: string, side: "left" | "right") => s ? h("div", { fontSize: 88, fontWeight: 700, [side === "left" ? "marginRight" : "marginLeft"]: side === "left" ? 14 : 10, color: GOLD }, s) : "";

  return h("div", {
    width: CARD_SIZE, height: CARD_SIZE, flexDirection: "column", padding: 56, fontFamily: "Pretendard", color: IVORY,
    backgroundColor: FELT_DEEP,
    backgroundImage: `radial-gradient(circle at 30% 18%, ${FELT} 0%, ${FELT_DEEP} 70%)`,
  },
    // 쿠션 프레임 — 카드 한 장
    h("div", { flex: 1, flexDirection: "column", border: `3px solid ${LINE}`, borderRadius: 48, padding: "48px 56px", position: "relative" },
      // 헤더: 워드마크 + 부문 · 국가
      h("div", { justifyContent: "space-between", alignItems: "center" },
        h("div", { alignItems: "center" },
          h("div", { width: 18, height: 18, borderRadius: 9, background: GOLD, marginRight: 14 }),
          h("div", { fontSize: 34, fontWeight: 800, letterSpacing: 4 }, "RANKUE"),
        ),
        h("div", { alignItems: "center" },
          h("div", { fontSize: 26, fontWeight: 700, color: MUTED, marginRight: 16 }, p.categoryLabel),
          h("div", { fontSize: 26, fontWeight: 800, color: FELT_DEEP, background: IVORY, borderRadius: 999, padding: "8px 20px", letterSpacing: 2 }, p.fed),
        ),
      ),
      // 히어로: 순위 + 변동
      h("div", { alignItems: "flex-end", marginTop: 28 },
        rankIsNumberFirst
          ? h("div", { alignItems: "baseline" }, big(rankA), small(rankB, "right"))
          : h("div", { alignItems: "baseline" }, small(p.rank == null ? "" : rankA, "left"), big(p.rank == null ? rankA : rankB)),
        h("div", { flexDirection: "column", marginLeft: 40, marginBottom: 18 },
          deltaText ? h("div", { fontSize: 34, fontWeight: 700, color: deltaColor }, deltaText) : "",
          p.weeksNo1 ? h("div", { fontSize: 28, fontWeight: 500, color: GOLD, marginTop: 10 }, T.no1(p.weeksNo1)) : "",
          p.heroLabel ? h("div", { fontSize: 28, fontWeight: 500, color: MUTED, marginTop: 10 }, p.heroLabel) : "",
        ),
      ),
      // 이름
      h("div", { flexDirection: "column", marginTop: 22 },
        h("div", { fontSize: nameSize, fontWeight: 800, letterSpacing: -2, lineHeight: 1.1 }, p.nameMain),
        p.nameSub ? h("div", { fontSize: 38, fontWeight: 500, color: MUTED, marginTop: 8, letterSpacing: 1 }, p.nameSub) : "",
      ),
      // 타일
      h("div", { marginTop: 30, gap: 20 }, ...p.tiles.slice(0, 3).map(tile)),
      // 추이(또는 대체 타일 줄)
      h("div", { flexDirection: "column", marginTop: 28, flex: 1, justifyContent: "flex-end" },
        h("div", { justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
          h("div", { fontSize: 26, fontWeight: 700, color: MUTED }, tr.d ? (p.trend?.label ?? "") : ""),
          h("div", { fontSize: 24, fontWeight: 500, color: MUTED }, p.editionLabel),
        ),
        extra
          ? h("div", { gap: 20 }, ...extra.map(tile))
          : tr.d
          ? { type: "svg", props: { width: TW, height: TH, viewBox: `0 0 ${TW} ${TH}`, children: [
              { type: "path", props: { d: tr.area, fill: "rgba(232,196,106,0.14)" } },
              { type: "path", props: { d: tr.d, fill: "none", stroke: GOLD, strokeWidth: 6, strokeLinecap: "round", strokeLinejoin: "round" } },
              { type: "circle", props: { cx: tr.last.x, cy: tr.last.y, r: 12, fill: GOLD, stroke: FELT_DEEP, strokeWidth: 5 } },
            ] } }
          : h("div", { height: TH }),
      ),
      // 푸터
      h("div", { justifyContent: "space-between", marginTop: 22, paddingTop: 20, borderTop: `2px solid ${LINE}` },
        h("div", { fontSize: 24, fontWeight: 500, color: MUTED }, p.source),
        h("div", { fontSize: 24, fontWeight: 700, color: MUTED, letterSpacing: 1 }, "www.rankue.co.kr"),
      ),
    ),
  );
}

export async function renderPlayerCardPng(p: PlayerCardInput): Promise<Buffer> {
  const { satori, Resvg } = await engines();
  const svg = await satori(playerCardTree(p) as any, { width: CARD_SIZE, height: CARD_SIZE, fonts: fonts() });
  return new Resvg(svg, { fitTo: { mode: "width", value: CARD_SIZE } }).render().asPng();
}

/**
 * 카드 주소 정본 — 프리렌더·클라이언트(client/src/lib/playerCard.ts)가 같은 규칙을 쓴다. ko 는 파라미터 없음.
 *   UMB  /og/player/:category/:umbId.png   (ko·en·tr·vi·es)
 *   골프 /og/golfer/:tour/:id.png          (ko·en)
 *   PBA  /og/pba-player/:memCode.png       (ko·en·vi·tr·es)
 */
const withLang = (url: string, lang: string) => (lang === "ko" ? url : `${url}?lang=${lang}`);
export const playerCardUrl = (origin: string, category: string, umbId: string, lang = "ko") =>
  withLang(`${origin}/og/player/${category}/${encodeURIComponent(umbId)}.png`, lang);
export const golferCardUrl = (origin: string, tour: string, id: string, lang = "ko") =>
  withLang(`${origin}/og/golfer/${tour}/${encodeURIComponent(id)}.png`, lang === "en" ? "en" : "ko");
export const pbaCardUrl = (origin: string, memCode: string, lang = "ko") =>
  withLang(`${origin}/og/pba-player/${encodeURIComponent(memCode)}.png`, lang);
