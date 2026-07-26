/**
 * @file src/components/SpotGuideModal.tsx
 * @description 스팟 가이드 모달 — 최적 풍향/스웰 방향과 안전 주의사항.
 *
 * 다크 표면으로 통일했고, ESC 닫기 / 배경 클릭 닫기 / role=dialog 를 붙였습니다.
 */

import React, { useEffect } from 'react';
import { X, Wind, Compass, AlertTriangle, Waves } from 'lucide-react';
import { SurfSpot } from '../types/surf';
import { getDirectionText } from '../utils/surfScoreEngine';
import { shoreFacingDeg } from '../utils/scoreVisuals';
import { WindDial } from './WindDial';

interface SpotGuideModalProps {
  spot: SurfSpot | null;
  onClose: () => void;
}

const SAFETY_NOTE: Record<SurfSpot['region'], string> = {
  EAST:
    '동해안은 너울성 파도가 강할 때 갯바위 근처 립 커런트(이안류)를 주의하세요. 서풍(오프쇼어)이 부는 이른 아침이 가장 깨끗합니다.',
  JEJU:
    '제주 중문은 수심이 깊어 파워가 강하고 바닥이 리프입니다. 부츠 착용과 라인업 위치 파악을 먼저 하세요.',
  WEST:
    '서해는 조차가 매우 큽니다. 만조 2시간 전후로만 파도가 서므로 물때표를 반드시 먼저 확인하세요.',
  SOUTH:
    '남해는 조석 간만 차가 있고 여름철 인파가 많습니다. 지정된 서핑 구역과 만조 타이밍을 함께 확인하세요.',
};

export const SpotGuideModal: React.FC<SpotGuideModalProps> = ({ spot, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!spot) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fadeIn"
      style={{ background: 'color-mix(in srgb, var(--bg) 72%, transparent)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-guide-title"
        onClick={(e) => e.stopPropagation()}
        className="panel w-full max-w-lg p-6 space-y-5 animate-riseIn relative"
      >
        <button onClick={onClose} aria-label="닫기" className="absolute top-4 right-4 btn btn-ghost !p-2">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-line-soft">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'color-mix(in srgb, var(--gold) 18%, transparent)' }}
          >
            <Compass className="w-5 h-5 text-gold" />
          </div>
          <div className="min-w-0 pr-10">
            <span className="label-eyebrow">{spot.englishName}</span>
            <h3 id="spot-guide-title" className="truncate">
              {spot.name}
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card p-3.5">
            <span className="text-[11px] text-ink-3 font-medium inline-flex items-center gap-1.5 mb-2">
              <Wind className="w-3.5 h-3.5 text-rose" /> 이 해변의 오프쇼어
            </span>
            <div className="text-lg font-semibold text-ink num">
              {spot.optimalWindDeg}°
              <span className="text-xs font-normal text-ink-3 ml-1.5">
                {getDirectionText(spot.optimalWindDeg)}쪽에서 부는 바람
              </span>
            </div>
            <p className="text-[11px] text-ink-3 mt-1.5 leading-snug">
              이 해변은 {getDirectionText(shoreFacingDeg(spot.optimalWindDeg))}쪽 바다를 바라봅니다.
              그래서 그 반대편에서 부는 바람이 오프쇼어입니다.
            </p>
          </div>

          <div className="card p-3.5">
            <span className="text-[11px] text-ink-3 font-medium inline-flex items-center gap-1.5 mb-2">
              <Waves className="w-3.5 h-3.5 text-tide" /> 최적 스웰 유입 방향
            </span>
            <div className="text-lg font-semibold text-ink num">
              {spot.optimalSwellDeg}°
              <span className="text-xs font-normal text-ink-3 ml-1.5">
                {getDirectionText(spot.optimalSwellDeg)}
              </span>
            </div>
            <p className="text-[11px] text-ink-3 mt-1.5 leading-snug">
              주기가 긴 그라운드 스웰이 이 방향으로 들어올 때 가장 좋습니다.
            </p>
          </div>
        </div>

        {/* 오프쇼어 개념 설명 — 스팟마다 다른 이유를 여기서 한 번 정리합니다 */}
        <div className="card p-3.5">
          <h4 className="mb-2.5">오프쇼어가 뭔가요?</h4>
          <div className="flex items-start gap-3">
            <WindDial
              windDirectionDeg={spot.optimalWindDeg}
              optimalOffshoreDeg={spot.optimalWindDeg}
              windType="OFFSHORE"
              size={52}
            />
            <p className="text-[13px] text-ink-2 leading-relaxed">
              <strong className="text-ink">육지에서 바다로</strong> 부는 바람입니다. 파도의 앞면을
              받쳐 줘서 면이 세워지고 오래 버팁니다. 반대로 바다에서 육지로 부는{' '}
              <strong className="text-ink">온쇼어</strong>는 파도를 미리 무너뜨립니다.
            </p>
          </div>
          <p className="text-[11px] text-ink-3 mt-2.5 leading-snug">
            <strong>방위는 해변마다 다릅니다.</strong> 동해안(양양)은 해변이 동쪽을 보니 서풍이
            오프쇼어지만, 서해안(만리포)은 해변이 서쪽을 보니 동풍이 오프쇼어입니다. 그래서 이 앱은
            나침반 대신 위 그림처럼 <strong>해변 단면</strong>으로 표시합니다 — 위가 해변, 아래가 바다,
            화살표가 바다 쪽을 향하면 오프쇼어입니다.
          </p>
        </div>

        <div className="card p-3.5">
          <h4 className="mb-1.5">스팟 특징</h4>
          <p className="text-sm text-ink-2 leading-relaxed">{spot.description}</p>
        </div>

        <div
          className="rounded-xl p-3.5"
          style={{
            background: 'color-mix(in srgb, var(--rose) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--rose) 28%, transparent)',
          }}
        >
          <h4 className="inline-flex items-center gap-1.5 mb-1.5 text-rose">
            <AlertTriangle className="w-4 h-4" /> 안전 주의사항
          </h4>
          <p className="text-[13px] text-ink-2 leading-relaxed">{SAFETY_NOTE[spot.region]}</p>
        </div>

        <button onClick={onClose} className="btn btn-primary w-full py-2.5">
          확인
        </button>
      </div>
    </div>
  );
};
