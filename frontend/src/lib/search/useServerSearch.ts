import { useEffect, useState } from "react";

import { api } from "../../api";

type SearchDomain = "inspiration" | "templates";

export function useServerSearch(domain: SearchDomain, query: string) {
  const trimmedQuery = query.trim();
  const [matchIds, setMatchIds] = useState<number[] | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!trimmedQuery) {
      setMatchIds(null);
      setEngine(null);
      setIsSearching(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setIsSearching(true);
      api
        .search({ q: trimmedQuery, domain, limit: 50 })
        .then((result) => {
          setMatchIds(result.hits.map((hit) => hit.id));
          setEngine(result.engine);
        })
        .catch(() => {
          setMatchIds(null);
          setEngine(null);
        })
        .finally(() => setIsSearching(false));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [domain, trimmedQuery]);

  return {
    trimmedQuery,
    matchIds,
    engine,
    isSearching,
    usingServerSearch: Boolean(trimmedQuery && matchIds),
  };
}
