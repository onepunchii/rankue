/**
 * Team Generation Logic for RankU
 * Supports GOLF (golfAvgScore) and BILLIARDS (avg4c)
 */

export type SportType = 'GOLF' | 'BILLIARDS';
export type GenderDist = 'random' | 'spread' | 'group';

export interface Participant {
    id: string;
    memberId: string;
    isManual?: boolean;
    member: {
        id: string;
        name: string;
        nickname?: string;
        gender: string;
        profileImageUrl?: string;
        golfAvgScore?: number;
        avg4c?: number;
    };
}

export interface Team {
    id: number;
    name: string;
    color: string;
    members: Participant[];
    avg: number;
}

// Uniform shuffle. `arr.sort(() => Math.random() - 0.5)` is NOT a uniform permutation
// (V8's sort biases elements toward their original positions), which skews "random" teams.
const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

export const generateTeams = (
    participants: Participant[],
    count: number,
    sportType: SportType,
    genderDist: GenderDist,
    isRandom: boolean = false
): Team[] => {
    // 1. Initialize Teams
    const teams: Team[] = Array.from({ length: count }, (_, i) => ({
        id: i,
        name: sportType === 'GOLF' ? `${i + 1}조` : `Team ${String.fromCharCode(65 + i)}`,
        color: ['#10B981', '#3B82F6', '#EF4444', '#F59E0B', '#8B5CF6', '#F97316'][i % 6],
        members: [],
        avg: 0
    }));

    if (participants.length === 0) return teams;

    // Helper to get score based on sport
    const getScore = (p: Participant) => {
        if (sportType === 'GOLF') return p.member?.golfAvgScore || 0;
        return p.member?.avg4c || 0;
    };

    // 2. Random Shuffle Mode
    if (isRandom) {
        const shuffled = shuffle(participants);
        shuffled.forEach((p, i) => {
            teams[i % count].members.push(p);
        });
    } else {
        // 3. Balanced Mode with Gender Consideration
        // Identify females (including manual ones with icon)
        let females = shuffle(participants.filter(p => p.member?.gender === 'F' || p.member?.gender === 'female' || (p.isManual && (p.member.name.includes('♀') || p.member.name.endsWith('여') || p.member.name.includes('(여)')))));
        let males = participants.filter(p => !females.includes(p));

        // Step 1: Distribute Females
        if (genderDist === 'spread') {
            // Spread females across teams
            females.forEach((f, i) => {
                teams[i % count].members.push(f);
            });
        } else if (genderDist === 'group') {
            // Fill teams one by one with females
            let fIdx = 0;
            const totalPerTeam = Math.ceil(participants.length / count);
            for (let i = 0; i < count && fIdx < females.length; i++) {
                while (teams[i].members.length < totalPerTeam && fIdx < females.length) {
                    teams[i].members.push(females[fIdx++]);
                }
            }
            // Any females that didn't fit the per-team cap must still be placed — fold them back
            // into the pool so the snake step below distributes them (previously they vanished).
            if (fIdx < females.length) {
                males = [...males, ...females.slice(fIdx)];
            }
        } else {
            // Random gender distribution within balanced logic - Treat females as part of the pool
            males = [...males, ...females];
            females = [];
        }

        // Step 2: Distribute Remaining (mostly Males) using Snake Algorithm
        const sortedRemaining = males.sort((a, b) => {
            let scoreA = getScore(a);
            let scoreB = getScore(b);

            if (sportType === 'GOLF') {
                // Golf: Lower is better. Treat 0 (unranked) as worst (999) to sort to end
                if (scoreA === 0) scoreA = 999;
                if (scoreB === 0) scoreB = 999;
                return scoreA - scoreB;
            }
            // Billiards: Higher is better. 0 is naturally worst.
            return scoreB - scoreA;
        });

        // Determine distribution order (Snake: 0,1,2,2,1,0...)
        let teamIdx = 0;
        let direction = 1;

        sortedRemaining.forEach((p) => {
            // Pick based on snake index
            teams[teamIdx].members.push(p);

            // Move to next team index following snake pattern
            if (direction === 1) {
                if (teamIdx === count - 1) {
                    direction = -1; // Change direction at the end
                } else {
                    teamIdx++;
                }
            } else {
                if (teamIdx === 0) {
                    direction = 1; // Change direction at the beginning
                } else {
                    teamIdx--;
                }
            }
        });
    }

    // 4. Calculate Final Averages
    teams.forEach(t => {
        const scores = t.members.map(m => getScore(m)).filter(s => s > 0);
        if (scores.length > 0) {
            t.avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        }
    });

    // Re-sort teams by their original ID to keep UI stable
    return teams.sort((a, b) => a.id - b.id);
};

export const getSportTerminology = (sportType: SportType) => {
    return {
        teamLabel: sportType === 'GOLF' ? '조' : '팀',
        scoreLabel: sportType === 'GOLF' ? '핸디' : '점수',
        avgLabel: sportType === 'GOLF' ? '평균 핸디' : '평균 점수',
        emoji: sportType === 'GOLF' ? '⛳️' : '🎱',
        scoreField: sportType === 'GOLF' ? 'golfAvgScore' : 'avg4c',
        unit: sportType === 'GOLF' ? '타' : '점'
    };
};
