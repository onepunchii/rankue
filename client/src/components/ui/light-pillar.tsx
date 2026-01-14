import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

interface LightPillarProps {
    topColor?: string;
    bottomColor?: string;
    intensity?: number;
    rotationSpeed?: number;
    interactive?: boolean;
    className?: string;
    glowAmount?: number;
    pillarWidth?: number;
    pillarHeight?: number;
    noiseIntensity?: number;
    mixBlendMode?: React.CSSProperties['mixBlendMode'];
    pillarRotation?: number;
}

const LightPillar: React.FC<LightPillarProps> = ({
    topColor = '#5227FF',
    bottomColor = '#FF9FFC',
    intensity = 1.0,
    rotationSpeed = 0.3,
    interactive = false,
    className = '',
    glowAmount = 0.005,
    pillarWidth = 3.0,
    pillarHeight = 0.4,
    noiseIntensity = 0.5,
    mixBlendMode = 'screen',
    pillarRotation = 0
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const materialRef = useRef<THREE.ShaderMaterial | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const [webGLSupported, setWebGLSupported] = useState<boolean>(true);

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        sceneRef.current = scene;
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        cameraRef.current = camera;

        // Clean up any stray canvases before starting
        const strayCanvases = container.querySelectorAll('canvas');
        strayCanvases.forEach(c => container.removeChild(c));

        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({
                antialias: false,
                alpha: true,
                powerPreference: 'high-performance',
                precision: 'lowp',
                stencil: false,
                depth: false
            });
        } catch (error) {
            setWebGLSupported(false);
            return;
        }

        renderer.setSize(width, height);
        // Reduce pixel ratio for better performance on mobile/retina
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.2));
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const parseColor = (hex: string): THREE.Vector3 => {
            const color = new THREE.Color(hex);
            return new THREE.Vector3(color.r, color.g, color.b);
        };

        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float uTime;
            uniform vec2 uResolution;
            uniform vec3 uTopColor;
            uniform vec3 uBottomColor;
            uniform float uIntensity;
            uniform float uGlowAmount;
            uniform float uPillarWidth;
            uniform float uPillarHeight;
            uniform float uPillarRotation;
            varying vec2 vUv;

            mat2 rot(float a) {
                float s = sin(a); float c = cos(a);
                return mat2(c, -s, s, c);
            }

            void main() {
                vec2 uv = (vUv * 2.0 - 1.0);
                uv.x *= uResolution.x / uResolution.y;
                uv *= rot(uPillarRotation * 3.14159 / 180.0);

                float time = uTime * 0.5;
                vec3 color = vec3(0.0);
                
                // Optimized Raymarching-like effect
                float d = length(uv) - uPillarWidth * 0.1;
                float glow = smoothstep(0.4, 0.0, abs(d));
                
                vec3 gradient = mix(uBottomColor, uTopColor, vUv.y);
                color = gradient * glow * uIntensity * uGlowAmount * 100.0;
                
                // Add simple shimmer
                color *= 1.0 + 0.05 * sin(uv.y * 8.0 + time);
                
                gl_FragColor = vec4(color, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2(width, height) },
                uTopColor: { value: parseColor(topColor) },
                uBottomColor: { value: parseColor(bottomColor) },
                uIntensity: { value: intensity },
                uGlowAmount: { value: glowAmount },
                uPillarWidth: { value: pillarWidth },
                uPillarHeight: { value: pillarHeight },
                uPillarRotation: { value: pillarRotation }
            },
            transparent: true,
            depthWrite: false,
            depthTest: false
        });
        materialRef.current = material;

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        scene.add(mesh);

        let time = 0;
        const animate = () => {
            if (!rendererRef.current || !materialRef.current) return;
            time += 0.01 * rotationSpeed;
            materialRef.current.uniforms.uTime.value = time;
            rendererRef.current.render(scene, camera);
            rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            if (rendererRef.current) {
                rendererRef.current.dispose();
                if (container.contains(rendererRef.current.domElement)) {
                    container.removeChild(rendererRef.current.domElement);
                }
            }
            if (materialRef.current) materialRef.current.dispose();
            scene.clear();
        };
    }, []); // Only init once

    // Update uniforms when props change without re-creating the renderer
    useEffect(() => {
        if (materialRef.current) {
            const color = new THREE.Color(topColor);
            materialRef.current.uniforms.uTopColor.value.set(color.r, color.g, color.b);
            materialRef.current.uniforms.uPillarRotation.value = pillarRotation;
        }
    }, [topColor, pillarRotation]);

    return (
        <div ref={containerRef} className={`w-full h-full absolute top-0 left-0 ${className}`} style={{ mixBlendMode }} />
    );
};

export default LightPillar;
