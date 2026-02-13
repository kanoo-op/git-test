// ReportPanel.js - Report generation view

import * as storage from '../services/Storage.js';
import { SEV_LABELS, SEV_COLORS, GENDER_LABELS, PROGRESS_LABELS, calculateAge, severityRank, regionSortIndex, escapeHtml } from '../utils/helpers.js';
import { exportAssessmentPDF, exportProgressPDF, exportReferralPDF } from '../patients/PdfExport.js';

let currentReportType = null;
let progressChartInstance = null;

export function initReportPanel() {
    renderPatientSelector();
    bindCardEvents();
    autoSelectCurrentPatient();
}

export function refreshReportPanel() {
    const prevValue = document.getElementById('rpt-patient-select')?.value || '';
    renderPatientSelector();
    const select = document.getElementById('rpt-patient-select');
    if (select) {
        const option = [...select.options].find(o => o.value === prevValue);
        if (option && prevValue) {
            select.value = prevValue;
        } else {
            autoSelectCurrentPatient();
        }
    }

    // Re-render active report detail with fresh data
    if (currentReportType) {
        const activeCard = document.querySelector(`.rpt-type-card[data-type="${currentReportType}"]`);
        if (activeCard) {
            onReportSelect(currentReportType, activeCard);
        }
    }
}

// ── Patient Selector ──

function renderPatientSelector() {
    const select = document.getElementById('rpt-patient-select');
    if (!select) return;

    const patients = storage.getPatients();
    select.innerHTML = '<option value="">환자를 선택하세요</option>';
    for (const p of patients) {
        const opt = document.createElement('option');
        opt.value = p.id;
        const age = p.dob ? calculateAge(p.dob) + '세' : '';
        opt.textContent = `${p.name}${age ? ' (' + age + ')' : ''}`;
        select.appendChild(opt);
    }

    select.addEventListener('change', () => {
        const detail = document.getElementById('rpt-detail');
        if (detail) detail.innerHTML = '';
        clearActiveCards();
        currentReportType = null;
    });
}

function autoSelectCurrentPatient() {
    const current = storage.getCurrentPatient();
    if (!current) return;
    const select = document.getElementById('rpt-patient-select');
    if (select) select.value = current.id;
}

function getSelectedPatient() {
    const select = document.getElementById('rpt-patient-select');
    if (!select || !select.value) return null;
    return storage.getPatient(select.value);
}

// ── Card Events ──

function clearActiveCards() {
    document.querySelectorAll('.rpt-type-card').forEach(c => c.classList.remove('rpt-card-active'));
}

function bindCardEvents() {
    const cards = document.querySelectorAll('.rpt-type-card');
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const type = card.dataset.type;
            if (!type) return;
            onReportSelect(type, card);
        });
    });
}

function onReportSelect(type, card) {
    const patient = getSelectedPatient();
    if (!patient) {
        window.showToast?.('환자를 먼저 선택하세요.', 'warning');
        return;
    }

    clearActiveCards();
    card.classList.add('rpt-card-active');
    currentReportType = type;

    const detail = document.getElementById('rpt-detail');
    if (!detail) return;

    switch (type) {
        case 'assessment':
            renderAssessmentReport(patient, detail);
            break;
        case 'progress':
            renderProgressReport(patient, detail);
            break;
        case 'referral':
            renderReferralReport(patient, detail);
            break;
    }
}

// ── Assessment Report ──

function renderAssessmentReport(patient, container) {
    const assessments = (patient.assessments || []).slice().sort((a, b) => b.date - a.date);

    if (assessments.length === 0) {
        container.innerHTML = `<div class="rpt-empty">이 환자의 평가 기록이 없습니다.</div>`;
        return;
    }

    container.innerHTML = `
        <div class="rpt-section">
            <div class="rpt-section-header">
                <h3>자세분석 리포트</h3>
                <div class="rpt-controls">
                    <select id="rpt-assess-select" class="rpt-select">
                        ${assessments.map(a => `<option value="${a.id}">${new Date(a.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}${a.summary ? ' - ' + escapeHtml(a.summary) : ''}</option>`).join('')}
                    </select>
                    <button class="btn-primary btn-sm-pad" id="rpt-assess-pdf">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        PDF 다운로드
                    </button>
                </div>
            </div>
            <div id="rpt-assess-preview" class="rpt-preview"></div>
        </div>
    `;

    const select = document.getElementById('rpt-assess-select');
    const renderPreview = () => {
        const assessment = patient.assessments.find(a => a.id === select.value);
        if (assessment) renderAssessmentPreview(patient, assessment);
    };
    select.addEventListener('change', renderPreview);
    renderPreview();

    document.getElementById('rpt-assess-pdf').addEventListener('click', () => {
        exportAssessmentPDF(patient.id, select.value);
    });
}

function renderAssessmentPreview(patient, assessment) {
    const preview = document.getElementById('rpt-assess-preview');
    if (!preview) return;

    const selections = assessment.selections || [];
    const uniqueSelections = new Map();
    for (const s of selections) {
        const key = s.region || s.regionKey || s.meshId;
        if (!uniqueSelections.has(key) || severityRank(s.severity) > severityRank(uniqueSelections.get(key).severity)) {
            uniqueSelections.set(key, s);
        }
    }

    const sevCounts = { normal: 0, mild: 0, moderate: 0, severe: 0 };
    for (const [, s] of uniqueSelections) {
        if (sevCounts[s.severity] !== undefined) sevCounts[s.severity]++;
    }

    const soap = assessment.soapNotes;
    const pa = assessment.postureAnalysis;

    let html = `
        <div class="rpt-info-grid">
            <div class="rpt-info-item"><span class="rpt-label">환자</span><span>${escapeHtml(patient.name)}</span></div>
            <div class="rpt-info-item"><span class="rpt-label">평가일</span><span>${new Date(assessment.date).toLocaleDateString('ko-KR')}</span></div>
            <div class="rpt-info-item"><span class="rpt-label">진단</span><span>${escapeHtml(patient.diagnosis || '-')}</span></div>
            <div class="rpt-info-item"><span class="rpt-label">부위 수</span><span>${uniqueSelections.size}개</span></div>
        </div>
    `;

    // Severity distribution
    if (uniqueSelections.size > 0) {
        html += `<div class="rpt-sev-dist">`;
        for (const [key, label] of Object.entries(SEV_LABELS)) {
            if (sevCounts[key] > 0) {
                html += `<span class="rpt-sev-tag" style="background:${SEV_COLORS[key]}; color:#fff;">${label}: ${sevCounts[key]}</span>`;
            }
        }
        html += `</div>`;
    }

    // Severity table (sorted by body region order)
    if (uniqueSelections.size > 0) {
        const sortedSelections = [...uniqueSelections.values()].sort(
            (a, b) => regionSortIndex(a.region || a.meshId) - regionSortIndex(b.region || b.meshId)
        );
        html += `<table class="rpt-table">
            <thead><tr><th>부위</th><th>조직</th><th>심각도</th><th>메모</th></tr></thead>
            <tbody>`;
        for (const s of sortedSelections) {
            html += `<tr>
                <td>${escapeHtml(s.region || s.meshId || '-')}</td>
                <td>${escapeHtml(s.tissue || '-')}</td>
                <td><span class="rpt-sev-tag" style="background:${SEV_COLORS[s.severity] || 'var(--text-tertiary)'}; color:#fff;">${SEV_LABELS[s.severity] || s.severity || '-'}</span></td>
                <td>${escapeHtml(s.notes || '-')}</td>
            </tr>`;
        }
        html += `</tbody></table>`;
    }

    // SOAP summary
    if (soap) {
        html += `<div class="rpt-soap-summary">`;
        const soapSections = [
            { key: 'subjective', label: 'S', fields: ['chiefComplaint', 'symptomDescription'] },
            { key: 'objective', label: 'O', fields: ['autoFindings', 'rom', 'specialTests'] },
            { key: 'assessment', label: 'A', fields: ['clinicalImpression', 'progressLevel'] },
            { key: 'plan', label: 'P', fields: ['treatment', 'hep', 'frequency'] },
        ];
        for (const sec of soapSections) {
            const data = soap[sec.key];
            if (!data) continue;
            const values = sec.fields.map(f => data[f]).filter(Boolean);
            if (values.length === 0) continue;
            html += `<div class="rpt-soap-item">
                <span class="rpt-soap-label">${sec.label}</span>
                <span>${values.map(v => sec.key === 'assessment' && sec.fields.indexOf('progressLevel') >= 0 && v === data.progressLevel ? (PROGRESS_LABELS[v] || v) : escapeHtml(String(v))).join(' · ')}</span>
            </div>`;
        }
        html += `</div>`;
    }

    // Posture analysis metrics
    if (pa && pa.metrics) {
        const m = pa.metrics;
        html += `<div class="rpt-metrics">
            <h4>자세 분석</h4>
            <div class="rpt-metrics-grid">`;
        if (m.forwardHead) html += `<div class="rpt-metric"><span class="rpt-label">전방 두부</span><span>${m.forwardHead.value}°</span></div>`;
        if (m.shoulderDiff) html += `<div class="rpt-metric"><span class="rpt-label">어깨 높이차</span><span>${m.shoulderDiff.value}cm</span></div>`;
        if (m.pelvicTilt) html += `<div class="rpt-metric"><span class="rpt-label">골반 기울기</span><span>${m.pelvicTilt.value}°</span></div>`;
        if (m.trunkTilt) html += `<div class="rpt-metric"><span class="rpt-label">체간 기울기</span><span>${m.trunkTilt.value}°</span></div>`;
        html += `</div></div>`;
    }

    preview.innerHTML = html;
}

// ── Progress Report ──

function renderProgressReport(patient, container) {
    const assessments = (patient.assessments || []).slice().sort((a, b) => a.date - b.date);

    if (assessments.length === 0) {
        container.innerHTML = `<div class="rpt-empty">이 환자의 평가 기록이 없습니다.</div>`;
        return;
    }

    const first = assessments[0];
    const last = assessments[assessments.length - 1];
    const firstDate = new Date(first.date).toLocaleDateString('ko-KR');
    const lastDate = new Date(last.date).toLocaleDateString('ko-KR');
    const daysBetween = Math.round((last.date - first.date) / (1000 * 60 * 60 * 24));

    // Build region severity comparison
    const firstSevMap = buildSeverityMap(first);
    const lastSevMap = buildSeverityMap(last);
    const allRegions = new Set([...firstSevMap.keys(), ...lastSevMap.keys()]);

    let improved = 0, worsened = 0, unchanged = 0;
    for (const region of allRegions) {
        const firstRank = severityRank(firstSevMap.get(region) || 'normal');
        const lastRank = severityRank(lastSevMap.get(region) || 'normal');
        if (lastRank < firstRank) improved++;
        else if (lastRank > firstRank) worsened++;
        else unchanged++;
    }

    container.innerHTML = `
        <div class="rpt-section">
            <div class="rpt-section-header">
                <h3>경과 리포트</h3>
                <button class="btn-primary btn-sm-pad" id="rpt-progress-pdf">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    PDF 다운로드
                </button>
            </div>

            <div class="rpt-info-grid">
                <div class="rpt-info-item"><span class="rpt-label">환자</span><span>${escapeHtml(patient.name)}</span></div>
                <div class="rpt-info-item"><span class="rpt-label">평가 기간</span><span>${firstDate} ~ ${lastDate}</span></div>
                <div class="rpt-info-item"><span class="rpt-label">총 평가 횟수</span><span>${assessments.length}회</span></div>
                <div class="rpt-info-item"><span class="rpt-label">경과 일수</span><span>${daysBetween}일</span></div>
            </div>

            <div class="rpt-change-summary">
                <span class="rpt-change-tag rpt-change-improved">호전 ${improved}</span>
                <span class="rpt-change-tag rpt-change-unchanged">유지 ${unchanged}</span>
                <span class="rpt-change-tag rpt-change-worsened">악화 ${worsened}</span>
            </div>

            ${assessments.length >= 2 ? `
            <div class="rpt-chart-wrap">
                <canvas id="rpt-trend-canvas"></canvas>
            </div>` : '<div class="rpt-empty">추이 차트를 표시하려면 2건 이상의 평가가 필요합니다.</div>'}

            ${allRegions.size > 0 ? renderSeverityComparisonTable(firstSevMap, lastSevMap, allRegions) : ''}
        </div>
    `;

    document.getElementById('rpt-progress-pdf').addEventListener('click', () => {
        exportProgressPDF(patient.id);
    });

    if (assessments.length >= 2) {
        renderProgressChart(assessments);
    }
}

function buildSeverityMap(assessment) {
    const map = new Map();
    for (const s of (assessment.selections || [])) {
        const key = s.region || s.meshId || s.regionKey;
        if (!key) continue;
        if (!map.has(key) || severityRank(s.severity) > severityRank(map.get(key))) {
            map.set(key, s.severity);
        }
    }
    return map;
}

function renderSeverityComparisonTable(firstMap, lastMap, allRegions) {
    const sortedRegions = [...allRegions].sort(
        (a, b) => regionSortIndex(a) - regionSortIndex(b)
    );
    let html = `<table class="rpt-table rpt-compare-table">
        <thead><tr><th>부위</th><th>첫 평가</th><th>최근 평가</th><th>변화</th></tr></thead>
        <tbody>`;
    for (const region of sortedRegions) {
        const firstSev = firstMap.get(region) || 'normal';
        const lastSev = lastMap.get(region) || 'normal';
        const firstRank = severityRank(firstSev);
        const lastRank = severityRank(lastSev);
        let changeIcon = '→';
        let changeClass = 'rpt-change-unchanged';
        if (lastRank < firstRank) { changeIcon = '↓ 호전'; changeClass = 'rpt-change-improved'; }
        else if (lastRank > firstRank) { changeIcon = '↑ 악화'; changeClass = 'rpt-change-worsened'; }

        html += `<tr>
            <td>${escapeHtml(region)}</td>
            <td><span class="rpt-sev-tag" style="background:${SEV_COLORS[firstSev]}; color:#fff;">${SEV_LABELS[firstSev]}</span></td>
            <td><span class="rpt-sev-tag" style="background:${SEV_COLORS[lastSev]}; color:#fff;">${SEV_LABELS[lastSev]}</span></td>
            <td><span class="${changeClass}">${changeIcon}</span></td>
        </tr>`;
    }
    html += `</tbody></table>`;
    return html;
}

async function renderProgressChart(assessments) {
    const canvas = document.getElementById('rpt-trend-canvas');
    if (!canvas) return;

    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

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

    // Top regions
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

    if (progressChartInstance) {
        progressChartInstance.destroy();
    }

    progressChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
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
                    label: r.key,
                    data: r.scores,
                    borderColor: regionColors[i],
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    fill: false,
                    tension: 0.3,
                    pointRadius: 2,
                })),
            ],
        },
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
                x: { grid: { display: false } },
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

// ── Referral Report ──

function renderReferralReport(patient, container) {
    const assessments = (patient.assessments || []).slice().sort((a, b) => b.date - a.date);
    const latest = assessments[0];

    let sevSummary = '-';
    if (latest) {
        const sevMap = buildSeverityMap(latest);
        const counts = { normal: 0, mild: 0, moderate: 0, severe: 0 };
        for (const [, sev] of sevMap) {
            if (counts[sev] !== undefined) counts[sev]++;
        }
        sevSummary = Object.entries(SEV_LABELS)
            .filter(([k]) => counts[k] > 0)
            .map(([k, label]) => `${label} ${counts[k]}`)
            .join(', ') || '-';
    }

    const age = patient.dob ? calculateAge(patient.dob) + '세' : '-';

    container.innerHTML = `
        <div class="rpt-section">
            <div class="rpt-section-header">
                <h3>의뢰 리포트</h3>
                <button class="btn-primary btn-sm-pad" id="rpt-referral-pdf">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    PDF 다운로드
                </button>
            </div>

            <div class="rpt-info-grid">
                <div class="rpt-info-item"><span class="rpt-label">환자명</span><span>${escapeHtml(patient.name)}</span></div>
                <div class="rpt-info-item"><span class="rpt-label">나이</span><span>${age}</span></div>
                <div class="rpt-info-item"><span class="rpt-label">성별</span><span>${GENDER_LABELS[patient.gender] || patient.gender || '-'}</span></div>
                <div class="rpt-info-item"><span class="rpt-label">진단</span><span>${escapeHtml(patient.diagnosis || '-')}</span></div>
            </div>

            ${latest ? `<div class="rpt-info-grid">
                <div class="rpt-info-item"><span class="rpt-label">최근 평가일</span><span>${new Date(latest.date).toLocaleDateString('ko-KR')}</span></div>
                <div class="rpt-info-item"><span class="rpt-label">심각도 분포</span><span>${sevSummary}</span></div>
                <div class="rpt-info-item"><span class="rpt-label">총 평가 횟수</span><span>${assessments.length}회</span></div>
            </div>` : '<div class="rpt-empty">평가 기록이 없습니다.</div>'}

            <div class="rpt-form">
                <div class="rpt-form-group">
                    <label for="rpt-referral-purpose">의뢰 목적</label>
                    <textarea id="rpt-referral-purpose" class="rpt-textarea" rows="3" placeholder="의뢰 사유를 입력하세요 (예: 정밀 검사 의뢰, 수술적 치료 검토 등)"></textarea>
                </div>
                <div class="rpt-form-group">
                    <label for="rpt-referral-dest">의뢰처</label>
                    <input id="rpt-referral-dest" class="rpt-input" type="text" placeholder="의뢰 기관/의사명 (예: OO병원 정형외과)">
                </div>
            </div>
        </div>
    `;

    document.getElementById('rpt-referral-pdf').addEventListener('click', () => {
        const purpose = document.getElementById('rpt-referral-purpose')?.value || '';
        const destination = document.getElementById('rpt-referral-dest')?.value || '';
        if (!purpose.trim()) {
            window.showToast?.('의뢰 목적을 입력하세요.', 'warning');
            return;
        }
        exportReferralPDF(patient.id, { purpose, destination });
    });
}
