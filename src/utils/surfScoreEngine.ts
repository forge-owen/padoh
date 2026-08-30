/**
 * @file src/utils/surfScoreEngine.ts
 * @description 한국 해역 특화 서핑 점수(Surf Score) 및 Swell Energy(kJ) 계산 엔진
 * 
 * 글로벌 해양 데이터 기반 K-Offshore 퀄리티 산정 모델과 Swell Energy 시스템을 융합하여,
 * 단순 파고가 아닌 [스웰 에너지 + 주기 + K-Offshore 바람 판단 + 물때]를 수학적으로 연산합니다.
 */

import { WindType, SurfRating, StarType, TidePreference } from '../types/surf';

/**
 * 1. Swell Energy (스웰 에너지, kJ) 산출 함수
 * Surf-forecast 벤치마킹: E ∝ H^2 * T
 * 파도 높이(H)의 제곱과 파도 주기(T)에 비례하는 운동 에너지를 계산합니다.
 * 
 * @param waveHeightM 파도 높이 (미터)
 * @param periodS 파도 주기 (초)
 * @returns 스웰 에너지 (kJ, KiloJoules)
 */
export function calculateSwellEnergy(waveHeightM: number, periodS: number): number {
  // 예외 처리: 입력값이 비정상적일 경우 0 반환
  if (waveHeightM <= 0 || periodS <= 0 || isNaN(waveHeightM) || isNaN(periodS)) {
    return 0;
  }
  
  // 4.9는 해수 밀도(ρ) 및 중력가속도(g) 조합에 의한 에너지 산출 표준 계수
  const energy = 4.9 * Math.pow(waveHeightM, 2) * periodS;
  return Math.round(energy);
}

/**
 * 2. K-Offshore 바람 상태 판단 함수
 * 풍향과 해당 서핑 스팟의 최적 오프쇼어(육풍) 방위를 비교하여 WindType을 구합니다.
 * 
 * @param windDeg 현재 풍향 (0 ~ 360도)
 * @param windSpeedKmh 풍속 (km/h)
 * @param optimalOffshoreDeg 스팟의 이상적인 오프쇼어 풍향 (예: 양양 38선/죽도는 서풍 270도)
 * @returns WindType (GLASSY | OFFSHORE | CROSS_OFFSHORE | CROSS_ONSHORE | ONSHORE)
 */
export function calculateWindType(
  windDeg: number,
  windSpeedKmh: number,
  optimalOffshoreDeg: number
): WindType {
  // 8 km/h 미만의 약한 바람은 바람의 영향을 거의 받지 않는 글래시(Glassy)로 판정
  if (windSpeedKmh < 8) {
    return 'GLASSY';
  }

  // 풍향과 최적 오프쇼어 풍향의 각도 차이 계산 (0 ~ 180도)
  const angleDiff = Math.abs((windDeg - optimalOffshoreDeg + 180 + 360) % 360 - 180);

  if (angleDiff <= 35) {
    return 'OFFSHORE'; // 깔끔한 오프쇼어 (파도 면을 세워주고 깨끗하게 만듦)
  } else if (angleDiff <= 70) {
    return 'CROSS_OFFSHORE'; // 측면 오프쇼어
  } else if (angleDiff <= 125) {
    return 'CROSS_ONSHORE'; // 측면 온쇼어
  } else {
    return 'ONSHORE'; // 불리한 해풍/온쇼어 (파도가 찌그러지고 무너짐)
  }
}

/**
 * 3. 종합 서핑 점수 (Surf Score: 0 ~ 100점) 및 별점 (Star Rating) 산출 함수
 * 
 * @param waveHeightM 파고 (m)
 * @param periodS 주기 (초)
 * @param windSpeedKmh 풍속 (km/h)
 * @param windType 오프쇼어/온쇼어 형태
 * @returns { score, rating, starType, starCount }
 */
export interface ScoreEvaluation {
  score: number;
  rating: SurfRating;
  starType: StarType;
  starCount: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   설계 근거 — 물리 + 예보 서비스 관행
   --------------------------------------------------------------------------
   (출처: NotebookLM "The Essential Guide to Surf Forecast Sites and Tools",
    2026-08-31 조회 · 2026-08-30 고성/속초/양양 현장 실측 — data/fieldReports.ts)

   ① 주기가 파도 질을 지배하는 이유 — 파장과 감지수심
        L₀ = g·T²/2π ≈ 1.56·T²   (심해 파장, m)
        해저를 느끼기 시작하는 수심 = L₀/2
      · T=5s  → L₀ 39m,  수심 20m 부터  → 해변 코앞에서야 급히 서고 즉시 붕괴
      · T=10s → L₀ 156m, 수심 78m 부터  → 멀리서부터 정렬되며 들어옴
      · T=16s → L₀ 400m, 수심 200m 부터 → 극도로 정돈된 세트
      짧은 주기는 수평 에너지가 없어 마루만 무너지는 **스필링**(거품),
      긴 주기는 전면이 걸리며 솟구쳐 말리는 **플런징**(배럴)이 됩니다.

   ② 그라운드 스웰 vs 윈드 스웰
        T ≥ 10s → 그라운드 스웰 (먼 저기압, 분산을 거쳐 정돈됨)
        T < 10s → 윈드 스웰/풍파 (근해 국지풍, 찹과 노이즈)
      2026-08-30 동해는 **너울 주기 4.8초** = 명백한 풍파였습니다.

   ③ 예보 서비스의 가중치 관행
        에너지 지수 P ∝ H²·T  ......... 50~60%  (메인)
        바람 ......................... 30%      (곱셈 멀티플라이어)
        조석 ......................... 10~15%   (스팟별 게이트)
      바람은 파도를 만들지 않습니다. 있는 파도의 면을 다듬거나 망칠 뿐이라
      **가산점이 아니라 곱셈**입니다. 온쇼어 15km/h 이상이면 0.2~0.4 배.

   ④ Solid star / Open star (surf-forecast 방식)
        Solid = 주기 10초 이상 **그리고** (오프쇼어 또는 무풍 5km/h 이하)
        Open  = 파고는 나오지만 주기가 짧거나 온쇼어 → 크기만 있고 질은 없음
      "파고 1.5m 인데 탈 게 못 되는 날"을 한 눈에 가르는 장치입니다.
      2026-08-30 이 정확히 이 경우였습니다.
   ══════════════════════════════════════════════════════════════════════════ */

/** 심해 파장 (m). L₀ = 1.56·T² */
export function deepWaterWavelength(periodS: number): number {
  return 1.56 * periodS * periodS;
}

/** 해저를 느끼기 시작하는 수심 (m) = L₀/2 */
export function feelDepth(periodS: number): number {
  return deepWaterWavelength(periodS) / 2;
}

/** 스웰의 성격 — 주기 10초가 경계입니다 */
export type SwellClass = 'GROUND' | 'MIXED' | 'WIND';
export function classifySwell(periodS: number): SwellClass {
  if (periodS >= 10) return 'GROUND';
  if (periodS >= 8) return 'MIXED';
  return 'WIND';
}

/** 표 위에서 선형보간 — 구간 경계에서 점수가 계단처럼 튀는 걸 막습니다 */
function interp(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/**
 * 크기 점수 (0~100) — **너울 파고** 기준.
 * 전체 파고(wave_height)에는 풍파가 섞여 있어 크게 나오지만 탈 수 있는 건 너울입니다.
 * 한국 해역 분포(0.3~2m)에 맞춰 잡았습니다.
 */
const SIZE_TABLE: [number, number][] = [
  [0.15, 6], [0.3, 22], [0.5, 45], [0.7, 62], [1.0, 78], [1.4, 92], [2.0, 100],
];

/**
 * 🔑 주기 계수 (0~1) — 이 엔진에서 가장 중요한 값입니다.
 *
 * 위 ①②의 물리를 곡선으로 옮긴 것입니다. 10초에서 1.0 에 도달하도록 맞췄습니다
 * (그라운드 스웰 경계). 한국은 12초 이상이 드물어 11초에서 포화시킵니다.
 *
 * 실측 대조(2026-08-30): 4.8초 → 0.24. 앱 70~80점이 14~17점으로 내려가
 * 현장(장판/코앞붕괴/챠피)과 맞아떨어졌습니다.
 */
const PERIOD_TABLE: [number, number][] = [
  [4, 0.22],  // 풍파. 탈 수는 있으나 질은 없음
  [5, 0.42],
  [6, 0.62],
  [7, 0.80],  // 한국에서 '탈 만하다'가 시작되는 지점
  [8, 0.90],  // MIXED
  [10, 1.0],  // 그라운드 스웰 경계
  [11, 1.0],
];

/* ⚠️ [2026-08-31 재보정] 이 표를 한 번 훨씬 가파르게(4초=0.10, 5초=0.26) 잡았다가
   되돌렸습니다. 급경사도 계수와 곱해지면서 **같은 물리를 두 번 깎았기 때문**입니다
   — 짧은 주기가 바로 급경사의 원인입니다. 그 결과 동해 여름이 전부 한 자리수로
   뭉개졌고, 이건 DEVLOG [2차] §D 가 이미 한 번 고쳤던 실패("전부 플랫로 나와
   어느 날 갈까를 판단할 수 없음")의 재발이었습니다.
   주기는 '질'을, 급경사도는 '같은 주기에서 파고가 클 때의 클로즈아웃'을 맡습니다. */

/**
 * 파형 급경사도 계수 (0~1) — "크지만 못 타는 파도"의 핵심 지표.
 *
 *      steepness = H₀ / L₀ = H₀ / (1.56·T²)
 *
 * 짧은 주기에서 파고가 커지면 파형이 가팔라져, 면이 서기 전에 마루가 무너집니다
 * (클로즈아웃/덤핑). **같은 주기라면 파고가 클수록 오히려 나빠집니다.**
 *
 * [2026-08-31 보정] 이 항이 없어서 봉수대(1.0m/4.85s)가 설악(0.9m/4.75s)보다
 * 높게 나왔습니다. 현장에서 봉수대는 "해변 코앞에서 컬이 섰다 바로 부서짐,
 * 세트가 너무 잦게 연속" — 크기가 더 큰 게 오히려 더 나빴던 경우입니다.
 * 크기 점수만으로는 이 역전을 표현할 수 없습니다.
 *
 * 기준: 그라운드 스웰은 대체로 0.005 이하, 풍파는 0.02 를 넘습니다.
 */
function steepnessFactor(swellHeightM: number, periodS: number): number {
  const L0 = deepWaterWavelength(periodS);
  if (L0 <= 0) return 0.4;
  const steepness = swellHeightM / L0;
  /* 주기 계수와 이중 감점이 되지 않도록, 풍파의 '정상' 급경사도(0.02 안팎)에서는
     거의 깎지 않고 **그보다 더 가파를 때**(= 같은 주기에 파고만 큰 경우)만 깎습니다. */
  return interp(
    [
      [0.012, 1.0],  // 장주기 그라운드 스웰
      [0.020, 0.95], // 통상적인 풍파
      [0.028, 0.85],
      [0.036, 0.7],
      [0.050, 0.5],  // 클로즈아웃 영역
    ],
    steepness
  );
}

/**
 * 바람 계수 — 노트북의 관행 수치(오프쇼어/무풍 1.0~1.2, 온쇼어 15km/h↑ 0.2~0.4)를
 * 그대로 따릅니다. 가산점이 아니라 곱셈입니다(위 ③).
 */
function windFactor(windType: WindType, windSpeedKmh: number): number {
  /**
   * 풍속에 대한 **연속** 감쇠. 예전에는 "오프쇼어 18km/h 이하 = 전부 1.0" 같은
   * 계단이라, Surfline 이 실제로 등급을 가르는 구간(10 vs 13km/h)에서 우리는
   * 아무 차이도 내지 못했습니다(520표본 대조에서 드러남).
   */
  const calm = interp(
    [
      [0, 1.15],  // 무풍 — 유리 같은 수면
      [6, 1.08],
      [12, 1.0],
      [18, 0.92],
      [28, 0.8],
      [40, 0.68],
    ],
    windSpeedKmh
  );

  // 5km/h 이하는 방향이 의미 없습니다
  if (windSpeedKmh <= 5) return calm;

  switch (windType) {
    case 'GLASSY':
      return calm;
    case 'OFFSHORE':
      return calm;
    case 'CROSS_OFFSHORE':
      return calm * 0.85;
    case 'CROSS_ONSHORE':
      return calm * (windSpeedKmh >= 15 ? 0.52 : 0.68);
    case 'ONSHORE':
    default:
      if (windSpeedKmh >= 25) return calm * 0.24;
      if (windSpeedKmh >= 15) return calm * 0.34;
      return calm * 0.5;
  }
}

/**
 * 조석 계수 — 스팟이 선호하는 물때와 현재 물때를 맞춰 봅니다.
 *
 * 예전에는 스팟의 `tidePreference` 를 **점수에 전혀 쓰지 않고** 전역으로
 * "간조 -5점 / 들물 +3점" 만 했습니다. 서해 만리포(만조 전후만 가능)와
 * 동해 죽도(물때 무관)를 같은 규칙으로 다룬 셈입니다.
 */
function tideFactor(
  tideState: 'HIGH' | 'LOW' | 'RISING' | 'FALLING' | undefined,
  pref: TidePreference | undefined
): number {
  if (!tideState || !pref || pref === 'ANY') return 1.0;
  const match: Record<TidePreference, ('HIGH' | 'LOW' | 'RISING' | 'FALLING')[]> = {
    HIGH: ['HIGH', 'RISING'],
    LOW: ['LOW', 'FALLING'],
    MID: ['RISING', 'FALLING'],
    ANY: ['HIGH', 'LOW', 'RISING', 'FALLING'],
  };
  return match[pref].includes(tideState) ? 1.08 : 0.78;
}

export interface ScoreInput {
  /** 너울 파고(m). 없으면 전체 파고를 넘기되 정확도가 떨어집니다 */
  swellHeightM: number;
  /** 🔑 너울 주기(s). 전체 파주기가 아닙니다 */
  swellPeriodS: number;
  /** 풍파 파고(m) — 너울 대비 비율로 '지저분함'을 판정합니다 */
  windWaveHeightM?: number;
  windSpeedKmh: number;
  windType: WindType;
  /** 너울이 들어오는 방위 */
  swellDeg?: number;
  /** 스팟이 바라보는 방위 */
  optimalSwellDeg?: number;
  tideState?: 'HIGH' | 'LOW' | 'RISING' | 'FALLING';
  /** 스팟이 선호하는 물때 (서해는 이게 사실상 입수 가능 시간을 정합니다) */
  tidePreference?: TidePreference;
  /** 스팟이 실제로 스웰을 받는 방위 범위 [시작, 끝] (시계방향). 밖이면 차폐됩니다 */
  swellWindow?: [number, number];
}

export interface ScoreEvaluation {
  score: number;
  rating: SurfRating;
  /**
   * GOLD = Solid star (주기 10초+ & 오프쇼어/무풍 — 질이 보증된 파도)
   * WHITE = Open star (크기는 있으나 주기가 짧거나 바람이 망침)
   * ZERO = 탈 것이 없음
   */
  starType: StarType;
  starCount: number;
  /** 스웰 성격 — UI 에서 "풍파입니다" 를 말해 주기 위해 */
  swellClass: SwellClass;
}

/**
 * 종합 서핑 점수 (0~100). **곱셈 모델**입니다.
 *
 *   점수 = 크기 × 주기계수 × 방위 × 차폐 × 바람 × 지저분함 × 조석
 *
 * 덧셈 모델(에너지 40 + 주기 25 + 바람 35)은 한 축이 0이어도 나머지로 높은 점수가
 * 나옵니다. 서핑은 그렇게 되지 않습니다 — 주기가 없으면 바람이 아무리 좋아도
 * 못 탑니다. 실제 예보 서비스들도 바람·조석을 곱셈 필터로 씁니다(위 ③).
 */
export function evaluateSurfScore(input: ScoreInput): ScoreEvaluation {
  const {
    swellHeightM,
    swellPeriodS,
    windWaveHeightM = 0,
    windSpeedKmh,
    windType,
    swellDeg,
    optimalSwellDeg,
    tideState,
    tidePreference,
    swellWindow,
  } = input;

  const swellClass = classifySwell(swellPeriodS);

  if (swellHeightM < 0.15 || swellPeriodS < 2) {
    return { score: 3, rating: 'FLAT', starType: 'ZERO', starCount: 0, swellClass };
  }

  let score =
    interp(SIZE_TABLE, swellHeightM) *
    interp(PERIOD_TABLE, swellPeriodS) *
    // 같은 주기라면 파고가 클수록 가팔라져 오히려 나빠집니다 (윗 주석 참고)
    steepnessFactor(swellHeightM, swellPeriodS);

  // 방위 — 해변 정면에서 벗어날수록 굴절로 에너지가 줄어듭니다
  if (swellDeg !== undefined && optimalSwellDeg !== undefined) {
    const diff = Math.abs((((swellDeg - optimalSwellDeg) % 360) + 540) % 360 - 180);
    score *= Math.max(0.25, Math.cos((diff * Math.PI) / 180));
  }

  /**
   * 차폐(shadowing) — 곶·섬·방파제가 특정 방위의 스웰을 통째로 막습니다.
   * Surfline 은 이걸 bathymetry 로 물리 연산합니다(LOTUS). 우리는 수심 데이터가
   * 없으므로 현장 관측으로 확인된 스팟에만 방위 창을 둡니다(data/fieldReports.ts).
   * ※ 짧은 주기일수록 회절로 감싸 들어오지 못해 차폐가 더 심합니다.
   */
  if (swellWindow && swellDeg !== undefined) {
    const [from, to] = swellWindow;
    const norm = (d: number) => ((d % 360) + 360) % 360;
    if (norm(swellDeg - from) > norm(to - from)) {
      score *= swellClass === 'GROUND' ? 0.35 : 0.15;
    }
  }

  score *= windFactor(windType, windSpeedKmh);

  /**
   * 지저분함 — 풍파가 너울만큼 크면 수면이 헝클어져 면을 읽을 수 없습니다.
   * (2026-08-30 사용자 표현: "챠피하고 제법 지저분한")
   */
  if (windWaveHeightM > 0 && swellHeightM > 0) {
    const ratio = windWaveHeightM / swellHeightM;
    if (ratio > 0.8) score *= 0.7;
    else if (ratio > 0.5) score *= 0.85;
  }

  score *= tideFactor(tideState, tidePreference);

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  /* ── Solid / Open star (위 ④) ─────────────────────────────────────────
     크기가 아니라 **질**의 보증입니다. 주기 10초 이상이면서 바람이 면을
     망치지 않을 때만 Solid(GOLD). 그 외에는 점수가 높아도 Open(WHITE). */
  const cleanWind = windSpeedKmh <= 5 || windType === 'GLASSY' || windType === 'OFFSHORE';
  const isSolid = swellPeriodS >= 10 && cleanWind && finalScore >= 18;

  // 임계값 근거는 scoreVisuals.ts 의 verdictOf 주석(Surfline 520표본 대조) 참고
  let rating: SurfRating;
  if (finalScore >= 70) rating = 'EPIC';
  else if (finalScore >= 45) rating = 'GOOD';
  else if (finalScore >= 18) rating = 'FAIR';
  else if (finalScore >= 8) rating = 'POOR';
  else rating = swellHeightM < 0.3 ? 'FLAT' : 'VERY_POOR';

  return {
    score: finalScore,
    rating,
    starType: finalScore < 8 ? 'ZERO' : isSolid ? 'GOLD' : 'WHITE',
    starCount: Math.max(0, Math.min(5, Math.round(finalScore / 20))),
    swellClass,
  };
}

export function getDirectionText(deg: number): string {
  const normalized = (deg % 360 + 360) % 360;
  const directions = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW'
  ];
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}
