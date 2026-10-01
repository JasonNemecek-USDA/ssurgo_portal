export function getNetworkDownloadConcurrencyCap(areaCount) {
  const normalizedAreaCount = Number.isFinite(areaCount)
    ? Math.max(0, Math.floor(areaCount))
    : 0;

  if (normalizedAreaCount >= 1_000) {
    return 2;
  }

  if (normalizedAreaCount >= 100) {
    return 4;
  }

  return Number.POSITIVE_INFINITY;
}