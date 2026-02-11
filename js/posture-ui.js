// posture-ui.js - 자세분석 UI 컨트롤러
// 환자 연동, 사진 저장, 분석 결과 → 평가 → 3D 모델 적용

import { analyzePosture, drawLandmarks, initPoseLandmarker } from './posture.js';
import { applyRegionSeverity, switchView, ensureAssessmentMode } from './panels.js';
import * as storage from './storage.js';

let webcamStream = null;
let lastAnalysisResult = null;
let lastPhotoBase64 = null; // 사진 base64 저장용

const SEV_LABELS = { normal: '정상', mild: '경도', moderate: '중등도', severe: '중증' };
const SEV_COLORS = {
    normal: 'var(--status-normal)', mild: 'var(--status-mild)',
    moderate: 'var(--status-moderate)', severe: 'var(--status-severe)'
};

/**
 * 자세분석 UI 초기화
 */
export function initPostureUI() {
    // 파일 업로드
    const fileInput = document.getElementById('posture-file-input');
    const dropzone = document.getElementById('posture-dropzone');
    const browseBtn = document.getElementById('posture-browse-btn');

    if (browseBtn) {
        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
    }
    if (dropzone) {
        dropzone.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleImageFile(file);
            fileInput.value = '';
        });
    }

    // 드래그앤드롭
    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) handleImageFile(file);
        });
    }

    // 웹캠 버튼
    const webcamStartBtn = document.getElementById('posture-webcam-start');
    const webcamCaptureBtn = document.getElementById('posture-webcam-capture');
    const webcamStopBtn = document.getElementById('posture-webcam-stop');

    if (webcamStartBtn) webcamStartBtn.addEventListener('click', startWebcam);
    if (webcamCaptureBtn) webcamCaptureBtn.addEventListener('click', captureWebcam);
    if (webcamStopBtn) webcamStopBtn.addEventListener('click', stopWebcam);

    // 환자 선택 버튼
    const selectPatientBtn = document.getElementById('posture-select-patient-btn');
    if (selectPatientBtn) selectPatientBtn.addEventListener('click', () => switchView('patients'));

    // MediaPipe 프리로드 (백그라운드)
    initPoseLandmarker().catch((err) => {
        console.warn('MediaPipe preload failed:', err);
        if (window.showToast) {
            window.showToast('자세 분석 엔진 로드 실패. 분석 시 재시도합니다.', 'warning', 5000);
        }
        showMediaPipeRetry();
    });
}

function showMediaPipeRetry() {
    const inputArea = document.querySelector('.posture-input-area');
    if (!inputArea) return;
    // Don't add duplicate
    if (inputArea.querySelector('.posture-retry-section')) return;

    const retryEl = document.createElement('div');
    retryEl.className = 'posture-retry-section';
    retryEl.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>자세 분석 엔진을 로드할 수 없습니다.</span>
        <button class="btn-secondary btn-sm-pad" id="posture-retry-btn">재시도</button>
    `;
    inputArea.insertBefore(retryEl, inputArea.firstChild);

    document.getElementById('posture-retry-btn')?.addEventListener('click', async () => {
        retryEl.querySelector('span').textContent = '로딩 중...';
        retryEl.querySelector('button').disabled = true;
        try {
            await initPoseLandmarker();
            retryEl.remove();
            if (window.showToast) window.showToast('자세 분석 엔진이 로드되었습니다.', 'success');
        } catch (err) {
            retryEl.querySelector('span').textContent = '로드 실패: ' + err.message;
            retryEl.querySelector('button').disabled = false;
            if (window.showToast) window.showToast('자세 분석 엔진 로드 재실패.', 'error');
        }
    });
}

// ═══ 사진 처리 ═══

/**
 * 이미지 파일 → base64 저장 + 분석
 */
async function handleImageFile(file) {
    showLoadingState('이미지 분석 중...');

    // base64로 저장
    const reader = new FileReader();
    reader.onload = async (evt) => {
        lastPhotoBase64 = evt.target.result;

        const img = new Image();
        img.onload = async () => {
            await runAnalysis(img);
        };
        img.onerror = () => {
            showError('이미지를 로드할 수 없습니다.');
        };
        img.src = lastPhotoBase64;
    };
    reader.readAsDataURL(file);
}

/**
 * 웹캠 시작
 */
async function startWebcam() {
    const video = document.getElementById('posture-webcam-video');
    const webcamArea = document.getElementById('posture-webcam-area');
    const startBtn = document.getElementById('posture-webcam-start');
    const captureBtn = document.getElementById('posture-webcam-capture');
    const stopBtn = document.getElementById('posture-webcam-stop');

    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        video.srcObject = webcamStream;
        await video.play();

        webcamArea.style.display = 'block';
        startBtn.style.display = 'none';
        captureBtn.style.display = 'inline-flex';
        stopBtn.style.display = 'inline-flex';
    } catch (err) {
        showError('카메라에 접근할 수 없습니다: ' + err.message);
    }
}

/**
 * 웹캠 캡처 → base64 저장 + 분석
 */
async function captureWebcam() {
    const video = document.getElementById('posture-webcam-video');
    if (!video.srcObject) return;

    showLoadingState('캡처 이미지 분석 중...');

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(video, 0, 0);

    lastPhotoBase64 = tempCanvas.toDataURL('image/jpeg', 0.8);

    const img = new Image();
    img.onload = async () => {
        await runAnalysis(img);
    };
    img.src = lastPhotoBase64;
}

/**
 * 웹캠 정지
 */
function stopWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }

    const video = document.getElementById('posture-webcam-video');
    const webcamArea = document.getElementById('posture-webcam-area');
    const startBtn = document.getElementById('posture-webcam-start');
    const captureBtn = document.getElementById('posture-webcam-capture');
    const stopBtn = document.getElementById('posture-webcam-stop');

    if (video) video.srcObject = null;
    if (webcamArea) webcamArea.style.display = 'none';
    if (startBtn) startBtn.style.display = 'inline-flex';
    if (captureBtn) captureBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
}

// ═══ 분석 ═══

async function runAnalysis(imageElement) {
    try {
        const result = await analyzePosture(imageElement);

        if (!result) {
            showError('포즈를 감지할 수 없습니다. 전신이 보이는 사진을 사용해주세요.');
            return;
        }

        lastAnalysisResult = result;

        renderImageWithOverlay(imageElement, result);
        renderResults(result);
        hideLoadingState();
    } catch (err) {
        showError('분석 중 오류 발생: ' + err.message);
        console.error('Posture analysis error:', err);
    }
}

/**
 * 이미지 위에 랜드마크 오버레이 렌더링
 */
function renderImageWithOverlay(imageElement, result) {
    const container = document.getElementById('posture-preview-area');
    const imageCanvas = document.getElementById('posture-image-canvas');
    const overlayCanvas = document.getElementById('posture-overlay-canvas');

    if (!container || !imageCanvas || !overlayCanvas) return;

    container.style.display = 'block';

    const maxW = container.clientWidth || 560;
    const ratio = imageElement.width / imageElement.height;
    const displayW = Math.min(maxW, imageElement.width);
    const displayH = displayW / ratio;

    imageCanvas.width = displayW;
    imageCanvas.height = displayH;
    overlayCanvas.width = displayW;
    overlayCanvas.height = displayH;

    const imgCtx = imageCanvas.getContext('2d');
    imgCtx.drawImage(imageElement, 0, 0, displayW, displayH);

    const overlayCtx = overlayCanvas.getContext('2d');
    drawLandmarks(overlayCtx, result.landmarks, displayW, displayH, result.metrics);
}

// ═══ 결과 렌더링 ═══

function renderResults(result) {
    const panel = document.getElementById('posture-results');
    if (!panel) return;
    panel.style.display = 'block';

    const { metrics, regionMapping, confidence } = result;
    const metricsHtml = renderMetricsList(metrics);
    const affectedHtml = renderAffectedRegions(regionMapping);
    const confidenceHtml = renderConfidence(confidence);

    const severities = regionMapping.map(r => r.severity);
    const worstSev = getWorstSeverity(severities);
    const summaryColor = SEV_COLORS[worstSev] || SEV_COLORS.normal;

    const patient = storage.getCurrentPatient();
    const patientWarning = patient ? '' : `
        <div class="posture-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            환자를 선택해야 평가에 적용할 수 있습니다.
        </div>
    `;

    panel.innerHTML = `
        <div class="posture-results-header">
            <h3>분석 결과</h3>
            <div class="posture-overall-badge" style="background:${summaryColor};">
                ${SEV_LABELS[worstSev] || '정상'}
            </div>
        </div>
        ${confidenceHtml}
        <div class="posture-metrics-section">
            <div class="section-label" style="padding-left:0;">자세 지표</div>
            ${metricsHtml}
        </div>
        <div class="posture-affected-section">
            <div class="section-label" style="padding-left:0;">영향 부위 (${regionMapping.length}개)</div>
            ${affectedHtml}
        </div>
        <div class="posture-apply-section">
            ${patientWarning}
            <button id="posture-apply-btn" class="btn-primary" style="width:100%;" ${!patient ? 'disabled' : ''}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                평가에 적용 + 사진 저장
            </button>
            <p class="posture-apply-hint">새 평가를 자동 생성하고, 분석 사진과 결과를 저장합니다.</p>
        </div>
    `;

    document.getElementById('posture-apply-btn')?.addEventListener('click', applyToAssessment);
}

function renderConfidence(confidence) {
    if (confidence === undefined || confidence === null) return '';
    const pct = Math.round(confidence * 100);
    const color = pct >= 70 ? '#2E7D32' : pct >= 40 ? '#E65100' : '#C62828';
    const warning = pct < 50 ? `
        <div class="posture-confidence-warning">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            신뢰도가 낮습니다. 전신이 잘 보이는 사진으로 다시 시도해주세요.
        </div>
    ` : '';

    return `
        <div class="posture-confidence-section">
            <div class="posture-confidence-header">
                <span class="posture-confidence-label">분석 신뢰도</span>
                <span class="posture-confidence-value" style="color:${color};">${pct}%</span>
            </div>
            <div class="posture-confidence-bar">
                <div class="posture-confidence-fill" style="width:${pct}%;background:${color};"></div>
            </div>
            ${warning}
        </div>
    `;
}

function renderMetricsList(metrics) {
    const items = [
        metrics.forwardHeadAngle,
        metrics.shoulderLevelDiff,
        metrics.pelvicTilt,
        metrics.trunkLateralTilt,
        {
            label: '무릎 정렬 (좌)',
            value: metrics.kneeAlignment.left.type === 'normal' ? '정상' : metrics.kneeAlignment.left.type,
            unit: '',
            severity: metrics.kneeAlignment.left.severity,
        },
        {
            label: '무릎 정렬 (우)',
            value: metrics.kneeAlignment.right.type === 'normal' ? '정상' : metrics.kneeAlignment.right.type,
            unit: '',
            severity: metrics.kneeAlignment.right.severity,
        },
        metrics.upperBackKyphosis,
    ];

    return items.map(item => {
        const sevColor = SEV_COLORS[item.severity] || SEV_COLORS.normal;
        const displayValue = typeof item.value === 'number'
            ? `${item.value}${item.unit}`
            : item.value;

        return `
            <div class="posture-metric-item">
                <div class="posture-metric-info">
                    <span class="posture-metric-label">${item.label}</span>
                    <span class="posture-metric-value">${displayValue}</span>
                </div>
                <div class="posture-metric-bar-track">
                    <div class="posture-metric-bar-fill" style="width:${severityToPercent(item.severity)}%;background:${sevColor};"></div>
                </div>
                <span class="posture-metric-sev" style="color:${sevColor};">${SEV_LABELS[item.severity]}</span>
            </div>
        `;
    }).join('');
}

function renderAffectedRegions(regionMapping) {
    if (regionMapping.length === 0) {
        return '<p class="posture-no-issues">모든 지표가 정상 범위입니다.</p>';
    }

    const regionMap = dedupeRegions(regionMapping);

    return [...regionMap.values()].map(r => {
        const sevColor = SEV_COLORS[r.severity] || SEV_COLORS.normal;
        return `
            <div class="posture-affected-item">
                <span class="posture-affected-dot" style="background:${sevColor};"></span>
                <span class="posture-affected-name">${r.regionKey}</span>
                <span class="posture-affected-reason">${r.reason}</span>
                <span class="posture-affected-sev" style="color:${sevColor};">${SEV_LABELS[r.severity]}</span>
            </div>
        `;
    }).join('');
}

// ═══ 평가 적용 (핵심) ═══

function applyToAssessment() {
    if (!lastAnalysisResult) {
        window.showToast('먼저 자세 분석을 실행해주세요.', 'warning');
        return;
    }

    const patient = storage.getCurrentPatient();
    if (!patient) {
        window.showToast('먼저 환자를 선택해주세요. 좌측 사이드바 → 환자 관리에서 환자를 선택하세요.', 'warning', 5000);
        return;
    }

    // 평가 모드 보장 (없으면 새로 생성)
    const assessment = ensureAssessmentMode();
    if (!assessment) {
        window.showToast('평가를 생성할 수 없습니다.', 'error');
        return;
    }

    // 1) 사진 저장
    if (lastPhotoBase64) {
        storage.savePosturePhoto(assessment.id, lastPhotoBase64);
        // 평가에 자세분석 메타데이터 기록
        storage.updateAssessment(patient.id, assessment.id, {
            postureAnalysis: {
                date: Date.now(),
                hasPhoto: true,
                metrics: summarizeMetrics(lastAnalysisResult.metrics),
                affectedRegions: [...dedupeRegions(lastAnalysisResult.regionMapping).keys()],
            }
        });
    }

    // 2) 각 부위에 중증도 적용 → 3D 모델 vertex 컬러링
    const regionMap = dedupeRegions(lastAnalysisResult.regionMapping);
    let applied = 0;
    for (const [regionKey, data] of regionMap) {
        applyRegionSeverity(regionKey, data.severity);
        applied++;
    }

    // 3) 3D 뷰어로 전환
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');

    window.showToast(`${patient.name} 환자에게 ${applied}개 부위 자세분석 결과가 적용되었습니다.`, 'success', 4000);
}

// ═══ 유틸 ═══

function dedupeRegions(regionMapping) {
    const regionMap = new Map();
    for (const r of regionMapping) {
        const existing = regionMap.get(r.regionKey);
        if (!existing || severityRank(r.severity) > severityRank(existing.severity)) {
            regionMap.set(r.regionKey, r);
        }
    }
    return regionMap;
}

function summarizeMetrics(metrics) {
    return {
        forwardHead: { value: metrics.forwardHeadAngle.value, severity: metrics.forwardHeadAngle.severity },
        shoulderDiff: { value: metrics.shoulderLevelDiff.value, severity: metrics.shoulderLevelDiff.severity },
        pelvicTilt: { value: metrics.pelvicTilt.value, severity: metrics.pelvicTilt.severity },
        trunkTilt: { value: metrics.trunkLateralTilt.value, severity: metrics.trunkLateralTilt.severity },
        kneeLeft: { type: metrics.kneeAlignment.left.type, severity: metrics.kneeAlignment.left.severity },
        kneeRight: { type: metrics.kneeAlignment.right.type, severity: metrics.kneeAlignment.right.severity },
        kyphosis: { severity: metrics.upperBackKyphosis.severity },
    };
}

function severityRank(sev) {
    return { normal: 0, mild: 1, moderate: 2, severe: 3 }[sev] || 0;
}

function getWorstSeverity(severities) {
    let worst = 'normal';
    for (const s of severities) {
        if (severityRank(s) > severityRank(worst)) worst = s;
    }
    return worst;
}

function severityToPercent(sev) {
    return { normal: 15, mild: 40, moderate: 70, severe: 100 }[sev] || 15;
}

function showLoadingState(message) {
    const el = document.getElementById('posture-loading');
    if (el) {
        el.style.display = 'flex';
        el.querySelector('.posture-loading-text').textContent = message || '분석 중...';
    }
    const errorEl = document.getElementById('posture-error');
    if (errorEl) errorEl.style.display = 'none';
}

function hideLoadingState() {
    const el = document.getElementById('posture-loading');
    if (el) el.style.display = 'none';
}

function showError(message) {
    hideLoadingState();
    const el = document.getElementById('posture-error');
    if (el) {
        el.style.display = 'block';
        el.textContent = message;
    }
}
