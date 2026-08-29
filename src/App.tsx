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
import { AlertCircle, Waves, Mail } from 'lucide-react';

/** 타임스탬프를 로컬 기준 YYYY-MM-DD 로. toISOString 은 UTC 라 날짜가 밀립니다. */
function localISO(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 자리를 지키는 스켈레톤.
 *
 * 높이를 실제 패널과 맞춰 받는 게 핵심입니다. 스팟을 바꿀 때 이 자리가 줄었다
 * 늘었다 하면 그 아래 지도가 위아래로 튀어서, 지도를 다시 그린 것처럼 보입니다.
 */
const PanelSkeleton: React.FC<{ heights: number[]; label?: string }> = ({ heights, label }) => (
  <div className="space-y-4" aria-busy="true" aria-live="polite">
    {label && <span className="sr-only">{label}</span>}
    {heights.map((h, i) => (
      <div key={i} className="skeleton rounded-2xl" style={{ height: h }} />
    ))}
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

  /**
   * 스팟 예보 재요청.
   *
   * 이전 스팟의 예보를 그대로 두면 **새 스팟 이름 아래에 옛 스팟 숫자가** 잠깐
   * 보입니다. 그래서 요청을 시작할 때 비웁니다 — 대신 화면은 스켈레톤이 자리를
   * 지키고, 지도는 아예 언마운트되지 않습니다(아래 렌더 주석 참고).
   */
  const [refetchToken, setRefetchToken] = useState(0);
  const refetch = () => setRefetchToken((n) => n + 1);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);
    setHourlyForecasts([]);
    setDailyList([]);
    setSelectedHourly(null);

    fetchLive16DaysForecasts(selectedSpotId)
      .then((data) => {
        if (!isMounted) return;
        setHourlyForecasts(data.hourly);
        setDailyList(data.daily16Days);
        // 스팟이 바뀌면 날짜 선택은 항상 오늘로 되돌립니다
        setSelectedDateISO(data.daily16Days[0]?.fullDateISO ?? '');
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
  }, [selectedSpotId, refetchToken]);

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

  /** 예보 패널을 그릴 수 있는 상태인가 — 지도는 이 값과 무관하게 항상 그립니다 */
  const ready = !isLoading && !loadError && !!activeForecast && !!selectedDay;

  const pickSpot = (id: string) => setSelectedSpotId(id);

  const pickDate = (dateISO: string) => {
    setSelectedDateISO(dateISO);
    setSelectedHourly(null); // 날짜가 바뀌면 시각 선택은 초기화
  };

  return (
    <div className="min-h-dvh-safe flex flex-col">
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
        {/* ── 1~2행: 스트립 + 컨디션 카드 ─────────────────────────────────
            스팟을 바꾸면 이 두 패널만 스켈레톤으로 바뀝니다. 스켈레톤 높이를
            실제 패널과 맞춰 둬서 아래 지도가 위아래로 튀지 않습니다. */}
        {loadError ? (
          <div className="panel p-10 text-center space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto" style={{ color: 'var(--poor)' }} />
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
              {loadError}
            </p>
            <button className="btn btn-ghost mx-auto" onClick={() => refetch()}>
              다시 시도
            </button>
          </div>
        ) : ready ? (
          <>
            <ForecastStrip
              dailyList={dailyList}
              spot={currentSpot}
              briefing={briefing}
              selectedDateISO={selectedDay!.fullDateISO}
              onSelectDate={pickDate}
            />

            {/* 스트립 바로 다음에 둬서 스크롤 없이 읽히게 합니다 */}
            <SpotHeader
              spot={currentSpot}
              day={selectedDay!}
              currentForecast={activeForecast!}
              highlight={highlight}
              onOpenGuide={() => setIsGuideOpen(true)}
            />
          </>
        ) : (
          <PanelSkeleton heights={[190, 86]} label="예보를 불러오는 중" />
        )}

        {/* ── 3행: 지도 ────────────────────────────────────────────────────
            🔑 지도는 **로딩 분기 밖**에 둡니다.
            예전에는 isLoading 분기가 지도까지 감싸고 있어서, 지도에서 스팟을
            찍는 순간 지도 자체가 언마운트 → 재마운트됐습니다. 줌·중심이 초기화되고
            화면이 통째로 깜빡여서 "페이지가 리로드된다"고 느껴졌습니다.
            지도는 스팟을 고르는 **컨트롤 자체**라 조작 중에 사라지면 안 됩니다. */}
        <SpotMapView
          spots={visibleSpots}
          selectedSpot={currentSpot}
          onSelectSpot={pickSpot}
          mapTiles={themeMeta(theme).mapTiles}
          dailyList={ready ? dailyList : []}
          isLoading={isLoading}
        />

        {/* ── 4행: 상세. 탭 없이 세로로 이어 붙입니다 ─────────────────────── */}
        {ready ? (
          <>
            <HourlyForecastTable
              forecasts={dayHourly}
              day={selectedDay!}
              spot={currentSpot}
              onSelectTime={setSelectedHourly}
              selectedTimestamp={activeForecast!.timestamp}
            />

            <TideChart forecasts={dayHourly} day={selectedDay!} />
          </>
        ) : loadError ? null : (
          <PanelSkeleton heights={[420, 300]} />
        )}
      </main>

      {isGuideOpen && <SpotGuideModal spot={currentSpot} onClose={() => setIsGuideOpen(false)} />}

      <footer className="mt-8" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <div
          className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          style={{ color: 'var(--ink-3)' }}
        >
          <div className="inline-flex items-center gap-2 flex-wrap justify-center">
            <Waves className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
            <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>
              WWF
            </span>
            <span>Weekend Wave Finder</span>
            <span style={{ color: 'var(--ink-mark)' }}>·</span>
            <span>예보 Open-Meteo · 지도 OpenStreetMap</span>
          </div>

          <div className="inline-flex items-center gap-3 flex-wrap justify-center">
            <a
              href="mailto:wwf@forges.work"
              className="inline-flex items-center gap-1.5 transition-colors hover:underline"
              style={{ color: 'var(--ink-2)' }}
            >
              <Mail className="w-3.5 h-3.5" style={{ color: 'var(--brand)' }} />
              wwf@forges.work
            </a>
            <span style={{ color: 'var(--ink-mark)' }}>·</span>
            <p>© 2026 forge</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
