/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /**
       * 시맨틱 토큰만 노출합니다. 컴포넌트에서 리터럴 hex 대신
       * bg-surface / text-ink-2 / border-line 을 쓰세요.
       * 실제 값은 src/index.css 의 [data-theme] 블록에서만 정의됩니다(테마 교체 지점).
       */
      colors: {
        bg:          'var(--bg)',
        surface:     'var(--surface)',
        raised:      'var(--raised)',
        'raised-hi': 'var(--raised-hi)',
        line:        'var(--line)',
        'line-soft': 'var(--line-soft)',

        ink:         'var(--ink)',
        'ink-2':     'var(--ink-2)',
        'ink-3':     'var(--ink-3)',
        'ink-mark':  'var(--ink-mark)',

        brand:       'var(--brand)',
        'brand-ink': 'var(--brand-ink)',

        gold:        'var(--gold)',
        'gold-hi':   'var(--gold-hi)',
        'gold-soft': 'var(--gold-soft)',
        tide:        'var(--tide)',
        'tide-soft': 'var(--tide-soft)',
        rose:        'var(--rose)',
        'rose-soft': 'var(--rose-soft)',

        // 3단계 판정 — 예약된 의미. 시리즈 색으로 재사용 금지.
        good:        'var(--good)',
        'good-soft': 'var(--good-soft)',
        fair:        'var(--fair)',
        'fair-soft': 'var(--fair-soft)',
        poor:        'var(--poor)',
        'poor-soft': 'var(--poor-soft)',

        // 스코어 순차 램프 (dataviz validator: ordinal PASS, 테마별 검증 완료)
        score: {
          1: 'var(--score-1)',
          2: 'var(--score-2)',
          3: 'var(--score-3)',
          4: 'var(--score-4)',
          5: 'var(--score-5)',
        },
      },
      fontFamily: {
        // Pretendard 가 한글 자소를, Inter 가 라틴/숫자를 담당합니다.
        sans: [
          'Inter',
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Apple SD Gothic Neo',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
      borderRadius: {
        xl: 'var(--r-lg)',
        '2xl': 'var(--r-xl)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        riseIn: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.985)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 160ms ease-out both',
        riseIn: 'riseIn 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}
