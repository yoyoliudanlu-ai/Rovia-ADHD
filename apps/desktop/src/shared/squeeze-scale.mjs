export const SQUEEZE_RAW_MAX = 4095;
export const DEFAULT_PET_SCALE = 1;
export const MAX_PET_SCALE = 1.35;
export const SQUEEZE_SCALE_RETURN_MS = 400;

export function clampSqueezeRaw(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.min(SQUEEZE_RAW_MAX, Math.max(0, Math.round(numeric)));
}

export function mapSqueezeRawToScale(value) {
  const raw = clampSqueezeRaw(value);
  if (raw === null) {
    return DEFAULT_PET_SCALE;
  }

  const ratio = raw / SQUEEZE_RAW_MAX;
  return Math.round((DEFAULT_PET_SCALE + ratio * (MAX_PET_SCALE - DEFAULT_PET_SCALE)) * 1000) / 1000;
}

export function resolveSqueezeScaleTarget({
  pressureRaw,
  lastChangedAt = 0,
  nowMs = 0
} = {}) {
  const raw = clampSqueezeRaw(pressureRaw);
  if (raw === null || raw <= 0) {
    return DEFAULT_PET_SCALE;
  }

  if (Number(nowMs) - Number(lastChangedAt) > SQUEEZE_SCALE_RETURN_MS) {
    return DEFAULT_PET_SCALE;
  }

  return mapSqueezeRawToScale(raw);
}
