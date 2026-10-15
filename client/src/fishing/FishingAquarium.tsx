import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FishingCatch } from "@shared/fishing";
import { aquariumFish, type TankFish } from "@shared/fishingAquarium";

function fishMesh(f: TankFish): THREE.Group {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.45, metalness: 0.15 });
    const fin = new THREE.MeshStandardMaterial({ color: f.fin, roughness: 0.6, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), skin);
    body.scale.set(1.6 * f.length, 0.62 * f.depth, 0.36);
    g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34 * f.depth, 0.55, 4), fin);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.95 * f.length;
    tail.name = "tail";
    g.add(tail);
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 3), fin);
    dorsal.position.set(0.05, 0.34 * f.depth, 0);
    g.add(dorsal);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: "#0B0B0B" }));
    eye.position.set(0.55 * f.length, 0.08, 0.17);
    g.add(eye);
    g.scale.setScalar(f.size);
    return g;
}

export function FishingAquarium({ list }: { list: readonly FishingCatch[] }) {
    const mount = useRef<HTMLDivElement>(null);
    const fish = useMemo(() => aquariumFish(list), [list]);

    useEffect(() => {
        const el = mount.current;
        if (!el || fish.length === 0) return;
        let renderer: THREE.WebGLRenderer;
        try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); } catch { return; }
        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#0B3A52");
        scene.fog = new THREE.Fog("#0B3A52", 6, 16);
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
        camera.position.set(0, 0.4, 9);
        scene.add(new THREE.AmbientLight("#BFE6FF", 0.9));
        const sun = new THREE.DirectionalLight("#FFFFFF", 1.2);
        sun.position.set(2, 6, 4);
        scene.add(sun);
        const sand = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ color: "#C8B48A", roughness: 1 }));
        sand.rotation.x = -Math.PI / 2;
        sand.position.y = -2.6;
        scene.add(sand);
        const weed = new THREE.MeshStandardMaterial({ color: "#2E7D4F", roughness: 0.9 });
        const weeds: THREE.Mesh[] = [];
        for (let i = 0; i < 7; i++) {
            const w = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.6 + (i % 3) * 0.5, 5), weed);
            w.position.set(-5 + i * 1.7, -2.0 + (i % 3) * 0.2, -2 - (i % 2));
            scene.add(w);
            weeds.push(w);
        }
        const swimmers = fish.map((f) => { const m = fishMesh(f); scene.add(m); return { f, m }; });

        const resize = () => {
            const w = el.clientWidth, h = el.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            renderer.domElement.style.width = "100%";
            renderer.domElement.style.height = "100%";
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(el);

        const place = (t: number) => {
            for (const { f, m } of swimmers) {
                const a = f.phase + t * f.speed;
                const x = Math.sin(a) * f.rangeX;
                m.position.set(x, f.y + Math.sin(a * 2.3) * 0.25, f.z);
                m.rotation.y = Math.cos(a) >= 0 ? 0 : Math.PI;
                const tail = m.getObjectByName("tail");
                if (tail) tail.rotation.y = Math.sin(t * 8 * f.speed + f.phase) * 0.5;
            }
            weeds.forEach((w, i) => { w.rotation.z = Math.sin(t * 0.8 + i) * 0.08; });
        };

        let raf = 0, t = 0, last = performance.now();
        const frame = (now: number) => {
            t += Math.min(0.05, (now - last) / 1000);
            last = now;
            place(t);
            renderer.render(scene, camera);
            if (!still && !document.hidden) raf = requestAnimationFrame(frame);
        };
        const onVis = () => { if (!document.hidden && !still) { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } };
        document.addEventListener("visibilitychange", onVis);
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener("visibilitychange", onVis);
            ro.disconnect();
            scene.traverse((o) => {
                if (o instanceof THREE.Mesh) {
                    o.geometry.dispose();
                    (Array.isArray(o.material) ? o.material : [o.material]).forEach((mat) => mat.dispose());
                }
            });
            renderer.dispose();
            renderer.domElement.remove();
        };
    }, [fish]);

    if (fish.length === 0) return (
        <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-5 text-[14px] leading-relaxed text-[#F3ECDDB3] break-keep" data-testid="fishing-tank-empty">
            아직 수조가 비어 있어요. 조과를 적으면 그 어종이 수조에 들어와 헤엄쳐요.
        </p>
    );
    return (
        <div data-testid="fishing-tank">
            <div ref={mount} className="relative h-[56vh] max-h-[520px] min-h-[300px] w-full overflow-hidden rounded-2xl bg-[#0B3A52]" role="img" aria-label={`내 수조 — ${fish.map((f) => f.species).join(", ")}`} />
            <ul className="mt-3 flex flex-wrap gap-1.5">
                {fish.map((f) => (
                    <li key={f.species} className="flex h-9 items-center gap-1.5 rounded-full bg-[#FFFFFF0F] px-3 text-[13px] text-[#F3ECDDCC]">
                        <i aria-hidden className="h-3 w-3 rounded-full" style={{ background: f.color }} />{f.species}<span className="text-[#F3ECDD80]">{f.count}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#F3ECDD80] break-keep">잡은 어종마다 한 마리씩, 많이 잡은 어종일수록 크게 헤엄쳐요.</p>
        </div>
    );
}
