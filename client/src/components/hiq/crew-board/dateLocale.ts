/**
 * date-fns 로케일을 앱 언어에 맞춘다. 크루 화면은 전부 `locale: ko` 를 박아 둬서 영어·베트남어 화면에서도
 * "3분 전"·"9월 27일 (토)" 가 한국어로 나왔다. 앱 전체에 쓰는 공용 도우미가 아직 없어 크루 폴더에 둔다.
 */
import { useMemo } from "react";
import type { Locale as FnsLocale } from "date-fns";
import { ko, enUS, es, tr, vi } from "date-fns/locale";
import { useT, type Locale } from "@/lib/i18n";

const MAP: Record<Locale, FnsLocale> = { ko, en: enUS, es, tr, vi };

export function dateFnsLocale(l: Locale): FnsLocale {
    return MAP[l] ?? ko;
}

export function useDateLocale(): FnsLocale {
    const { locale } = useT();
    return useMemo(() => dateFnsLocale(locale), [locale]);
}
