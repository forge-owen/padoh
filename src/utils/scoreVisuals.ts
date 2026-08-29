/**
 * @file src/utils/scoreVisuals.ts
 * @description 스코어·바람·컨디션의 "보여지는 방식"을 한 곳에 모은 표현 계층.
 *
 * 이전에는 각 컴포넌트가 같은 임계값(75/50/30…)과 색을 제각각 인라인으로 들고 있어서
 * 화면마다 같은 파도가 다른 색으로 보였습니다. 표현 규칙은 여기서만 정의합니다.
 *
 * 색은 절대 단독으로 의미를 전달하지 않습니다. 판정(좋음/평범/나쁨)은 언제나
 * [색 + 아이콘 모양 + 한글 라벨] 세 채널로 함께 나갑니다.
 */

import { WindType, SkillLevel, SeasonKey, TidePreference, CrowdLevel, SurfSpot } from '../types/surf';

/* ── 1. 3단계 판정 — 이 앱에서 가장 중요한 한 가지 ─────────────────────── */

export type VerdictLevel = 'GOOD' | 'FAIR' | 'POOR';

export interface Verdict {
  level: VerdictLevel;
  /** 화면에 그대로 찍히는 한글 라벨 */
  label: string;
  /** CSS 변수 — **텍스트** 색. WCAG AA(4.5:1) 를 만족하도록 어둡게 잡혀 있습니다 */
  colorVar: string;
  /**
   * CSS 변수 — **마크·막대** 색. 마크는 3:1 만 넘으면 되므로 더 밝고 채도가 높습니다.
   * 텍스트에 쓰면 대비가 모자랍니다. 반대로 막대에 colorVar 를 쓰면 탁해 보입니다.
   */
  fillVar: string;
  /** CSS 변수 — 옅은 배경 */
  softVar: string;
  /** 색맹·흑백에서도 구분되는 도형 키 (WeekStrip 의 아이콘이 참조) */
  shape: 'circle' | 'diamond' | 'bar';
}

const VERDICTS: Record<VerdictLevel, Verdict> = {
  GOOD: { level: 'GOOD', label: '좋음', colorVar: 'var(--good)', fillVar: 'var(--good-fill)', softVar: 'var(--good-soft)', shape: 'circle' },
  FAIR: { level: 'FAIR', label: '평범', colorVar: 'var(--fair)', fillVar: 'var(--fair-fill)', softVar: 'var(--fair-soft)', shape: 'diamond' },
  POOR: { level: 'POOR', label: '나쁨', colorVar: 'var(--poor)', fillVar: 'var(--poor-fill)', softVar: 'var(--poor-soft)', shape: 'bar' },
};

/**
 * 서프 스코어 → 3단계 판정.
 * 임계값을 바꿀 일이 생기면 여기 한 곳만 고치면 앱 전체가 따라옵니다.
 */
export function verdictOf(score: number): Verdict {
  if (score >= 60) return VERDICTS.GOOD;
  if (score >= 38) return VERDICTS.FAIR;
  return VERDICTS.POOR;
}

/**
 * 왜 그 판정인지 한 줄로. 판정 배지 옆의 보조 설명입니다.
 *
 * 에너지만 보고 '파도 없음'을 먼저 반환하면, 바람이 완벽해서 판정이 '평범'인 날에
 * "평범 · 파도 없음" 처럼 정면으로 모순되는 문구가 나옵니다. 판정 등급을 먼저 보고
 * 그 안에서 이유를 고릅니다.
 */
export function verdictReason(score: number, energyKJ: number, windType: WindType): string {
  const w = windMeta(windType);
  if (score >= 60) return w.favorable ? '오프쇼어 + 파워' : '파도 좋음';
  if (score >= 38) {
    if (energyKJ < 6) return w.favorable ? '아주 작지만 깔끔' : '작지만 탈 만함';
    return w.favorable ? '작지만 깔끔' : '탈 만함';
  }
  if (energyKJ < 6) return '파도 없음';
  if (!w.favorable) return '온쇼어로 무너짐';
  return '너무 작음';
}

/* ── 2. 스코어 순차 램프 (0~100) ──────────────────────────────────────── */

export type ScoreBucket = 1 | 2 | 3 | 4 | 5;

export function scoreBucket(score: number): ScoreBucket {
  if (score >= 80) return 5;
  if (score >= 62) return 4;
  if (score >= 45) return 3;
  if (score >= 28) return 2;
  return 1;
}

export function scoreColorVar(score: number): string {
  return `var(--score-${scoreBucket(score)})`;
}

export function scoreFillStyle(score: number): React.CSSProperties {
  const b = scoreBucket(score);
  return { background: `color-mix(in srgb, var(--score-${b}) ${6 + b * 9}%, transparent)` };
}

/* ── 3. 바람 ──────────────────────────────────────────────────────────── */

export interface WindMeta {
  /** 24시간 표처럼 24열이 한 화면에 들어가는 곳용 — 줄바꿈되지 않는 길이 */
  short: string;
  /** 사람이 읽는 이름 */
  label: string;
  /** 바람이 어디서 어디로 가는지 — 방위 용어 없이 */
  flow: string;
  /** 서핑에 유리한가 — 색 대신 의미로 분기할 때 사용 */
  favorable: boolean;
  colorVar: string;
}

export function windMeta(windType: WindType): WindMeta {
  switch (windType) {
    case 'GLASSY':
      return { short: '글래시', label: '글래시', flow: '바람 거의 없음', favorable: true, colorVar: 'var(--good)' };
    case 'OFFSHORE':
      return { short: '오프', label: '오프쇼어', flow: '육지 → 바다', favorable: true, colorVar: 'var(--good)' };
    case 'CROSS_OFFSHORE':
      return { short: '측면오프', label: '측면 오프쇼어', flow: '비스듬히 바다로', favorable: false, colorVar: 'var(--fair)' };
    case 'CROSS_ONSHORE':
      return { short: '측면온', label: '측면 온쇼어', flow: '비스듬히 해변으로', favorable: false, colorVar: 'var(--ink-3)' };
    case 'ONSHORE':
    default:
      return { short: '온쇼어', label: '온쇼어', flow: '바다 → 육지', favorable: false, colorVar: 'var(--poor)' };
  }
}

/* ── 바람을 "해변 기준"으로 다시 씁니다 ──────────────────────────────────
 *
 * 오프쇼어/온쇼어는 **절대 방위가 아닙니다.** 해변이 어느 쪽을 바라보느냐에
 * 따라 완전히 달라집니다.
 *
 *   양양 38선  해변이 동쪽을 봄  → 서풍(270°)이 오프쇼어
 *   태안 만리포 해변이 서쪽을 봄  → 동풍(100°)이 오프쇼어
 *   제주 중문  해변이 남쪽을 봄  → 북풍(20°)이 오프쇼어
 *
 * 그래서 나침반 화살표(N/S/E/W)만 보여주면 "이게 왜 오프쇼어지?"를 알 수 없습니다.
 * 일반적인 예보 서비스들이 똑같이 가진 한계입니다.
 *
 * 대신 화면에서는 **해변 단면 다이어그램**을 씁니다(components/WindDial.tsx):
 * 위쪽은 항상 육지(해변), 아래쪽은 항상 바다. 화살표는 바람이 흘러가는 방향.
 *   화살표가 바다 쪽(아래)을 향함 = 육지에서 바다로 부는 바람 = 오프쇼어
 * 스팟이 바뀌어도 그림의 의미는 그대로라, 방위를 몰라도 읽힙니다.
 * ---------------------------------------------------------------------- */

/** 해변이 바라보는 방위(바다 쪽). 오프쇼어 방향의 정반대입니다. */
export function shoreFacingDeg(optimalOffshoreDeg: number): number {
  return (optimalOffshoreDeg + 180) % 360;
}

/**
 * 해변 단면 다이어그램 안에서 바람 화살표를 얼마나 돌릴지.
 *
 * @param windFromDeg        기상 풍향 — 바람이 **불어오는** 방위
 * @param optimalOffshoreDeg 이 스팟의 오프쇼어 방위
 * @returns 0° = 위(육지)를 향함 = 온쇼어 · 180° = 아래(바다)를 향함 = 오프쇼어
 */
export function shoreRelativeArrowRotation(windFromDeg: number, optimalOffshoreDeg: number): number {
  // 오프쇼어 방위와 얼마나 어긋났는지 (0 = 완벽한 오프쇼어)
  const offset = (((windFromDeg - optimalOffshoreDeg) % 360) + 360) % 360;
  // 완벽한 오프쇼어일 때 화살표가 아래(180°)를 향하도록 뒤집습니다
  return (180 - offset + 360) % 360;
}

/** 바람이 실제로 하는 일을 한 문장으로. 방위 용어를 쓰지 않습니다. */
export function windPlainExplanation(windType: WindType): string {
  switch (windType) {
    case 'GLASSY':
      return '바람이 거의 없어 수면이 유리처럼 잔잔합니다.';
    case 'OFFSHORE':
      return '육지에서 바다로 부는 바람. 파도 면을 세워 줘 가장 좋습니다.';
    case 'CROSS_OFFSHORE':
      return '해변을 비스듬히 스치며 바다로 나갑니다. 무난합니다.';
    case 'CROSS_ONSHORE':
      return '바다에서 비스듬히 들어옵니다. 파도 면이 거칠어집니다.';
    case 'ONSHORE':
    default:
      return '바다에서 육지로 부는 바람. 파도가 미리 무너집니다.';
  }
}

/* ── 4. 기타 문구 ─────────────────────────────────────────────────────── */

export function energyAdvice(kJ: number): string {
  if (kJ >= 150) return '숏보드 파워 충분';
  if (kJ >= 60) return '숏·롱보드 모두 양호';
  if (kJ >= 20) return '롱보드 추천';
  if (kJ >= 6) return '입문·패들 연습';
  // '파도 없음' 이라고 쓰면 바람이 완벽해서 판정이 '평범'인 날과 정면으로 모순됩니다.
  // 에너지가 약하다는 사실만 말하고, 종합 판정은 verdict 가 담당합니다.
  return '아주 약함';
}


/* ── 5. 스팟 가이드 축의 표현 ─────────────────────────────────────────────
 *
 * 예보는 "오늘 파도가 어떤가"를 답하지만, 여기 있는 축들은 "그래서 내가 거길
 * 가도 되는가"를 답합니다. 라벨과 색을 여기 한 곳에 모아 둡니다 — 판정 색과
 * 같은 규칙을 쓰되, **실력대는 좋고 나쁨이 아니라 종류**라서 초록/빨강으로
 * 칠하지 않습니다. (상급자 스팟이 '나쁜' 스팟이 아닙니다)
 * --------------------------------------------------------------------- */

export interface GuideChip {
  label: string;
  /** 한 줄 보충 설명 — 툴팁/부연으로 씁니다 */
  hint: string;
  colorVar: string;
  softVar: string;
}

export function skillMeta(level: SkillLevel): GuideChip {
  switch (level) {
    case 'BEGINNER':
      return {
        label: '입문 가능',
        hint: '수심이 완만하고 바닥이 모래라 처음 배우기 좋습니다.',
        colorVar: 'var(--tide)',
        softVar: 'var(--tide-soft)',
      };
    case 'INTERMEDIATE':
      return {
        label: '중급 이상',
        hint: '패들아웃과 라인업 위치 잡기가 어느 정도 되어야 합니다.',
        colorVar: 'var(--gold)',
        softVar: 'var(--gold-soft)',
      };
    case 'ADVANCED':
      return {
        label: '상급자',
        hint: '얕은 리프나 강한 파워가 있어 실수 비용이 큽니다.',
        colorVar: 'var(--rose)',
        softVar: 'var(--rose-soft)',
      };
    case 'ALL':
    default:
      return {
        label: '모든 실력대',
        hint: '구간에 따라 입문부터 숏보드까지 나눠 탈 수 있습니다.',
        colorVar: 'var(--ink-2)',
        softVar: 'var(--raised-hi)',
      };
  }
}

const SEASON_LABEL: Record<SeasonKey, string> = {
  SPRING: '봄',
  SUMMER: '여름',
  AUTUMN: '가을',
  WINTER: '겨울',
};

/** 계절 배열을 '가을·겨울' 처럼 한 덩어리로. 4계절이면 '사계절'. */
export function seasonsLabel(seasons: SeasonKey[]): string {
  if (seasons.length >= 4) return '사계절';
  const order: SeasonKey[] = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];
  return order
    .filter((s) => seasons.includes(s))
    .map((s) => SEASON_LABEL[s])
    .join('·');
}

export function tideMeta(pref: TidePreference): GuideChip {
  switch (pref) {
    case 'HIGH':
      return {
        label: '만조 전후',
        hint: '만조 2~3시간 전후에만 파도가 섭니다. 물때표를 먼저 보세요.',
        colorVar: 'var(--tide)',
        softVar: 'var(--tide-soft)',
      };
    case 'LOW':
      return {
        label: '간조 전후',
        hint: '물이 빠지면서 샌드바가 드러날 때 면이 가장 잘 섭니다.',
        colorVar: 'var(--tide)',
        softVar: 'var(--tide-soft)',
      };
    case 'MID':
      return {
        label: '중조',
        hint: '만조와 간조 사이, 물이 움직이는 구간이 가장 좋습니다.',
        colorVar: 'var(--tide)',
        softVar: 'var(--tide-soft)',
      };
    case 'ANY':
    default:
      return {
        label: '물때 무관',
        hint: '조차가 작아 물때가 컨디션을 크게 바꾸지 않습니다.',
        colorVar: 'var(--ink-3)',
        softVar: 'var(--raised-hi)',
      };
  }
}

export function crowdMeta(level: CrowdLevel): GuideChip {
  switch (level) {
    case 'BUSY':
      return {
        label: '붐빔',
        hint: '주말 낮에는 라인업이 꽉 찹니다. 이른 아침을 노리세요.',
        colorVar: 'var(--poor)',
        softVar: 'var(--poor-soft)',
      };
    case 'MODERATE':
      return {
        label: '보통',
        hint: '주말에 사람이 있지만 자리는 납니다.',
        colorVar: 'var(--fair)',
        softVar: 'var(--fair-soft)',
      };
    case 'QUIET':
    default:
      return {
        label: '한산',
        hint: '서퍼가 적습니다. 대신 구조 인력도 없는 경우가 많습니다.',
        colorVar: 'var(--good)',
        softVar: 'var(--good-soft)',
      };
  }
}

export const BOTTOM_META: Record<SurfSpot['bottomType'], GuideChip> = {
  SANDBAR: {
    label: '모래',
    hint: '바닥이 모래라 넘어져도 비교적 안전합니다. 대신 샌드바가 계절마다 바뀝니다.',
    colorVar: 'var(--gold)',
    softVar: 'var(--gold-soft)',
  },
  REEF: {
    label: '리프',
    hint: '바닥이 바위입니다. 부츠를 신고 간조 수심을 반드시 확인하세요.',
    colorVar: 'var(--rose)',
    softVar: 'var(--rose-soft)',
  },
  POINT_BREAK: {
    label: '포인트',
    hint: '곶을 따라 한 방향으로 길게 깨집니다. 피크 자리 경쟁이 있습니다.',
    colorVar: 'var(--tide)',
    softVar: 'var(--tide-soft)',
  },
};
