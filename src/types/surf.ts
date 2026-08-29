/**
 * @file src/types/surf.ts
 * @description Golden Hour 테마 & 주말 서퍼(Weekend Surfer) 2주 예보 데이터 타입 정의
 */

export type RegionKey = 'EAST' | 'SOUTH' | 'WEST' | 'JEJU';

export type WindType = 'OFFSHORE' | 'CROSS_OFFSHORE' | 'CROSS_ONSHORE' | 'ONSHORE' | 'GLASSY';

export type StarType = 'GOLD' | 'WHITE' | 'ZERO';

export type SurfRating = 'FLAT' | 'VERY_POOR' | 'POOR' | 'FAIR' | 'GOOD' | 'EPIC';

/* ── 스팟 가이드 축 ───────────────────────────────────────────────────────
 * 예보 수치는 "오늘 파도가 어떤가"만 답합니다. 여기 있는 축들은 그것만으로는
 * 절대 알 수 없는 "그래서 내가 거길 가도 되는가"를 답합니다.
 * (Surfline 스팟 가이드의 Ability Level · Best Season · Hazards · Crowd Factor 를
 *  한국 상황에 맞춰 옮긴 것입니다)
 * --------------------------------------------------------------------- */

/** 이 스팟을 감당할 수 있는 실력대 */
export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ALL';

/** 파도가 잘 들어오는 계절 */
export type SeasonKey = 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER';

/**
 * 잘 맞는 물때.
 * 서해는 조차가 6~9m 라 이 값이 사실상 "탈 수 있는 시간대"를 정합니다.
 * 동해는 조차가 30cm 안팎이라 대부분 ANY 입니다.
 */
export type TidePreference = 'LOW' | 'MID' | 'HIGH' | 'ANY';

/** 주말 성수 시간대 기준 붐빔 정도 */
export type CrowdLevel = 'QUIET' | 'MODERATE' | 'BUSY';

export interface SurfSpot {
  id: string;
  name: string;
  englishName: string;
  region: RegionKey;
  locationName: string;
  latitude: number;
  longitude: number;
  /** 오프쇼어 방위 — 바람이 **불어오는** 쪽. optimalSwellDeg 의 반대편입니다. */
  optimalWindDeg: number;
  /** 해변이 바라보는 방위 = 스웰이 **들어오는** 쪽 */
  optimalSwellDeg: number;
  bottomType: 'SANDBAR' | 'REEF' | 'POINT_BREAK';
  description: string;

  /* 스팟 가이드 (SpotGuideModal 에서 표시) */
  skillLevel: SkillLevel;
  bestSeasons: SeasonKey[];
  tidePreference: TidePreference;
  crowdLevel: CrowdLevel;
  /** 이 스팟 고유의 위험 요소. 권역 공통 주의사항과 별개입니다. */
  hazards: string[];

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
  /**
   * 이 시각의 조위 예보가 실제로 존재하는가.
   * Open-Meteo 는 조위를 약 9일까지만 줍니다. 그 뒤는 false 이고 tideHeightCm 은
   * 의미가 없습니다 — 0 을 그리면 "간조"처럼 보여 사용자를 오해시킵니다.
   */
  tideAvailable: boolean;
  /**
   * 이 시각의 조위가 **관측 모델이 아니라 조화분해 예측값**인가.
   * 조석은 천문 현상이라 연장 계산이 가능하지만, 9일 샘플로 맞춘 값이므로
   * 국립해양조사원 물때표를 대체하지 않습니다. UI 에 반드시 표시하세요.
   */
  tidePredicted: boolean;
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

  /** 이 날짜에 조위 값이 있는가 (모델 또는 조화분해 예측) */
  hasTide: boolean;
  /** 그 조위가 조화분해 예측값인가 (모델 제공 범위 밖) */
  tidePredicted: boolean;
  /**
   * 예보 신뢰도. 파도 모델은 멀어질수록 급격히 맞지 않습니다.
   *   HIGH   D+0~2  — 실질적으로 믿을 만함
   *   MEDIUM D+3~6  — 추세는 맞고 수치는 흔들림
   *   LOW    D+7~   — 방향성 참고용. 매일 뒤집힙니다
   */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface DailyHighlight {
  dateStr: string;
  bestTime: string;
  maxScore: number;
  bestSwellEnergy: number;
  summaryText: string;
}
