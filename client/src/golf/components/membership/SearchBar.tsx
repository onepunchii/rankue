import { useState, useEffect } from "react";
import { LucideSearch } from "lucide-react";

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}

export function SearchBar({ value: externalValue, onChange, placeholder }: SearchBarProps) {
    const [localValue, setLocalValue] = useState(externalValue);

    useEffect(() => {
        setLocalValue(externalValue);
    }, [externalValue]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localValue !== externalValue) {
                onChange(localValue);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [localValue, externalValue, onChange]);

    return (
        <div className="relative">
            <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input
                type="text"
                value={localValue}
                onChange={(e) => setLocalValue(e.target.value)}
                placeholder={placeholder}
                className="w-full h-12 bg-[#18181b] border border-white/10 rounded-2xl pl-12 pr-4 text-sm focus:border-[#64DD17] outline-none transition-colors placeholder:text-white/20"
            />
        </div>
    );
}
