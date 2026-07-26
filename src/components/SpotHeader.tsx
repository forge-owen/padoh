/**
 * @file src/components/SpotHeader.tsx
 * @description 지역 컨디션 바 — 16일 스트립 바로 아래, **두 줄**로 끝냅니다.
 *
 * 예전에는 지도 옆 우측 컬럼을 세로로 가득 채우는 큰 카드였습니다(히어로 숫자 40px +
 * 미터 + 피크 타임 블록 + 3단 지표 리스트 + 설명문). 정보량 대비 세로 공간을 너무
 * 많이 먹어서, 정작 "지금 어떤지"를 알려면 스크롤이 필요했습니다.
 *
 * 지금 구조:
 *   1행) 스팟명 · 바닥 타입 · 실시간 배지 · 가이드/라이브캠 버튼
 *   2행) 판정 · 파고 · 스웰 에너지 · 바람(다이얼) · 날씨 · 기준 시각
 *
 * 2행은 칩들이 가로로 흐르다 좁아지면 자연스럽게 줄바꿈됩니다(모바일에서 3~4줄).
 * 스팟 설명문은 가이드 모달의 '스팟 특징'과 중복이라 여기서 뺐습니다.
 */

import React from 'react';
import { MapPin, Info, Video, Clock } from 'lucide-react';
import { SurfSpot, HourlyForecast, DailyHighlight, DailyForecast } from '../types/surf';
import { windMeta, energyAdvice, verdictOf, verdictReason } from '../utils/scoreVisuals';
import { weatherMeta } from '../utils/weather';
import { WindDial } from './WindDial';

interface SpotHeaderProps {
  spot: SurfSpot;
  /** 스트립에서 선택된 날 */
  day: DailyForecast;
  currentForecast: HourlyForecast;
  highlight: DailyHighlight;
  onOpenGuide: () => void;
}

const BOTTOM_LABEL: Record<SurfSpot['bottomType'], string> = {
  SANDBAR: '모래',
  REEF: '리프',
  POINT_BREAK: '포인트',
};

/** 라벨 위 / 값 아래 2단 칩. 2행의 기본 단위입니다. */
const Metric: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <span className="inline-flex flex-col leading-tight">
    <span className="text-[10px]" style={{ color: 'var(--ink-mark)' }}>
      {label}
    </span>
    <span className="text-sm font-semibold num" style={{ color: 'var(--ink)' }}>
      {children}
    </span>
  </span>
);

const Divider: React.FC = () => (
  <span className="hidden sm:block w-px h-7 shrink-0" style={{ background: 'var(--line-soft)' }} aria-hidden />
);

export const SpotHeader: React.FC<SpotHeaderProps> = ({
  spot,
  day,
  currentForecast,
  highlight,
  onOpenGuide,
}) => {
  const {
    waveHeightM,
    swellPeriodS,
    swellEnergyKJ,
    windSpeedKmh,
    windDirectionDeg,
    windDirectionText,
    windType,
    surfScore,
    isLiveApi,
    time,
    temperatureC,
    precipProbability,
    weatherCode,
  } = currentForecast;

  const wind = windMeta(windType);
  const verdict = verdictOf(surfScore);
  const weather = weatherMeta(weatherCode);

  return (
    <section className="panel px-4 sm:px-5 py-3">
      {/* 1행 — 아이덴티티 */}
      <div className="flex items-center gap-2 flex-wrap">
        <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} aria-hidden />
        <span className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>
          {spot.name}
        </span>
        <span className="badge badge-mute">{BOTTOM_LABEL[spot.bottomType]}</span>
        {isLiveApi ? (
          <span className="badge badge-tide">
            <span className="live-dot" aria-hidden />
            실시간
          </span>
        ) : (
          <span className="badge badge-poor">오프라인 추정치</span>
        )}
        <span className="text-[11px] truncate hidden md:inline" style={{ color: 'var(--ink-3)' }}>
          {spot.locationName}
        </span>

        <span className="ml-auto inline-flex items-center gap-1.5 shrink-0">
          {spot.liveCamUrl && (
            <a
              href={spot.liveCamUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost !px-2 !py-1.5"
              aria-label={spot.liveCamTitle || '라인업 라이브 카메라'}
            >
              <Video className="w-3.5 h-3.5" style={{ color: 'var(--rose)' }} />
            </a>
          )}
          <button onClick={onOpenGuide} className="btn btn-ghost !px-2.5 !py-1.5">
            <Info className="w-3.5 h-3.5" /> 가이드
          </button>
        </span>
      </div>

      {/* 2행 — 지표 */}
      <div className="flex items-center gap-x-3.5 gap-y-2.5 flex-wrap mt-2.5">
        {/* 판정 — 이 줄의 앵커 */}
        <span
          className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg shrink-0"
          style={{ background: verdict.softVar }}
        >
          <span className="text-base font-bold leading-none" style={{ color: verdict.colorVar }}>
            {verdict.label}
          </span>
          <span className="text-[11px] font-semibold num" style={{ color: verdict.colorVar, opacity: 0.75 }}>
            {surfScore}
          </span>
          <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--ink-3)' }}>
            {verdictReason(surfScore, swellEnergyKJ, windType)}
          </span>
        </span>

        <Divider />

        <Metric label="파고">
          {waveHeightM.toFixed(1)}
          <span className="text-[10px] font-medium ml-0.5" style={{ color: 'var(--ink-3)' }}>
            m · {swellPeriodS}초
          </span>
        </Metric>

        <Divider />

        <Metric label={`스웰 에너지 · ${energyAdvice(swellEnergyKJ)}`}>
          {swellEnergyKJ.toLocaleString('ko-KR')}
          <span className="text-[10px] font-medium ml-0.5" style={{ color: 'var(--ink-3)' }}>
            kJ
          </span>
        </Metric>

        <Divider />

        {/* 바람 — 다이얼이 방향을, 라벨이 의미를 */}
        <span className="inline-flex items-center gap-2 shrink-0">
          <WindDial
            windDirectionDeg={windDirectionDeg}
            optimalOffshoreDeg={spot.optimalWindDeg}
            windType={windType}
            windSpeedKmh={windSpeedKmh}
            size={32}
          />
          <span className="inline-flex flex-col leading-tight">
            <span className="text-[10px]" style={{ color: 'var(--ink-mark)' }}>
              {wind.flow} · {windDirectionText}
            </span>
            <span className="text-sm font-semibold" style={{ color: wind.colorVar }}>
              {wind.label}
              <span className="text-[11px] font-medium num ml-1" style={{ color: 'var(--ink-3)' }}>
                {windSpeedKmh}km/h
              </span>
            </span>
          </span>
        </span>

        <Divider />

        {/* 날씨 */}
        <span className="inline-flex items-center gap-2 shrink-0">
          <weather.Icon className="w-5 h-5" style={{ color: weather.colorVar }} aria-hidden />
          <span className="inline-flex flex-col leading-tight">
            <span className="text-[10px]" style={{ color: 'var(--ink-mark)' }}>
              {weather.label}
              {precipProbability >= 20 && ` · 강수 ${precipProbability}%`}
            </span>
            <span className="text-sm font-semibold num" style={{ color: 'var(--ink)' }}>
              {temperatureC}°
            </span>
          </span>
        </span>

        {/* 기준 시각 · 피크 — 오른쪽 끝으로 밀어 둡니다 */}
        <span
          className="inline-flex items-center gap-1.5 text-[11px] ml-auto shrink-0"
          style={{ color: 'var(--ink-3)' }}
        >
          <Clock className="w-3.5 h-3.5" />
          <span className="num">
            {day.isToday ? '지금' : `${day.dateStr}(${day.dayOfWeek})`} {time}
          </span>
          <span style={{ color: 'var(--ink-mark)' }}>· 피크</span>
          <span className="num font-medium" style={{ color: 'var(--ink-2)' }}>
            {highlight.bestTime}
          </span>
        </span>
      </div>
    </section>
  );
};
