// anatomy-data.js - 해부학 정보 데이터베이스
// 24개 PREDEFINED_REGIONS에 대한 상세 해부학 정보 제공
// videoId: YouTube 영상 ID (피지컬갤러리, 하이닥 등 검증된 한국 물리치료 채널)

const ANATOMY_DB = {
    head_l: {
        name: '머리 (좌)',
        description: '두개골 좌측 영역. 측두근, 교근 등 저작근과 두개골 구조를 포함합니다.',
        keyMuscles: ['측두근', '교근', '전두근', '후두근'],
        keyStructures: ['측두골', '두정골', '측두하악관절(TMJ)'],
        commonPathologies: ['긴장성 두통', 'TMJ 장애', '측두근 긴장'],
        exercises: [
            { name: 'TMJ 스트레칭', difficulty: '쉬움', videoId: 'pnlnBFsCLCE' },
            { name: '측두근 자가마사지', difficulty: '쉬움', videoId: 'm8QyW9RLEcQ' },
            { name: '턱 이완 운동', difficulty: '쉬움', videoId: 'pnlnBFsCLCE' }
        ],
        cameraPreset: { position: 'right', yOffset: 0.4 }
    },
    head_r: {
        name: '머리 (우)',
        description: '두개골 우측 영역. 측두근, 교근 등 저작근과 두개골 구조를 포함합니다.',
        keyMuscles: ['측두근', '교근', '전두근', '후두근'],
        keyStructures: ['측두골', '두정골', '측두하악관절(TMJ)'],
        commonPathologies: ['긴장성 두통', 'TMJ 장애', '측두근 긴장'],
        exercises: [
            { name: 'TMJ 스트레칭', difficulty: '쉬움', videoId: 'pnlnBFsCLCE' },
            { name: '측두근 자가마사지', difficulty: '쉬움', videoId: 'm8QyW9RLEcQ' },
            { name: '턱 이완 운동', difficulty: '쉬움', videoId: 'pnlnBFsCLCE' }
        ],
        cameraPreset: { position: 'left', yOffset: 0.4 }
    },
    neck_l: {
        name: '목 (좌)',
        description: '경추 좌측. 흉쇄유돌근, 사각근 등 목 근육과 경추를 포함합니다.',
        keyMuscles: ['흉쇄유돌근(SCM)', '사각근', '두판상근', '견갑거근'],
        keyStructures: ['경추(C1-C7)', '추간판', '경동맥'],
        commonPathologies: ['경추 디스크', '사경', '근막통증 증후군', '경추 퇴행성 변화'],
        exercises: [
            { name: '경추 측굴 스트레칭', difficulty: '쉬움', videoId: 'stVphpo6uC4' },
            { name: 'SCM 스트레칭', difficulty: '쉬움', videoId: 'Z9nantEZ1bo' },
            { name: '딥넥 플렉서 강화', difficulty: '보통', videoId: 'eKUH0Rcwhd8' },
            { name: '경추 등척성 운동', difficulty: '보통', videoId: 'eKUH0Rcwhd8' }
        ],
        cameraPreset: { position: 'right', yOffset: 0.35 }
    },
    neck_r: {
        name: '목 (우)',
        description: '경추 우측. 흉쇄유돌근, 사각근 등 목 근육과 경추를 포함합니다.',
        keyMuscles: ['흉쇄유돌근(SCM)', '사각근', '두판상근', '견갑거근'],
        keyStructures: ['경추(C1-C7)', '추간판', '경동맥'],
        commonPathologies: ['경추 디스크', '사경', '근막통증 증후군', '경추 퇴행성 변화'],
        exercises: [
            { name: '경추 측굴 스트레칭', difficulty: '쉬움', videoId: 'stVphpo6uC4' },
            { name: 'SCM 스트레칭', difficulty: '쉬움', videoId: 'Z9nantEZ1bo' },
            { name: '딥넥 플렉서 강화', difficulty: '보통', videoId: 'eKUH0Rcwhd8' },
            { name: '경추 등척성 운동', difficulty: '보통', videoId: 'eKUH0Rcwhd8' }
        ],
        cameraPreset: { position: 'left', yOffset: 0.35 }
    },
    shoulder_l: {
        name: '왼쪽 어깨',
        description: '좌측 어깨 관절 복합체. 삼각근, 회전근개, 견갑골 주변 근육을 포함합니다.',
        keyMuscles: ['삼각근', '극상근', '극하근', '소원근', '견갑하근', '승모근'],
        keyStructures: ['견갑골', '쇄골', '견봉', '견관절(GH joint)', '견봉하 공간'],
        commonPathologies: ['회전근개 손상', '충돌 증후군', '오십견(동결견)', '견갑골 이상운동증'],
        exercises: [
            { name: '코드만 진자운동', difficulty: '쉬움', videoId: 'OaIdPbaglt0' },
            { name: '외회전 밴드운동', difficulty: '보통', videoId: 'FSUSzHjcc4I' },
            { name: '견갑골 세팅', difficulty: '보통', videoId: 'XXgaV3vsmGQ' },
            { name: 'Y-T-W 운동', difficulty: '보통', videoId: 'BMKZ1cN7MkY' }
        ],
        cameraPreset: { position: 'right', yOffset: 0.2 }
    },
    shoulder_r: {
        name: '오른쪽 어깨',
        description: '우측 어깨 관절 복합체. 삼각근, 회전근개, 견갑골 주변 근육을 포함합니다.',
        keyMuscles: ['삼각근', '극상근', '극하근', '소원근', '견갑하근', '승모근'],
        keyStructures: ['견갑골', '쇄골', '견봉', '견관절(GH joint)', '견봉하 공간'],
        commonPathologies: ['회전근개 손상', '충돌 증후군', '오십견(동결견)', '견갑골 이상운동증'],
        exercises: [
            { name: '코드만 진자운동', difficulty: '쉬움', videoId: 'OaIdPbaglt0' },
            { name: '외회전 밴드운동', difficulty: '보통', videoId: 'FSUSzHjcc4I' },
            { name: '견갑골 세팅', difficulty: '보통', videoId: 'XXgaV3vsmGQ' },
            { name: 'Y-T-W 운동', difficulty: '보통', videoId: 'BMKZ1cN7MkY' }
        ],
        cameraPreset: { position: 'left', yOffset: 0.2 }
    },
    chest_l: {
        name: '가슴 (좌)',
        description: '좌측 흉부. 대흉근, 소흉근과 흉곽 구조를 포함합니다.',
        keyMuscles: ['대흉근', '소흉근', '전거근', '외늑간근'],
        keyStructures: ['흉골', '늑골(1-12)', '흉곽'],
        commonPathologies: ['흉곽출구증후군', '소흉근 단축', '늑간신경통'],
        exercises: [
            { name: '도어 스트레칭', difficulty: '쉬움', videoId: '42DrZRxsZas' },
            { name: '대흉근 스트레칭', difficulty: '쉬움', videoId: 'piTKJeo6RSs' },
            { name: '전거근 펀치', difficulty: '보통', videoId: 'AmQ7HxgP_aU' }
        ],
        cameraPreset: { position: 'front', yOffset: 0.15 }
    },
    chest_r: {
        name: '가슴 (우)',
        description: '우측 흉부. 대흉근, 소흉근과 흉곽 구조를 포함합니다.',
        keyMuscles: ['대흉근', '소흉근', '전거근', '외늑간근'],
        keyStructures: ['흉골', '늑골(1-12)', '흉곽'],
        commonPathologies: ['흉곽출구증후군', '소흉근 단축', '늑간신경통'],
        exercises: [
            { name: '도어 스트레칭', difficulty: '쉬움', videoId: '42DrZRxsZas' },
            { name: '대흉근 스트레칭', difficulty: '쉬움', videoId: 'piTKJeo6RSs' },
            { name: '전거근 펀치', difficulty: '보통', videoId: 'AmQ7HxgP_aU' }
        ],
        cameraPreset: { position: 'front', yOffset: 0.15 }
    },
    upper_back_l: {
        name: '상부 등 (좌)',
        description: '좌측 흉추부. 능형근, 승모근 중부, 척추기립근 상부를 포함합니다.',
        keyMuscles: ['승모근 중부', '능형근', '척추기립근', '다열근'],
        keyStructures: ['흉추(T1-T6)', '추간판', '늑골두 관절'],
        commonPathologies: ['흉추 과후만', '능형근 약화', '상교차 증후군'],
        exercises: [
            { name: '로우(Rows)', difficulty: '보통', videoId: 'B_smaviLr1g' },
            { name: '흉추 익스텐션', difficulty: '보통', videoId: 'j-yZc63FfKk' },
            { name: '폼롤러 흉추 가동술', difficulty: '쉬움', videoId: 'kDPF8UeRgRo' },
            { name: '능형근 스퀴즈', difficulty: '쉬움', videoId: '3zc1mGfA5kc' }
        ],
        cameraPreset: { position: 'back', yOffset: 0.15 }
    },
    upper_back_r: {
        name: '상부 등 (우)',
        description: '우측 흉추부. 능형근, 승모근 중부, 척추기립근 상부를 포함합니다.',
        keyMuscles: ['승모근 중부', '능형근', '척추기립근', '다열근'],
        keyStructures: ['흉추(T1-T6)', '추간판', '늑골두 관절'],
        commonPathologies: ['흉추 과후만', '능형근 약화', '상교차 증후군'],
        exercises: [
            { name: '로우(Rows)', difficulty: '보통', videoId: 'B_smaviLr1g' },
            { name: '흉추 익스텐션', difficulty: '보통', videoId: 'j-yZc63FfKk' },
            { name: '폼롤러 흉추 가동술', difficulty: '쉬움', videoId: 'kDPF8UeRgRo' },
            { name: '능형근 스퀴즈', difficulty: '쉬움', videoId: '3zc1mGfA5kc' }
        ],
        cameraPreset: { position: 'back', yOffset: 0.15 }
    },
    lower_back_l: {
        name: '허리 (좌)',
        description: '좌측 요추부. 요방형근, 다열근, 척추기립근 하부를 포함합니다.',
        keyMuscles: ['요방형근(QL)', '다열근', '척추기립근', '요근(Psoas)'],
        keyStructures: ['요추(L1-L5)', '추간판', '후관절', '황색인대'],
        commonPathologies: ['요추 디스크 탈출', '요추 협착증', '요방형근 경련', '척추 전방전위증'],
        exercises: [
            { name: '캣카우 스트레칭', difficulty: '쉬움', videoId: 'VCx-4bFLBRM' },
            { name: '버드독', difficulty: '보통', videoId: 'RN22oMwDnVY' },
            { name: '데드버그', difficulty: '보통', videoId: 'NKO0OKO4wq0' },
            { name: '맥길 빅3', difficulty: '보통', videoId: 'VzCi28QMqVM' }
        ],
        cameraPreset: { position: 'back', yOffset: 0.0 }
    },
    lower_back_r: {
        name: '허리 (우)',
        description: '우측 요추부. 요방형근, 다열근, 척추기립근 하부를 포함합니다.',
        keyMuscles: ['요방형근(QL)', '다열근', '척추기립근', '요근(Psoas)'],
        keyStructures: ['요추(L1-L5)', '추간판', '후관절', '황색인대'],
        commonPathologies: ['요추 디스크 탈출', '요추 협착증', '요방형근 경련', '척추 전방전위증'],
        exercises: [
            { name: '캣카우 스트레칭', difficulty: '쉬움', videoId: 'VCx-4bFLBRM' },
            { name: '버드독', difficulty: '보통', videoId: 'RN22oMwDnVY' },
            { name: '데드버그', difficulty: '보통', videoId: 'NKO0OKO4wq0' },
            { name: '맥길 빅3', difficulty: '보통', videoId: 'VzCi28QMqVM' }
        ],
        cameraPreset: { position: 'back', yOffset: 0.0 }
    },
    abdomen_l: {
        name: '복부 (좌)',
        description: '좌측 복부. 복직근, 외복사근, 내복사근, 복횡근을 포함합니다.',
        keyMuscles: ['복직근', '외복사근', '내복사근', '복횡근'],
        keyStructures: ['백선', '서혜인대', '복벽근막'],
        commonPathologies: ['복직근 이개', '복벽 탈장', '코어 불안정'],
        exercises: [
            { name: '복횡근 활성화(드로인)', difficulty: '쉬움', videoId: 'VzCi28QMqVM' },
            { name: '플랭크', difficulty: '보통', videoId: '86F74fyD3uc' },
            { name: '사이드 플랭크', difficulty: '보통', videoId: '86F74fyD3uc' },
            { name: '팔로프 프레스', difficulty: '어려움', videoId: '_DVhhmg7n98' }
        ],
        cameraPreset: { position: 'front', yOffset: -0.05 }
    },
    abdomen_r: {
        name: '복부 (우)',
        description: '우측 복부. 복직근, 외복사근, 내복사근, 복횡근을 포함합니다.',
        keyMuscles: ['복직근', '외복사근', '내복사근', '복횡근'],
        keyStructures: ['백선', '서혜인대', '복벽근막'],
        commonPathologies: ['복직근 이개', '복벽 탈장', '코어 불안정'],
        exercises: [
            { name: '복횡근 활성화(드로인)', difficulty: '쉬움', videoId: 'VzCi28QMqVM' },
            { name: '플랭크', difficulty: '보통', videoId: '86F74fyD3uc' },
            { name: '사이드 플랭크', difficulty: '보통', videoId: '86F74fyD3uc' },
            { name: '팔로프 프레스', difficulty: '어려움', videoId: '_DVhhmg7n98' }
        ],
        cameraPreset: { position: 'front', yOffset: -0.05 }
    },
    arm_l: {
        name: '왼팔',
        description: '좌측 상지. 이두근, 삼두근, 전완 근육과 팔꿈치 관절을 포함합니다.',
        keyMuscles: ['이두근', '삼두근', '상완근', '원회내근', '요골수근굴근'],
        keyStructures: ['상완골', '요골', '척골', '주관절', '수근관절'],
        commonPathologies: ['테니스 엘보', '골프 엘보', '이두근 건염', '수근관 증후군'],
        exercises: [
            { name: '손목 신전근 스트레칭', difficulty: '쉬움', videoId: 'QfytI3MQR7U' },
            { name: '편심성 손목 운동', difficulty: '보통', videoId: '9VTCCQm6-1g' },
            { name: '그립 강화운동', difficulty: '쉬움', videoId: '2hsd6XwYoy4' }
        ],
        cameraPreset: { position: 'right', yOffset: 0.05 }
    },
    arm_r: {
        name: '오른팔',
        description: '우측 상지. 이두근, 삼두근, 전완 근육과 팔꿈치 관절을 포함합니다.',
        keyMuscles: ['이두근', '삼두근', '상완근', '원회내근', '요골수근굴근'],
        keyStructures: ['상완골', '요골', '척골', '주관절', '수근관절'],
        commonPathologies: ['테니스 엘보', '골프 엘보', '이두근 건염', '수근관 증후군'],
        exercises: [
            { name: '손목 신전근 스트레칭', difficulty: '쉬움', videoId: 'QfytI3MQR7U' },
            { name: '편심성 손목 운동', difficulty: '보통', videoId: '9VTCCQm6-1g' },
            { name: '그립 강화운동', difficulty: '쉬움', videoId: '2hsd6XwYoy4' }
        ],
        cameraPreset: { position: 'left', yOffset: 0.05 }
    },
    hip_l: {
        name: '골반 (좌)',
        description: '좌측 고관절 영역. 둔근, 장요근, 이상근과 고관절 구조를 포함합니다.',
        keyMuscles: ['대둔근', '중둔근', '소둔근', '장요근', '이상근'],
        keyStructures: ['장골', '비구', '대퇴골두', '고관절순', '천장관절(SI joint)'],
        commonPathologies: ['고관절 충돌 증후군', '이상근 증후군', '천장관절 기능장애', '대퇴비구충돌'],
        exercises: [
            { name: '클램셸', difficulty: '쉬움', videoId: '_DVhhmg7n98' },
            { name: '힙 플렉서 스트레칭', difficulty: '쉬움', videoId: 'GJEbZqWL5tU' },
            { name: '이상근 스트레칭', difficulty: '쉬움', videoId: 'HNfHJfeosOc' },
            { name: '힙 힌지', difficulty: '보통', videoId: 'iQ7MnBxZpN8' }
        ],
        cameraPreset: { position: 'right', yOffset: -0.1 }
    },
    hip_r: {
        name: '골반 (우)',
        description: '우측 고관절 영역. 둔근, 장요근, 이상근과 고관절 구조를 포함합니다.',
        keyMuscles: ['대둔근', '중둔근', '소둔근', '장요근', '이상근'],
        keyStructures: ['장골', '비구', '대퇴골두', '고관절순', '천장관절(SI joint)'],
        commonPathologies: ['고관절 충돌 증후군', '이상근 증후군', '천장관절 기능장애', '대퇴비구충돌'],
        exercises: [
            { name: '클램셸', difficulty: '쉬움', videoId: '_DVhhmg7n98' },
            { name: '힙 플렉서 스트레칭', difficulty: '쉬움', videoId: 'GJEbZqWL5tU' },
            { name: '이상근 스트레칭', difficulty: '쉬움', videoId: 'HNfHJfeosOc' },
            { name: '힙 힌지', difficulty: '보통', videoId: 'iQ7MnBxZpN8' }
        ],
        cameraPreset: { position: 'left', yOffset: -0.1 }
    },
    thigh_l: {
        name: '왼대퇴',
        description: '좌측 대퇴부. 대퇴사두근, 햄스트링, 내전근과 대퇴골을 포함합니다.',
        keyMuscles: ['대퇴사두근', '대퇴이두근', '반건양근', '반막양근', '내전근군'],
        keyStructures: ['대퇴골', '슬관절', '장경인대(ITB)'],
        commonPathologies: ['햄스트링 염좌', 'ITB 증후군', '대퇴사두 건염', '대퇴 스트레인'],
        exercises: [
            { name: '햄스트링 스트레칭', difficulty: '쉬움', videoId: '5ZR8VVNZIvg' },
            { name: '대퇴사두 스트레칭', difficulty: '쉬움', videoId: 'E7zqjVm-MMA' },
            { name: '스쿼트', difficulty: '보통', videoId: 'nTcRTG-Py0c' },
            { name: '노르딕 컬', difficulty: '어려움', videoId: 'nTcRTG-Py0c' }
        ],
        cameraPreset: { position: 'front', yOffset: -0.2 }
    },
    thigh_r: {
        name: '오른대퇴',
        description: '우측 대퇴부. 대퇴사두근, 햄스트링, 내전근과 대퇴골을 포함합니다.',
        keyMuscles: ['대퇴사두근', '대퇴이두근', '반건양근', '반막양근', '내전근군'],
        keyStructures: ['대퇴골', '슬관절', '장경인대(ITB)'],
        commonPathologies: ['햄스트링 염좌', 'ITB 증후군', '대퇴사두 건염', '대퇴 스트레인'],
        exercises: [
            { name: '햄스트링 스트레칭', difficulty: '쉬움', videoId: '5ZR8VVNZIvg' },
            { name: '대퇴사두 스트레칭', difficulty: '쉬움', videoId: 'E7zqjVm-MMA' },
            { name: '스쿼트', difficulty: '보통', videoId: 'nTcRTG-Py0c' },
            { name: '노르딕 컬', difficulty: '어려움', videoId: 'nTcRTG-Py0c' }
        ],
        cameraPreset: { position: 'front', yOffset: -0.2 }
    },
    shin_l: {
        name: '왼종아리',
        description: '좌측 하퇴부. 비복근, 가자미근, 전경골근과 경비골을 포함합니다.',
        keyMuscles: ['비복근', '가자미근', '전경골근', '비골근'],
        keyStructures: ['경골', '비골', '족관절', '아킬레스건'],
        commonPathologies: ['아킬레스건염', '정강이 부목', '비복근 경련', '구획증후군'],
        exercises: [
            { name: '카프 레이즈', difficulty: '쉬움', videoId: 'JijbvAl75-A' },
            { name: '가자미근 스트레칭', difficulty: '쉬움', videoId: 'JijbvAl75-A' },
            { name: '편심성 카프 레이즈', difficulty: '보통', videoId: 'JijbvAl75-A' },
            { name: '발목 밴드 운동', difficulty: '보통', videoId: '970LrTe8wBo' }
        ],
        cameraPreset: { position: 'front', yOffset: -0.35 }
    },
    shin_r: {
        name: '오른종아리',
        description: '우측 하퇴부. 비복근, 가자미근, 전경골근과 경비골을 포함합니다.',
        keyMuscles: ['비복근', '가자미근', '전경골근', '비골근'],
        keyStructures: ['경골', '비골', '족관절', '아킬레스건'],
        commonPathologies: ['아킬레스건염', '정강이 부목', '비복근 경련', '구획증후군'],
        exercises: [
            { name: '카프 레이즈', difficulty: '쉬움', videoId: 'JijbvAl75-A' },
            { name: '가자미근 스트레칭', difficulty: '쉬움', videoId: 'JijbvAl75-A' },
            { name: '편심성 카프 레이즈', difficulty: '보통', videoId: 'JijbvAl75-A' },
            { name: '발목 밴드 운동', difficulty: '보통', videoId: '970LrTe8wBo' }
        ],
        cameraPreset: { position: 'front', yOffset: -0.35 }
    },
    foot_l: {
        name: '왼발',
        description: '좌측 족부. 족저근막, 내재근, 족근골과 발가락 관절을 포함합니다.',
        keyMuscles: ['족저근막', '후경골근', '단비골근', '족부 내재근'],
        keyStructures: ['거골', '종골', '족근관절', '족궁(내측/외측)'],
        commonPathologies: ['족저근막염', '편평족', '요족', '무지외반증', '발목 불안정'],
        exercises: [
            { name: '골프공 족저 마사지', difficulty: '쉬움', videoId: '1yJwleqY73s' },
            { name: '타월 컬', difficulty: '쉬움', videoId: 'GNCpqbXlZ1g' },
            { name: '카프 스트레칭', difficulty: '쉬움', videoId: '1yJwleqY73s' },
            { name: '균형 보드 훈련', difficulty: '보통', videoId: '970LrTe8wBo' }
        ],
        cameraPreset: { position: 'front', yOffset: -0.45 }
    },
    foot_r: {
        name: '오른발',
        description: '우측 족부. 족저근막, 내재근, 족근골과 발가락 관절을 포함합니다.',
        keyMuscles: ['족저근막', '후경골근', '단비골근', '족부 내재근'],
        keyStructures: ['거골', '종골', '족근관절', '족궁(내측/외측)'],
        commonPathologies: ['족저근막염', '편평족', '요족', '무지외반증', '발목 불안정'],
        exercises: [
            { name: '골프공 족저 마사지', difficulty: '쉬움', videoId: '1yJwleqY73s' },
            { name: '타월 컬', difficulty: '쉬움', videoId: 'GNCpqbXlZ1g' },
            { name: '카프 스트레칭', difficulty: '쉬움', videoId: '1yJwleqY73s' },
            { name: '균형 보드 훈련', difficulty: '보통', videoId: '970LrTe8wBo' }
        ],
        cameraPreset: { position: 'front', yOffset: -0.45 }
    },
};

/**
 * 부위 키로 해부학 정보 조회
 * @param {string} regionKey - PREDEFINED_REGIONS의 id (예: 'shoulder_l')
 * @returns {Object|null} 해부학 정보 객체
 */
export function getAnatomyInfo(regionKey) {
    return ANATOMY_DB[regionKey] || null;
}

/**
 * 키워드 검색 → 매칭된 부위 목록 반환
 * 질환 우선, 그 다음 근육/구조/부위명/운동 순서로 검색
 * @param {string} query - 검색어
 * @returns {Array<{regionKey: string, name: string, matchField: string}>}
 */
export function searchAnatomy(query) {
    if (!query || query.trim().length === 0) return [];

    const q = query.trim().toLowerCase();

    // 1차: 질환 매칭 (최우선)
    const diseaseResults = [];
    // 2차: 나머지 매칭
    const otherResults = [];
    const seen = new Set();

    for (const [key, info] of Object.entries(ANATOMY_DB)) {
        // 질환 매칭 (최우선)
        for (const path of info.commonPathologies) {
            if (path.toLowerCase().includes(q) && !seen.has(key)) {
                diseaseResults.push({ regionKey: key, name: info.name, matchField: `질환: ${path}` });
                seen.add(key);
                break;
            }
        }
    }

    for (const [key, info] of Object.entries(ANATOMY_DB)) {
        if (seen.has(key)) continue;

        // 근육 매칭
        for (const muscle of info.keyMuscles) {
            if (muscle.toLowerCase().includes(q) && !seen.has(key)) {
                otherResults.push({ regionKey: key, name: info.name, matchField: `근육: ${muscle}` });
                seen.add(key);
                break;
            }
        }
        if (seen.has(key)) continue;

        // 부위명 매칭
        if (info.name.toLowerCase().includes(q)) {
            otherResults.push({ regionKey: key, name: info.name, matchField: '부위명' });
            seen.add(key);
            continue;
        }

        // 구조 매칭
        for (const struct of info.keyStructures) {
            if (struct.toLowerCase().includes(q) && !seen.has(key)) {
                otherResults.push({ regionKey: key, name: info.name, matchField: `구조: ${struct}` });
                seen.add(key);
                break;
            }
        }
        if (seen.has(key)) continue;

        // 운동 매칭
        for (const ex of info.exercises) {
            if (ex.name.toLowerCase().includes(q) && !seen.has(key)) {
                otherResults.push({ regionKey: key, name: info.name, matchField: `운동: ${ex.name}` });
                seen.add(key);
                break;
            }
        }
    }

    return [...diseaseResults, ...otherResults];
}

/**
 * 자동완성용 전체 용어 목록 반환
 * @returns {string[]} 검색 가능한 모든 용어
 */
export function getAutocompleteTerms() {
    const terms = new Set();

    for (const info of Object.values(ANATOMY_DB)) {
        terms.add(info.name);
        info.keyMuscles.forEach(m => terms.add(m));
        info.keyStructures.forEach(s => terms.add(s));
        info.commonPathologies.forEach(p => terms.add(p));
        info.exercises.forEach(e => terms.add(e.name));
    }

    return [...terms].sort();
}
