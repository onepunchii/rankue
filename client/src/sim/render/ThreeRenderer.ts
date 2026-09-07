/**
 * 2차 렌더러: three.js WebGL. Canvas2DRenderer 와 같은 Renderer 계약·같은 화면 배치(tableGeometry.computeLayout)를 쓴다.
 *
 * 구성
 *  - 카메라: 오소그래픽 탑다운. 절두체는 threeMath.orthoFrustum 이 letterbox 배치에서 계산해, 테이블 (x, y) 가
 *    Canvas2DRenderer 와 정확히 같은 CSS px 에 떨어진다 — 오버레이는 project() 만 쓰면 된다.
 *  - 정적 층: 라사(비네트·쿠션 그늘·미세 노이즈를 구운 캔버스 텍스처 평면), 레일(둥근 모서리 링을 압출한 나무 상자 +
 *    어두운 받침 테두리), 쿠션 코 라인(1 CSS px 어두운 띠), 다이아몬드 20개·센터 스팟(인스턴스 원판).
 *    테이블이 바뀌면 다시 만들고, px 단위가 섞인 것(코 라인·다이아몬드 반지름·강조 링)은 resize 때 다시 만든다.
 *  - 공: 구(MeshStandardMaterial roughness 0.25, metalness 0) + 접촉 그림자(방사형 알파 텍스처 사각형). 구는 물리의 z(r[2]) 에
 *    그대로 놓아 점프·마세이 홉(엔진 2.2 airborne)이 보이고, 그림자는 높이에 따라 램프 반대쪽으로 더 밀리고 커지며 옅어진다
 *    (공마다 그림자 재질을 복제해 알파를 따로 준다 — 복제는 새 id 가 나타나는 acquire 때뿐). 색은 토큰
 *    (--ball-*)을 구운 작은 캔버스 텍스처 — 흰·노란 공은 6점 무늬라 회전이 보인다. BallState 에 자세가 없으므로
 *    각속도 ω 를 draw() 마다 벽시계 dt 로 적분한 쿼터니언을 공 id 별로 유지하고, id 가 사라지면 초기화한다.
 *    (재생 4× 빨리감기 중에는 벽시계라 회전이 이동보다 느리게 보인다 — 계약에 시각이 없어 감수하는 시각 효과.)
 *  - 큐대: 테이퍼 원기둥 4토막(팁·페룰·샤프트·손잡이). 배치 규칙은 Canvas2DRenderer 와 같다(threeMath.cueGap).
 *  - 조명: 반구광 1 + 직사광 1(테이블 위 등, 화면 좌상단 쪽). 합산 조도 ≈ π 라 수평면은 알베도 그대로 보인다 —
 *    라사·나무 리터럴이 Canvas2DRenderer 와 같은 톤으로 나온다. 그림자 맵은 옵션(shadows) — 기본 꺼짐.
 *  - draw() 는 할당하지 않는다(Vector3·Quaternion·Matrix4 스크래치, 공 항목 풀). 그리기는 draw()/resize() 때만.
 *  - 컨텍스트 손실: three 가 preventDefault 하고 복구 때 GL 자원을 다시 올린다. 여기서는 횟수를 세어 onContextLost 를
 *    알리고(페이지가 CONTEXT_LOSS_LIMIT 회면 Canvas2D 로 교체), 복구 직후 마지막 프레임을 다시 그린다.
 *  - 레터박스(캔버스 밖)는 alpha:false 라 투명일 수 없어 마운트 배경색(surface-3 를 surface-1 위에 합성)으로 지운다.
 */
import {
    BufferGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DirectionalLight, ExtrudeGeometry,
    Float32BufferAttribute, Group, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
    MeshStandardMaterial, OrthographicCamera, Path, PCFSoftShadowMap, PlaneGeometry, Quaternion, RingGeometry,
    Scene, Shape, SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";
import type { BallState } from "@shared/sim/types";
import type { TableSpec } from "@shared/sim/params";
import type { RenderFrame, Renderer, SafeInsets, Viewport } from "./Renderer";
import { computeLayout, NO_INSETS, RAIL_WIDTH_M, screenToWorld, worldToScreen, type TableLayout } from "./tableGeometry";
import { DEFAULT_PALETTE, parseColor, readPalette, rgba, scaleColor, type Palette, type RGBA } from "./tokens";
import {
    CAMERA_FAR, CAMERA_NEAR, CAMERA_Z, CUE_BUTT_W, CUE_FERRULE_L, CUE_LENGTH, CUE_TIP_L, CUE_TIP_W, cueGap, cueRotationZ,
    diamondWorld, integrateOrientation, MAX_DT, orthoFrustum,
} from "./threeMath";

export interface ThreeRendererOptions {
    /** 세이프 에어리어 인셋. 함수면 resize 마다 다시 읽는다. 기본 0. */
    readonly insets?: SafeInsets | (() => SafeInsets);
    /** ¼·½·¾ 지점의 희미한 센터 스팟. 기본 true. */
    readonly centreSpots?: boolean;
    /** DPR 강제(테스트용). 기본 min(devicePixelRatio, 2) 를 resize 마다 다시 읽는다. */
    readonly dpr?: number;
    /** 그림자 맵(PCF 512², 고급 기기용). 기본 false — 접촉 그림자 스프라이트만. */
    readonly shadows?: boolean;
    /** WebGL 컨텍스트를 잃을 때마다. 페이지가 횟수를 세어 Canvas2D 로 내려간다. */
    readonly onContextLost?: () => void;
    readonly onContextRestored?: () => void;
    /** 텍스처를 그릴 2D 캔버스 팩토리(테스트·워커). 기본 document.createElement("canvas"). */
    readonly createCanvas?: () => HTMLCanvasElement;
    /** WebGL 캔버스 주입(테스트). 기본 createCanvas(). */
    readonly canvas?: HTMLCanvasElement;
    /** 시계(ms). 회전 적분의 dt 용. 기본 performance.now. */
    readonly now?: () => number;
}

/** 디버그·테스트용 스냅샷. */
export interface ThreeRendererStats {
    readonly balls: number;
    readonly pooled: number;
    readonly losses: number;
    readonly lost: boolean;
    readonly cueVisible: boolean;
    readonly ringVisible: boolean;
    readonly clothTextured: boolean;
}

// ── 팔레트(WebGL 내부 전용 — 물리적 사물) ──────────────────────────────
const FELT_CENTRE = "#1A7A48";
const FELT_EDGE = "#0B5D3B";
const FELT_VIGNETTE = "rgba(0, 0, 0, 0.38)";
const RAIL_WOOD = 0x5a3a22;
const RAIL_WOOD_EDGE = 0x3e2716;
const RAIL_NOSE_ALPHA = 0.45;
const DIAMOND: RGBA = [240, 233, 214, 1];
const SPOT_ALPHA = 0.14;
const CUE_SHAFT = 0xc9955a;
const CUE_BUTT = 0x4e2e19;
const CUE_FERRULE = 0xede6d6;
const CUE_TIP = 0x2f4a66;
const SHADOW_ALPHA = 0.30;
/** 마운트 배경을 못 읽을 때의 surface-3 기본값(index.css). */
const DEFAULT_SURFACE3: RGBA = [0, 0, 0, 0.05];

type BallColour = "white" | "yellow" | "red";
const COLOURS: readonly BallColour[] = ["white", "yellow", "red"];
/** 강조 링의 바깥 후광 알파(surface-1 토큰에 곱한다). */
const RING_HALO_ALPHA = 0.75;

function ballColour(id: string): BallColour {
    if (id.startsWith("red")) return "red";
    if (id.startsWith("yellow")) return "yellow";
    return "white";
}

// ── 치수(m) ─────────────────────────────────────────────────────────────
/** 레일 상판 높이. 쿠션 코(37 mm)보다 살짝 높다. */
const RAIL_TOP = 0.045;
/** 받침 테두리가 레일 밖으로 보이는 폭. */
const PLINTH_M = 0.004;
const PLINTH_DEPTH = 0.01;
const NOSE_Z = 0.0003;
const SPOT_Z = 0.0002;
const SHADOW_Z = 0.0006;
const DIAMOND_Z = RAIL_TOP + 0.0005;
/** 접촉 그림자: Canvas2D 와 같은 오른쪽 아래 오프셋·타원 비율(R 배). */
const SHADOW_DX = 0.16;
const SHADOW_DY = 0.22;
const SHADOW_RX = 1.02;
const SHADOW_RY = 0.92;
/** 텍스처 가장자리가 흐려지므로 살짝 키운다. */
const SHADOW_GROW = 1.12;
/** 떠 있는 공의 그림자: 높이(R 단위, 상한 SHADOW_LIFT_MAX)에 비례해 크기 +18 %/R, 알파 1/(1 + 0.9·높이). 오프셋은 (R + h) 에 비례. */
const SHADOW_LIFT_MAX = 3;
const SHADOW_GROW_PER_R = 0.18;
const SHADOW_FADE_PER_R = 0.9;
/** 6점 무늬 각반지름(rad) ≈ 지름 10 mm. */
const DOT_ANGLE = 0.16;

// ── 조명 ────────────────────────────────────────────────────────────────
/** 수평면 조도 합 ≈ HEMI + SUN·cosθ ≈ π → 알베도 그대로. */
const HEMI_INTENSITY = 1.0;
const SUN_INTENSITY = 2.1;
/** 테이블 중심 기준 램프 위치(m). 화면 좌상단(−x, +y) 쪽에서 비춘다 — Canvas2D 의 좌상단 하이라이트와 같은 방향. */
const SUN_OFFSET: readonly [number, number, number] = [-0.35, 0.55, 2.4];

const CLOTH_TEX_W = 256;
const SHADOW_TEX = 64;
const BALL_TEX_W = 256;
const BALL_TEX_H = 128;

interface BallEntry {
    id: string;
    colour: BallColour;
    readonly mesh: Mesh;
    readonly shadow: Mesh;
    /** 공별 그림자 재질(공용 shadowMat 의 복제 — 텍스처는 공유). 높이에 따라 opacity 를 따로 준다. */
    readonly shadowMat: MeshBasicMaterial;
    stamp: number;
}

function defaultCreateCanvas(): HTMLCanvasElement {
    return document.createElement("canvas");
}

function defaultDpr(): number {
    const d = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
    return Math.min(d, 2);
}

function defaultNow(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** 둥근 모서리 사각형 경로(Shape/Path 공용). */
function roundedRectPath(p: Path, x: number, y: number, w: number, h: number, r: number): void {
    p.moveTo(x + r, y);
    p.lineTo(x + w - r, y);
    p.quadraticCurveTo(x + w, y, x + w, y + r);
    p.lineTo(x + w, y + h - r);
    p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    p.lineTo(x + r, y + h);
    p.quadraticCurveTo(x, y + h, x, y + h - r);
    p.lineTo(x, y + r);
    p.quadraticCurveTo(x, y, x + r, y);
}

/** 사각 띠(바깥 사각형 안쪽으로 t 만큼): 정점 8개·삼각형 8개. 쿠션 코 라인용. */
function frameGeometry(x0: number, y0: number, x1: number, y1: number, t: number): BufferGeometry {
    const ix0 = x0 + t, iy0 = y0 + t, ix1 = x1 - t, iy1 = y1 - t;
    const pos = [
        x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0,
        ix0, iy0, 0, ix1, iy0, 0, ix1, iy1, 0, ix0, iy1, 0,
    ];
    const idx = [
        0, 1, 5, 0, 5, 4,
        1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6,
        3, 0, 4, 3, 4, 7,
    ];
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
}

/** 텍스처용 2D 컨텍스트. 없으면 null(평면 색으로 대체). */
function context2d(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D | null {
    canvas.width = w;
    canvas.height = h;
    try {
        return canvas.getContext("2d");
    } catch {
        return null;
    }
}

function setTokenColor(c: Color, t: RGBA): void {
    c.setRGB(t[0] / 255, t[1] / 255, t[2] / 255, SRGBColorSpace);
}

/** 결정론 노이즈용 LCG. */
function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export class ThreeRenderer implements Renderer {
    private readonly opts: ThreeRendererOptions;
    private readonly createCanvas: () => HTMLCanvasElement;
    private readonly now: () => number;
    private dpr: number;

    private readonly gl: WebGLRenderer;
    private readonly canvas: HTMLCanvasElement;
    private readonly scene = new Scene();
    private readonly camera: OrthographicCamera;
    private readonly hemi: HemisphereLight;
    private readonly sun: DirectionalLight;

    private el: HTMLElement | null = null;
    private table: TableSpec | null = null;
    private layout: TableLayout | null = null;
    private observer: ResizeObserver | null = null;
    private lastFrame: RenderFrame | null = null;
    private cssW = 0;
    private cssH = 0;
    private palette: Palette = DEFAULT_PALETTE;
    private paletteKey = "";
    private disposed = false;
    private lost = false;
    private losses = 0;
    private lastDrawAt = -1;
    private stamp = 0;

    // 정적 층
    private readonly tableGroup = new Group();
    private readonly clothMat = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
    // 거칠기를 높게: 수직에 가까운 램프의 넓은 정반사가 상판을 뿌옇게 밝히지 않도록(실측: b 채널 +15). 나무 리터럴 톤 유지.
    private readonly railMat = new MeshStandardMaterial({ color: RAIL_WOOD, roughness: 0.9, metalness: 0 });
    private readonly plinthMat = new MeshStandardMaterial({ color: RAIL_WOOD_EDGE, roughness: 0.9, metalness: 0 });
    private readonly noseMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: RAIL_NOSE_ALPHA, depthWrite: false });
    private readonly diamondMat = new MeshBasicMaterial();
    private readonly spotMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: SPOT_ALPHA, depthWrite: false });
    private readonly discGeo = new CircleGeometry(1, 20);
    private cloth: Mesh | null = null;
    private clothTex: CanvasTexture | null = null;
    private rail: Mesh | null = null;
    private plinth: Mesh | null = null;
    private nose: Mesh | null = null;
    private readonly diamonds: InstancedMesh;
    private readonly spots: InstancedMesh;

    // 공
    private readonly ballGeo = new SphereGeometry(1, 32, 24);
    private readonly shadowGeo = new PlaneGeometry(1, 1);
    private readonly shadowMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false });
    private readonly ballMats: Record<BallColour, MeshStandardMaterial> = {
        white: new MeshStandardMaterial({ roughness: 0.25, metalness: 0 }),
        yellow: new MeshStandardMaterial({ roughness: 0.25, metalness: 0 }),
        red: new MeshStandardMaterial({ roughness: 0.25, metalness: 0 }),
    };
    private readonly ballTex: Record<BallColour, CanvasTexture | null> = { white: null, yellow: null, red: null };
    private readonly active: BallEntry[] = [];
    private readonly pool: BallEntry[] = [];

    // 큐대
    private readonly cueGroup = new Group();
    private readonly cueBody = new Group();
    private readonly cueGeos: BufferGeometry[] = [];
    private readonly cueMats: MeshStandardMaterial[] = [];

    // 강조 링
    private readonly ringGroup = new Group();
    private readonly ringHaloMat = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
    private readonly ringBrandMat = new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
    private ringHalo: Mesh | null = null;
    private ringBrand: Mesh | null = null;

    // 스크래치(draw 할당 금지)
    private readonly tmpAxis = new Vector3();
    private readonly tmpQ = new Quaternion();
    private readonly tmpM = new Matrix4();
    private readonly clearColor = new Color();

    constructor(opts: ThreeRendererOptions = {}) {
        this.opts = opts;
        this.createCanvas = opts.createCanvas ?? defaultCreateCanvas;
        this.now = opts.now ?? defaultNow;
        this.dpr = opts.dpr ?? defaultDpr();
        const canvas = opts.canvas ?? this.createCanvas();
        this.canvas = canvas;

        // WebGL2 를 못 열면 여기서 던진다 — 페이지가 잡아 Canvas2DRenderer 로 간다.
        this.gl = new WebGLRenderer({
            canvas, antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false,
        });
        this.gl.setPixelRatio(this.dpr);
        this.gl.outputColorSpace = SRGBColorSpace;
        if (opts.shadows) {
            this.gl.shadowMap.enabled = true;
            this.gl.shadowMap.type = PCFSoftShadowMap;
        }
        // three 의 리스너 뒤에 달아 복구 순서를 보장한다(three 가 GL 상태를 되살린 뒤 우리가 다시 그린다).
        canvas.addEventListener("webglcontextlost", this.onLost);
        canvas.addEventListener("webglcontextrestored", this.onRestored);

        this.camera = new OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);
        this.camera.position.set(0, 0, CAMERA_Z); // 기본 자세: −z 를 보고 +y 가 위

        this.hemi = new HemisphereLight(0xffffff, 0x2f3d33, HEMI_INTENSITY);
        this.sun = new DirectionalLight(0xffffff, SUN_INTENSITY);
        if (opts.shadows) {
            this.sun.castShadow = true;
            this.sun.shadow.mapSize.set(512, 512);
        }
        this.scene.add(this.hemi, this.sun, this.sun.target);

        setTokenColor(this.diamondMat.color, DIAMOND);
        this.diamonds = new InstancedMesh(this.discGeo, this.diamondMat, 20);
        this.diamonds.frustumCulled = false;
        this.spots = new InstancedMesh(this.discGeo, this.spotMat, 3);
        this.spots.frustumCulled = false;
        this.spots.visible = opts.centreSpots !== false;
        this.tableGroup.add(this.diamonds, this.spots);
        this.scene.add(this.tableGroup, this.cueGroup, this.ringGroup);

        this.buildShadowTexture();
        this.buildCue();
        this.cueGroup.visible = false;
        this.ringGroup.visible = false;
    }

    // ── 생명주기 ─────────────────────────────────────────────────────────
    mount(el: HTMLElement, table: TableSpec): void {
        if (this.disposed) throw new Error("ThreeRenderer: 이미 dispose 됐다 — 새 인스턴스를 만들 것");
        if (this.el) this.unmount();
        this.el = el;
        this.table = table;

        const canvas = this.canvas;
        // Canvas2DRenderer·Overlay 와 같은 좌표계(패딩 박스)에 absolute 로 얹는다.
        canvas.style.display = "block";
        canvas.style.position = "absolute";
        canvas.style.inset = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.touchAction = "none";
        if (typeof getComputedStyle === "function") {
            try {
                if (getComputedStyle(el).position === "static") el.style.position = "relative";
            } catch { /* 계산 불가 환경(가짜 요소) — 무시 */ }
        }
        el.appendChild(canvas);

        this.buildTable(table);
        if (typeof ResizeObserver !== "undefined") {
            this.observer = new ResizeObserver(() => this.resize());
            this.observer.observe(el);
        }
        this.resize();
        // 셰이더를 첫 draw 전에 미리 컴파일(첫 프레임 끊김 방지)
        try { this.gl.compile(this.scene, this.camera); } catch { /* 컨텍스트 없음 — draw 때 다시 */ }
    }

    setTable(table: TableSpec): void {
        this.table = table;
        if (this.disposed) return;
        this.buildTable(table);
        // 공 크기가 바뀌었을 수 있으니 풀·활성 항목의 스케일을 새로 잡는다
        for (let i = 0; i < this.active.length; i++) this.fitBall(this.active[i], table.ball.R);
        if (this.el) this.resize();
    }

    resize(): void {
        if (this.disposed || !this.el || !this.table) return;
        const w = Math.max(0, this.el.clientWidth);
        const h = Math.max(0, this.el.clientHeight);
        this.cssW = w;
        this.cssH = h;
        const insets = this.readInsets();
        const L = computeLayout({ width: w, height: h }, this.table, insets);
        this.layout = L;
        if (this.opts.dpr === undefined) this.dpr = defaultDpr();
        this.palette = readPalette(this.el.ownerDocument);
        this.applyPalette(this.palette);
        this.applyClearColor(this.el);

        this.gl.setPixelRatio(this.dpr);
        this.gl.setSize(Math.max(1, w), Math.max(1, h), false);

        const f = orthoFrustum(L);
        const cam = this.camera;
        cam.left = f.left;
        cam.right = f.right;
        cam.top = f.top;
        cam.bottom = f.bottom;
        cam.updateProjectionMatrix();

        this.rebuildPxDependent(L);
        if (this.lastFrame) this.draw(this.lastFrame);
        else this.render();
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.unmount();
        this.canvas.removeEventListener("webglcontextlost", this.onLost);
        this.canvas.removeEventListener("webglcontextrestored", this.onRestored);

        this.disposeTable();
        this.disposeRings();
        this.discGeo.dispose();
        this.ballGeo.dispose();
        this.shadowGeo.dispose();
        this.shadowMat.map?.dispose();
        this.shadowMat.dispose();
        for (const c of COLOURS) {
            this.ballTex[c]?.dispose();
            this.ballMats[c].dispose();
        }
        for (const e of this.active) e.shadowMat.dispose();
        for (const e of this.pool) e.shadowMat.dispose();
        for (const g of this.cueGeos) g.dispose();
        for (const m of this.cueMats) m.dispose();
        this.clothMat.dispose();
        this.railMat.dispose();
        this.plinthMat.dispose();
        this.noseMat.dispose();
        this.diamondMat.dispose();
        this.spotMat.dispose();
        this.ringHaloMat.dispose();
        this.ringBrandMat.dispose();
        this.active.length = 0;
        this.pool.length = 0;

        this.gl.dispose();
        // 컨텍스트를 바로 반납해 모바일 WebView 의 WebGL 컨텍스트 상한을 아낀다
        try { this.gl.forceContextLoss(); } catch { /* 이미 잃었거나 확장 없음 */ }
    }

    private unmount(): void {
        this.observer?.disconnect();
        this.observer = null;
        if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
        this.el = null;
        this.layout = null;
        this.lastFrame = null;
        this.lastDrawAt = -1;
    }

    // ── 좌표 ─────────────────────────────────────────────────────────────
    project(x: number, y: number): [number, number] {
        if (!this.layout) return [0, 0];
        return worldToScreen(this.layout, x, y);
    }

    unproject(px: number, py: number): [number, number] {
        if (!this.layout) return [0, 0];
        return screenToWorld(this.layout, px, py);
    }

    viewport(): Viewport | null {
        if (!this.layout) return null;
        return { width: this.cssW, height: this.cssH, dpr: this.dpr, insets: this.layout.insets, scale: this.layout.scale };
    }

    /** 오버레이 등이 같은 배치를 쓰도록 노출. */
    getLayout(): TableLayout | null {
        return this.layout;
    }

    /** 디버그·테스트용. */
    stats(): ThreeRendererStats {
        return {
            balls: this.active.length,
            pooled: this.pool.length,
            losses: this.losses,
            lost: this.lost,
            cueVisible: this.cueGroup.visible,
            ringVisible: this.ringGroup.visible,
            clothTextured: this.clothTex !== null,
        };
    }

    /** 공의 누적 자세를 out 에 복사. 그 id 가 없으면 false. */
    getOrientation(id: string, out: Quaternion): boolean {
        for (let i = 0; i < this.active.length; i++) {
            if (this.active[i].id === id) {
                out.copy(this.active[i].mesh.quaternion);
                return true;
            }
        }
        return false;
    }

    /** preserveDrawingBuffer 가 꺼져 있으므로 같은 틱 안에서 그린 직후 toBlob. */
    screenshot(): Promise<Blob | null> {
        const c = this.canvas;
        if (this.disposed || this.lost || !this.layout || typeof c.toBlob !== "function") return Promise.resolve(null);
        return new Promise((resolve) => {
            try {
                this.render();
                c.toBlob((b) => resolve(b), "image/png");
            } catch {
                resolve(null);
            }
        });
    }

    // ── 동적 층 ───────────────────────────────────────────────────────────
    draw(frame: RenderFrame): void {
        this.lastFrame = frame;
        if (this.disposed || !this.layout || !this.table) return;
        const now = this.now();
        const dt = this.lastDrawAt < 0 ? 0 : Math.min(MAX_DT, Math.max(0, (now - this.lastDrawAt) / 1000));
        this.lastDrawAt = now;
        const R = this.table.ball.R;
        const balls = frame.balls;

        // 공: (1) 있는 항목 갱신·도장 → (2) 안 찍힌 항목 풀로(자세 초기화) → (3) 새 id 는 풀에서.
        // 반납을 먼저 해야 4구 ↔ 3구 처럼 id 가 갈리는 프레임에서 새 메시를 만들지 않는다.
        const stamp = ++this.stamp;
        for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            const e = this.findEntry(b.id);
            if (e) this.placeBall(e, b, R, dt, stamp);
        }
        for (let i = this.active.length - 1; i >= 0; i--) {
            if (this.active[i].stamp !== stamp) this.release(i);
        }
        for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            if (!this.findEntry(b.id)) this.placeBall(this.acquire(b.id, R), b, R, 0, stamp);
        }

        // 큐대(공 뒤, −phi)
        const cue = frame.cue;
        if (cue && cue.visible && balls.length > 0) {
            const cueId = cue.ballId ?? frame.highlightBallId;
            let cb = balls[0];
            if (cueId !== undefined) {
                for (let i = 0; i < balls.length; i++) {
                    if (balls[i].id === cueId) { cb = balls[i]; break; }
                }
            }
            this.cueGroup.visible = true;
            this.cueGroup.position.set(cb.r[0], cb.r[1], R);
            this.cueGroup.rotation.z = cueRotationZ(cue.phi);
            this.cueBody.position.y = cueGap(R, cue.pullback);
        } else {
            this.cueGroup.visible = false;
        }

        // 강조 링
        let ring: BallState | null = null;
        if (frame.highlightBallId !== undefined) {
            for (let i = 0; i < balls.length; i++) {
                if (balls[i].id === frame.highlightBallId) { ring = balls[i]; break; }
            }
        }
        if (ring) {
            this.ringGroup.visible = true;
            this.ringGroup.position.set(ring.r[0], ring.r[1], 2 * R + 0.001);
        } else {
            this.ringGroup.visible = false;
        }

        this.render();
    }

    private render(): void {
        if (this.disposed || this.lost || !this.layout) return;
        this.gl.render(this.scene, this.camera);
    }

    private findEntry(id: string): BallEntry | null {
        const active = this.active;
        for (let i = 0; i < active.length; i++) {
            if (active[i].id === id) return active[i];
        }
        return null;
    }

    private placeBall(e: BallEntry, b: BallState, R: number, dt: number, stamp: number): void {
        e.stamp = stamp;
        // 구는 물리의 z 그대로(천 위 R, 공중이면 그 이상)
        e.mesh.position.set(b.r[0], b.r[1], b.r[2]);
        integrateOrientation(e.mesh.quaternion, b.w, dt, this.tmpAxis, this.tmpQ);
        // 접촉 그림자: 램프가 좌상단 위에 있으므로 떠오른 공의 그림자는 오른쪽 아래로 (R + h) 에 비례해 밀리고, 커지며 옅어진다
        const h = b.r[2] - R > 0 ? b.r[2] - R : 0;
        const lift = h / R < SHADOW_LIFT_MAX ? h / R : SHADOW_LIFT_MAX;
        e.shadow.position.set(b.r[0] + (R + h) * SHADOW_DX, b.r[1] - (R + h) * SHADOW_DY, SHADOW_Z);
        const grow = 1 + SHADOW_GROW_PER_R * lift;
        e.shadow.scale.set(2 * R * SHADOW_RX * SHADOW_GROW * grow, 2 * R * SHADOW_RY * SHADOW_GROW * grow, 1);
        e.shadowMat.opacity = this.shadowMat.opacity / (1 + SHADOW_FADE_PER_R * lift);
    }

    /** 풀에서 꺼내거나(없으면 생성 — 새 id 가 나타날 때만) 색·크기를 맞춰 활성화. */
    private acquire(id: string, R: number): BallEntry {
        let e = this.pool.pop();
        if (!e) {
            const mesh = new Mesh(this.ballGeo, this.ballMats.white);
            mesh.frustumCulled = false;
            if (this.opts.shadows) mesh.castShadow = true;
            const shadowMat = this.shadowMat.clone();
            const shadow = new Mesh(this.shadowGeo, shadowMat);
            shadow.frustumCulled = false;
            this.scene.add(mesh, shadow);
            e = { id, colour: "white", mesh, shadow, shadowMat, stamp: 0 };
        }
        e.id = id;
        const colour = ballColour(id);
        if (e.colour !== colour || e.mesh.material !== this.ballMats[colour]) {
            e.colour = colour;
            e.mesh.material = this.ballMats[colour];
        }
        this.fitBall(e, R);
        e.mesh.quaternion.identity();
        e.mesh.visible = true;
        e.shadow.visible = true;
        this.active.push(e);
        return e;
    }

    private fitBall(e: BallEntry, R: number): void {
        e.mesh.scale.setScalar(R);
        e.shadow.scale.set(2 * R * SHADOW_RX * SHADOW_GROW, 2 * R * SHADOW_RY * SHADOW_GROW, 1);
    }

    /** 활성 i 번째를 풀로(스왑 제거 — splice 는 배열을 할당한다). */
    private release(i: number): void {
        const active = this.active;
        const e = active[i];
        const last = active.length - 1;
        active[i] = active[last];
        active.pop();
        e.mesh.visible = false;
        e.shadow.visible = false;
        e.mesh.quaternion.identity();
        this.pool.push(e);
    }

    // ── 컨텍스트 손실 ─────────────────────────────────────────────────────
    private readonly onLost = (e: Event): void => {
        e.preventDefault();
        this.lost = true;
        this.losses += 1;
        this.opts.onContextLost?.();
    };

    private readonly onRestored = (): void => {
        // three 의 onContextRestore 가 먼저 돌아 GL 상태·프로그램·텍스처를 다시 올린다(리스너 등록 순서).
        this.lost = false;
        this.opts.onContextRestored?.();
        if (this.disposed) return;
        if (this.lastFrame) this.draw(this.lastFrame);
        else this.render();
    };

    // ── 정적 층 ───────────────────────────────────────────────────────────
    private buildTable(table: TableSpec): void {
        this.disposeTable();
        const w = table.width, l = table.length;
        const cx = w / 2, cy = l / 2;

        // 라사: 비네트·쿠션 그늘·노이즈를 구운 텍스처 평면. 2D 컨텍스트가 없으면 평면 색.
        const clothGeo = new PlaneGeometry(w, l);
        const texCanvas = this.createCanvas();
        const th = Math.max(1, Math.round((CLOTH_TEX_W * l) / w));
        const ctx = context2d(texCanvas, CLOTH_TEX_W, th);
        if (ctx) {
            paintCloth(ctx, CLOTH_TEX_W, th, table);
            const tex = new CanvasTexture(texCanvas);
            tex.colorSpace = SRGBColorSpace;
            this.clothTex = tex;
            this.clothMat.map = tex;
            this.clothMat.color.set(0xffffff);
        } else {
            this.clothMat.map = null;
            this.clothMat.color.set(FELT_EDGE);
        }
        this.clothMat.needsUpdate = true;
        const cloth = new Mesh(clothGeo, this.clothMat);
        cloth.position.set(cx, cy, 0);
        cloth.frustumCulled = false;
        if (this.opts.shadows) cloth.receiveShadow = true;
        this.cloth = cloth;

        // 레일: 둥근 모서리 링을 압출한 나무 상자 + 받침(4 mm 어두운 테두리, 라사 아래)
        const r = RAIL_WIDTH_M * 0.55;
        const railShape = new Shape();
        roundedRectPath(railShape, -RAIL_WIDTH_M, -RAIL_WIDTH_M, w + 2 * RAIL_WIDTH_M, l + 2 * RAIL_WIDTH_M, r);
        const hole = new Path();
        hole.moveTo(0, 0);
        hole.lineTo(w, 0);
        hole.lineTo(w, l);
        hole.lineTo(0, l);
        hole.lineTo(0, 0);
        railShape.holes.push(hole);
        const rail = new Mesh(new ExtrudeGeometry(railShape, { depth: RAIL_TOP, bevelEnabled: false, curveSegments: 6 }), this.railMat);
        rail.frustumCulled = false;
        if (this.opts.shadows) rail.receiveShadow = true;
        this.rail = rail;

        const plinthShape = new Shape();
        const po = RAIL_WIDTH_M + PLINTH_M;
        roundedRectPath(plinthShape, -po, -po, w + 2 * po, l + 2 * po, r + PLINTH_M);
        const plinth = new Mesh(new ExtrudeGeometry(plinthShape, { depth: PLINTH_DEPTH, bevelEnabled: false, curveSegments: 6 }), this.plinthMat);
        plinth.position.z = -PLINTH_DEPTH - 0.002; // 상판이 라사(z=0) 바로 아래 — 코플레인 깜빡임 방지
        plinth.frustumCulled = false;
        this.plinth = plinth;

        this.tableGroup.add(plinth, rail, cloth);

        // 램프: 테이블 중심 기준
        this.sun.position.set(cx + SUN_OFFSET[0], cy + SUN_OFFSET[1], SUN_OFFSET[2]);
        this.sun.target.position.set(cx, cy, 0);
        this.sun.target.updateMatrixWorld();
        if (this.opts.shadows) {
            const sc = this.sun.shadow.camera;
            const half = Math.max(w, l) / 2 + RAIL_WIDTH_M * 2;
            sc.left = -half;
            sc.right = half;
            sc.top = half;
            sc.bottom = -half;
            sc.near = 0.5;
            sc.far = 6;
            sc.updateProjectionMatrix();
        }
    }

    private disposeTable(): void {
        if (this.cloth) {
            this.tableGroup.remove(this.cloth);
            this.cloth.geometry.dispose();
            this.cloth = null;
        }
        if (this.clothTex) {
            this.clothTex.dispose();
            this.clothTex = null;
            this.clothMat.map = null;
        }
        if (this.rail) {
            this.tableGroup.remove(this.rail);
            this.rail.geometry.dispose();
            this.rail = null;
        }
        if (this.plinth) {
            this.tableGroup.remove(this.plinth);
            this.plinth.geometry.dispose();
            this.plinth = null;
        }
        if (this.nose) {
            this.tableGroup.remove(this.nose);
            this.nose.geometry.dispose();
            this.nose = null;
        }
    }

    /** px 단위가 섞인 것들: 코 라인(1 CSS px), 다이아몬드·스팟 반지름(px 하한), 강조 링(px 폭). resize 마다. */
    private rebuildPxDependent(L: TableLayout): void {
        const table = L.table;
        const s = L.scale;
        const w = table.width, l = table.length;

        if (this.nose) {
            this.tableGroup.remove(this.nose);
            this.nose.geometry.dispose();
        }
        const nose = new Mesh(frameGeometry(0, 0, w, l, 1 / s), this.noseMat);
        nose.position.z = NOSE_Z;
        nose.frustumCulled = false;
        this.nose = nose;
        this.tableGroup.add(nose);

        const dR = Math.max(1.5 / s, RAIL_WIDTH_M * 0.16);
        const marks = diamondWorld(table);
        for (let i = 0; i < marks.length && i < 20; i++) {
            this.tmpM.makeScale(dR, dR, 1).setPosition(marks[i].x, marks[i].y, DIAMOND_Z);
            this.diamonds.setMatrixAt(i, this.tmpM);
        }
        this.diamonds.instanceMatrix.needsUpdate = true;

        const spotR = Math.max(1.5 / s, table.ball.R * 0.22);
        for (let i = 1; i <= 3; i++) {
            this.tmpM.makeScale(spotR, spotR, 1).setPosition(w / 2, (l * i) / 4, SPOT_Z);
            this.spots.setMatrixAt(i - 1, this.tmpM);
        }
        this.spots.instanceMatrix.needsUpdate = true;

        // 강조 링: Canvas2D 와 같은 px 치수(반지름 R·s + 2.5, 후광 3.5 px, 브랜드 1.5 px)
        this.disposeRings();
        const rr = table.ball.R * s + 2.5;
        const halo = new Mesh(new RingGeometry((rr - 1.75) / s, (rr + 1.75) / s, 48), this.ringHaloMat);
        const brand = new Mesh(new RingGeometry((rr - 0.75) / s, (rr + 0.75) / s, 48), this.ringBrandMat);
        halo.renderOrder = 10;
        brand.renderOrder = 11;
        halo.frustumCulled = false;
        brand.frustumCulled = false;
        this.ringHalo = halo;
        this.ringBrand = brand;
        this.ringGroup.add(halo, brand);
    }

    private disposeRings(): void {
        if (this.ringHalo) {
            this.ringGroup.remove(this.ringHalo);
            this.ringHalo.geometry.dispose();
            this.ringHalo = null;
        }
        if (this.ringBrand) {
            this.ringGroup.remove(this.ringBrand);
            this.ringBrand.geometry.dispose();
            this.ringBrand = null;
        }
    }

    /** 토큰 팔레트가 바뀌었을 때만 공 텍스처·링 색을 다시 만든다. */
    private applyPalette(p: Palette): void {
        const key = [p.ballWhite, p.ballYellow, p.ballRed, p.brand, p.surface1].map((c) => rgba(c)).join("|");
        if (key === this.paletteKey) return;
        this.paletteKey = key;

        setTokenColor(this.ringBrandMat.color, p.brand);
        this.ringBrandMat.opacity = p.brand[3];
        setTokenColor(this.ringHaloMat.color, p.surface1);
        this.ringHaloMat.opacity = Math.max(0, Math.min(1, p.surface1[3] * RING_HALO_ALPHA));

        const dot = scaleColor(p.ballRed, 0.9);
        const bases: Record<BallColour, RGBA> = { white: p.ballWhite, yellow: p.ballYellow, red: p.ballRed };
        for (const c of COLOURS) {
            const mat = this.ballMats[c];
            const canvas = this.createCanvas();
            const ctx = context2d(canvas, BALL_TEX_W, BALL_TEX_H);
            this.ballTex[c]?.dispose();
            this.ballTex[c] = null;
            if (ctx) {
                paintBallMap(ctx, BALL_TEX_W, BALL_TEX_H, bases[c], c === "red" ? null : dot);
                const tex = new CanvasTexture(canvas);
                tex.colorSpace = SRGBColorSpace;
                this.ballTex[c] = tex;
                mat.map = tex;
                mat.color.set(0xffffff);
            } else {
                mat.map = null;
                setTokenColor(mat.color, bases[c]);
            }
            mat.needsUpdate = true;
        }
    }

    /** 마운트 배경(보통 surface-3 = 반투명 검정)을 surface-1 위에 합성한 불투명 색으로 지운다. */
    private applyClearColor(el: HTMLElement): void {
        let bg: RGBA | null = null;
        if (typeof getComputedStyle === "function") {
            try { bg = parseColor(getComputedStyle(el).backgroundColor); } catch { bg = null; }
        }
        const over = bg ?? DEFAULT_SURFACE3;
        const base = this.palette.surface1;
        const a = Math.max(0, Math.min(1, over[3]));
        const r = over[0] * a + base[0] * (1 - a);
        const g = over[1] * a + base[1] * (1 - a);
        const b = over[2] * a + base[2] * (1 - a);
        this.clearColor.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
        this.gl.setClearColor(this.clearColor, 1);
    }

    private buildShadowTexture(): void {
        const canvas = this.createCanvas();
        const ctx = context2d(canvas, SHADOW_TEX, SHADOW_TEX);
        if (!ctx) {
            this.shadowMat.opacity = SHADOW_ALPHA;
            return;
        }
        const c = SHADOW_TEX / 2;
        const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
        grad.addColorStop(0, `rgba(0,0,0,${SHADOW_ALPHA + 0.04})`);
        grad.addColorStop(0.55, `rgba(0,0,0,${SHADOW_ALPHA})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.clearRect(0, 0, SHADOW_TEX, SHADOW_TEX);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, SHADOW_TEX, SHADOW_TEX);
        const tex = new CanvasTexture(canvas);
        tex.colorSpace = SRGBColorSpace;
        this.shadowMat.map = tex;
        this.shadowMat.needsUpdate = true;
    }

    /** 큐대 4토막. 그룹 로컬 +y 가 큐대 방향, cueBody 의 y 가 팁 간격(draw 마다 갱신). */
    private buildCue(): void {
        const tipR = CUE_TIP_W / 2;
        const buttR = CUE_BUTT_W / 2;
        const midR = tipR + (buttR - tipR) * 0.55;
        const shaftL = CUE_LENGTH * 0.55 - CUE_FERRULE_L;
        const buttL = CUE_LENGTH * 0.45;
        const part = (top: number, bottom: number, len: number, y: number, colour: number): void => {
            const g = new CylinderGeometry(top, bottom, len, 14, 1);
            const m = new MeshStandardMaterial({ color: colour, roughness: 0.5, metalness: 0 });
            const mesh = new Mesh(g, m);
            mesh.position.y = y;
            mesh.frustumCulled = false;
            this.cueGeos.push(g);
            this.cueMats.push(m);
            this.cueBody.add(mesh);
        };
        // CylinderGeometry: radiusTop 이 +y 끝. 팁 → 페룰 → 샤프트 → 손잡이 순으로 +y 로 이어진다.
        part(tipR, tipR, CUE_TIP_L, -CUE_TIP_L / 2, CUE_TIP);
        part(tipR, tipR, CUE_FERRULE_L, CUE_FERRULE_L / 2, CUE_FERRULE);
        part(midR, tipR, shaftL, CUE_FERRULE_L + shaftL / 2, CUE_SHAFT);
        part(buttR, midR, buttL, CUE_LENGTH * 0.55 + buttL / 2, CUE_BUTT);
        this.cueGroup.add(this.cueBody);
    }

    private readInsets(): SafeInsets {
        const ins = this.opts.insets;
        if (!ins) return NO_INSETS;
        return typeof ins === "function" ? ins() : ins;
    }
}

// ── 텍스처 페인터(순수 캔버스 그리기) ─────────────────────────────────────

/** 라사: 가운데가 살짝 밝은 비네트 + 레일 안쪽 그늘 띠 + 결정론 노이즈. Canvas2DRenderer 의 정적 층과 같은 톤. */
export function paintCloth(ctx: CanvasRenderingContext2D, w: number, h: number, table: TableSpec): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = FELT_EDGE;
    ctx.fillRect(0, 0, w, h);
    const felt = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    felt.addColorStop(0, FELT_CENTRE);
    felt.addColorStop(0.7, FELT_EDGE);
    felt.addColorStop(1, FELT_EDGE);
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, w, h);

    // 쿠션 그늘: 레일 폭의 35% 만큼 안쪽으로(Canvas2D 의 railPx·0.35)
    const inner = Math.max(2, ((RAIL_WIDTH_M * 0.35) / table.width) * w);
    const band = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number): void => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, FELT_VIGNETTE);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
    };
    band(0, 0, 0, inner, 0, 0, w, inner);
    band(0, h, 0, h - inner, 0, h - inner, w, inner);
    band(0, 0, inner, 0, 0, 0, inner, h);
    band(w, 0, w - inner, 0, w - inner, 0, inner, h);

    // 미세 노이즈(천 결). ImageData 를 못 쓰는 환경이면 건너뛴다.
    try {
        const img = ctx.getImageData(0, 0, w, h);
        const d = img?.data;
        if (d) {
            const rnd = lcg(0x5eed);
            for (let i = 0; i < d.length; i += 4) {
                const n = (rnd() - 0.5) * 14;
                d[i] = Math.max(0, Math.min(255, d[i] + n));
                d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
                d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
            }
            ctx.putImageData(img, 0, 0);
        }
    } catch { /* 노이즈 없이 진행 */ }
}

/**
 * 공 등거리 원통(equirect) 텍스처: 바탕색 + (dot 이 있으면) 6점 무늬. 적도 4점은 u = 0·¼·½·¾, 극점 2개는 위·아래 띠.
 * SphereGeometry 의 극축은 로컬 y — 초기 자세(항등)에서 극점 두 개가 테이블 ±y 쪽, 적도 한 점이 위(+z)를 본다.
 */
export function paintBallMap(ctx: CanvasRenderingContext2D, w: number, h: number, base: RGBA, dot: RGBA | null): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgba(base);
    ctx.fillRect(0, 0, w, h);
    if (!dot) return;
    ctx.fillStyle = rgba(dot);
    const ru = (DOT_ANGLE / (2 * Math.PI)) * w;
    const rv = (DOT_ANGLE / Math.PI) * h;
    for (let k = 0; k <= 4; k++) {
        ctx.beginPath();
        ctx.ellipse((w * k) / 4, h / 2, ru, rv, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillRect(0, 0, w, rv);
    ctx.fillRect(0, h - rv, w, rv);
}
