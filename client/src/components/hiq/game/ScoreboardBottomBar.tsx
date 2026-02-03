import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LucideUndo2, LucideRedo2 } from "lucide-react";

interface Props {
    innings: number;
    onExit: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
}

export function ScoreboardBottomBar({ innings, onExit, canUndo, canRedo, onUndo, onRedo }: Props) {
    // Timer State moved here to prevent re-rendering of parent
    const [elapsedTime, setElapsedTime] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setElapsedTime(prev => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-16 bg-[#0a0a0a] border-t border-white/5 flex items-center justify-between px-8 shrink-0 z-50">
            {/* Left Section: Time */}
            <div className="flex items-center gap-6 w-1/4">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">Session Time</span>
                    <span className="text-xl font-black text-white font-mono tracking-tighter">{formatTime(elapsedTime)}</span>
                </div>
            </div>

            {/* Center Section: Inning + Undo/Redo */}
            <div className="flex items-center justify-center gap-12 flex-1">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className={`w-14 h-14 rounded-2xl bg-white/5 border border-white/5 ${canUndo ? 'text-white hover:bg-white/10' : 'text-white/5'}`}
                >
                    <LucideUndo2 className="w-6 h-6" />
                </Button>

                {/* Billiard Ball Style Inning Display */}
                <div className="relative group">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1a1a1a] to-[#000000] border-4 border-[#ffd700] flex flex-col items-center justify-center shadow-[0_0_40px_rgba(255,215,0,0.2)] -mt-16 bg-black z-50">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] leading-none mb-1">Inning</span>
                        <span className="text-4xl font-black text-[#ffd700] tabular-nums leading-none drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]">{innings}</span>
                    </div>
                    {/* Glow effect back shadow */}
                    <div className="absolute inset-0 rounded-full blur-2xl bg-[#ffd700]/10 -mt-16 -z-10" />
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className={`w-14 h-14 rounded-2xl bg-white/5 border border-white/5 ${canRedo ? 'text-white hover:bg-white/10' : 'text-white/5'}`}
                >
                    <LucideRedo2 className="w-6 h-6" />
                </Button>
            </div>

            {/* Right Section: Controls */}
            <div className="flex items-center justify-end gap-3 w-1/4">
                <Button
                    onClick={onExit}
                    className="h-10 px-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all text-xs font-black tracking-widest"
                >
                    종료하기
                </Button>
            </div>
        </div>
    );
}
