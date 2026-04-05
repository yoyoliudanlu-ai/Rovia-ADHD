export const SQUEEZE_RAW_MAX = 4095;
export const DEFAULT_PET_SCALE = 1;
export const MAX_PET_SCALE = 1.35;
export const SQUEEZE_RAW_IDLE_THRESHOLD = 500;
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
  if (raw < SQUEEZE_RAW_IDLE_THRESHOLD) {
    return DEFAULT_PET_SCALE;
  }

  const activeRange = SQUEEZE_RAW_MAX - SQUEEZE_RAW_IDLE_THRESHOLD;
  if (activeRange <= 0) {
    return DEFAULT_PET_SCALE;
  }

  const ratio = (raw - SQUEEZE_RAW_IDLE_THRESHOLD) / activeRange;
  return Math.round((DEFAULT_PET_SCALE + ratio * (MAX_PET_SCALE - DEFAULT_PET_SCALE)) * 1000) / 1000;
}

export function resolveSqueezeScaleTarget({
  pressureRaw,
  nowMs,
  lastChangedAt
} = {}) {
  const numericNowMs = Number(nowMs);
  const numericLastChangedAt = Number(lastChangedAt);
  const raw = clampSqueezeRaw(pressureRaw);
  // 无压力数据时保持默认；blob 通过 lerp 平滑过渡
  if (raw === null) {
    return DEFAULT_PET_SCALE;
  }
  // 压力低于阈值时，保持默认尺寸（100%）
  if (raw < SQUEEZE_RAW_IDLE_THRESHOLD) {
    return DEFAULT_PET_SCALE;
  }
  // 压力值长时间不变化：回落默认大小，避免一直保持放大状态。
  if (
    Number.isFinite(numericNowMs) &&
    Number.isFinite(numericLastChangedAt) &&
    numericNowMs - numericLastChangedAt > SQUEEZE_SCALE_RETURN_MS
  ) {
    return DEFAULT_PET_SCALE;
  }
  // 压力在持续变化：按当前压力值映射大小。
  return mapSqueezeRawToScale(raw);
}
