import { bingAdapter } from "./bing";
import { braveAdapter } from "./brave";
import { duckDuckGoAdapter } from "./duckduckgo";
import { googleAdapter } from "./google";
import type { SearchAdapter, SearchEngine } from "../types";

export const adapters: Record<SearchEngine, SearchAdapter> = {
  duckduckgo: duckDuckGoAdapter,
  bing: bingAdapter,
  google: googleAdapter,
  brave: braveAdapter,
};
