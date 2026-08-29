/**
 * @file src/services/surfApi.ts
 * @description Open-Meteo 16일 해양·기상 예보 수집과 일별 요약.
 *
 * 하루치 요약(summarizeDay)은 실시간 경로와 폴백 경로가 완전히 같은 규칙을 쓰도록
 * 한 함수로 모여 있습니다. 스트립이 쓰는 아침/낮/오후 구간 분해도 여기서 합니다.
 */

import {
  SurfSpot,
  HourlyForecast,
  DailyForecast,
  DayPart,
  DailyHighlight,
} from '../types/surf';
import { calculateSwellEnergy, calculateWindType, evaluateSurfScore, getDirectionText } from '../utils/surfScoreEngine';
import { representativeWeatherCode } from '../utils/weather';

/** Open-Meteo marine·forecast 양쪽이 지원하는 최대 일수 (384시간, 실측 확인) */
export const FORECAST_DAYS = 16;

/**
 * 스팟 목록은 `src/data/koreaSurfSpots.ts` 로 옮겼습니다 (스팟이 41개가 되면서
 * 이 파일의 수집 로직을 압도했습니다). 기존 import 경로를 깨지 않도록 여기서
 * 그대로 다시 내보냅니다 — 스팟을 추가할 때는 데이터 파일만 고치면 됩니다.
 */
export { KOREA_SURF_SPOTS } from '../data/koreaSurfSpots';
import { KOREA_SURF_SPOTS } from '../data/koreaSurfSpots';

export async function fetchLive16DaysForecasts(spotId: string): Promise<{
  hourly: HourlyForecast[];
  daily16Days: DailyForecast[];
}> {
  const spot = KOREA_SURF_SPOTS.find(s => s.id === spotId) || KOREA_SURF_SPOTS[0];

  try {
    // sea_level_height_msl = 평균해수면 대비 조위(m). 물때 차트/표의 실제 데이터 소스입니다.
    // (이전에는 tideHeightCm 이 45 로 하드코딩되어 조석 차트가 직선으로 그려졌습니다)
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.latitude}&longitude=${spot.longitude}&hourly=wave_height,wave_period,swell_wave_direction,sea_level_height_msl,wind_wave_height,wind_wave_direction&forecast_days=16&timezone=Asia%2FSeoul`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}&hourly=wind_speed_10m,wind_direction_10m,weather_code,temperature_2m,precipitation_probability&forecast_days=16&timezone=Asia%2FSeoul`;

    const [marineRes, weatherRes] = await Promise.all([
      fetch(marineUrl),
      fetch(weatherUrl)
    ]);

    if (!marineRes.ok || !weatherRes.ok) throw new Error('API 호출 실패');

    const marineData = await marineRes.json();
    const weatherData = await weatherRes.json();

    const times: string[] = marineData.hourly.time;
    const waveHeights: number[] = marineData.hourly.wave_height;
    const wavePeriods: number[] = marineData.hourly.wave_period;
    const swellDirs: number[] = marineData.hourly.swell_wave_direction;
    const seaLevels: number[] = marineData.hourly.sea_level_height_msl ?? [];
    const windWaveHeights: number[] = marineData.hourly.wind_wave_height ?? [];
    const windWaveDirs: number[] = marineData.hourly.wind_wave_direction ?? [];
    const windSpeeds: number[] = weatherData.hourly.wind_speed_10m;
    const windDirs: number[] = weatherData.hourly.wind_direction_10m;
    const weatherCodes: number[] = weatherData.hourly.weather_code ?? [];
    const temps: number[] = weatherData.hourly.temperature_2m ?? [];
    const precipProbs: number[] = weatherData.hourly.precipitation_probability ?? [];

    const hourlyForecasts: HourlyForecast[] = [];
    const dailyMap: { [dateStr: string]: HourlyForecast[] } = {};

    for (let i = 0; i < times.length; i++) {
      const dateObj = new Date(times[i]);
      const hourStr = dateObj.getHours().toString().padStart(2, '0') + ':00';
      const dateISO = times[i].split('T')[0];

      const waveHeightM = Number((waveHeights[i] ?? 0.6).toFixed(1));
      const periodS = Math.round(wavePeriods[i] ?? 6);
      const swellDirDeg = Math.round(swellDirs[i] ?? spot.optimalSwellDeg);

      const swellEnergyKJ = calculateSwellEnergy(waveHeightM, periodS);

      const windSpeedKmh = Math.round(windSpeeds[i] ?? 10);
      const windDirDeg = Math.round(windDirs[i] ?? spot.optimalWindDeg);

      const windType = calculateWindType(windDirDeg, windSpeedKmh, spot.optimalWindDeg);

      // 다중 스웰(Wind chop) 페널티 계산
      let crossSwellPenalty = 0;
      const wWH = windWaveHeights[i] ?? 0;
      const wWD = windWaveDirs[i] ?? 0;
      if (wWH >= 0.4) {
        const diff = Math.abs((swellDirDeg - wWD + 180 + 360) % 360 - 180);
        if (diff > 60) {
          crossSwellPenalty = Math.round(wWH * 10); // 0.5m 이면 5점 감점
        }
      }

      // 조위: m → cm
      const tideHeightCm = Math.round((seaLevels[i] ?? 0) * 100);
      const tideState = classifyTide(seaLevels, i);

      const evaluation = evaluateSurfScore(
        waveHeightM, periodS, windSpeedKmh, windType,
        swellDirDeg, spot.optimalSwellDeg, tideState, crossSwellPenalty
      );

      const item: HourlyForecast = {
        time: hourStr,
        fullDate: `${dateObj.getMonth() + 1}.${dateObj.getDate()} ${hourStr}`,
        timestamp: dateObj.getTime(),
        waveHeightM,
        waveHeightFt: Number((waveHeightM * 3.28).toFixed(1)),
        swellPeriodS: periodS,
        swellDirectionDeg: swellDirDeg,
        swellDirectionText: getDirectionText(swellDirDeg),
        swellEnergyKJ,
        windSpeedKmh,
        windSpeedKts: Math.round(windSpeedKmh * 0.54),
        windDirectionDeg: windDirDeg,
        windDirectionText: getDirectionText(windDirDeg),
        windType,
        tideHeightCm,
        tideState,
        surfScore: evaluation.score,
        rating: evaluation.rating,
        starType: evaluation.starType,
        starCount: evaluation.starCount,
        isLiveApi: true,
        weatherCode: weatherCodes[i] ?? 3,
        temperatureC: Math.round(temps[i] ?? 20),
        precipProbability: Math.round(precipProbs[i] ?? 0),
      };

      hourlyForecasts.push(item);

      if (!dailyMap[dateISO]) {
        dailyMap[dateISO] = [];
      }
      dailyMap[dateISO].push(item);
    }

    const daily16Days: DailyForecast[] = Object.keys(dailyMap).map((dateISO) =>
      summarizeDay(dateISO, dailyMap[dateISO])
    );

    return {
      hourly: hourlyForecasts,
      daily16Days,
    };

  } catch (err) {
    console.warn('16일 예보 API 수집 실패:', err);
    return generateFallback16Days(spot);
  }
}

/**
 * 조위 시계열에서 i 번째 시각의 국면(만조/간조/들물/날물)을 판정합니다.
 *
 * 바로 앞뒤 값만 비교하면 조위가 평평한 구간(예: 0.12, 0.12, 0.12)에서 여러 시각이
 * 동시에 만조로 잡혀, 간조 없이 만조가 두 번 표시되는 물리적으로 불가능한 결과가 납니다.
 * ±2 시간 창까지 함께 보고 실제 극점에서만 HIGH/LOW 를 반환합니다.
 */
function classifyTide(series: number[], i: number): HourlyForecast['tideState'] {
  const at = (k: number) => series[Math.min(Math.max(k, 0), series.length - 1)] ?? 0;
  const cur = at(i);
  const prev = at(i - 1);
  const next = at(i + 1);
  const prev2 = at(i - 2);
  const next2 = at(i + 2);

  if (cur >= prev && cur >= next && cur > prev2 && cur > next2) return 'HIGH';
  if (cur <= prev && cur <= next && cur < prev2 && cur < next2) return 'LOW';
  return next > cur ? 'RISING' : 'FALLING';
}

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 서핑 가능한 시간대 (KST 05~20시).
 *
 * 하루 24시간 전체에서 최고점을 뽑으면 새벽 3시가 피크로 잡히는 일이 흔합니다
 * (밤에 바람이 잦아들어 글래시가 되기 때문). 물리적으로는 맞지만 서핑 예보로는
 * 쓸모가 없어서, 하루 판정·피크 시각은 이 범위 안에서만 고릅니다.
 */
export const SURFABLE_HOURS = { from: 5, to: 20 };

export function isSurfableHour(fc: HourlyForecast): boolean {
  const h = new Date(fc.timestamp).getHours();
  return h >= SURFABLE_HOURS.from && h <= SURFABLE_HOURS.to;
}

/** 낮 시간대에서 가장 좋은 시각. 낮 데이터가 없으면 전체에서 고릅니다. */
export function pickBestSurfableHour(list: HourlyForecast[]): HourlyForecast | null {
  if (list.length === 0) return null;
  const daylight = list.filter(isSurfableHour);
  const pool = daylight.length > 0 ? daylight : list;
  return pool.reduce((a, b) => (b.surfScore > a.surfScore ? b : a), pool[0]);
}

/** 하루를 나누는 세 구간. 서핑은 오전 육풍 / 오후 해풍으로 컨디션이 갈립니다. */
const DAY_PARTS: { label: string; from: number; to: number; pick: number }[] = [
  { label: '아침', from: 5, to: 10, pick: 7 },
  { label: '낮', from: 11, to: 15, pick: 13 },
  { label: '오후', from: 16, to: 20, pick: 18 },
];

function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/**
 * 하루치 시간별 예보 → 주간 스트립이 쓰는 일별 요약.
 * 실시간 경로와 폴백 경로가 완전히 같은 규칙을 쓰도록 한 함수로 모았습니다.
 */
function summarizeDay(dateISO: string, items: HourlyForecast[]): DailyForecast {
  const dObj = new Date(items[0]?.timestamp ?? `${dateISO}T00:00:00`);
  const dayOfWeekStr = DAY_NAMES[dObj.getDay()];

  const hourOf = (fc: HourlyForecast) => new Date(fc.timestamp).getHours();

  const parts: DayPart[] = DAY_PARTS.map((slot) => {
    const inSlot = items.filter((it) => {
      const h = hourOf(it);
      return h >= slot.from && h <= slot.to;
    });
    const pool = inSlot.length > 0 ? inSlot : items;
    // 구간 안에서는 가장 좋은 시각을 대표로 삼습니다 ("이 시간대에 들어가면 이 정도")
    const best = pool.reduce((a, b) => (b.surfScore > a.surfScore ? b : a), pool[0]);
    return {
      label: slot.label,
      timeLabel: `${String(hourOf(best)).padStart(2, '0')}시`,
      surfScore: best.surfScore,
      waveHeightM: best.waveHeightM,
      windSpeedKmh: best.windSpeedKmh,
      windDirectionDeg: best.windDirectionDeg,
      windType: best.windType,
    };
  });

  // 하루의 대표 판정은 "낮에 들어갔을 때" 기준입니다 (위 SURFABLE_HOURS 주석 참고)
  const bestItem = pickBestSurfableHour(items) ?? items[0];
  const maxScore = bestItem.surfScore;
  const bestPart = parts.reduce((a, b) => (b.surfScore > a.surfScore ? b : a), parts[0]);

  // 날씨는 낮 시간대만 봅니다. 새벽 비로 하루가 '비'로 표시되면 오해를 부릅니다.
  const daylight = items.filter(isSurfableHour);
  const weatherPool = daylight.length > 0 ? daylight : items;

  return {
    dateStr: `${dObj.getMonth() + 1}/${dObj.getDate()}`,
    fullDateISO: dateISO,
    dayOfWeek: dayOfWeekStr,
    isWeekend: dObj.getDay() === 0 || dObj.getDay() === 6,
    isToday: dateISO === todayISO(),
    minWaveHeightM: Math.min(...items.map((it) => it.waveHeightM)),
    maxWaveHeightM: Math.max(...items.map((it) => it.waveHeightM)),
    avgSwellPeriodS: Math.round(items.reduce((a, b) => a + b.swellPeriodS, 0) / items.length),
    maxSwellEnergyKJ: Math.max(...items.map((it) => it.swellEnergyKJ)),
    bestWindType: bestItem.windType,
    maxSurfScore: maxScore,
    bestPartLabel: bestPart.label,
    parts,
    starType: bestItem.starType,
    starCount: bestItem.starCount,
    recommendation: describeDay(maxScore),
    weatherCode: representativeWeatherCode(
      weatherPool.map((it) => it.weatherCode),
      weatherPool.map((it) => it.precipProbability)
    ),
    minTempC: Math.min(...weatherPool.map((it) => it.temperatureC)),
    maxTempC: Math.max(...weatherPool.map((it) => it.temperatureC)),
    maxPrecipProbability: Math.max(...weatherPool.map((it) => it.precipProbability)),
  };
}

/**
 * 스트립 상단에 붙는 한 줄 브리핑.
 *
 * ⚠️ 규칙 기반입니다 — LLM 호출이 아닙니다. 16일 예보에서 (1) 오늘 상태와
 * (2) 앞으로 가장 좋은 날을 뽑아 한 문장으로 잇습니다. 나중에 실제 모델을 붙일 거라면
 * 이 함수만 교체하면 되고, 그 전까지는 "AI" 라고 표기하지 않습니다.
 */
export function buildBriefing(dailyList: DailyForecast[]): string {
  if (dailyList.length === 0) return '예보 데이터가 없습니다.';

  const today = dailyList[0];
  const upcoming = dailyList.slice(1);
  const best = upcoming.reduce(
    (a, b) => (b.maxSurfScore > a.maxSurfScore ? b : a),
    upcoming[0] ?? today
  );

  const todayPhrase =
    today.maxSurfScore >= 60
      ? `오늘 ${today.bestPartLabel}에 파도가 좋습니다`
      : today.maxSurfScore >= 38
      ? `오늘은 ${today.bestPartLabel}에 탈 만합니다`
      : today.maxWaveHeightM < 0.2
      ? '오늘은 플랫입니다'
      : '오늘은 파도가 약합니다';

  // 앞으로도 별로면 굳이 "최고의 날"을 만들어 주지 않습니다
  if (!best || best.maxSurfScore < 38) {
    return `${todayPhrase}. 16일 안에 뚜렷하게 좋아지는 날은 보이지 않습니다.`;
  }

  const dayIdx = dailyList.indexOf(best);
  const whenPhrase =
    dayIdx === 1 ? '내일' : dayIdx <= 7 ? `${best.dayOfWeek}요일` : `${best.dateStr}(${best.dayOfWeek})`;
  const quality = best.maxSurfScore >= 60 ? '가장 좋습니다' : '가장 나은 편입니다';

  return `${todayPhrase}. ${whenPhrase} ${best.bestPartLabel}이 ${best.minWaveHeightM.toFixed(
    1
  )}–${best.maxWaveHeightM.toFixed(1)}m 로 앞으로 16일 중 ${quality}.`;
}

/** 하루 최고 스코어 → 한 줄 추천 문구 (실시간·폴백 경로가 같은 문구를 쓰도록 공유) */
function describeDay(maxScore: number): string {
  if (maxScore >= 75) return '주말 서퍼 완전 추천 — 꿀파도';
  if (maxScore >= 50) return '롱보드 기분 좋게 타기 양호';
  if (maxScore >= 30) return '입문자 패들링 연습';
  return '평범한 해수면 — 플랫에 가까움';
}

export function getDailyHighlight(forecasts: HourlyForecast[]): DailyHighlight {
  if (!forecasts || forecasts.length === 0) {
    return {
      dateStr: '오늘',
      bestTime: '정보 없음',
      maxScore: 0,
      bestSwellEnergy: 0,
      summaryText: '예보 데이터를 불러올 수 없습니다.'
    };
  }

  // 호출부에서 이미 선택 날짜로 걸러 넘겨줍니다. 여기서는 낮 시간대 중 최고만 고릅니다.
  const bestItem = pickBestSurfableHour(forecasts) ?? forecasts[0];

  let summaryText = '바람이 다소 온쇼어 방향이어서 해면이 살짝 무너질 수 있습니다.';
  if (bestItem.starType === 'GOLD' && bestItem.surfScore >= 75) {
    summaryText = `🔥 오늘 최상의 황금 파도 피크! 서풍 오프쇼어와 ${bestItem.swellEnergyKJ}kJ 스웰 에너지 형성.`;
  } else if (bestItem.starType === 'GOLD') {
    summaryText = `🛹 롱보드 기분 좋게 라이딩 가능한 깨끗한 오프쇼어 파도 (에너지 ${bestItem.swellEnergyKJ}kJ).`;
  } else if (bestItem.surfScore >= 35) {
    summaryText = `🌊 입문자 패들링 및 거품파도 연습하기 양호한 파도 시간대.`;
  }

  return {
    dateStr: '오늘 예보',
    bestTime: `${bestItem.time} 전후`,
    maxScore: bestItem.surfScore,
    bestSwellEnergy: bestItem.swellEnergyKJ,
    summaryText
  };
}

/**
 * API 연결 실패 시의 대체 데이터.
 *
 * 이전 구현은 hourly 를 빈 배열로 돌려줬기 때문에, 네트워크가 끊기면 App 의
 * activeForecast 가 null 이 되어 지도 아래가 통째로 사라졌습니다. 시간별 데이터를
 * 실제로 생성해서 UI 형태는 유지하고, isLiveApi=false 로 "실시간 아님"을 표시합니다.
 */
function generateFallback16Days(spot: SurfSpot) {
  const dailyList: DailyForecast[] = [];
  const hourly: HourlyForecast[] = [];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(0);

  const dailyBuckets: { [dateISO: string]: HourlyForecast[] } = {};

  // 반일주조(약 12.42시간) 근사 조석. 실시간 경로와 같은 판정 함수를 쓰도록 미리 만들어 둡니다. (m)
  const tideSeries = Array.from({ length: FORECAST_DAYS * 24 }, (_, h) => 0.6 * Math.sin((h / 12.42) * Math.PI * 2));

  for (let h = 0; h < FORECAST_DAYS * 24; h++) {
    const cur = new Date(start.getTime() + h * 3600 * 1000);
    const dayIdx = Math.floor(h / 24);
    const hourOfDay = cur.getHours();

    // 일 단위 완만한 스웰 변동 + 하루 안의 약한 사이클
    const swell = 0.55 + 0.25 * Math.sin((dayIdx / FORECAST_DAYS) * Math.PI * 2) + 0.08 * Math.sin((hourOfDay / 24) * Math.PI * 2);
    const waveHeightM = Number(Math.max(0.2, swell).toFixed(1));
    const periodS = 6 + Math.round(Math.abs(Math.sin(dayIdx / 3)) * 3);

    // 한국 동해안의 전형적 일주기: 오전 육풍(오프쇼어) → 오후 해풍(온쇼어)
    const isMorning = hourOfDay >= 4 && hourOfDay <= 10;
    const windDirDeg = isMorning ? spot.optimalWindDeg : (spot.optimalWindDeg + 180) % 360;
    const windSpeedKmh = isMorning ? 7 + (hourOfDay % 3) : 14 + (hourOfDay % 5) * 2;

    const windType = calculateWindType(windDirDeg, windSpeedKmh, spot.optimalWindDeg);
    const tideState = classifyTide(tideSeries, h);
    const evaluation = evaluateSurfScore(
      waveHeightM, periodS, windSpeedKmh, windType,
      spot.optimalSwellDeg, spot.optimalSwellDeg, tideState, 0
    );

    const hourStr = `${hourOfDay.toString().padStart(2, '0')}:00`;
    const item: HourlyForecast = {
      time: hourStr,
      fullDate: `${cur.getMonth() + 1}.${cur.getDate()} ${hourStr}`,
      timestamp: cur.getTime(),
      waveHeightM,
      waveHeightFt: Number((waveHeightM * 3.28).toFixed(1)),
      swellPeriodS: periodS,
      swellDirectionDeg: spot.optimalSwellDeg,
      swellDirectionText: getDirectionText(spot.optimalSwellDeg),
      swellEnergyKJ: calculateSwellEnergy(waveHeightM, periodS),
      windSpeedKmh,
      windSpeedKts: Math.round(windSpeedKmh * 0.54),
      windDirectionDeg: windDirDeg,
      windDirectionText: getDirectionText(windDirDeg),
      windType,
      tideHeightCm: Math.round(tideSeries[h] * 100),
      tideState: classifyTide(tideSeries, h),
      surfScore: evaluation.score,
      rating: evaluation.rating,
      starType: evaluation.starType,
      starCount: evaluation.starCount,
      isLiveApi: false,
      // 폴백에는 실제 날씨가 없습니다. 흐림으로 두고 배지에 '오프라인 추정치'가 함께 뜹니다.
      weatherCode: 3,
      temperatureC: 20,
      precipProbability: 0,
    };

    hourly.push(item);

    const dateISO = `${cur.getFullYear()}-${(cur.getMonth() + 1).toString().padStart(2, '0')}-${cur
      .getDate()
      .toString()
      .padStart(2, '0')}`;
    (dailyBuckets[dateISO] ||= []).push(item);
  }

  // 실시간 경로와 동일한 요약 규칙을 씁니다 (구간 나눔·베스트 시간대 판정 포함)
  for (const dateISO of Object.keys(dailyBuckets)) {
    dailyList.push(summarizeDay(dateISO, dailyBuckets[dateISO]));
  }

  return {
    hourly,
    daily16Days: dailyList,
  };
}
