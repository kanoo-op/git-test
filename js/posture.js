// posture.js - MediaPipe Pose 기반 자세 분석 코어
// CDN에서 MediaPipe Tasks Vision 로드 후, 사진 분석 → 자세 지표 계산 → 부위 매핑

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task';

let poseLandmarker = null;
let visionModule = null;
let initPromise = null;

// MediaPipe Pose 랜드마크 인덱스
const LM = {
    NOSE: 0,
    LEFT_EAR: 7, RIGHT_EAR: 8,
    LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_HIP: 23, RIGHT_HIP: 24,
    LEFT_KNEE: 25, RIGHT_KNEE: 26,
    LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
    LEFT_HEEL: 29, RIGHT_HEEL: 30,
};

// 연결선 정의 (캔버스 오버레이용)
const CONNECTIONS = [
    [LM.LEFT_EAR, LM.LEFT_SHOULDER],
    [LM.RIGHT_EAR, LM.RIGHT_SHOULDER],
    [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
    [LM.LEFT_SHOULDER, LM.LEFT_HIP],
    [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
    [LM.LEFT_HIP, LM.RIGHT_HIP],
    [LM.LEFT_HIP, LM.LEFT_KNEE],
    [LM.RIGHT_HIP, LM.RIGHT_KNEE],
    [LM.LEFT_KNEE, LM.LEFT_ANKLE],
    [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
    [LM.LEFT_ANKLE, LM.LEFT_HEEL],
    [LM.RIGHT_ANKLE, LM.RIGHT_HEEL],
    [LM.NOSE, LM.LEFT_EAR],
    [LM.NOSE, LM.RIGHT_EAR],
];

/**
 * CDN에서 MediaPipe Vision 모듈 로드 + PoseLandmarker 초기화
 */
export async function initPoseLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            // 동적으로 MediaPipe Tasks Vision 로드
            const { PoseLandmarker, FilesetResolver } = await import(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs'
            );
            visionModule = { PoseLandmarker, FilesetResolver };

            const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);

            poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: MODEL_URL,
                    delegate: 'GPU',
                },
                runningMode: 'IMAGE',
                numPoses: 1,
            });

            return poseLandmarker;
        } catch (err) {
            // Reset so retry is possible
            initPromise = null;
            poseLandmarker = null;
            throw err;
        }
    })();

    return initPromise;
}

/**
 * 이미지에서 포즈 랜드마크 감지
 * @param {HTMLImageElement|HTMLVideoElement|HTMLCanvasElement} imageElement
 * @returns {Object|null} { landmarks, worldLandmarks, metrics, regionMapping }
 */
export async function analyzePosture(imageElement) {
    const landmarker = await initPoseLandmarker();
    const result = landmarker.detect(imageElement);

    if (!result.landmarks || result.landmarks.length === 0) {
        return null;
    }

    const landmarks = result.landmarks[0]; // 33개 관절점 (normalized 0~1)
    const worldLandmarks = result.worldLandmarks?.[0] || null; // 실제 좌표 (미터 단위)

    // Calculate average visibility/confidence from key landmarks
    const keyIndices = [
        LM.NOSE, LM.LEFT_EAR, LM.RIGHT_EAR,
        LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
        LM.LEFT_HIP, LM.RIGHT_HIP,
        LM.LEFT_KNEE, LM.RIGHT_KNEE,
        LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
    ];
    let totalVisibility = 0;
    let visCount = 0;
    for (const idx of keyIndices) {
        if (landmarks[idx] && landmarks[idx].visibility !== undefined) {
            totalVisibility += landmarks[idx].visibility;
            visCount++;
        }
    }
    const confidence = visCount > 0 ? Math.round((totalVisibility / visCount) * 100) / 100 : 0;

    const metrics = calculatePostureMetrics(landmarks, worldLandmarks, imageElement);
    const regionMapping = mapMetricsToRegions(metrics);

    return {
        landmarks,
        worldLandmarks,
        metrics,
        regionMapping,
        confidence,
    };
}

// ═══ 자세 지표 계산 ═══

/**
 * 6개 자세 지표 계산
 */
function calculatePostureMetrics(landmarks, worldLandmarks, imageElement) {
    const imgH = imageElement.height || imageElement.videoHeight || 480;
    const imgW = imageElement.width || imageElement.videoWidth || 640;

    // 실제 좌표 사용 가능 시 world 사용, 아니면 normalized로 추정
    const useWorld = !!worldLandmarks;

    const metrics = {};

    // 1. 전방 두부 각도 (Forward Head Angle)
    metrics.forwardHeadAngle = calcForwardHeadAngle(landmarks, worldLandmarks, useWorld);

    // 2. 어깨 높이차 (Shoulder Level Difference)
    metrics.shoulderLevelDiff = calcShoulderLevelDiff(landmarks, worldLandmarks, useWorld, imgH);

    // 3. 골반 기울기 (Pelvic Tilt)
    metrics.pelvicTilt = calcPelvicTilt(landmarks, worldLandmarks, useWorld);

    // 4. 체간 측방 기울기 (Trunk Lateral Tilt)
    metrics.trunkLateralTilt = calcTrunkLateralTilt(landmarks, worldLandmarks, useWorld);

    // 5. 무릎 정렬 (Knee Alignment)
    metrics.kneeAlignment = calcKneeAlignment(landmarks, worldLandmarks, useWorld);

    // 6. 상부 등 굽힘 추정 (Upper Back Kyphosis)
    metrics.upperBackKyphosis = calcUpperBackKyphosis(landmarks, worldLandmarks, useWorld);

    return metrics;
}

/**
 * 전방 두부 각도: 귀-어깨 수직선 편차
 * 양쪽 귀-어깨 각도의 평균
 */
function calcForwardHeadAngle(lm, wlm, useWorld) {
    // 좌측: 귀-어깨
    const earL = useWorld ? wlm[LM.LEFT_EAR] : lm[LM.LEFT_EAR];
    const shoulderL = useWorld ? wlm[LM.LEFT_SHOULDER] : lm[LM.LEFT_SHOULDER];
    const earR = useWorld ? wlm[LM.RIGHT_EAR] : lm[LM.RIGHT_EAR];
    const shoulderR = useWorld ? wlm[LM.RIGHT_SHOULDER] : lm[LM.RIGHT_SHOULDER];

    // 귀가 어깨 앞에 얼마나 있는지 (z축 사용 가능 시)
    // 이미지에서는 x축 편차로 추정 (측면 사진 기준)
    const angleL = calcAngleFromVertical(earL, shoulderL);
    const angleR = calcAngleFromVertical(earR, shoulderR);

    const avgAngle = (angleL + angleR) / 2;
    const severity = classifySeverity(avgAngle, 10, 20, 30);

    return { value: Math.round(avgAngle * 10) / 10, unit: '°', severity, label: '전방 두부 각도' };
}

/**
 * 어깨 높이차: 좌우 shoulder Y 차이
 */
function calcShoulderLevelDiff(lm, wlm, useWorld, imgH) {
    const shoulderL = useWorld ? wlm[LM.LEFT_SHOULDER] : lm[LM.LEFT_SHOULDER];
    const shoulderR = useWorld ? wlm[LM.RIGHT_SHOULDER] : lm[LM.RIGHT_SHOULDER];

    let diff;
    if (useWorld) {
        diff = Math.abs(shoulderL.y - shoulderR.y) * 100; // m → cm
    } else {
        // normalized 좌표 → 사람 키 약 170cm 추정으로 변환
        const shoulderToHipHeight = Math.abs(
            ((lm[LM.LEFT_SHOULDER].y + lm[LM.RIGHT_SHOULDER].y) / 2) -
            ((lm[LM.LEFT_HIP].y + lm[LM.RIGHT_HIP].y) / 2)
        );
        const pixelPerCm = shoulderToHipHeight > 0 ? (45 / shoulderToHipHeight) : 1; // 어깨~골반 약 45cm
        diff = Math.abs(shoulderL.y - shoulderR.y) * pixelPerCm;
    }

    const severity = classifySeverity(diff, 1, 2, 3);
    const lowerSide = (useWorld ? shoulderL.y : lm[LM.LEFT_SHOULDER].y) >
                      (useWorld ? shoulderR.y : lm[LM.RIGHT_SHOULDER].y) ? 'left' : 'right';

    return { value: Math.round(diff * 10) / 10, unit: 'cm', severity, label: '어깨 높이차', side: lowerSide };
}

/**
 * 골반 기울기: 좌우 hip Y 차이 → 각도 변환
 */
function calcPelvicTilt(lm, wlm, useWorld) {
    const hipL = useWorld ? wlm[LM.LEFT_HIP] : lm[LM.LEFT_HIP];
    const hipR = useWorld ? wlm[LM.RIGHT_HIP] : lm[LM.RIGHT_HIP];

    const dx = Math.abs(hipL.x - hipR.x);
    const dy = hipL.y - hipR.y;
    const angle = Math.abs(Math.atan2(dy, dx)) * (180 / Math.PI);

    const severity = classifySeverity(angle, 3, 6, 10);
    const lowerSide = dy > 0 ? 'left' : 'right';

    return { value: Math.round(angle * 10) / 10, unit: '°', severity, label: '골반 기울기', side: lowerSide };
}

/**
 * 체간 측방 기울기: 코-골반중심 수직 편차
 */
function calcTrunkLateralTilt(lm, wlm, useWorld) {
    const nose = useWorld ? wlm[LM.NOSE] : lm[LM.NOSE];
    const hipL = useWorld ? wlm[LM.LEFT_HIP] : lm[LM.LEFT_HIP];
    const hipR = useWorld ? wlm[LM.RIGHT_HIP] : lm[LM.RIGHT_HIP];
    const shoulderL = useWorld ? wlm[LM.LEFT_SHOULDER] : lm[LM.LEFT_SHOULDER];
    const shoulderR = useWorld ? wlm[LM.RIGHT_SHOULDER] : lm[LM.RIGHT_SHOULDER];

    const hipMidX = (hipL.x + hipR.x) / 2;
    const shoulderMidX = (shoulderL.x + shoulderR.x) / 2;
    const hipMidY = (hipL.y + hipR.y) / 2;
    const shoulderMidY = (shoulderL.y + shoulderR.y) / 2;

    // 골반중심 → 어깨중심 벡터 대비 코의 수평 편차
    const trunkDx = shoulderMidX - hipMidX;
    const trunkDy = shoulderMidY - hipMidY;
    const trunkLen = Math.sqrt(trunkDx * trunkDx + trunkDy * trunkDy);

    if (trunkLen < 0.001) return { value: 0, unit: '°', severity: 'normal', label: '체간 측방 기울기' };

    const angle = Math.abs(Math.atan2(trunkDx, -trunkDy)) * (180 / Math.PI);
    const severity = classifySeverity(angle, 2, 5, 8);

    return { value: Math.round(angle * 10) / 10, unit: '°', severity, label: '체간 측방 기울기' };
}

/**
 * 무릎 정렬: valgus/varus 감지 (Hip-Knee-Ankle 각도)
 */
function calcKneeAlignment(lm, wlm, useWorld) {
    function kneeAngle(hipIdx, kneeIdx, ankleIdx) {
        const hip = useWorld ? wlm[hipIdx] : lm[hipIdx];
        const knee = useWorld ? wlm[kneeIdx] : lm[kneeIdx];
        const ankle = useWorld ? wlm[ankleIdx] : lm[ankleIdx];

        // Hip-Knee-Ankle 수평 편차
        const hipToKneeX = knee.x - hip.x;
        const kneeToAnkleX = ankle.x - knee.x;

        // X축 방향이 같으면 정상, 무릎이 안쪽이면 valgus, 바깥이면 varus
        const deviation = hipToKneeX - kneeToAnkleX;
        return deviation;
    }

    const leftDev = kneeAngle(LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE);
    const rightDev = kneeAngle(LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE);

    const threshold = useWorld ? 0.02 : 0.015;

    function classify(dev, side) {
        const absDev = Math.abs(dev);
        if (absDev < threshold) return 'normal';
        // 좌측: 양수 = valgus (내반), 음수 = varus
        // 우측: 반대
        if (side === 'left') return dev > 0 ? 'valgus' : 'varus';
        return dev < 0 ? 'valgus' : 'varus';
    }

    const leftType = classify(leftDev, 'left');
    const rightType = classify(rightDev, 'right');

    const leftSev = leftType === 'normal' ? 'normal' : 'mild';
    const rightSev = rightType === 'normal' ? 'normal' : 'mild';

    return {
        label: '무릎 정렬',
        left: { type: leftType, severity: leftSev },
        right: { type: rightType, severity: rightSev },
    };
}

/**
 * 상부 등 굽힘 추정: 어깨-귀 수평거리 대비 높이
 */
function calcUpperBackKyphosis(lm, wlm, useWorld) {
    const earL = useWorld ? wlm[LM.LEFT_EAR] : lm[LM.LEFT_EAR];
    const earR = useWorld ? wlm[LM.RIGHT_EAR] : lm[LM.RIGHT_EAR];
    const shoulderL = useWorld ? wlm[LM.LEFT_SHOULDER] : lm[LM.LEFT_SHOULDER];
    const shoulderR = useWorld ? wlm[LM.RIGHT_SHOULDER] : lm[LM.RIGHT_SHOULDER];
    const hipL = useWorld ? wlm[LM.LEFT_HIP] : lm[LM.LEFT_HIP];
    const hipR = useWorld ? wlm[LM.RIGHT_HIP] : lm[LM.RIGHT_HIP];

    // 어깨중심-귀중심 간 전방 편차 / 어깨중심-골반중심 거리 비율
    const earMidY = (earL.y + earR.y) / 2;
    const shoulderMidY = (shoulderL.y + shoulderR.y) / 2;
    const hipMidY = (hipL.y + hipR.y) / 2;

    const spineLen = Math.abs(shoulderMidY - hipMidY);
    if (spineLen < 0.001) return { value: 0, unit: '', severity: 'normal', label: '상부 등 굽힘' };

    // z축 사용 가능 시
    if (useWorld && wlm[LM.LEFT_EAR].z !== undefined) {
        const earMidZ = (earL.z + earR.z) / 2;
        const shoulderMidZ = (shoulderL.z + shoulderR.z) / 2;
        const forwardShift = Math.abs(earMidZ - shoulderMidZ);
        const ratio = forwardShift / spineLen;
        const isExcessive = ratio > 0.15;
        return {
            value: Math.round(ratio * 100),
            unit: '%',
            severity: isExcessive ? 'moderate' : 'normal',
            label: '상부 등 굽힘',
        };
    }

    // 2D 추정: 귀-어깨 수직 거리 비율
    const headDrop = Math.abs(earMidY - shoulderMidY);
    const ratio = headDrop / spineLen;
    const isExcessive = ratio < 0.25; // 머리가 어깨에 너무 가까우면 굽힘 의심
    return {
        value: isExcessive ? 1 : 0,
        unit: '',
        severity: isExcessive ? 'moderate' : 'normal',
        label: '상부 등 굽힘',
        description: isExcessive ? '과도한 굽힘 추정' : '정상 범위',
    };
}

// ═══ 유틸리티 ═══

/**
 * 두 점 사이의 수직선 기준 각도 계산
 */
function calcAngleFromVertical(top, bottom) {
    const dx = top.x - bottom.x;
    const dy = top.y - bottom.y; // normalized: y 증가 = 아래
    // 수직 기준 편차 각도
    return Math.abs(Math.atan2(dx, -dy)) * (180 / Math.PI);
}

/**
 * 값에 따른 임상 기준 중증도 분류
 */
function classifySeverity(value, mild, moderate, severe) {
    if (value >= severe) return 'severe';
    if (value >= moderate) return 'moderate';
    if (value >= mild) return 'mild';
    return 'normal';
}

// ═══ 지표 → PREDEFINED_REGIONS 매핑 ═══

/**
 * 자세 지표를 PREDEFINED_REGIONS 키에 매핑
 * @returns {Array<{regionKey: string, severity: string, reason: string}>}
 */
function mapMetricsToRegions(metrics) {
    const mapping = [];

    // 1. 전방 두부 → head, neck (좌우)
    if (metrics.forwardHeadAngle.severity !== 'normal') {
        const sev = metrics.forwardHeadAngle.severity;
        mapping.push({ regionKey: 'head_l', severity: sev, reason: `전방 두부 ${metrics.forwardHeadAngle.value}°` });
        mapping.push({ regionKey: 'head_r', severity: sev, reason: `전방 두부 ${metrics.forwardHeadAngle.value}°` });
        mapping.push({ regionKey: 'neck_l', severity: sev, reason: `전방 두부 ${metrics.forwardHeadAngle.value}°` });
        mapping.push({ regionKey: 'neck_r', severity: sev, reason: `전방 두부 ${metrics.forwardHeadAngle.value}°` });
    }

    // 2. 어깨 높이차 → 낮은 쪽 shoulder
    if (metrics.shoulderLevelDiff.severity !== 'normal') {
        const sev = metrics.shoulderLevelDiff.severity;
        const side = metrics.shoulderLevelDiff.side === 'left' ? 'l' : 'r';
        mapping.push({
            regionKey: `shoulder_${side}`,
            severity: sev,
            reason: `어깨 높이차 ${metrics.shoulderLevelDiff.value}cm`,
        });
    }

    // 3. 골반 기울기 → hip, lower_back (좌우)
    if (metrics.pelvicTilt.severity !== 'normal') {
        const sev = metrics.pelvicTilt.severity;
        mapping.push({ regionKey: 'hip_l', severity: sev, reason: `골반 기울기 ${metrics.pelvicTilt.value}°` });
        mapping.push({ regionKey: 'hip_r', severity: sev, reason: `골반 기울기 ${metrics.pelvicTilt.value}°` });
        mapping.push({ regionKey: 'lower_back_l', severity: sev, reason: `골반 기울기 ${metrics.pelvicTilt.value}°` });
        mapping.push({ regionKey: 'lower_back_r', severity: sev, reason: `골반 기울기 ${metrics.pelvicTilt.value}°` });
    }

    // 4. 체간 측방 기울기 → abdomen, chest (좌우)
    if (metrics.trunkLateralTilt.severity !== 'normal') {
        const sev = metrics.trunkLateralTilt.severity;
        mapping.push({ regionKey: 'abdomen_l', severity: sev, reason: `체간 기울기 ${metrics.trunkLateralTilt.value}°` });
        mapping.push({ regionKey: 'abdomen_r', severity: sev, reason: `체간 기울기 ${metrics.trunkLateralTilt.value}°` });
        mapping.push({ regionKey: 'chest_l', severity: sev, reason: `체간 기울기 ${metrics.trunkLateralTilt.value}°` });
        mapping.push({ regionKey: 'chest_r', severity: sev, reason: `체간 기울기 ${metrics.trunkLateralTilt.value}°` });
    }

    // 5. 무릎 정렬 → 해당 shin, thigh
    const knee = metrics.kneeAlignment;
    if (knee.left.severity !== 'normal') {
        mapping.push({ regionKey: 'shin_l', severity: knee.left.severity, reason: `좌측 ${knee.left.type}` });
        mapping.push({ regionKey: 'thigh_l', severity: knee.left.severity, reason: `좌측 ${knee.left.type}` });
    }
    if (knee.right.severity !== 'normal') {
        mapping.push({ regionKey: 'shin_r', severity: knee.right.severity, reason: `우측 ${knee.right.type}` });
        mapping.push({ regionKey: 'thigh_r', severity: knee.right.severity, reason: `우측 ${knee.right.type}` });
    }

    // 6. 상부 등 굽힘 → upper_back (좌우)
    if (metrics.upperBackKyphosis.severity !== 'normal') {
        const sev = metrics.upperBackKyphosis.severity;
        mapping.push({ regionKey: 'upper_back_l', severity: sev, reason: '상부 등 과도 굽힘' });
        mapping.push({ regionKey: 'upper_back_r', severity: sev, reason: '상부 등 과도 굽힘' });
    }

    return mapping;
}

// ═══ 캔버스 랜드마크 오버레이 ═══

const SEV_OVERLAY_COLORS = {
    normal: '#6BA88C',
    mild: '#D4A843',
    moderate: '#D47643',
    severe: '#C45B4A',
};

/**
 * 캔버스에 랜드마크 + 연결선 그리기
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks - normalized landmarks
 * @param {number} width - 캔버스 너비
 * @param {number} height - 캔버스 높이
 * @param {Object} metrics - 지표 객체 (색상 결정용)
 */
export function drawLandmarks(ctx, landmarks, width, height, metrics) {
    ctx.clearRect(0, 0, width, height);

    // 연결선 그리기
    ctx.strokeStyle = 'rgba(74, 124, 111, 0.6)';
    ctx.lineWidth = 2;
    for (const [i, j] of CONNECTIONS) {
        const a = landmarks[i];
        const b = landmarks[j];
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x * width, a.y * height);
        ctx.lineTo(b.x * width, b.y * height);
        ctx.stroke();
    }

    // 랜드마크 포인트 그리기
    for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (!lm) continue;
        const x = lm.x * width;
        const y = lm.y * height;

        // 중요 관절은 크게
        const isKey = [
            LM.NOSE, LM.LEFT_EAR, LM.RIGHT_EAR,
            LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
            LM.LEFT_HIP, LM.RIGHT_HIP,
            LM.LEFT_KNEE, LM.RIGHT_KNEE,
            LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
        ].includes(i);

        const radius = isKey ? 5 : 3;
        ctx.fillStyle = isKey ? '#4A7C6F' : 'rgba(74, 124, 111, 0.5)';

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fill();
    }

    // 비정상 영역 표시
    if (metrics) {
        drawMetricIndicators(ctx, landmarks, width, height, metrics);
    }
}

/**
 * 비정상 지표를 시각적으로 표시
 */
function drawMetricIndicators(ctx, lm, w, h, metrics) {
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'left';

    // 전방 두부 - 귀-어깨 라인 표시
    if (metrics.forwardHeadAngle.severity !== 'normal') {
        const color = SEV_OVERLAY_COLORS[metrics.forwardHeadAngle.severity];
        drawIndicatorLine(ctx, lm[LM.LEFT_EAR], lm[LM.LEFT_SHOULDER], w, h, color);
        drawIndicatorLine(ctx, lm[LM.RIGHT_EAR], lm[LM.RIGHT_SHOULDER], w, h, color);
        const midX = ((lm[LM.LEFT_EAR].x + lm[LM.RIGHT_EAR].x) / 2) * w;
        const midY = lm[LM.LEFT_EAR].y * h - 15;
        drawLabel(ctx, `${metrics.forwardHeadAngle.value}°`, midX, midY, color);
    }

    // 어깨 높이차
    if (metrics.shoulderLevelDiff.severity !== 'normal') {
        const color = SEV_OVERLAY_COLORS[metrics.shoulderLevelDiff.severity];
        drawIndicatorLine(ctx, lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER], w, h, color);
        const midX = ((lm[LM.LEFT_SHOULDER].x + lm[LM.RIGHT_SHOULDER].x) / 2) * w;
        const midY = ((lm[LM.LEFT_SHOULDER].y + lm[LM.RIGHT_SHOULDER].y) / 2) * h - 10;
        drawLabel(ctx, `Δ${metrics.shoulderLevelDiff.value}cm`, midX, midY, color);
    }

    // 골반 기울기
    if (metrics.pelvicTilt.severity !== 'normal') {
        const color = SEV_OVERLAY_COLORS[metrics.pelvicTilt.severity];
        drawIndicatorLine(ctx, lm[LM.LEFT_HIP], lm[LM.RIGHT_HIP], w, h, color);
        const midX = ((lm[LM.LEFT_HIP].x + lm[LM.RIGHT_HIP].x) / 2) * w;
        const midY = ((lm[LM.LEFT_HIP].y + lm[LM.RIGHT_HIP].y) / 2) * h - 10;
        drawLabel(ctx, `${metrics.pelvicTilt.value}°`, midX, midY, color);
    }
}

function drawIndicatorLine(ctx, a, b, w, h, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
    ctx.restore();
}

function drawLabel(ctx, text, x, y, color) {
    ctx.save();
    ctx.font = 'bold 11px Inter, sans-serif';
    const pad = 4;
    const m = ctx.measureText(text);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(x - m.width / 2 - pad, y - 10, m.width + pad * 2, 16, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
}
