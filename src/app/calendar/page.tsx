import ViewerApp from "../viewer-app";
import { getAppVersion } from "@/lib/app-version";

export default function CalendarPage() {
  return <ViewerApp appVersion={getAppVersion()} initialView="calendar" />;
}
