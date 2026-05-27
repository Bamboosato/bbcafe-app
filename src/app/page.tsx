import ViewerApp from "./viewer-app";
import { getAppVersion } from "@/lib/app-version";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default function Page() {
  return <ViewerApp appVersion={getAppVersion()} />;
}
