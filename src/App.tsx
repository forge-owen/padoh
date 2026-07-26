/**
 * @file src/App.tsx
 * @description 대시보드 셸.
 *
 * 레이아웃 원칙: **16일 스트립이 메인 컨트롤이고, 나머지는 그 선택을 따라간다.**
 *
 *   1행) 16일 파도 스트립 — 최상단. 여기서 날짜를 고르면 아래가 전부 그 날짜로 바뀜
 *   2행) 지역 컨디션 바 — 두 줄. 스크롤 없이 바로 읽히도록 스트립 바로 아래
 *   3행) 지도
 *   4행) 시간별 예보 → 물때. 탭 없이 세로로 이어 붙임 (한 번에 보이는 정보량 우선)
 *
 * 상태 흐름은 두 갈래뿐입니다:
 *   지도/헤더에서 스팟 변경 → 예보 재요청 → 선택 날짜를 오늘로 리셋
 *   스트립에서 날짜 변경   → 재요청 없이 아래 컴포넌트만 그 날짜로 스코프
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { SpotHeader } from './components/SpotHeader';
import { ForecastStrip } from './components/ForecastStrip';
import { HourlyForecastTable } from './components/HourlyForecastTable';
import { SpotMapView } from './components/SpotMapView';
import { TideChart } from './components/TideChart';
import { SpotGuideModal } from './components/SpotGuideModal';
import {
  KOREA_SURF_SPOTS,
  fetchLive16DaysForecasts,
  getDailyHighlight,
  buildBriefing,
  pickBestSurfableHour,
} from './services/surfApi';
import { RegionKey, HourlyForecast, DailyForecast } from './types/surf';
import { ThemeId, getStoredTheme, applyTheme, themeMeta } from './utils/theme';
import { AlertCircle, Waves } from 'lucide-react';

/** 타임스탬프를 로컬 기준 YYYY-MM-DD 로. toISOString 은 UTC 라 날짜가 밀립니다. */
function localISO(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const Skeleton: React.FC = () => (
  <div className="space-y-5" aria-busy="true" aria-live="polite">
    <span className="sr-only">예보 데이터를 불러오는 중입니다.</span>
    <div className="skeleton h-[190px] rounded-2xl" />
    <div className="skeleton h-[86px] rounded-2xl" />
    <div className="skeleton h-[420px] rounded-2xl" />
  </div>
);

export const App: React.FC = () => {
  const [theme, setTheme] = useState<ThemeId>(getStoredTheme);

  const [selectedSpotId, setSelectedSpotId] = useState<string>('thirty-eight-line');
  const [selectedRegion, setSelectedRegion] = useState<RegionKey | 'ALL'>('ALL');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  /** 스트립에서 고른 날짜. 이 값이 아래 모든 컴포넌트의 스코프를 정합니다. */
  const [selectedDateISO, setSelectedDateISO] = useState<string>('');
  /** 시간별 표에서 고른 시각 (선택 날짜 안에서) */
  const [selectedHourly, setSelectedHourly] = useState<HourlyForecast | null>(null);

  const [hourlyForecasts, setHourlyForecasts] = useState<HourlyForecast[]>([]);
  const [dailyList, setDailyList] = useState<DailyForecast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 권역 필터 — 헤더 셀렉트와 지도 마커가 같은 목록을 씁니다
  const visibleSpots = useMemo(
    () =>
      selectedRegion === 'ALL'
        ? KOREA_SURF_SPOTS
        : KOREA_SURF_SPOTS.filter((s) => s.region === selectedRegion),
    [selectedRegion]
  );

  // 필터를 바꿔 선택 스팟이 목록 밖으로 나가면 첫 번째 스팟으로 보정
  useEffect(() => {
    if (visibleSpots.length > 0 && !visibleSpots.some((s) => s.id === selectedSpotId)) {
      setSelectedSpotId(visibleSpots[0].id);
    }
  }, [visibleSpots, selectedSpotId]);

  const currentSpot = useMemo(
    () => KOREA_SURF_SPOTS.find((s) => s.id === selectedSpotId) || KOREA_SURF_SPOTS[0],
    [selectedSpotId]
  );

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);

    fetchLive16DaysForecasts(selectedSpotId)
      .then((data) => {
        if (!isMounted) return;
        setHourlyForecasts(data.hourly);
        setDailyList(data.daily16Days);
        // 스팟이 바뀌면 날짜 선택은 항상 오늘로 되돌립니다
        setSelectedDateISO(data.daily16Days[0]?.fullDateISO ?? '');
        setSelectedHourly(null);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('예보 연동 에러:', err);
        if (!isMounted) return;
        setLoadError('예보 데이터를 불러오지 못했습니다.');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSpotId]);

  /* ── 선택 날짜로 스코프된 파생값들 ─────────────────────────────────── */

  const dayHourly = useMemo(
    () => hourlyForecasts.filter((fc) => localISO(fc.timestamp) === selectedDateISO),
    [hourlyForecasts, selectedDateISO]
  );

  const selectedDay = useMemo(
    () => dailyList.find((d) => d.fullDateISO === selectedDateISO) ?? dailyList[0],
    [dailyList, selectedDateISO]
  );

  /**
   * 카드에 띄울 대표 시각.
   * 오늘이면 "지금", 다른 날이면 그날 낮 시간대 중 가장 좋은 시각입니다
   * (미래 날짜의 00시 컨디션은 아무 의미가 없습니다).
   */
  const activeForecast = useMemo(() => {
    if (selectedHourly) return selectedHourly;
    if (dayHourly.length === 0) return hourlyForecasts[0] ?? null;
    if (selectedDay?.isToday) {
      const nowHour = new Date().getHours();
      return dayHourly.find((fc) => new Date(fc.timestamp).getHours() === nowHour) ?? dayHourly[0];
    }
    return pickBestSurfableHour(dayHourly) ?? dayHourly[0];
  }, [selectedHourly, dayHourly, selectedDay, hourlyForecasts]);

  const highlight = useMemo(() => getDailyHighlight(dayHourly), [dayHourly]);
  const briefing = useMemo(() => buildBriefing(dailyList), [dailyList]);

  const pickSpot = (id: string) => setSelectedSpotId(id);

  const pickDate = (dateISO: string) => {
    setSelectedDateISO(dateISO);
    setSelectedHourly(null); // 날짜가 바뀌면 시각 선택은 초기화
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        selectedSpotId={selectedSpotId}
        onSelectSpot={pickSpot}
        selectedRegion={selectedRegion}
        onSelectRegion={setSelectedRegion}
        visibleSpots={visibleSpots}
        theme={theme}
        onChangeTheme={setTheme}
      />

      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
        {isLoading ? (
          <Skeleton />
        ) : loadError || !activeForecast || !selectedDay ? (
          <div className="panel p-10 text-center space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto" style={{ color: 'var(--poor)' }} />
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              {loadError || '표시할 예보 데이터가 없습니다.'}
            </p>
            <button className="btn btn-ghost mx-auto" onClick={() => pickSpot(selectedSpotId)}>
              다시 시도
            </button>
          </div>
        ) : (
          <>
            {/* 1행 — 메인 컨트롤 */}
            <ForecastStrip
              dailyList={dailyList}
              spot={currentSpot}
              briefing={briefing}
              selectedDateISO={selectedDay.fullDateISO}
              onSelectDate={pickDate}
            />

            {/* 2행 — 선택한 날의 컨디션. 스트립 바로 다음에 둬서 스크롤 없이 읽히게 합니다 */}
            <SpotHeader
              spot={currentSpot}
              day={selectedDay}
              currentForecast={activeForecast}
              highlight={highlight}
              onOpenGuide={() => setIsGuideOpen(true)}
            />

            {/* 3행 — 지도 */}
            <SpotMapView
              spots={visibleSpots}
              selectedSpot={currentSpot}
              onSelectSpot={pickSpot}
              mapTiles={themeMeta(theme).mapTiles}
              dailyList={dailyList}
            />

            {/* 3행 — 상세는 탭 없이 세로로 이어 붙입니다.
                탭에 숨기면 한 번에 볼 수 있는 정보량이 줄어듭니다. */}
            <HourlyForecastTable
              forecasts={dayHourly}
              day={selectedDay}
              spot={currentSpot}
              onSelectTime={setSelectedHourly}
              selectedTimestamp={activeForecast.timestamp}
            />

            <TideChart forecasts={dayHourly} day={selectedDay} />
          </>
        )}
      </main>

      {isGuideOpen && <SpotGuideModal spot={currentSpot} onClose={() => setIsGuideOpen(false)} />}

      <footer className="mt-8" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <div
          className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          style={{ color: 'var(--ink-3)' }}
        >
          <div className="inline-flex items-center gap-2">
            <Waves className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>
              파도 (padoh)
            </span>
            <span>· 예보 Open-Meteo · 지도 OpenStreetMap &amp; CARTO</span>
          </div>
          <p>© 2026 padoh · Weekly Wave Finder</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
