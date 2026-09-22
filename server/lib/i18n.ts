/**
 * 서버 문구의 언어(2026-09-22 오너: "알림·오류 i18n 중요"). 화면은 이미 5개 언어인데 서버가 만드는 오류 메시지·푸시·시스템
 * 메시지는 전부 한국어라 외국인에게도 한국어로 갔다.
 *
 *  - 요청 언어: 화면이 모든 요청에 `x-locale` 헤더를 실어 보낸다 → localeMiddleware 가 res.locals.locale 에 둔다.
 *    오류 메시지(sendError·AppError)는 이걸로 고른다.
 *  - 받는 사람 언어: 푸시는 **받는 사람**의 언어라 hiq_members.locale(GET /me 때 헤더로 갱신)로 고른다.
 *  - 문구는 shared/i18n/<locale>.ts. 키가 없으면 한국어, 그것도 없으면 키 그대로.
 *  - 호출부는 `msg("err.x", { n })` 또는 자리표시자 없는 키 문자열 그대로. sendError·AppError·notificationService 가 알아서 푼다.
 */
import type { Response } from "express";
import { ko } from "../../shared/i18n/ko.js";
import { en } from "../../shared/i18n/en.js";
import { es } from "../../shared/i18n/es.js";
import { tr as trDict } from "../../shared/i18n/tr.js";
import { vi } from "../../shared/i18n/vi.js";

export type Locale = "ko" | "en" | "vi" | "tr" | "es";
export const LOCALES: readonly Locale[] = ["ko", "en", "vi", "tr", "es"];
const DICTS: Record<Locale, Record<string, string>> = { ko, en, es, tr: trDict, vi };

/** 사용자에게 보일 문구를 언어와 무관하게 들고 다니는 꼴 — 보낼 때(받는 사람 언어로) 푼다. */
export interface I18nText { key: string; params?: Record<string, string | number | null | undefined> }
export const msg = (key: string, params?: I18nText["params"]): I18nText => ({ key, params });

/** "err.golf.full" 처럼 생긴 문자열은 키로 본다(사전에 있을 때만). 사람이 읽는 문장은 점으로 끝나도 공백·한글이 있어 안 걸린다. */
const KEY_RE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/;
export const isKey = (s: string): boolean => KEY_RE.test(s) && s in ko;

export function normalizeLocale(v: unknown): Locale {
    const s = String(v ?? "").toLowerCase().slice(0, 2);
    return (LOCALES as readonly string[]).includes(s) ? (s as Locale) : "ko";
}

export function tr(locale: Locale, key: string, params?: I18nText["params"]): string {
    const raw = DICTS[locale]?.[key] ?? ko[key] ?? key;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined || params[k] === null ? m : String(params[k])));
}

/** 문자열이면 키일 때만 번역하고 아니면 그대로, I18nText 면 푼다. */
export function render(locale: Locale, text: string | I18nText): string {
    if (typeof text === "string") return isKey(text) ? tr(locale, text) : text;
    return tr(locale, text.key, text.params);
}

export const localeOf = (res: Response): Locale => normalizeLocale(res.locals?.locale);
export const trRes = (res: Response, key: string, params?: I18nText["params"]): string => tr(localeOf(res), key, params);

/** 회원 행에서 언어를 읽는다(열이 없던 옛 행·게스트는 한국어). */
export const memberLocale = (member: { locale?: string | null } | null | undefined): Locale => normalizeLocale(member?.locale ?? "ko");
