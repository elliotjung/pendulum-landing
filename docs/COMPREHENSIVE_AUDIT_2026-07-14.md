# Pendulum Landing 종합 감사 및 개선 대장

감사일: 2026-07-14
대상: `pendulum-landing` 정적 EN/KO 랜딩 사이트
연계 감사: [Pendulum Lab 본체 종합 감사](https://github.com/elliotjung/pendulum-lab/blob/master/docs/COMPREHENSIVE_AUDIT_2026-07-14.md)

## 범위와 판정 기준

이 감사는 `index.html`/`ko.html`, CSS, Three.js hero, mini-lab, evidence·changelog hydration, CSP·OG 자산, Playwright·Lighthouse 계약을 함께 본다. 첨부 레퍼런스의 핵심은 **왼쪽의 절제된 서사, 오른쪽의 실제 이중진자, 짙은 navy 공간, cyan/violet 발광 궤적**으로 정의했다. 단순히 비슷한 배경을 넣는 것이 아니라 실시간 동역학, 즉시 보이는 fallback, 저성능 장치 대체 경로까지 한 시각 시스템으로 구성하는 것을 목표로 삼았다.

변경 전 Lighthouse 3회 median은 performance **0.97**, accessibility/best-practices/SEO **1.00**, LCP **2,130 ms**, CLS **0.0035**, TBT **51 ms**였다. 재설계 후 동일한 3회 median 게이트는 performance **0.99**, accessibility/best-practices/SEO **1.00**, LCP **2,106 ms**, CLS **0.000**, TBT **0 ms**로 통과했다. 전체 Playwright도 Chromium과 mobile-chrome의 **34/34** 검사를 통과했다.

상태 표기:

- **이번 작업 · 구현+전용 검증**: 실제 자산/소스 변경과 Playwright·정적 계약·스냅샷 중 대응 검증이 함께 존재한다.
- **이번 작업 · 구현+전체 검증**: 실제 변경과 Chromium/mobile-chrome 전체 Playwright 및 3회 Lighthouse median 검증이 함께 존재한다.
- **향후**: 이번 변경 범위에는 포함하지 않은 후속 개선이다.
- **외부 조건**: 본체 저장소의 공개·하드웨어 상태가 바뀌어야 완료된다.

## A. Hero 시각 설계와 상호작용

|   # | 심각도 | 위험·근거                                                                                                               | 권장 조치                                                                                | 상태                                                                |
| --: | :----: | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 001 |   P0   | 기존 hero는 첫 입력 또는 최대 9초까지 Three.js를 요청하지 않아 첫 화면이 비거나 의도와 다른 정적 배경만 보일 수 있었다. | idle callback 1.2초 deadline, 미지원 시 450 ms fallback으로 자동 시작한다.               | **이번 작업 · 구현+전용 검증** — `assets/main.js`, default-load E2E |
| 002 |   P0   | WebGL bundle·초기화 전 canvas가 기본 300×150 blank여서 LCP와 신뢰감이 약했다.                                           | 70 KB WebP hero fallback을 즉시 배치한다.                                                | **이번 작업 · 구현+전용 검증** — `assets/hero-fallback.webp`        |
| 003 |   P1   | fallback 요청이 CSS discovery 뒤 시작되면 LCP가 늦어진다.                                                               | `<link rel=preload fetchpriority=high>`로 hero image를 먼저 요청한다.                    | **이번 작업 · 구현+전용 검증** — 정적 asset check                   |
| 004 |   P0   | 기존 중앙 luminous ring은 첨부 레퍼런스의 “실제 이중진자와 chaos trajectory”를 표현하지 못했다.                         | metallic rods, pivot, 두 bob을 가진 물리적 double pendulum으로 교체한다.                 | **이번 작업 · 구현+전용 검증** — `assets/scene.js`, visual snapshot |
| 005 |   P1   | 시각 효과만 있고 chaos의 민감한 초기조건을 직접 보여주지 않았다.                                                        | `Δθ₀=8×10⁻⁴ rad`인 두 번째 shadow pendulum을 동시에 적분한다.                            | **이번 작업 · 구현+전용 검증**                                      |
| 006 |   P0   | hero만 별도 임의 운동식을 쓰면 연구 앱과 다른 “가짜 물리”가 된다.                                                       | mini-lab과 공유하는 RK4 double-pendulum kernel을 사용한다.                               | **이번 작업 · 구현+전용 검증** — shared-kernel E2E 유지             |
| 007 |   P1   | frame-rate 의존 적분은 장치마다 trajectory와 캡처가 달라진다.                                                           | accumulator 기반 240 Hz fixed-step RK4와 frame clamp를 사용한다.                         | **이번 작업 · 구현+전용 검증**                                      |
| 008 |   P1   | 첫 프레임에서 궤적이 비어 있으면 레퍼런스의 풍부한 chaos trail을 즉시 전달하지 못한다.                                  | 결정적 prewarm으로 초기 궤적을 채운다.                                                   | **이번 작업 · 구현+전용 검증**                                      |
| 009 |   P1   | 스크린샷 테스트가 실행마다 달라지면 시각 회귀 계약이 무력해진다.                                                        | capture mode에 결정적 RNG·prewarm·frozen frame을 사용한다.                               | **이번 작업 · 구현+전용 검증** — 갱신된 1200×720 snapshot           |
| 010 |   P1   | rods와 bob이 평면 선으로 보이면 프리미엄 3D 깊이감이 부족하다.                                                          | cylinder/sphere PBR 재질, key/fill/rim light, anchor assembly를 사용한다.                | **이번 작업 · 구현+전체 검증**                                      |
| 011 |   P1   | 궤적 색이 한 계열이면 두 해의 분기와 레퍼런스의 cyan/violet 대비가 약하다.                                              | 첫 질점 cyan, 두 번째 질점 violet, shadow ice trace로 의미를 분리한다.                   | **이번 작업 · 구현+전용 검증**                                      |
| 012 |   P0   | 매 프레임 `TubeGeometry`를 재생성하면 GC와 main-thread spike가 누적된다.                                                | 고정 capacity `BufferGeometry` ring buffer를 갱신한다.                                   | **이번 작업 · 구현+전체 검증**                                      |
| 013 |   P2   | trail만 있으면 운동 방향·속도감이 약하다.                                                                               | 제한된 spark points와 opacity gradient를 trail에 결합한다.                               | **이번 작업 · 구현+전체 검증**                                      |
| 014 |   P2   | 빈 우주 배경은 과학 장비 느낌이 부족하다.                                                                               | 낮은 대비 grid, orbit rings, deterministic particles를 추가한다.                         | **이번 작업 · 구현+전체 검증**                                      |
| 015 |   P1   | 가운데 3D object가 큰 headline과 경쟁해 레퍼런스의 45/55 균형을 깨뜨렸다.                                               | desktop은 copy 왼쪽, stage 오른쪽으로 명확히 배치한다.                                   | **이번 작업 · 구현+전용 검증** — visual snapshot                    |
| 016 |   P1   | hero에 3개 CTA, typewriter, 2개 spec card가 겹쳐 첫 메시지가 과밀했다.                                                  | CTA 2개와 한 줄 trust proof만 남긴다.                                                    | **이번 작업 · 구현+전용 검증**                                      |
| 017 |   P1   | 길고 기술적인 첫 문단은 chaos의 감정적·실험적 핵심을 늦게 전달했다.                                                     | “거의 같은 두 진자가 두 우주로 갈라짐”을 짧게 설명한다.                                  | **이번 작업 · 구현+전용 검증**                                      |
| 018 |   P2   | card를 제거하면 실시간성이 약해 보일 수 있다.                                                                           | 비대화하지 않는 `Live RK4 / 240 Hz / Δθ₀` telemetry를 stage 장식으로 둔다.               | **이번 작업 · 구현+전체 검증**                                      |
| 019 |   P1   | canvas 준비 순간 정적 이미지가 갑자기 사라지면 flash와 CLS 체감이 생긴다.                                               | `hero-live` class로 canvas를 fade-in하고 fallback을 저농도로 유지한다.                   | **이번 작업 · 구현+전용 검증**                                      |
| 020 |   P1   | WebGL context loss 후 검은 canvas로 남을 수 있었다.                                                                     | context-lost에서 animation을 멈추고 정적 fallback 상태로 전환한다.                       | **이번 작업 · 구현+전체 검증**                                      |
| 021 |   P2   | context가 복구되어도 live scene을 자동 재생성하는 `webglcontextrestored` 경로는 없다.                                   | renderer/resource 재구성 또는 명시적 reload action을 추가한다.                           | **향후**                                                            |
| 022 |   P1   | pointer parallax만으로는 “3D로 역동적”이라는 요구가 약하다.                                                             | pointer parallax, press-drag orbit, scroll depth를 함께 적용한다.                        | **이번 작업 · 구현+전용 검증**                                      |
| 023 |   P2   | 과도한 camera 회전은 멀미와 copy 가독성을 해칠 수 있다.                                                                 | pointer/drag/scroll 영향을 작은 bounded angle로 제한한다.                                | **이번 작업 · 구현+전체 검증**                                      |
| 024 |   P1   | offscreen에서도 WebGL loop가 계속되면 배터리·GPU를 낭비한다.                                                            | `IntersectionObserver`와 `visibilitychange`로 재생을 중지·재개한다.                      | **이번 작업 · 구현+전체 검증**                                      |
| 025 |   P0   | reduced-motion 사용자가 강제 3D chaos motion을 볼 수 있었다.                                                            | reduced-motion이면 scene bundle 대신 정적 hero를 유지한다.                               | **이번 작업 · 구현+전용 검증**                                      |
| 026 |   P1   | data-saver 사용자를 CSS media query만으로 판별하면 일부 브라우저를 놓친다.                                              | `prefers-reduced-data`와 `navigator.connection.saveData`를 함께 확인한다.                | **이번 작업 · 구현+전체 검증**                                      |
| 027 |   P1   | 2 GB 이하 저메모리 장치에서 큰 WebGL scene이 tab crash를 유발할 수 있다.                                                | `deviceMemory<=2`에서는 정적 fallback으로 제한한다.                                      | **이번 작업 · 구현+전체 검증**                                      |
| 028 |   P1   | 모바일에서 desktop geometry·particles·trail 길이를 그대로 사용하면 thermal throttling이 쉽다.                           | compact geometry, 620 particles, 짧은 trails, 낮은 DPR을 사용한다.                       | **이번 작업 · 구현+전체 검증**                                      |
| 029 |   P1   | bloom postprocessing은 모바일에서 fill-rate와 메모리를 크게 쓴다.                                                       | desktop에서만 bloom composer를 만들고 compact는 direct render한다.                       | **이번 작업 · 구현+전체 검증**                                      |
| 030 |   P1   | 280/320 px 화면에서 heading·CTA가 잘리고 hero가 1,400 px 이상 길어질 수 있었다.                                         | typography/stage/nav breakpoints를 재설계하고 280·320·390 px overflow/height를 검사한다. | **이번 작업 · 구현+전용 검증** — multi-width E2E                    |

## B. 증거·카피·콘텐츠 무결성

|   # | 심각도 | 위험·근거                                                                                                                        | 권장 조치                                                                   | 상태                                                               |
| --: | :----: | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 031 |   P0   | hero와 meta의 test count는 evidence source와 항상 동기화되어야 한다.                                                             | `tests.formatted`를 JSON에서 hydrate하고 1,090 fallback을 정적 검사한다.    | **이번 작업 · 구현+전용 검증**                                     |
| 032 |   P0   | 기존 validation table은 “13 methods/GBS 8.97e-13”으로 현재 “14 methods/DOP853 1.612e-14”와 달랐다.                               | 현재 evidence의 best method, drift, profile count로 교체한다.               | **이번 작업 · 구현+전용 검증**                                     |
| 033 |   P1   | SciPy 수치는 범위 없이 과장될 수 있다.                                                                                           | `~6e-14`를 “regular reference cases” 범위와 함께 표시한다.                  | **이번 작업 · 구현+전용 검증**                                     |
| 034 |   P1   | period-doubling 주장은 계산값만 보여 literature anchor를 숨겼다.                                                                 | `1.066372 vs 1.066300`을 computed-vs-literature로 표시한다.                 | **이번 작업 · 구현+전용 검증**                                     |
| 035 |   P0   | WebGPU가 완전한 다중 vendor 검증처럼 읽힐 수 있지만 실제 matrix는 1/3이다.                                                       | `1 / 3 vendors`, `NVIDIA + AMD pending`, partial status를 노출한다.         | **이번 작업 · 구현+전용 검증**                                     |
| 036 |   P0   | 공개 공급망이 완료된 것처럼 보일 수 있지만 npm과 Zenodo는 미완료다.                                                              | GitHub release/Pages live와 npm/Zenodo pending을 같은 행에 표시한다.        | **이번 작업 · 구현+전용 검증**                                     |
| 037 |   P1   | social card의 숫자가 맞아도 어느 evidence commit에서 생성했는지 확인할 계약이 없었다.                                            | OG metadata `sourceEvidenceCommit`을 summary provenance와 비교한다.         | **이번 작업 · 구현+전용 검증** — `scripts/check-static-assets.mjs` |
| 038 |   P1   | 새 짧은 meta description의 “verified tests” 표현을 기존 sync regex가 갱신하지 못했다.                                            | verified/unit variants를 count sync·check가 모두 인식하게 한다.             | **이번 작업 · 구현+전용 검증**                                     |
| 039 |   P1   | JS 또는 changelog fetch 실패 시 “Loading…” 카드만 영구 노출되었다.                                                               | 현재 3개 release highlight를 정적 fallback으로 포함한다.                    | **이번 작업 · 구현+전용 검증**                                     |
| 040 |   P0   | `assets/changelog-highlights.json`의 summary에 mojibake가 있어 runtime hydration이 올바른 fallback을 다시 깨뜨릴 수 있었다.      | UTF-8 원본에서 다시 동기화하고 정적 검사에 의심 인코딩 패턴을 거부하는 게이트를 추가한다. | **이번 작업 · 구현+전용 검증** — 올바른 UTF-8 JSON 및 `npm run check` |
| 041 |   P1   | evidence summary에는 14일 만료일이 있으나 만료 상태가 페이지에서 보이지 않는다.                                                  | expired evidence면 badge·CTA를 stale로 표시하고 claim hydration을 중단한다. | **이번 작업 · 구현+전체 검증** — stale E2E                         |
| 042 |   P1   | 본체 커밋 후 landing evidence/OG/changelog 동기화가 수동이면 truth drift가 재발한다.                                             | cross-repo workflow dispatch와 provenance PR을 자동화한다.                  | **향후**                                                           |
| 043 |   P1   | 외부 JSON shape가 바뀌면 `undefined` 또는 부분 카피가 조용히 노출될 수 있다.                                                     | evidence/changelog schema validator와 fail-closed fallback을 추가한다.      | **이번 작업 · 구현+전체 검증** — malformed E2E                     |
| 044 |   P2   | `cache:no-store`는 정적 immutable evidence를 매 방문 재요청했다.                                                                 | 기본 HTTP cache를 사용하고 배포 시 content revision으로 무효화한다.         | **이번 작업 · 구현+전체 검증**                                     |
| 045 |   P2   | 구조화 데이터에 author/dateModified가 없어 검색엔진의 소유·신선도 단서가 약했다.                                                 | SoftwareApplication·ScholarlyArticle author와 dateModified를 추가한다.      | **이번 작업 · 구현+전용 검증**                                     |

## C. 접근성·국제화·progressive enhancement

|   # | 심각도 | 위험·근거                                                                                             | 권장 조치                                                             | 상태                                         |
| --: | :----: | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| 046 |   P1   | evidence table에 caption이 없어 screen reader가 표의 출처·목적을 바로 알기 어렵다.                    | 동기화된 release evidence snapshot이라는 caption을 추가한다.          | **이번 작업 · 구현+전용 검증**               |
| 047 |   P1   | 기존 마지막 빈 `<th>`와 불완전 header 관계가 열 의미를 숨겼다.                                        | 모든 column에 scope와 이름을 주고 각 row label에 `scope=row`를 둔다.  | **이번 작업 · 구현+전용 검증**               |
| 048 |   P1   | 색·막대만으로 pass/partial을 구분하면 비시각 사용자에게 상태가 전달되지 않는다.                       | passed/measured/partial 텍스트 badge를 사용한다.                      | **이번 작업 · 구현+전용 검증**               |
| 049 |   P1   | animated mini-lab canvas에 대체 콘텐츠가 없었다.                                                      | `role=img`, 명확한 label, canvas fallback 설명을 넣는다.              | **이번 작업 · 구현+전용 검증**               |
| 050 |   P0   | mini-lab animation을 사용자가 직접 멈출 수 없었다.                                                    | Pause/Resume button과 상태 readout을 추가한다.                        | **이번 작업 · 구현+전용 검증** — control E2E |
| 051 |   P1   | pause button 상태가 assistive technology에 노출되지 않으면 동작을 알기 어렵다.                        | `aria-pressed`, label text, paused mode를 함께 갱신한다.              | **이번 작업 · 구현+전용 검증**               |
| 052 |   P0   | JS가 중간 실패하면 `.reveal` 요소가 opacity 0으로 영구 숨겨질 수 있었다.                              | `js-ready`일 때만 hidden base state를 적용하고 no-JS는 항상 표시한다. | **이번 작업 · 구현+전용 검증**               |
| 053 |   P2   | changelog 전체를 `aria-live`로 두면 hydration 시 긴 콘텐츠가 불필요하게 재낭독된다.                   | live region을 제거하고 정적 콘텐츠를 기본으로 둔다.                   | **이번 작업 · 구현+전용 검증**               |
| 054 |   P1   | hero·mini-lab 외 GSAP reveal/scroll motion도 사용자가 페이지 안에서 끌 수 있는 전역 제어는 없다.      | 세션 지속 “Reduce motion” toggle을 추가해 모든 animator에 전달한다.   | **향후**                                     |
| 055 |   P1   | 새 hero/nav/CTA 문구가 EN만 바뀌면 정적 KO page와 계약이 어긋난다.                                    | i18n dictionary를 갱신하고 `ko.html`을 재생성한다.                    | **이번 작업 · 구현+전용 검증** — KO/EN E2E   |
| 056 |   P1   | 작은 화면 section menu의 Korean accessible label이 누락될 수 있었다.                                  | `#nav-menu summary` aria label을 locale dictionary에서 번역한다.      | **이번 작업 · 구현+전용 검증**               |
| 057 |   P1   | 아주 좁은 화면의 nav launch가 44 px touch target 또는 viewport 안쪽을 보장하지 못했다.                | compact nav/menu에 최소 hit area와 overflow-safe width를 적용한다.    | **이번 작업 · 구현+전용 검증**               |
| 058 |   P2   | forced-colors에서 발광 trail/status의 의미와 focus visibility를 실제 Windows HC로 확인한 증거가 없다. | forced-colors Playwright emulation과 실제 HC 수동 점검을 추가한다.    | **향후**                                     |

## D. 성능·복원력·자산 예산

|   # | 심각도 | 위험·근거                                                                                    | 권장 조치                                                                                            | 상태                                |
| --: | :----: | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 059 |   P1   | scroll handler가 매 event에서 layout/style을 즉시 갱신했다.                                  | 한 frame에 한 번만 실행하도록 rAF throttle한다.                                                      | **이번 작업 · 구현+전체 검증**      |
| 060 |   P1   | cursor glow/parallax loop가 포인터가 멈춰도 영구 rAF를 돌았다.                               | 움직임 오차가 수렴하면 loop를 멈추고 새 입력 때만 재개한다.                                          | **이번 작업 · 구현+전체 검증**      |
| 061 |   P2   | 긴 아래쪽 section들이 첫 렌더 비용에 모두 참여한다.                                          | `.band`에 `content-visibility:auto`와 intrinsic size를 적용한다.                                     | **이번 작업 · 구현+전체 검증**      |
| 062 |   P1   | high-DPR display에서 hero pixel 수가 폭증한다.                                               | renderer DPR을 desktop 1.55, compact 1.2로 cap한다.                                                  | **이번 작업 · 구현+전체 검증**      |
| 063 |   P1   | resize마다 renderer/composer를 올바르게 동기화하지 않으면 blur·stretch가 생긴다.             | viewport/camera/renderer/composer size를 한 resize path에서 갱신한다.                                | **이번 작업 · 구현+전체 검증**      |
| 064 |   P1   | 566 KB 안팎의 scene bundle은 여전히 첫 상호작용 비용이 크다.                                 | Three core/addons tree-shaking을 재측정하고 worker/off-main-thread 또는 더 작은 renderer를 검토한다. | **향후**                            |
| 065 |   P2   | scene과 animation vendor가 별도 큰 bundle이라 중복 helper/polyfill 가능성이 있다.            | production metafile로 중복 모듈·dead export를 audit한다.                                             | **향후**                            |
| 066 |   P2   | OG PNG가 약 903 KB로 social crawler에는 괜찮지만 repository·deploy 전송량은 더 줄일 수 있다. | 텍스트 선명도를 유지한 indexed PNG/oxipng 최적화를 비교한다.                                         | **향후**                            |
| 067 |   P2   | `og-card-base.png`도 약 798 KB라 생성 source 보관 비용이 크다.                               | lossless 최적화 후 pixel hash/provenance를 다시 고정한다.                                            | **향후**                            |
| 068 |   P1   | mini-lab 2D console이 frame마다 많은 trail stroke를 그려 모바일 CPU를 점유할 수 있다.        | visible trail decimation, offscreen pause, adaptive FPS를 적용한다.                                  | **이번 작업 · 구현+전체 검증**      |
| 069 |   P1   | mini-lab canvas의 DPR/크기 상한과 저전력 quality ladder가 hero만큼 명확하지 않다.            | 장치 성능에 따른 backing-store cap과 30/60 fps tier를 추가한다.                                      | **이번 작업 · 구현+전체 검증**      |
| 070 |   P2   | network/asset 실패를 사용자에게 구분해 보여주는 진단은 정적 fallback 외에는 제한적이다.      | scene load timeout, retry, telemetry-free local diagnostic state를 추가한다.                         | **향후**                            |

## E. 테스트·SEO·출시 계약

|   # | 심각도 | 위험·근거                                                                                                       | 권장 조치                                                                               | 상태                                           |
| --: | :----: | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 071 |   P0   | 기존 hero smoke는 좌하단 8×8 pixel만 검사해 object가 오른쪽이면 false negative/false positive가 가능했다.       | 장면 주요 영역 5곳을 16×16으로 probe한다.                                               | **이번 작업 · 구현+전용 검증**                 |
| 072 |   P0   | default URL의 자동 3D 시작을 테스트하지 않아 9초 지연 회귀를 놓쳤다.                                            | 4초 안에 `__heroPainted`와 live/fallback 상태를 요구한다.                               | **이번 작업 · 구현+전용 검증**                 |
| 073 |   P1   | mobile overflow test가 390 px 한 가지뿐이라 280/320 clipping을 놓쳤다.                                          | 280·320·390에서 heading bounds, document overflow, hero height를 검사한다.              | **이번 작업 · 구현+전용 검증**                 |
| 074 |   P1   | animation pause control의 ARIA와 실제 loop 상태 회귀가 고정되지 않았다.                                         | pause/resume click, `aria-pressed`, label, mode readout을 테스트한다.                   | **이번 작업 · 구현+전용 검증**                 |
| 075 |   P1   | 대규모 hero 재설계 후 옛 visual baseline을 그대로 두면 회귀 검사가 항상 실패하거나 무의미해진다.                | 의도한 1200×720 frame을 검토 후 snapshot으로 승격한다.                                  | **이번 작업 · 구현+전용 검증** — snapshot 갱신 |
| 076 |   P1   | Playwright config에 mobile-chrome이 있지만 빠른 smoke는 Chromium만 실행한다.                                    | release gate에서 두 project 전체를 실행하고 결과를 보존한다.                            | **이번 작업 · 구현+전체 검증** — 34/34         |
| 077 |   P0   | 재설계 전 Lighthouse 0.97 결과를 새 hero의 성능 증거로 재사용할 수 없다.                                        | 동일 3-run median을 재실행해 LCP≤2.5s, TBT≤150ms, CLS≤0.05를 확인한다.                  | **이번 작업 · 구현+전체 검증** — 0.99/2106/0/0 |
| 078 |   P1   | context-loss, save-data, low-memory, reduced-motion fallback을 각각 E2E로 강제하는 coverage가 없다.             | browser capability stubs와 context loss fixture를 추가한다.                             | **이번 작업 · 구현+전체 검증**                  |
| 079 |   P1   | page title은 새 tagline인데 `og:title`은 옛 “Double-Pendulum Chaos Engine”이라 share preview 메시지가 어긋난다. | OG/Twitter title을 canonical page title과 동기화하고 정적 검사한다.                     | **이번 작업 · 구현+전체 검증**                  |
| 080 |   P1   | 랜딩의 GPU/npm/Zenodo 문구는 본체 외부 상태가 바뀌기 전까지 partial이어야 한다.                                 | NVIDIA·AMD runner, npm publish, Zenodo DOI가 실제 완료된 뒤 evidence commit을 갱신한다. | **외부 조건** — 본체 감사 #116–#119 참조       |

## 릴리스 전 필수 체크

1. `npm run build:hero`, `npm run build:ko`, `npm run check`, `npm run audit`
2. `npm test`로 Chromium과 mobile-chrome 전체 실행, axe EN/KO와 갱신된 visual snapshot 확인
3. `npm run lighthouse` 3회 median 재측정; 위 budget을 하나라도 넘으면 원인 분석 후 재실행
4. `assets/changelog-highlights.json`의 UTF-8 문자열과 strict mojibake gate가 유지되는지 확인
5. `assets/evidence-summary.json`, OG pixels/meta, changelog source commit이 동일한 본체 commit을 가리키는지 확인
6. 280/320/390 px, 1200×720, wide desktop에서 WebGL live와 static fallback을 모두 육안 검토

본체의 NVIDIA·AMD·npm·Zenodo 항목은 랜딩 코드가 대신 완료할 수 없다. 따라서 현재의 `partial` 표시는 결함이 아니라 정확한 공개 상태이며, 외부 증거가 생기기 전까지 유지해야 한다.
