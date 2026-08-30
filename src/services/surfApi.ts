/**
 * @file src/services/surfApi.ts
 * @description Open-Meteo 16일 해양·기상 예보 수집과 일별 요약.
 *
 * 하루치 요약(summarizeDay)은 실시간 경로와 폴백 경로가 완전히 같은 규칙을 쓰도록
 * 한 함수로 모여 있습니다. 스트립이 쓰는 아침/낮/오후 구간 분해도 여기서 합니다.
 */

import {
  SurfSpot,
  WindType,
  HourlyForecast,
  DailyForecast,
  DayPart,
  DailyHighlight,
} from '../types/surf';
import { calculateSwellEnergy, calculateWindType, evaluateSurfScore, getDirectionText } from '../utils/surfScoreEngine';
import { representativeWeatherCode } from '../utils/weather';
import { extendTideSeries } from '../utils/tideHarmonics';

/** Open-Meteo marine·forecast 양쪽이 지원하는 최대 일수 (384시간, 실측 확인) */
export const FORECAST_DAYS = 16;

/**
 * 스팟 목록은 `src/data/koreaSurfSpots.ts` 로 옮겼습니다 (스팟이 60개를 넘어가면서
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
    // 🔴 모델을 두 개 요청하는 이유 — 기본 모델은 9일에서 끊깁니다.
    //
    // best_match 는 약 9일까지만 값을 주고 그 뒤로는 전부 null 입니다. 예전에는
    // 그 null 을 `?? 0` 으로 삼켜서 **10~16일차를 "파고 0.0m" 인 멀쩡한 예보처럼**
    // 그리고 있었습니다(실제로는 데이터가 없는 것). ncep_gfswave025 는 16일까지
    // 파고·주기·스웰방향을 주므로, best_match 가 끊긴 뒤를 이어 붙입니다.
    //
    // ⚠️ 조위(sea_level_height_msl)는 **어떤 모델에서도 9일이 한계**입니다.
    //    그 뒤는 데이터가 없다고 정직하게 표시합니다(가짜 0 을 그리지 않습니다).
    const marineUrl =
      `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.latitude}&longitude=${spot.longitude}` +
      `&hourly=wave_height,wave_period,swell_wave_height,swell_wave_period,swell_wave_direction,sea_level_height_msl,wind_wave_height,wind_wave_direction` +
      `&forecast_days=16&timezone=Asia%2FSeoul&models=best_match,ncep_gfswave025`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}&hourly=wind_speed_10m,wind_direction_10m,weather_code,temperature_2m,precipitation_probability&forecast_days=16&timezone=Asia%2FSeoul`;

    const [marineRes, weatherRes] = await Promise.all([
      fetch(marineUrl),
      fetch(weatherUrl)
    ]);

    if (!marineRes.ok || !weatherRes.ok) throw new Error('API 호출 실패');

    const marineData = await marineRes.json();
    const weatherData = await weatherRes.json();

    const times: string[] = marineData.hourly.time;
    /**
     * 모델을 여러 개 요청하면 필드 이름에 접미사가 붙습니다
     * (`wave_height_marine_best_match`, `wave_height_ncep_gfswave025`).
     * 앞 모델을 우선하고, null 인 구간만 뒤 모델로 메웁니다.
     */
    const mergeModels = (base: string): (number | null)[] => {
      const primary: (number | null)[] = marineData.hourly[`${base}_marine_best_match`] ?? [];
      const backup: (number | null)[] = marineData.hourly[`${base}_ncep_gfswave025`] ?? [];
      const len = Math.max(primary.length, backup.length, times.length);
      const out: (number | null)[] = [];
      for (let i = 0; i < len; i++) out.push(primary[i] ?? backup[i] ?? null);
      return out;
    };

    const waveHeights = mergeModels('wave_height');
    const wavePeriods = mergeModels('wave_period');
    /**
     * 🔑 너울 성분을 따로 받습니다.
     * 전체 파고/파주기에는 풍파가 섞여 있어, 실제로는 못 타는 4.8초짜리 잡파가
     * 6.5초로 보고됩니다. 점수는 반드시 너울 기준으로 계산해야 합니다.
     * (2026-08-31 실측 보정 — surfScoreEngine 의 PERIOD_TABLE 주석 참고)
     */
    const swellHeights = mergeModels('swell_wave_height');
    const swellPeriods = mergeModels('swell_wave_period');
    const swellDirs = mergeModels('swell_wave_direction');
    /**
     * 조위 — best_match 에만 있고(gfswave 는 전부 null) 약 9일에서 끊깁니다.
     *
     * 조석은 **천문 현상**이라 원리상 연장 계산이 가능합니다. 받아 온 구간에
     * 조화 상수를 맞춰 나머지를 예측합니다(utils/tideHarmonics.ts).
     * 조석이 지배적이지 않은 해역(동해, 조차 40cm 남짓)에서는 적합이 스스로
     * 거부되고 null 로 남습니다 — 틀린 조위는 없는 것보다 나쁩니다.
     */
    const seaLevelsRaw: (number | null)[] =
      marineData.hourly.sea_level_height_msl_marine_best_match ?? [];
    const { filled: seaLevelsFilled, predictedFrom } = extendTideSeries(seaLevelsRaw);
    const seaLevels: number[] = seaLevelsFilled.map((v) => v ?? 0);
    const windWaveHeights = mergeModels('wind_wave_height');
    const windWaveDirs = mergeModels('wind_wave_direction');
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
      // 너울 성분이 없으면 전체값으로 대체하되, 그때는 정확도가 떨어집니다
      const swellHeightM = Number((swellHeights[i] ?? waveHeights[i] ?? 0.5).toFixed(2));
      const swellPeriodRaw = swellPeriods[i] ?? wavePeriods[i] ?? 5;
      const periodS = Math.round(swellPeriodRaw);
      const swellDirDeg = Math.round(swellDirs[i] ?? spot.optimalSwellDeg);

      const swellEnergyKJ = calculateSwellEnergy(swellHeightM, swellPeriodRaw);

      const windSpeedKmh = Math.round(windSpeeds[i] ?? 10);
      const windDirDeg = Math.round(windDirs[i] ?? spot.optimalWindDeg);

      const windType = calculateWindType(windDirDeg, windSpeedKmh, spot.optimalWindDeg);

      const windWaveH = windWaveHeights[i] ?? 0;

      // 조위: m → cm. 모델값 / 조화분해 예측값 / 없음 세 가지를 구분합니다.
      const tideAvailable = seaLevelsFilled[i] !== null && seaLevelsFilled[i] !== undefined;
      const tidePredicted =
        tideAvailable && predictedFrom !== null && i >= predictedFrom;
      const tideHeightCm = Math.round((seaLevels[i] ?? 0) * 100);
      const tideState = classifyTide(seaLevels, i);

      const evaluation = evaluateSurfScore({
        swellHeightM,
        swellPeriodS: swellPeriodRaw,
        windWaveHeightM: windWaveH,
        windSpeedKmh,
        windType,
        swellDeg: swellDirDeg,
        optimalSwellDeg: spot.optimalSwellDeg,
        tideState,
        tidePreference: spot.tidePreference,
        swellWindow: spot.swellWindow,
      });

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
        tideAvailable,
        tidePredicted,
        surfScore: evaluation.score,
        rating: evaluation.rating,
        starType: evaluation.starType,
        starCount: evaluation.starCount,
        swellClass: evaluation.swellClass,
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

  /**
   * 예보 신뢰도 — 오늘로부터 며칠 뒤인가로 정합니다.
   * 파도 모델은 D+7 을 넘어가면 매일 뒤집힙니다. "16일 예보"를 앞뒤 구분 없이
   * 같은 톤으로 보여 주면 사용자가 2주 뒤 계획을 그대로 믿게 됩니다.
   */
  const daysAhead = Math.round(
    (new Date(dateISO + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()) / 86400000
  );
  const confidence: DailyForecast['confidence'] =
    daysAhead <= 2 ? 'HIGH' : daysAhead <= 6 ? 'MEDIUM' : 'LOW';

  return {
    dateStr: `${dObj.getMonth() + 1}/${dObj.getDate()}`,
    fullDateISO: dateISO,
    hasTide: items.some((it) => it.tideAvailable),
    tidePredicted: items.some((it) => it.tideAvailable) && items.every((it) => !it.tideAvailable || it.tidePredicted),
    confidence,
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
    swellClass: bestItem.swellClass,
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
    const evaluation = evaluateSurfScore({
      swellHeightM: waveHeightM,
      swellPeriodS: periodS,
      windSpeedKmh,
      windType,
      swellDeg: spot.optimalSwellDeg,
      optimalSwellDeg: spot.optimalSwellDeg,
      tideState,
      tidePreference: spot.tidePreference,
      swellWindow: spot.swellWindow,
    });

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
      tideAvailable: true, // 폴백은 조위 곡선을 스스로 만들므로 항상 값이 있습니다
      tidePredicted: false,
      surfScore: evaluation.score,
      rating: evaluation.rating,
      starType: evaluation.starType,
      starCount: evaluation.starCount,
      swellClass: evaluation.swellClass,
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

/* ══════════════════════════════════════════════════════════════════════════
   주변 지역 랭킹 — "그래서 어디로 가지?"
   --------------------------------------------------------------------------
   16일 스트립은 **"이 스팟이 언제 좋은가"** 를 답합니다. 그런데 주말 아침에 먼저
   나오는 질문은 하나 더 있습니다: **"오늘/토요일 오후에 어디가 제일 나은가?"**

   그래서 주변 지역을 날짜·시간대 기준으로 점수순 정렬해 최상단에 놓습니다.

   수집은 **한 번만** 합니다(요청 2개). 날짜·시간대를 바꾸면 네트워크를 다시 타지 않고
   받아 둔 시계열을 다시 집계할 뿐입니다 — 옵션을 누를 때마다 로딩이 걸리면
   비교 자체가 안 됩니다.
   ══════════════════════════════════════════════════════════════════════════ */

/** 하루를 나누는 구간 — 스트립의 아침/낮/오후와 같은 정의를 씁니다 */
export type PartKey = 'ALL' | '아침' | '낮' | '오후';

export const PART_OPTIONS: { key: PartKey; label: string; from: number; to: number }[] = [
  { key: 'ALL', label: '종일', from: SURFABLE_HOURS.from, to: SURFABLE_HOURS.to },
  { key: '아침', label: '아침', from: 5, to: 10 },
  { key: '낮', label: '낮', from: 11, to: 15 },
  { key: '오후', label: '오후', from: 16, to: 20 },
];

/**
 * 랭킹용 수집 일수 — 예보 최대치와 같은 16일.
 *
 * (처음엔 페이로드가 수 MB 일 거라 보고 7일로 잡았는데, 실측하니 8스팟 16일이
 *  marine 178KB + weather 86KB 로 충분히 가볍습니다.)
 */
export const NEARBY_DAYS = 16;

/**
 * 랭킹에 넣을 최대 거리(km).
 *
 * 없으면 스팟이 드문 서해에서 **284km 떨어진 동해 스팟이 1위로 올라옵니다.**
 * 점수순으로는 맞지만 "인접 지역"이 아니고, 당일치기로 갈 수 있는 거리도 아닙니다.
 * 반대로 너무 좁히면 카드가 두세 장만 남으므로, 후보가 MIN 개 미만이면
 * 거리 제한을 풀어 가까운 순으로 채웁니다.
 */
export const NEARBY_MAX_KM = 150;
const NEARBY_MIN_CARDS = 4;

export interface NearbyHour {
  timestamp: number;
  hour: number;
  dateISO: string;
  score: number;
  waveHeightM: number;
  swellPeriodS: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  windType: WindType;
}

export interface NearbySpotSeries {
  spot: SurfSpot;
  /** 선택 스팟으로부터의 거리(km) */
  distanceKm: number;
  /** 같은 해양 격자에 묶여 예보가 동일한 다른 스팟 수 */
  sameCellCount: number;
  hours: NearbyHour[];
}

export interface NearbySpotRanked {
  spot: SurfSpot;
  bestScore: number;
  /** 그 점수가 나오는 시각 ('09:00') */
  bestTime: string;
  /** 비슷하게 좋은 구간 ('09–13시'). 한 시간뿐이면 null */
  bestWindow: string | null;
  waveHeightM: number;
  swellPeriodS: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  windType: WindType;
  distanceKm: number;
  sameCellCount: number;
  isSelected: boolean;
}

/** 두 좌표 사이 대략 거리(km). 한반도 위도에서 충분히 정확합니다. */
function roughDistanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (aLat - bLat) * 111;
  const dLon = (aLon - bLon) * 88; // 위도 37° 기준 경도 1° ≈ 88km
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * 선택 스팟 주변 지역의 시계열을 한 번에 가져옵니다.
 * Open-Meteo 는 위경도를 콤마로 이어 붙이면 여러 좌표를 한 번에 주므로
 * 스팟이 몇 개든 요청은 2개(marine + forecast)로 끝납니다.
 */
export async function fetchNearbySeries(
  spotId: string,
  count = 8
): Promise<NearbySpotSeries[]> {
  const origin = KOREA_SURF_SPOTS.find((s) => s.id === spotId) ?? KOREA_SURF_SPOTS[0];

  /**
   * ⚠️ 그냥 '가까운 8곳'을 뽑으면 카드 8개가 전부 같은 숫자로 나옵니다.
   *
   * Open-Meteo 해양 격자는 약 0.083°(≈9km)라, 양양처럼 스팟이 밀집한 구간은
   * 38선·하조대·죽도·인구·동호가 **같은 격자 한 칸**에 들어갑니다. 파고·주기가
   * 물리적으로 동일하니 점수도 같게 나오고, 랭킹이 그냥 거리순 목록이 됩니다.
   *
   * 그래서 **격자 한 칸당 한 곳만** 대표로 세웁니다. 카드마다 실제로 다른 예보가
   * 실리고, 사용자가 원한 "인접 지역 비교"의 단위와도 맞습니다.
   */
  const GRID = 1 / 12; // Open-Meteo marine 격자 간격 (0.0833°)
  const cellKey = (s: SurfSpot) =>
    `${Math.round(s.latitude / GRID)},${Math.round(s.longitude / GRID)}`;

  const byDistance = [...KOREA_SURF_SPOTS]
    .map((s) => ({ s, d: roughDistanceKm(origin.latitude, origin.longitude, s.latitude, s.longitude) }))
    .sort((a, b) => a.d - b.d);

  const cells = new Map<string, { s: SurfSpot; d: number; siblings: number }>();
  for (const cand of byDistance) {
    const key = cellKey(cand.s);
    const seen = cells.get(key);
    if (!seen) {
      cells.set(key, { ...cand, siblings: 0 });
    } else {
      seen.siblings += 1;
      // 선택한 스팟은 대표 자리를 양보하지 않습니다 — 내가 보는 곳이 목록에서 빠지면 안 됩니다
      if (cand.s.id === origin.id) {
        cells.set(key, { s: cand.s, d: cand.d, siblings: seen.siblings });
      }
    }
  }

  const all = [...cells.values()].sort((a, b) => a.d - b.d);
  const within = all.filter((c) => c.d <= NEARBY_MAX_KM);
  const picked = (within.length >= NEARBY_MIN_CARDS ? within : all).slice(0, count);

  const lats = picked.map((p) => p.s.latitude).join(',');
  const lons = picked.map((p) => p.s.longitude).join(',');

  // best_match 는 9일에서 끊기므로 ncep_gfswave025 로 16일까지 이어 붙입니다
  // (자세한 이유는 fetchLive16DaysForecasts 의 marineUrl 주석 참고)
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
    `&hourly=wave_height,wave_period,swell_wave_height,swell_wave_period,swell_wave_direction,wind_wave_height,sea_level_height_msl` +
    `&forecast_days=${NEARBY_DAYS}&timezone=Asia%2FSeoul&models=best_match,ncep_gfswave025`;
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
    `&hourly=wind_speed_10m,wind_direction_10m&forecast_days=${NEARBY_DAYS}&timezone=Asia%2FSeoul`;

  const [marineRes, weatherRes] = await Promise.all([fetch(marineUrl), fetch(weatherUrl)]);
  if (!marineRes.ok || !weatherRes.ok) throw new Error('주변 지역 예보 응답 실패');

  const marineJson = await marineRes.json();
  const weatherJson = await weatherRes.json();
  // 좌표가 여러 개면 배열, 하나면 객체로 옵니다
  const marineArr = Array.isArray(marineJson) ? marineJson : [marineJson];
  const weatherArr = Array.isArray(weatherJson) ? weatherJson : [weatherJson];

  const out: NearbySpotSeries[] = [];

  picked.forEach(({ s: spot, d, siblings }, idx) => {
    const m = marineArr[idx];
    const w = weatherArr[idx];
    if (!m?.hourly?.time || !w?.hourly?.time) return;

    const times: string[] = m.hourly.time;
    const merge = (base: string): (number | null)[] => {
      const primary: (number | null)[] = m.hourly[`${base}_marine_best_match`] ?? [];
      const backup: (number | null)[] = m.hourly[`${base}_ncep_gfswave025`] ?? [];
      return times.map((_: string, i: number) => primary[i] ?? backup[i] ?? null);
    };
    const heights = merge('wave_height');
    const periods = merge('wave_period');
    const swellHeights = merge('swell_wave_height');
    const swellPeriods = merge('swell_wave_period');
    const windWaves = merge('wind_wave_height');
    const swellDirs = merge('swell_wave_direction');
    const seaLevels: number[] = (m.hourly.sea_level_height_msl_marine_best_match ?? []).map(
      (v: number | null) => v ?? 0
    );
    const windSpeeds: number[] = w.hourly.wind_speed_10m ?? [];
    const windDirs: number[] = w.hourly.wind_direction_10m ?? [];

    const hours: NearbyHour[] = [];

    for (let i = 0; i < times.length; i++) {
      const dateObj = new Date(times[i]);
      const hour = dateObj.getHours();
      // 밤에는 바람이 잦아들어 글래시가 되므로 점수가 높게 나옵니다.
      // 물리적으로는 맞지만 서핑 예보로는 쓸모가 없어 낮 시간대만 담습니다.
      if (hour < SURFABLE_HOURS.from || hour > SURFABLE_HOURS.to) continue;
      // 파고가 없는 시각은 담지 않습니다. 0 으로 채우면 '플랫'인 척하게 됩니다.
      if (heights[i] === null || heights[i] === undefined) continue;

      const waveH = Math.round((heights[i] as number) * 10) / 10;
      const periodS = Math.round((periods[i] as number) ?? 0);
      const windKmh = Math.round(windSpeeds[i] ?? 0);
      const windDeg = Math.round(windDirs[i] ?? spot.optimalWindDeg);
      const windType = calculateWindType(windDeg, windKmh, spot.optimalWindDeg);
      const { score } = evaluateSurfScore({
        swellHeightM: (swellHeights[i] as number) ?? waveH,
        swellPeriodS: (swellPeriods[i] as number) ?? periodS,
        windWaveHeightM: (windWaves[i] as number) ?? 0,
        windSpeedKmh: windKmh,
        windType,
        swellDeg: Math.round(swellDirs[i] ?? spot.optimalSwellDeg),
        optimalSwellDeg: spot.optimalSwellDeg,
        tideState: classifyTide(seaLevels, i),
        tidePreference: spot.tidePreference,
        swellWindow: spot.swellWindow,
      });

      hours.push({
        timestamp: dateObj.getTime(),
        hour,
        dateISO: `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`,
        score,
        waveHeightM: waveH,
        swellPeriodS: periodS,
        windSpeedKmh: windKmh,
        windDirectionDeg: windDeg,
        windType,
      });
    }

    if (hours.length > 0) {
      out.push({ spot, distanceKm: Math.round(d), sameCellCount: siblings, hours });
    }
  });

  return out;
}

/** 랭킹 행의 날짜 칩 목록 — 받아 둔 시계열에서 그대로 뽑습니다 */
export function nearbyDateOptions(
  series: NearbySpotSeries[]
): { dateISO: string; label: string; sub: string; isWeekend: boolean }[] {
  const seen = new Map<string, Date>();
  for (const s of series) {
    for (const h of s.hours) if (!seen.has(h.dateISO)) seen.set(h.dateISO, new Date(h.timestamp));
  }
  const today = todayISO();
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  return [...seen.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([dateISO, d], i) => ({
      dateISO,
      label: dateISO === today ? '오늘' : i === 1 ? '내일' : WEEK[d.getDay()],
      sub: `${d.getMonth() + 1}/${d.getDate()}`,
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
    }));
}

/**
 * 고른 날짜·시간대 기준으로 지역을 점수순 정렬합니다.
 *
 * 네트워크를 타지 않습니다 — 이미 받아 둔 시계열을 다시 집계할 뿐이라
 * 옵션을 눌러도 즉시 바뀝니다.
 */
export function rankNearby(
  series: NearbySpotSeries[],
  dateISO: string,
  part: PartKey,
  selectedSpotId: string
): NearbySpotRanked[] {
  const slot = PART_OPTIONS.find((p) => p.key === part) ?? PART_OPTIONS[0];

  const ranked = series.flatMap((entry) => {
    const inRange = entry.hours.filter(
      (h) => h.dateISO === dateISO && h.hour >= slot.from && h.hour <= slot.to
    );
    if (inRange.length === 0) return [];

    const best = inRange.reduce((a, b) => (b.score > a.score ? b : a), inRange[0]);

    // 최고점 주변으로 "비슷하게 좋은" 구간을 넓혀 시간대를 만듭니다.
    // 점 하나만 찍어 주면 "9시에만 좋은 건가?" 가 남습니다.
    const threshold = Math.max(0, best.score - 8);
    const bestIdx = inRange.indexOf(best);
    let from = bestIdx;
    let to = bestIdx;
    while (from - 1 >= 0 && inRange[from - 1].score >= threshold) from--;
    while (to + 1 < inRange.length && inRange[to + 1].score >= threshold) to++;

    const pad = (n: number) => String(n).padStart(2, '0');

    return [
      {
        spot: entry.spot,
        bestScore: best.score,
        bestTime: `${pad(best.hour)}:00`,
        bestWindow: to > from ? `${pad(inRange[from].hour)}–${pad(inRange[to].hour)}시` : null,
        waveHeightM: best.waveHeightM,
        swellPeriodS: best.swellPeriodS,
        windSpeedKmh: best.windSpeedKmh,
        windDirectionDeg: best.windDirectionDeg,
        windType: best.windType,
        distanceKm: entry.distanceKm,
        sameCellCount: entry.sameCellCount,
        isSelected: entry.spot.id === selectedSpotId,
      },
    ];
  });

  // 점수 내림차순. 같으면 가까운 순.
  return ranked.sort((a, b) => b.bestScore - a.bestScore || a.distanceKm - b.distanceKm);
}
