/**
 * @file scripts/verify-spots.mjs
 * @description 스팟 레지스트리 실측 검증. `npm run verify:spots` 로 실행합니다.
 *
 * 스팟을 하나 잘못 찍으면 앱에서는 "예보를 불러오지 못했습니다" 나 조용한 0 으로만
 * 보입니다. 좌표가 육지 격자에 걸리면 Open-Meteo marine API 가 파고를 null 로
 * 돌려주기 때문입니다. 그래서 세 가지를 실제로 확인합니다:
 *
 *   1. 방위 규약 — optimalWindDeg 와 optimalSwellDeg 가 180° ± 35° 안에서 마주보는가
 *   2. id 중복 · 좌표 근접 중복 (지도 마커가 겹칩니다)
 *   3. marine API 가 그 좌표에서 실제로 파고를 돌려주는가
 *
 * 네트워크를 타므로 CI 필수는 아닙니다. 스팟을 추가·수정했을 때 돌리세요.
 */

import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/data/koreaSurfSpots.ts', import.meta.url), 'utf8');

/** TS 파일에서 필요한 필드만 뽑습니다 (빌드 없이 돌리려고 정규식으로 읽습니다) */
const spots = [...src.matchAll(/\{\s*\n\s*id: '([^']+)',[\s\S]*?name: '([^']+)',[\s\S]*?latitude: ([-\d.]+),\s*\n\s*longitude: ([-\d.]+),\s*\n\s*optimalWindDeg: (\d+),\s*\n\s*optimalSwellDeg: (\d+),/g)].map(
  (m) => ({
    id: m[1],
    name: m[2],
    lat: Number(m[3]),
    lon: Number(m[4]),
    windDeg: Number(m[5]),
    swellDeg: Number(m[6]),
  })
);

console.log(`스팟 ${spots.length}개 검증 시작\n`);
const problems = [];

/* ── 1. 방위 규약 ────────────────────────────────────────────────────── */
for (const s of spots) {
  // 두 방위가 정확히 마주보면 180. 굴절 보정으로 조금은 어긋날 수 있습니다.
  const opposition = Math.abs((((s.windDeg - s.swellDeg) % 360) + 360) % 360);
  const off = Math.abs(opposition - 180);
  if (off > 35) {
    problems.push(
      `[방위] ${s.name} (${s.id}) — wind ${s.windDeg}° / swell ${s.swellDeg}° 가 ${off.toFixed(0)}° 어긋남 (허용 35°)`
    );
  }
}

/* ── 2. 중복 ─────────────────────────────────────────────────────────── */
const seen = new Map();
for (const s of spots) {
  if (seen.has(s.id)) problems.push(`[중복] id '${s.id}' 가 두 번 나옵니다`);
  seen.set(s.id, s);
}
for (let i = 0; i < spots.length; i++) {
  for (let j = i + 1; j < spots.length; j++) {
    const a = spots[i], b = spots[j];
    // 위경도 0.004° ≈ 400m. 이보다 가까우면 지도에서 마커 라벨이 겹칩니다.
    if (Math.abs(a.lat - b.lat) < 0.004 && Math.abs(a.lon - b.lon) < 0.004) {
      problems.push(`[근접] ${a.name} 와 ${b.name} 좌표가 400m 이내 — 지도 마커가 겹칩니다`);
    }
  }
}

/* ── 3. marine API 실측 ──────────────────────────────────────────────── */
const lats = spots.map((s) => s.lat).join(',');
const lons = spots.map((s) => s.lon).join(',');
const url =
  `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
  `&hourly=wave_height,wave_period&forecast_days=1&timezone=Asia%2FSeoul`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`marine API 응답 실패: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const payload = await res.json();
// 좌표가 여러 개면 배열, 하나면 객체로 옵니다
const results = Array.isArray(payload) ? payload : [payload];

results.forEach((r, i) => {
  const s = spots[i];
  const heights = r?.hourly?.wave_height ?? [];
  const valid = heights.filter((h) => h !== null && h !== undefined);
  if (valid.length === 0) {
    problems.push(`[무응답] ${s.name} (${s.id}) ${s.lat},${s.lon} — 파고가 전부 null. 좌표를 바다 쪽으로 옮기세요`);
  } else {
    const max = Math.max(...valid);
    console.log(`  ✓ ${s.name.padEnd(22, ' ')} 최대파고 ${max.toFixed(2)}m  (격자 ${r.latitude},${r.longitude})`);
  }
});

/* ── 4. 격자 공유 안내 (실패 아님) ───────────────────────────────────────
 * Open-Meteo marine 격자는 약 0.083° (≈9km) 라 이웃한 스팟들이 같은 셀에 떨어집니다.
 * 그 스팟들은 파고·주기가 동일하게 나옵니다 — 점수는 스팟별 오프쇼어/스웰 방위와
 * 물때로 여전히 갈리지만, "왜 두 해변 파고가 똑같지?" 의 답이 여기 있습니다.
 * ------------------------------------------------------------------- */
const byCell = new Map();
results.forEach((r, i) => {
  const key = `${r.latitude},${r.longitude}`;
  if (!byCell.has(key)) byCell.set(key, []);
  byCell.get(key).push(spots[i].name);
});
const shared = [...byCell.values()].filter((names) => names.length > 1);
if (shared.length) {
  console.log('ℹ️  같은 해양 격자를 공유하는 스팟 (파고·주기가 동일하게 나옵니다)');
  shared.forEach((names) => console.log('   · ' + names.join(' / ')));
}

console.log('');
if (problems.length) {
  console.error(`❌ 문제 ${problems.length}건`);
  problems.forEach((p) => console.error('   ' + p));
  process.exit(1);
}
console.log(`✅ 스팟 ${spots.length}개 전부 통과`);
