// ExerciseMode.js - 실시간 운동 자세 확인 모드
// 웹캠으로 운동 자세를 실시간 모니터링하며 관절 각도 피드백 제공

import { initRealtimePose, getVideoLandmarker, stopRealtimePose, isRealtimeRunning } from './RealtimePose.js';
import { LM } from './PoseDetector.js';

// ═══ 관절 각도 정의 ═══

const JOINT_DEFS = {
    neck_flexion: {
        points: [LM.NOSE, LM.LEFT_SHOULDER, LM.LEFT_HIP],
        pointsR: [LM.NOSE, LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
        avg: true,
    },
    shoulder_l: { points: [LM.LEFT_HIP, LM.LEFT_SHOULDER, 13] },
    shoulder_r: { points: [LM.RIGHT_HIP, LM.RIGHT_SHOULDER, 14] },
    elbow_l: { points: [LM.LEFT_SHOULDER, 13, 15] },
    elbow_r: { points: [LM.RIGHT_SHOULDER, 14, 16] },
    hip_l: { points: [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE] },
    hip_r: { points: [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE] },
    knee_l: { points: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE] },
    knee_r: { points: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE] },
    ankle_l: { points: [LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_HEEL] },
    ankle_r: { points: [LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_HEEL] },
};

const JOINT_LABELS = {
    neck_flexion: '목',
    shoulder_l: '어깨(좌)', shoulder_r: '어깨(우)',
    elbow_l: '팔꿈치(좌)', elbow_r: '팔꿈치(우)',
    hip_l: '고관절(좌)', hip_r: '고관절(우)',
    knee_l: '무릎(좌)', knee_r: '무릎(우)',
    ankle_l: '발목(좌)', ankle_r: '발목(우)',
};

// ═══ 운동 프리셋 ═══

const EXERCISE_PRESETS = {
    standing: {
        label: '직립 자세',
        joints: {
            neck_flexion: [155, 180],
            hip_l: [160, 180], hip_r: [160, 180],
            knee_l: [165, 180], knee_r: [165, 180],
        },
    },
    squat: {
        label: '스쿼트',
        joints: {
            hip_l: [55, 120], hip_r: [55, 120],
            knee_l: [55, 120], knee_r: [55, 120],
            ankle_l: [50, 95], ankle_r: [50, 95],
        },
    },
    lunge: {
        label: '런지',
        joints: {
            hip_l: [70, 140], hip_r: [90, 175],
            knee_l: [70, 120], knee_r: [120, 180],
        },
    },
    plank: {
        label: '플랭크',
        joints: {
            shoulder_l: [65, 115], shoulder_r: [65, 115],
            elbow_l: [70, 105], elbow_r: [70, 105],
            hip_l: [155, 180], hip_r: [155, 180],
            knee_l: [160, 180], knee_r: [160, 180],
        },
    },
    deadlift: {
        label: '데드리프트',
        joints: {
            hip_l: [45, 110], hip_r: [45, 110],
            knee_l: [135, 175], knee_r: [135, 175],
        },
    },
    stretch: {
        label: '스트레칭',
        joints: {
            neck_flexion: [120, 180],
            hip_l: [140, 180], hip_r: [140, 180],
            knee_l: [155, 180], knee_r: [155, 180],
        },
    },
};

// ═══ 2D 스켈레톤 연결선 ═══

const SKELETON_CONNS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28],
];

// ═══ 상태 ═══

let running = false;
let animFrameId = null;
let webcamStream = null;
let currentPreset = null;
let startTime = 0;
let frameCount = 0;
let recentScores = [];

// ═══ 초기화 ═══

export function initExerciseMode() {
    document.getElementById('btn-close-exercise-mode')?.addEventListener('click', stopExerciseMode);
    window.startExerciseMode = startExerciseMode;
}

// ═══ 프리셋 결정 ═══

function getPresetKey(exerciseName) {
    const name = (exerciseName || '').toLowerCase();
    if (name.includes('스쿼트') || name.includes('squat')) return 'squat';
    if (name.includes('런지') || name.includes('lunge')) return 'lunge';
    if (name.includes('플랭크') || name.includes('plank')) return 'plank';
    if (name.includes('데드리프트') || name.includes('deadlift')) return 'deadlift';
    if (name.includes('스트레칭') || name.includes('이완') || name.includes('마사지')) return 'stretch';
    return 'standing';
}

// ═══ 운동 모드 시작 ═══

export async function startExerciseMode(exerciseName) {
    const overlay = document.getElementById('exercise-mode-overlay');
    if (!overlay || running) return;

    // 기존 실시간 포즈가 실행 중이면 중지
    if (isRealtimeRunning()) stopRealtimePose();

    // 비디오 모달 닫기
    window.closeExerciseVideo?.();

    const presetKey = getPresetKey(exerciseName);
    currentPreset = EXERCISE_PRESETS[presetKey];

    // UI
    overlay.style.display = 'flex';
    document.getElementById('exercise-mode-title').textContent = exerciseName || '운동';
    document.getElementById('exercise-mode-preset-label').textContent = currentPreset.label;
    initFeedbackPanel();
    updateScore(0);
    updateTimer(0);

    const videoEl = document.getElementById('exercise-mode-video');
    const canvasEl = document.getElementById('exercise-mode-canvas');
    if (!videoEl || !canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    const statusEl = document.getElementById('exercise-mode-status');

    try {
        // 모델이 이미 로드되었으면 로딩 메시지 생략
        const alreadyLoaded = !!getVideoLandmarker();

        if (!alreadyLoaded) showStatus(statusEl, '카메라 연결 중...');

        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
        });
        videoEl.srcObject = webcamStream;
        await videoEl.play();

        if (!alreadyLoaded) {
            showStatus(statusEl, 'AI 모델 로딩 중...');
            await initRealtimePose();
        }

        const landmarker = getVideoLandmarker();
        if (!landmarker) {
            showStatus(statusEl, 'AI 모델 초기화 실패');
            return;
        }

        hideStatus(statusEl);

        // 프레임 루프 시작
        running = true;
        startTime = Date.now();
        frameCount = 0;
        recentScores = [];

        function processFrame() {
            if (!running) return;
            animFrameId = requestAnimationFrame(processFrame);

            frameCount++;
            if (frameCount % 3 !== 0) return;
            if (videoEl.readyState < 2) return;

            // 캔버스 크기 맞추기
            if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
                canvasEl.width = videoEl.videoWidth;
                canvasEl.height = videoEl.videoHeight;
            }

            try {
                const result = landmarker.detectForVideo(videoEl, performance.now());
                ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

                if (result?.landmarks?.[0]) {
                    const landmarks = result.landmarks[0];
                    const worldLandmarks = result.worldLandmarks?.[0];

                    const jointResults = evaluateForm(worldLandmarks || landmarks);
                    drawSkeleton(ctx, landmarks, jointResults, canvasEl.width, canvasEl.height);

                    const score = calcOverallScore(jointResults);
                    recentScores.push(score);
                    if (recentScores.length > 30) recentScores.shift();
                    const avgScore = Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length);

                    updateFeedbackPanel(jointResults);
                    updateScore(avgScore);
                }

                updateTimer(Math.floor((Date.now() - startTime) / 1000));
            } catch {
                // skip frame
            }
        }

        processFrame();
    } catch (err) {
        console.error('Exercise mode error:', err);
        showStatus(statusEl, '카메라를 사용할 수 없습니다');
    }
}

// ═══ 운동 모드 중지 ═══

export function stopExerciseMode() {
    running = false;

    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }

    if (webcamStream) {
        webcamStream.getTracks().forEach(t => t.stop());
        webcamStream = null;
    }

    const videoEl = document.getElementById('exercise-mode-video');
    if (videoEl) videoEl.srcObject = null;

    const overlay = document.getElementById('exercise-mode-overlay');
    if (overlay) overlay.style.display = 'none';

    recentScores = [];
}

// ═══ 3점 각도 계산 ═══

function calcAngle3(a, b, c) {
    if (!a || !b || !c) return null;
    const ba = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
    const bc = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
    const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
    const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
    const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);
    if (magBA < 0.0001 || magBC < 0.0001) return null;
    const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
    return Math.round(Math.acos(cosAngle) * (180 / Math.PI) * 10) / 10;
}

// ═══ 폼 평가 ═══

function evaluateForm(landmarks) {
    const results = {};

    for (const [jointId, range] of Object.entries(currentPreset.joints)) {
        const def = JOINT_DEFS[jointId];
        if (!def) continue;

        let angle = null;
        if (def.avg && def.pointsR) {
            const aL = calcAngle3(landmarks[def.points[0]], landmarks[def.points[1]], landmarks[def.points[2]]);
            const aR = calcAngle3(landmarks[def.pointsR[0]], landmarks[def.pointsR[1]], landmarks[def.pointsR[2]]);
            if (aL !== null && aR !== null) angle = Math.round(((aL + aR) / 2) * 10) / 10;
            else angle = aL ?? aR;
        } else {
            angle = calcAngle3(landmarks[def.points[0]], landmarks[def.points[1]], landmarks[def.points[2]]);
        }

        let status = 'unknown';
        let deviation = 0;
        if (angle !== null) {
            if (angle >= range[0] && angle <= range[1]) {
                status = 'good';
            } else {
                deviation = angle < range[0] ? range[0] - angle : angle - range[1];
                status = deviation <= 15 ? 'warning' : 'bad';
            }
        }

        results[jointId] = { label: JOINT_LABELS[jointId], angle, range, status, deviation };
    }

    return results;
}

// ═══ 점수 계산 ═══

function calcOverallScore(jointResults) {
    let total = 0, count = 0;
    for (const r of Object.values(jointResults)) {
        if (r.angle === null) continue;
        count++;
        if (r.status === 'good') total += 100;
        else if (r.status === 'warning') total += Math.max(40, 100 - r.deviation * 3);
        else total += Math.max(0, 50 - r.deviation * 2);
    }
    return count > 0 ? Math.round(total / count) : 0;
}

// ═══ 2D 스켈레톤 그리기 ═══

function drawSkeleton(ctx, landmarks, jointResults, w, h) {
    // 추적 관절 인덱스 → 상태
    const trackedJoints = new Map();
    for (const [jointId, result] of Object.entries(jointResults)) {
        const def = JOINT_DEFS[jointId];
        if (def) trackedJoints.set(def.points[1], result.status);
    }

    // 연결선
    for (const [i, j] of SKELETON_CONNS) {
        const a = landmarks[i], b = landmarks[j];
        if (!a || !b || (a.visibility || 0) < 0.3 || (b.visibility || 0) < 0.3) continue;

        const lineStatus = trackedJoints.get(i) || trackedJoints.get(j) || 'neutral';
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.strokeStyle = statusColor(lineStatus, 0.7);
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    // 관절 점
    const majorJoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    for (const i of majorJoints) {
        const lm = landmarks[i];
        if (!lm || (lm.visibility || 0) < 0.3) continue;

        const st = trackedJoints.get(i) || 'neutral';
        const r = trackedJoints.has(i) ? 7 : 4;

        ctx.beginPath();
        ctx.arc(lm.x * w, lm.y * h, r, 0, Math.PI * 2);
        ctx.fillStyle = statusColor(st, 0.9);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // 각도 텍스트
    for (const [jointId, result] of Object.entries(jointResults)) {
        if (result.angle === null) continue;
        const def = JOINT_DEFS[jointId];
        const lm = landmarks[def.points[1]];
        if (!lm || (lm.visibility || 0) < 0.3) continue;

        const x = lm.x * w, y = lm.y * h;
        const text = `${result.angle}°`;
        ctx.font = 'bold 13px Pretendard, sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(text, x + 12, y - 6);
        ctx.fillStyle = statusColor(result.status, 1);
        ctx.fillText(text, x + 12, y - 6);
    }
}

function statusColor(status, alpha) {
    switch (status) {
        case 'good': return `rgba(46, 204, 113, ${alpha})`;
        case 'warning': return `rgba(241, 196, 15, ${alpha})`;
        case 'bad': return `rgba(231, 76, 60, ${alpha})`;
        default: return `rgba(52, 152, 219, ${alpha})`;
    }
}

// ═══ 피드백 UI ═══

function initFeedbackPanel() {
    const panel = document.getElementById('exercise-mode-joints');
    if (!panel || !currentPreset) return;

    let html = '';
    for (const [jointId, range] of Object.entries(currentPreset.joints)) {
        html += `
            <div class="em-joint-row" id="em-joint-${jointId}">
                <span class="em-joint-dot"></span>
                <span class="em-joint-label">${JOINT_LABELS[jointId] || jointId}</span>
                <span class="em-joint-angle" id="em-angle-${jointId}">-</span>
                <span class="em-joint-range">${range[0]}°~${range[1]}°</span>
            </div>
        `;
    }
    panel.innerHTML = html;
}

function updateFeedbackPanel(jointResults) {
    for (const [jointId, result] of Object.entries(jointResults)) {
        const row = document.getElementById(`em-joint-${jointId}`);
        if (!row) continue;
        row.className = `em-joint-row em-status-${result.status}`;

        const angleEl = document.getElementById(`em-angle-${jointId}`);
        if (angleEl) angleEl.textContent = result.angle !== null ? `${result.angle}°` : '-';
    }
}

function updateScore(score) {
    const valueEl = document.getElementById('exercise-mode-score-value');
    const circleEl = document.getElementById('exercise-mode-score-circle');
    if (valueEl) valueEl.textContent = score;
    if (circleEl) {
        const circumference = 2 * Math.PI * 40;
        const offset = circumference - (score / 100) * circumference;
        circleEl.style.strokeDashoffset = offset;
        circleEl.style.stroke = score >= 80 ? '#2ecc71' : score >= 50 ? '#f1c40f' : '#e74c3c';
    }
}

function updateTimer(seconds) {
    const el = document.getElementById('exercise-mode-timer');
    if (!el) return;
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    el.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function showStatus(el, text) {
    if (el) { el.textContent = text; el.style.display = 'flex'; }
}

function hideStatus(el) {
    if (el) el.style.display = 'none';
}
