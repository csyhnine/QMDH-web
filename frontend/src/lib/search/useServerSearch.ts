import { useEffect, useState } from "react";

import { api } from "../../api";

type SearchDomain = "inspiration" | "templates";

type SearchState = {
  domain: SearchDomain;
  query: string;
  matchIds: number[] | null;
  engine: string | null;
  isSearching: boolean;
};

export function useServerSearch(domain: SearchDomain, query: string) {
  const trimmedQuery = query.trim();
  const [state, setState] = useState<SearchState>({
    domain, query: trimmedQuery, matchIds: null, engine: null, isSearching: false,
  });

  useEffect(() => {
    let active = true;
    setState({ domain, query: trimmedQuery, matchIds: null, engine: null, isSearching: false });
    if (!trimmedQuery) {
      return () => { active = false; };
    }

    const updateCurrent = (update: (current: SearchState) => SearchState) => {
      if (!active) return;
      setState((current) => active ? update(current) : current);
    };
    const timer = window.setTimeout(() => {
      if (!active) return;
      updateCurrent((current) => ({ ...current, isSearching: true }));
      api
        .search({ q: trimmedQuery, domain, limit: 50 })
        .then((result) => {
          if (!active) return;
          const matchIds = result.hits.map((hit) => hit.id);
          const engine = result.engine;
          updateCurrent((current) => ({ ...current, matchIds, engine }));
        })
        .catch(() => {
          updateCurrent((current) => ({ ...current, matchIds: null, engine: null }));
        })
        .finally(() => updateCurrent((current) => ({ ...current, isSearching: false })));
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [domain, trimmedQuery]);

  const isCurrent = state.domain === domain && state.query === trimmedQuery;
  const matchIds = isCurrent ? state.matchIds : null;
  const engine = isCurrent ? state.engine : null;
  const isSearching = isCurrent && state.isSearching;

  return {
    trimmedQuery,
    matchIds,
    engine,
    isSearching,
    usingServerSearch: Boolean(trimmedQuery && matchIds),
  };
}
