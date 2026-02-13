// PoseOverlay.js - 캔버스 랜드마크 오버레이 렌더링
// posture.js에서 분리: drawLandmarks, drawMetricIndicators

import { LM, CONNECTIONS } from './PoseDetector.js';

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

    // 전방 두부 - 귀-어깨 라인 표시 (측면 촬영에서만)
    if (metrics.forwardHeadAngle.severity !== 'normal' && !metrics.forwardHeadAngle.skipped) {
        const color = SEV_OVERLAY_COLORS[metrics.forwardHeadAngle.severity];
        drawIndicatorLine(ctx, lm[LM.LEFT_EAR], lm[LM.LEFT_SHOULDER], w, h, color);
        drawIndicatorLine(ctx, lm[LM.RIGHT_EAR], lm[LM.RIGHT_SHOULDER], w, h, color);
        const midX = ((lm[LM.LEFT_EAR].x + lm[LM.RIGHT_EAR].x) / 2) * w;
        const midY = lm[LM.LEFT_EAR].y * h - 15;
        drawLabel(ctx, `${metrics.forwardHeadAngle.value}°`, midX, midY, color);
    }

    // 어깨 높이차 (정면 촬영에서만)
    if (metrics.shoulderLevelDiff.severity !== 'normal' && !metrics.shoulderLevelDiff.skipped) {
        const color = SEV_OVERLAY_COLORS[metrics.shoulderLevelDiff.severity];
        drawIndicatorLine(ctx, lm[LM.LEFT_SHOULDER], lm[LM.RIGHT_SHOULDER], w, h, color);
        const midX = ((lm[LM.LEFT_SHOULDER].x + lm[LM.RIGHT_SHOULDER].x) / 2) * w;
        const midY = ((lm[LM.LEFT_SHOULDER].y + lm[LM.RIGHT_SHOULDER].y) / 2) * h - 10;
        drawLabel(ctx, `Δ${metrics.shoulderLevelDiff.value}cm`, midX, midY, color);
    }

    // 골반 기울기 (정면 촬영에서만)
    if (metrics.pelvicTilt.severity !== 'normal' && !metrics.pelvicTilt.skipped) {
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
