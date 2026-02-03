import { useState, useEffect } from 'react';
import { COURSES } from "@/golf/data/golfCourses";

export function useSavedImages() {
    const [savedImages, setSavedImages] = useState<Record<number, string>>({});

    useEffect(() => {
        const images: Record<number, string> = {};
        COURSES.forEach(c => {
            const saved = localStorage.getItem(`course-${c.id}-image`);
            if (saved) images[c.id] = saved;
        });
        setSavedImages(images);
    }, []);

    return savedImages;
}
