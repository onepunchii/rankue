import { getLocale } from "./i18n";
import {
  QueryClient,
  QueryFunction,
  QueryKey,
} from "@tanstack/react-query";
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

// 2. (삭제됨 2026-09-30) Supabase 토큰 — 슈파베이스 프로젝트는 지워졌고(도메인도 사라졌다) 서버는
//    서명 쿠키 hiq_user_id 만 믿는다(server/middleware/auth.ts). 매 요청마다 죽은 SDK 세션을 2초 타임아웃으로
//    기다리며 Authorization 헤더를 붙이던 흔적이라 걷어냈다.

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

  const headers: Record<string, string> = {
    ...options?.headers,
    // 서버가 오류·라벨을 이 언어로 만든다(2026-09-22). 푸시는 GET /me 때 이 값을 회원에 저장해 받는 사람 언어로.
    "x-locale": getLocale(),
  };

  // SaaS 테넌트 식별
  if (typeof window !== "undefined") {
    const searchParams = new URLSearchParams(window.location.search);
    const storeSlug = searchParams.get("store") || "hiq";
    headers["x-store-slug"] = storeSlug;
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

  try {
    return await apiRequest(url, { method: "GET", signal });
  } catch (e) {
    // 로그인 확인(/api/hiq/me)의 401 은 '오류'가 아니라 '비로그인'이라는 **답**이다 — null 로 돌려 성공으로 둔다(2026-10-01).
    // 오류로 두면 데이터가 없는 채라, 새 화면(하단 탭 등)이 붙을 때마다 다시 묻고 그동안 상태가 '로딩'으로 되돌아갔다 —
    // 비로그인 홈이 로딩 ↔ 로그인 안내를 끝없이 오가며 방문자 한 명이 몇 초에 수백 번 /me 를 불렀다(오너 제보, 실측 227회).
    if (url === "/api/hiq/me" && (e as { status?: number } | null)?.status === 401) return null as T;
    throw e;
  }
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
    // v2.4: /api/hiq/me 에 golfAccess 가 생겼다 — 옛 캐시엔 없어서 배포 직후 골프 화면이 튕겼다(2026-09-11).
    // v2.5: 알림 목록 응답이 배열 → { items, nextBefore } 로 바뀌었다(2026-09-23). 옛 캐시가 남으면 첫 렌더에 '더 보기'가 없다.
    // v2.6: 진행 중(pending)·실패한 요청까지 저장하고 있었다 — 진행 중 요청의 promise 가 JSON 으로 '{}' 가 되어 다음 실행에
    //   복원하다 "t.then is not a function" 으로 터졌다(오류 수집 30일 65건, 2026-10-01). 이제 성공한 것만 저장하고 옛 캐시는 버린다.
    buster: "RANKUE_CACHE_v2.6",
    // 진행 중 경기 행은 절대 영속화하지 않는다. 7일짜리 localStorage 스냅샷이
    // 앱 재실행 때 점수판에 먼저 하이드레이션되고, 점수판은 그 낡은 점수를 서버에
    // 다시 PATCH 해서 실제 진행 상황을 되돌렸다(예: 8이닝 친 경기가 0:0 으로).
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => {
        if (query.state.status !== "success") return false;
        const key = String(query.queryKey[0] ?? "");
        // 비로그인 답(null)은 저장하지 않는다 — 다음 실행에 '로그인 안 됨'이 먼저 그려지면 안 된다
        if (key === "/api/hiq/me" && query.state.data == null) return false;
        return !key.startsWith("/api/hiq/game/");
      },
    },
  });
}
