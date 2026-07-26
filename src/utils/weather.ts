/**
 * @file src/utils/weather.ts
 * @description WMO 날씨 코드 → 한글 라벨 · 아이콘 · 심각도.
 *
 * Open-Meteo 의 `weather_code` 는 WMO 4677 표준입니다.
 * 서핑 앱에서는 "비가 오는가 / 시야가 어떤가" 정도면 충분하므로 그룹으로 묶었습니다.
 * (원문 표: https://open-meteo.com/en/docs 의 WMO Weather interpretation codes)
 */

import {
  Sun,
  CloudSun,
  Cloud,
  Cloudy,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  type LucideIcon,
} from 'lucide-react';

export interface WeatherMeta {
  label: string;
  Icon: LucideIcon;
  /** 아이콘 색 토큰 */
  colorVar: string;
  /** 강수 계열인가 — 배지를 강조할지 판단용 */
  wet: boolean;
}

const CLEAR: WeatherMeta = { label: '맑음', Icon: Sun, colorVar: 'var(--fair-fill)', wet: false };
const MOSTLY_CLEAR: WeatherMeta = { label: '대체로 맑음', Icon: CloudSun, colorVar: 'var(--fair-fill)', wet: false };
const PARTLY: WeatherMeta = { label: '구름 조금', Icon: CloudSun, colorVar: 'var(--ink-3)', wet: false };
const OVERCAST: WeatherMeta = { label: '흐림', Icon: Cloudy, colorVar: 'var(--ink-3)', wet: false };
const FOG: WeatherMeta = { label: '안개', Icon: CloudFog, colorVar: 'var(--ink-3)', wet: false };
const DRIZZLE: WeatherMeta = { label: '이슬비', Icon: CloudDrizzle, colorVar: 'var(--tide)', wet: true };
const RAIN: WeatherMeta = { label: '비', Icon: CloudRain, colorVar: 'var(--tide)', wet: true };
const SHOWER: WeatherMeta = { label: '소나기', Icon: CloudRain, colorVar: 'var(--tide)', wet: true };
const SNOW: WeatherMeta = { label: '눈', Icon: CloudSnow, colorVar: 'var(--tide)', wet: true };
const THUNDER: WeatherMeta = { label: '뇌우', Icon: CloudLightning, colorVar: 'var(--poor-fill)', wet: true };
const UNKNOWN: WeatherMeta = { label: '—', Icon: Cloud, colorVar: 'var(--ink-mark)', wet: false };

export function weatherMeta(code: number | undefined | null): WeatherMeta {
  if (code === undefined || code === null) return UNKNOWN;
  if (code === 0) return CLEAR;
  if (code === 1) return MOSTLY_CLEAR;
  if (code === 2) return PARTLY;
  if (code === 3) return OVERCAST;
  if (code === 45 || code === 48) return FOG;
  if (code >= 51 && code <= 57) return DRIZZLE;
  if (code >= 61 && code <= 67) return RAIN;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return SNOW;
  if (code >= 80 && code <= 82) return SHOWER;
  if (code >= 95) return THUNDER;
  return UNKNOWN;
}

/**
 * 하루를 대표할 날씨 코드 하나를 고릅니다.
 *
 * 그냥 최빈값을 쓰면 "오후에 소나기 60%"인 날이 '맑음'으로 표시돼 버립니다.
 * 비 올 가능성이 뚜렷하면 그 시각의 코드를, 아니면 최빈값을 씁니다.
 */
export function representativeWeatherCode(
  codes: number[],
  precipProbabilities: number[]
): number | undefined {
  if (codes.length === 0) return undefined;

  let wettestIdx = 0;
  for (let i = 1; i < codes.length; i++) {
    if ((precipProbabilities[i] ?? 0) > (precipProbabilities[wettestIdx] ?? 0)) wettestIdx = i;
  }
  if ((precipProbabilities[wettestIdx] ?? 0) >= 40) return codes[wettestIdx];

  const counts = new Map<number, number>();
  for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
