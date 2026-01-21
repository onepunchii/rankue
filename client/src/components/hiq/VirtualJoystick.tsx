
import React, { useState, useRef, useEffect, useCallback } from 'react';

interface VirtualJoystickProps {
    onMove: (angleDelta: number) => void;
    onStart?: () => void;
    onEnd?: () => void;
    className?: string;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
    onMove,
    onStart,
    onEnd,
    className = ""
}) => {
    const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
    const [isActive, setIsActive] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const stickRef = useRef<HTMLDivElement>(null);
    const requestRef = useRef<number>();

    // Constants
    const MAX_DISTANCE = 40; // Joystick radius
    const DEADZONE = 5;      // Pixels
    const SENSITIVITY_LOW = 0.0005; // Reduced by 50% for smoother micro-adjustments
    const SENSITIVITY_HIGH = 0.01;  // Reduced by 50% for better control at max tilt

    const handleMove = useCallback((clientX: number, clientY: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = clientX - centerX;
        let dy = clientY - centerY;

        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > MAX_DISTANCE) {
            const ratio = MAX_DISTANCE / distance;
            dx *= ratio;
            dy *= ratio;
        }

        // Update Stick Position directly via Ref for performance and to avoid lint
        if (stickRef.current) {
            stickRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
        }
        setStickPos({ x: dx, y: dy });
    }, [stickPos.x]);

    const onPointerDown = (e: React.PointerEvent) => {
        setIsActive(true);
        handleMove(e.clientX, e.clientY);
        onStart?.();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!isActive) return;
        handleMove(e.clientX, e.clientY);
    };

    const onPointerUp = (e: React.PointerEvent) => {
        setIsActive(false);
        if (stickRef.current) {
            stickRef.current.style.transform = `translate(0px, 0px)`;
        }
        setStickPos({ x: 0, y: 0 });
        onEnd?.();
    };

    // Continuous update loop for smooth rotation
    useEffect(() => {
        const update = () => {
            if (isActive && Math.abs(stickPos.x) > DEADZONE) {
                // Calculate sensitivity based on X position
                // Normalize X to [0, 1] after deadzone
                const absX = Math.abs(stickPos.x);
                const normalizedX = (absX - DEADZONE) / (MAX_DISTANCE - DEADZONE);

                // Use a power function for non-linear sensitivity
                // Near center: very slow (0.1 degree ≈ 0.0017 radians)
                // At edge: fast
                const speedScale = Math.pow(normalizedX, 1.5);
                const speed = SENSITIVITY_LOW + (SENSITIVITY_HIGH - SENSITIVITY_LOW) * speedScale;
                const delta = speed * (stickPos.x > 0 ? 1 : -1);

                onMove(delta);
            }
            requestRef.current = requestAnimationFrame(update);
        };

        requestRef.current = requestAnimationFrame(update);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isActive, stickPos.x, onMove]);

    return (
        <div
            ref={containerRef}
            className={`relative w-24 h-24 flex items-center justify-center rounded-full bg-white/5 backdrop-blur-lg border border-white/10 shadow-2xl touch-none ${className}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            {/* Outer Ring */}
            <div className="absolute inset-2 rounded-full border border-white/5 pointer-events-none" />

            {/* Joystick Stick */}
            <div
                ref={stickRef}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-white/30 to-white/10 backdrop-blur-md border border-white/20 shadow-xl transition-transform duration-75 ease-out flex items-center justify-center pointer-events-none"
            >
                {/* Thumb Detail */}
                <div className="w-4 h-4 rounded-full bg-white/20 border border-white/20" />
            </div>

            {/* Hint Arrows */}
            <div className="absolute inset-0 flex items-center justify-between px-2 opacity-20 pointer-events-none">
                <div className="w-1 h-3 bg-white rounded-full" />
                <div className="w-1 h-3 bg-white rounded-full" />
            </div>
        </div>
    );
};
