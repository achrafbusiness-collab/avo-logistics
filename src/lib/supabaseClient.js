import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

const resolveUrlString = (input) => {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof input?.url === "string") return input.url;
  return "";
};

const createFetchWithProxy = () => {
  const baseUrl = (supabaseUrl || "").replace(/\/$/, "");
  return async (input, init) => {
    const url = resolveUrlString(input);
    if (baseUrl && url.startsWith(baseUrl) && url.includes("/auth/v1/user")) {
      return fetch("/api/auth-user", init);
    }
    if (baseUrl && url.startsWith(baseUrl) && url.includes("/auth/v1/token?grant_type=")) {
      try {
        const grantType = new URL(url).searchParams.get("grant_type") || "";
        const suffix = grantType ? `?grant_type=${encodeURIComponent(grantType)}` : "";
        return fetch(`/api/auth-token${suffix}`, init);
      } catch {
        return fetch("/api/auth-token", init);
      }
    }
    return fetch(input, init);
  };
};

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  global: {
    fetch: createFetchWithProxy(),
  },
});
