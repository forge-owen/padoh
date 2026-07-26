/**
 * @file src/utils/surfScoreEngine.ts
 * @description 한국 해역 특화 서핑 점수(Surf Score) 및 Swell Energy(kJ) 계산 엔진
 * 
 * Surfline의 /kbyg/ 퀄리티 산정 모델과 Surf-forecast.com의 Swell Energy 시스템을 융합하여,
 * 단순 파고가 아닌 [스웰 에너지 + 주기 + K-Offshore 바람 판단 + 물때]를 수학적으로 연산합니다.
 */

import { WindType, SurfRating, StarType } from '../types/surf';

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

export function evaluateSurfScore(
  waveHeightM: number,
  periodS: number,
  windSpeedKmh: number,
  windType: WindType
): ScoreEvaluation {
  const energyKJ = calculateSwellEnergy(waveHeightM, periodS);

  // 파도가 거의 없는 경우 (Flat)
  //
  // [2026-07-25 재보정] 이전 게이트는 `waveHeightM < 0.25 || energyKJ < 15` 였습니다.
  // 0.6m / 7초(= 12.3kJ)는 한국에서 롱보드로 충분히 타는 가장 흔한 컨디션인데 이 게이트에
  // 걸려 FLAT 처리됐고, 그 결과 동해안 여름은 14일 예보가 전부 10점/플랫로 나와
  // "어느 날 갈까"를 전혀 판단할 수 없었습니다. 아래 구간은 한국 해역의 실제 분포
  // (대략 5~200kJ)에 맞춰 다시 잡은 값입니다. 하와이/인도네시아 기준이 아닙니다.
  if (waveHeightM < 0.2 || energyKJ < 4) {
    return {
      score: 6,
      rating: 'FLAT',
      starType: 'ZERO',
      starCount: 0
    };
  }

  let totalScore = 0;

  // A. 스웰 에너지 가산점 (최대 40점) — 한국 기준
  //    참고: 0.6m/6s≈11kJ · 0.8m/7s≈22kJ · 1.0m/8s≈39kJ · 1.5m/9s≈99kJ · 2.0m/10s≈196kJ
  if (energyKJ >= 150) totalScore += 40;      // 태풍 스웰급 — 숏보드 파워 충분
  else if (energyKJ >= 80) totalScore += 34;  // 잘 들어온 그라운드 스웰
  else if (energyKJ >= 35) totalScore += 27;  // 숏·롱보드 모두 재미있는 파도
  else if (energyKJ >= 15) totalScore += 19;  // 롱보드 좋은 파도
  else if (energyKJ >= 6) totalScore += 11;   // 롱보드·입문 연습
  else totalScore += 5;                       // 무릎 아래

  // B. 주기(Period) 가산점 (최대 25점)
  // 한국은 9초 이상 그라운드 스웰이 드물어, 6~7초대를 "쓸 만한 파도"로 인정합니다.
  if (periodS >= 9) totalScore += 25;       // 먼바다 그라운드 스웰 (최상)
  else if (periodS >= 7) totalScore += 19;  // 중간 주기 스웰 (양호)
  else if (periodS >= 6) totalScore += 13;  // 한국에서 가장 흔한 구간
  else if (periodS >= 5) totalScore += 8;   // 짧은 주기 윈드 스웰
  else totalScore += 3;

  // C. 바람(Wind) 상태 감점 및 가산점 (최대 35점)
  if (windType === 'GLASSY') {
    totalScore += 35; // 바람 없는 매끄러운 장판 수면
  } else if (windType === 'OFFSHORE') {
    // 오프쇼어도 적당해야 함 (30km/h 넘으면 파도가 뒤로 밀림)
    if (windSpeedKmh <= 15) totalScore += 35;
    else if (windSpeedKmh <= 25) totalScore += 28;
    else totalScore += 18;
  } else if (windType === 'CROSS_OFFSHORE') {
    totalScore += 22;
  } else if (windType === 'CROSS_ONSHORE') {
    totalScore += 10;
  } else {
    // ONSHORE (해풍): 풍속이 셀수록 점수 급격히 하락
    if (windSpeedKmh > 20) totalScore -= 20;
    else totalScore += 2;
  }

  // 점수 범위 0 ~ 100 제한
  const finalScore = Math.max(0, Math.min(100, totalScore));

  // Surf-forecast 벤치마킹 Star Rating 결정
  let starType: StarType = 'ZERO';
  let rating: SurfRating = 'POOR';

  // 온쇼어 바람(해풍)이 심하면 아무리 파도가 높아도 White Star 또는 Zero Star 처리
  if (windType === 'ONSHORE' && windSpeedKmh > 12) {
    starType = 'WHITE'; // 아쉬운 파도 (차피 파도)
    rating = finalScore >= 40 ? 'POOR' : 'VERY_POOR';
  } else if (finalScore >= 80) {
    starType = 'GOLD'; // 황금별 (꿀파도)
    rating = 'EPIC';
  } else if (finalScore >= 65) {
    starType = 'GOLD';
    rating = 'GOOD';
  } else if (finalScore >= 45) {
    starType = 'GOLD';
    rating = 'FAIR';
  } else if (finalScore >= 30) {
    starType = 'WHITE';
    rating = 'POOR';
  } else {
    starType = 'ZERO';
    rating = 'VERY_POOR';
  }

  const starCount = Math.max(0, Math.min(10, Math.ceil(finalScore / 10)));

  return {
    score: finalScore,
    rating,
    starType,
    starCount
  };
}

/**
 * 방위각(0~360도)을 16방위 문자로 변환 (예: 270도 -> "W")
 */
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
