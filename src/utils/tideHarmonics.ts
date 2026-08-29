/**
 * @file src/utils/tideHarmonics.ts
 * @description 조화분해(harmonic analysis)로 조위를 연장 예측합니다.
 *
 * 왜 이게 되는가
 * --------------
 * **조석은 기상이 아니라 천문 현상입니다.** 달과 태양의 위치로 결정되므로
 * 원리상 몇 년 뒤도 계산됩니다. 파도(바람이 만드는 것)와 근본적으로 다릅니다.
 *
 * 그런데 Open-Meteo 는 조위를 해양 모델 응답에 얹어 주기 때문에, 모델이 끝나는
 * 약 9일에서 조위도 같이 끊깁니다. 천문학적으로는 알 수 있는 값인데 API 사정으로
 * 안 오는 것뿐입니다.
 *
 * 그래서 **받아 온 9일치에 조화 상수를 맞춰(fit) 나머지를 연장**합니다.
 * 조위는 알려진 주기의 사인파 합이므로, 각 분조의 진폭·위상만 구하면 됩니다:
 *
 *     h(t) = Z₀ + Σ [ Aₖ·cos(ωₖt) + Bₖ·sin(ωₖt) ]
 *
 * ωₖ 는 천문학적으로 고정된 값이라 미지수는 Z₀ 와 Aₖ·Bₖ 뿐이고, 216개 샘플로
 * 최소제곱을 풀면 충분히 결정됩니다.
 *
 * ⚠️ 한계 — 정직하게 표시해야 합니다
 * -----------------------------------
 * 9일 관측으로는 주기가 비슷한 분조를 완전히 분리하지 못합니다
 * (S2/K2 는 분리에 약 182일, K1/P1 은 약 183일이 필요합니다). 그래서 이 값은
 * **국립해양조사원 물때표를 대체하지 않습니다.** 며칠 연장에서는 수십 cm 수준의
 * 오차로 경향(만조/간조 시각)은 잘 맞지만, 정확한 조위가 필요하면 실측 물때표를
 * 봐야 합니다. UI 에서 예측 구간임을 반드시 표시하세요(`tidePredicted`).
 */

/**
 * 주요 분조와 각속도(°/h). 값은 천문학적으로 고정돼 있습니다.
 * 한국 연안에서 실제로 기여가 큰 것들만 골랐습니다 — 분조를 늘릴수록
 * 9일 샘플에서는 과적합이 됩니다.
 */
const CONSTITUENTS: { name: string; speedDegPerHour: number }[] = [
  { name: 'M2', speedDegPerHour: 28.9841042 }, // 주태음반일주조 — 서해에서 압도적
  { name: 'S2', speedDegPerHour: 30.0 },       // 주태양반일주조
  { name: 'N2', speedDegPerHour: 28.4397295 },
  { name: 'K1', speedDegPerHour: 15.0410686 }, // 일주조 — 동해에서 비중이 큼
  { name: 'O1', speedDegPerHour: 13.9430356 },
  { name: 'P1', speedDegPerHour: 14.9589314 },
  { name: 'Q1', speedDegPerHour: 13.3986609 },
  { name: 'M4', speedDegPerHour: 57.9682084 }, // 천해 분조 — 조차 큰 서해 만에서 파형을 비틀음
  { name: 'MS4', speedDegPerHour: 58.9841042 },
];

/** 정규방정식을 가우스 소거로 풉니다 (미지수 19개라 이걸로 충분합니다) */
function solve(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);

  for (let col = 0; col < n; col++) {
    // 부분 피벗팅 — 안 하면 조건수가 나쁠 때 발산합니다
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null; // 특이행렬 — 데이터 부족
    [a[col], a[pivot]] = [a[pivot], a[col]];

    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / a[col][col];
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = a[i][n];
    for (let j = i + 1; j < n; j++) sum -= a[i][j] * x[j];
    x[i] = sum / a[i][i];
  }
  return x;
}

/** 시각 t(시간, 임의 기준)에서의 설계행렬 한 행 */
function basisAt(tHours: number): number[] {
  const row = [1]; // Z₀ (평균 수위)
  for (const c of CONSTITUENTS) {
    const rad = (c.speedDegPerHour * tHours * Math.PI) / 180;
    row.push(Math.cos(rad), Math.sin(rad));
  }
  return row;
}

/**
 * 관측 구간에 조화 상수를 맞춰 **null 인 구간만** 채웁니다.
 *
 * @param series 시간 간격이 1시간으로 균일한 조위 배열(m). 없는 값은 null.
 * @returns `{ filled, predictedFrom }` — predictedFrom 은 예측이 시작되는 인덱스.
 *          맞출 데이터가 부족하면 원본을 그대로 돌려주고 predictedFrom 은 null.
 */
export function extendTideSeries(series: (number | null)[]): {
  filled: (number | null)[];
  predictedFrom: number | null;
} {
  const known: { t: number; v: number }[] = [];
  series.forEach((v, i) => {
    if (v !== null && v !== undefined && Number.isFinite(v)) known.push({ t: i, v });
  });

  const paramCount = 1 + CONSTITUENTS.length * 2; // 19
  // 분조를 안정적으로 분리하려면 최소 며칠은 필요합니다. 미지수의 4배를 기준으로 둡니다.
  if (known.length < paramCount * 4) return { filled: series, predictedFrom: null };

  // 정규방정식 AᵀA·x = Aᵀy 를 직접 누적합니다 (A 를 통째로 들고 있을 필요가 없습니다)
  const ata: number[][] = Array.from({ length: paramCount }, () => new Array(paramCount).fill(0));
  const aty: number[] = new Array(paramCount).fill(0);

  for (const { t, v } of known) {
    const row = basisAt(t);
    for (let i = 0; i < paramCount; i++) {
      aty[i] += row[i] * v;
      for (let j = i; j < paramCount; j++) ata[i][j] += row[i] * row[j];
    }
  }
  // 대칭 채우기
  for (let i = 0; i < paramCount; i++) for (let j = 0; j < i; j++) ata[i][j] = ata[j][i];

  const coef = solve(ata, aty);
  if (!coef || coef.some((c) => !Number.isFinite(c))) {
    return { filled: series, predictedFrom: null };
  }

  const predict = (t: number) => basisAt(t).reduce((sum, b, i) => sum + b * coef[i], 0);

  // 적합도 확인 — 관측 구간에서 크게 빗나가면 예측을 내놓지 않습니다.
  // 잘못된 조위는 "조위 없음"보다 나쁩니다.
  let sse = 0;
  let sst = 0;
  const mean = known.reduce((a, b) => a + b.v, 0) / known.length;
  for (const { t, v } of known) {
    sse += (v - predict(t)) ** 2;
    sst += (v - mean) ** 2;
  }
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  if (r2 < 0.9) return { filled: series, predictedFrom: null };

  let predictedFrom: number | null = null;
  const filled = series.map((v, i) => {
    if (v !== null && v !== undefined && Number.isFinite(v)) return v;
    if (predictedFrom === null) predictedFrom = i;
    return Number(predict(i).toFixed(4));
  });

  return { filled, predictedFrom };
}
