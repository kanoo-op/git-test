// PoseDetector.js - MediaPipe Pose 기반 자세 분석 코어
// CDN에서 MediaPipe Tasks Vision 로드 후, 사진 분석 → 자세 지표 계산 → 부위 매핑

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task';

let poseLandmarker = null;
let visionModule = null;
let initPromise = null;

// MediaPipe Pose 랜드마크 인덱스 (외부 모듈에서도 사용)
export const LM = {
    NOSE: 0,
    LEFT_EAR: 7, RIGHT_EAR: 8,
    LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_HIP: 23, RIGHT_HIP: 24,
    LEFT_KNEE: 25, RIGHT_KNEE: 26,
    LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
    LEFT_HEEL: 29, RIGHT_HEEL: 30,
};

// 연결선 정의 (캔버스 오버레이용, 외부 모듈에서도 사용)
export const CONNECTIONS = [
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
            initPromise = null;
            poseLandmarker = null;
            throw err;
        }
    })();

    return initPromise;
}

/**
 * 이미지에서 포즈 랜드마크 감지
 */
export async function analyzePosture(imageElement) {
    const landmarker = await initPoseLandmarker();
    const result = landmarker.detect(imageElement);

    if (!result.landmarks || result.landmarks.length === 0) {
        return null;
    }

    const landmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks?.[0] || null;

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

export function calculatePostureMetrics(landmarks, worldLandmarks, imageElement) {
    const imgH = imageElement.height || imageElement.videoHeight || 480;
    const imgW = imageElement.width || imageElement.videoWidth || 640;

    const useWorld = !!worldLandmarks;
    const metrics = {};

    metrics.forwardHeadAngle = calcForwardHeadAngle(landmarks, worldLandmarks, useWorld);
    metrics.shoulderLevelDiff = calcShoulderLevelDiff(landmarks, worldLandmarks, useWorld, imgH);
    metrics.pelvicTilt = calcPelvicTilt(landmarks, worldLandmarks, useWorld);
    metrics.trunkLateralTilt = calcTrunkLateralTilt(landmarks, worldLandmarks, useWorld);
    metrics.kneeAlignment = calcKneeAlignment(landmarks, worldLandmarks, useWorld);
    metrics.upperBackKyphosis = calcUpperBackKyphosis(landmarks, worldLandmarks, useWorld);

    return metrics;
}

function calcForwardHeadAngle(lm, wlm, useWorld) {
    const earL = useWorld ? wlm[LM.LEFT_EAR] : lm[LM.LEFT_EAR];
    const shoulderL = useWorld ? wlm[LM.LEFT_SHOULDER] : lm[LM.LEFT_SHOULDER];
    const earR = useWorld ? wlm[LM.RIGHT_EAR] : lm[LM.RIGHT_EAR];
    const shoulderR = useWorld ? wlm[LM.RIGHT_SHOULDER] : lm[LM.RIGHT_SHOULDER];

    const angleL = calcAngleFromVertical(earL, shoulderL);
    const angleR = calcAngleFromVertical(earR, shoulderR);

    const avgAngle = (angleL + angleR) / 2;
    const severity = classifySeverity(avgAngle, 10, 20, 30);

    return { value: Math.round(avgAngle * 10) / 10, unit: '°', severity, label: '전방 두부 각도' };
}

function calcShoulderLevelDiff(lm, wlm, useWorld, imgH) {
    const shoulderL = useWorld ? wlm[LM.LEFT_SHOULDER] : lm[LM.LEFT_SHOULDER];
    const shoulderR = useWorld ? wlm[LM.RIGHT_SHOULDER] : lm[LM.RIGHT_SHOULDER];

    let diff;
    if (useWorld) {
        diff = Math.abs(shoulderL.y - shoulderR.y) * 100;
    } else {
        const shoulderToHipHeight = Math.abs(
            ((lm[LM.LEFT_SHOULDER].y + lm[LM.RIGHT_SHOULDER].y) / 2) -
            ((lm[LM.LEFT_HIP].y + lm[LM.RIGHT_HIP].y) / 2)
        );
        const pixelPerCm = shoulderToHipHeight > 0 ? (45 / shoulderToHipHeight) : 1;
        diff = Math.abs(shoulderL.y - shoulderR.y) * pixelPerCm;
    }

    const severity = classifySeverity(diff, 1, 2, 3);
    const lowerSide = (useWorld ? shoulderL.y : lm[LM.LEFT_SHOULDER].y) >
                      (useWorld ? shoulderR.y : lm[LM.RIGHT_SHOULDER].y) ? 'left' : 'right';

    return { value: Math.round(diff * 10) / 10, unit: 'cm', severity, label: '어깨 높이차', side: lowerSide };
}

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

    const trunkDx = shoulderMidX - hipMidX;
    const trunkDy = shoulderMidY - hipMidY;
    const trunkLen = Math.sqrt(trunkDx * trunkDx + trunkDy * trunkDy);

    if (trunkLen < 0.001) return { value: 0, unit: '°', severity: 'normal', label: '체간 측방 기울기' };

    const angle = Math.abs(Math.atan2(trunkDx, -trunkDy)) * (180 / Math.PI);
    const severity = classifySeverity(angle, 2, 5, 8);

    return { value: Math.round(angle * 10) / 10, unit: '°', severity, label: '체간 측방 기울기' };
}

function calcKneeAlignment(lm, wlm, useWorld) {
    function kneeAngle(hipIdx, kneeIdx, ankleIdx) {
        const hip = useWorld ? wlm[hipIdx] : lm[hipIdx];
        const knee = useWorld ? wlm[kneeIdx] : lm[kneeIdx];
        const ankle = useWorld ? wlm[ankleIdx] : lm[ankleIdx];

        const hipToKneeX = knee.x - hip.x;
        const kneeToAnkleX = ankle.x - knee.x;
        const deviation = hipToKneeX - kneeToAnkleX;
        return deviation;
    }

    const leftDev = kneeAngle(LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE);
    const rightDev = kneeAngle(LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE);

    const threshold = useWorld ? 0.02 : 0.015;

    function classify(dev, side) {
        const absDev = Math.abs(dev);
        if (absDev < threshold) return 'normal';
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

function calcUpperBackKyphosis(lm, wlm, useWorld) {
    const earL = useWorld ? wlm[LM.LEFT_EAR] : lm[LM.LEFT_EAR];
    const earR = useWorld ? wlm[LM.RIGHT_EAR] : lm[LM.RIGHT_EAR];
    const shoulderL = useWorld ? wlm[LM.LEFT_SHOULDER] : lm[LM.LEFT_SHOULDER];
    const shoulderR = useWorld ? wlm[LM.RIGHT_SHOULDER] : lm[LM.RIGHT_SHOULDER];
    const hipL = useWorld ? wlm[LM.LEFT_HIP] : lm[LM.LEFT_HIP];
    const hipR = useWorld ? wlm[LM.RIGHT_HIP] : lm[LM.RIGHT_HIP];

    const earMidY = (earL.y + earR.y) / 2;
    const shoulderMidY = (shoulderL.y + shoulderR.y) / 2;
    const hipMidY = (hipL.y + hipR.y) / 2;

    const spineLen = Math.abs(shoulderMidY - hipMidY);
    if (spineLen < 0.001) return { value: 0, unit: '', severity: 'normal', label: '상부 등 굽힘' };

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

    const headDrop = Math.abs(earMidY - shoulderMidY);
    const ratio = headDrop / spineLen;
    const isExcessive = ratio < 0.25;
    return {
        value: isExcessive ? 1 : 0,
        unit: '',
        severity: isExcessive ? 'moderate' : 'normal',
        label: '상부 등 굽힘',
        description: isExcessive ? '과도한 굽힘 추정' : '정상 범위',
    };
}

// ═══ 유틸리티 ═══

function calcAngleFromVertical(top, bottom) {
    const dx = top.x - bottom.x;
    const dy = top.y - bottom.y;
    return Math.abs(Math.atan2(dx, -dy)) * (180 / Math.PI);
}

export function classifySeverity(value, mild, moderate, severe) {
    if (value >= severe) return 'severe';
    if (value >= moderate) return 'moderate';
    if (value >= mild) return 'mild';
    return 'normal';
}

// ═══ 지표 → PREDEFINED_REGIONS 매핑 ═══

export function mapMetricsToRegions(metrics) {
    const mapping = [];

    if (metrics.forwardHeadAngle.severity !== 'normal') {
        const sev = metrics.forwardHeadAngle.severity;
        mapping.push({ regionKey: 'head_l', severity: sev, reason: `전방 두부 ${metrics.forwardHeadAngle.value}°` });
        mapping.push({ regionKey: 'head_r', severity: sev, reason: `전방 두부 ${metrics.forwardHeadAngle.value}°` });
        mapping.push({ regionKey: 'neck_l', severity: sev, reason: `전방 두부 ${metrics.forwardHeadAngle.value}°` });
        mapping.push({ regionKey: 'neck_r', severity: sev, reason: `전방 두부 ${metrics.forwardHeadAngle.value}°` });
    }

    if (metrics.shoulderLevelDiff.severity !== 'normal') {
        const sev = metrics.shoulderLevelDiff.severity;
        const side = metrics.shoulderLevelDiff.side === 'left' ? 'l' : 'r';
        mapping.push({
            regionKey: `shoulder_${side}`,
            severity: sev,
            reason: `어깨 높이차 ${metrics.shoulderLevelDiff.value}cm`,
        });
    }

    if (metrics.pelvicTilt.severity !== 'normal') {
        const sev = metrics.pelvicTilt.severity;
        mapping.push({ regionKey: 'hip_l', severity: sev, reason: `골반 기울기 ${metrics.pelvicTilt.value}°` });
        mapping.push({ regionKey: 'hip_r', severity: sev, reason: `골반 기울기 ${metrics.pelvicTilt.value}°` });
        mapping.push({ regionKey: 'lower_back_l', severity: sev, reason: `골반 기울기 ${metrics.pelvicTilt.value}°` });
        mapping.push({ regionKey: 'lower_back_r', severity: sev, reason: `골반 기울기 ${metrics.pelvicTilt.value}°` });
    }

    if (metrics.trunkLateralTilt.severity !== 'normal') {
        const sev = metrics.trunkLateralTilt.severity;
        mapping.push({ regionKey: 'abdomen_l', severity: sev, reason: `체간 기울기 ${metrics.trunkLateralTilt.value}°` });
        mapping.push({ regionKey: 'abdomen_r', severity: sev, reason: `체간 기울기 ${metrics.trunkLateralTilt.value}°` });
        mapping.push({ regionKey: 'chest_l', severity: sev, reason: `체간 기울기 ${metrics.trunkLateralTilt.value}°` });
        mapping.push({ regionKey: 'chest_r', severity: sev, reason: `체간 기울기 ${metrics.trunkLateralTilt.value}°` });
    }

    const knee = metrics.kneeAlignment;
    if (knee.left.severity !== 'normal') {
        mapping.push({ regionKey: 'shin_l', severity: knee.left.severity, reason: `좌측 ${knee.left.type}` });
        mapping.push({ regionKey: 'thigh_l', severity: knee.left.severity, reason: `좌측 ${knee.left.type}` });
    }
    if (knee.right.severity !== 'normal') {
        mapping.push({ regionKey: 'shin_r', severity: knee.right.severity, reason: `우측 ${knee.right.type}` });
        mapping.push({ regionKey: 'thigh_r', severity: knee.right.severity, reason: `우측 ${knee.right.type}` });
    }

    if (metrics.upperBackKyphosis.severity !== 'normal') {
        const sev = metrics.upperBackKyphosis.severity;
        mapping.push({ regionKey: 'upper_back_l', severity: sev, reason: '상부 등 과도 굽힘' });
        mapping.push({ regionKey: 'upper_back_r', severity: sev, reason: '상부 등 과도 굽힘' });
    }

    return mapping;
}
