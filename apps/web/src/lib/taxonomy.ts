import { useQuery } from "@tanstack/react-query";

import { api } from "./api";

interface TaxonomyItem {
  slug: string;
  name: string;
  documents: number;
}

export interface Collection extends TaxonomyItem {
  description: string;
}

function useTaxonomy<T extends TaxonomyItem>(queryKey: string, path: string) {
  const query = useQuery<T[]>({ queryKey: [queryKey], queryFn: () => api.get(path) });
  const items = query.data ?? [];
  return {
    items,
    isLoading: query.isLoading,
    options: items.map((i) => ({ value: i.slug, label: i.name })),
    label: (slug: string) => items.find((i) => i.slug === slug)?.name ?? slug,
  };
}

/** Knowledge areas — what a document is about. */
export function useCollections() {
  return useTaxonomy<Collection>("collections", "/collections");
}

/** Document kinds — what a document is. */
export function useDocKinds() {
  return useTaxonomy<TaxonomyItem>("doc-kinds", "/doc-kinds");
}
