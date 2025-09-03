import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs };

export function nowIn(tz = process.env.TIMEZONE || "Asia/Tokyo") {
  return dayjs().tz(tz);
}

