export function normalizeProjectId(projectId: string): string {
  return projectId.trim().toLowerCase();
}

export function splitProjectId(projectId: string): {
  baseId: string;
  suffix: string;
} {
  const normalized = normalizeProjectId(projectId);
  const match = normalized.match(/^(\d{4})([a-z]+)?$/);
  if (!match) {
    return { baseId: normalized, suffix: "" };
  }
  return { baseId: match[1], suffix: match[2] ?? "" };
}

export function getSpecIdCandidates(projectId: string): string[] {
  const normalized = normalizeProjectId(projectId);
  const { baseId, suffix } = splitProjectId(projectId);
  const candidates = [normalized];
  if (suffix && baseId !== normalized) {
    candidates.push(baseId);
  }
  return candidates;
}

export function applyProjectSuffixToSpecName(
  specName: string,
  projectId: string
): string {
  const { baseId, suffix } = splitProjectId(projectId);
  if (!suffix) {
    return specName;
  }
  const prefix = `${baseId}-`;
  if (specName.toLowerCase().startsWith(prefix)) {
    return `${baseId}${suffix}-${specName.slice(prefix.length)}`;
  }
  return specName;
}
