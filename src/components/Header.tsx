/**
 * @file src/components/Header.tsx
 * @description 상단 내비게이션 — 브랜드, 권역 필터, 스팟 선택, 테마 전환.
 *
 * 권역 탭은 이전까지 상태만 바뀌고 아무것도 거르지 않는 죽은 UI 였습니다.
 * 이제 스팟 목록과 지도 마커를 실제로 필터링하고, 각 탭에 스팟 수를 표시합니다.
 */

import React from 'react';
import { Waves, MapPin, ChevronDown } from 'lucide-react';
import { KOREA_SURF_SPOTS } from '../services/surfApi';
import { RegionKey } from '../types/surf';
import { ThemeId } from '../utils/theme';
import { ThemeSwitcher } from './ThemeSwitcher';

interface HeaderProps {
  selectedSpotId: string;
  onSelectSpot: (spotId: string) => void;
  selectedRegion: RegionKey | 'ALL';
  onSelectRegion: (region: RegionKey | 'ALL') => void;
  visibleSpots: typeof KOREA_SURF_SPOTS;
  theme: ThemeId;
  onChangeTheme: (id: ThemeId) => void;
}

const REGION_TABS: { key: RegionKey | 'ALL'; label: string }[] = [
  { key: 'ALL', label: '전국' },
  { key: 'EAST', label: '동해' },
  { key: 'SOUTH', label: '남해' },
  { key: 'JEJU', label: '제주' },
  { key: 'WEST', label: '서해' },
];

export const Header: React.FC<HeaderProps> = ({
  selectedSpotId,
  onSelectSpot,
  selectedRegion,
  onSelectRegion,
  visibleSpots,
  theme,
  onChangeTheme,
}) => {
  const countFor = (key: RegionKey | 'ALL') =>
    key === 'ALL' ? KOREA_SURF_SPOTS.length : KOREA_SURF_SPOTS.filter((s) => s.region === key).length;

  return (
    <header className="sticky top-0 z-[500] panel-glass">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* 브랜드 */}
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--brand)', color: 'var(--brand-ink)' }}
            >
              <Waves className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div
                className="text-[15px] font-bold tracking-tight leading-tight"
                style={{ color: 'var(--ink)' }}
              >
                파도
                <span className="ml-1.5 text-[11px] font-medium" style={{ color: 'var(--ink-3)' }}>
                  padoh
                </span>
              </div>
              <p className="text-[11px] truncate leading-tight" style={{ color: 'var(--ink-3)' }}>
                한국 서핑 16일 파도 예보
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 스팟 셀렉터 */}
            <div className="hidden md:flex items-center gap-2">
              <MapPin className="w-4 h-4" style={{ color: 'var(--brand)' }} aria-hidden />
              <div className="relative">
                <select
                  aria-label="서핑 스팟 선택"
                  value={selectedSpotId}
                  onChange={(e) => onSelectSpot(e.target.value)}
                  className="appearance-none text-sm rounded-xl pl-3.5 pr-9 py-2 cursor-pointer transition-colors"
                  style={{
                    background: 'var(--raised)',
                    color: 'var(--ink)',
                    border: '1px solid var(--line)',
                  }}
                >
                  {visibleSpots.map((spot) => (
                    <option key={spot.id} value={spot.id}>
                      {spot.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--ink-3)' }}
                  aria-hidden
                />
              </div>
            </div>

            <ThemeSwitcher theme={theme} onChange={onChangeTheme} />
          </div>
        </div>

        {/* 권역 필터 */}
        <nav
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2"
          style={{ borderTop: '1px solid var(--line-soft)' }}
          aria-label="권역 필터"
        >
          {REGION_TABS.map((tab) => {
            const active = selectedRegion === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onSelectRegion(tab.key)}
                aria-pressed={active}
                className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors font-medium"
                style={
                  active
                    ? { background: 'var(--brand)', color: 'var(--brand-ink)', fontWeight: 600 }
                    : { color: 'var(--ink-3)' }
                }
              >
                {tab.label}
                <span className={`ml-1.5 num ${active ? 'opacity-70' : 'opacity-55'}`}>
                  {countFor(tab.key)}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
