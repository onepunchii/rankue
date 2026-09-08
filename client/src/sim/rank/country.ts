/** 국가(ISO 3166-1 alpha-2) — 기기 언어에서 추정하고, 랭킹 화면에서 본인이 바꾼다. 이름은 Intl.DisplayNames(없으면 코드). */
export const COUNTRY_OPTIONS: readonly string[] = [
    "KR", "US", "MX", "CO", "AR", "PE", "CL", "BR", "EC", "VE", "GT", "DO", "CR", "PA", "UY", "BO", "PY", "HN", "SV", "NI", "CU", "PR",
    "ES", "TR", "VN", "JP", "CN", "TW", "PH", "TH", "ID", "MY", "SG", "IN", "DE", "FR", "GB", "IT", "NL", "BE", "PT", "CA", "AU", "EG", "AE",
];

export function isCountryCode(v: unknown): v is string {
    return typeof v === "string" && /^[A-Z]{2}$/.test(v);
}

/** 기기 언어 태그의 지역("es-MX" → "MX"). 지역이 없으면 null. */
export function guessCountry(language: string | undefined = typeof navigator !== "undefined" ? navigator.language : undefined): string | null {
    if (!language) return null;
    const m = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2})(?:-|$)/i.exec(language);
    if (!m) return null;
    const code = m[1].toUpperCase();
    return isCountryCode(code) ? code : null;
}

export function countryName(code: string | null, locale: string): string {
    if (!code) return "";
    try {
        const dn = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames([locale], { type: "region" }) : null;
        return dn?.of(code) ?? code;
    } catch {
        return code;
    }
}
