import packageJson from "../../package.json";

export function getAppVersion() {
  return (
    getPackageVersion() ||
    process.env.NEXT_PUBLIC_APP_VERSION?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    "local"
  );
}

export function getPackageVersion() {
  return packageJson.version;
}
