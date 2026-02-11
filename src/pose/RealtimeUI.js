// RealtimeUI.js - 실시간 포즈 분석 UI
// PiP 웹캠, 메트릭 패널, 컨트롤 바, 스냅샷 캡처

import { LM, CONNECTIONS } from './PoseDetector.js';
import {
    initRealtimePose,
    startRealtimePose,
    stopRealtimePose,
    createSkeletonGroup,
    removeSkeletonGroup,
    isRealtimeRunning,
} from './RealtimePose.js';

let videoEl = null;
let pipCanvas = null;
let pipCtx = null;
let mediaStream = null;

// UI elements
let pipContainer = null;
let metricsPanel = null;
let controlsBar = null;
let confidenceEl = null;

// Snapshot callback
let onSnapshotCapture = null;

const SEV_LABELS = { normal: '정상', mild: '경도', moderate: '중등도', severe: '중증' };
const SEV_COLORS = {
    normal: '#6BA88C', mild: '#D4A843',
    moderate: '#D47643', severe: '#C45B4A'
};

/**
 * 실시간 분석 UI 초기화
 * @param {Object} opts - { onSnapshot: (data) => {} }
 */
export function initRealtimePoseUI(opts = {}) {
    onSnapshotCapture = opts.onSnapshot || null;

    pipContainer = document.getElementById('realtime-pip');
    metricsPanel = document.getElementById('realtime-metrics-panel');
    controlsBar = document.getElementById('realtime-controls-bar');

    if (!controlsBar) return;

    // Bind control buttons
    const startBtn = document.getElementById('btn-realtime-start');
    const stopBtn = document.getElementById('btn-realtime-stop');
    const snapBtn = document.getElementById('btn-realtime-snapshot');

    if (startBtn) startBtn.addEventListener('click', handleStart);
    if (stopBtn) stopBtn.addEventListener('click', handleStop);
    if (snapBtn) snapBtn.addEventListener('click', handleSnapshot);
}

/**
 * 실시간 오버레이 UI 표시
 */
export function showRealtimePoseOverlay() {
    if (pipContainer) pipContainer.style.display = 'block';
    if (metricsPanel) metricsPanel.style.display = 'block';
    if (controlsBar) controlsBar.style.display = 'flex';
}

/**
 * 실시간 오버레이 UI 숨김
 */
export function hideRealtimePoseOverlay() {
    if (pipContainer) pipContainer.style.display = 'none';
    if (metricsPanel) metricsPanel.style.display = 'none';
    if (controlsBar) controlsBar.style.display = 'none';
}

/**
 * 시작 핸들러
 */
async function handleStart() {
    const startBtn = document.getElementById('btn-realtime-start');
    const stopBtn = document.getElementById('btn-realtime-stop');

    if (isRealtimeRunning()) return;

    try {
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = '초기화 중...';
        }

        // Initialize video landmarker
        await initRealtimePose();

        // Start webcam
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' }
        });

        // Setup video element
        videoEl = document.getElementById('realtime-video');
        if (!videoEl) {
            videoEl = document.createElement('video');
            videoEl.id = 'realtime-video';
            videoEl.autoplay = true;
            videoEl.playsInline = true;
            videoEl.muted = true;
            if (pipContainer) pipContainer.appendChild(videoEl);
        }
        videoEl.srcObject = mediaStream;
        await videoEl.play();

        // Setup PiP overlay canvas
        pipCanvas = document.getElementById('realtime-pip-canvas');
        if (!pipCanvas) {
            pipCanvas = document.createElement('canvas');
            pipCanvas.id = 'realtime-pip-canvas';
            pipCanvas.className = 'realtime-pip-canvas';
            if (pipContainer) pipContainer.appendChild(pipCanvas);
        }
        pipCanvas.width = 240;
        pipCanvas.height = 180;
        pipCtx = pipCanvas.getContext('2d');

        // Create 3D skeleton
        createSkeletonGroup();

        // Show UI
        showRealtimePoseOverlay();

        // Start detection loop
        startRealtimePose(videoEl, onPoseUpdate);

        if (startBtn) {
            startBtn.style.display = 'none';
        }
        if (stopBtn) {
            stopBtn.style.display = 'inline-flex';
        }

        window.showToast?.('실시간 포즈 감지를 시작했습니다.', 'success');
    } catch (err) {
        console.error('Realtime pose start error:', err);
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = '시작';
        }

        if (err.name === 'NotAllowedError') {
            window.showToast?.('웹캠 접근이 거부되었습니다. 브라우저 설정을 확인하세요.', 'error');
        } else {
            window.showToast?.('실시간 포즈 감지 시작 실패: ' + err.message, 'error');
        }
    }
}

/**
 * 중지 핸들러
 */
function handleStop() {
    const startBtn = document.getElementById('btn-realtime-start');
    const stopBtn = document.getElementById('btn-realtime-stop');

    stopRealtimePose();

    // Stop webcam
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }

    if (videoEl) {
        videoEl.srcObject = null;
    }

    // Clear PiP canvas
    if (pipCtx && pipCanvas) {
        pipCtx.clearRect(0, 0, pipCanvas.width, pipCanvas.height);
    }

    // Clear metrics
    if (metricsPanel) {
        const items = metricsPanel.querySelectorAll('.metric-value');
        items.forEach(el => { el.textContent = '-'; el.style.color = ''; });
    }

    hideRealtimePoseOverlay();

    if (startBtn) {
        startBtn.style.display = 'inline-flex';
        startBtn.disabled = false;
        startBtn.textContent = '시작';
    }
    if (stopBtn) {
        stopBtn.style.display = 'none';
    }

    window.showToast?.('실시간 포즈 감지를 중지했습니다.', 'info');
}

/**
 * 스냅샷 캡처 핸들러
 */
function handleSnapshot() {
    if (!isRealtimeRunning() || !videoEl) return;

    // Capture current video frame to canvas
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = videoEl.videoWidth || 640;
    snapCanvas.height = videoEl.videoHeight || 480;
    const ctx = snapCanvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);

    const dataUrl = snapCanvas.toDataURL('image/png');

    if (onSnapshotCapture) {
        onSnapshotCapture({ dataUrl, timestamp: Date.now() });
    }

    window.showToast?.('스냅샷이 캡처되었습니다.', 'success');
}

/**
 * 포즈 업데이트 콜백 (매 분석 프레임마다 호출)
 */
function onPoseUpdate(result) {
    if (!result) return;

    const { landmarks, metrics, regionMapping, confidence } = result;

    // Draw landmarks on PiP canvas
    if (pipCtx && pipCanvas && landmarks) {
        drawPipOverlay(landmarks, metrics);
    }

    // Update metrics panel
    updateMetricsDisplay(metrics, confidence);
}

/**
 * PiP 캔버스에 랜드마크 오버레이 그리기
 */
function drawPipOverlay(landmarks, metrics) {
    const w = pipCanvas.width;
    const h = pipCanvas.height;
    pipCtx.clearRect(0, 0, w, h);

    // Draw connections
    pipCtx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
    pipCtx.lineWidth = 1.5;
    for (const [i, j] of CONNECTIONS) {
        const a = landmarks[i];
        const b = landmarks[j];
        if (!a || !b) continue;
        pipCtx.beginPath();
        pipCtx.moveTo(a.x * w, a.y * h);
        pipCtx.lineTo(b.x * w, b.y * h);
        pipCtx.stroke();
    }

    // Draw keypoints
    const keyIndices = [
        LM.NOSE, LM.LEFT_EAR, LM.RIGHT_EAR,
        LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
        LM.LEFT_HIP, LM.RIGHT_HIP,
        LM.LEFT_KNEE, LM.RIGHT_KNEE,
        LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
    ];

    for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (!lm) continue;
        const isKey = keyIndices.includes(i);
        const radius = isKey ? 3 : 1.5;
        pipCtx.fillStyle = isKey ? '#00ff88' : 'rgba(0, 255, 136, 0.4)';
        pipCtx.beginPath();
        pipCtx.arc(lm.x * w, lm.y * h, radius, 0, Math.PI * 2);
        pipCtx.fill();
    }
}

/**
 * 메트릭 패널 UI 업데이트
 */
function updateMetricsDisplay(metrics, confidence) {
    if (!metricsPanel || !metrics) return;

    const updates = [
        { id: 'metric-fha', value: metrics.forwardHeadAngle?.value, unit: '°', sev: metrics.forwardHeadAngle?.severity },
        { id: 'metric-sld', value: metrics.shoulderLevelDiff?.value, unit: 'cm', sev: metrics.shoulderLevelDiff?.severity },
        { id: 'metric-pt', value: metrics.pelvicTilt?.value, unit: '°', sev: metrics.pelvicTilt?.severity },
        { id: 'metric-tlt', value: metrics.trunkLateralTilt?.value, unit: '°', sev: metrics.trunkLateralTilt?.severity },
        { id: 'metric-knee-l', value: metrics.kneeAlignment?.left?.type || '-', unit: '', sev: metrics.kneeAlignment?.left?.severity },
        { id: 'metric-knee-r', value: metrics.kneeAlignment?.right?.type || '-', unit: '', sev: metrics.kneeAlignment?.right?.severity },
    ];

    for (const { id, value, unit, sev } of updates) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.textContent = value !== undefined ? `${value}${unit}` : '-';
        el.style.color = SEV_COLORS[sev] || '';
    }

    // Update confidence
    const confEl = document.getElementById('metric-confidence');
    if (confEl) {
        const pct = Math.round(confidence * 100);
        confEl.textContent = `${pct}%`;
        confEl.style.color = pct >= 70 ? SEV_COLORS.normal : pct >= 40 ? SEV_COLORS.mild : SEV_COLORS.severe;
    }

    // Pulse indicator
    const pulseEl = document.getElementById('realtime-pulse');
    if (pulseEl) {
        pulseEl.classList.add('active');
        setTimeout(() => pulseEl.classList.remove('active'), 200);
    }
}
