/**
 * @file src/utils/theme.ts
 * @description 테마 레지스트리 · 적용 · 저장.
 *
 * 실제 색값은 전부 src/index.css 의 [data-theme] 블록에 있습니다. 여기에는 UI 에
 * 보여줄 메타데이터(이름·설명·미리보기 색·지도 타일 종류)만 둡니다.
 * 색을 두 곳에 적으면 반드시 어긋나므로 미리보기 스와치도 CSS 변수를 그대로 읽습니다.
 */

export type ThemeId = 'sea-glass' | 'golden-hour' | 'night-swell';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  tagline: string;
  /** Leaflet 타일셋 선택에 사용 */
  mapTiles: 'light' | 'dark';
  /** 스위처의 미리보기 스와치 (표면, 액센트, 굿) */
  swatch: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'sea-glass',
    name: 'Sea Glass',
    tagline: '아침 바다 · 밝고 시원한 기본 테마',
    mapTiles: 'light',
    swatch: ['#FFFFFF', '#096E92', '#0E7A5F'],
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    tagline: '해질녘 세션 · 따뜻한 모래빛',
    mapTiles: 'light',
    swatch: ['#FFFCF6', '#96530B', '#0D6B61'],
  },
  {
    id: 'night-swell',
    name: 'Night Swell',
    tagline: '새벽 다크 아웃 · 저조도용',
    mapTiles: 'dark',
    swatch: ['#141E2B', '#4FC7E8', '#4ADE9E'],
  },
];

export const DEFAULT_THEME: ThemeId = 'sea-glass';

const STORAGE_KEY = 'k-surf-theme';

export function getStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return THEMES.some((t) => t.id === saved) ? (saved as ThemeId) : DEFAULT_THEME;
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.setAttribute('data-theme', id);
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 시크릿 모드 등에서 localStorage 가 막혀 있어도 테마 적용 자체는 계속돼야 합니다
  }
}

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
