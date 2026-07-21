import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, LucideRefreshCw, LucidePlay, Target } from "@/lib/icons";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { PhysicsEngine2D } from "@/lib/physics-engine-2d";
import { ScoringEngine, ShotResult } from "@/lib/scoring-engine";
import { Vector3 } from "three";
import { useT } from "@/lib/i18n";

type GameMode = "3c" | "4c";

export default function HiqSimulation() {
    const { t } = useT();
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const sceneRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<PhysicsEngine2D | null>(null);
    const [dpr, setDpr] = useState(1);

    // --- Core State ---
    const [activeMode, setActiveMode] = useState<"setup" | "result">("setup");
    const [activeBall, setActiveBall] = useState<"white" | "yellow" | "red">("white");
    const [gameMode] = useState<GameMode>("4c");
    const [isSimulating, setIsSimulating] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showGrid, setShowGrid] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    interface BallPos { x: number; y: number }
    const [userPositions, setUserPositions] = useState({
        white: { x: 100, y: 125 },
        yellow: { x: 400, y: 125 },
        red: { x: 250, y: 60 }
    });

    // Screen positions for Premium Rendering (Layer 5)
    const [ballPositions, setBallPositions] = useState<Record<string, BallPos>>({
        white: { x: -100, y: -100 },
        yellow: { x: -100, y: -100 },
        red: { x: -100, y: -100 }
    });

    const [simulationData, setSimulationData] = useState<any | null>(null);
    const [recommendedSolutions, setRecommendedSolutions] = useState<any[]>([]);
    const [activeSolutionIndex, setActiveSolutionIndex] = useState(0);
    const [cueStick, setCueStick] = useState({ show: false, x: 0, y: 0, angle: 0, offset: 40 });
    const [isShaking, setIsShaking] = useState(false);
    const [physicsPaths, setPhysicsPaths] = useState<Record<string, any[]>>({});
    const [pointsEarned, setPointsEarned] = useState<number | null>(null);

    // Indirect Control State
    const [isDragging, setIsDragging] = useState(false);
    const [dragCurrent, setDragCurrent] = useState<{ x: number, y: number } | null>(null);

    // --- Physics Engine Initialization ---
    useEffect(() => {
        if (!engineRef.current) {
            engineRef.current = new PhysicsEngine2D([]);
        }
    }, []);

    const initWorld = useCallback(() => {
        if (!sceneRef.current) return;
        const layoutW = sceneRef.current.clientWidth;
        const layoutH = layoutW / 1.7399;
        setDimensions({ width: layoutW, height: layoutH });
    }, []);

    // Handle initial positioning and sync
    useEffect(() => {
        if (!sceneRef.current || dimensions.width === 0) return;

        const hPadding = dimensions.width * 0.054;
        const vPadding = dimensions.height * 0.112;
        const playW = dimensions.width * 0.892;
        const playH = dimensions.height * 0.776;
        const ballRadius = playW / 96.0;

        const mapX = (x: number) => hPadding + ballRadius + (x / 500) * (playW - 2 * ballRadius);
        const mapY = (y: number) => vPadding + ballRadius + (y / 250) * (playH - 2 * ballRadius);

        const newPos = {
            white: { x: mapX(userPositions.white.x), y: mapY(userPositions.white.y) },
            yellow: { x: mapX(userPositions.yellow.x), y: mapY(userPositions.yellow.y) },
            red: { x: mapX(userPositions.red.x), y: mapY(userPositions.red.y) }
        };

        // Immediate sync for Layer 5 rendering (Fixes crosshair drift)
        if (activeMode === "setup") {
            setBallPositions(newPos);
        }
    }, [userPositions, dimensions, activeMode]);

    // --- Lifecycle ---
    useEffect(() => {
        initWorld();
        window.addEventListener('resize', initWorld);
        return () => window.removeEventListener('resize', initWorld);
    }, [initWorld]);

    // --- Logic ---
    const runAISolution = async () => {
        if (isAnalyzing || !engineRef.current) return;
        setIsAnalyzing(true);
        try {
            // Map 0-500 scale to meters for search
            const TABLE_W = 1.422;
            const TABLE_H = 2.844;
            const ballPositionsInMeters: any = {};
            Object.entries(userPositions).forEach(([id, pos]) => {
                // Orientation-preserving 90-deg rotation: UI (long x, short y) -> physics (short x, long y)
                ballPositionsInMeters[id] = {
                    x: (1 - pos.y / 250) * TABLE_W,
                    y: (pos.x / 500) * TABLE_H
                };
            });

            const solutions = await apiRequest("/api/hiq/ai-solutions", {
                method: "POST",
                body: {
                    gameType: gameMode,
                    ballPositions: ballPositionsInMeters
                }
            });

            if (solutions && solutions.length > 0) {
                setRecommendedSolutions(solutions);
                selectSolution(solutions[0], 0);
            } else {
                toast({ title: t("simulation.noResultTitle"), description: t("simulation.noResultDesc") });
            }
        } catch (e) {
            console.error("AISolution Error:", e);
            toast({ title: t("simulation.searchFailTitle"), description: t("simulation.searchFailDesc") });
        } finally {
            setIsAnalyzing(false);
        }
    };

    const selectSolution = (rawShot: any, index: number) => {
        // Normalize data structure (handle DB format vs Legacy format)
        const shot = {
            ...rawShot,
            title: rawShot.title || `${t("simulation.aiRecommend")} #${index + 1}`,
            description: rawShot.description || `${t("simulation.solutionDescPrefix")} ${rawShot.cushionCount || 3}${t("simulation.solutionDescSuffix")}`,
            solution: rawShot.solution || {
                spin: { x: rawShot.shotParams?.spinX || 0, y: rawShot.shotParams?.spinY || 0 },
                power: rawShot.shotParams?.power || 0,
                thickness: 0,
                tip: t("simulation.defaultTip")
            }
        };

        setSimulationData(shot);
        setActiveSolutionIndex(index);
        setActiveMode("result");

        // Sync rendered balls to the DB shot's recorded layout so the recommended
        // path starts at the displayed cue ball (finding [2]). Uses the same
        // orientation-preserving mapping as runReplay.
        if (dimensions.width > 0 && shot.ballPositions) {
            const TABLE_W = 1.422;
            const TABLE_H = 2.844;

            const hPadding = dimensions.width * 0.054;
            const vPadding = dimensions.height * 0.112;
            const playW = dimensions.width * 0.892;
            const playH = dimensions.height * 0.776;
            const ballRadius = playW / 96.0;

            const mapX = (x: number) => hPadding + ballRadius + (x / 500) * (playW - 2 * ballRadius);
            const mapY = (y: number) => vPadding + ballRadius + (y / 250) * (playH - 2 * ballRadius);

            const newPos: Record<string, BallPos> = {};
            Object.entries(shot.ballPositions).forEach(([id, m]: [string, any]) => {
                newPos[id] = {
                    x: mapX((m.y / TABLE_H) * 500),
                    y: mapY((1 - m.x / TABLE_W) * 250)
                };
            });
            setBallPositions(newPos);
        }

        if (engineRef.current) {
            // Dry Run Trajectory using Unified Physics
            engineRef.current.initFromPositions(shot.ballPositions);

            // Handle both legacy and new parameter structure
            const params = shot.shotParams || {
                angle: 0,
                power: shot.solution?.power || 0,
                spinX: shot.solution?.spin?.x || 0,
                spinY: shot.solution?.spin?.y || 0
            };

            const { angle, power, spinX, spinY } = params;
            const shotSpeed = power * 0.1;

            const TABLE_W = 1.422;
            const TABLE_H = 2.844;

            const trajectory = engineRef.current.projectTrajectory('white', shotSpeed, angle + Math.PI, spinX, spinY);

            // Map trajectory back to 0-500 scale for UI Path drawing
            const mappedPaths: Record<string, any[]> = {};
            Object.entries(trajectory).forEach(([id, path]) => {
                mappedPaths[id] = path.map(p => ({
                    x: (p.y / TABLE_H) * 500,
                    y: (1 - p.x / TABLE_W) * 250
                }));
            });

            setPhysicsPaths(mappedPaths);
        }
    };

    const runReplay = useCallback(async (data?: any) => {
        const sol = data || simulationData;
        if (!engineRef.current || isSimulating || !sol) return;

        setIsSimulating(true);

        const hPadding = dimensions.width * 0.054;
        const vPadding = dimensions.height * 0.112;
        const playW = dimensions.width * 0.892;
        const playH = dimensions.height * 0.776;
        const ballRadius = playW / 96.0;

        const mapX = (x: number) => hPadding + ballRadius + (x / 500) * (playW - 2 * ballRadius);
        const mapY = (y: number) => vPadding + ballRadius + (y / 250) * (playH - 2 * ballRadius);

        const TABLE_W = 1.422;
        const TABLE_H = 2.844;

        // 1. Initialize Engine with recorded positions
        engineRef.current.initFromPositions(sol.ballPositions);

        // 2. Animate Cue Stick
        const { angle, power, spinX, spinY } = sol.shotParams;
        const whitePos = sol.ballPositions.white;
        const startVisualX = mapX((whitePos.y / TABLE_H) * 500);
        const startVisualY = mapY((1 - whitePos.x / TABLE_W) * 250);

        let sequenceStart = performance.now();
        const sequenceStep = () => {
            const elapsed = performance.now() - sequenceStart;
            if (elapsed < 300) {
                const progress = elapsed / 300;
                const swing = Math.sin(progress * Math.PI) * 40;
                // Under the orientation-preserving rotation, physics angle Θ maps to
                // screen angle Θ - π/2; the cue-stick renderer adds π, so pass angle + π/2
                // to align the drawn stick with the corrected screen mapping.
                setCueStick({ show: true, x: startVisualX, y: startVisualY, angle: angle + Math.PI / 2, offset: 15 + swing });
                requestAnimationFrame(sequenceStep);
            } else {
                setCueStick(prev => ({ ...prev, show: false }));
                setIsShaking(true);
                setTimeout(() => setIsShaking(false), 80);

                // 3. Real Physical Simulation Starts
                const shotSpeed = power * 0.1;
                engineRef.current!.shoot('white', shotSpeed, angle + Math.PI, spinX, spinY);

                let lastReplayTime = performance.now();
                const replayFrame = () => {
                    const now = performance.now();
                    const dt = Math.min((now - lastReplayTime) / 1000, 0.1);
                    lastReplayTime = now;

                    if (engineRef.current) {
                        engineRef.current.update(dt);

                        // Sync UI ball positions
                        const currentBalls = engineRef.current.getBalls();
                        const updateUI: Record<string, { x: number, y: number }> = {};
                        currentBalls.forEach(b => {
                            updateUI[b.id] = {
                                x: mapX((b.pos.y / TABLE_H) * 500),
                                y: mapY((1 - b.pos.x / TABLE_W) * 250)
                            };
                        });
                        setBallPositions(updateUI);

                        if (engineRef.current.isAllStationary()) {
                            setIsSimulating(false);
                            setPointsEarned(ScoringEngine.calculatePoints({
                                cushionCount: sol.cushionCount || 0,
                                travelDistance: 1000,
                                isSuccess: true,
                                precisionError: 0,
                                spinComplexity: 0.5
                            } as ShotResult));
                        } else {
                            requestAnimationFrame(replayFrame);
                        }
                    }
                };
                requestAnimationFrame(replayFrame);
            }
        };
        requestAnimationFrame(sequenceStep);

    }, [dimensions, isSimulating, simulationData]);

    // --- Drag Interaction ---
    const handleDrag = useCallback((clientX: number, clientY: number) => {
        if (!isDragging || activeMode !== "setup" || !dragCurrent) return;

        const sensitivity = 0.5;
        const dx = (clientX - dragCurrent.x) * sensitivity;
        const dy = (clientY - dragCurrent.y) * sensitivity;

        setUserPositions(prev => ({
            ...prev,
            [activeBall]: {
                x: Math.min(500, Math.max(0, prev[activeBall].x + dx)),
                y: Math.min(250, Math.max(0, prev[activeBall].y + dy))
            }
        }));
        setDragCurrent({ x: clientX, y: clientY });
    }, [isDragging, activeMode, dragCurrent, activeBall]);

    return (
        <div
            className="fixed inset-0 bg-[#f2f0eb] flex flex-col font-sans overflow-hidden select-none"
            onMouseMove={(e) => handleDrag(e.clientX, e.clientY)}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onTouchMove={(e) => {
                const t = e.touches[0];
                handleDrag(t.clientX, t.clientY);
            }}
            onTouchEnd={() => setIsDragging(false)}
        >
            {/* Header */}
            <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-black/10 z-50">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setLocation('/')}
                        className="p-2 hover:bg-black/[0.04] rounded-full"
                        title={t("simulation.backHome")}
                    >
                        <ChevronDown className="w-6 h-6 rotate-90 text-black/40" />
                    </button>
                    <h1 className="text-[rgba(0,0,0,0.87)] font-semibold tracking-tight">{t("simulation.title")}</h1>
                </div>
                <div className="w-20" /> {/* Spacer for Title Centering */}
            </header>

            {/* Main Area */}
            <main className="flex-1 flex flex-col p-4 items-center gap-4">
                <motion.div
                    animate={isShaking ? { x: [0, -2, 2, -2, 0], y: [0, 2, -2, 2, 0] } : {}}
                    transition={{ duration: 0.1 }}
                    className="w-full max-w-[900px] relative mt-4 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
                >
                    {/* Cue Stick Graphic */}
                    <AnimatePresence>
                        {cueStick.show && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                style={{
                                    position: 'absolute',
                                    left: cueStick.x,
                                    top: cueStick.y,
                                    width: dimensions.width * 0.4,
                                    height: Math.max(4, dimensions.width * 0.008),
                                    background: 'linear-gradient(to right, #dfbb8b 0%, #6d4c41 80%, #212121 100%)',
                                    borderRadius: '100px',
                                    transformOrigin: 'left center',
                                    rotate: `${cueStick.angle * (180 / Math.PI) + 180}deg`,
                                    x: cueStick.offset,
                                    zIndex: 45,
                                    boxShadow: '0 8px 20px rgba(0,0,0,0.6)',
                                    pointerEvents: 'none',
                                    border: '1px solid rgba(0,0,0,0.2)'
                                }}
                            >
                                {/* Cue Tip Detail */}
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[10%] h-[120%] bg-blue-400 rounded-sm opacity-80 blur-[1px]" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {/* Layer 1: Base Frame (Removed Grey Background) */}
                    <div className="absolute inset-0 bg-transparent" />

                    {/* Layer 2: Playing Cloth (Premium Felt with Vignette & Texture) */}
                    <div
                        className="absolute overflow-hidden"
                        style={{
                            left: dimensions.width * 0.054,
                            top: dimensions.height * 0.112,
                            width: dimensions.width * 0.892,
                            height: dimensions.height * 0.776,
                            background: 'radial-gradient(circle, #2E7D32 0%, #1B5E20 70%, #0A3311 100%)'
                        }}
                    >
                        {/* Fine Cloth Texture Overlay */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
                    </div>

                    {/* Layer 3: Canvas (Matter.js Rendering / Balls) */}
                    <div ref={sceneRef} className="relative w-full aspect-[1.7399/1] overflow-hidden" />

                    {/* Layer 4: The Blueprint Overlay (With 2.5% Squash) */}
                    <img
                        src="/assets/images/당구대.png"
                        alt="Billiard Table Blueprint"
                        className="absolute w-full pointer-events-none object-fill"
                        style={{ height: '97.5%', top: '1.25%', left: 0 }}
                    />

                    {/* Optional Grid Overlay */}
                    {showGrid && (
                        <div
                            className="absolute pointer-events-none bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:12.5%_25%]"
                            style={{
                                left: dimensions.width * 0.054,
                                top: dimensions.height * 0.112,
                                width: dimensions.width * 0.892,
                                height: dimensions.height * 0.776
                            }}
                        />
                    )}

                    {/* Crosshair Overlay (Above Balls for absolute precision) */}
                    {activeMode === "setup" && dimensions.width > 0 && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
                            {(() => {
                                const hPadding = dimensions.width * 0.054;
                                const vPadding = dimensions.height * 0.112;
                                const playW = dimensions.width * 0.892;
                                const playH = dimensions.height * 0.776;
                                const br = playW / 96.0;

                                const cx = hPadding + br + (userPositions[activeBall].x / 500) * (playW - 2 * br);
                                const cy = vPadding + br + (userPositions[activeBall].y / 250) * (playH - 2 * br);

                                return (
                                    <>
                                        <line
                                            x1={cx} y1={vPadding} x2={cx} y2={dimensions.height - vPadding}
                                            stroke="#FF0000" strokeWidth="1" strokeOpacity="0.8"
                                        />
                                        <line
                                            x1={hPadding} y1={cy} x2={dimensions.width - hPadding} y2={cy}
                                            stroke="#FF0000" strokeWidth="1" strokeOpacity="0.8"
                                        />
                                    </>
                                );
                            })()}
                        </svg>
                    )}

                    {/* Layer 4: Trajectory Layer (Path visualization) */}
                    {activeMode === "result" && simulationData && dimensions.width > 0 && (
                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-[15]">
                            {(() => {
                                const hPadding = dimensions.width * 0.054;
                                const vPadding = dimensions.height * 0.112;
                                const playW = dimensions.width * 0.892;
                                const playH = dimensions.height * 0.776;
                                const ballRadius = playW / 96.0;

                                const mapX = (x: number) => hPadding + ballRadius + (x / 500) * (playW - 2 * ballRadius);
                                const mapY = (y: number) => vPadding + ballRadius + (y / 250) * (playH - 2 * ballRadius);

                                return Object.entries(physicsPaths).map(([color, frames]) => {
                                    if (color !== 'white') return null; // Only show white ball path
                                    if (!frames || frames.length < 2) return null;
                                    const isTarget = true;
                                    const strokeColor = '#FFFFFF';

                                    const pathD = frames.map((p, i) => `${i === 0 ? 'M' : 'L'} ${mapX(p.x)} ${mapY(p.y)}`).join(' ');

                                    return (
                                        <g key={color}>
                                            <motion.path
                                                d={pathD}
                                                fill="none"
                                                stroke={strokeColor}
                                                strokeWidth={isTarget ? 2 : 1.5}
                                                strokeOpacity={isTarget ? 0.6 : 0.2}
                                                initial={{ pathLength: 0 }}
                                                animate={{ pathLength: 1 }}
                                                transition={{ duration: 1.2, ease: "easeOut" }}
                                                strokeDasharray={isTarget ? "none" : "4,4"}
                                            />
                                        </g>
                                    );
                                });
                            })()}
                        </svg>
                    )}

                    {/* Layer 5: Premium Glossy Balls Layer */}
                    <div className="absolute inset-0 pointer-events-none z-20">
                        {Object.entries(ballPositions).map(([color, pos]) => {
                            const hPadding = dimensions.width * 0.054;
                            const playW = dimensions.width * 0.892;
                            const ballRadius = playW / 96.0;
                            const borderW = ballRadius * 0.1; // 5% of size (10% of radius)

                            // Vivid Realistic Colors
                            const baseColors = {
                                white: { main: '#FDFDFD', dark: '#E0E0E0' },
                                yellow: { main: '#FFD54F', dark: '#F9A825' },
                                red: { main: '#EF5350', dark: '#B71C1C' }
                            };
                            const c = baseColors[color as keyof typeof baseColors];

                            return (
                                <div
                                    key={color}
                                    className="absolute rounded-full shadow-lg overflow-hidden flex items-center justify-center"
                                    style={{
                                        left: pos.x - ballRadius,
                                        top: pos.y - ballRadius,
                                        width: ballRadius * 2,
                                        height: ballRadius * 2,
                                        boxSizing: 'border-box',
                                        border: `${borderW}px solid #111111`,
                                        background: `radial-gradient(circle at 35% 35%, ${c.main} 0%, ${c.dark} 100%)`
                                    }}
                                >
                                    {/* Glossy Highlight Overlay */}
                                    <div
                                        className="absolute inset-0 rounded-full"
                                        style={{
                                            background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 60%)'
                                        }}
                                    />
                                    {/* Active Pulse */}
                                    {activeMode === 'setup' && activeBall === color && (
                                        <div className="absolute inset-0 border-2 border-white/40 rounded-full animate-pulse" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Touchpad Area */}
                <div
                    className="flex-1 w-full max-w-[900px] mt-4 relative bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden cursor-move touch-none"
                    onMouseDown={(e) => {
                        setIsDragging(true);
                        setDragCurrent({ x: e.clientX, y: e.clientY });
                    }}
                    onTouchStart={(e) => {
                        setIsDragging(true);
                        const t = e.touches[0];
                        setDragCurrent({ x: t.clientX, y: t.clientY });
                    }}
                >
                    <AnimatePresence mode="wait">
                        {activeMode === "setup" ? (
                            <motion.div
                                key="setup" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                                className="absolute inset-0 p-8 flex flex-col items-center justify-between"
                            >
                                <div className="flex gap-4">
                                    {(['white', 'yellow', 'red'] as const).map(c => {
                                        const baseColors = {
                                            white: { main: '#FDFDFD', dark: '#E0E0E0' },
                                            yellow: { main: '#FFD54F', dark: '#F9A825' },
                                            red: { main: '#EF5350', dark: '#B71C1C' }
                                        };
                                        const colorData = baseColors[c];
                                        const isActive = activeBall === c;
                                        const label = c === 'white' ? t("simulation.cueBall") : c === 'yellow' ? t("simulation.object1") : t("simulation.object2");

                                        return (
                                            <div key={c} className="flex flex-col items-center gap-3">
                                                {/* 3D Ball Icon */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActiveBall(c); }}
                                                    className={`group relative w-10 h-10 rounded-full transition-all duration-300 ${isActive ? 'scale-110' : 'opacity-40 grayscale-[0.5] hover:opacity-70 hover:grayscale-0'}`}
                                                    style={{
                                                        background: `radial-gradient(circle at 35% 35%, ${colorData.main} 0%, ${colorData.dark} 100%)`,
                                                        boxShadow: isActive ? '0 0 15px rgba(255,255,255,0.2)' : 'none'
                                                    }}
                                                >
                                                    <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(255,255,255,0.4)_0%,rgba(255,255,255,0)_60%)] pointer-events-none" />
                                                </button>

                                                {/* Clean Button Label */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setActiveBall(c); }}
                                                    className={`px-4 py-1.5 rounded-pill text-[12px] font-semibold transition-all duration-300 ${isActive
                                                        ? 'bg-brand text-brand-fg'
                                                        : 'bg-black/[0.04] text-black/55 '
                                                        }`}
                                                >
                                                    {label}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="text-center flex flex-col items-center">
                                    <p className="text-black/55 text-[12px] font-medium mb-3 tracking-tight">
                                        {t("simulation.searchIntro1")}<br />{t("simulation.searchIntro2")}
                                    </p>
                                    <Button
                                        onClick={(e) => { e.stopPropagation(); runAISolution(); }}
                                        disabled={isAnalyzing}
                                        className="rk-btn-primary h-16 px-16 rounded-pill text-lg shadow-[0_20px_40px_rgba(0,98,65,0.12)]"
                                    >
                                        {isAnalyzing ? <LucideRefreshCw className="animate-spin w-6 h-6 mr-3" /> : <Target className="w-6 h-6 mr-3" />}
                                        {t("simulation.searchButton")}
                                    </Button>
                                </div>

                                {/* Central Instruction Text */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-0">
                                    <p className="text-[13px] font-medium text-black/40 whitespace-nowrap">
                                        {t("simulation.dragHint")}
                                    </p>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="result" initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
                                className="absolute inset-0 bg-white p-8 flex flex-col"
                            >
                                <div className="flex flex-col mb-6">
                                    <p className="text-brand text-[12px] font-semibold mb-4">{t("simulation.aiStrategy")}</p>
                                    <div className="flex gap-3">
                                        {recommendedSolutions.map((sol, i) => (
                                            <button
                                                key={i}
                                                onClick={() => selectSolution(sol, i)}
                                                className={`flex-1 py-3 px-4 rounded-tile border transition-all duration-300 flex flex-col items-center justify-center gap-1 ${activeSolutionIndex === i
                                                    ? 'bg-brand border-brand text-brand-fg'
                                                    : 'bg-black/[0.04] border-black/[0.08] hover:bg-black/[0.06]'
                                                    }`}
                                            >
                                                <span className={`text-[12px] font-semibold ${activeSolutionIndex === i ? 'text-brand-fg/60' : 'text-black/55'}`}>{t("simulation.option")} {i + 1}</span>
                                                <span className={`text-[12px] font-bold truncate w-full text-center ${activeSolutionIndex === i ? 'text-brand-fg' : 'text-black/70'}`}>
                                                    {(!sol.title || sol.title === 'Unknown') ? t("simulation.recommendedSolution") : sol.title}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-between items-end mb-6">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <h2 className="text-2xl font-semibold text-[rgba(0,0,0,0.87)] tracking-tight truncate leading-tight">
                                            {simulationData?.title || t("simulation.aiRecommendedSolution")}
                                        </h2>
                                        <p className="text-black/55 text-[12px] mt-1 font-medium">{simulationData?.description || t("simulation.defaultDescription")}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => runReplay()}
                                            title={t("simulation.replayTitle")}
                                            className="w-12 h-12 bg-black/[0.04] rounded-tile flex items-center justify-center text-[rgba(0,0,0,0.87)]"
                                        >
                                            <LucidePlay className="w-5 h-5 fill-current" />
                                        </button>
                                        <button
                                            onClick={() => setActiveMode("setup")}
                                            title={t("simulation.backToSetupTitle")}
                                            className="rk-btn-primary h-12 px-6 whitespace-nowrap shadow-[0_5px_15px_rgba(0,98,65,0.12)]"
                                        >
                                            {t("simulation.editLayout")}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mb-8">
                                    <Card className="bg-black/[0.04] p-4 h-24 flex items-center justify-center">
                                        <SpinVisualizer spin={simulationData?.solution.spin} />
                                    </Card>
                                    <Card className="bg-black/[0.04] p-4 h-24 col-span-2 flex items-center justify-between px-8">
                                        <ThicknessVisualizer thickness={simulationData?.solution.thickness} />
                                        <PowerGauge power={simulationData?.solution.power} />
                                    </Card>
                                </div>

                                <div className="flex-1 bg-black/[0.04] rounded-tile p-6 overflow-y-auto">
                                    <p className="text-sm text-black/70 leading-relaxed font-medium">{simulationData?.tip || simulationData?.solution?.tip}</p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}

const SpinVisualizer = ({ spin }: { spin: any }) => {
    const { t } = useT();
    const x = spin ? (spin.x / 12) * 100 : 0;
    const y = spin ? (spin.y / 12) * 100 : 0;
    return (
        <div className="relative w-16 h-16 rounded-full border-2 border-black/10 bg-gradient-to-br from-black/[0.04] to-transparent flex items-center justify-center">
            <div
                className="absolute w-3 h-3 bg-red-600 rounded-full"
                style={{ transform: `translate(${x}%, ${-y}%)` } as any}
            />
            <div className="text-[12px] font-medium text-black/55 mt-10 tracking-normal">{t("simulation.spin")}</div>
        </div>
    );
};

const ThicknessVisualizer = ({ thickness }: { thickness: number }) => {
    const { t } = useT();
    return (
        <div className="flex flex-col items-center">
            <div className="relative w-24 h-8 flex items-center">
                <div className="absolute w-8 h-8 rounded-full bg-black/[0.04]" style={{ left: 0 } as any} />
                <div
                    className="absolute w-8 h-8 rounded-full border border-blue-500 bg-blue-500/30"
                    style={{ '--thickness-offset': `${(thickness || 0) * 32}px`, left: 'var(--thickness-offset)' } as any}
                />
            </div>
            <span className="text-[12px] font-medium text-black/55 mt-2 tracking-normal">{t("simulation.thickness")} {Math.round((thickness || 0) * 8)}/8</span>
        </div>
    );
};

const PowerGauge = ({ power }: { power: number }) => {
    const { t } = useT();
    return (
        <div className="flex flex-col items-center">
            <div className="flex gap-1 h-6 items-end">
                {[1, 2, 3, 4, 5].map(i => (
                    <div
                        key={i}
                        className={`w-2 rounded-sm ${power >= i * 20 ? 'bg-amber-400' : 'bg-black/[0.08]'}`}
                        style={{ '--bar-height': `${i * 20}%`, height: 'var(--bar-height)' } as any}
                    />
                ))}
            </div>
            <span className="text-[12px] font-medium text-black/55 mt-2 tracking-normal">{t("simulation.power")} {power}%</span>
        </div>
    );
};
