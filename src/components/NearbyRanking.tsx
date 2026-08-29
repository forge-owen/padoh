/**
 * @file src/components/NearbyRanking.tsx
 * @description 오늘, 주변에서 어디가 제일 나은가 — 화면 최상단 행.
 *
 * 16일 스트립은 **"이 스팟이 언제 좋은가"** 를 답합니다. 그런데 서퍼가 주말 아침에
 * 실제로 하는 질문은 하나 더 있습니다: **"그래서 오늘은 어디로 가지?"**
 * 스팟을 하나씩 눌러 보며 비교하게 두면 그 질문에 답하는 데 클릭이 수십 번 듭니다.
 *
 * 그래서 선택 스팟 주변 8곳의 **오늘 최고 점수**를 한 줄로 세워 점수순으로 놓습니다.
 * 카드를 누르면 그 스팟으로 전환됩니다.
 *
 * 시간대를 같이 답니다. "죽도 72점" 만으로는 지금 나가야 하는지 오후에 나가야 하는지
 * 알 수 없어서, 최고점 시각과 그 근처에서 비슷하게 좋은 구간(±8점)을 함께 보여 줍니다.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Trophy, MapPin } from 'lucide-react';
import {
  NearbySpotSeries,
  NearbySpotRanked,
  PartKey,
  PART_OPTIONS,
  nearbyDateOptions,
  rankNearby,
} from '../services/surfApi';
import { verdictOf } from '../utils/scoreVisuals';
import { WindDial } from './WindDial';

interface NearbyRankingProps {
  series: NearbySpotSeries[];
  isLoading: boolean;
  selectedSpotId: string;
  onSelectSpot: (spotId: string) => void;
}

/** 지역 접두어를 뺀 짧은 이름 ("양양 죽도해변" → "죽도해변") */
function shortName(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
}

const Card: React.FC<{ item: NearbySpotRanked; rank: number; onSelect: () => void }> = ({
  item,
  rank,
  onSelect,
}) => {
  const verdict = verdictOf(item.bestScore);
  const isTop = rank === 1 && item.bestScore >= 38;

  return (
    <button
      onClick={onSelect}
      aria-pressed={item.isSelected}
      className="relative shrink-0 w-[150px] rounded-xl px-2.5 py-2 text-left flex flex-col gap-1.5 transition-all duration-150 snap-start"
      style={{
        background: item.isSelected ? 'var(--surface)' : 'transparent',
        border: `1px solid ${item.isSelected ? 'var(--brand)' : 'transparent'}`,
        boxShadow: item.isSelected ? 'var(--shadow-lift)' : undefined,
      }}
      aria-label={`${rank}위 ${item.spot.name}, ${verdict.label} ${item.bestScore}점, 베스트 ${item.bestWindow ?? item.bestTime}, 파고 ${item.waveHeightM}미터, ${item.distanceKm}킬로미터`}
    >
      {isTop && (
        <span
          className="absolute -top-1.5 left-2 badge badge-good px-1.5 py-0 text-[9px]"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <Trophy className="w-2.5 h-2.5" /> 최고
        </span>
      )}

      {/* 1행: 순위 + 스팟명 */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span
          className="text-[10px] font-bold num shrink-0"
          style={{ color: rank <= 3 ? 'var(--brand)' : 'var(--ink-mark)' }}
        >
          {rank}
        </span>
        <span
          className="text-xs font-semibold truncate"
          style={{ color: item.isSelected ? 'var(--brand)' : 'var(--ink)' }}
        >
          {shortName(item.spot.name)}
        </span>
      </div>

      {/* 2행: 판정 + 점수 — 이 카드의 앵커 */}
      <div className="flex items-baseline gap-1.5">
        <span
          className="px-1.5 py-0.5 rounded-md text-[11px] font-bold leading-none"
          style={{ background: verdict.softVar, color: verdict.colorVar }}
        >
          {verdict.label}
        </span>
        <span className="text-[15px] font-bold num leading-none" style={{ color: verdict.colorVar }}>
          {item.bestScore}
        </span>
      </div>

      {/* 3행: 언제 — 점수만 있으면 "지금 나가야 하나"를 알 수 없습니다 */}
      <div className="text-[11px] num font-medium" style={{ color: 'var(--ink-2)' }}>
        {item.bestWindow ?? item.bestTime}
        <span className="text-[10px] font-normal ml-1" style={{ color: 'var(--ink-3)' }}>
          {item.waveHeightM.toFixed(1)}m · {item.swellPeriodS}초
        </span>
      </div>

      {/* 4행: 바람 + 거리 */}
      <div className="flex items-center justify-between gap-1">
        <WindDial
          windDirectionDeg={item.windDirectionDeg}
          optimalOffshoreDeg={item.spot.optimalWindDeg}
          windType={item.windType}
          windSpeedKmh={item.windSpeedKmh}
          size={22}
        />
        <span className="text-[10px] num text-right leading-tight" style={{ color: 'var(--ink-mark)' }}>
          {item.distanceKm === 0 ? '현재' : `${item.distanceKm}km`}
          {/* 같은 해양 격자 = 파고·주기가 물리적으로 동일한 이웃 해변들 */}
          {item.sameCellCount > 0 && (
            <span className="block" title="같은 예보 격자에 묶인 인접 해변">
              +{item.sameCellCount}곳
            </span>
          )}
        </span>
      </div>
    </button>
  );
};

export const NearbyRanking: React.FC<NearbyRankingProps> = ({
  series,
  isLoading,
  selectedSpotId,
  onSelectSpot,
}) => {
  const dates = useMemo(() => nearbyDateOptions(series), [series]);
  const [dateISO, setDateISO] = useState('');
  const [part, setPart] = useState<PartKey>('ALL');

  // 스팟을 바꾸면 날짜 목록이 새로 오므로, 고른 날짜가 사라졌으면 첫날로 되돌립니다
  useEffect(() => {
    if (dates.length === 0) return;
    if (!dates.some((d) => d.dateISO === dateISO)) setDateISO(dates[0].dateISO);
  }, [dates, dateISO]);

  const list = useMemo(
    () => (dateISO ? rankNearby(series, dateISO, part, selectedSpotId) : []),
    [series, dateISO, part, selectedSpotId]
  );

  return (
    <section className="panel px-4 sm:px-5 py-3.5">
      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        <MapPin className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} aria-hidden />
        <h2 className="text-sm">어디로 갈까</h2>
        <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>
          고른 날짜·시간대 기준으로 주변 지역을 점수순 정렬합니다. 카드를 누르면 그 스팟으로 바뀝니다.
        </span>
      </div>

      {/* 날짜 · 시간대 옵션. 누르면 네트워크를 다시 타지 않고 즉시 다시 정렬됩니다 */}
      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        <div className="flex items-center gap-1 scroll-x" role="group" aria-label="날짜 선택">
          {dates.map((d) => {
            const active = d.dateISO === dateISO;
            return (
              <button
                key={d.dateISO}
                onClick={() => setDateISO(d.dateISO)}
                aria-pressed={active}
                className="px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap transition-colors font-medium leading-tight tap-safe shrink-0"
                style={
                  active
                    ? { background: 'var(--brand)', color: 'var(--brand-ink)', fontWeight: 600 }
                    : { color: d.isWeekend ? 'var(--rose)' : 'var(--ink-3)' }
                }
              >
                {d.label}
                <span className={`ml-1 num ${active ? 'opacity-75' : 'opacity-60'}`}>{d.sub}</span>
              </button>
            );
          })}
        </div>

        <span className="w-px h-4 shrink-0" style={{ background: 'var(--line)' }} aria-hidden />

        <div className="segmented" role="group" aria-label="시간대 선택">
          {PART_OPTIONS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPart(p.key)}
              aria-selected={part === p.key}
              role="tab"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--raised)' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton shrink-0 w-[150px] h-[104px] rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="text-xs px-1 py-3" style={{ color: 'var(--ink-3)' }}>
          이 시간대에 표시할 예보가 없습니다.
        </p>
      ) : (
        <div
          className="flex items-stretch gap-1 scroll-x snap-x scroll-pl-1 rounded-xl p-1"
          style={{ background: 'var(--raised)' }}
        >
          {list.map((item, i) => (
            <Card
              key={item.spot.id}
              item={item}
              rank={i + 1}
              onSelect={() => onSelectSpot(item.spot.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
};
