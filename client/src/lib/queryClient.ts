import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

// Robust Token Retrieval Helper
async function getSupabaseToken() {
  let token: string | null = null;
  try {
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000));
    const { data } = await Promise.race([sessionPromise, timeoutPromise]) as any;
    token = data?.session?.access_token;
  } catch (e) {
    // console.log("Supabase getSession timeout or error, falling back to storage");
  }

  if (!token && typeof window !== 'undefined' && window.localStorage) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.includes('auth-token')) {
        try {
          const sessionData = JSON.parse(localStorage.getItem(key) || '{}');
          token = sessionData.access_token;
          if (token) break;
        } catch (e) { }
      }
    }
  }
  return token;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorData;
    try {
      const text = await res.text();
      errorData = text ? JSON.parse(text) : { message: res.statusText };
    } catch {
      errorData = { message: res.statusText };
    }

    const error = new Error(errorData.message || errorData.error || `HTTP ${res.status}`);
    (error as any).status = res.status;
    (error as any).response = {
      data: errorData,
      status: res.status
    };
    (error as any).needsAuth = errorData.needsAuth;
    throw error;
  }
}

export async function apiRequest(
  url: string,
  options?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<any> {
  const method = options?.method || "GET";
  const body = options?.body;

  // Get Supabase session token reliably
  const supabaseToken = await getSupabaseToken();

  // Prepare headers
  const headers: Record<string, string> = {
    ...options?.headers,
  };

  if (supabaseToken) {
    headers['Authorization'] = `Bearer ${supabaseToken}`;
  }

  // Only add Content-Type and stringify body if it's not already a string
  let finalBody: string | undefined = undefined;
  if (body !== undefined) {
    if (typeof body === 'string') {
      finalBody = body;
      headers["Content-Type"] = "application/json";
    } else {
      finalBody = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
  }

  console.log(`[apiRequest] Fetching ${url}...`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: finalBody,
      credentials: "include",
      signal: controller.signal
    });
    console.log(`[apiRequest] Response from ${url}:`, res.status);
    clearTimeout(timeoutId);
    await throwIfResNotOk(res);

    // Return JSON response for successful requests
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await res.json();
    }
    return res;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[apiRequest] Error fetching ${url}:`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      // Get Supabase session token reliably
      const supabaseToken = await getSupabaseToken();

      const headers: Record<string, string> = {};
      if (supabaseToken) {
        headers['Authorization'] = `Bearer ${supabaseToken}`;
      }

      // Handle queryKey joining safely
      const url = Array.isArray(queryKey) ? queryKey.join('/') : String(queryKey);

      const res = await fetch(url, {
        credentials: "include",
        headers,
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
