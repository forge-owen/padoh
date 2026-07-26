/**
 * @file src/components/SpotMapView.tsx
 * @description Leaflet + OpenStreetMap(CARTO) 기반 한국 서핑 스팟 지도.
 *
 * 마커가 단순한 핀이 아니라 **오늘 판정을 이미 담고 있습니다.** 지도만 봐도
 * "지금 어디가 좋은지"가 읽히는 게 Map-First 의 요점이라, 선택된 스팟의 오늘
 * 판정색 점을 마커 안에 넣었습니다.
 *
 * 타일셋은 테마를 따라갑니다(밝은 테마 → light_all, 다크 → dark_all).
 * 앱은 밝은데 지도만 어둡거나 그 반대면 화면이 두 동강 납니다.
 */

import React, { useEffect, useRef } from 'react';
import { Navigation, Layers } from 'lucide-react';
import { SurfSpot, DailyForecast } from '../types/surf';
import { verdictOf } from '../utils/scoreVisuals';

declare global {
  interface Window {
    L: any;
  }
}

interface SpotMapViewProps {
  spots: SurfSpot[];
  selectedSpot: SurfSpot;
  onSelectSpot: (spotId: string) => void;
  mapTiles: 'light' | 'dark';
  /** 선택 스팟의 일별 예보 — 마커에 오늘 판정색을 싣는 데 씁니다 */
  dailyList: DailyForecast[];
}

const TILE_URL: Record<'light' | 'dark', string> = {
  light: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

/** 스팟 이름에서 지역 접두어를 뺀 짧은 이름 ("양양 죽도해변" → "죽도해변") */
function shortName(spot: SurfSpot): string {
  const parts = spot.name.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : spot.name;
}

/** CSS 변수는 Leaflet 이 만드는 DOM 안에서도 상속되므로 그대로 씁니다 */
function markerHtml(spot: SurfSpot, isSelected: boolean, dotColor: string): string {
  return `
    <div style="
      position:absolute; left:0; top:0; transform:translate(-50%,-50%);
      width:max-content;
      display:flex; align-items:center; gap:5px;
      padding:4px 9px 4px 6px;
      border-radius:999px;
      font-size:11px; line-height:1.4; font-weight:${isSelected ? 700 : 500};
      white-space:nowrap; cursor:pointer;
      background:${isSelected ? 'var(--brand)' : 'var(--surface)'};
      color:${isSelected ? 'var(--brand-ink)' : 'var(--ink-2)'};
      border:1px solid ${isSelected ? 'var(--brand)' : 'var(--line)'};
      box-shadow:var(--shadow-lift);
    ">
      <span style="
        width:7px; height:7px; border-radius:999px; flex:none;
        background:${dotColor};
        box-shadow:0 0 0 2px ${isSelected ? 'var(--brand)' : 'var(--surface)'};
      "></span>
      <span>${shortName(spot)}</span>
    </div>
  `;
}

export const SpotMapView: React.FC<SpotMapViewProps> = ({
  spots,
  selectedSpot,
  onSelectSpot,
  mapTiles,
  dailyList,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const markersRef = useRef<{ [id: string]: any }>({});
  const prevSpotsRef = useRef<SurfSpot[] | null>(null);
  // onSelectSpot 이 매 렌더 새 함수여도 마커를 다시 만들지 않도록 ref 로 우회
  const selectRef = useRef(onSelectSpot);
  selectRef.current = onSelectSpot;
  const spotsRef = useRef(spots);
  spotsRef.current = spots;

  const today = dailyList[0];
  const todayVerdict = today ? verdictOf(today.maxSurfScore) : null;

  /** 표시 중인 스팟이 모두 들어오도록 카메라를 맞춥니다. */
  const fitToSpots = (map: any, list: SurfSpot[], animate: boolean) => {
    if (list.length === 1) {
      map.setView([list[0].latitude, list[0].longitude], 11, { animate });
      return;
    }
    // 한반도는 세로로 긴데 지도 박스는 가로로 넓어서, 상하 여백을 넉넉히 주면
    // 축척이 과하게 낮아져 중국·일본까지 들어옵니다. 세로 여백을 최소로 잡습니다.
    map.fitBounds(window.L.latLngBounds(list.map((s) => [s.latitude, s.longitude])), {
      padding: [24, 28],
      maxZoom: 11,
      animate,
    });
  };

  /* 1. 지도 인스턴스 (한 번만) */
  useEffect(() => {
    if (!containerRef.current || !window.L || mapRef.current) return;

    const map = window.L.map(containerRef.current, {
      center: [selectedSpot.latitude, selectedSpot.longitude],
      zoom: 9,
      zoomControl: true,
      scrollWheelZoom: false, // 페이지 스크롤을 가로채지 않도록
      // 정수 줌만 쓰면 한반도가 세로로 겨우 안 들어가서 한 단계 통째로 빠지고
      // 지도의 절반이 낭비됩니다. 소수 줌을 허용해 실제 범위에 맞춥니다.
      zoomSnap: 0.25,
      zoomDelta: 0.5,
    });

    mapRef.current = map;

    // 초기 카메라는 여기서 확정합니다. 별도 이펙트에 두면 StrictMode 의 이중 실행 때
    // "이미 맞췄다"고 판단해 건너뛰고 생성자 zoom(9) 이 그대로 남습니다.
    const raf = requestAnimationFrame(() => {
      map.invalidateSize({ animate: false });
      fitToSpots(map, spotsRef.current, false);
      prevSpotsRef.current = spotsRef.current;
    });

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      markersRef.current = {};
      prevSpotsRef.current = null;
    };
  }, []);

  /* 2. 타일 — 테마를 따라 교체 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;

    if (tileRef.current) map.removeLayer(tileRef.current);
    tileRef.current = window.L
      .tileLayer(TILE_URL[mapTiles], {
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      })
      .addTo(map);
    tileRef.current.setZIndex(0);
  }, [mapTiles]);

  /* 3. 마커 — 표시 대상(권역 필터)·선택·오늘 판정이 바뀌면 다시 그립니다 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L) return;

    Object.values(markersRef.current).forEach((m: any) => map.removeLayer(m));
    markersRef.current = {};

    spots.forEach((spot) => {
      const isSelected = spot.id === selectedSpot.id;
      // 오늘 판정은 선택된 스팟만 알고 있습니다(예보를 스팟 단위로 받으므로).
      // 나머지 스팟은 중립 점으로 두어 "아직 모름"을 정직하게 표시합니다.
      const dot = isSelected && todayVerdict ? todayVerdict.colorVar : 'var(--ink-mark)';

      const marker = window.L.marker([spot.latitude, spot.longitude], {
        icon: window.L.divIcon({
          className: 'k-surf-marker',
          html: markerHtml(spot, isSelected, dot),
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
        zIndexOffset: isSelected ? 1000 : 0,
        keyboard: true,
        title: spot.name,
      })
        .addTo(map)
        .on('click', () => selectRef.current(spot.id));

      markersRef.current[spot.id] = marker;
    });
  }, [spots, selectedSpot.id, todayVerdict?.level]);

  /* 4. 카메라 — 초기 맞춤 이후의 변화만 */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.L || prevSpotsRef.current === null) return;

    if (prevSpotsRef.current !== spots) {
      prevSpotsRef.current = spots;
      fitToSpots(map, spots, true);
    } else {
      map.setView([selectedSpot.latitude, selectedSpot.longitude], 10, { animate: true });
    }
  }, [spots, selectedSpot.id, selectedSpot.latitude, selectedSpot.longitude]);

  return (
    <section className="panel overflow-hidden isolate">
      <header
        className="flex items-center justify-between gap-3 px-5 py-3.5"
        style={{ borderBottom: '1px solid var(--line-soft)' }}
      >
        <div className="min-w-0">
          <h3 className="flex items-center gap-2">
            <Navigation className="w-4 h-4" style={{ color: 'var(--brand)' }} />
            서핑 스팟 지도
          </h3>
          <p
            className="text-[11px] mt-0.5 inline-flex items-center gap-1.5"
            style={{ color: 'var(--ink-3)' }}
          >
            <Layers className="w-3 h-3" />
            마커를 눌러 스팟 전환 · 표시 중 {spots.length}곳
          </p>
        </div>
      </header>

      {/* 스팟 칩 — 스크롤바를 숨겼으므로 더 있다는 신호는 페이드로 */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar fade-edge-x px-5 py-2.5"
        style={{ borderBottom: '1px solid var(--line-soft)' }}
      >
        {spots.map((spot) => {
          const active = selectedSpot.id === spot.id;
          return (
            <button
              key={spot.id}
              onClick={() => onSelectSpot(spot.id)}
              aria-pressed={active}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors font-medium"
              style={
                active
                  ? { background: 'var(--brand)', color: 'var(--brand-ink)', fontWeight: 600 }
                  : { background: 'var(--raised)', color: 'var(--ink-2)', border: '1px solid var(--line-soft)' }
              }
            >
              {shortName(spot)}
            </button>
          );
        })}
      </div>

      <div className="relative z-0 h-[300px] sm:h-[360px] lg:h-[400px]">
        <div ref={containerRef} className="absolute inset-0" />

        <div className="absolute bottom-3 left-3 z-[400] card px-3 py-2 pointer-events-none">
          <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
            {selectedSpot.name}
          </div>
          <div className="text-[11px] num mt-0.5" style={{ color: 'var(--ink-3)' }}>
            {selectedSpot.latitude.toFixed(3)}, {selectedSpot.longitude.toFixed(3)} · 오프쇼어{' '}
            {selectedSpot.optimalWindDeg}°
          </div>
        </div>
      </div>
    </section>
  );
};
