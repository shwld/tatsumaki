export const formatDeadline = (iso: string, language: string): string =>
  new Intl.DateTimeFormat(language === "en" ? "en-US" : "ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
