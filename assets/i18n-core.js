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
 *    deliberate terminal chrome (mono readout keys) are skipped by design.
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
    'Explore': '탐색',
    'Methods': '방법',
    'Evidence': '검증 근거',
    'Open Lab': '랩 열기',
    'Start Guided Mode': '가이드 모드 시작',
    'Open': '열기',
    'Skip to content': '본문 바로가기',
    'Start 3D': '3D 시작',
    'Interactive 3D is ready to start.': '인터랙티브 3D를 시작할 준비가 되었습니다.',
    '3D ready': '3D 준비',
    'starts on interaction': '조작하면 시작',
    // ---- hero --------------------------------------------------------------
    'Double-Pendulum Chaos Engine': '이중진자 카오스 엔진',
    'Pendulum Lab · Nonlinear Dynamics': 'Pendulum Lab · 비선형 동역학',
    'Order,': '질서,',
    'undone by': '카오스에',
    'chaos.': '무너지다.',
    'A framework-free TypeScript engine for nonlinear pendulum dynamics — fifteen primary integrators measured at their theoretical order, full-spectrum Lyapunov diagnostics, WebGPU paths promoted only after CPU-oracle checks, and hash-verifiable research bundles with deterministic replay metadata. Rigor, engineered for the very edge of predictability.':
      '비선형 진자 동역학을 위한 프레임워크 없는 TypeScript 엔진 — 이론 차수를 실측으로 확인한 15종의 주력 적분기, 전체 스펙트럼 랴푸노프 진단, CPU 오러클 검증을 통과해야만 승격되는 WebGPU 경로, 결정론적 재생 메타데이터를 담은 해시 검증 연구 번들. 예측 가능성의 가장자리를 위해 설계된 엄밀함.',
    'Open Chaotic Preset': '카오스 프리셋 열기',
    'View Research Evidence': '연구 증거 보기',
    'Release two nearly identical pendulums. Watch certainty split into two universes — then measure exactly how fast prediction disappears.':
      '거의 같은 두 진자를 놓아 보세요. 확실성이 두 개의 세계로 갈라지는 순간을 보고, 예측이 얼마나 빠르게 사라지는지 정확히 측정할 수 있습니다.',
    'Run the Experiment': '실험 실행',
    'tests': '테스트',
    '-validated': '-검증',
    'reproducible by design': '설계부터 재현 가능',
    'Explore the divergence': '발산 탐색',
    'Scroll for a measured camera orbit · drag to inspect by hand': '스크롤로 절제된 카메라 궤도 이동 · 드래그로 직접 살펴보기',
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
    // ---- scroll-driven 3D descent -----------------------------------------
    'PHASE DESCENT': '위상공간 하강',
    'VIEW / ELEVATION / DEPTH': '시점 / 고도 / 깊이',
    'Reset 3D view': '3D 시점 초기화',
    '01 · RELEASE': '01 · 놓기',
    '01 · Release': '01 · 놓기',
    '02 · Divergence': '02 · 발산',
    '03 · Memory': '03 · 궤적 기억',
    '04 · Measure': '04 · 측정',
    'Scroll-Driven Chaos': '스크롤로 움직이는 카오스',
    'Fall through phase space.': '위상공간을 가로질러 내려가다.',
    'Scroll and the camera follows a measured arc around a live double-spherical pendulum whose links sweep separate azimuths through real depth. This is not a video loop: both 3D positions and velocities advance in a constrained 240 Hz RK4 solve while the viewpoint remains independent of the physics.':
      '스크롤하면 카메라가 실제 깊이에서 서로 다른 방위각을 훑는 이중 구면진자 둘레를 절제된 호로 이동합니다. 영상 반복 재생이 아닙니다. 3차원 위치와 속도는 길이 제약을 적용한 240 Hz RK4 계산으로 진전하며, 시점은 물리 계산과 독립적으로 유지됩니다.',
    'A deterministic phase portrait remains available when motion, data, or graphics preferences keep the live renderer off. The adjustable trajectory console below lets you explore related initial conditions by hand.':
      '동작, 데이터 또는 그래픽 환경설정으로 실시간 렌더러가 꺼져도 결정론적 위상 초상은 그대로 제공됩니다. 아래의 조절 가능한 궤적 콘솔에서 관련 초기 조건을 직접 탐색할 수 있습니다.',
    'Live equations · spatial links · orbit camera': '실시간 방정식 · 공간 링크 · 궤도 카메라',
    'Static evidence view · motion preference respected': '정적 근거 화면 · 동작 환경설정 존중',
    'One state becomes two futures.': '한 상태가 두 개의 미래가 된다.',
    'The pale shadow begins only 8×10⁻⁴ radians away. Its trajectory peels from the primary state as the measured viewpoint shift reveals their separation.':
      '옅은 그림자 상태는 불과 8×10⁻⁴ 라디안 차이에서 시작합니다. 절제된 시점 변화가 두 상태의 분리를 드러내면서 그림자 궤적이 기준 상태에서 벗어납니다.',
    'The pale reference state begins only 8×10⁻⁴ radians away. The static traces preserve the two initial conditions without implying that animation is running.':
      '옅은 기준 상태는 불과 8×10⁻⁴ 라디안 떨어진 곳에서 시작합니다. 정적 궤적은 애니메이션이 실행된다고 암시하지 않으면서 두 초기 조건을 보존합니다.',
    'The path becomes the instrument.': '지나온 길 자체가 계측기가 된다.',
    'Cyan and violet histories remain suspended in depth. Every turn exposes structure that a flat trace hides: folds, near returns, and the first visible loss of predictability.':
      '시안과 보라색 이력이 깊이 속에 떠 있습니다. 회전할 때마다 평면 궤적이 숨기던 접힘, 가까운 회귀, 예측 가능성이 처음 무너지는 순간이 드러납니다.',
    'Cyan and violet histories preserve folds, near returns, and the first visible loss of predictability in a motion-free reference image.':
      '시안과 보라색 이력은 움직임 없는 기준 이미지에서 접힘, 가까운 회귀, 예측 가능성이 처음 무너지는 순간을 보존합니다.',
    'fixed-step': '고정 시간 간격',
    'deterministic': '결정론적',
    'replayable': '재생 가능',
    'Then turn the spectacle into evidence.': '장관을 검증 가능한 근거로 바꾸다.',
    'The descent resolves into the hands-on trajectory console below. Tune the primary angle, damping, and initial separation — then carry the primary state into the full laboratory.':
      '하강의 끝은 아래의 직접 조작 궤적 콘솔로 이어집니다. 주 초기각, 감쇠, 초기 간격을 조절하고 주 상태를 전체 실험실로 가져가세요.',
    'Take control': '직접 조작하기',
    // ---- trajectory console -------------------------------------------------
    'Trajectory Console': '궤적 콘솔',
    'Chaos you can feel before the app even opens.': '앱을 열기도 전에 체감되는 카오스.',
    'A lightweight canvas instrument draws two nearly identical double-pendulum releases in real time. The cyan and violet traces begin together, then peel apart as sensitivity takes over.':
      '가벼운 캔버스 계기가 거의 동일한 두 이중진자 릴리스를 실시간으로 그립니다. 시안과 보라 궤적은 함께 출발하지만, 민감성이 지배하는 순간 서로 갈라집니다.',
    'Two simulated double pendulums begin 0.001 radians apart. Their cyan and violet trajectories separate over time.':
      '두 개의 이중진자가 0.001 라디안 차이로 시작합니다. 시안과 보라 궤적은 시간이 지날수록 갈라집니다.',
    'Open primary state': '주 상태 열기',
    'Reviewer Ledger': '리뷰어 원장',
    // ---- live preview --------------------------------------------------------
    'Live Workbench': '라이브 워크벤치',
    'Real lab screens, not a teaser mockup.': '티저 목업이 아닌, 실제 랩 화면.',
    'The first click can open a ready-made path: a beginner-safe butterfly preset, a student theory-to-evidence guide, or the research workbench with reviewer evidence close at hand.':
      '첫 클릭에 준비된 경로가 열립니다: 입문자용 나비 프리셋, 학생용 이론-근거 안내, 혹은 리뷰어 증거가 곁에 있는 연구 워크벤치.',
    'Beginner': '입문자',
    'Butterfly Motion': '나비 운동',
    'Open Lab with the clean starter preset.': '깔끔한 스타터 프리셋으로 랩 열기.',
    'Student': '학생',
    'Theory to Evidence': '이론에서 근거까지',
    'Follow assumptions, equations, code, and checks.': '가정, 방정식, 코드와 검증을 차례로 따라가기.',
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
    'Fifteen primary integrators': '15종의 주력 적분기',
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
    'Each launch carries its intended workspace and mission hint into the lab. A five-step spotlight tour greets first-time visitors, every menu entry explains itself in one plain-language line — in English or Korean — and a command palette (Ctrl+K) reaches everything.':
      '각 실행 링크는 의도한 워크스페이스와 미션 힌트를 랩으로 전달합니다. 첫 방문자는 5단계 스포트라이트 투어가 맞이하고, 모든 메뉴 항목은 쉬운 말 한 줄로 스스로를 설명하며 — 영어와 한국어 모두 — 커맨드 팔레트(Ctrl+K)로 어디든 닿습니다.',
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
    'Release evidence · synchronized and reproducible': '릴리스 검증 근거 · 동기화 및 재현 가능',
    'Evidence snapshot from the simulation repository, including measured limitations.':
      '측정된 한계까지 포함한 시뮬레이션 저장소의 검증 근거 스냅숏.',
    'Measured result': '측정 결과',
    'Scope': '범위',
    'Status': '상태',
    'Best energy profile': '최상 에너지 프로파일',
    'regular reference cases': '규칙 레퍼런스 사례',
    'computed vs literature': '계산값과 문헌값 비교',
    'Physical GPU matrix': '실물 GPU 매트릭스',
    'NVIDIA + AMD pending': 'NVIDIA + AMD 대기 중',
    'Public release chain': '공개 릴리스 체인',
    'GitHub release + Pages live': 'GitHub 릴리스 + Pages 공개',
    'npm + Zenodo pending': 'npm + Zenodo 대기 중',
    'measured': '측정됨',
    'passed': '통과',
    'partial': '부분 완료',
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
    'Pick Beginner, Student, or Research, then a system from double pendulum to N-link, driven, and elastic — and one of fifteen primary integrators, each labeled with its order and character.':
      '입문자·학생·연구 중 하나를 고르고, 이중진자부터 N-링크·구동·탄성까지 시스템을 — 그리고 차수와 성격이 표기된 15종의 주력 적분기 중 하나를 고릅니다.',
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
    'The full simulator runs in your browser — fifteen primary integrators, every analysis tab, and hash-verifiable research exports. No install, no account. Just the unvarnished mathematics of chaos.':
      '풀 시뮬레이터가 브라우저에서 그대로 돌아갑니다 — 15종의 주력 적분기, 모든 분석 탭, 해시 검증 연구 내보내기. 설치도 계정도 없이. 오직 가공되지 않은 카오스의 수학만.',
    'Source on GitHub': 'GitHub 소스',
    // ---- footer -------------------------------------------------------------------------
    'Launch app': '앱 실행',
    'Reviewer console': '리뷰어 콘솔',
    'Mini-paper': '미니 논문',
    'MIT-licensed ·': 'MIT 라이선스 ·',
    'Cite this repository': '이 저장소 인용하기',
    // ---- mini lab controls -------------------------------------------------
    'Mini lab controls': '미니 실험실 조절기',
    'screen gap': '화면상 끝점 간격',
    'trace': '궤적',
    'mode': '상태',
    'initial angle θ₁': '초기각 θ₁',
    'initial separation δθ₁': '초기 간격 δθ₁',
    '2.18 rad': '2.18 라디안',
    '1.0e-3 rad': '1.0e-3 라디안',
    'damping γ': '감쇠 계수 γ',
    'Reset trace': '궤적 초기화',
    'Pause motion': '움직임 일시정지',
    'dual release': '두 초기 조건',
    '1.0e-3 rad apart': '1.0e-3 라디안 간격',
    'Static trajectory mode': '정적 궤적 모드',
    'The full lab and validation evidence remain available.': '전체 실험실과 검증 근거는 계속 사용할 수 있습니다.',
    // ---- TCAD mapping ------------------------------------------------------
    'Why this maps to TCAD': '이 경험이 TCAD로 이어지는 이유',
    'A chaos lab built with device-simulation discipline.': '소자 시뮬레이션의 원칙으로 만든 카오스 실험실.',
    'Pendulum dynamics and semiconductor devices solve different equations, but trustworthy simulation demands the same engineering habits: expose solver assumptions, quantify discretization error, and validate against an independent reference.':
      '진자 동역학과 반도체 소자는 서로 다른 방정식을 풀지만, 신뢰할 수 있는 시뮬레이션에는 같은 공학 원칙이 필요합니다. 해법의 가정을 드러내고, 이산화 오차를 수치화하며, 독립적인 참조해와 비교해 검증합니다.',
    'Residuals stay visible': '잔차를 숨기지 않습니다',
    'Implicit integrators report convergence instead of silently accepting a bad Newton step — the same honesty required by nonlinear device solvers.':
      '암시적 적분기는 잘못된 뉴턴 단계를 조용히 받아들이지 않고 수렴 여부를 보고합니다. 비선형 소자 해석기에도 필요한 정직성입니다.',
    'Resolution is measured': '해상도를 측정합니다',
    'dt-halving, order checks, and energy-drift curves turn numerical resolution into evidence rather than a hidden default.':
      '시간 간격 절반 축소, 차수 점검, 에너지 표류 곡선으로 수치 해상도를 숨은 기본값이 아닌 증거로 만듭니다.',
    'Claims have an oracle': '주장마다 독립 기준이 있습니다',
    'SciPy, symbolic identities, literature anchors, hashes, and replay manifests form the equivalent of a reproducible golden deck.':
      'SciPy, 기호 항등식, 문헌 기준값, 해시, 재생 매니페스트가 재현 가능한 골든 덱과 같은 역할을 합니다.',
    'Read the TCAD mapping': 'TCAD 연결 문서 읽기',
    'Numerics · validation · provenance': '수치해석 · 검증 · 출처 추적',
    // ---- validation CTA ----------------------------------------------------
    'Do not take the numbers on trust': '숫자를 그대로 믿지 마세요',
    'Open the evidence ledger and verify each claim yourself.': '증거 원장을 열어 각 주장을 직접 검증하세요.',
    'Inspect the reviewer console': '리뷰어 콘솔에서 검증하기',
    'Launch the guided live demo': '한국어 가이드 데모 실행',
    'Read the methods paper': '방법론 논문 읽기',
    // ---- changelog ---------------------------------------------------------
    'Latest release signals': '최신 릴리스 소식',
    'What changed — from the source, not a marketing rewrite.': '마케팅 문구가 아닌 원본에서 가져온 변경 사항.',
    'These highlights are synchronized from the simulation repository at the same evidence commit used by this page.':
      '이 요약은 이 페이지의 검증 수치와 같은 커밋에 있는 시뮬레이션 저장소에서 동기화됩니다.',
    'Folder rename': '폴더 이름 변경',
    'the entire docs/ tree moved to documents/ via git mv (history preserved).':
      'docs/ 트리 전체를 git mv로 documents/로 옮겨 기록을 보존했습니다.',
    'Cross-repo link': '저장소 간 연결',
    'the companion pendulum-landing page (EN + KO) and its docs were repointed to .../blob/master/documents/...':
      '연결된 pendulum-landing 페이지(EN + KO)와 문서 링크를 .../blob/master/documents/...로 다시 지정했습니다.',
    'Historical entries preserved': '기존 기록 보존',
    'older CHANGELOG entries keep their original docs/...': '이전 CHANGELOG 항목은 기존 docs/... 경로를 유지합니다.',
    'Read the full changelog': '전체 변경 기록 읽기',
    'Synced with release evidence': '릴리스 증거와 동기화됨',
    // ---- first-session experiment story ----------------------------------
    'An interactive laboratory for understanding and measuring nonlinear dynamics.':
      '비선형 동역학을 이해하고 측정하는 인터랙티브 실험실입니다.',
    'Start with the same state': '같은 상태에서 시작',
    'Open full Lab': '전체 랩 열기',
    'same start': '같은 시작',
    'tiny difference': '아주 작은 차이',
    'divergence': '발산',
    'measure it': '측정하기',
    'open full Lab': '전체 랩 열기',
    '01 · Same start': '01 · 같은 시작',
    'One question, five steps': '하나의 질문, 다섯 단계',
    'Begin with one reference.': '하나의 기준 상태에서 시작합니다.',
    'First, follow a single release. The reference is the state we will keep unchanged while we ask what one tiny difference can do.':
      '먼저 하나의 운동만 따라갑니다. 기준 상태는 그대로 둔 채, 아주 작은 차이가 무엇을 바꾸는지 살펴봅니다.',
    'The still image preserves the same reference path when motion or graphics preferences keep the live renderer off.':
      '동작 또는 그래픽 환경설정으로 실시간 렌더러가 꺼져도 정적 이미지에 같은 기준 경로가 유지됩니다.',
    'Reference trajectory · cyan · unchanged': '기준 궤적 · 시안 · 변경 없음',
    'Reference trajectory · static view': '기준 궤적 · 정적 화면',
    '02 · Tiny difference': '02 · 아주 작은 차이',
    'Change only one number.': '숫자 하나만 바꿉니다.',
    'The violet trajectory copies the reference, then adds Δθ₁ = 8×10⁻⁴ rad to its first angle. Everything else stays identical.':
      '보라색 궤적은 기준 상태를 복사한 뒤 첫 번째 각도에 Δθ₁ = 8×10⁻⁴ rad만 더합니다. 나머지는 모두 같습니다.',
    'The static traces preserve the reference and the one-variable perturbation without implying that animation is running.':
      '정적 궤적은 애니메이션이 실행된다고 암시하지 않으면서 기준 상태와 한 변수의 섭동을 보존합니다.',
    'reference': '기준',
    'perturbed': '섭동',
    '03 · Divergence': '03 · 발산',
    'Watch the futures stop agreeing.': '두 미래가 달라지는 순간을 봅니다.',
    'At first the two paths overlap. Then the same deterministic rules carry them apart. Cyan always means reference; violet always means perturbed.':
      '처음에는 두 경로가 겹칩니다. 이후 같은 결정론적 규칙이 둘을 서로 멀어지게 합니다. 시안은 언제나 기준, 보라는 언제나 섭동 상태입니다.',
    'Cyan marks the reference and violet marks the perturbed path; their growing distance is visible without relying on motion alone.':
      '시안은 기준, 보라는 섭동 경로를 나타내며, 동작만 보지 않아도 커지는 거리를 확인할 수 있습니다.',
    'reference: cyan': '기준: 시안',
    'perturbed: violet': '섭동: 보라',
    'one variable changed': '변수 하나만 변경',
    'Turn the visible split into a number.': '눈에 보이는 갈라짐을 숫자로 바꿉니다.',
    'The console below reports the wrapped angular difference |Δθ₁(t)| for a planar double pendulum. Enter its exact reference state and perturbation, then continue that exact planar experiment in the full Lab without retyping it.':
      '아래 콘솔은 평면 이중진자의 래핑된 각도 차이 |Δθ₁(t)|를 보여 줍니다. 정확한 기준 상태와 섭동을 입력한 뒤 다시 입력하지 않고 그 평면 실험을 전체 랩에서 그대로 이어 가세요.',
    'What is the 3D view calculating?': '3D 화면은 무엇을 계산하나요?',
    'The hero uses a constrained double-spherical model at 240 Hz. The hands-on console below integrates a planar double pendulum with RK4 at dt=0.001 and samples its trail at 150 Hz, matching the experiment continued in the full Lab.':
      '히어로는 240 Hz 제약 이중 구면진자 모델을 사용합니다. 아래 콘솔은 평면 이중진자를 RK4와 dt=0.001로 적분하고 궤적은 150 Hz로 표본화하므로, 전체 랩에서 이어지는 실험과 일치합니다.',
    'Measure the split': '갈라짐 측정',
    '04 · Measure it': '04 · 측정하기',
    'One reference. One declared perturbation.': '하나의 기준, 명시된 하나의 섭동.',
    'Enter exact values or use the sliders for quick exploration. The reference and perturbed states are named, not left for colour alone to explain.':
      '정확한 값을 입력하거나 슬라이더로 빠르게 탐색하세요. 기준과 섭동 상태를 색상에만 맡기지 않고 이름으로 표시합니다.',
    'Goal': '목표',
    'See how a tiny change grows.': '아주 작은 변화가 커지는 과정 보기.',
    'Exact start': '정확한 시작',
    'θ=(2.18, 2.64) rad · ω=(0, 0) rad/s · γ=0.06.': 'θ=(2.18, 2.64) rad · ω=(0, 0) rad/s · γ=0.06.',
    'Method': '방법',
    'RK4 · dt=0.001.': 'RK4 · dt=0.001.',
    'Change': '변경',
    'Only θ₁ by Δθ₁=1e-3 rad · symmetric · seed 20260826 · n=12.':
      'θ₁만 Δθ₁=1e-3 rad · 대칭 패턴 · 시드 20260826 · n=12.',
    'Expected': '예상',
    'The paths begin together, then |Δθ₁(t)| grows; trail shape alone is not the result.':
      '두 경로는 함께 시작한 뒤 |Δθ₁(t)|가 커집니다. 궤적 모양만으로 판단하지 않습니다.',
    'Measure': '측정',
    "|Δθ₁(t)| here, then finite-time λ₁ with the Lab's phase-state norm.":
      '여기서는 |Δθ₁(t)|, 다음에는 랩의 위상상태 norm으로 유한시간 λ₁.',
    'Theory': '이론',
    'Assumptions and evidence': '가정과 근거',
    'Reference': '기준',
    'unchanged initial state': '변경하지 않은 초기 상태',
    'Perturbed': '섭동',
    'reference + Δθ₁': '기준 + Δθ₁',
    'Angle display': '각도 표시',
    'Radians': '라디안',
    'Degrees': '도',
    'The Lab URL always carries canonical radians.': '랩 URL에는 항상 정규 라디안 값을 전달합니다.',
    'reference angle θ₁': '기준 각도 θ₁',
    'reference angle θ₂': '기준 각도 θ₂',
    'Enter reference angle θ₁': '기준 각도 θ₁ 직접 입력',
    'Enter reference angle θ₂': '기준 각도 θ₂ 직접 입력',
    'perturbation Δθ₁': '섭동 Δθ₁',
    'applied to θ₁ only': 'θ₁에만 적용',
    'Enter perturbation Δθ₁': '섭동 Δθ₁ 직접 입력',
    'Enter damping γ': '감쇠 계수 γ 직접 입력',
    'Exact experiment state': '정확한 실험 상태',
    'Full-precision radians and Δθ₁ will continue into the Lab.': '전체 정밀도 라디안 값과 Δθ₁이 랩으로 그대로 이어집니다.',
    'Continue this exact experiment': '이 정확한 실험 이어 가기',
    'Next: measure λ₁': '다음: λ₁ 측정',
    'reference + one perturbation': '기준 + 하나의 섭동',
    // ---- audience entry points and capability hierarchy -------------------
    'Choose your next depth': '다음 탐색 깊이 선택',
    'Start from your question, not the feature list.': '기능 목록이 아니라 질문에서 시작하세요.',
    'Each entry opens the smallest useful workspace for that goal. You can reveal more controls later without restarting the experiment.':
      '각 경로는 목표에 필요한 최소 워크스페이스를 엽니다. 실험을 다시 시작하지 않고 나중에 더 많은 조절기를 펼칠 수 있습니다.',
    'Curious beginner': '호기심 많은 입문자',
    'Watch one clear motion': '명확한 운동 하나 보기',
    'Open a clean preset with only the essential controls.': '핵심 조절기만 있는 깔끔한 프리셋 열기.',
    'Understand the equations': '방정식 이해하기',
    'Follow assumptions, motion, equations, and checks in order.': '가정, 운동, 방정식, 검증을 순서대로 따라가기.',
    'Numerical methods': '수치해석 학습자',
    'Compare solver behaviour': '해법 동작 비교',
    'Start with energy drift and a convergence question.': '에너지 표류와 수렴 질문에서 시작하기.',
    'Research / review': '연구 / 리뷰',
    'Inspect a scientific claim': '과학적 주장 검토',
    'Open the workbench with provenance and caveats nearby.': '출처와 주의점이 함께 보이는 워크벤치 열기.',
    'Developer': '개발자',
    'Contribute code': '코드 기여하기',
    'Go straight to setup, architecture, tests, and review rules.': '설정, 구조, 테스트, 리뷰 규칙으로 바로 이동하기.',
    'Four capabilities': '네 가지 핵심 역량',
    'From motion to a result someone else can check.': '움직임에서 다른 사람이 확인할 수 있는 결과까지.',
    'The Lab is organised around four jobs. Method names stay one level deeper until you need them.':
      '랩은 네 가지 작업을 중심으로 구성됩니다. 방법 이름은 필요할 때까지 한 단계 아래에 둡니다.',
    'Simulation': '시뮬레이션',
    'Choose a pendulum system, set exact initial conditions, and watch its state evolve. Presets give beginners a safe start; direct controls remain available for deliberate experiments.':
      '진자 시스템을 고르고 정확한 초기 조건을 설정한 뒤 상태가 변화하는 과정을 봅니다. 프리셋은 안전한 출발점을 제공하고, 의도적인 실험에는 직접 조절기를 사용할 수 있습니다.',
    'systems': '시스템',
    'initial state': '초기 상태',
    'live motion': '실시간 운동',
    'Chaos & Analysis': '카오스와 분석',
    'Move from “the paths look different” to quantities that describe divergence, recurrence, stability, and phase-space structure—with uncertainty where the method defines it.':
      '“경로가 달라 보인다”에서 발산, 재귀, 안정성, 위상공간 구조를 설명하는 수치로 나아갑니다. 방법이 정의하는 경우 불확실성도 함께 제공합니다.',
    'structure': '구조',
    'uncertainty': '불확실성',
    'Numerical Trust': '수치적 신뢰',
    'Compare resolution, convergence, residuals, conservation, and independent references before treating a computed pattern as a scientific conclusion.':
      '계산 패턴을 과학적 결론으로 받아들이기 전에 해상도, 수렴, 잔차, 보존량, 독립 기준을 비교합니다.',
    'convergence': '수렴',
    'residuals': '잔차',
    'reference checks': '기준 검증',
    'Reproducibility': '재현성',
    'Carry exact setup data in a link, save manifests and research bundles, and keep each public result tied to source evidence and explicit caveats.':
      '정확한 설정을 링크에 담고, 매니페스트와 연구 번들을 저장하며, 공개 결과를 소스 근거와 명시적 주의점에 연결합니다.',
    'shareable state': '공유 가능한 상태',
    'manifests': '매니페스트',
    'provenance': '출처 추적',
    'Explore all methods': '모든 방법 살펴보기',
    'The advanced workspace includes fifteen primary integrators, Lyapunov spectra and vectors, Poincaré sections, recurrence analysis, FTLE, basin entropy, continuation, data-driven models, and CPU-oracle-gated GPU paths. Each method explains what it measures and where it can fail.':
      '고급 워크스페이스에는 15종의 주력 적분기, 랴푸노프 스펙트럼과 벡터, 푸앵카레 단면, 재귀 분석, FTLE, 흡인역 엔트로피, 연속법, 데이터 기반 모델, CPU 오러클로 게이트되는 GPU 경로가 있습니다. 각 방법은 측정 대상과 실패 가능 지점을 설명합니다.',
    'Optional deeper paths': '선택형 심화 경로',
    'Research library and engineering context.': '연구 라이브러리와 공학적 맥락.',
    'The interactive laboratory is the primary product. These sections document the broader research library and the separate engineering portfolio connection for readers who need them.':
      '핵심 제품은 인터랙티브 실험실입니다. 아래 섹션은 필요한 독자를 위해 더 넓은 연구 라이브러리와 별도의 공학 포트폴리오 연결을 설명합니다.',
    'Secondary · Research Frontier': '보조 경로 · 연구 프런티어',
    'Secondary · Engineering portfolio': '보조 경로 · 공학 포트폴리오',
    'Why this work maps to TCAD.': '이 작업이 TCAD로 이어지는 이유.'
  };

  const ATTRS = [
    ['a.brand', 'aria-label', 'Pendulum Lab 홈'],
    ['a.nav-launch', 'aria-label', 'Pendulum Lab 시뮬레이션 열기'],
    ['#nav-menu summary', 'aria-label', '섹션 메뉴'],
    ['.hero-foot .scroll-cue', 'aria-label', '스크롤로 움직이는 발산 이야기 탐색'],
    ['.signal-strip', 'aria-label', '실험 진행 경로'],
    ['.orbit-descent-sticky', 'aria-label', '실시간 3D 위상 및 카메라 정보'],
    ['.val-board', 'aria-label', '가로로 스크롤할 수 있는 검증 근거 표'],
    ['.console-readouts', 'aria-label', '실시간 콘솔 판독'],
    ['.orbit-controls', 'aria-label', '미니 실험실 조절기'],
    ['.experiment-recipe', 'aria-label', '민감한 의존성 실험 레시피'],
    ['.trajectory-legend', 'aria-label', '궤적 의미'],
    ['#orbit-theta', 'aria-valuetext', '2.18 라디안'],
    ['#orbit-theta-two', 'aria-valuetext', '2.64 라디안'],
    ['#orbit-separation', 'aria-valuetext', '1.0e-3 라디안'],
    ['#orbit-damping', 'aria-valuetext', '감쇠 계수 0.06'],
    ['.orbit-static-fallback-template', 'aria-label', '실시간 궤적을 사용할 수 없어 정적인 이중진자 궤적을 표시합니다.'],
    ['.recipe-grid', 'aria-label', '목표별 진입 경로'],
    ['#orbit-console', 'aria-label', '이중진자 궤적 콘솔 애니메이션'],
    ['.diverge-stage svg', 'aria-label', '민감한 의존성: 갈라지는 두 궤적'],
    ['.app-preview img', 'alt', '시뮬레이션 캔버스, 컨트롤 레일, 연구 인터페이스가 보이는 Pendulum Lab 앱']
  ];

  const TYPE_PHRASES_KO = [
    '이론 차수로 실측 검증된 15종의 주력 적분기.',
    '전체 스펙트럼 랴푸노프 진단.',
    'CPU 오러클이 게이트하는 WebGPU 커널.',
    '해시로 검증되는 연구 번들.'
  ];

  const TITLE_KO = 'Pendulum Lab — 질서, 카오스에 무너지다';
  const META_DESCRIPTION_KO =
    '비선형 진자 동역학을 위한 프레임워크 없는 TypeScript 엔진과 브라우저 실험실 — 15종의 주력 적분기, 전체 랴푸노프 진단, CPU 오러클로 게이트되는 WebGPU 파이프라인, 해시 검증 연구 번들. 1,597개 단위 테스트, SciPy와 출판 문헌으로 검증.';
  const SHARE_IMAGE_ALT_KO = 'Pendulum Lab — 질서, 카오스에 무너지다. 1,597개 테스트와 SciPy 검증.';

  function normalize(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  // Skip dynamic/data-driven surfaces and deliberate terminal chrome.
  const SKIP_CLOSEST =
    '[data-evidence],[data-evidence-count],[data-count],[data-typetext],[data-orbit-readout],.marquee,.spec-row .v,.console-readout strong,.diverge-tag,.science-footnote,.val-table .drift,.ledger-row .k,.by,script,style';

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
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', TITLE_KO);
    const ogDescription = doc.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute('content', META_DESCRIPTION_KO);
    const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute('content', TITLE_KO);
    const twitterDescription = doc.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) twitterDescription.setAttribute('content', META_DESCRIPTION_KO);
    const ogImageAlt = doc.querySelector('meta[property="og:image:alt"]');
    if (ogImageAlt) ogImageAlt.setAttribute('content', SHARE_IMAGE_ALT_KO);
    const twitterImageAlt = doc.querySelector('meta[name="twitter:image:alt"]');
    if (twitterImageAlt) twitterImageAlt.setAttribute('content', SHARE_IMAGE_ALT_KO);
    const ogLocale = doc.querySelector('meta[property="og:locale"]');
    if (ogLocale) ogLocale.setAttribute('content', 'ko_KR');
    const ogLocaleAlternate = doc.querySelector('meta[property="og:locale:alternate"]');
    if (ogLocaleAlternate) ogLocaleAlternate.setAttribute('content', 'en_US');
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

  window.__pendulumI18nCore = {
    TEXT,
    ATTRS,
    TYPE_PHRASES_KO,
    TITLE_KO,
    META_DESCRIPTION_KO,
    SHARE_IMAGE_ALT_KO,
    applyKorean,
  };
})();
