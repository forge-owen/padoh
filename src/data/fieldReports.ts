/**
 * @file src/data/fieldReports.ts
 * @description 현장 실측 기록 — 모델과 실제 바다의 갭을 좁히는 유일한 수단.
 *
 * 왜 필요한가
 * -----------
 * Open-Meteo 해양 격자는 약 9km 입니다. 고성 천진·봉수대와 속초 외옹치·설악은
 * **격자 한 칸을 공유**해 파고·주기가 동일하게 나옵니다. 그런데 2026-08-30 실측에서
 * 천진은 완전한 장판, 봉수대는 코앞 붕괴, 설악은 챠피였습니다. **같은 숫자, 다른 바다.**
 *
 * 이 차이를 만드는 건 격자가 볼 수 없는 것들입니다 — 곶·방파제의 차폐, 근해 수심,
 * 샌드바 모양, 리버마우스. 수치 모델을 아무리 잘 써도 여기서 더 나아갈 수 없고,
 * **현장 관측을 기록해 스팟별로 보정하는 것 말고는 방법이 없습니다.**
 *
 * 그래서 관측을 코드에 남깁니다. 다음 사람이(또는 다음 세션이) "이 스팟 점수가 왜
 * 이렇게 나오지?" 를 물을 때 근거를 찾을 수 있어야 합니다.
 *
 * 기록하는 법
 * -----------
 * 다녀온 날 · 스팟 · 앱이 준 점수 · 실제로 본 것 · (알면) 로컬 평가.
 * 보정을 바로 적용하지 마세요. **같은 방향의 관측이 2회 이상 쌓이면** 그때
 * `koreaSurfSpots.ts` 의 `swellWindow` 나 아래 `localBias` 를 조정합니다.
 * 한 번의 관측으로 상수를 바꾸면 그날 조건에 과적합됩니다.
 */

export interface FieldReport {
  /** 관측일 (YYYY-MM-DD) */
  date: string;
  spotId: string;
  /** 그때 앱이 표시한 점수 */
  appScore: number;
  /** 그 시각의 너울 (m / s) — 왜 틀렸는지 나중에 추적하려면 필요합니다 */
  swell: { heightM: number; periodS: number; directionDeg: number };
  /** 현장에서 본 것. 주관적이어도 그대로 적습니다 */
  observed: string;
  /** 로컬/본인 체감 점수 (0~100). 모르면 생략 */
  observedScore?: number;
}

export const FIELD_REPORTS: FieldReport[] = [
  /* ── 2026-08-30 고성·속초·양양 출장 ──────────────────────────────────
     이 관측이 스코어 엔진을 곱셈 모델로 갈아엎은 계기입니다.
     그날 너울 주기가 4.75~4.85초(= 그라운드 스웰이 아닌 갓 분리된 풍파)였는데,
     예전 엔진은 전체 파주기 6.5초를 쓰고 바람에 35점을 독립 가산해서
     "탈 파도가 없는데 바람만 좋은 날"에 70~80점을 줬습니다.
     → surfScoreEngine.ts 의 PERIOD_TABLE / windFactor 주석 참고. */
  {
    date: '2026-08-30',
    spotId: 'cheonjin',
    appScore: 80,
    swell: { heightM: 1.0, periodS: 4.85, directionDeg: 71 },
    observed:
      '파도가 한 점도 없는 완전한 장판. 해수욕장이 아직 개장 중이었고 해수욕에는 최고. ' +
      '동해 대부분에 파도가 들어온 날인데 여기만 이상하리만큼 평화로움 — 차폐가 의심됨.',
    observedScore: 0,
  },
  {
    date: '2026-08-30',
    spotId: 'bongsudae',
    appScore: 78,
    swell: { heightM: 1.0, periodS: 4.85, directionDeg: 71 },
    observed:
      '해변에 거의 다 와서야 컬이 일어났다가 곧바로 부서짐. 서핑이 될까 싶은 수준. ' +
      '세트가 오면 연속 파도가 너무 잦게 붙어서 옴 (짧은 주기의 전형).',
    observedScore: 10,
  },
  {
    date: '2026-08-30',
    spotId: 'seorak',
    appScore: 72,
    swell: { heightM: 0.9, periodS: 4.75, directionDeg: 61 },
    observed: '굉장히 챠피하고 제법 지저분한 편.',
    observedScore: 20,
  },
  {
    date: '2026-08-30',
    spotId: 'mulchi',
    appScore: 70,
    swell: { heightM: 0.9, periodS: 4.75, directionDeg: 61 },
    observed:
      '그럭저럭. 주변 가본 곳 중 가장 나았음. 역시 서핑 성지라 그런지 형태가 잡힘.',
    observedScore: 40,
  },
];

/**
 * 스팟별 보정 계수 — 관측이 쌓인 스팟에만 둡니다.
 *
 * 곱셈으로 적용됩니다. 1.0 이 보정 없음입니다.
 * **근거 없이 추가하지 마세요.** 반드시 위 FIELD_REPORTS 에 관측을 남기고,
 * 왜 그 값인지 주석으로 적습니다.
 */
export const LOCAL_BIAS: Record<string, { factor: number; reason: string }> = {
  // 관측 1회로는 상수를 바꾸지 않습니다. 천진은 swellWindow 로 차폐를
  // 표현했으므로(koreaSurfSpots.ts) 여기서 추가 보정하지 않습니다.
};
