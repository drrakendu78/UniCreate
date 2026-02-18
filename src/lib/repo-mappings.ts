/**
 * Personal repo → package mappings.
 * Reads from VITE_REPO_MAPPINGS in .env.local (not pushed to git).
 *
 * Format in .env.local:
 *   VITE_REPO_MAPPINGS=owner/repo:PackageIdentifier:Package Name,owner2/repo2:Id2:Name2
 *
 * Example:
 *   VITE_REPO_MAPPINGS=myuser/myrepo:MyUser.MyApp:My App Name
 */

interface RepoMapping {
  packageIdentifier: string;
  packageName: string;
}

function parseMappings(): Record<string, RepoMapping> {
  const raw = import.meta.env.VITE_REPO_MAPPINGS as string | undefined;
  if (!raw) return {};

  const result: Record<string, RepoMapping> = {};
  for (const entry of raw.split(",")) {
    const parts = entry.trim().split(":");
    if (parts.length >= 3) {
      const key = parts[0].toLowerCase();
      result[key] = {
        packageIdentifier: parts[1],
        packageName: parts.slice(2).join(":"),
      };
    }
  }
  return result;
}

export const repoMappings = parseMappings();
