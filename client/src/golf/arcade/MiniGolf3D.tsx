/**
 * 미니골프 3D 보드(2026-09-16 오너: "미니골프 먼저"). three.js — 물리는 한 줄도 안 바꾼다.
 *
 * 지형은 홀 데이터(W36×H60 다각형)에서 그때그때 만든다 — Kenney 키트는 격자 타일이라 우리 임의 다각형과 안 맞기 때문.
 *   · 그린   : 페어웨이 다각형을 두께 1.2 로 압출, 윗면에 깎은 줄무늬 텍스처
 *   · 벽     : 다각형 변마다 나무 레일 상자(모서리에 기둥) — 물리의 반사 선분과 같은 자리
 *   · 블록   : 안쪽 다각형도 같은 방식(러프색 + 레일)
 *   · 범퍼   : 원기둥
 *   · 컵     : 파인 원기둥 + Kenney 깃대(GLB)
 * 소품(깃대·풍차·성·게이트·나무·바위)만 CC0 Kenney GLB. `client/public/golf/models/CREDITS.txt`.
 *
 * 입력은 2D 보드와 같다: 화면 아무 데나 누르고 끌면 그만큼이 당김 벡터. 화면 좌표 → 코스 좌표는 지면(y=0)에 레이캐스트.
 * 카메라는 티가 아래, 컵이 위에 오도록 기울인 원근(탑다운 55°) — 코스 전체가 한 화면에 들어온다.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BALL_R, COURSE_H, COURSE_W, CUP_R, polygonSegments, type Hole, type Vec } from "@shared/golf/course";
import { MAX_DRAG, powerRatio, predictPath, type BallState } from "@shared/golf/physics";
import type { Phase } from "./useMiniGolf";

interface Props {
    hole: Hole;
    ballRef: { current: BallState };
    phase: Phase;
    tickCount: number;
    onShoot: (dragX: number, dragY: number) => boolean;
    onFrame: (elapsedSec: number) => void;
}

const MODELS = "/golf/models";
const WALL_H = 1.5, WALL_T = 0.7, GREEN_H = 1.2;
const COL = {
    rough: 0x3f8f3c, greenTop: 0x62c24d, greenSide: 0x3f8a36, sky: 0x8ecae6,
    wood: 0xc9a15e, woodDark: 0x8a6a34, bumper: 0xf0b43c, cup: 0x10180f, lime: 0x64dd17, limeCss: "#64DD17",
};

/** 깎은 줄무늬 — 그린 윗면 텍스처 */
function stripeTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = 4; c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#62c24d"; g.fillRect(0, 0, 4, 64);
    g.fillStyle = "#57b444"; g.fillRect(0, 0, 4, 32);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 6, 1 / 6);   // 6 단위마다 한 줄
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/** 다각형(코스 좌표) → three Shape. 코스 y 가 화면 안쪽(+z) 이므로 x→x, y→z */
function shapeOf(pts: readonly Vec[]): THREE.Shape {
    const s = new THREE.Shape();
    pts.forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
    s.closePath();
    return s;
}

/** 압출 다각형(윗면이 +y) */
function slab(pts: readonly Vec[], depth: number, mats: THREE.Material | THREE.Material[]): THREE.Mesh {
    const geo = new THREE.ExtrudeGeometry(shapeOf(pts), { depth, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);          // xy 평면 → xz 평면(윗면 +y)
    geo.translate(0, depth, 0);
    const m = new THREE.Mesh(geo, mats);
    m.receiveShadow = true;
    return m;
}

/** 다각형 변을 따라 나무 레일 */
function rails(pts: readonly Vec[], y: number, mat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(WALL_T, WALL_H, WALL_T);
    for (const s of polygonSegments(pts)) {
        const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(len + WALL_T, WALL_H, WALL_T), mat);
        bar.position.set((s.a.x + s.b.x) / 2, y + WALL_H / 2, (s.a.y + s.b.y) / 2);
        bar.rotation.y = -Math.atan2(dy, dx);
        bar.castShadow = true; bar.receiveShadow = true;
        g.add(bar);
        const post = new THREE.Mesh(postGeo, mat);
        post.position.set(s.a.x, y + WALL_H / 2, s.a.y);
        post.castShadow = true;
        g.add(post);
    }
    return g;
}

export function MiniGolf3D({ hole, ballRef, phase, tickCount, onShoot, onFrame }: Props) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dragRef = useRef<Vec | null>(null);
    const anchorRef = useRef<Vec | null>(null);
    const [dragTick, force] = useState(0);
    const onFrameRef = useRef(onFrame); onFrameRef.current = onFrame;
    const onShootRef = useRef(onShoot); onShootRef.current = onShoot;
    const fitRef = useRef<(() => void) | null>(null);

    // three 자원 — 마운트 1회
    const R = useRef<{
        renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
        course: THREE.Group; ball: THREE.Mesh; aim: THREE.Line; ghost: THREE.Line; shadow: THREE.Mesh;
        ground: THREE.Plane; ray: THREE.Raycaster;
    } | null>(null);

    // ── 초기화 ──
    useEffect(() => {
        const canvas = canvasRef.current, wrap = wrapRef.current;
        if (!canvas || !wrap) return;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(COL.sky);
        scene.fog = new THREE.Fog(COL.sky, 120, 260);

        const camera = new THREE.PerspectiveCamera(42, 1, 1, 400);

        // 조명 — 합산 조도가 대략 π 라 색이 그대로 나온다(당구 ThreeRenderer 와 같은 규칙)
        scene.add(new THREE.HemisphereLight(0xe8fbff, 0x4a7a46, 1.9));
        const sun = new THREE.DirectionalLight(0xfff6e0, 1.9);
        sun.position.set(-26, 52, -18);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        const sc = sun.shadow.camera as THREE.OrthographicCamera;
        sc.left = -34; sc.right = 34; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 140;
        scene.add(sun);
        scene.add(sun.target);
        sun.target.position.set(COURSE_W / 2, 0, COURSE_H / 2);

        // 러프(코스 밖 잔디) — 넉넉히 깔아 화면 가장자리까지 채운다
        const rough = new THREE.Mesh(
            new THREE.PlaneGeometry(220, 260),
            new THREE.MeshStandardMaterial({ color: COL.rough, roughness: 1 }),
        );
        rough.rotation.x = -Math.PI / 2;
        rough.position.set(COURSE_W / 2, 0, COURSE_H / 2);
        rough.receiveShadow = true;
        scene.add(rough);

        const course = new THREE.Group();
        scene.add(course);

        // 공
        const ball = new THREE.Mesh(
            new THREE.SphereGeometry(BALL_R, 24, 16),
            new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
        );
        ball.castShadow = true;
        scene.add(ball);
        // 접촉 그림자(그림자 맵이 작은 공엔 약해서 하나 더 깐다)
        const shadowTex = (() => {
            const c = document.createElement("canvas"); c.width = c.height = 64;
            const g = c.getContext("2d")!;
            const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
            grd.addColorStop(0, "rgba(0,0,0,0.5)"); grd.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
            return new THREE.CanvasTexture(c);
        })();
        const shadow = new THREE.Mesh(
            new THREE.PlaneGeometry(BALL_R * 4, BALL_R * 4),
            new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
        );
        shadow.rotation.x = -Math.PI / 2;
        scene.add(shadow);

        // 조준선 · 예상 경로
        const aim = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
            new THREE.LineBasicMaterial({ color: COL.lime, transparent: true, opacity: 0.95 }),
        );
        aim.visible = false;
        scene.add(aim);
        const ghost = new THREE.Line(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }),
        );
        ghost.visible = false;
        scene.add(ghost);

        R.current = { renderer, scene, camera, course, ball, aim, ghost, shadow, ground: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ray: new THREE.Raycaster() };

        const ro = new ResizeObserver(() => {
            const w = wrap.clientWidth, h = wrap.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            fitRef.current?.();
        });
        ro.observe(wrap);

        return () => { ro.disconnect(); renderer.dispose(); R.current = null; };
    }, []);

    // ── 홀이 바뀌면 코스를 다시 짓는다 ──
    useEffect(() => {
        const r = R.current; if (!r) return;
        const g = r.course;
        g.clear();

        const stripe = stripeTexture();
        const topMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.95 });
        const sideMat = new THREE.MeshStandardMaterial({ color: COL.greenSide, roughness: 1 });
        const woodMat = new THREE.MeshStandardMaterial({ color: COL.wood, roughness: 0.75 });
        const woodDarkMat = new THREE.MeshStandardMaterial({ color: COL.woodDark, roughness: 0.8 });

        // 그린(압출) — ExtrudeGeometry 는 [앞·뒤면, 옆면] 순서로 그룹이 잡힌다
        g.add(slab(hole.fairway, GREEN_H, [topMat, sideMat]));
        g.add(rails(hole.fairway, GREEN_H, woodMat));

        // 블록(장애물 섬)
        const blockTop = new THREE.MeshStandardMaterial({ color: COL.rough, roughness: 1 });
        for (const b of hole.blocks ?? []) {
            g.add(slab(b, GREEN_H + 0.45, [blockTop, sideMat]));
            g.add(rails(b, GREEN_H + 0.45, woodDarkMat));
        }

        // 범퍼
        for (const c of hole.bumpers ?? []) {
            const m = new THREE.Mesh(
                new THREE.CylinderGeometry(c.r, c.r * 1.04, WALL_H + 0.5, 20),
                new THREE.MeshStandardMaterial({ color: COL.bumper, roughness: 0.5 }),
            );
            m.position.set(c.c.x, GREEN_H + (WALL_H + 0.5) / 2, c.c.y);
            m.castShadow = true; m.receiveShadow = true;
            g.add(m);
        }

        // 컵(파인 자리)
        const cup = new THREE.Mesh(
            new THREE.CylinderGeometry(CUP_R, CUP_R * 0.9, 1.0, 20, 1, true),
            new THREE.MeshStandardMaterial({ color: COL.cup, roughness: 1, side: THREE.DoubleSide }),
        );
        cup.position.set(hole.cup.x, GREEN_H - 0.5, hole.cup.y);
        g.add(cup);
        const cupFloor = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 20), new THREE.MeshStandardMaterial({ color: 0x0b120a }));
        cupFloor.rotation.x = -Math.PI / 2;
        cupFloor.position.set(hole.cup.x, GREEN_H - 1.0, hole.cup.y);
        g.add(cupFloor);

        // 티 마커
        const tee = new THREE.Mesh(
            new THREE.CircleGeometry(BALL_R * 1.7, 18),
            new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.32 }),
        );
        tee.rotation.x = -Math.PI / 2;
        tee.position.set(hole.tee.x, GREEN_H + 0.02, hole.tee.y);
        g.add(tee);

        // ── 이 홀의 실제 범위에 카메라를 맞춘다 ──
        const xs = hole.fairway.map((p) => p.x), zs = hole.fairway.map((p) => p.y);
        const minX = Math.min(...xs) - 3, maxX = Math.max(...xs) + 3;
        const minZ = Math.min(...zs) - 3, maxZ = Math.max(...zs) + 3;
        const cxm = (minX + maxX) / 2, czm = (minZ + maxZ) / 2;
        const boxW = maxX - minX, boxD = maxZ - minZ;
        const TILT = 56 * (Math.PI / 180);            // 수평에서 올려다본 각(크면 탑다운)
        const fit = () => {
            const cam = r.camera;
            const halfV = Math.tan((cam.fov * Math.PI) / 360);
            // 기울인 화면에서 세로로 필요한 크기 ≈ 깊이·sin(tilt) + 높이 여유, 가로는 aspect 로 나눈다
            const needV = Math.max(boxD * Math.sin(TILT) * 0.5 + 3, (boxW * 0.5) / cam.aspect);
            const dist = needV / halfV;
            cam.position.set(cxm, Math.sin(TILT) * dist, czm + Math.cos(TILT) * dist);
            cam.lookAt(cxm, 0, czm);
            cam.updateProjectionMatrix();
        };
        fitRef.current = fit;
        fit();

        // ── Kenney 소품(CC0) ──
        const loader = new GLTFLoader();
        let dead = false;
        const put = (file: string, x: number, z: number, scale: number, rotY = 0, y = 0) => {
            loader.load(`${MODELS}/${file}`, (gltf) => {
                if (dead) return;
                const o = gltf.scene;
                o.scale.setScalar(scale);
                o.position.set(x, y, z);
                o.rotation.y = rotY;
                o.traverse((n) => { if ((n as THREE.Mesh).isMesh) { n.castShadow = true; n.receiveShadow = true; } });
                g.add(o);
            });
        };
        // 깃대는 컵 위
        put("flag-red.glb", hole.cup.x, hole.cup.y, 3.6, 0, GREEN_H);
        // 홀마다 다른 랜드마크 — 코스 밖 러프에 세운다(물리에 안 닿는다)
        const idx = Number(hole.id.replace(/\D/g, "")) || 1;
        const landmark = ["windmill.glb", "castle.glb", "structure-gate.glb"][idx % 3];
        put(landmark, maxX + 7, czm - boxD * 0.3, 3.0, -Math.PI / 5);
        // 둘레 나무·바위 — 결정론(홀 번호 기반)이라 매번 같은 자리
        for (let i = 0; i < 12; i++) {
            const s = (idx * 37 + i * 61) % 100;
            const x = i % 2 === 0 ? minX - 2 - (s % 5) : maxX + 2 + (s % 5);
            const z = minZ - 6 + ((i * 137 + s * 7) % (boxD + 16));
            put(i % 3 === 2 ? "rock_smallA.glb" : i % 2 === 0 ? "tree_pineRoundA.glb" : "tree_default.glb", x, z, i % 3 === 2 ? 2.2 : 3.4, (s / 100) * Math.PI * 2);
        }
        return () => { dead = true; };
    }, [hole]);

    // ── 프레임 루프 ──
    useEffect(() => {
        let id = 0, last: number | null = null;
        const loop = (t: number) => {
            const r = R.current;
            const dt = last === null ? 0 : (t - last) / 1000;
            last = t;
            if (!document.hidden) onFrameRef.current(dt);
            if (r) {
                const b = ballRef.current;
                const y = b.inCup ? GREEN_H - 0.55 : GREEN_H + BALL_R;
                r.ball.position.set(b.x, y, b.y);
                r.ball.visible = true;
                r.shadow.position.set(b.x, GREEN_H + 0.03, b.y);
                r.shadow.visible = !b.inCup;
                r.renderer.render(r.scene, r.camera);
            }
            id = requestAnimationFrame(loop);
        };
        id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, [ballRef]);

    // ── 조준선·예상 경로 갱신 ──
    useEffect(() => {
        const r = R.current; if (!r) return;
        const d = dragRef.current;
        const b = ballRef.current;
        if (!d || phase !== "aim" || Math.hypot(d.x, d.y) < 1.2) {
            r.aim.visible = false; r.ghost.visible = false;
            return;
        }
        const len = Math.hypot(d.x, d.y);
        const ux = -d.x / len, uy = -d.y / len;
        const reach = 6 + powerRatio(d.x, d.y) * 16;
        r.aim.geometry.setFromPoints([
            new THREE.Vector3(b.x, GREEN_H + 0.12, b.y),
            new THREE.Vector3(b.x + ux * reach, GREEN_H + 0.12, b.y + uy * reach),
        ]);
        r.aim.visible = true;
        const path = predictPath(b, hole, d.x, d.y);
        if (path.length > 1) {
            r.ghost.geometry.setFromPoints(path.map((p) => new THREE.Vector3(p.x, GREEN_H + 0.12, p.y)));
            r.ghost.visible = true;
        } else r.ghost.visible = false;
    }, [tickCount, dragTick, phase, hole, ballRef]);

    // ── 입력: 화면 → 지면 레이캐스트 ──
    const toCourse = (e: ReactPointerEvent): Vec | null => {
        const r = R.current, c = canvasRef.current;
        if (!r || !c) return null;
        const rect = c.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        r.ray.setFromCamera(ndc, r.camera);
        const hit = new THREE.Vector3();
        // 그린 윗면 높이에서 만난다
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GREEN_H);
        if (!r.ray.ray.intersectPlane(plane, hit)) return null;
        return { x: hit.x, y: hit.z };
    };
    const onDown = (e: ReactPointerEvent) => {
        if (phase !== "aim") return;
        const p = toCourse(e); if (!p) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        anchorRef.current = p;
        dragRef.current = { x: 0, y: 0 };
        force((n) => n + 1);
    };
    const onMove = (e: ReactPointerEvent) => {
        if (!anchorRef.current || phase !== "aim") return;
        const p = toCourse(e); if (!p) return;
        const a = anchorRef.current;
        const dx = p.x - a.x, dy = p.y - a.y;
        const len = Math.hypot(dx, dy), cap = MAX_DRAG * 1.15;
        dragRef.current = len > cap ? { x: (dx / len) * cap, y: (dy / len) * cap } : { x: dx, y: dy };
        force((n) => n + 1);
    };
    const onUp = () => {
        const d = dragRef.current;
        dragRef.current = null; anchorRef.current = null;
        if (d && Math.hypot(d.x, d.y) >= 1.2) onShootRef.current(d.x, d.y);
        force((n) => n + 1);
    };

    const drag = dragRef.current;
    const pr = drag ? powerRatio(drag.x, drag.y) : 0;

    return (
        <div ref={wrapRef} className="relative w-full h-full select-none touch-none overflow-hidden rounded-[18px]">
            <canvas ref={canvasRef} className="block w-full h-full" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
            {phase === "aim" && drag && Math.hypot(drag.x, drag.y) >= 1.2 && (
                <div className="absolute left-3 right-3 bottom-3 h-2.5 rounded-full bg-black/45 overflow-hidden pointer-events-none">
                    <div className="h-full rounded-full" style={{ width: `${pr * 100}%`, background: pr > 0.85 ? "#ff5a3c" : COL.limeCss }} />
                </div>
            )}
        </div>
    );
}
