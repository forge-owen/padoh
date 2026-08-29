/**
 * @file src/components/TideChart.tsx
 * @description 24시간 조석(물때) 곡선.
 *
 * 데이터가 실제로 흐르게 된 컴포넌트입니다. 이전에는 surfApi 가 tideHeightCm 을 45 로
 * 하드코딩해서 이 차트가 항상 완전한 직선이었습니다. 이제 Open-Meteo 의
 * sea_level_height_msl(평균해수면 대비 조위)을 그립니다.
 *
 * 형태: 단일 시계열 → 면적+선. 시리즈가 하나라 범례 상자는 두지 않고 제목이 이름을 답니다.
 * 라벨은 만조/간조 극점에만 직접 붙이고(모든 점에 숫자 금지), 나머지는 호버로 읽습니다.
 */

import React, { useMemo, useRef, useState } from 'react';
import { HourlyForecast, DailyForecast } from '../types/surf';
import { Droplets, ArrowUp, ArrowDown, CalendarOff, FunctionSquare } from 'lucide-react';

interface TideChartProps {
  /** 이미 선택된 날짜로 걸러진 시간별 예보 */
  forecasts: HourlyForecast[];
  day: DailyForecast;
}

const W = 860;
const H = 200;
const PAD = { top: 26, right: 16, bottom: 30, left: 40 };

const TIDE_STATE_LABEL: Record<HourlyForecast['tideState'], string> = {
  HIGH: '만조',
  LOW: '간조',
  RISING: '들물',
  FALLING: '날물',
};

export const TideChart: React.FC<TideChartProps> = ({ forecasts, day }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const displayed = useMemo(() => forecasts.slice(0, 24), [forecasts]);

  /**
   * 조위 예보가 없는 날 — Open-Meteo 는 조위를 약 9일까지만 줍니다.
   * 예전에는 없는 값을 0 으로 채워 **평평한 직선을 "조위 0cm"** 로 그렸습니다.
   * 사용자에게는 "종일 간조"처럼 보여서, 없는 것보다 나쁜 정보였습니다.
   */
  const hasTide = day.hasTide && displayed.some((f) => f.tideAvailable);

  const geom = useMemo(() => {
    if (displayed.length < 2) return null;

    const values = displayed.map((f) => f.tideHeightCm);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    // 조차가 매우 작은 동해안에서도 곡선이 보이도록 최소 표시 범위를 확보
    const span = Math.max(rawMax - rawMin, 10);
    const mid = (rawMax + rawMin) / 2;
    const min = mid - span / 2 - span * 0.15;
    const max = mid + span / 2 + span * 0.15;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const x = (i: number) => PAD.left + (i / (displayed.length - 1)) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;

    const pts = displayed.map((fc, i) => ({ x: x(i), y: y(fc.tideHeightCm), fc, i }));

    // 부드러운 곡선 (Catmull-Rom → 베지어). 조석은 연속적인 물리량이라 꺾인 선보다 정확한 인상을 줍니다.
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }

    const baseline = H - PAD.bottom;
    const area = `${d} L ${pts[pts.length - 1].x} ${baseline} L ${pts[0].x} ${baseline} Z`;

    // 극점(만조/간조)만 직접 라벨.
    // 조위가 평평한 구간에서는 연속된 여러 시각이 모두 HIGH/LOW 로 판정되므로,
    // 같은 국면에서는 가장 극단적인 한 점만 남기고 라벨이 겹치지 않게 3시간 간격을 둡니다.
    const candidates = pts.filter(
      (p, i) => i > 0 && i < pts.length - 1 && (p.fc.tideState === 'HIGH' || p.fc.tideState === 'LOW')
    );
    const extremes: typeof candidates = [];
    for (const p of candidates) {
      const last = extremes[extremes.length - 1];
      if (last && last.fc.tideState === p.fc.tideState && p.i - last.i <= 3) {
        // 같은 국면이 이어지면 더 극단적인 쪽으로 교체
        const better =
          p.fc.tideState === 'HIGH'
            ? p.fc.tideHeightCm > last.fc.tideHeightCm
            : p.fc.tideHeightCm < last.fc.tideHeightCm;
        if (better) extremes[extremes.length - 1] = p;
        continue;
      }
      if (last && p.i - last.i < 3) continue; // 라벨 충돌 방지
      extremes.push(p);
    }

    return { pts, d, area, min, max, rawMin, rawMax, extremes, plotW, baseline, y };
  }, [displayed]);

  if (!hasTide) {
    return (
      <section className="panel p-6 space-y-3 animate-riseIn">
        <h3 className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-tide" />
          {day.isToday ? '오늘' : `${day.dateStr}(${day.dayOfWeek})`} 물때 (조위)
        </h3>
        <div
          className="flex items-start gap-3 rounded-xl p-4"
          style={{ background: 'var(--raised)', border: '1px solid var(--line-soft)' }}
        >
          <CalendarOff className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--ink-3)' }} />
          <div className="space-y-1">
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              이 날짜는 조위 예보 범위 밖입니다.
            </p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-3)' }}>
              조위 데이터는 <strong>약 9일치</strong>만 제공됩니다(파고·바람은 16일까지 나옵니다).
              범위 밖 날짜에 0cm 직선을 그리면 종일 간조처럼 보여서, 아예 표시하지 않습니다.
              특히 조차가 6~9m인 서해는 <strong>물때가 입수 가능 시간을 정하므로</strong>,
              날짜가 가까워진 뒤 다시 확인하세요.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!geom) return null;

  const { pts, d, area, rawMin, rawMax, extremes, baseline, y } = geom;
  const hovered = hoverIdx !== null ? pts[hoverIdx] : null;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (localX - PAD.left) / (W - PAD.left - PAD.right);
    const idx = Math.round(ratio * (pts.length - 1));
    setHoverIdx(idx >= 0 && idx < pts.length ? idx : null);
  };

  return (
    <section className="panel p-6 space-y-3 animate-riseIn">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-tide" />
            {day.isToday ? '오늘' : `${day.dateStr}(${day.dayOfWeek})`} 물때 (조위)
          </h3>
          <p className="text-xs text-ink-3 mt-1">
            평균해수면 기준 조위 변화. 만조·간조 시각에 맞춰 라인업 타이밍을 잡으세요.
          </p>
          {/* 모델 제공 범위(약 9일) 밖은 조화분해로 연장한 값입니다.
              출처가 다른 값을 같은 얼굴로 보여 주면 안 됩니다. */}
          {day.tidePredicted && (
            <p className="text-[11px] mt-1.5 inline-flex items-start gap-1.5" style={{ color: 'var(--gold)' }}>
              <FunctionSquare className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                <strong>조화분해 예측값</strong> — 조위 모델은 약 9일까지만 제공돼, 앞 구간에
                조석 상수를 맞춰 연장했습니다. 만조·간조 <strong>시각은 30분~1시간</strong> 오차로
                맞지만 정확한 수위가 필요하면 국립해양조사원 물때표를 확인하세요.
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 text-tide">
            <ArrowUp className="w-3.5 h-3.5" />
            최고 <span className="font-medium num">{rawMax}cm</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-3">
            <ArrowDown className="w-3.5 h-3.5" />
            최저 <span className="font-medium num">{rawMin}cm</span>
          </span>
        </div>
      </header>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-[200px]"
          role="img"
          aria-label={`24시간 조위 변화. 최고 ${rawMax}센티미터, 최저 ${rawMin}센티미터.`}
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="tideFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tide)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--tide)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 기준선 — 억제된 그리드 */}
          {[rawMax, (rawMax + rawMin) / 2, rawMin].map((v, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={y(v)}
                x2={W - PAD.right}
                y2={y(v)}
                stroke="var(--line-soft)"
                strokeWidth="1"
                strokeDasharray={i === 1 ? '3 5' : undefined}
              />
              <text
                x={PAD.left - 8}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--ink-mark)"
                fontSize="10"
              >
                {Math.round(v)}
              </text>
            </g>
          ))}

          <path d={area} fill="url(#tideFill)" />
          <path
            d={d}
            fill="none"
            stroke="var(--tide)"
            strokeWidth="2"
            strokeLinecap="round"
            /* 예측 구간은 점선 — 색이 아니라 선 모양으로 구분합니다 */
            strokeDasharray={day.tidePredicted ? '5 4' : undefined}
          />

          {/* 극점 직접 라벨 (모든 점이 아니라 만조/간조에만) */}
          {extremes.map((p) => (
            <g key={p.i}>
              <circle cx={p.x} cy={p.y} r="4" fill="var(--tide)" stroke="var(--surface)" strokeWidth="2" />
              <text
                x={p.x}
                y={p.fc.tideState === 'HIGH' ? p.y - 12 : p.y + 20}
                textAnchor="middle"
                fill="var(--ink-2)"
                fontSize="10.5"
                fontWeight="500"
              >
                {TIDE_STATE_LABEL[p.fc.tideState]} {p.fc.tideHeightCm}cm
              </text>
            </g>
          ))}

          {/* 3시간 간격 시각 눈금 */}
          {pts
            .filter((p) => p.i % 3 === 0)
            .map((p) => (
              <text
                key={p.i}
                x={p.x}
                y={H - 10}
                textAnchor="middle"
                fill="var(--ink-mark)"
                fontSize="10"
              >
                {p.fc.time.slice(0, 2)}
              </text>
            ))}

          {/* 호버 크로스헤어 */}
          {hovered && (
            <g pointerEvents="none">
              <line
                x1={hovered.x}
                y1={PAD.top - 6}
                x2={hovered.x}
                y2={baseline}
                stroke="var(--ink-mark)"
                strokeWidth="1"
              />
              <circle
                cx={hovered.x}
                cy={hovered.y}
                r="5"
                fill="var(--tide)"
                stroke="var(--surface)"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* 툴팁 */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-20 card px-3 py-2 text-xs whitespace-nowrap"
            style={{
              left: `${(hovered.x / W) * 100}%`,
              top: `${(hovered.y / H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 12px))',
            }}
          >
            <div className="text-ink font-medium num">{hovered.fc.time}</div>
            <div className="text-tide num">
              {hovered.fc.tideHeightCm}cm · {TIDE_STATE_LABEL[hovered.fc.tideState]}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
