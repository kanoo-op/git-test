// PatientDetail.js - Patient detail view, assessment timeline, comparison, trend chart

import Chart from 'chart.js/auto';
import * as storage from '../services/Storage.js';
import { resetRegionColors } from '../anatomy/Highlights.js';
import { getMeshRegionKey, regionKeyToLabel } from '../anatomy/Regions.js';
import { getAnatomyInfo } from '../anatomy/AnatomyData.js';
import { updatePatientCard } from '../ui/Sidebar.js';
import { SEV_LABELS, SEV_COLORS, GENDER_LABELS, calculateAge, escapeHtml } from '../utils/helpers.js';
import {
    switchView,
    getCurrentDetailPatientId,
    getLoadedAssessmentId, setLoadedAssessmentId,
    getCompareSelections,
    getCurrentAssessment, setCurrentAssessment,
    setAssessmentMode,
} from '../ui/ViewRouter.js';
import { restoreAssessmentHighlights, showRegionPanelIfMapped, fillMissingRegionsWithNormal } from './AssessmentManager.js';
import { exportAssessmentPDF } from './PdfExport.js';

let trendChartInstance = null;

export function renderPatientDetail() {
    const currentDetailPatientId = getCurrentDetailPatientId();
    const patient = storage.getPatient(currentDetailPatientId);
    if (!patient) return;

    // Header
    document.getElementById('pd-name').textContent = patient.name;
    const age = patient.dob ? calculateAge(patient.dob) : null;
    const metaParts = [];
    if (age !== null) metaParts.push(`${age}세`);
    if (patient.gender) metaParts.push(GENDER_LABELS[patient.gender] || patient.gender);
    if (patient.diagnosis) metaParts.push(patient.diagnosis);
    document.getElementById('pd-meta').textContent = metaParts.join(' | ') || '기본 정보 없음';

    // Info grid
    const grid = document.getElementById('pd-info-grid');
    const infoItems = [
        { label: '생년월일', value: patient.dob || '-' },
        { label: '성별', value: patient.gender ? (GENDER_LABELS[patient.gender] || patient.gender) : '-' },
        { label: '전화번호', value: patient.phone || '-' },
        { label: '이메일', value: patient.email || '-' },
        { label: '직업', value: patient.occupation || '-' },
        { label: '등록일', value: new Date(patient.createdAt).toLocaleDateString('ko-KR') },
        { label: '주요 호소/진단', value: patient.diagnosis || '-' },
        { label: '병력', value: patient.medicalHistory || '-' },
    ];
    grid.innerHTML = infoItems.map(item => `
        <div class="pd-info-item">
            <span class="pd-info-label">${item.label}</span>
            <span class="pd-info-value">${escapeHtml(item.value)}</span>
        </div>
    `).join('');
    if (patient.notes) {
        grid.innerHTML += `
            <div class="pd-info-item" style="grid-column: 1 / -1;">
                <span class="pd-info-label">메모</span>
                <span class="pd-info-value">${escapeHtml(patient.notes)}</span>
            </div>
        `;
    }

    // Quick stats
    const assessments = patient.assessments || [];
    const totalAssessments = assessments.length;
    const lastVisit = totalAssessments > 0
        ? new Date(Math.max(...assessments.map(a => a.date))).toLocaleDateString('ko-KR')
        : '-';

    const sevCounts = { normal: 0, mild: 0, moderate: 0, severe: 0 };
    for (const a of assessments) {
        for (const s of (a.selections || [])) {
            if (s.severity && sevCounts.hasOwnProperty(s.severity)) sevCounts[s.severity]++;
        }
    }
    const topSev = Object.entries(sevCounts).sort((a, b) => b[1] - a[1])[0];
    const topSevLabel = topSev && topSev[1] > 0 ? SEV_LABELS[topSev[0]] : '-';

    document.getElementById('pd-stats').innerHTML = `
        <div class="pd-stat-card">
            <div class="pd-stat-value">${totalAssessments}</div>
            <div class="pd-stat-label">총 평가</div>
        </div>
        <div class="pd-stat-card">
            <div class="pd-stat-value" style="font-size:16px;">${lastVisit}</div>
            <div class="pd-stat-label">마지막 방문</div>
        </div>
        <div class="pd-stat-card">
            <div class="pd-stat-value" style="font-size:16px;">${topSevLabel}</div>
            <div class="pd-stat-label">가장 빈번한 심각도</div>
        </div>
    `;

    // Assessment timeline
    renderAssessmentTimeline(patient);

    // Trend chart
    renderTrendChart(patient);

    // Hide comparison
    document.getElementById('comparison-container').style.display = 'none';
    document.getElementById('btn-compare-assessments').style.display = 'none';
    getCompareSelections().clear();
}

function renderSoapTimelineSummary(a) {
    const soap = a.soapNotes;
    if (!soap) {
        return a.overallNotes ? `<div class="pd-timeline-notes">${escapeHtml(a.overallNotes)}</div>` : '';
    }

    const s = soap.subjective || {};
    const p = soap.plan || {};
    let html = '<div class="soap-timeline-summary">';

    if (s.chiefComplaint) {
        html += `<div class="soap-chief">S: ${escapeHtml(s.chiefComplaint)}</div>`;
    }

    if (s.painScale > 0) {
        const pct = (s.painScale / 10) * 100;
        const color = s.painScale <= 3 ? '#4CAF50' : s.painScale <= 6 ? '#FF9800' : '#F44336';
        html += `<div class="soap-vas-bar">
            <span class="soap-vas-label">VAS ${s.painScale}/10</span>
            <div class="soap-vas-track">
                <div class="soap-vas-fill" style="width:${pct}%;background:${color}"></div>
            </div>
        </div>`;
    }

    if (p.treatment) {
        html += `<div class="soap-plan-brief">P: ${escapeHtml(p.treatment)}</div>`;
    }

    html += '</div>';
    return html;
}

/**
 * 사진 확대 모달
 */
function showPhotoModal(src) {
    let overlay = document.getElementById('photo-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'photo-modal-overlay';
        overlay.className = 'photo-modal-overlay';
        overlay.innerHTML = '<img class="photo-modal-img"><div class="photo-modal-close">✕</div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => overlay.style.display = 'none');
    }
    overlay.querySelector('.photo-modal-img').src = src;
    overlay.style.display = 'flex';
}

/**
 * 평가의 selections에서 중증 부위에 따른 추천 운동 HTML 생성
 */
function renderAssessmentExercises(assessment) {
    const selections = assessment.selections || [];
    if (selections.length === 0) return '';

    const DIFF_CLASS = { '쉬움': 'easy', '보통': 'medium', '어려움': 'hard' };
    const SEV_ORDER = { severe: 0, moderate: 1, mild: 2, normal: 3 };

    // regionKey별 최고 중증도 수집
    const regionSevMap = new Map();
    for (const s of selections) {
        const key = s.regionKey;
        if (!key || s.severity === 'normal') continue;
        const existing = regionSevMap.get(key);
        if (!existing || (SEV_ORDER[s.severity] ?? 3) < (SEV_ORDER[existing] ?? 3)) {
            regionSevMap.set(key, s.severity);
        }
    }

    if (regionSevMap.size === 0) return '';

    // 중증도 높은 순 정렬
    const sorted = [...regionSevMap.entries()]
        .sort((a, b) => (SEV_ORDER[a[1]] ?? 3) - (SEV_ORDER[b[1]] ?? 3));

    const seenExercises = new Set();
    const sections = [];

    for (const [regionKey, severity] of sorted) {
        const info = getAnatomyInfo(regionKey);
        if (!info || !info.exercises || info.exercises.length === 0) continue;

        const exercises = info.exercises.filter(e => {
            const k = e.name + '|' + (e.videoId || '');
            if (seenExercises.has(k)) return false;
            seenExercises.add(k);
            return true;
        });

        if (exercises.length === 0) continue;

        sections.push({ regionKey, name: info.name, severity, exercises });
    }

    if (sections.length === 0) return '';

    const totalEx = sections.reduce((s, sec) => s + sec.exercises.length, 0);

    const sectionsHtml = sections.map(sec => {
        const exHtml = sec.exercises.map(e => `
            <div class="pd-rec-exercise" data-exercise="${escapeHtml(e.name)}" data-video-id="${e.videoId || ''}" data-difficulty="${escapeHtml(e.difficulty)}">
                <span class="pd-rec-ex-name">${escapeHtml(e.name)}</span>
                <span class="pd-rec-ex-right">
                    <span class="exercise-difficulty difficulty-${DIFF_CLASS[e.difficulty] || 'medium'}">${escapeHtml(e.difficulty)}</span>
                    <span class="pd-rec-play"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></span>
                </span>
            </div>
        `).join('');

        return `
            <div class="pd-rec-region">
                <div class="pd-rec-region-header">
                    <span class="pd-rec-dot sev-${sec.severity}"></span>
                    <span class="pd-rec-region-name">${escapeHtml(sec.name)}</span>
                    <span class="pd-rec-sev sev-text-${sec.severity}">${SEV_LABELS[sec.severity]}</span>
                </div>
                <div class="pd-rec-exercises">${exHtml}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="pd-rec-section">
            <div class="pd-rec-header" data-toggle-rec>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>추천 운동</span>
                <span class="pd-rec-badge">${totalEx}</span>
                <svg class="pd-rec-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="pd-rec-body">${sectionsHtml}</div>
        </div>
    `;
}

function renderAssessmentTimeline(patient) {
    const timeline = document.getElementById('pd-assessments-timeline');
    const assessments = patient.assessments || [];
    const loadedAssessmentId = getLoadedAssessmentId();
    const compareSelections = getCompareSelections();

    if (assessments.length === 0) {
        timeline.innerHTML = `
            <div class="empty-state" style="padding:30px 20px; border-left: none;">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
                <p>평가 기록이 없습니다.</p>
            </div>
        `;
        return;
    }

    const sorted = [...assessments].sort((a, b) => b.date - a.date);

    timeline.innerHTML = sorted.map(a => {
        const date = new Date(a.date).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const selections = a.selections || [];
        const sevCounts = {};
        selections.forEach(s => {
            if (s.severity) sevCounts[s.severity] = (sevCounts[s.severity] || 0) + 1;
        });

        const isLoaded = loadedAssessmentId === a.id;
        const isChecked = compareSelections.has(a.id);

        const pa = a.postureAnalysis;
        const hasPosturePhoto = pa && pa.hasPhoto;
        let postureHtml = '';
        if (hasPosturePhoto) {
            const photo = storage.getPosturePhoto(a.id);
            const metricsInfo = pa.metrics || {};
            postureHtml = `
                <div class="pd-posture-section">
                    ${photo ? `<img src="${photo}" class="pd-posture-thumb" alt="자세분석 사진" data-assessment-id="${a.id}">` : ''}
                    <div class="pd-posture-info">
                        <span class="pd-posture-badge">자세 분석</span>
                        ${metricsInfo.forwardHead ? `<span class="pd-posture-metric">두부 ${metricsInfo.forwardHead.value}° (${SEV_LABELS[metricsInfo.forwardHead.severity]})</span>` : ''}
                        ${metricsInfo.shoulderDiff ? `<span class="pd-posture-metric">어깨차 ${metricsInfo.shoulderDiff.value}cm</span>` : ''}
                        ${metricsInfo.pelvicTilt ? `<span class="pd-posture-metric">골반 ${metricsInfo.pelvicTilt.value}°</span>` : ''}
                        ${pa.affectedRegions ? `<span class="pd-posture-metric">${pa.affectedRegions.length}개 부위 영향</span>` : ''}
                    </div>
                </div>
            `;
        }

        const exerciseRecHtml = renderAssessmentExercises(a);

        return `
            <div class="pd-timeline-item ${isLoaded ? 'active' : ''}" data-id="${a.id}">
                <div class="pd-timeline-dot"></div>
                <label class="pd-timeline-check">
                    <input type="checkbox" class="compare-check" data-id="${a.id}" ${isChecked ? 'checked' : ''}>
                </label>
                <div class="pd-timeline-date">
                    ${date}
                    ${isLoaded ? '<span class="viewing-badge">보는 중</span>' : ''}
                    ${hasPosturePhoto ? '<span class="posture-badge">자세분석</span>' : ''}
                </div>
                <div class="pd-timeline-summary">
                    ${selections.length}개 부위 | ${a.summary ? escapeHtml(a.summary) : '요약 없음'}
                </div>
                ${postureHtml}
                <div class="pd-timeline-tags">
                    ${Object.entries(sevCounts).map(([sev, count]) =>
                        `<span class="severity-tag ${sev}">${SEV_LABELS[sev] || sev}: ${count}</span>`
                    ).join('')}
                </div>
                ${exerciseRecHtml}
                ${renderSoapTimelineSummary(a)}
                <div class="pd-timeline-actions">
                    <button class="view-assessment" data-id="${a.id}">3D에서 보기</button>
                    <button class="continue-assessment" data-id="${a.id}">평가 계속하기</button>
                    <button class="export-pdf" data-id="${a.id}">PDF</button>
                    <button class="btn-danger-sm delete-assessment" data-id="${a.id}">삭제</button>
                </div>
            </div>
        `;
    }).join('');

    // Bind events
    timeline.querySelectorAll('.view-assessment').forEach(btn => {
        btn.addEventListener('click', () => loadAssessment(patient.id, btn.dataset.id));
    });
    timeline.querySelectorAll('.continue-assessment').forEach(btn => {
        btn.addEventListener('click', () => continueAssessment(patient.id, btn.dataset.id));
    });
    timeline.querySelectorAll('.delete-assessment').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('이 평가 기록을 삭제하시겠습니까?')) {
                storage.deleteAssessment(patient.id, btn.dataset.id);
                if (getLoadedAssessmentId() === btn.dataset.id) {
                    resetRegionColors();
                    setLoadedAssessmentId(null);
                }
                updatePatientCard(storage.getCurrentPatient());
                renderPatientDetail();
            }
        });
    });

    // PDF export
    timeline.querySelectorAll('.export-pdf').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportAssessmentPDF(patient.id, btn.dataset.id);
        });
    });

    // Photo thumbnails
    timeline.querySelectorAll('.pd-posture-thumb').forEach(img => {
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            showPhotoModal(img.src);
        });
    });

    // Compare checkboxes
    timeline.querySelectorAll('.compare-check').forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                compareSelections.add(cb.dataset.id);
            } else {
                compareSelections.delete(cb.dataset.id);
            }
            const compareBtn = document.getElementById('btn-compare-assessments');
            compareBtn.style.display = compareSelections.size === 2 ? 'inline-flex' : 'none';
        });
    });

    // Exercise recommendation: toggle & video click
    timeline.querySelectorAll('[data-toggle-rec]').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.closest('.pd-rec-section');
            if (section) section.classList.toggle('collapsed');
        });
    });

    timeline.querySelectorAll('.pd-rec-exercise').forEach(item => {
        item.addEventListener('click', () => {
            const name = item.dataset.exercise;
            const videoId = item.dataset.videoId;
            const difficulty = item.dataset.difficulty;
            if (window.openExerciseVideo) {
                window.openExerciseVideo(name, videoId, difficulty);
            }
        });
    });
}

function loadAssessment(patientId, assessmentId) {
    const assessment = storage.getAssessment(patientId, assessmentId);
    if (!assessment) return;

    setLoadedAssessmentId(assessmentId);

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');
    restoreAssessmentHighlights(assessment);
}

function continueAssessment(patientId, assessmentId) {
    const assessment = storage.getAssessment(patientId, assessmentId);
    if (!assessment) return;

    setCurrentAssessment(assessment);
    setAssessmentMode(true);
    setLoadedAssessmentId(assessmentId);

    const patient = storage.getPatient(patientId);
    if (patient) fillMissingRegionsWithNormal(patient);

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');
    document.getElementById('assessment-banner').style.display = 'flex';
    restoreAssessmentHighlights(assessment);
    showRegionPanelIfMapped();
}

// ======== Assessment Comparison ========

export function doCompareAssessments() {
    const compareSelections = getCompareSelections();
    if (compareSelections.size !== 2) return;
    const patient = storage.getPatient(getCurrentDetailPatientId());
    if (!patient) return;

    const [id1, id2] = [...compareSelections];
    const a1 = storage.getAssessment(patient.id, id1);
    const a2 = storage.getAssessment(patient.id, id2);
    if (!a1 || !a2) return;

    const [older, newer] = a1.date <= a2.date ? [a1, a2] : [a2, a1];

    const mapOlder = {};
    for (const s of (older.selections || [])) {
        if (s.meshId) mapOlder[s.meshId] = { severity: s.severity, region: s.region || s.meshId };
    }
    const mapNewer = {};
    for (const s of (newer.selections || [])) {
        if (s.meshId) mapNewer[s.meshId] = { severity: s.severity, region: s.region || s.meshId };
    }

    const sevOrder = { normal: 0, mild: 1, moderate: 2, severe: 3 };
    const allMeshIds = new Set([...Object.keys(mapOlder), ...Object.keys(mapNewer)]);

    const items = [];
    for (const meshId of allMeshIds) {
        const o = mapOlder[meshId];
        const n = mapNewer[meshId];
        const region = (n && n.region) || (o && o.region) || meshId;

        if (o && n) {
            const oldVal = sevOrder[o.severity] ?? -1;
            const newVal = sevOrder[n.severity] ?? -1;
            let change = 'unchanged';
            if (newVal < oldVal) change = 'improved';
            else if (newVal > oldVal) change = 'worsened';
            items.push({ region, oldSev: o.severity, newSev: n.severity, change });
        } else if (n && !o) {
            items.push({ region, oldSev: null, newSev: n.severity, change: 'new' });
        } else if (o && !n) {
            items.push({ region, oldSev: o.severity, newSev: null, change: 'removed' });
        }
    }

    const olderDate = new Date(older.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    const newerDate = new Date(newer.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });

    const container = document.getElementById('comparison-container');
    container.style.display = 'grid';
    container.innerHTML = `
        <div class="comparison-column" style="grid-column: 1 / -1;">
            <div class="comparison-header">${olderDate} vs ${newerDate} 비교</div>
            ${items.length === 0 ? '<p style="color:var(--text-tertiary); font-size:13px;">비교할 부위가 없습니다.</p>' : ''}
            ${items.map(item => {
                const label = escapeHtml(item.region);
                const oldLabel = item.oldSev ? SEV_LABELS[item.oldSev] : '-';
                const newLabel = item.newSev ? SEV_LABELS[item.newSev] : '-';
                let cls = 'comparison-unchanged';
                let arrow = '→';
                if (item.change === 'improved') { cls = 'comparison-improved'; arrow = '↓'; }
                else if (item.change === 'worsened') { cls = 'comparison-worsened'; arrow = '↑'; }
                else if (item.change === 'new') { cls = 'comparison-new'; arrow = '+'; }
                else if (item.change === 'removed') { cls = 'comparison-unchanged'; arrow = '-'; }
                return `
                    <div class="comparison-item">
                        <span>${label}</span>
                        <span class="${cls}">${oldLabel} ${arrow} ${newLabel}</span>
                    </div>
                `;
            }).join('')}
            <div class="comparison-close">
                <button class="btn-secondary btn-sm-pad" id="btn-close-comparison">닫기</button>
            </div>
        </div>
    `;

    document.getElementById('btn-close-comparison').addEventListener('click', () => {
        container.style.display = 'none';
    });
}

// ======== Trend Chart ========

function renderTrendChart(patient) {
    const section = document.getElementById('trend-chart-section');
    const canvas = document.getElementById('trend-chart');
    if (!section || !canvas) {
        if (section) section.style.display = 'none';
        return;
    }

    const assessments = patient.assessments || [];
    if (assessments.length < 2) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    const sorted = [...assessments].sort((a, b) => a.date - b.date);
    const labels = sorted.map(a => new Date(a.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }));

    function avgScore(assessment) {
        const sels = assessment.selections || [];
        if (sels.length === 0) return 0;
        let sum = 0;
        for (const s of sels) {
            sum += { normal: 0, mild: 1, moderate: 1.5, severe: 2 }[s.severity] || 0;
        }
        return Math.round((sum / sels.length) * 100) / 100;
    }

    const avgData = sorted.map(avgScore);

    const regionScoreMap = {};
    for (const a of sorted) {
        for (const s of (a.selections || [])) {
            const key = s.regionKey || s.region || s.meshId;
            if (!key) continue;
            if (!regionScoreMap[key]) regionScoreMap[key] = [];
        }
    }
    for (const key of Object.keys(regionScoreMap)) {
        for (const a of sorted) {
            const sel = (a.selections || []).find(s => (s.regionKey || s.region || s.meshId) === key);
            regionScoreMap[key].push(sel ? ({ normal: 0, mild: 1, moderate: 1.5, severe: 2 }[sel.severity] || 0) : 0);
        }
    }

    const topRegions = Object.entries(regionScoreMap)
        .map(([key, scores]) => ({ key, maxScore: Math.max(...scores), scores }))
        .filter(r => r.maxScore > 0)
        .sort((a, b) => b.maxScore - a.maxScore)
        .slice(0, 3);

    const regionColors = ['#29B6F6', '#FF7043', '#AB47BC'];

    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    const datasets = [
        {
            label: '전체 평균',
            data: avgData,
            borderColor: '#4A7C6F',
            backgroundColor: 'rgba(74, 124, 111, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
        },
        ...topRegions.map((r, i) => ({
            label: regionKeyToLabel(r.key),
            data: r.scores,
            borderColor: regionColors[i],
            borderWidth: 1.5,
            borderDash: [4, 4],
            fill: false,
            tension: 0.3,
            pointRadius: 2,
        })),
    ];

    trendChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 2.2,
                    ticks: {
                        callback: (v) => ({ 0: '정상', 1: '경도', 2: '중증' }[v] || ''),
                        stepSize: 1,
                    },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                },
                x: {
                    grid: { display: false },
                },
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 11 } },
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const score = ctx.parsed.y;
                            const label = score <= 0.3 ? '정상' : score <= 1.2 ? '경도' : '중증';
                            return `${ctx.dataset.label}: ${label} (${score})`;
                        },
                    },
                },
            },
        },
    });
}
