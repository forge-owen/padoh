/**
 * @file src/components/HourlyForecastTable.tsx
 * @description 선택한 날의 시간별 예보.
 *
 * 왼쪽 항목 열은 `position: sticky` 로 고정됩니다. 이때 **스크롤 컨테이너에 좌우 패딩을
 * 주면 안 됩니다.** `-mx-6 px-6` 조합을 쓰던 이전 버전은 sticky 열이 컨테이너 경계(left:0)에
 * 붙는데 콘텐츠는 패딩 24px 안쪽에서 시작해서, 스크롤할 때 다른 셀들이 sticky 열 **왼쪽
 * 여백 구간으로 그대로 지나가 보였습니다.** 지금은 컨테이너에 패딩을 두지 않고 첫 열 자체가
 * 그 여백을 갖습니다(`pl-6`). sticky 열에는 오른쪽 그림자를 줘 경계를 분명히 했습니다.
 *
 * 색은 전부 테마 토큰. 스코어 행은 순차 램프 히트맵이지만 숫자를 항상 함께 둡니다.
 */

import React from 'react';
import { HourlyForecast, DailyForecast, SurfSpot } from '../types/surf';
import { Zap, Wind, Waves, Clock, Droplets, Thermometer, Umbrella } from 'lucide-react';
import { scoreFillStyle, scoreColorVar, verdictOf } from '../utils/scoreVisuals';
import { weatherMeta } from '../utils/weather';
import { WindDial } from './WindDial';

interface HourlyForecastTableProps {
  /** 이미 선택된 날짜로 걸러진 시간별 예보 */
  forecasts: HourlyForecast[];
  day: DailyForecast;
  spot: SurfSpot;
  onSelectTime: (forecast: HourlyForecast) => void;
  selectedTimestamp?: number;
}

/**
 * 왼쪽 고정 행 라벨.
 * 배경을 직접 칠하고(투명하면 셀이 비쳐 지나감) 오른쪽 그림자로 경계를 만듭니다.
 */
const RowLabel: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; strong?: boolean }> = ({
  icon,
  children,
  strong,
}) => (
  <th
    scope="row"
    className="py-2 pl-4 sm:pl-6 pr-3 text-left align-middle sticky left-0 z-20 whitespace-nowrap font-medium text-xs"
    style={{
      background: 'var(--surface)',
      color: strong ? 'var(--ink)' : 'var(--ink-3)',
      boxShadow: '1px 0 0 var(--line-soft), 6px 0 8px -6px rgba(0,0,0,0.10)',
    }}
  >
    <span className="inline-flex items-center gap-1.5">
      {icon}
      {children}
    </span>
  </th>
);

export const HourlyForecastTable: React.FC<HourlyForecastTableProps> = ({
  forecasts,
  day,
  spot,
  onSelectTime,
  selectedTimestamp,
}) => {
  // 날짜 선택은 상단 스트립이 담당하므로 여기서 오늘/내일 탭을 따로 두지 않습니다
  const displayed = forecasts;
  if (displayed.length === 0) return null;

  // 하루 안에서는 출처가 균일하므로 한 항목만 봐도 됩니다
  const hasPrecipMm = displayed.some((fc) => fc.precipMm !== undefined);

  return (
    <section className="panel py-5 animate-riseIn">
      <header className="px-5 sm:px-6 pb-4">
        <h2 className="flex items-center gap-2">
          <Clock className="w-4 h-4" style={{ color: 'var(--brand)' }} />
          {day.isToday ? '오늘' : `${day.dateStr}(${day.dayOfWeek})`} 시간별 예보
        </h2>
        <p className="text-xs mt-1" style={{ color: 'var(--ink-3)' }}>
          시간을 누르면 위 컨디션 카드가 그 시각으로 바뀝니다. 날짜는 맨 위 스트립에서 고릅니다.
        </p>
      </header>

      {/* 스크롤 컨테이너 — 좌우 패딩 금지 (파일 상단 주석 참고) */}
      <div className="scroll-x">
        <table className="w-full min-w-[900px] text-center text-xs border-separate border-spacing-0">
          <caption className="sr-only">
            {day.dateStr} 시간별 서핑 컨디션과 날씨
          </caption>

          <thead>
            <tr>
              <th
                scope="col"
                className="py-2 pl-4 sm:pl-6 pr-3 text-left sticky left-0 z-20 label-eyebrow font-medium"
                style={{
                  background: 'var(--surface)',
                  boxShadow: '1px 0 0 var(--line-soft), 6px 0 8px -6px rgba(0,0,0,0.10)',
                }}
              >
                시간
              </th>
              {displayed.map((fc, i) => {
                const isSelected = selectedTimestamp === fc.timestamp;
                return (
                  <th
                    key={fc.timestamp}
                    scope="col"
                    onClick={() => onSelectTime(fc)}
                    className="py-2 px-2 cursor-pointer font-medium transition-colors"
                    style={{
                      color: isSelected ? 'var(--brand)' : 'var(--ink-3)',
                      paddingRight: i === displayed.length - 1 ? 24 : undefined,
                    }}
                  >
                    <span className="block num">{fc.time.slice(0, 2)}</span>
                    <span
                      className="block mx-auto mt-1 h-0.5 w-5 rounded-full"
                      style={{ background: isSelected ? 'var(--brand)' : 'transparent' }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="[&>tr>*]:border-t [&>tr>*]:border-[var(--line-soft)]">
            {/* ── 날씨 ─────────────────────────────────────────────── */}
            <tr>
              <RowLabel strong>날씨</RowLabel>
              {displayed.map((fc) => {
                const w = weatherMeta(fc.weatherCode);
                return (
                  <td key={fc.timestamp} className="py-2 px-1" title={w.label}>
                    <w.Icon className="w-4 h-4 mx-auto" style={{ color: w.colorVar }} aria-hidden />
                    <span className="sr-only">{w.label}</span>
                  </td>
                );
              })}
            </tr>

            <tr>
              <RowLabel icon={<Thermometer className="w-3.5 h-3.5" style={{ color: 'var(--rose)' }} />}>
                기온
              </RowLabel>
              {displayed.map((fc) => (
                <td key={fc.timestamp} className="py-1.5 px-2" style={{ color: 'var(--ink-2)' }}>
                  {fc.temperatureC}°
                </td>
              ))}
            </tr>

            <tr>
              {/*
                과거 날짜(ERA5 재분석) 는 '확률' 개념이 없고 실제로 내린 양(mm)만 있습니다.
                확률이 없는데 억지로 값을 지어내지 않고, 행 자체를 "강수량(실측)"으로
                바꿔서 무엇을 보고 있는지 정직하게 표시합니다.
              */}
              <RowLabel icon={<Umbrella className="w-3.5 h-3.5" style={{ color: 'var(--tide)' }} />}>
                {hasPrecipMm ? '강수량 · 실측' : '강수 확률'}
              </RowLabel>
              {displayed.map((fc) =>
                fc.precipMm !== undefined ? (
                  <td
                    key={fc.timestamp}
                    className="py-1.5 px-2"
                    style={{
                      color: fc.precipMm >= 1 ? 'var(--tide)' : 'var(--ink-3)',
                      fontWeight: fc.precipMm >= 1 ? 600 : 400,
                      background:
                        fc.precipMm > 0
                          ? `color-mix(in srgb, var(--tide) ${Math.min(60, Math.round(fc.precipMm * 15))}%, transparent)`
                          : undefined,
                    }}
                  >
                    {fc.precipMm}
                    <span className="text-[10px] ml-0.5">mm</span>
                  </td>
                ) : (
                  <td
                    key={fc.timestamp}
                    className="py-1.5 px-2"
                    style={{
                      color: fc.precipProbability >= 50 ? 'var(--tide)' : 'var(--ink-3)',
                      fontWeight: fc.precipProbability >= 50 ? 600 : 400,
                      background:
                        fc.precipProbability >= 20
                          ? `color-mix(in srgb, var(--tide) ${Math.round(fc.precipProbability / 6)}%, transparent)`
                          : undefined,
                    }}
                  >
                    {fc.precipProbability}%
                  </td>
                )
              )}
            </tr>

            {/* ── 파도 ─────────────────────────────────────────────── */}
            <tr>
              <RowLabel icon={<Waves className="w-3.5 h-3.5" style={{ color: 'var(--tide)' }} />} strong>
                파고
              </RowLabel>
              {displayed.map((fc) => (
                <td key={fc.timestamp} className="py-2 px-2">
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>
                    {fc.waveHeightM.toFixed(1)}
                  </span>
                  <span className="text-[10px] ml-0.5" style={{ color: 'var(--ink-3)' }}>
                    m
                  </span>
                </td>
              ))}
            </tr>

            <tr>
              <RowLabel>스웰 주기</RowLabel>
              {displayed.map((fc) => (
                <td
                  key={fc.timestamp}
                  className="py-1.5 px-2"
                  style={{
                    color: fc.swellPeriodS >= 8 ? 'var(--tide)' : 'var(--ink-3)',
                    fontWeight: fc.swellPeriodS >= 8 ? 500 : 400,
                  }}
                >
                  {fc.swellPeriodS}s
                </td>
              ))}
            </tr>

            <tr>
              <RowLabel icon={<Zap className="w-3.5 h-3.5" style={{ color: 'var(--gold)' }} />} strong>
                스웰 에너지
              </RowLabel>
              {displayed.map((fc) => (
                <td
                  key={fc.timestamp}
                  className="py-2 px-2"
                  style={{
                    color: fc.swellEnergyKJ >= 80 ? 'var(--gold)' : 'var(--ink-2)',
                    fontWeight: fc.swellEnergyKJ >= 80 ? 600 : 400,
                  }}
                >
                  {fc.swellEnergyKJ}
                </td>
              ))}
            </tr>

            {/* ── 바람 ─────────────────────────────────────────────── */}
            <tr>
              <RowLabel icon={<Wind className="w-3.5 h-3.5" style={{ color: 'var(--rose)' }} />} strong>
                바람
              </RowLabel>
              {displayed.map((fc) => (
                <td key={fc.timestamp} className="py-2 px-2">
                  <span style={{ color: 'var(--ink)' }}>{fc.windSpeedKmh}</span>
                  <span className="block text-[10px]" style={{ color: 'var(--ink-3)' }}>
                    km/h
                  </span>
                </td>
              ))}
            </tr>

            {/* 나침반이 아니라 해변 단면. 위=해변, 아래=바다 */}
            <tr>
              <RowLabel>바람 방향</RowLabel>
              {displayed.map((fc) => (
                <td key={fc.timestamp} className="py-1.5 px-1">
                  <span className="inline-flex justify-center w-full">
                    <WindDial
                      windDirectionDeg={fc.windDirectionDeg}
                      optimalOffshoreDeg={spot.optimalWindDeg}
                      windType={fc.windType}
                      windSpeedKmh={fc.windSpeedKmh}
                      size={24}
                    />
                  </span>
                </td>
              ))}
            </tr>

            {/* ── 물때 · 종합 ──────────────────────────────────────── */}
            <tr>
              <RowLabel icon={<Droplets className="w-3.5 h-3.5" style={{ color: 'var(--tide)' }} />}>
                물때
              </RowLabel>
              {displayed.map((fc) => (
                <td key={fc.timestamp} className="py-1.5 px-2" style={{ color: 'var(--ink-3)' }}>
                  {/* 조위는 약 9일까지만 제공됩니다. 없는 구간에 0cm 를 찍으면
                      '간조'로 읽히므로 값 대신 줄표를 둡니다(TideChart 와 같은 규칙). */}
                  {fc.tideAvailable ? (
                    <span
                      title={fc.tidePredicted ? '조화분해 예측값 (조위 모델 범위 밖)' : undefined}
                      style={
                        fc.tidePredicted
                          ? { borderBottom: '1px dashed var(--gold)', color: 'var(--gold)' }
                          : undefined
                      }
                    >
                      {fc.tideHeightCm}
                      <span className="text-[10px] ml-0.5">cm</span>
                    </span>
                  ) : (
                    <span title="이 날짜는 조위 예보 범위 밖입니다" style={{ color: 'var(--ink-mark)' }}>
                      –
                    </span>
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <RowLabel strong>서프 스코어</RowLabel>
              {displayed.map((fc) => (
                <td
                  key={fc.timestamp}
                  className="py-2 px-2"
                  style={scoreFillStyle(fc.surfScore)}
                  title={`${fc.time} · ${fc.surfScore}점 (${verdictOf(fc.surfScore).label})`}
                >
                  <span className="font-semibold" style={{ color: scoreColorVar(fc.surfScore) }}>
                    {fc.surfScore}
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 범례 — 색만으로 읽히지 않게 판정 라벨을 명시 */}
      <div
        className="flex items-center gap-3 px-5 sm:px-6 pt-3 text-[11px]"
        style={{ color: 'var(--ink-3)' }}
      >
        <span>스코어</span>
        {[80, 50, 10].map((sample) => {
          const v = verdictOf(sample);
          return (
            <span key={v.level} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: v.fillVar }}
                aria-hidden
              />
              <span>{v.label}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
};
