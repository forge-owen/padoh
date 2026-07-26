/**
 * @file src/components/WindDial.tsx
 * @description 해변 단면 바람 다이어그램 — 이 앱에서 바람을 설명하는 유일한 방식.
 *
 * 왜 나침반 화살표를 버렸나:
 *   오프쇼어/온쇼어는 절대 방위가 아니라 **해변이 바라보는 방향에 대한 상대 개념**입니다.
 *   양양은 서풍이 오프쇼어지만 만리포는 동풍이 오프쇼어입니다. 그래서 "북/서/남동"
 *   같은 나침반 표기를 보여줘도 사용자는 그게 좋은 바람인지 알 수 없습니다.
 *   (Surfline 이 헷갈리는 이유가 정확히 이것입니다)
 *
 * 대신 이 다이어그램은 스팟이 바뀌어도 **의미가 고정**됩니다:
 *   ▲ 위쪽 = 항상 육지(해변)   ▼ 아래쪽 = 항상 바다
 *   화살표 = 바람이 흘러가는 방향
 *
 *   화살표가 바다(아래)로 향하면  → 오프쇼어 → 파도 면이 세워짐 (좋음)
 *   화살표가 육지(위)로 향하면    → 온쇼어   → 파도가 미리 무너짐 (나쁨)
 *
 * 방위를 몰라도 그림만 보면 읽힙니다.
 */

import React from 'react';
import { WindType } from '../types/surf';
import { windMeta, shoreRelativeArrowRotation, windPlainExplanation } from '../utils/scoreVisuals';

interface WindDialProps {
  /** 기상 풍향 — 바람이 불어오는 방위 */
  windDirectionDeg: number;
  /** 이 스팟의 오프쇼어 방위 */
  optimalOffshoreDeg: number;
  windType: WindType;
  windSpeedKmh?: number;
  size?: number;
  /** 다이어그램 옆에 라벨을 함께 렌더 */
  showLabel?: boolean;
}

export const WindDial: React.FC<WindDialProps> = ({
  windDirectionDeg,
  optimalOffshoreDeg,
  windType,
  windSpeedKmh,
  size = 30,
  showLabel = false,
}) => {
  const wind = windMeta(windType);
  const rotation = shoreRelativeArrowRotation(windDirectionDeg, optimalOffshoreDeg);
  const isGlassy = windType === 'GLASSY';

  const title = `${wind.label}${windSpeedKmh !== undefined ? ` · ${windSpeedKmh}km/h` : ''} — ${windPlainExplanation(windType)}`;

  const dial = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={title}
      style={{ flex: 'none' }}
    >
      <title>{title}</title>

      <defs>
        <clipPath id={`dial-clip-${optimalOffshoreDeg}-${Math.round(windDirectionDeg)}`}>
          <circle cx="20" cy="20" r="18" />
        </clipPath>
      </defs>

      <g clipPath={`url(#dial-clip-${optimalOffshoreDeg}-${Math.round(windDirectionDeg)})`}>
        {/* 위 절반 = 육지(해변) · 아래 절반 = 바다.
            토큰의 -soft 값은 너무 옅어서 22px 에서 두 반쪽이 구분되지 않았습니다.
            표면과 섞어 진하기를 직접 잡습니다. */}
        <rect x="0" y="0" width="40" height="20" fill="color-mix(in srgb, var(--gold) 26%, var(--surface))" />
        <rect x="0" y="20" width="40" height="20" fill="color-mix(in srgb, var(--tide) 34%, var(--surface))" />
        {/* 파도 결 — 아래가 바다임을 한 번 더 말해 줍니다 */}
        <path
          d="M0 28 q5 -2.6 10 0 t10 0 t10 0 t10 0"
          fill="none"
          stroke="var(--tide)"
          strokeWidth="1.4"
          opacity="0.6"
        />
        <path
          d="M0 34 q5 -2.6 10 0 t10 0 t10 0 t10 0"
          fill="none"
          stroke="var(--tide)"
          strokeWidth="1.4"
          opacity="0.4"
        />
      </g>

      {/* 해안선 */}
      <line x1="2" y1="20" x2="38" y2="20" stroke="var(--ink-mark)" strokeWidth="1.4" opacity="0.7" />
      <circle cx="20" cy="20" r="18" fill="none" stroke="var(--line)" strokeWidth="1.5" />

      {isGlassy ? (
        // 글래시는 방향이 의미 없습니다 — 잔잔한 수면 기호로 대체
        <g stroke={wind.colorVar} strokeWidth="2.6" strokeLinecap="round">
          <line x1="12" y1="17" x2="28" y2="17" />
          <line x1="12" y1="23" x2="28" y2="23" />
        </g>
      ) : (
        <g transform={`rotate(${rotation} 20 20)`}>
          {/* 기본 자세는 위(육지)를 향함 = 온쇼어. 180° 돌면 바다로 = 오프쇼어 */}
          {/* 표면색으로 한 번 더 두껍게 깔아 배경 위에서 화살표가 뜨게 합니다 */}
          <g stroke="var(--surface)" fill="var(--surface)" strokeWidth="5.5" strokeLinecap="round" opacity="0.9">
            <line x1="20" y1="30" x2="20" y2="14" />
            <path d="M20 7 L27 18 L13 18 Z" stroke="var(--surface)" strokeWidth="3" strokeLinejoin="round" />
          </g>
          <g stroke={wind.colorVar} fill={wind.colorVar} strokeWidth="2.8" strokeLinecap="round">
            <line x1="20" y1="29" x2="20" y2="15" />
            <path d="M20 8 L26 18 L14 18 Z" stroke="none" />
          </g>
        </g>
      )}
    </svg>
  );

  if (!showLabel) return dial;

  return (
    <span className="inline-flex items-center gap-2">
      {dial}
      <span className="min-w-0">
        <span className="block text-xs font-semibold" style={{ color: wind.colorVar }}>
          {wind.label}
        </span>
        <span className="block text-[11px]" style={{ color: 'var(--ink-3)' }}>
          {wind.flow}
        </span>
      </span>
    </span>
  );
};

/**
 * 다이어그램 읽는 법 — 스트립/카드 옆에 한 번만 두면 됩니다.
 * 범례 없이 아이콘만 두면 결국 "이게 뭐지?"로 돌아갑니다.
 */
export const WindDialLegend: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <span
    className="inline-flex items-center gap-2 text-[11px]"
    style={{ color: 'var(--ink-3)' }}
    title="다이어그램은 해변 단면입니다. 위쪽이 해변(육지), 아래쪽이 바다입니다."
  >
    <span className="inline-flex items-center gap-1">
      <WindDial windDirectionDeg={270} optimalOffshoreDeg={270} windType="OFFSHORE" size={compact ? 18 : 22} />
      <span style={{ color: 'var(--good)' }}>바다로 = 좋음</span>
    </span>
    <span className="inline-flex items-center gap-1">
      <WindDial windDirectionDeg={90} optimalOffshoreDeg={270} windType="ONSHORE" size={compact ? 18 : 22} />
      <span style={{ color: 'var(--poor)' }}>해변으로 = 나쁨</span>
    </span>
  </span>
);
