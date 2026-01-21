import { useState, useCallback } from 'react';

export function useGameHistory<T>(initialState: T) {
    const [past, setPast] = useState<T[]>([]);
    const [present, setPresent] = useState<T>(initialState);
    const [future, setFuture] = useState<T[]>([]);

    const canUndo = past.length > 0;
    const canRedo = future.length > 0;

    const undo = useCallback(() => {
        if (!canUndo) return;
        const previous = past[past.length - 1];
        const newPast = past.slice(0, past.length - 1);

        setFuture([present, ...future]);
        setPresent(previous);
        setPast(newPast);
    }, [past, present, future, canUndo]);

    const redo = useCallback(() => {
        if (!canRedo) return;
        const next = future[0];
        const newFuture = future.slice(1);

        setPast([...past, present]);
        setPresent(next);
        setFuture(newFuture);
    }, [past, present, future, canRedo]);

    const set = useCallback((newState: T | ((prev: T) => T)) => {
        setPresent(prev => {
            const nextState = typeof newState === 'function' ? (newState as Function)(prev) : newState;

            // Basic equality check to prevent identical history entries could be added here
            // but for game state objects, we assume changes are intentional.

            setPast(currPast => [...currPast, prev]);
            setFuture([]); // Clear redo stack on new action
            return nextState;
        });
    }, []);

    // Helper to reset history (e.g. on game start)
    const reset = useCallback((newState: T) => {
        setPast([]);
        setPresent(newState);
        setFuture([]);
    }, []);

    return {
        state: present,
        set,
        undo,
        redo,
        canUndo,
        canRedo,
        reset
    };
}
