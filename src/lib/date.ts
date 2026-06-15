export const LOCAL_TIME_ZONE = "Asia/Kathmandu";
export const SQLITE_LOCALTIME_MODIFIER = "'+5 hours', '+45 minutes'";

export function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LOCAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
