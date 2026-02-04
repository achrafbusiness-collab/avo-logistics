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
    if (baseUrl && url.startsWith(baseUrl) && url.includes("/rest/v1/")) {
      const nextInit = { ...(init || {}) };
      let path = "";
      try {
        const parsed = new URL(url);
        path = `${parsed.pathname}${parsed.search || ""}`;
      } catch {
        path = url.replace(baseUrl, "");
      }
      const headers = new Headers(nextInit.headers || (input?.headers ?? undefined));
      headers.set("x-supabase-path", path);
      nextInit.headers = headers;
      return fetch("/api/supabase-rest", nextInit);
    }
    return fetch(input, init);
  };
};

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  global: {
    fetch: createFetchWithProxy(),
  },
});
