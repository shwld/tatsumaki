const ARCHIVED_TOKEN = /(?:^|\s)is:archived(?=\s|$)/i;
const ARCHIVED_TOKEN_ALL = new RegExp(ARCHIVED_TOKEN.source, "gi");

export function parseArchivedSearch(query: string): {
  archived: boolean;
  rest: string;
} {
  return {
    archived: ARCHIVED_TOKEN.test(query),
    rest: query.replace(ARCHIVED_TOKEN_ALL, " ").trim(),
  };
}
