import { api } from "@/lib/api";
import { searchAll } from "@/server/services/search";

export const GET = api(async (session, req) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return { hits: await searchAll(session, q) };
});
