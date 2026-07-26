# 📓 K-Surf Forecast — 개발 노트 (Dev Log)

> **프로젝트:** 한국 지역 특화 서핑 예보 앱 (`/Users/owen/WWF`)  
> **공동 작업자:** Claude Code & Antigravity (Google DeepMind Agentic Coding AI)  
> **최종 갱신일:** 2026-07-25  

---

## 1. 프로젝트 개요 & 코워크 아키텍처

본 프로젝트는 대한민국 7대 주요 서핑 스팟(양양 38선/기사문, 죽도, 고성 자작도, 포항 흥환, 부산 송정, 제주 중문, 태안 만리포)에 특화된 실시간 해양 예보 웹 서비스입니다. 
복잡하고 번잡했던 기존 예보 사이트(Surfline 등)의 한계를 개선하여 **100% 무료 & 합법 API(Open-Meteo & OpenStreetMap)**와 **해변 상대 오프쇼어 다이얼**, **16일 장기예보 타임라인**을 제공합니다.

### 🛠️ 기술 스택 (Tech Stack)
- **Frontend:** React (TypeScript, Functional Hooks)
- **Build Tool:** Vite (포트 3050 기반)
- **Styling:** Tailwind CSS + Custom CSS Variables (`[data-theme]` 토큰 시스템)
- **Map Engine:** Leaflet.js + OpenStreetMap / CartoDB Tiles (ODbL Open License)
- **Data Source:** Open-Meteo Marine & Forecast API (16일 384시간 데이터)

---

## 2. 개발 변경 이력 (Changelog Summary)

### [3차 개정 - 최신] 16일 스트립 메인화 & 해변 단면 WindDial
- **해변 단면 바람 다이어그램 (`WindDial.tsx`):**
  - 단순 방위표시(SSE, N)를 폐지하고 **"위쪽=육지, 아래쪽=바다"** 기준의 해변 단면 직관적 바람 화살표로 전면 교체.
  - 육지에서 바다로 불면 오프쇼어(초록/좋음), 바다에서 육지로 불면 온쇼어(빨강/나쁨)로 표현하여 사용자가 즉각 이해 가능하도록 구현.
- **16일 예보 스트립 (`ForecastStrip.tsx`):**
  - 기존 7일 뷰를 16일 타임라인 뷰로 확장.
  - 스트립에서 선택한 날짜(`selectedDateISO`)가 하단의 컨디션 카드, 24시간 표, 물때 차트 전체를 동기화하여 구동하도록 개편.
  - 낮 시간대(`SURFABLE_HOURS = 05~20시`) 기준으로 하루 피크 타임 및 파도 상태를 산출하도록 보정.
- **날씨 & 강수 정보 연동 (`src/utils/weather.ts`):**
  - WMO 4677 코드를 라벨과 Lucide 아이콘으로 매핑하여 기온, 강수확률(20% 이상 시 강조), 하루 대표 날씨를 16일 스트립과 24시간 표에 시각화.

### [2차 개정] 다중 테마 시스템 & 한국 해역 스코어 엔진 재보정
- **다중 테마 시스템 (`src/utils/theme.ts` & `ThemeSwitcher.tsx`):**
  - **Sea Glass (기본 라이트):** 아침 바다 컨셉의 시원한 화이트 & 오션 블루
  - **Golden Hour (라이트 앰버):** 해질녘 세션 컨셉의 모래빛 & 따스한 앰버
  - **Night Swell (다크):** 네이비 & 시안 테마
- **한국 해역 스코어 엔진 재보정 (`src/utils/surfScoreEngine.ts`):**
  - FLAT 판정 게이트를 `< 0.2m` 또는 `< 4kJ`로 조정하여, 동해안 롱보드 파도(0.6m/7s, ~12kJ)가 FLAT으로 매몰되는 현상 해결.
  - 스웰 에너지 구간을 한국 파도 실제 분포(150 / 80 / 35 / 15 / 6 kJ)에 맞춰 판정 변별력 확보.

### [1차 개정] 버그 수정 & 디자인 토큰화
- Open-Meteo MSL 평균해수면 조위 연동 (`sea_level_height_msl`)을 통해 하드코딩되던 물때 차트 정상화.
- 권역 필터(동해/남해/제주/서해) 동작 배선 완료 및 지도 `fitBounds` 카메라 자동 피팅.
- 시간별 표 sticky 열 스크롤 누출 버그 수정.

---

## 3. AI Co-Work 가이드라인 & 약속 (Rule Set)

앞으로 Claude Code, Antigravity, 기타 AI 파트너가 공동으로 협업할 때 준수해야 할 원칙입니다.

1. **상태 관리 단일성 (`selectedDateISO` & `selectedSpotId`):**
   - 날짜 선택은 최상단 `ForecastStrip.tsx`에서 총괄하며, 스팟 변경 시 날짜 선택은 오늘(Today)로 자동 리셋됩니다.
2. **디자인 토큰 준수:**
   - 색상은 `src/index.css`의 `[data-theme]` 변수로 정의되어 있습니다. 코드에 `bg-[#3B332E]` 같은 리터럴 hex를 직접 작성하지 말고 시맨틱 클래스 (`bg-[#...]` 대신 `[data-theme]` 연동 클래스 또는 CSS 변수)를 활용하십시오.
3. **텍스트 잉크 vs 마크 잉크 분리:**
   - 텍스트용(`--good`, `--fair`, `--poor`)과 마크/막대용(`--good-fill`, `--fair-fill`)을 엄격히 구분하여 WCAG AA 대비(4.5:1)를 보장하십시오.
4. **품질 검증 필수 조건:**
   - 코드 변경 후 반드시 `npx tsc --noEmit` 정적 타입검사와 `npm run build` 프로덕션 빌드가 100% 오류 없이 성공하는지 검증하십시오.
5. **한글 문서화 및 주석:**
   - 설명과 주석은 초보자도 이해하기 쉬운 한국어로 작성하며, 코드 변경의 '왜(Why)' 의도를 주석으로 명시하십시오.

---

## 4. 향후 로드맵 & 개선 과제 (Backlog)

- [ ] **7개 스팟 일괄 예보 병렬수집:** 현재 선택된 스팟만 예보를 수집하는 구조에서, 지도상 7개 스팟 전체의 오늘 판정색을 한번에 렌더링하도록 Open-Meteo 다중 좌표 API 요청 개선.
- [ ] **라이브 카메라 연동 강화:** 각 스팟별 검증된 실시간 스트리밍 라이브캠 URL 채우기.
- [ ] **단위 테스트(Unit Test) 구축:** `surfScoreEngine.ts` 및 `classifyTide` 등 핵심 순수 함수에 대한 Vitest 단위 테스트 도입.
