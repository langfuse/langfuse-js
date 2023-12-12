import { getEnv } from "./utils";

const common_release_envs = [
  // Vercel
  "VERCEL_GIT_COMMIT_SHA",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  // Netlify
  "COMMIT_REF",
  // Render
  "RENDER_GIT_COMMIT",
  // GitLab CI
  "CI_COMMIT_SHA",
  // CicleCI
  "CIRCLE_SHA1",
  // Cloudflare pages
  "CF_PAGES_COMMIT_SHA",
  // AWS Amplify
  "REACT_APP_GIT_SHA",
  // Heroku
  "SOURCE_VERSION",
] as const;

export function getCommonReleaseEnvs(): string | undefined {
  for (const key of common_release_envs) {
    const value = getEnv(key);
    if (value) {
      return value;
    }
  }
  return undefined;
}
