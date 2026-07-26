/**
 * @file src/components/ThemeSwitcher.tsx
 * @description 헤더의 테마 선택기.
 *
 * 스와치는 테마 메타의 hex 를 그대로 쓰지만, 실제 UI 색은 CSS 변수에서 나옵니다.
 * (스와치는 "적용 전"의 다른 테마를 미리 보여줘야 해서 그 테마의 값이 필요합니다)
 */

import React, { useEffect, useRef, useState } from 'react';
import { Palette, Check, ChevronDown } from 'lucide-react';
import { THEMES, ThemeId, themeMeta } from '../utils/theme';

interface ThemeSwitcherProps {
  theme: ThemeId;
  onChange: (id: ThemeId) => void;
}

export const ThemeSwitcher: React.FC<ThemeSwitcherProps> = ({ theme, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = themeMeta(theme);

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`테마 선택 — 현재 ${current.name}`}
        className="btn btn-ghost"
      >
        <Palette className="w-4 h-4" style={{ color: 'var(--brand)' }} />
        <span className="hidden lg:inline">{current.name}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-64 panel p-1.5 z-[600] animate-fadeIn"
          style={{ boxShadow: 'var(--shadow-lift)' }}
        >
          {THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors"
                style={{ background: active ? 'var(--raised-hi)' : 'transparent' }}
              >
                {/* 미리보기 스와치 */}
                <span
                  className="flex items-center gap-0.5 p-1 rounded-lg shrink-0"
                  style={{ background: t.swatch[0], border: '1px solid var(--line)' }}
                  aria-hidden
                >
                  <span className="w-3 h-5 rounded" style={{ background: t.swatch[1] }} />
                  <span className="w-3 h-5 rounded" style={{ background: t.swatch[2] }} />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                    {t.name}
                  </span>
                  <span className="block text-[11px] truncate" style={{ color: 'var(--ink-3)' }}>
                    {t.tagline}
                  </span>
                </span>

                {active && <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
