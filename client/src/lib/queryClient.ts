import {
  QueryClient,
  QueryFunction,
  QueryKey,
} from "@tanstack/react-query";
import { supabase } from "./supabase";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// 1. 커스텀 에러 라이브러리 (타입 안전성)
export class ApiError extends Error {
  status: number;
  data: any;
  needsAuth?: boolean;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.needsAuth = data?.needsAuth;
  }
}

// 2. Supabase 토큰 획득 (안정성 및 하이브리드 환경 최적화)
async function getSupabaseToken(): Promise<string | null> {
  try {
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 2000)
    );

    const { data } = (await Promise.race([
      sessionPromise,
      timeoutPromise,
    ])) as any;

    const token = data?.session?.access_token;
    if (token) return token;
  } catch (e) {
    // Timeout or SDK error
  }

  // Fallback: 하이브리드 앱 환경에서 SDK 지연 시 직접 로컬스토리지 참조
  if (typeof window !== "undefined") {
    try {
      const authKey = Object.keys(localStorage).find(
        (key) => key.startsWith("sb-") && key.includes("auth-token")
      );
      if (authKey) {
        const sessionData = JSON.parse(localStorage.getItem(authKey) || "{}");
        return sessionData.access_token || null;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

// 3. 통합 API 요청 함수 (DRY 원칙 적용)
export async function apiRequest(
  url: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  }
): Promise<any> {
  const method = options?.method || "GET";
  const supabaseToken = await getSupabaseToken();

  const headers: Record<string, string> = {
    ...options?.headers,
  };

  // SaaS 테넌트 식별
  if (typeof window !== "undefined") {
    const searchParams = new URLSearchParams(window.location.search);
    const storeSlug = searchParams.get("store") || "hiq";
    headers["x-store-slug"] = storeSlug;
  }

  if (supabaseToken) {
    headers["Authorization"] = `Bearer ${supabaseToken}`;
  }

  let finalBody: any = options?.body;
  if (finalBody !== undefined && !(finalBody instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    if (typeof finalBody !== "string") {
      finalBody = JSON.stringify(finalBody);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  // React Query의 중단(signal) 연동
  if (options?.signal) {
    options.signal.addEventListener("abort", () => {
      clearTimeout(timeoutId);
      controller.abort();
    });
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: finalBody,
      credentials: "include",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorData;
      try {
        const text = await res.text();
        const trimmed = text.trim();
        // Parse any JSON body (objects OR arrays, ignoring leading whitespace) so structured
        // error fields like `message` / `needsAuth` survive; fall back to raw text otherwise.
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          const parsed = JSON.parse(trimmed);
          errorData = Array.isArray(parsed) ? { message: parsed[0]?.message || text } : parsed;
        } else {
          errorData = { message: text || res.statusText };
        }
      } catch {
        errorData = { message: res.statusText };
      }
      throw new ApiError(errorData.message || `HTTP ${res.status}`, res.status, errorData);
    }

    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const json = await res.json();
      // { success: true, data: ... } 구조 언랩핑
      if (json && typeof json === "object" && "success" in json && "data" in json) {
        return json.data;
      }
      return json;
    }
    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as any).name === "AbortError") {
      console.warn(`[apiRequest] Request aborted: ${url}`);
    } else {
      console.error(`[apiRequest] Error: ${url}`, error);
    }
    throw error;
  }
}

// 4. Query Function (호환성을 고려한 파싱)
export const getQueryFn = <T>(): QueryFunction<T> => async ({ queryKey, signal }) => {
  let url = "";
  const queryParams = new URLSearchParams();

  if (Array.isArray(queryKey)) {
    const segments: string[] = [];
    for (const item of queryKey) {
      if (typeof item === "object" && item !== null) {
        Object.entries(item).forEach(([k, v]) => {
          if (v !== undefined && v !== null) queryParams.append(k, String(v));
        });
      } else {
        segments.push(String(item));
      }
    }
    // 각 세그먼트의 앞뒤 슬래시 정리 후 결합 (http:// 등 프로토콜 보존)
    url = segments
      .filter(Boolean)
      .map((s, i) => {
        const str = String(s);
        // 첫 번째 세그먼트가 프로토콜(http)을 포함하면 뒤쪽 슬래시만 제거, 아니면 앞뒤 모두 제거
        return i === 0 && str.includes("://")
          ? str.replace(/\/+$/, "")
          : str.replace(/^\/+|\/+$/g, "");
      })
      .join("/");

    // 상대 경로(/) 시작 보존
    if (String(segments[0] || "").startsWith("/") && !url.startsWith("/")) {
      url = "/" + url;
    }
  } else {
    url = String(queryKey);
  }

  const queryString = queryParams.toString();
  if (queryString) {
    url += (url.includes("?") ? "&" : "?") + queryString;
  }

  return apiRequest(url, { method: "GET", signal });
};

// 5. QueryClient 설정
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn(),
      staleTime: 1000 * 60 * 5, // 5분
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: false,
    },
  },
});

// 6. Persistence (Cache Buster v2.2)
if (typeof window !== "undefined") {
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
  });

  persistQueryClient({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1주일
    buster: "RANKUE_CACHE_v2.3_FINAL",
  });
}
