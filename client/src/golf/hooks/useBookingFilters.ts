import { useState, useCallback } from 'react';

export const useBookingFilters = () => {
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
        region: [],
        price: [],
        special: [],
        time: ['all']
    });

    const toggleFilter = useCallback((category: string, id: string) => {
        setSelectedFilters(prev => {
            const current = prev[category] || [];
            const updated = current.includes(id)
                ? current.filter(item => item !== id)
                : [...current, id];

            if (category === 'time') {
                if (id === 'all') return { ...prev, [category]: ['all'] };
                const newTime = updated.filter(x => x !== 'all');
                return { ...prev, [category]: newTime.length === 0 ? ['all'] : newTime };
            }

            return { ...prev, [category]: updated };
        });
    }, []);

    const clearFilter = useCallback((category: string) => {
        setSelectedFilters(prev => ({
            ...prev,
            [category]: category === 'time' ? ['all'] : []
        }));
    }, []);

    return {
        selectedFilters,
        toggleFilter,
        clearFilter
    };
};
