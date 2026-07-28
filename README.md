# WWF — Weekend Wave Finder

> 대한민국 7대 서핑 스팟의 **16일 파도 예보**를 "이번 주말 언제 들어가지?" 한 가지 질문에 맞춰
> 다시 짠 서핑 예보 대시보드.

**🔗 [wwf.forges.work](https://wwf.forges.work)**

---

## 왜 만들었나

기존 서핑 예보 서비스는 데이터는 많은데 **정작 결정을 못 도와줍니다.**

- 파고·주기·풍향 숫자를 나열해 놓고 좋고 나쁨은 알아서 판단하라고 합니다.
- 풍향을 나침반 방위(`SSE`, `270°`)로만 보여줍니다. 그런데 오프쇼어인지 아닌지는
  **해변이 어느 쪽을 보느냐에 따라 완전히 다릅니다.** 방위만 봐서는 알 수 없습니다.
- 하루를 하나의 값으로 뭉갭니다. 실제로는 같은 날에도 오전 육풍과 오후 해풍으로
  컨디션이 완전히 갈립니다.

WWF 는 그 세 가지를 정면으로 다룹니다.

---

## 핵심 기능

### 🌊 16일 파도 스트립 — 메인 컨트롤
화면 최상단의 가로 스트립에서 날짜를 고르면 **아래 모든 정보가 그 날짜로 바뀝니다.**
각 날짜 카드는 파고 범위 · 3단계 판정 · 날씨 · 기온 · 강수확률 · 아침/낮/오후 바람을
104px 안에 담습니다.

### 🟢 좋음 / 평범 / 나쁨 — 색만으로 말하지 않습니다
판정은 언제나 **세 채널**로 동시에 나갑니다.

| 판정 | 색 | 도형 | 라벨 |
|---|---|---|---|
| 좋음 (60점~) | 초록 | 꽉 찬 원 ● | "좋음" |
| 평범 (38~59) | 앰버 | 마름모 ◆ | "평범" |
| 나쁨 (~37) | 로즈 | 납작한 막대 ▬ | "나쁨" |

색맹이거나 흑백으로 출력해도 도형과 한글 라벨이 남습니다.

### 🧭 해변 단면 바람 다이어그램
나침반을 버렸습니다. **위쪽은 언제나 육지(해변), 아래쪽은 언제나 바다.**
화살표가 바다 쪽을 향하면 오프쇼어(좋음), 해변 쪽을 향하면 온쇼어(나쁨).

```
   ┌─────────┐
   │ 🏖 해변  │
   ├────↓────┤   화살표가 바다로 = 오프쇼어 = 파도 면이 세워짐
   │ 🌊 바다  │
   └─────────┘
```

스팟이 바뀌어도 그림의 의미가 고정되므로, 방위를 몰라도 읽힙니다.
(양양은 서풍이 오프쇼어, 만리포는 동풍이 오프쇼어입니다 — 앱이 스팟별로 알아서 계산합니다.)

### 🗺️ 지도 · 물때 · 시간별 상세
- OpenStreetMap 기반 인터랙티브 지도에서 스팟 전환
- Open-Meteo `sea_level_height_msl` 기반 실제 조위 곡선 (만조·간조 극점 직접 라벨)
- 시간별 날씨·기온·강수확률·파고·주기·에너지·바람·물때·스코어

### 🎨 테마 3종
`Sea Glass`(기본) · `Golden Hour` · `Night Swell`.
모든 테마가 3개 표면에서 WCAG AA(4.5:1)를 만족하도록 대비를 계산해 검증했습니다.

---

## 서프 스코어

`utils/surfScoreEngine.ts` — 스웰 에너지 + 주기 + 해변 기준 바람을 0~100 으로 합산합니다.

```
E = 4.9 × H² × T        (H: 파고 m, T: 주기 s)
```

**임계값은 한국 해역 기준으로 보정돼 있습니다.** 하와이·인도네시아 기준(450kJ 이상이 빅스웰)을
그대로 쓰면 한국 동해 여름은 16일 내내 "플랫"으로 나와 아무것도 판단할 수 없습니다.
한국의 실제 분포(약 5~200kJ)에 맞춰 구간을 다시 잡았습니다.

참고 환산: `0.6m/6s≈11kJ · 0.8m/7s≈22kJ · 1.0m/8s≈39kJ · 1.5m/9s≈99kJ · 2.0m/10s≈196kJ`

---

## 기술 스택

| | |
|---|---|
| Frontend | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 + CSS 변수 `[data-theme]` 토큰 |
| Map | Leaflet + OpenStreetMap / CARTO 타일 |
| Data | [Open-Meteo](https://open-meteo.com) Marine & Forecast API (16일 / 384시간) |
| Hosting | Cloudflare Pages (`wwf.forges.work`) |

**API 키가 필요 없습니다.** Open-Meteo 는 비상업적 이용에 무료이고 키를 요구하지 않습니다.

---

## 로컬 실행

```bash
npm install
npm run dev      # http://localhost:3050
```

```bash
npm run build    # tsc + vite build → dist/
```

---

## 프로젝트 구조

```
src/
├─ components/
│  ├─ ForecastStrip.tsx      16일 스트립 (메인 컨트롤)
│  ├─ SpotHeader.tsx         지역 컨디션 바 (2행)
│  ├─ SpotMapView.tsx        Leaflet 지도
│  ├─ WindDial.tsx           해변 단면 바람 다이어그램
│  ├─ HourlyForecastTable.tsx
│  ├─ TideChart.tsx
│  ├─ SpotGuideModal.tsx
│  └─ ThemeSwitcher.tsx
├─ services/surfApi.ts       Open-Meteo 수집 · 일별 요약 · 브리핑
├─ utils/
│  ├─ surfScoreEngine.ts     스코어 계산 (한국 해역 보정)
│  ├─ scoreVisuals.ts        판정·바람의 표현 규칙 단일 소스
│  ├─ weather.ts             WMO 코드 → 한글·아이콘
│  └─ theme.ts               테마 레지스트리
├─ types/surf.ts
└─ index.css                 디자인 토큰 ([data-theme] 3종)
```

개발 히스토리와 설계 근거는 [`DEVLOG.md`](DEVLOG.md) / [`HANDOFF.md`](HANDOFF.md) 참고.

---

## 데이터 출처 및 라이선스

- 예보: [Open-Meteo](https://open-meteo.com) (CC BY 4.0)
- 지도: [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL) ·
  타일 [CARTO](https://carto.com/attributions)

> ⚠️ 이 앱의 판정은 수치 모델 기반 참고 자료입니다. 실제 입수 전에는 반드시 현장 상황과
> 기상 특보를 확인하세요. 이안류·너울 사고는 예보가 좋아 보일 때도 발생합니다.

---

## 문의 · 권리

- 문의: **wwf@forges.work**
- © 2026 **forge**. All rights reserved.
