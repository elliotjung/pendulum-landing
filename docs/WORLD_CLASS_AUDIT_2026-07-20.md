# Pendulum Landing 세계 수준 개선 감사 — 2026-07-20

- 범위: `index.html`, 생성 페이지 `ko.html`, 3D 장면, 미니 콘솔, 상호작용·스타일, 생성/정적 검사, Playwright, 시각 QA
- 원칙: 이 문서에는 이번 변경에서 실제 구현한 항목만 기록한다. 제안만 한 항목은 없다.
- 증거 수치: 랜딩에 커밋된 evidence 값은 동기화 파이프라인 소유이므로 임의 변경하지 않았다.
- 통합 번호 색인: [두 저장소 1–188 감사](https://github.com/elliotjung/pendulum-lab/blob/master/documents/WORLD_CLASS_AUDIT_2026-07-20.md)

> **현재 상태 / 대체 고지 (2026-08-13):** 이 문서는 2026-07-20 당시의 감사 기록이며 아래 검증 수치도 그 시점의 스냅샷이다. 이후 ReactBits, `animation-vendor`, GSAP 의존성과 관련 빌드 대상은 모두 제거되었다. 최신 로컬 검증에서는 Chromium smoke 22/22와 WebKit smoke 21/21이 통과했다. `npm run check`는 새 정적 계약까지 통과한 뒤 만료된 evidence 하나만 차단하고 있으며, 시뮬레이터에서 생성할 fresh evidence 동기화를 기다리는 상태이므로 현재 PASS로 표기하지 않는다.

## 완료 항목 1–66

| # | 문제 | 실제 조치 | 근거 / 검증 |
|---:|---|---|---|
| 1 | 첫 화면 뒤 idle callback이 581 KB 3D 번들을 자동 로드해 느린 CI의 TBT를 폭증시킴 | idle/timer 자동 로드를 제거하고 실제 pointer, touch, scroll, key 또는 명시적 버튼 입력에만 로드 | `assets/main.js:requestHeroScene`; defer Playwright |
| 2 | 기본 정적 포스터가 이미 완성됐는데도 로딩 감시자는 3D를 기다릴 수 있음 | idle/static 상태도 `__heroPainted`로 즉시 확정 | `setHeroState`; default-load Playwright |
| 3 | WebGL 없는 Firefox에서 Three 생성자가 console error를 남김 | Three import 전에 임시 canvas로 WebGL2 capability를 조용히 probe | `canCreateWebGL2`; unsupported-WebGL Playwright |
| 4 | WebGL1 컨텍스트가 있어도 현재 Three 버전의 WebGL2 요구를 만족하지 못할 수 있음 | capability와 실제 scene 모두 `webgl2`로 명시 | `main.js`, `scene.js:buildScene` |
| 5 | 브라우저의 context creation event가 실패 로그를 만들 수 있음 | probe와 실제 canvas의 `webglcontextcreationerror`를 `preventDefault` 처리 | 두 WebGL context 경로 |
| 6 | 지원 불가 장치도 큰 Three 번들을 내려받을 수 있음 | probe 실패 시 dynamic import 자체를 실행하지 않음 | 요청 수 0 Playwright assertion |
| 7 | 3D 모듈 네트워크 실패가 빈 canvas 또는 loading 고착을 만들 수 있음 | import rejection을 WebP/CSS 정적 모드로 fail-closed | module-failure Playwright |
| 8 | dynamic import 도중 환경설정이 static으로 바뀌면 모듈이 일찍 종료되고 해제 후에도 loading에 고착될 수 있음 | 모듈 import와 실행 준비 Promise를 분리하고 재호출 가능한 `__heroLifecycle.ensure()`로 static 조기 종료 뒤 같은 모듈을 재개 | 지연 import preference 왕복 회귀 테스트 |
| 9 | 빠른 중복 입력이나 환경설정 왕복이 여러 dynamic import 또는 중복 초기화를 만들 수 있음 | `heroScenePromise`는 단일 모듈 요청, `heroEnsurePromise`와 scene initialization Promise는 단일 활성 준비 작업을 재사용 | `requestHeroScene`, lifecycle ensure |
| 10 | 로드 전에도 HUD가 “Live RK4”라고 주장함 | 기본 HUD를 “3D ready / starts on interaction”으로 정직하게 변경 | EN/KO 생성 HTML |
| 11 | 3D 준비·실행·일시정지·폴백 상태가 보조기술에 전달되지 않음 | `role=status`, `aria-live=polite` 상태 채널 추가 | `[data-hero-status]`, axe |
| 12 | 사용자가 명시적으로 3D를 시작할 방법이 없음 | 고정된 Start 3D 컨트롤 추가 | `[data-hero-toggle]`; hero-control Playwright |
| 13 | 장시간 움직이는 hero를 사용자가 멈출 수 없음 | 실제 scene rAF를 멈추는 Pause 3D 제공 | `setUserPaused(true)` assertion |
| 14 | 일시정지 후 상태 손실 없이 복구하는 계약이 없음 | 같은 물리 state에서 Resume 3D 제공 | hero-control Playwright |
| 15 | pause 상태와 대상 canvas 관계가 불명확 | `aria-pressed`, `aria-controls=hero-canvas` 연결 | markup + Playwright |
| 16 | prewarm 도중 reduced-motion/data가 바뀌면 첫 live frame이 새 환경설정을 덮을 수 있음 | media·connection listener를 prewarm 전에 연결하고 await 직후 설정을 다시 읽어 generation을 취소·재시작 | controllable-idle preference Playwright |
| 17 | JS가 실패하면 미니랩 조절기가 작동하는 것처럼 남음 | `html:not(.js-ready)`에서 조절기를 숨김 | main-failure Playwright |
| 18 | scene 내부 상태와 DOM 컨트롤 상태가 따로 놀 수 있음 | `pendulum:hero-state` CustomEvent로 live/paused/static을 동기화 | main/scene state bridge |
| 19 | prewarm 중 context loss가 발생해도 대기 중 초기화가 나중에 live API/state를 공개할 수 있음 | context loss 시 lifecycle generation 무효화·prewarm 즉시 취소·API 삭제 후 `context-lost` static 상태를 고정 | deterministic prewarm context-loss Playwright |
| 20 | context restore 뒤 버튼/HUD가 static에 고정되거나 오래된 초기화가 재사용될 수 있음 | restore 시 새 generation의 `ensure()`를 호출해 frozen redraw·playback·상태를 한 경로로 복구 | `webglcontextrestored` lifecycle |
| 21 | preference 해제 시 `resume()`이 화면 밖 scene까지 visible로 강제함 | observer의 visible 상태를 보존한 채 playback만 재평가 | `window.__hero.resume` |
| 22 | pagehide/BFCache 전환에서 GPU loop가 남고 일반 navigation·브라우저 context teardown에서도 geometry·texture·composer·WebGL context가 오래 유지될 수 있음 | BFCache pagehide는 loop만 멈추고 pageshow에서 복귀하되, 일반 pagehide는 idempotent public `dispose()`로 observer·geometry·texture·material·composer·renderer를 해제하고 context loss까지 강제 | `scene.js` lifecycle/disposal, Playwright per-test teardown |
| 23 | 물리 좌표에 임의 z 흔들림을 넣어 막대 길이가 모델과 달라짐 | 두 bob을 정확한 평면 RK4 좌표로 복원 | `pointsFromState` |
| 24 | shadow의 깊이 표현을 좌표에 넣으면 ghost 막대도 늘어남 | 완전한 모델 group에만 작은 z offset 적용 | `shadow.group.position.z` |
| 25 | ±π 경계에서 공개 divergence 값이 2π만큼 튈 수 있음 | 두 각도 차이를 atan2(sin,cos)로 wrap | `window.__hero.divergence` |
| 26 | 우클릭도 drag orbit를 시작할 수 있음 | mouse primary button만 drag 시작 | `pointerdown` guard |
| 27 | 장시간 drag로 회전 값이 무한히 커져 정밀도가 저하됨 | drag 종료 시 큰 각도를 2π 범위로 정규화 | `finishDrag` |
| 28 | resize 이벤트마다 고비용 renderer resize를 즉시 반복 | 한 animation frame으로 coalesce | `scheduleResize` |
| 29 | 모바일 주소창 변화가 canvas 비율에 늦게 반영됨 | `visualViewport.resize`를 scene에 연결 | scene resize binding |
| 30 | 느린 GPU에서도 bloom과 높은 DPR을 계속 강제 | 실제 render cost EMA를 90-frame window로 측정 | `renderCostEma` |
| 31 | 지속적으로 느린 장치가 과열될 수 있음 | 두 번의 slow window 후 balanced tier로 자동 강등 | `qualityTier=balanced` |
| 32 | balanced tier에서도 높은 DPR 비용이 남음 | DPR cap을 1.15로 낮춤 | `resize` quality cap |
| 33 | balanced tier가 bloom composer 비용을 계속 지불 | direct renderer 경로로 전환 | `renderFrame` |
| 34 | 품질 전환을 테스트·진단할 수 없음 | `body[data-hero-quality]`와 `__hero.quality` 노출 | scene API |
| 35 | 스크롤 회전이 요구 수준보다 짧고 평면적으로 느껴질 수 있음 | descent 동안 4.5π(2.25회) 깊이 회전으로 확장 | `stage.rotation.y` |
| 36 | “내려가는” 감각이 약함 | desktop 1.86, compact 1.08 world-unit 하강 적용 | `stage.position.y` |
| 37 | 하강 중 카메라 깊이 변화가 작음 | stage z arc와 camera dolly 범위를 확장 | `stage.position.z`, `targetCameraZ` |
| 38 | 회전 중 재질 하이라이트가 정적으로 보임 | cyan/violet light가 scroll progress를 따라 궤도 이동 | light position equations |
| 39 | 배경 입자가 scene 회전과 분리돼 보임 | particle field에 scroll-linked x/y 회전을 추가 | `particles.rotation` |
| 40 | 회전·하강 요구가 향후 DOM 검사만으로는 퇴행할 수 있음 | progress/rotation/y/z/scale을 read-only `scrollPose`로 노출 | scroll-descent Playwright |
| 41 | 동적 글꼴·콘텐츠 높이 변화가 orbit start/end cache를 틀리게 함 | descent section `ResizeObserver` 추가 | `cacheOrbitMetrics` |
| 42 | 웹폰트 교체 뒤 beat center가 오래된 위치를 가리킴 | `document.fonts.ready` 후 metric 재계산 | `main.js` |
| 43 | 모바일 visual viewport 높이 변화가 scroll mapping을 틀리게 함 | `visualViewport.resize`에서 metric 재계산 | `main.js` |
| 44 | BFCache 복귀 후 scroll pose가 이전 페이지 상태를 사용함 | `pageshow`에서 metric/scroll 동기화 | `main.js` |
| 45 | scroll progress의 width 변경이 layout/paint를 유발 | full-width bar의 compositor `scaleX`로 변경 | CSS + `onScroll` |
| 46 | scene 제어가 관련 없는 하단 구간에도 떠 있을 수 있음 | hero 또는 descent가 활성일 때만 `hero-scene-active`로 표시 | `onScroll`, CSS |
| 47 | 네 descent 카드가 모두 같은 강도로 보여 현재 beat가 약함 | 비현재 카드는 opacity/saturation/depth를 낮추고 현재 카드만 선명화 | `.descent-card` |
| 48 | loading/live/paused 상태의 시각 구분이 약함 | HUD dot·색·pulse를 상태별로 구분 | hero-state CSS |
| 49 | notch/home indicator와 고정 제어가 충돌할 수 있음 | CSS safe-area 변수를 hero 컨트롤에 적용 | `--safe-*` |
| 50 | 390px 화면에서 긴 motion label이 내용을 가림 | 모바일은 44px 아이콘 컨트롤, 텍스트는 접근 가능하게 숨김 | mobile CSS + screenshot |
| 51 | 고정 nav가 iPhone safe area와 겹칠 수 있음 | nav 네 방향 padding에 safe-area 적용 | desktop/mobile nav CSS |
| 52 | 고정 nav가 hash 대상 제목을 가림 | root scroll padding과 section/header scroll margin 추가 | CSS |
| 53 | coarse pointer에서 일부 링크·버튼이 44px보다 작음 | 주요 CTA/언어/미니랩/menu 타깃 최소 높이 보장 | `@media(pointer:coarse)` |
| 54 | 고대비 선호 사용자의 muted 텍스트·경계가 약함 | `prefers-contrast:more` 팔레트와 border 보강 | CSS |
| 55 | 연구 증거를 인쇄하면 고정 canvas/배경/animation이 내용을 가림 | light print layout, fixed visual 제거, 카드 page-break 보호 | `@media print` |
| 56 | Escape로 모바일 메뉴를 닫아도 키보드 위치를 잃음 | 닫은 뒤 summary로 focus 복귀 | nav-menu key handler |
| 57 | 모바일 메뉴에는 현재 section 상태가 없음 | desktop과 mobile nav를 같은 scrollspy에 포함 | spy selector |
| 58 | `aria-current="true"`보다 목적이 불명확 | section 링크를 `aria-current="location"`으로 변경 | scrollspy + CSS |
| 59 | range 값의 단위가 label만으로 명확하지 않음 | output id와 `aria-describedby` 연결, 동적 `aria-valuetext` 제공 | mini-lab Playwright |
| 60 | 새 컨트롤·상태·동적 readout이 KO에서 영어로 남을 수 있음 | i18n source dictionary와 runtime KO labels를 함께 추가하고 `ko.html` 재생성 | KO Playwright + `build:ko` |
| 61 | KO 첫 화면의 본문 글꼴 교체가 LCP 여유를 줄일 수 있음 | 생성된 KO 문서에 Pretendard regular preload를 선별 추가 | KO Lighthouse |
| 62 | 영문 문서까지 KO 글꼴을 preload하면 핵심 자원과 대역폭 경쟁 | 영문에는 해당 preload가 없도록 생성기·정적 검사에서 강제 | static contract |
| 63 | 운영체제 언어가 기본 URL을 KO로 전환해 영문 성능 측정이 왜곡될 수 있음 | Lighthouse URL을 `?lang=en`과 `ko.html?lang=ko`로 명시 | language matrix contract |
| 64 | LHCI가 Windows 임시 프로필 정리 중 EPERM으로 정상 리포트까지 실패 처리 | 유효한 리포트가 생성된 정리 전용 오류만 판별하는 독립 러너 보강 | custom Lighthouse runner |
| 65 | 단일 성능 리포트가 언어별 회귀를 분리하지 못하고 한 언어의 점수가 다른 언어 실패를 숨길 수 있음 | EN/KO 각각 3회 중앙값·대표 리포트·독립 hard gate와 통합 요약을 저장 | `reports/lighthouse/` |
| 66 | Chromium·mobile Chrome·Firefox·WebKit의 4개 Playwright 프로젝트를 병렬 실행하면 GPU 경쟁이 가짜 3D timeout을 만들고, 직렬화 뒤에는 기존 job 제한과 Windows Python static-server orphan이 정상 완료를 막을 수 있음 | 단일 worker·명시적 slow budget·CI 90분/Pages 120분/Cloudflare·cross-release 90분 제한을 적용하고, web server를 exact Node child로 바꿔 SIGINT/SIGTERM에서 `server.close()` 후 clean exit하도록 고정 | 21 tests × 4 projects, 84-case multi-profile smoke; timeout/server lifecycle 정적 계약 |

## 2026-07-20 당시 검증 기록 (역사적 스냅샷)

당시 최종 실측 결과이며 현재 검증 대상이나 상태를 뜻하지 않는다:

- `npm run build:hero`: PASS (`scene.bundle.js` 583,532 bytes, animation vendor 115,224 bytes)
- `npm run build:ko`: PASS (`ko.html` 재생성)
- `npm run check`: PASS (정적 계약·인코딩·번들 freshness)
- Chromium smoke: 21/21 PASS
- 4-engine smoke: 84개 경로 중 82개가 동시 실행에서 PASS, GPU 경쟁으로 timeout 난 Firefox/WebKit 2개는 격리 재실행 2/2 PASS; 이후 CI worker를 2개로 제한
- Lighthouse EN 3회 중앙값: Performance 100, Accessibility 100, Best Practices 100, SEO 100, LCP 1,675.57 ms, CLS 0, TBT 0
- Lighthouse KO 3회 중앙값: Performance 97, Accessibility 100, Best Practices 100, SEO 100, LCP 2,255.89 ms, CLS 0, TBT 0
- `git diff --check`: PASS
- `node --check`: `main.js`, `scene.js`, `orbit-console.js`, `reactbits.js`, `run-lighthouse.mjs` PASS
- `npm audit`: transitive `sharp` 0.35.3 override 적용 후 취약점 0건

시각 QA 산출물은 `reports/design-screens/`에 desktop static/live/descent와 390px mobile hero/descent로 생성하며 저장소 배포물에는 포함하지 않는다.
