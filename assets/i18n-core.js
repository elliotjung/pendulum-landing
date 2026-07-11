/*
 * i18n-core.js — the English→Korean dictionary and DOM translation pass.
 *
 * NOT loaded by the site at runtime. Runtime translation of this
 * filter/blur-heavy page costs ~300–700 ms of style/relayout inside the
 * mobile startup window (measured via Lighthouse TBT), so the Korean page is
 * generated statically instead: scripts/build-ko-page.mjs loads this file in
 * a headless page, runs `applyKorean` against a DOMParser document of
 * index.html, and commits the result as ko.html. Korean visitors then get an
 * ordinary static page with identical performance to the English one; the
 * decode/typewriter effects simply initialize on Korean text.
 *
 * Design notes:
 *  - English markup stays the source of truth. The dictionary maps normalized
 *    English text-node content to Korean; anything unmapped stays English
 *    (graceful for future copy edits — the build is re-run and diffed in CI).
 *  - Dynamic surfaces (data-evidence, data-count, data-orbit-readout) and
 *    deliberate terminal chrome (mono readout keys, the marquee of method
 *    names) are skipped by design.
 *  - App links (data-app-link) gain `lang=ko`, which the simulator reads to
 *    preload its own Korean menu guide.
 */
(() => {
  'use strict';

  const TEXT = {
    // ---- nav ---------------------------------------------------------------
    'Science': '과학',
    'Console': '콘솔',
    'Platform': '플랫폼',
    'Modes': '모드',
    'Frontier': '프런티어',
    'Validation': '검증',
    'Guide': '가이드',
    'Open Lab': '랩 열기',
    'Open': '열기',
    'Skip to content': '본문 바로가기',
    // ---- hero --------------------------------------------------------------
    'Double-Pendulum Chaos Engine': '이중진자 카오스 엔진',
    'Order,': '질서,',
    'undone by': '카오스에',
    'chaos.': '무너지다.',
    'A framework-free TypeScript engine for nonlinear pendulum dynamics — thirteen primary integrators measured at their theoretical order, full-spectrum Lyapunov diagnostics, WebGPU paths promoted only after CPU-oracle checks, and hash-verifiable research bundles with deterministic replay metadata. Rigor, engineered for the very edge of predictability.':
      '비선형 진자 동역학을 위한 프레임워크 없는 TypeScript 엔진 — 이론 차수를 실측으로 확인한 13종의 주력 적분기, 전체 스펙트럼 랴푸노프 진단, CPU 오러클 검증을 통과해야만 승격되는 WebGPU 경로, 결정론적 재생 메타데이터를 담은 해시 검증 연구 번들. 예측 가능성의 가장자리를 위해 설계된 엄밀함.',
    'Try Performance Mode': '퍼포먼스 모드 체험',
    'View Research Evidence': '연구 증거 보기',
    'Engine Spec': '엔진 사양',
    'Verified': '검증됨',
    'system': '시스템',
    'integrator': '적분기',
    'energy drift': '에너지 드리프트',
    'backend': '백엔드',
    'Credibility': '신뢰성',
    'unit tests': '단위 테스트',
    'period-doubling A': '주기배가 A',
    'mutation tested': '뮤테이션 테스트',
    'Scroll to descend': '스크롤해 내려가기',
    'Drag to orbit · move to parallax': '드래그로 궤도 회전 · 마우스로 시차 효과',
    // ---- trajectory console -------------------------------------------------
    'Trajectory Console': '궤적 콘솔',
    'Chaos you can feel before the app even opens.': '앱을 열기도 전에 체감되는 카오스.',
    'A lightweight canvas instrument draws two nearly identical double-pendulum releases in real time. The cyan and rose traces begin together, then peel apart as sensitivity takes over.':
      '가벼운 캔버스 계기가 거의 동일한 두 이중진자 릴리스를 실시간으로 그립니다. 시안과 로즈 궤적은 함께 출발하지만, 민감성이 지배하는 순간 서로 갈라집니다.',
    'Open This State': '이 상태로 열기',
    'Reviewer Ledger': '리뷰어 원장',
    // ---- live preview --------------------------------------------------------
    'Live Workbench': '라이브 워크벤치',
    'Real lab screens, not a teaser mockup.': '티저 목업이 아닌, 실제 랩 화면.',
    'The first click can open a ready-made experiment state: a beginner-safe butterfly preset, a student Lyapunov reading, or the research workbench with reviewer evidence close at hand.':
      '첫 클릭에 준비된 실험 상태가 열립니다: 입문자용 나비 프리셋, 학생용 랴푸노프 판독, 혹은 리뷰어 증거가 곁에 있는 연구 워크벤치.',
    'Beginner': '입문자',
    'Butterfly Motion': '나비 운동',
    'Open Lab with the clean starter preset.': '깔끔한 스타터 프리셋으로 랩 열기.',
    'Student': '학생',
    'Lyapunov Reading': '랴푸노프 판독',
    'Jump straight to chaos-rate diagnostics.': '카오스 속도 진단으로 바로 이동.',
    'Research': '연구',
    'Reviewer Evidence': '리뷰어 증거',
    'Open the persisted research workbench.': '저장된 연구 워크벤치 열기.',
    'App snapshot': '앱 스냅숏',
    '30-second walkthrough GIF': '30초 워크스루 GIF',
    // ---- science -------------------------------------------------------------
    'Sensitive Dependence': '민감한 의존성',
    'A thousandth of a radian becomes a different universe.': '1000분의 1라디안이 다른 우주가 된다.',
    'Release two double pendulums a hair apart and they trace the same arc — until they don\'t. Trajectories peel away exponentially, prediction collapses into noise. That rate of divergence':
      '머리카락 한 올 차이로 놓은 두 이중진자는 같은 호를 그립니다 — 어느 순간까지만. 궤적은 지수적으로 벌어지고, 예측은 노이즈로 무너집니다. 그 벌어짐의 속도가',
    'is': '곧',
    'the largest Lyapunov exponent, and measuring it honestly — every parameter disclosed, every uncertainty owned — is the entire discipline.':
      '최대 랴푸노프 지수이며, 모든 매개변수를 공개하고 모든 불확실성을 책임지며 그것을 정직하게 측정하는 일이 이 분야의 전부입니다.',
    'Reference agreement · 20 s': '레퍼런스 일치 · 20초',
    'Law of chaotic divergence': '카오스 발산의 법칙',
    'Parameters disclosed': '매개변수 공개율',
    // ---- capabilities ----------------------------------------------------------
    'The Platform': '플랫폼',
    'Everything a chaos study demands — measured, tested, proven.': '카오스 연구가 요구하는 모든 것 — 측정하고, 테스트하고, 증명했다.',
    'Five disciplines — numerics, physics, chaos diagnostics, visualization, reproducibility — each unit-tested against closed-form, energy, and independent reference criteria.':
      '수치해석·물리·카오스 진단·시각화·재현성의 다섯 분야를 닫힌형 해, 에너지, 독립 레퍼런스 기준으로 각각 단위 테스트했습니다.',
    'Thirteen primary integrators': '13종의 주력 적분기',
    'Euler through RK4, embedded RKF45, Dormand-Prince 5(4), DOP853 8(5,3), Gauss-Legendre 4/6, Yoshida-4, Gragg-Bulirsch-Stoer, and L-stable TR-BDF2 — each measured at its theoretical order, plus a full-Newton implicit midpoint with condition-number diagnostics.':
      'Euler부터 RK4, 임베디드 RKF45, Dormand-Prince 5(4), DOP853 8(5,3), Gauss-Legendre 4/6, Yoshida-4, Gragg-Bulirsch-Stoer, L-stable TR-BDF2까지 — 각각 이론 차수를 실측으로 확인했고, 조건수 진단이 붙은 완전 뉴턴 음함수 중점법을 더했습니다.',
    'Chaos diagnostics': '카오스 진단',
    'Maximal & full-spectrum Lyapunov exponents, covariant Lyapunov vectors, Kaplan-Yorke dimension, SALI / FLI, Poincaré sections, the 0–1 test, RQA, basin entropy, and automated bifurcation sweeps — with method-specific diagnostics and uncertainty where defined.':
      '최대·전체 스펙트럼 랴푸노프 지수, 공변 랴푸노프 벡터, Kaplan-Yorke 차원, SALI/FLI, 푸앵카레 단면, 0–1 테스트, RQA, 베이슨 엔트로피, 자동 분기 스윕 — 정의되는 곳마다 방법별 진단과 불확실성을 함께 제공합니다.',
    'Physical systems': '물리 시스템',
    'Double, triple, and generalized N-pendulum, driven and damped-driven oscillators, Kapitza and magnetic pendulums, elastic springs, coupled-pendulum lattices, plus a true 3D spherical & rope pendulum with conserved E and Lz readouts.':
      '이중·삼중·일반화 N-진자, 구동 및 감쇠-구동 진동자, Kapitza·자기 진자, 탄성 스프링, 결합 진자 격자, 그리고 E와 Lz 보존량 판독이 달린 진짜 3D 구면·로프 진자까지.',
    'Honest visualization': '정직한 시각화',
    'Pure-canvas, colorblind-safe Okabe-Ito renderers; phase portraits, Poincaré maps, FTLE ridges, and a publication figure pipeline with deterministic SVG and visual-regression fingerprints across desktop and mobile baselines.':
      '순수 캔버스에 색각 안전 Okabe-Ito 렌더러; 위상 초상, 푸앵카레 맵, FTLE 능선, 그리고 데스크톱·모바일 기준선에 걸쳐 결정론적 SVG와 시각 회귀 지문을 갖춘 출판용 그림 파이프라인.',
    'Total reproducibility': '완전한 재현성',
    'Hash-stamped run manifests with deterministic replay metadata, real ZIP research bundles with per-file SHA-256 integrity checks (plus CRC32 for ZIP compatibility), an IndexedDB long-term store, and evidence provenance tied to a source commit.':
      '결정론적 재생 메타데이터가 담긴 해시 스탬프 실행 매니페스트, 파일별 SHA-256 무결성 검사(ZIP 호환 CRC32 포함)를 갖춘 진짜 ZIP 연구 번들, IndexedDB 장기 저장소, 그리고 소스 커밋에 묶인 증거 출처.',
    'CPU-oracle-gated WebGPU scale': 'CPU 오러클이 게이트하는 WebGPU 스케일',
    'Heavy chaos jobs run in a typed Web Worker with a priority queue, checkpoint / resume, and graceful fallback — and the WebGPU ensemble, full-spectrum, CLV, and FTLE kernels are promoted only after passing a same-run CPU f64 oracle comparison.':
      '무거운 카오스 작업은 우선순위 큐, 체크포인트/재개, 우아한 폴백을 갖춘 타입 Web Worker에서 돌아가고 — WebGPU 앙상블·전체 스펙트럼·CLV·FTLE 커널은 같은 실행의 CPU f64 오러클 비교를 통과해야만 승격됩니다.',
    // ---- modes -----------------------------------------------------------------
    'Three Workspaces': '세 가지 워크스페이스',
    'From first swing to peer review — the interface grows with you.': '첫 스윙부터 동료 심사까지 — 인터페이스가 당신과 함께 자랍니다.',
    'Every launch opens a workspace chooser. A four-step spotlight tour greets first-time visitors, every menu entry explains itself in one plain-language line — in English or Korean — and a command palette (Ctrl+K) reaches everything.':
      '실행할 때마다 워크스페이스 선택기가 열립니다. 첫 방문자는 4단계 스포트라이트 투어가 맞이하고, 모든 메뉴 항목은 쉬운 말 한 줄로 스스로를 설명하며 — 영어와 한국어 모두 — 커맨드 팔레트(Ctrl+K)로 어디든 닿습니다.',
    'Watch it move': '움직임을 지켜보기',
    'A focused simulator: the live pendulum, one-click presets from': '집중형 시뮬레이터: 살아 있는 진자, 원클릭 프리셋은',
    'Butterfly': '나비',
    'to': '부터',
    'Whirling': '휠링',
    ', and the safest physical controls. No jargon, no clutter — just motion.': '까지, 그리고 가장 안전한 물리 컨트롤. 전문용어도 군더더기도 없이 — 오직 운동만.',
    'Guided onboarding tour': '가이드 온보딩 투어',
    'Preset motions with plain tooltips': '쉬운 툴팁이 달린 프리셋 운동',
    'Menu guide in English / 한국어': '영어/한국어 메뉴 가이드',
    'Ask it questions': '질문을 던지기',
    'Adds the analysis workspaces: energy and Lyapunov plots, chaos maps, bifurcation sweeps, 3D phase space, validation runs, and exports — with every method labeled by what it actually measures.':
      '분석 워크스페이스가 더해집니다: 에너지·랴푸노프 플롯, 카오스 맵, 분기 스윕, 3D 위상공간, 검증 실행, 내보내기 — 모든 방법에는 실제로 무엇을 측정하는지가 표기됩니다.',
    'Analyze & Validate menus unlock': 'Analyze·Validate 메뉴 잠금 해제',
    'Integrator comparison side-by-side': '적분기 나란히 비교',
    'CSV / PNG / JSON exports': 'CSV / PNG / JSON 내보내기',
    'Publish the answer': '답을 출판하기',
    'The full surface: chaos diagnostics, Trust Inspector provenance on every quoted number, reviewer kit, governance, research bundles, and the certified workbench with persisted studies.':
      '전체 표면: 카오스 진단, 인용된 모든 숫자에 붙는 Trust Inspector 출처, 리뷰어 키트, 거버넌스, 연구 번들, 그리고 연구가 저장되는 인증 워크벤치.',
    'Trust Inspector evidence panels': 'Trust Inspector 증거 패널',
    'Reproducible research bundles': '재현 가능한 연구 번들',
    'Reviewer console & audit trail': '리뷰어 콘솔 · 감사 추적',
    // ---- frontier -----------------------------------------------------------------
    'Research Frontier': '연구 프런티어',
    'Beyond simulation: a self-validating dynamics library.': '시뮬레이션 너머: 스스로 검증하는 동역학 라이브러리.',
    'The headless core ships as a typed library with a CLI for batch studies. Every frontier module carries its own falsifiable test contract — closed-form anchors, convergence orders, or cross-method agreement.':
      '헤드리스 코어는 배치 연구용 CLI가 딸린 타입 라이브러리로 제공됩니다. 모든 프런티어 모듈은 닫힌형 앵커, 수렴 차수, 교차 방법 일치 같은 반증 가능한 테스트 계약을 스스로 지닙니다.',
    'Melnikov flagship': '멜니코프 플래그십',
    'The analytic chaos threshold vs the measured period-doubling onset — an engine-sized gap map, certified against literature anchors.':
      '해석적 카오스 문턱 vs 실측 주기배가 시작점 — 문헌 앵커로 인증된 엔진 규모의 갭 맵.',
    'Floquet & continuation': '플로케 & 연속법',
    'Multipliers on corrected periodic orbits, Mathieu stability tongues, arclength continuation with branch switching, Neimark-Sacker tracking.':
      '보정된 주기궤도의 플로케 승수, Mathieu 안정성 혀, 가지 전환이 있는 호길이 연속법, Neimark-Sacker 추적.',
    'Data-driven operator views of the flow: dynamic mode decomposition and Hankel-alternative analysis on a shared thin-SVD core.':
      '흐름을 데이터로 보는 연산자 관점: 얇은 SVD 코어를 공유하는 동적 모드 분해와 Hankel 대안(HAVOK) 분석.',
    'SINDy & surrogates': 'SINDy & 대리모델',
    'Sparse regression rediscovers the equations of motion; polynomial-chaos surrogates yield analytic Sobol sensitivity decompositions.':
      '희소 회귀가 운동방정식을 다시 발견하고, 다항 카오스 대리모델이 해석적 Sobol 민감도 분해를 내놓습니다.',
    'Krylov eigensolvers': '크릴로프 고유해법',
    'Restarted thick-restart Lanczos for the symmetric case and an Arnoldi–Schur solver for non-symmetric spectra — matrix-free, test-pinned.':
      '대칭 문제에는 재시작 thick-restart Lanczos, 비대칭 스펙트럼에는 Arnoldi–Schur — 행렬 없이, 테스트로 고정.',
    'Lattice & phonons': '격자 & 포논',
    'Coupled pendulum chains reproduce the analytic dispersion relation — the same normal-mode physics that underpins solid-state phonons.':
      '결합 진자 사슬이 해석적 분산 관계를 재현합니다 — 고체 포논을 떠받치는 바로 그 정규 모드 물리.',
    'Quantum kicked rotor': '양자 킥 로터',
    'Finite-dimensional quantum Floquet quasi-energies beside their classical chaos counterparts — one engine, both regimes.':
      '고전 카오스 짝 옆에 놓인 유한차원 양자 플로케 준에너지 — 하나의 엔진으로 두 영역을.',
    'Noise & escape': '노이즈 & 탈출',
    'Stochastic resonance, Euler–Maruyama ensembles with Welford moments, and Kramers escape rates for thermal-noise physics.':
      '확률 공명, Welford 모멘트를 갖춘 Euler–Maruyama 앙상블, 열노이즈 물리를 위한 Kramers 탈출률.',
    'Read the mini-paper': '미니 논문 읽기',
    'Headless core · typed library · research CLI': '헤드리스 코어 · 타입 라이브러리 · 연구 CLI',
    // ---- validation ------------------------------------------------------------------
    'Validation & Credibility': '검증과 신뢰성',
    'Numbers you can check — not claims you must trust.': '믿으라는 주장이 아니라, 직접 확인할 수 있는 숫자.',
    'Every integrator is cross-checked against closed-form, energy, and reference-method criteria, then externally cross-validated against an independent SciPy DOP853 reference for both the double and triple pendulum.':
      '모든 적분기를 닫힌형 해·에너지·레퍼런스 방법 기준으로 교차 점검한 뒤, 이중·삼중 진자 모두 독립적인 SciPy DOP853 레퍼런스와 외부 교차 검증합니다.',
    'Long-run energy drift · conservative double · T = 200 s': '장기 에너지 드리프트 · 보존계 이중진자 · T = 200 s',
    'Integrator': '적분기',
    'Order': '차수',
    'Max rel. drift |ΔE/E₀|': '최대 상대 드리프트 |ΔE/E₀|',
    'adaptive': '적응형',
    'implicit': '음함수',
    'Unit tests · all green': '단위 테스트 · 전부 그린',
    'Plus Chromium, Firefox, WebKit and mobile end-to-end suites, with a machine-readable Stryker aggregate of':
      '여기에 Chromium·Firefox·WebKit·모바일 E2E 스위트, 그리고 기계가 읽을 수 있는 Stryker 집계',
    'Agreement vs SciPy DOP853': 'SciPy DOP853 대비 일치도',
    'Regular orbits agree to ~6e-14 over 20 s; chaotic orbits to the e^{λ₁t}-amplified tolerance floor.':
      '규칙 궤도는 20초 동안 ~6e-14 수준으로 일치하고, 카오스 궤도는 e^{λ₁t}로 증폭된 허용 하한까지 일치합니다.',
    'Period-doubling onset A_PD': '주기배가 시작점 A_PD',
    'Engine-measured against the published value of 1.0663 — a literature anchor, not a fit.':
      '출판값 1.0663에 맞서 엔진이 직접 측정 — 피팅이 아니라 문헌 앵커입니다.',
    'The gate every change must pass': '모든 변경이 통과해야 하는 게이트',
    'enforced in CI': 'CI에서 강제',
    'Playwright e2e on Chromium, mobile-Chrome, Firefox and WebKit, with visual-regression baselines per host':
      'Chromium·모바일 Chrome·Firefox·WebKit에서 Playwright E2E, 호스트별 시각 회귀 기준선 포함',
    'Hard memory-regression gate against a committed browser-benchmark baseline':
      '커밋된 브라우저 벤치마크 기준선 대비 하드 메모리 회귀 게이트',
    'Reports attest their source commit; a reviewer console reads the machine-readable certification chain':
      '리포트가 소스 커밋을 증명하고, 리뷰어 콘솔이 기계가 읽는 인증 체인을 읽습니다',
    'Stryker aggregate:': 'Stryker 집계:',
    // ---- guide ------------------------------------------------------------------------
    'How It Works': '작동 방식',
    'Three steps to the edge of chaos.': '카오스의 가장자리까지 세 단계.',
    'No install. No account. Open it in your browser, choose a workspace, run it, and export diagnostics anyone on earth can reproduce.':
      '설치도 계정도 없습니다. 브라우저에서 열고, 워크스페이스를 고르고, 실행한 뒤, 지구상 누구든 재현할 수 있는 진단을 내보내세요.',
    'Choose workspace & system': '워크스페이스와 시스템 선택',
    'Pick Beginner, Student, or Research, then a system from double pendulum to N-link, driven, and elastic — and one of thirteen primary integrators, each labeled with its order and character.':
      '입문자·학생·연구 중 하나를 고르고, 이중진자부터 N-링크·구동·탄성까지 시스템을 — 그리고 차수와 성격이 표기된 13종의 주력 적분기 중 하나를 고릅니다.',
    'Set parameters & run': '매개변수 설정과 실행',
    'Dial in initial conditions and dt, then watch the trajectory, energy drift, and residuals update live. Summon chaotic, periodic, or resonant regimes from presets in a single click.':
      '초기 조건과 dt를 맞춘 뒤 궤적·에너지 드리프트·잔차가 실시간으로 갱신되는 것을 지켜보세요. 카오스·주기·공명 영역은 프리셋 클릭 한 번으로 소환됩니다.',
    'Diagnose & export': '진단과 내보내기',
    'Run the Lyapunov spectrum, Poincaré sections, and bifurcation sweeps, then export a hash-verifiable research bundle — PNGs, CSVs, SHA-256 checksums, and a replay manifest.':
      '랴푸노프 스펙트럼, 푸앵카레 단면, 분기 스윕을 돌린 뒤 — PNG·CSV·SHA-256 체크섬·재생 매니페스트가 담긴 해시 검증 연구 번들로 내보내세요.',
    'Open Lab now': '지금 랩 열기',
    'Runs in your browser · no install': '브라우저에서 실행 · 설치 없음',
    // ---- launch -------------------------------------------------------------------------
    'Open the Engine': '엔진을 열다',
    'Release it. Watch it': '놓아라. 지켜보라,',
    'diverge.': '갈라짐을.',
    'The full simulator runs in your browser — thirteen primary integrators, every analysis tab, and hash-verifiable research exports. No install, no account. Just the unvarnished mathematics of chaos.':
      '풀 시뮬레이터가 브라우저에서 그대로 돌아갑니다 — 13종의 주력 적분기, 모든 분석 탭, 해시 검증 연구 내보내기. 설치도 계정도 없이. 오직 가공되지 않은 카오스의 수학만.',
    'Source on GitHub': 'GitHub 소스',
    // ---- footer -------------------------------------------------------------------------
    'Launch app': '앱 실행',
    'Reviewer console': '리뷰어 콘솔',
    'Mini-paper': '미니 논문',
    'MIT-licensed ·': 'MIT 라이선스 ·',
    'Cite this repository': '이 저장소 인용하기'
  };

  const ATTRS = [
    ['a.brand', 'aria-label', 'Pendulum Lab 홈'],
    ['a.nav-launch', 'aria-label', 'Pendulum Lab 시뮬레이션 열기'],
    ['.console-readouts', 'aria-label', '실시간 콘솔 판독'],
    ['.recipe-grid', 'aria-label', '30초 실험 레시피'],
    ['#orbit-console', 'aria-label', '이중진자 궤적 콘솔 애니메이션'],
    ['.diverge-stage svg', 'aria-label', '민감한 의존성: 갈라지는 두 궤적'],
    ['.app-preview img', 'alt', '시뮬레이션 캔버스, 컨트롤 레일, 연구 인터페이스가 보이는 Pendulum Lab 앱']
  ];

  const TYPE_PHRASES_KO = [
    '이론 차수로 실측 검증된 13종의 주력 적분기.',
    '전체 스펙트럼 랴푸노프 진단.',
    'CPU 오러클이 게이트하는 WebGPU 커널.',
    '해시로 검증되는 연구 번들.'
  ];

  const TITLE_KO = 'Pendulum Lab — 이중진자 카오스 엔진';
  const META_DESCRIPTION_KO =
    '비선형 진자 동역학을 위한 프레임워크 없는 TypeScript 엔진과 브라우저 실험실 — 13종의 주력 적분기, 전체 랴푸노프 진단, CPU 오러클로 게이트되는 WebGPU 파이프라인, 해시 검증 연구 번들. 1,003개 단위 테스트, SciPy와 출판 문헌으로 검증.';

  function normalize(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  // Skip dynamic/data-driven surfaces and deliberate terminal chrome.
  const SKIP_CLOSEST =
    '[data-evidence],[data-evidence-count],[data-count],[data-typetext],[data-orbit-readout],.marquee,.spec-row .v,.console-readout strong,.diverge-tag,.science-footnote,.orbit-console figcaption,.val-table .drift,.ledger-row .k,.by,script,style';

  function translateTextNodes(doc) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue;
      if (!raw || !raw.trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(SKIP_CLOSEST)) continue;
      const ko = TEXT[normalize(raw)];
      if (ko === undefined) continue;
      const leading = raw.match(/^\s*/)[0];
      const trailing = raw.match(/\s*$/)[0];
      node.nodeValue = leading + ko + trailing;
    }
  }

  function translateAttributes(doc) {
    for (const [selector, attr, value] of ATTRS) {
      const el = doc.querySelector(selector);
      if (el) el.setAttribute(attr, value);
    }
    const typer = doc.querySelector('[data-typetext]');
    if (typer) typer.setAttribute('data-phrases', JSON.stringify(TYPE_PHRASES_KO));
    const title = doc.querySelector('title');
    if (title) title.textContent = TITLE_KO;
    const description = doc.querySelector('meta[name="description"]');
    if (description) description.setAttribute('content', META_DESCRIPTION_KO);
  }

  function localizeAppLinks(doc) {
    doc.querySelectorAll('a[data-app-link]').forEach((anchor) => {
      const href = anchor.getAttribute('href');
      if (!href) return;
      try {
        const url = new URL(href);
        url.searchParams.set('lang', 'ko');
        anchor.setAttribute('href', url.toString());
      } catch {
        /* leave the link untouched */
      }
    });
  }

  /** Translate a (DOMParser or live) document of index.html into Korean. */
  function applyKorean(doc) {
    doc.documentElement.setAttribute('lang', 'ko');
    translateTextNodes(doc);
    translateAttributes(doc);
    localizeAppLinks(doc);
  }

  window.__pendulumI18nCore = { TEXT, ATTRS, TYPE_PHRASES_KO, TITLE_KO, META_DESCRIPTION_KO, applyKorean };
})();
