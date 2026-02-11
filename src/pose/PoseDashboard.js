// PoseDashboard.js - 포즈 분석 대시보드
// 관절 각도 계산, 좌우 균형 분석, Chart.js 그래프 시각화

import { LM } from './PoseDetector.js';
import Chart from 'chart.js/auto';

let radarChart = null;
let balanceChart = null;
let historyChart = null;
let currentAnalysis = null;

// 관절 각도 정의 (관절명, 랜드마크 3점, 정상 범위)
const JOINT_ANGLES = [
    {
        id: 'neck_flexion',
        label: '목 굴곡',
        points: [LM.NOSE, LM.LEFT_SHOULDER, LM.LEFT_HIP],
        pointsR: [LM.NOSE, LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
        normalRange: [140, 180],
        unit: '°',
    },
    {
        id: 'shoulder_l',
        label: '어깨 (좌)',
        points: [LM.LEFT_HIP, LM.LEFT_SHOULDER, 13], // 13 = LEFT_ELBOW
        side: 'left',
        normalRange: [0, 180],
        unit: '°',
    },
    {
        id: 'shoulder_r',
        label: '어깨 (우)',
        points: [LM.RIGHT_HIP, LM.RIGHT_SHOULDER, 14], // 14 = RIGHT_ELBOW
        side: 'right',
        normalRange: [0, 180],
        unit: '°',
    },
    {
        id: 'elbow_l',
        label: '팔꿈치 (좌)',
        points: [LM.LEFT_SHOULDER, 13, 15], // 13=L_ELBOW, 15=L_WRIST
        side: 'left',
        normalRange: [0, 150],
        unit: '°',
    },
    {
        id: 'elbow_r',
        label: '팔꿈치 (우)',
        points: [14, 14, 16], // fix below
        side: 'right',
        normalRange: [0, 150],
        unit: '°',
    },
    {
        id: 'hip_l',
        label: '고관절 (좌)',
        points: [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE],
        side: 'left',
        normalRange: [140, 180],
        unit: '°',
    },
    {
        id: 'hip_r',
        label: '고관절 (우)',
        points: [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE],
        side: 'right',
        normalRange: [140, 180],
        unit: '°',
    },
    {
        id: 'knee_l',
        label: '무릎 (좌)',
        points: [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
        side: 'left',
        normalRange: [160, 180],
        unit: '°',
    },
    {
        id: 'knee_r',
        label: '무릎 (우)',
        points: [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
        side: 'right',
        normalRange: [160, 180],
        unit: '°',
    },
    {
        id: 'ankle_l',
        label: '발목 (좌)',
        points: [LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.LEFT_HEEL],
        side: 'left',
        normalRange: [70, 110],
        unit: '°',
    },
    {
        id: 'ankle_r',
        label: '발목 (우)',
        points: [LM.RIGHT_KNEE, LM.RIGHT_ANKLE, LM.RIGHT_HEEL],
        side: 'right',
        normalRange: [70, 110],
        unit: '°',
    },
];

// 팔꿈치 인덱스 수정
JOINT_ANGLES[4].points = [LM.RIGHT_SHOULDER, 14, 16]; // RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST

const BALANCE_PAIRS = [
    { label: '어깨', leftId: 'shoulder_l', rightId: 'shoulder_r' },
    { label: '팔꿈치', leftId: 'elbow_l', rightId: 'elbow_r' },
    { label: '고관절', leftId: 'hip_l', rightId: 'hip_r' },
    { label: '무릎', leftId: 'knee_l', rightId: 'knee_r' },
    { label: '발목', leftId: 'ankle_l', rightId: 'ankle_r' },
];

const HISTORY_KEY = 'postureview_pose_dashboard_history';

// ═══ 운동 포즈 프리셋 ═══

const EXERCISE_PRESETS = {
    standing: {
        label: '직립 자세',
        desc: '바른 선 자세 기준',
        angles: {
            neck_flexion: [160, 180], shoulder_l: [0, 30], shoulder_r: [0, 30],
            elbow_l: [155, 180], elbow_r: [155, 180],
            hip_l: [165, 180], hip_r: [165, 180],
            knee_l: [170, 180], knee_r: [170, 180],
            ankle_l: [80, 100], ankle_r: [80, 100],
        },
    },
    squat: {
        label: '스쿼트',
        desc: '하체 근력 운동',
        angles: {
            neck_flexion: [140, 175], hip_l: [60, 110], hip_r: [60, 110],
            knee_l: [60, 110], knee_r: [60, 110],
            ankle_l: [55, 90], ankle_r: [55, 90],
        },
    },
    deadlift: {
        label: '데드리프트',
        desc: '후면 사슬 운동',
        angles: {
            neck_flexion: [140, 170], hip_l: [50, 100], hip_r: [50, 100],
            knee_l: [140, 175], knee_r: [140, 175],
            ankle_l: [70, 95], ankle_r: [70, 95],
        },
    },
    lunge: {
        label: '런지',
        desc: '하체 비대칭 운동',
        angles: {
            hip_l: [80, 130], hip_r: [100, 170],
            knee_l: [75, 110], knee_r: [130, 175],
            ankle_l: [60, 95], ankle_r: [75, 105],
        },
    },
    plank: {
        label: '플랭크',
        desc: '코어 안정성 운동',
        angles: {
            neck_flexion: [150, 180],
            shoulder_l: [70, 110], shoulder_r: [70, 110],
            elbow_l: [75, 100], elbow_r: [75, 100],
            hip_l: [160, 180], hip_r: [160, 180],
            knee_l: [165, 180], knee_r: [165, 180],
        },
    },
};

let selectedPreset = 'standing';

/**
 * 3점 사이의 각도 계산 (degrees)
 */
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

/**
 * 모든 관절 각도 계산
 */
function calculateAllJointAngles(landmarks, worldLandmarks) {
    const lm = worldLandmarks || landmarks;
    const results = {};

    for (const joint of JOINT_ANGLES) {
        const [iA, iB, iC] = joint.points;
        const angle = calcAngle3(lm[iA], lm[iB], lm[iC]);
        const inRange = angle !== null && angle >= joint.normalRange[0] && angle <= joint.normalRange[1];

        results[joint.id] = {
            label: joint.label,
            angle,
            normalRange: joint.normalRange,
            inRange,
            side: joint.side || null,
            unit: joint.unit,
        };
    }

    // 목 굴곡: 좌우 평균
    const neckDef = JOINT_ANGLES[0];
    const neckL = calcAngle3(lm[neckDef.points[0]], lm[neckDef.points[1]], lm[neckDef.points[2]]);
    const neckR = calcAngle3(lm[neckDef.pointsR[0]], lm[neckDef.pointsR[1]], lm[neckDef.pointsR[2]]);
    if (neckL !== null && neckR !== null) {
        results['neck_flexion'].angle = Math.round(((neckL + neckR) / 2) * 10) / 10;
        results['neck_flexion'].inRange = results['neck_flexion'].angle >= neckDef.normalRange[0] && results['neck_flexion'].angle <= neckDef.normalRange[1];
    }

    return results;
}

/**
 * 좌우 균형(비대칭도) 분석
 */
function calculateBalance(jointAngles) {
    const results = [];
    let totalAsymmetry = 0;
    let pairCount = 0;

    for (const pair of BALANCE_PAIRS) {
        const left = jointAngles[pair.leftId];
        const right = jointAngles[pair.rightId];

        if (left?.angle == null || right?.angle == null) continue;

        const diff = Math.abs(left.angle - right.angle);
        const avg = (left.angle + right.angle) / 2;
        const asymmetryPct = avg > 0 ? Math.round((diff / avg) * 100 * 10) / 10 : 0;

        let grade;
        if (asymmetryPct <= 5) grade = 'excellent';
        else if (asymmetryPct <= 10) grade = 'good';
        else if (asymmetryPct <= 15) grade = 'fair';
        else grade = 'poor';

        results.push({
            label: pair.label,
            leftAngle: left.angle,
            rightAngle: right.angle,
            diff: Math.round(diff * 10) / 10,
            asymmetryPct,
            grade,
        });

        totalAsymmetry += asymmetryPct;
        pairCount++;
    }

    const overallScore = pairCount > 0
        ? Math.max(0, Math.round(100 - (totalAsymmetry / pairCount) * 3))
        : 100;

    return { pairs: results, overallScore };
}

/**
 * 히스토리에 기록 저장
 */
function saveToHistory(jointAngles, balance) {
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        history.push({
            timestamp: Date.now(),
            angles: Object.fromEntries(
                Object.entries(jointAngles).map(([k, v]) => [k, v.angle])
            ),
            balanceScore: balance.overallScore,
        });
        // 최근 20개만 유지
        if (history.length > 20) history.splice(0, history.length - 20);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch { /* ignore storage errors */ }
}

function getHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch { return []; }
}

// ═══ 대시보드 초기화 ═══

export function initPoseDashboard() {
    const analyzeBtn = document.getElementById('dashboard-analyze-btn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
            if (currentAnalysis) {
                runDashboardAnalysis(currentAnalysis.landmarks, currentAnalysis.worldLandmarks);
            } else {
                window.showToast?.('먼저 자세 분석을 실행해주세요.', 'warning');
            }
        });
    }
}

/**
 * 외부에서 분석 결과를 전달받아 대시보드 갱신
 */
export function updateDashboardFromAnalysis(landmarks, worldLandmarks) {
    currentAnalysis = { landmarks, worldLandmarks };
    runDashboardAnalysis(landmarks, worldLandmarks);
}

function runDashboardAnalysis(landmarks, worldLandmarks) {
    const jointAngles = calculateAllJointAngles(landmarks, worldLandmarks);
    const balance = calculateBalance(jointAngles);

    saveToHistory(jointAngles, balance);

    renderJointAnglesTable(jointAngles);
    renderBalanceSection(balance);
    renderComparisonSection(jointAngles);
    renderRadarChart(jointAngles);
    renderBalanceChart(balance);
    renderHistoryChart();
}

// ═══ UI 렌더링 ═══

function renderJointAnglesTable(jointAngles) {
    const tbody = document.getElementById('joint-angles-tbody');
    if (!tbody) return;

    tbody.innerHTML = Object.values(jointAngles).map(j => {
        if (j.angle == null) return '';
        const statusClass = j.inRange ? 'status-normal' : 'status-warning';
        const statusText = j.inRange ? '정상' : '주의';
        return `
            <tr>
                <td class="ja-name">${j.label}</td>
                <td class="ja-value">${j.angle}${j.unit}</td>
                <td class="ja-range">${j.normalRange[0]}~${j.normalRange[1]}${j.unit}</td>
                <td><span class="ja-status ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    }).join('');
}

function renderBalanceSection(balance) {
    const container = document.getElementById('balance-pairs-list');
    const scoreEl = document.getElementById('balance-overall-score');
    const gradeEl = document.getElementById('balance-overall-grade');

    if (!container) return;

    if (scoreEl) {
        scoreEl.textContent = balance.overallScore;
        scoreEl.className = 'balance-score-value ' + scoreClass(balance.overallScore);
    }
    if (gradeEl) {
        gradeEl.textContent = scoreGradeText(balance.overallScore);
    }

    container.innerHTML = balance.pairs.map(p => {
        const barWidth = Math.min(100, p.asymmetryPct * 5);
        const gradeClass = `grade-${p.grade}`;
        return `
            <div class="balance-pair-row">
                <span class="balance-pair-label">${p.label}</span>
                <span class="balance-pair-values">
                    <span class="balance-left">좌 ${p.leftAngle}°</span>
                    <span class="balance-diff ${gradeClass}">Δ${p.diff}°</span>
                    <span class="balance-right">우 ${p.rightAngle}°</span>
                </span>
                <div class="balance-bar-track">
                    <div class="balance-bar-fill ${gradeClass}" style="width:${barWidth}%"></div>
                </div>
                <span class="balance-pct ${gradeClass}">${p.asymmetryPct}%</span>
            </div>
        `;
    }).join('');
}

function scoreClass(score) {
    if (score >= 85) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 50) return 'score-fair';
    return 'score-poor';
}

function scoreGradeText(score) {
    if (score >= 85) return '우수';
    if (score >= 70) return '양호';
    if (score >= 50) return '보통';
    return '주의';
}

// ═══ 프리셋 비교 ═══

function renderComparisonSection(jointAngles) {
    const container = document.getElementById('preset-comparison-body');
    const selectEl = document.getElementById('preset-select');
    if (!container) return;

    // 프리셋 선택 드롭다운 초기화 (한 번만)
    if (selectEl && selectEl.children.length === 0) {
        for (const [key, preset] of Object.entries(EXERCISE_PRESETS)) {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = `${preset.label} — ${preset.desc}`;
            selectEl.appendChild(opt);
        }
        selectEl.value = selectedPreset;
        selectEl.addEventListener('change', () => {
            selectedPreset = selectEl.value;
            if (currentAnalysis) renderComparisonSection(
                calculateAllJointAngles(currentAnalysis.landmarks, currentAnalysis.worldLandmarks)
            );
        });
    }

    const preset = EXERCISE_PRESETS[selectedPreset];
    if (!preset) return;

    let html = '';
    let totalDeviation = 0;
    let count = 0;

    for (const [jointId, idealRange] of Object.entries(preset.angles)) {
        const measured = jointAngles[jointId];
        if (!measured || measured.angle == null) continue;

        const angle = measured.angle;
        const mid = (idealRange[0] + idealRange[1]) / 2;
        const halfRange = (idealRange[1] - idealRange[0]) / 2;

        // 편차 계산: 범위 내면 0, 범위 밖이면 거리
        let deviation = 0;
        if (angle < idealRange[0]) deviation = idealRange[0] - angle;
        else if (angle > idealRange[1]) deviation = angle - idealRange[1];
        const deviationPct = halfRange > 0 ? Math.min(100, Math.round((deviation / halfRange) * 100)) : 0;

        totalDeviation += deviationPct;
        count++;

        let gradeClass, gradeLabel;
        if (deviationPct === 0) { gradeClass = 'cmp-excellent'; gradeLabel = '적합'; }
        else if (deviationPct <= 30) { gradeClass = 'cmp-good'; gradeLabel = '양호'; }
        else if (deviationPct <= 60) { gradeClass = 'cmp-fair'; gradeLabel = '주의'; }
        else { gradeClass = 'cmp-poor'; gradeLabel = '부적합'; }

        // 바 위치: 이상 범위를 중심으로 현재값 위치 표시
        const barMin = Math.max(0, idealRange[0] - 30);
        const barMax = idealRange[1] + 30;
        const barSpan = barMax - barMin;
        const idealStartPct = ((idealRange[0] - barMin) / barSpan) * 100;
        const idealWidthPct = ((idealRange[1] - idealRange[0]) / barSpan) * 100;
        const valuePct = Math.max(0, Math.min(100, ((angle - barMin) / barSpan) * 100));

        html += `
            <div class="cmp-row">
                <div class="cmp-label">${measured.label}</div>
                <div class="cmp-bar-area">
                    <div class="cmp-bar-track">
                        <div class="cmp-ideal-zone" style="left:${idealStartPct}%;width:${idealWidthPct}%"></div>
                        <div class="cmp-value-dot ${gradeClass}" style="left:${valuePct}%"></div>
                    </div>
                    <div class="cmp-bar-labels">
                        <span>${barMin}°</span>
                        <span>${barMax}°</span>
                    </div>
                </div>
                <div class="cmp-values">
                    <span class="cmp-measured">${angle}°</span>
                    <span class="cmp-ideal">${idealRange[0]}~${idealRange[1]}°</span>
                </div>
                <span class="cmp-grade ${gradeClass}">${gradeLabel}</span>
            </div>`;
    }

    container.innerHTML = html;

    // 적합도 점수
    const matchScore = count > 0 ? Math.max(0, Math.round(100 - (totalDeviation / count))) : 0;
    const matchEl = document.getElementById('preset-match-score');
    if (matchEl) {
        matchEl.textContent = matchScore + '점';
        matchEl.className = 'preset-match-value ' + (matchScore >= 80 ? 'cmp-excellent' : matchScore >= 60 ? 'cmp-good' : matchScore >= 40 ? 'cmp-fair' : 'cmp-poor');
    }
}

// ═══ Chart.js 그래프 ═══

function renderRadarChart(jointAngles) {
    const canvas = document.getElementById('radar-chart');
    if (!canvas) return;

    const labels = [];
    const values = [];
    const normalMid = [];

    for (const j of Object.values(jointAngles)) {
        if (j.angle == null) continue;
        labels.push(j.label);
        values.push(j.angle);
        normalMid.push((j.normalRange[0] + j.normalRange[1]) / 2);
    }

    if (radarChart) radarChart.destroy();

    radarChart = new Chart(canvas.getContext('2d'), {
        type: 'radar',
        data: {
            labels,
            datasets: [
                {
                    label: '측정값',
                    data: values,
                    borderColor: '#4A7C6F',
                    backgroundColor: 'rgba(74, 124, 111, 0.15)',
                    borderWidth: 2,
                    pointBackgroundColor: '#4A7C6F',
                    pointRadius: 3,
                },
                {
                    label: '정상 기준',
                    data: normalMid,
                    borderColor: '#D5D0C8',
                    backgroundColor: 'rgba(213, 208, 200, 0.1)',
                    borderWidth: 1,
                    borderDash: [4, 4],
                    pointRadius: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { size: 11, family: 'Inter' }, usePointStyle: true, padding: 12 },
                },
            },
            scales: {
                r: {
                    angleLines: { color: 'rgba(0,0,0,0.06)' },
                    grid: { color: 'rgba(0,0,0,0.06)' },
                    pointLabels: { font: { size: 10, family: 'Inter' }, color: '#6B6B6B' },
                    ticks: { display: false },
                },
            },
        },
    });
}

function renderBalanceChart(balance) {
    const canvas = document.getElementById('balance-chart');
    if (!canvas) return;

    const labels = balance.pairs.map(p => p.label);
    const leftVals = balance.pairs.map(p => p.leftAngle);
    const rightVals = balance.pairs.map(p => p.rightAngle);

    if (balanceChart) balanceChart.destroy();

    balanceChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: '좌측',
                    data: leftVals,
                    backgroundColor: 'rgba(74, 124, 111, 0.7)',
                    borderRadius: 4,
                    barPercentage: 0.4,
                },
                {
                    label: '우측',
                    data: rightVals,
                    backgroundColor: 'rgba(212, 118, 67, 0.7)',
                    borderRadius: 4,
                    barPercentage: 0.4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { size: 11, family: 'Inter' }, usePointStyle: true, padding: 12 },
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.04)' },
                    ticks: { font: { size: 10 } },
                    title: { display: true, text: '각도 (°)', font: { size: 11 } },
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 } },
                },
            },
        },
    });
}

function renderHistoryChart() {
    const canvas = document.getElementById('history-chart');
    if (!canvas) return;

    const history = getHistory();
    if (history.length < 2) {
        const wrapper = canvas.closest('.dashboard-chart-wrapper');
        if (wrapper) {
            const hint = wrapper.querySelector('.chart-no-data');
            if (!hint) {
                const el = document.createElement('div');
                el.className = 'chart-no-data';
                el.textContent = '분석을 2회 이상 실행하면 추이 그래프가 표시됩니다.';
                wrapper.appendChild(el);
            }
        }
        return;
    }

    const wrapper = canvas.closest('.dashboard-chart-wrapper');
    wrapper?.querySelector('.chart-no-data')?.remove();

    const labels = history.map(h => {
        const d = new Date(h.timestamp);
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    });
    const scores = history.map(h => h.balanceScore);

    // 주요 관절 추이 데이터 (무릎, 고관절)
    const kneeL = history.map(h => h.angles?.knee_l ?? null);
    const hipL = history.map(h => h.angles?.hip_l ?? null);

    if (historyChart) historyChart.destroy();

    const datasets = [
        {
            label: '균형 점수',
            data: scores,
            borderColor: '#4A7C6F',
            backgroundColor: 'rgba(74, 124, 111, 0.08)',
            fill: true, tension: 0.3, borderWidth: 2,
            pointRadius: 4, pointBackgroundColor: '#4A7C6F',
            yAxisID: 'y',
        },
    ];

    // 관절 각도 추이 (데이터가 있을 때만)
    if (kneeL.some(v => v !== null)) {
        datasets.push({
            label: '무릎(좌)',
            data: kneeL,
            borderColor: 'rgba(41, 182, 246, 0.6)',
            borderWidth: 1.5, borderDash: [4, 3],
            pointRadius: 2, fill: false, tension: 0.3,
            yAxisID: 'y1',
        });
    }
    if (hipL.some(v => v !== null)) {
        datasets.push({
            label: '고관절(좌)',
            data: hipL,
            borderColor: 'rgba(232, 115, 74, 0.6)',
            borderWidth: 1.5, borderDash: [4, 3],
            pointRadius: 2, fill: false, tension: 0.3,
            yAxisID: 'y1',
        });
    }

    historyChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { size: 10, family: 'Inter' }, usePointStyle: true, padding: 10 },
                },
            },
            scales: {
                y: {
                    min: 0, max: 100, position: 'left',
                    grid: { color: 'rgba(128,128,128,0.08)' },
                    ticks: { font: { size: 10 } },
                    title: { display: true, text: '점수', font: { size: 11 } },
                },
                y1: {
                    min: 0, max: 200, position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { font: { size: 10 } },
                    title: { display: true, text: '각도(°)', font: { size: 11 } },
                    display: datasets.length > 1,
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 9 }, maxRotation: 45 },
                },
            },
        },
    });
}

/**
 * 대시보드 뷰 전환 시 차트 리사이즈
 */
export function refreshDashboardCharts() {
    if (radarChart) radarChart.resize();
    if (balanceChart) balanceChart.resize();
    if (historyChart) historyChart.resize();
}
