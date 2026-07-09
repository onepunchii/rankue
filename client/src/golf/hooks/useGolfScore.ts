import { useMemo } from 'react';

export interface GolfScoreResult {
    completedHolesCount: number;
    totalStrokes: number;
    totalParPlayed: number;
    currentOverPar: number;
    handicapAllowed: number;
    netScore: number;
    paceStatus: 'BEST' | 'GOOD' | 'WARNING';
}

/**
 * calculateGolfScore
 * Pure function for golf scoring logic.
 * Safe to use inside loops or other functions.
 */
export function calculateGolfScore(
    scores: (number | null)[],
    pars: number[],
    handicap: number,
    currentHole: number = 17 // Default to all holes if not specified
): GolfScoreResult {
    // Determine the range of holes to count: 
    // We count up to currentHole (0-indexed)
    const maxIndex = Math.min(17, currentHole);

    // 1. totalStrokes: Sum scores up to current hole, defaulting to Par if 0/null
    let totalStrokes = 0;
    for (let i = 0; i <= maxIndex; i++) {
        const s = scores[i];
        totalStrokes += (s !== null && s > 0) ? s : pars[i];
    }

    // 2. totalParPlayed: Sum pars for the same range
    let totalParPlayed = 0;
    for (let i = 0; i <= maxIndex; i++) {
        totalParPlayed += pars[i];
    }

    // 3. currentOverPar: Difference from par
    const currentOverPar = totalStrokes - totalParPlayed;

    // 4. completedHolesCount: Range-based for batch mode
    const completedHolesCount = maxIndex + 1;

    // 5. handicapAllowed: HCP * (Completed Holes / 18)
    const handicapAllowed = Math.round(handicap * (completedHolesCount / 18));

    // 6. netScore & paceStatus
    const netScore = currentOverPar - handicapAllowed;

    let paceStatus: 'BEST' | 'GOOD' | 'WARNING' = 'GOOD';
    if (netScore < 0) paceStatus = 'BEST';
    else if (netScore > 0) paceStatus = 'WARNING';

    return {
        completedHolesCount,
        totalStrokes,
        totalParPlayed,
        currentOverPar,
        handicapAllowed,
        netScore,
        paceStatus
    };
}

/**
 * useGolfScore
 * Centralized golf scoring hook for reactive updates.
 */
export function useGolfScore(
    scores: (number | null)[],
    pars: number[],
    handicap: number,
    currentHole: number = 17
): GolfScoreResult {
    return useMemo(() => calculateGolfScore(scores, pars, handicap, currentHole), [scores, pars, handicap, currentHole]);
}
