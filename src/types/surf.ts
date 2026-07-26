/**
 * @file src/types/surf.ts
 * @description Golden Hour 테마 & 주말 서퍼(Weekend Surfer) 2주 예보 데이터 타입 정의
 */

export type RegionKey = 'EAST' | 'SOUTH' | 'WEST' | 'JEJU';

export type WindType = 'OFFSHORE' | 'CROSS_OFFSHORE' | 'CROSS_ONSHORE' | 'ONSHORE' | 'GLASSY';

export type StarType = 'GOLD' | 'WHITE' | 'ZERO';

export type SurfRating = 'FLAT' | 'VERY_POOR' | 'POOR' | 'FAIR' | 'GOOD' | 'EPIC';

export interface SurfSpot {
  id: string;
  name: string;
  englishName: string;
  region: RegionKey;
  locationName: string;
  latitude: number;
  longitude: number;
  optimalWindDeg: number;
  optimalSwellDeg: number;
  bottomType: 'SANDBAR' | 'REEF' | 'POINT_BREAK';
  description: string;
  liveCamTitle?: string;
  liveCamUrl?: string;
}

export interface HourlyForecast {
  time: string;
  fullDate: string;
  timestamp: number;
  waveHeightM: number;
  waveHeightFt: number;
  swellPeriodS: number;
  swellDirectionDeg: number;
  swellDirectionText: string;
  swellEnergyKJ: number;
  windSpeedKmh: number;
  windSpeedKts: number;
  windDirectionDeg: number;
  windDirectionText: string;
  windType: WindType;
  tideHeightCm: number;
  tideState: 'HIGH' | 'LOW' | 'RISING' | 'FALLING';
  surfScore: number;
  rating: SurfRating;
  starType: StarType;
  starCount: number;
  isLiveApi?: boolean;

  /* 날씨 (Open-Meteo forecast API) */
  /** WMO 4677 코드 — utils/weather.ts 에서 라벨·아이콘으로 변환 */
  weatherCode: number;
  temperatureC: number;
  /** 강수 확률 (%) */
  precipProbability: number;
}

/**
 * 하루를 아침/낮/오후 세 구간으로 나눈 요약.
 * 주간 스트립에서 "언제 들어가야 하는가"를 하루 한 줄로 보여주기 위한 단위입니다.
 * 서핑은 같은 날에도 오전 육풍 / 오후 해풍으로 컨디션이 완전히 갈리기 때문에
 * 하루를 하나의 값으로 뭉개면 정보가 사라집니다.
 */
export interface DayPart {
  /** '아침' | '낮' | '오후' */
  label: string;
  /** 대표 시각 (예: '09시') */
  timeLabel: string;
  surfScore: number;
  waveHeightM: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  windType: WindType;
}

export interface DailyForecast {
  dateStr: string;
  fullDateISO: string;
  dayOfWeek: string;
  isWeekend: boolean;
  isToday: boolean;
  minWaveHeightM: number;
  maxWaveHeightM: number;
  avgSwellPeriodS: number;
  maxSwellEnergyKJ: number;
  bestWindType: WindType;
  maxSurfScore: number;
  /** 하루 중 가장 좋은 시간대 (예: '아침') */
  bestPartLabel: string;
  parts: DayPart[];

  /* 날씨 요약 — 낮 시간대(SURFABLE_HOURS) 기준 */
  weatherCode?: number;
  minTempC: number;
  maxTempC: number;
  /** 낮 시간대 최대 강수 확률 (%) */
  maxPrecipProbability: number;
  starType: StarType;
  starCount: number;
  recommendation: string;
}

export interface DailyHighlight {
  dateStr: string;
  bestTime: string;
  maxScore: number;
  bestSwellEnergy: number;
  summaryText: string;
}
