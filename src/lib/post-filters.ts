interface FilterTerm {
  slug: string;
  label: string;
}

interface FilterablePost {
  categories: FilterTerm[];
  eras: FilterTerm[];
}

export function getPostFilterOptions(posts: FilterablePost[]) {
  const unique = (terms: FilterTerm[]) =>
    [...new Map(terms.map((term) => [term.slug, term])).values()].toSorted(
      (a, b) => a.label.localeCompare(b.label),
    );
  return {
    categories: unique(posts.flatMap((post) => post.categories)),
    eras: unique(posts.flatMap((post) => post.eras)),
  };
}

export function matchesPostFilters(
  post: { categories: string[]; eras: string[] },
  category: string,
  era: string,
) {
  return (
    (!category || post.categories.includes(category)) &&
    (!era || post.eras.includes(era))
  );
}

export function setPostFilterParams(url: URL, category: string, era: string) {
  const result = new URL(url);
  for (const [key, value] of [
    ["category", category],
    ["era", era],
  ]) {
    result.searchParams.delete(key);
    if (value) result.searchParams.set(key, value);
  }
  return result;
}
