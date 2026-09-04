/**
 * @file src/components/ForecastStrip.tsx
 * @description 16일 파도 스트립 — 이 앱의 메인 컨트롤.
 *
 * 화면 최상단에 있고, **여기서 날짜를 고르면 아래의 모든 정보가 그 날짜로 바뀝니다**
 * (지금 컨디션 카드 · 24시간 표 · 물때 차트). 지도에서 스팟을 바꾸면 스트립 전체가
 * 새 스팟으로 갱신됩니다.
 *
 * 세로 공간을 아끼려고 헤더를 한 줄로 압축했습니다:
 *   [스팟명] [브리핑 한 줄] .......... [범례]
 *
 * 판정은 색만으로 말하지 않습니다 — 색 + 도형 + 한글 라벨 세 채널로 나갑니다.
 * 바람은 나침반 대신 해변 단면 다이어그램을 씁니다(WindDial 참고).
 */

import React, { useEffect, useRef } from 'react';
import { DailyForecast, DayPart, SurfSpot } from '../types/surf';
import { MapPin, Trophy, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { verdictOf, Verdict } from '../utils/scoreVisuals';
import { weatherMeta } from '../utils/weather';
import { WindDial, WindDialLegend } from './WindDial';

interface ForecastStripProps {
  dailyList: DailyForecast[];
  spot: SurfSpot;
  briefing: string;
  selectedDateISO: string;
  onSelectDate: (dateISO: string) => void;
}

/**
 * 판정 아이콘 — 색맹·흑백 출력에서도 구분되도록 도형이 다릅니다.
 * 좋음=꽉 찬 원 · 평범=마름모 · 나쁨=납작한 막대
 */
const VerdictGlyph: React.FC<{ verdict: Verdict; size?: number }> = ({ verdict, size = 9 }) => {
  const base: React.CSSProperties = { width: size, height: size, background: verdict.fillVar, flex: 'none' };
  if (verdict.shape === 'circle') return <span style={{ ...base, borderRadius: '50%' }} aria-hidden />;
  if (verdict.shape === 'diamond')
    return <span style={{ ...base, borderRadius: 2, transform: 'rotate(45deg)' }} aria-hidden />;
  return <span style={{ ...base, height: Math.max(3, size / 3), borderRadius: 999 }} aria-hidden />;
};

/** 아침/낮/오후 한 칸 */
const PartCell: React.FC<{ part: DayPart; offshoreDeg: number }> = ({ part, offshoreDeg }) => {
  const verdict = verdictOf(part.surfScore);
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
      <span className="text-[9px] leading-none" style={{ color: 'var(--ink-mark)' }}>
        {part.label}
      </span>
      <WindDial
        windDirectionDeg={part.windDirectionDeg}
        optimalOffshoreDeg={offshoreDeg}
        windType={part.windType}
        windSpeedKmh={part.windSpeedKmh}
        size={24}
      />
      <span
        className="w-full h-[5px] rounded-full"
        style={{ background: verdict.fillVar }}
        aria-hidden
      />
    </div>
  );
};

const DayCard: React.FC<{
  day: DailyForecast;
  offshoreDeg: number;
  isSelected: boolean;
  isBest: boolean;
  onSelect: () => void;
}> = ({ day, offshoreDeg, isSelected, isBest, onSelect }) => {
  const verdict = verdictOf(day.maxSurfScore);
  const weather = weatherMeta(day.weatherCode);
  const isFlat = day.maxWaveHeightM < 0.2;
  // 파도 모델은 D+7 을 넘으면 매일 뒤집힙니다. 앞날과 같은 톤으로 보여 주면
  // 사용자가 2주 뒤 계획을 그대로 믿게 됩니다.
  const isLowConfidence = day.confidence === 'LOW';

  return (
    <button
      onClick={onSelect}
      aria-pressed={isSelected}
      className="relative shrink-0 w-[104px] rounded-xl px-2 pt-2 pb-1.5 text-left flex flex-col gap-1 transition-all duration-150 snap-start"
      style={{
        background: isSelected ? 'var(--surface)' : 'transparent',
        // 신뢰도가 낮은 날(D+7~)은 테두리를 점선으로. 색을 바꾸면 판정색과 충돌합니다.
        border: isSelected
          ? '1px solid var(--brand)'
          : isLowConfidence
            ? '1px dashed var(--line)'
            : '1px solid transparent',
        boxShadow: isSelected ? 'var(--shadow-lift)' : undefined,
      }}
      aria-label={`${day.isToday ? '오늘' : day.dayOfWeek + '요일'} ${day.dateStr} — ${verdict.label} ${day.maxSurfScore}점, 파고 ${day.minWaveHeightM.toFixed(1)}~${day.maxWaveHeightM.toFixed(1)}미터, ${weather.label}, ${day.minTempC}~${day.maxTempC}도${isLowConfidence ? ', 장기 예보라 정확도가 낮습니다' : ''}${day.hasTide ? '' : ', 조위 예보 없음'}`}
      title={isLowConfidence ? '장기 예보 — 추세 참고용. 날짜가 가까워지면 크게 바뀝니다.' : undefined}
    >
      {isBest && (
        <span
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 badge badge-good px-1.5 py-0 text-[9px]"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <Trophy className="w-2.5 h-2.5" /> 베스트
        </span>
      )}

      {/* 1행: 날짜 + 판정.
          판정이 배경 있는 블록으로 한 줄을 통째로 먹던 걸 날짜 줄로 합쳐 한 행을 줄였습니다. */}
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex items-baseline gap-1 min-w-0">
          <span
            className={`text-xs ${day.isToday || isSelected ? 'font-bold' : 'font-medium'}`}
            style={{ color: day.isToday ? 'var(--brand)' : day.isWeekend ? 'var(--rose)' : 'var(--ink-2)' }}
          >
            {day.isToday ? '오늘' : day.dayOfWeek}
          </span>
          <span className="text-[10px] num truncate" style={{ color: 'var(--ink-mark)' }}>
            {day.dateStr}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 shrink-0">
          <VerdictGlyph verdict={verdict} size={7} />
          <span className="text-[10px] font-bold leading-none" style={{ color: verdict.colorVar }}>
            {verdict.label}
          </span>
        </span>
      </div>

      {/* 2행: 파고 + 날씨 아이콘. 파고 범위가 한 줄에 들어가도록 아이콘만 옆에 둡니다. */}
      <div className="flex items-center justify-between gap-1">
        {isFlat ? (
          <span className="text-[15px] font-bold leading-none" style={{ color: 'var(--ink-3)' }}>
            플랫
          </span>
        ) : (
          <span className="text-[15px] font-bold leading-none num whitespace-nowrap" style={{ color: 'var(--ink)' }}>
            {day.minWaveHeightM.toFixed(1)}–{day.maxWaveHeightM.toFixed(1)}
            <span className="text-[9px] font-medium ml-0.5" style={{ color: 'var(--ink-3)' }}>
              m
            </span>
          </span>
        )}
        <weather.Icon
          className="w-4 h-4 shrink-0"
          style={{ color: weather.colorVar }}
          aria-hidden
        />
      </div>

      {/* 3행: 기온 · 강수확률 */}
      <div
        className="flex items-center justify-between text-[9px] num whitespace-nowrap"
        style={{ color: 'var(--ink-mark)' }}
      >
        <span>
          {day.minTempC}°/{day.maxTempC}°
        </span>
        {day.maxPrecipProbability >= 20 ? (
          <span style={{ color: 'var(--tide)' }}>{day.maxPrecipProbability}%</span>
        ) : isLowConfidence ? (
          <span title="장기 예보 — 추세 참고용">≈</span>
        ) : null}
      </div>

      {/* 4행: 아침 / 낮 / 오후 */}
      <div className="flex items-stretch gap-0.5 mt-0.5">
        {day.parts.map((part) => (
          <PartCell key={part.label} part={part} offshoreDeg={offshoreDeg} />
        ))}
      </div>
    </button>
  );
};

/**
 * 날짜 입력의 min/max — 실제 데이터 가용 여부의 권위자가 아니라, 네이티브
 * 달력 피커가 터무니없이 먼 날짜를 안 내놓게 하는 UI 가드레일입니다.
 * 진짜 가용성은 App.tsx 의 fetchHistoricalDay 응답(있으면 보여주고 없으면
 * "파도 데이터가 없습니다" 를 정직하게 보여주는 것)이 결정합니다.
 */
function dateJumpBounds() {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  const max = new Date(today);
  max.setDate(max.getDate() + 15); // 16일 스트립의 마지막 날 = 예보가 실제로 도는 한계
  const min = new Date(today);
  min.setFullYear(min.getFullYear() - 5); // marine 재분석의 실측 창이 대략 이만큼입니다
  return { min: toISO(min), max: toISO(max) };
}

export const ForecastStrip: React.FC<ForecastStripProps> = ({
  dailyList,
  spot,
  briefing,
  selectedDateISO,
  onSelectDate,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // 스팟이 바뀌면 스크롤을 처음(오늘)으로 되돌립니다.
  // 그러지 않으면 16일 중 8일쯤 스크롤해 둔 상태가 그대로 남아 새 스팟의 오늘이 화면 밖입니다.
  useEffect(() => {
    scrollerRef.current?.scrollTo({ left: 0, behavior: 'auto' });
  }, [spot.id]);

  if (dailyList.length === 0) return null;

  const bestScore = Math.max(...dailyList.map((d) => d.maxSurfScore));
  // 최고점이 '나쁨' 구간이면 베스트를 찍지 않습니다. 나쁜 날들 중 1등은 추천이 아닙니다.
  const bestISO = bestScore >= 38 ? dailyList.find((d) => d.maxSurfScore === bestScore)?.fullDateISO : undefined;

  const scrollBy = (dir: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });
  };

  const bounds = dateJumpBounds();

  return (
    <section className="panel px-4 sm:px-5 py-3.5">
      {/* 한 줄 헤더 — 위치 + 브리핑 + 범례 */}
      <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap mb-2.5">
        <span className="inline-flex items-center gap-1.5 shrink-0">
          <MapPin className="w-4 h-4" style={{ color: 'var(--brand)' }} aria-hidden />
          <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {spot.name}
          </span>
        </span>

        <span className="hidden sm:block w-px h-4 shrink-0" style={{ background: 'var(--line)' }} aria-hidden />

        <p className="text-xs min-w-0 flex-1 truncate" style={{ color: 'var(--ink-2)' }} title={briefing}>
          {briefing}
        </p>

        <span className="hidden lg:flex items-center gap-3 shrink-0">
          <span className="flex items-center gap-2.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
            {[80, 50, 10].map((sample) => {
              const v = verdictOf(sample);
              return (
                <span key={v.level} className="inline-flex items-center gap-1">
                  <VerdictGlyph verdict={v} />
                  {v.label}
                </span>
              );
            })}
          </span>
          <span className="w-px h-4" style={{ background: 'var(--line)' }} aria-hidden />
          <WindDialLegend compact />
          <span className="w-px h-4" style={{ background: 'var(--line)' }} aria-hidden />
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--ink-3)' }}>
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ border: '1px dashed var(--line)' }}
              aria-hidden
            />
            D+7~ 추세 참고용
          </span>
        </span>
      </div>

      {/* 날짜로 이동 — 16일 스트립 범위 밖(과거 실측 · 아주 먼 미래)도 이걸로 조회합니다.
          onSelectDate 는 App.tsx 의 pickDate 그대로라, 스트립 범위 안 날짜면 재요청 없이
          즉시 반영되고 범위 밖이면 App.tsx 가 자동으로 과거 조회를 돌립니다. */}
      <div className="flex items-center gap-2 mb-2.5">
        <label
          htmlFor="date-jump-input"
          className="inline-flex items-center gap-1.5 text-xs shrink-0"
          style={{ color: 'var(--ink-3)' }}
        >
          <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} aria-hidden />
          날짜로 이동
        </label>
        <input
          id="date-jump-input"
          type="date"
          value={selectedDateISO}
          min={bounds.min}
          max={bounds.max}
          onChange={(e) => {
            if (e.target.value) onSelectDate(e.target.value);
          }}
          className="text-xs rounded-lg px-2.5 py-1.5 num"
          style={{
            background: 'var(--raised)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
          }}
        />
        {!dailyList.some((d) => d.fullDateISO === selectedDateISO) && (
          <span className="text-[11px]" style={{ color: 'var(--gold)' }}>
            16일 스트립 범위 밖 — 실측 기록 조회 중
          </span>
        )}
      </div>

      {/* 16일 슬라이드 */}
      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex items-stretch gap-1 scroll-x snap-x scroll-pl-1 rounded-xl p-1"
          style={{ background: 'var(--raised)' }}
        >
          {dailyList.map((day) => (
            <DayCard
              key={day.fullDateISO}
              day={day}
              offshoreDeg={spot.optimalWindDeg}
              isSelected={day.fullDateISO === selectedDateISO}
              isBest={day.fullDateISO === bestISO}
              onSelect={() => onSelectDate(day.fullDateISO)}
            />
          ))}
        </div>

        {/* 스크롤 버튼 — 스크롤바를 숨겼으므로 더 있다는 신호가 필요합니다 */}
        {(['left', 'right'] as const).map((side) => (
          <button
            key={side}
            onClick={() => scrollBy(side === 'left' ? -1 : 1)}
            aria-label={side === 'left' ? '이전 날짜 보기' : '다음 날짜 보기'}
            className="hidden sm:flex absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full items-center justify-center transition-colors"
            style={{
              [side]: '-6px',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              boxShadow: 'var(--shadow-card)',
              color: 'var(--ink-2)',
            }}
          >
            {side === 'left' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ))}
      </div>

      {/* 모바일용 범례 */}
      <div className="lg:hidden flex items-center gap-3 flex-wrap mt-2.5">
        <span className="flex items-center gap-2.5 text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {[80, 50, 10].map((sample) => {
            const v = verdictOf(sample);
            return (
              <span key={v.level} className="inline-flex items-center gap-1">
                <VerdictGlyph verdict={v} />
                {v.label}
              </span>
            );
          })}
        </span>
        <WindDialLegend compact />
      </div>
    </section>
  );
};
