import { format, isMatch, parse } from "date-fns";

export function formatDate(dateStr: string | Date): string {
  if (typeof dateStr !== "string") {
    dateStr = dateStr.toISOString();
  }

  let date = new Date();

  if (isMatch(dateStr, "yyyy-MM-dd HH:mm xx")) {
    // 2020-09-09 09:30 -0500
    date = parse(dateStr, "yyyy-MM-dd HH:mm xx", new Date());
  } else if (isMatch(dateStr, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx")) {
    // 2006-10-17T16:43:00.000+10:00
    date = parse(dateStr, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx", new Date());
  } else if (isMatch(dateStr, "yyyy-MM-dd'T'HH:mm:ss.SSSX")) {
    // 2007-06-19T23:43:00.000Z
    date = parse(dateStr, "yyyy-MM-dd'T'HH:mm:ss.SSSX", new Date());
  } else {
    console.warn(`Unknown date format for string: ${dateStr}`);
  }

  // September 9, 2020
  return format(date, "MMMM d, yyyy");
}
