import { format, parseISO } from "date-fns";

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;

  // September 9, 2020
  return format(d, "MMMM d, yyyy");
}
