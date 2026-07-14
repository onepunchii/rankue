import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { LucideCheck, LucideMapPin, LucideChevronsUpDown } from "@/lib/icons";

import { COURSES } from "@/golf/data/golfCourses";

// Transform real data to match component structure
const GOLF_COURSES = COURSES.map(course => ({
    value: course.id.toString(), // Unique ID
    label: course.name,          // Display Name
    address: course.address      // Additional Info
}));

interface LocationSearchProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export function LocationSearch({ value, onChange, placeholder = "참여 골프장을 검색하세요", className }: LocationSearchProps) {
    const [open, setOpen] = useState(false);

    // Find selected course object if value exists
    const selectedCourse = useMemo(() =>
        GOLF_COURSES.find((course) => course.label === value),
        [value]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        "w-full justify-between h-12 bg-transparent border-b border-t-0 border-x-0 border-black/10 rounded-none px-1 text-sm font-normal hover:bg-transparent hover:text-ink-1",
                        !value && "text-black/40",
                        className
                    )}
                >
                    {value ? (
                        <span className="flex items-center gap-2 truncate">
                            <LucideMapPin className="w-4 h-4 text-brand" />
                            {value}
                        </span>
                    ) : (
                        <span>{placeholder}</span>
                    )}
                    <LucideChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border-black/10 text-ink-1 rounded-card">
                <Command className="bg-white text-ink-1 rounded-card">
                    <CommandInput placeholder="골프장 이름 검색..." className="h-11 border-none focus:ring-0" />
                    <CommandList>
                        <CommandEmpty className="py-4 text-center text-xs text-ink-3">검색 결과가 없습니다.</CommandEmpty>
                        <CommandGroup>
                            {GOLF_COURSES.map((course) => (
                                <CommandItem
                                    key={course.value}
                                    value={course.label}
                                    onSelect={(currentValue) => {
                                        // Set the clean label as the value
                                        onChange(course.label);
                                        setOpen(false);
                                    }}
                                    className="text-ink-1 rounded-xl aria-selected:bg-brand/15 data-[selected=true]:bg-brand/15 cursor-pointer py-3"
                                >
                                    <LucideCheck
                                        className={cn(
                                            "mr-2 h-4 w-4 text-brand",
                                            value === course.label ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col gap-0.5">
                                        <span className="font-semibold text-sm text-ink-1">{course.label}</span>
                                        <span className="text-xs text-ink-3">{course.address}</span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
