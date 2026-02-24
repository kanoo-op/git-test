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
    const viewType = detectViewType(landmarks, worldLandmarks, useWorld);
    const metrics = {};

    // 전방 두부 각도 & 상부 등 굽힘: 측면에서만 유효
    if (viewType === 'lateral') {
        metrics.forwardHeadAngle = calcForwardHeadAngle(landmarks, worldLandmarks, useWorld);
        metrics.upperBackKyphosis = calcUpperBackKyphosis(landmarks, worldLandmarks, useWorld);
    } else {
        metrics.forwardHeadAngle = { value: 0, unit: '°', severity: 'normal', label: '전방 두부 각도', skipped: true };
        metrics.upperBackKyphosis = { value: 0, unit: '', severity: 'normal', label: '상부 등 굽힘', skipped: true };
    }

    // 어깨 높이차, 골반 기울기, 체간 기울기, 무릎 정렬: 정면에서만 유효
    if (viewType === 'anterior') {
        metrics.shoulderLevelDiff = calcShoulderLevelDiff(landmarks, worldLandmarks, useWorld, imgH);
        metrics.pelvicTilt = calcPelvicTilt(landmarks, worldLandmarks, useWorld);
        metrics.trunkLateralTilt = calcTrunkLateralTilt(landmarks, worldLandmarks, useWorld);
        metrics.kneeAlignment = calcKneeAlignment(landmarks, worldLandmarks, useWorld);
    } else {
        metrics.shoulderLevelDiff = { value: 0, unit: 'cm', severity: 'normal', label: '어깨 높이차', skipped: true };
        metrics.pelvicTilt = { value: 0, unit: '°', severity: 'normal', label: '골반 기울기', skipped: true };
        metrics.trunkLateralTilt = { value: 0, unit: '°', severity: 'normal', label: '체간 측방 기울기', skipped: true };
        metrics.kneeAlignment = { label: '무릎 정렬', left: { type: 'normal', severity: 'normal' }, right: { type: 'normal', severity: 'normal' }, skipped: true };
    }

    metrics._viewType = viewType;
    return metrics;
}

/**
 * 촬영 방향 자동 감지: 양쪽 어깨 간 거리와 어깨-귀 깊이(Z) 비교
 * - 정면(anterior): 양 어깨가 넓게 보이고 좌우 귀가 모두 보임
 * - 측면(lateral): 양 어깨가 겹쳐 좁게 보이고 한쪽 귀만 보임
 */
function detectViewType(lm, wlm, useWorld) {
    const shoulderL = useWorld ? wlm[LM.LEFT_SHOULDER] : lm[LM.LEFT_SHOULDER];
    const shoulderR = useWorld ? wlm[LM.RIGHT_SHOULDER] : lm[LM.RIGHT_SHOULDER];
    const hipL = useWorld ? wlm[LM.LEFT_HIP] : lm[LM.LEFT_HIP];
    const hipR = useWorld ? wlm[LM.RIGHT_HIP] : lm[LM.RIGHT_HIP];

    // 어깨 간 수평 거리 vs 몸통 높이 비율로 판단
    const shoulderWidth = Math.abs(shoulderL.x - shoulderR.x);
    const torsoHeight = Math.abs(
        ((shoulderL.y + shoulderR.y) / 2) - ((hipL.y + hipR.y) / 2)
    );

    if (torsoHeight < 0.001) return 'anterior';

    const widthToHeightRatio = shoulderWidth / torsoHeight;

    // world landmarks Z 거리도 활용 (있으면)
    if (useWorld && shoulderL.z !== undefined && shoulderR.z !== undefined) {
        const shoulderDepthDiff = Math.abs(shoulderL.z - shoulderR.z);
        // 측면: 어깨 깊이차가 크고 수평거리가 좁음
        if (shoulderDepthDiff > 0.10 && widthToHeightRatio < 0.5) return 'lateral';
        if (shoulderDepthDiff < 0.05 && widthToHeightRatio > 0.6) return 'anterior';
    }

    // normalized landmarks만 있을 때: 수평거리/몸통높이 비율로 판단
    // 정면: 어깨가 넓게 보임 (비율 > 0.7), 측면: 어깨가 겹쳐 좁음 (비율 < 0.4)
    if (widthToHeightRatio > 0.55) return 'anterior';
    if (widthToHeightRatio < 0.35) return 'lateral';

    // 애매한 경우: 양쪽 귀 visibility 비교
    const earLVis = lm[LM.LEFT_EAR]?.visibility || 0;
    const earRVis = lm[LM.RIGHT_EAR]?.visibility || 0;
    const earVisDiff = Math.abs(earLVis - earRVis);
    if (earVisDiff > 0.3) return 'lateral';

    return 'anterior';
}

function calcForwardHeadAngle(lm, wlm, useWorld) {
    // normalized landmarks 사용 (좌/우 평균으로 편향 상쇄, 일관성을 위해 통일)
    const earL = lm[LM.LEFT_EAR];
    const shoulderL = lm[LM.LEFT_SHOULDER];
    const earR = lm[LM.RIGHT_EAR];
    const shoulderR = lm[LM.RIGHT_SHOULDER];

    const angleL = calcAngleFromVertical(earL, shoulderL);
    const angleR = calcAngleFromVertical(earR, shoulderR);

    const avgAngle = (angleL + angleR) / 2;
    // 임상 기준: 15° 미만 정상, 15-25° 경도, 25-35° 중등도, 35°+ 중증
    const severity = classifySeverity(avgAngle, 15, 25, 35);

    return { value: Math.round(avgAngle * 10) / 10, unit: '°', severity, label: '전방 두부 각도' };
}

function calcShoulderLevelDiff(lm, wlm, useWorld, imgH) {
    // 항상 normalized landmarks 사용 (이미지 기반 좌표)
    // worldLandmarks Y값은 3D 추정 편향으로 좌우 어깨에 일정한 오차가 있어 부정확
    const shoulderL = lm[LM.LEFT_SHOULDER];
    const shoulderR = lm[LM.RIGHT_SHOULDER];

    // normalized landmarks (0~1): 어깨~발목 높이를 약 140cm로 추정하여 cm 환산
    const ankleY = Math.max(
        lm[LM.LEFT_ANKLE]?.y || 0,
        lm[LM.RIGHT_ANKLE]?.y || 0
    );
    const shoulderMidY = (shoulderL.y + shoulderR.y) / 2;
    const bodySpan = Math.abs(ankleY - shoulderMidY);
    const cmPerUnit = bodySpan > 0.01 ? (140 / bodySpan) : (imgH * 0.5);
    const diff = Math.abs(shoulderL.y - shoulderR.y) * cmPerUnit;

    // 임상 기준: 1.5cm 미만 정상, 1.5-3cm 경도, 3-5cm 중등도, 5cm+ 중증
    const severity = classifySeverity(diff, 1.5, 3, 5);

    // MediaPipe: Y값이 클수록 아래 → Y값이 더 큰 쪽이 낮은 어깨
    const lowerSide = shoulderL.y > shoulderR.y ? 'left' : 'right';

    return { value: Math.round(diff * 10) / 10, unit: 'cm', severity, label: '어깨 높이차', side: lowerSide };
}

function calcPelvicTilt(lm, wlm, useWorld) {
    // 항상 normalized landmarks 사용 (이미지 기반 좌표)
    // worldLandmarks Y값은 좌/우 hip에 체계적 편향이 있어 거짓 기울기 발생
    const hipL = lm[LM.LEFT_HIP];
    const hipR = lm[LM.RIGHT_HIP];

    const dx = Math.abs(hipL.x - hipR.x);
    const dy = hipL.y - hipR.y;
    const angle = Math.abs(Math.atan2(dy, dx)) * (180 / Math.PI);

    // 임상 기준: 5° 미만 정상, 5-10° 경도, 10-15° 중등도, 15°+ 중증
    const severity = classifySeverity(angle, 5, 10, 15);
    const lowerSide = dy > 0 ? 'left' : 'right';

    return { value: Math.round(angle * 10) / 10, unit: '°', severity, label: '골반 기울기', side: lowerSide };
}

function calcTrunkLateralTilt(lm, wlm, useWorld) {
    // normalized landmarks 사용 (midpoint 평균으로 편향이 상쇄되지만 일관성을 위해 통일)
    const hipL = lm[LM.LEFT_HIP];
    const hipR = lm[LM.RIGHT_HIP];
    const shoulderL = lm[LM.LEFT_SHOULDER];
    const shoulderR = lm[LM.RIGHT_SHOULDER];

    const hipMidX = (hipL.x + hipR.x) / 2;
    const shoulderMidX = (shoulderL.x + shoulderR.x) / 2;
    const hipMidY = (hipL.y + hipR.y) / 2;
    const shoulderMidY = (shoulderL.y + shoulderR.y) / 2;

    const trunkDx = shoulderMidX - hipMidX;
    const trunkDy = shoulderMidY - hipMidY;
    const trunkLen = Math.sqrt(trunkDx * trunkDx + trunkDy * trunkDy);

    if (trunkLen < 0.001) return { value: 0, unit: '°', severity: 'normal', label: '체간 측방 기울기' };

    const angle = Math.abs(Math.atan2(trunkDx, -trunkDy)) * (180 / Math.PI);
    // 임상 기준: 3° 미만 정상, 3-7° 경도, 7-12° 중등도, 12°+ 중증
    const severity = classifySeverity(angle, 3, 7, 12);

    return { value: Math.round(angle * 10) / 10, unit: '°', severity, label: '체간 측방 기울기' };
}

function calcKneeAlignment(lm, wlm, useWorld) {
    // 항상 normalized landmarks 사용 (이미지 기반 좌표)
    // worldLandmarks X값은 관절별 편향이 불균등하여 거짓 양성 가능
    function kneeAngle(hipIdx, kneeIdx, ankleIdx) {
        const hip = lm[hipIdx];
        const knee = lm[kneeIdx];
        const ankle = lm[ankleIdx];

        const hipToKneeX = knee.x - hip.x;
        const kneeToAnkleX = ankle.x - knee.x;
        const deviation = hipToKneeX - kneeToAnkleX;
        return deviation;
    }

    const leftDev = kneeAngle(LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE);
    const rightDev = kneeAngle(LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE);

    const threshold = 0.015;

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
    // 항상 normalized landmarks 사용 (이미지 기반 좌표)
    // worldLandmarks Z축(깊이) 추정은 불안정하여 거짓 양성 발생 가능
    const earL = lm[LM.LEFT_EAR];
    const earR = lm[LM.RIGHT_EAR];
    const shoulderL = lm[LM.LEFT_SHOULDER];
    const shoulderR = lm[LM.RIGHT_SHOULDER];
    const hipL = lm[LM.LEFT_HIP];
    const hipR = lm[LM.RIGHT_HIP];

    const earMidY = (earL.y + earR.y) / 2;
    const shoulderMidY = (shoulderL.y + shoulderR.y) / 2;
    const hipMidY = (hipL.y + hipR.y) / 2;

    const spineLen = Math.abs(shoulderMidY - hipMidY);
    if (spineLen < 0.001) return { value: 0, unit: '', severity: 'normal', label: '상부 등 굽힘' };

    // 측면 뷰: 귀-어깨 X축 거리(전방 이동)를 척추 길이 대비 비율로 판단
    const earMidX = (earL.x + earR.x) / 2;
    const shoulderMidX = (shoulderL.x + shoulderR.x) / 2;
    const forwardShift = Math.abs(earMidX - shoulderMidX);
    const ratio = forwardShift / spineLen;

    // 측면에서 귀가 어깨보다 많이 앞으로 나온 경우 과도한 굽힘
    const isExcessive = ratio > 0.15;

    return {
        value: Math.round(ratio * 100),
        unit: '%',
        severity: isExcessive ? 'moderate' : 'normal',
        label: '상부 등 굽힘',
    };
}

// ═══ 유틸리티 ═══

function calcAngleFromVertical(top, bottom) {
    const dx = top.x - bottom.x;
    const dy = top.y - bottom.y;
    return Math.abs(Math.atan2(dx, -dy)) * (180 / Math.PI);
}

export function classifySeverity(value, mild, moderate, severe) {
    if (typeof value !== 'number' || !isFinite(value) || value < 0) return 'normal';
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
