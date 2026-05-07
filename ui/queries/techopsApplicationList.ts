// Loads the central TechOps application taxonomy. Cached at app init.
// Verbatim from AGENTS.md §240.
export function techopsApplicationListQuery(): string {
  return `load "/lookups/techops/techopsApplicationList"
| filterOut AppCI == "AppCI"
| fields AppCI, ApplicationName, Tier, Director`;
}
