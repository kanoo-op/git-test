// panels.js - Dashboard, patient management, assessments, context panel, mapping editor

import * as storage from './storage.js';
import { highlightMesh, unhighlightMesh, clearAllHighlights, getHighlightState, restoreHighlightState, deselectCurrentMesh, selectMesh, applyRegionColors, resetRegionColors } from './highlights.js';
import { getMeshByName } from './viewer.js';
import {
    getRegion, getTissueName,
    addRegion, deleteRegion, addMeshToRegion, removeMeshFromRegion,
    getMappingRegions, exportMappingJson, getMeshRegionKey, getAllRegionKeysWithLabels,
    getRegionColor, ensureMapping, loadMapping, regionKeyToLabel,
    getRegionMeshNames, hasMappingLoaded,
    PREDEFINED_REGIONS, REGION_GROUPS
} from './regions.js';
import { updatePatientCard, renderMappingStatus } from './sidebar.js';

let currentView = 'dashboard';
let assessmentMode = false;
let currentAssessment = null;
let selectedMesh = null;
let loadedAssessmentId = null;
let editingPatientId = null;
let currentDetailPatientId = null;

// Comparison state
let compareSelections = new Set();

// Mapping editor state
let mappingEditorActive = false;
let assignMode = false;
let selectedRegionKey = null;

const SEV_LABELS = { normal: '정상', mild: '경도', moderate: '중등도', severe: '중증' };
const SEV_COLORS = {
    normal: 'var(--status-normal)', mild: 'var(--status-mild)',
    moderate: 'var(--status-moderate)', severe: 'var(--status-severe)'
};
const GENDER_LABELS = { male: '남성', female: '여성', other: '기타' };

/**
 * Initialize panel interactions
 */
export function initPanels() {
    // Context panel close
    document.getElementById('btn-close-context').addEventListener('click', closeContextPanel);

    // Patient form
    document.getElementById('btn-new-patient').addEventListener('click', showNewPatientForm);
    document.getElementById('btn-save-patient').addEventListener('click', savePatient);
    document.getElementById('btn-cancel-patient').addEventListener('click', hidePatientForm);

    // Assessment
    document.getElementById('btn-end-assessment').addEventListener('click', showEndAssessmentModal);

    // End assessment modal
    document.getElementById('btn-confirm-end-assessment').addEventListener('click', confirmEndAssessment);
    document.getElementById('btn-cancel-end-assessment').addEventListener('click', hideEndAssessmentModal);

    // Save selection note
    document.getElementById('btn-save-selection').addEventListener('click', saveSelectionNote);

    // Severity change → immediate color update
    document.getElementById('select-severity').addEventListener('change', onSeverityChange);

    // Patient search & sort
    document.getElementById('input-patient-search').addEventListener('input', () => {
        if (currentView === 'patients') renderPatientsList();
    });
    document.getElementById('select-patient-sort').addEventListener('change', () => {
        if (currentView === 'patients') renderPatientsList();
    });

    // Patient detail buttons
    document.getElementById('btn-back-to-patients').addEventListener('click', () => switchView('patients'));
    document.getElementById('btn-edit-patient-detail').addEventListener('click', () => {
        if (currentDetailPatientId) {
            switchView('patients');
            showEditPatientForm(currentDetailPatientId);
        }
    });
    document.getElementById('btn-export-patient').addEventListener('click', () => {
        if (currentDetailPatientId) storage.exportPatientData(currentDetailPatientId);
    });
    document.getElementById('btn-print-patient').addEventListener('click', () => window.print());
    document.getElementById('btn-new-assessment-detail').addEventListener('click', startNewAssessment);
    document.getElementById('btn-compare-assessments').addEventListener('click', doCompareAssessments);

    // --- Region Assessment Panel ---
    document.getElementById('btn-toggle-region-panel').addEventListener('click', toggleRegionPanel);
    document.getElementById('btn-close-region-panel').addEventListener('click', () => {
        document.getElementById('region-assessment-panel').style.display = 'none';
    });

    // --- Mapping Editor ---
    document.getElementById('btn-add-region').addEventListener('click', showNewRegionForm);
    document.getElementById('btn-save-region').addEventListener('click', saveNewRegion);
    document.getElementById('btn-cancel-region').addEventListener('click', hideNewRegionForm);
    document.getElementById('btn-start-assign').addEventListener('click', startAssignMode);
    document.getElementById('btn-stop-assign').addEventListener('click', stopAssignMode);
    document.getElementById('btn-delete-region').addEventListener('click', deleteSelectedRegion);
    document.getElementById('btn-export-mapping').addEventListener('click', exportMapping);
    initMappingImportButtons();

    // Load current patient
    const patient = storage.getCurrentPatient();
    if (patient) {
        updatePatientCard(patient);
    }
}

/**
 * Switch between views
 */
export function switchView(view) {
    currentView = view;

    if (view !== 'mapping' && assignMode) stopAssignMode();

    // Hide all views
    document.getElementById('viewer-container').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('patients-view').style.display = 'none';
    document.getElementById('patient-detail-view').style.display = 'none';
    document.getElementById('mapping-editor').style.display = 'none';

    mappingEditorActive = false;

    switch (view) {
        case 'dashboard':
            document.getElementById('dashboard-view').style.display = 'block';
            renderDashboard();
            break;
        case 'viewer':
            document.getElementById('viewer-container').style.display = 'block';
            break;
        case 'patients':
            document.getElementById('patients-view').style.display = 'block';
            renderPatientsList();
            break;
        case 'patient-detail':
            document.getElementById('patient-detail-view').style.display = 'block';
            renderPatientDetail();
            break;
        case 'mapping':
            document.getElementById('viewer-container').style.display = 'block';
            document.getElementById('mapping-editor').style.display = 'flex';
            mappingEditorActive = true;
            renderMappingEditor();
            break;
    }
}

// ======== Dashboard ========

function renderDashboard() {
    const stats = storage.getDashboardStats();

    document.getElementById('stat-total-patients').textContent = stats.totalPatients;
    document.getElementById('stat-total-assessments').textContent = stats.totalAssessments;
    document.getElementById('stat-today-assessments').textContent = stats.todayAssessments;

    // Severity distribution bars
    const distEl = document.getElementById('severity-distribution');
    const maxCount = Math.max(...Object.values(stats.severityCounts), 1);
    distEl.innerHTML = Object.entries(stats.severityCounts).map(([key, count]) => `
        <div class="severity-bar-item">
            <span class="severity-bar-count" style="color:${SEV_COLORS[key]}">${count}</span>
            <div class="severity-bar-fill" style="height:${Math.max((count / maxCount) * 70, 4)}px; background:${SEV_COLORS[key]}"></div>
            <span class="severity-bar-label">${SEV_LABELS[key]}</span>
        </div>
    `).join('');

    // Recent patients
    const rpList = document.getElementById('recent-patients-list');
    if (stats.recentPatients.length === 0) {
        rpList.innerHTML = '<div class="empty-state" style="padding:20px;"><p>아직 환자가 없습니다.</p></div>';
    } else {
        rpList.innerHTML = stats.recentPatients.map(p => {
            const lastDate = p.assessments.length > 0
                ? new Date(Math.max(...p.assessments.map(a => a.date))).toLocaleDateString('ko-KR')
                : '-';
            return `
                <div class="recent-patient-card" data-patient-id="${p.id}">
                    <div>
                        <div class="recent-card-name">${escapeHtml(p.name)}</div>
                        <div class="recent-card-meta">평가 ${p.assessments.length}건 | 마지막: ${lastDate}${p.diagnosis ? ' | ' + escapeHtml(p.diagnosis) : ''}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            `;
        }).join('');

        rpList.querySelectorAll('.recent-patient-card').forEach(card => {
            card.addEventListener('click', () => openPatientDetail(card.dataset.patientId));
        });
    }

    // Recent assessments
    const raList = document.getElementById('recent-assessments-list');
    if (stats.recentAssessments.length === 0) {
        raList.innerHTML = '<div class="empty-state" style="padding:20px;"><p>최근 평가가 없습니다.</p></div>';
    } else {
        raList.innerHTML = stats.recentAssessments.map(a => {
            const date = new Date(a.date).toLocaleDateString('ko-KR', {
                month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            return `
                <div class="recent-assessment-card" data-patient-id="${a.patientId}">
                    <div>
                        <div class="recent-card-name">${escapeHtml(a.patientName)}</div>
                        <div class="recent-card-meta">${date} | ${(a.selections || []).length}개 부위${a.summary ? ' | ' + escapeHtml(a.summary) : ''}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            `;
        }).join('');

        raList.querySelectorAll('.recent-assessment-card').forEach(card => {
            card.addEventListener('click', () => openPatientDetail(card.dataset.patientId));
        });
    }
}

// ======== Patient Detail ========

function openPatientDetail(patientId) {
    currentDetailPatientId = patientId;
    storage.setCurrentPatient(patientId);
    updatePatientCard(storage.getCurrentPatient());
    compareSelections.clear();

    // Update nav
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    // No nav item matches patient-detail, that's fine

    switchView('patient-detail');
}

function renderPatientDetail() {
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

    // Most frequent severity
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

    // Hide comparison
    document.getElementById('comparison-container').style.display = 'none';
    document.getElementById('btn-compare-assessments').style.display = 'none';
    compareSelections.clear();
}

function renderAssessmentTimeline(patient) {
    const timeline = document.getElementById('pd-assessments-timeline');
    const assessments = patient.assessments || [];

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

    // Sort newest first
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

        return `
            <div class="pd-timeline-item ${isLoaded ? 'active' : ''}" data-id="${a.id}">
                <div class="pd-timeline-dot"></div>
                <label class="pd-timeline-check">
                    <input type="checkbox" class="compare-check" data-id="${a.id}" ${isChecked ? 'checked' : ''}>
                </label>
                <div class="pd-timeline-date">
                    ${date}
                    ${isLoaded ? '<span class="viewing-badge">보는 중</span>' : ''}
                </div>
                <div class="pd-timeline-summary">
                    ${selections.length}개 부위 | ${a.summary ? escapeHtml(a.summary) : '요약 없음'}
                </div>
                <div class="pd-timeline-tags">
                    ${Object.entries(sevCounts).map(([sev, count]) =>
                        `<span class="severity-tag ${sev}">${SEV_LABELS[sev] || sev}: ${count}</span>`
                    ).join('')}
                </div>
                ${a.overallNotes ? `<div class="pd-timeline-notes">${escapeHtml(a.overallNotes)}</div>` : ''}
                <div class="pd-timeline-actions">
                    <button class="view-assessment" data-id="${a.id}">3D에서 보기</button>
                    <button class="continue-assessment" data-id="${a.id}">평가 계속하기</button>
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
                if (loadedAssessmentId === btn.dataset.id) {
                    resetRegionColors();
                    loadedAssessmentId = null;
                }
                updatePatientCard(storage.getCurrentPatient());
                renderPatientDetail();
            }
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
}

// ======== Assessment Comparison ========

function doCompareAssessments() {
    if (compareSelections.size !== 2) return;
    const patient = storage.getPatient(currentDetailPatientId);
    if (!patient) return;

    const [id1, id2] = [...compareSelections];
    const a1 = storage.getAssessment(patient.id, id1);
    const a2 = storage.getAssessment(patient.id, id2);
    if (!a1 || !a2) return;

    // Sort by date: older first
    const [older, newer] = a1.date <= a2.date ? [a1, a2] : [a2, a1];

    // Build severity maps
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

// --- Context Panel ---

export function openContextPanel(mesh, info) {
    selectedMesh = mesh;
    const panel = document.getElementById('context-panel');
    panel.classList.add('open');

    document.getElementById('detail-tissue').textContent = info.tissue;
    document.getElementById('detail-region').textContent = info.region;
    document.getElementById('detail-side').textContent = info.side;
    document.getElementById('detail-mesh-id').textContent = mesh.name || mesh.uuid.slice(0, 8);

    const sourceEl = document.getElementById('detail-source');
    const regionInfo = getRegion(mesh);
    if (regionInfo.source === 'mapping') {
        sourceEl.innerHTML = '<span class="source-badge mapping">JSON 매핑</span>';
    } else {
        sourceEl.innerHTML = '<span class="source-badge auto">자동 감지</span>';
    }

    document.getElementById('select-severity').value = 'normal';
    document.getElementById('input-mesh-notes').value = '';
    document.getElementById('check-concern').checked = false;
}

export function closeContextPanel() {
    const panel = document.getElementById('context-panel');
    panel.classList.remove('open');
    selectedMesh = null;
    deselectCurrentMesh();
}

function onSeverityChange() {
    if (!selectedMesh) return;
    const severity = document.getElementById('select-severity').value;

    deselectCurrentMesh();
    if (severity) {
        highlightMesh(selectedMesh, severity);
    } else {
        unhighlightMesh(selectedMesh);
    }
    selectMesh(selectedMesh);

    if (assessmentMode && currentAssessment) {
        const patient = storage.getCurrentPatient();
        if (patient) saveSelectionToAssessment(patient);
    }
}

function saveSelectionNote() {
    if (!selectedMesh) return;
    const severity = document.getElementById('select-severity').value;
    const concern = document.getElementById('check-concern').checked;

    if (concern && !severity) {
        deselectCurrentMesh();
        highlightMesh(selectedMesh, 'mild');
    }

    if (assessmentMode && currentAssessment) {
        const patient = storage.getCurrentPatient();
        if (patient) saveSelectionToAssessment(patient);
    }
    closeContextPanel();
}

function saveSelectionToAssessment(patient) {
    if (!selectedMesh || !currentAssessment) return;
    const severity = document.getElementById('select-severity').value;
    const notes = document.getElementById('input-mesh-notes').value;
    const concern = document.getElementById('check-concern').checked;
    const region = getRegion(selectedMesh);

    storage.addSelectionToAssessment(patient.id, currentAssessment.id, {
        meshId: selectedMesh.name || selectedMesh.uuid,
        tissue: getTissueName(selectedMesh.userData.tissueType),
        region: region.regionLabel,
        side: region.side,
        severity, notes, concern,
        timestamp: Date.now()
    });

    const hlState = getHighlightState();
    storage.saveHighlightState(patient.id, currentAssessment.id, hlState);
}

// --- Patient Management ---

function renderPatientsList() {
    const list = document.getElementById('patients-list');
    const searchQuery = document.getElementById('input-patient-search').value;
    const sortValue = document.getElementById('select-patient-sort').value;

    let patients = storage.searchPatients(searchQuery);

    // Parse sort
    const [sortBy, sortDir] = sortValue.split('-');
    patients = storage.sortPatients(patients, sortBy, sortDir === 'asc');

    if (patients.length === 0) {
        const isSearching = searchQuery.trim().length > 0;
        list.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
                <p>${isSearching ? '검색 결과가 없습니다.' : '등록된 환자가 없습니다. 새 환자를 등록해 주세요.'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = patients.map(p => {
        const age = p.dob ? calculateAge(p.dob) : '-';
        return `
            <div class="patient-card-item" data-patient-id="${p.id}">
                <div>
                    <div class="name">${escapeHtml(p.name)}</div>
                    <div class="meta">나이: ${age} | 평가: ${p.assessments?.length || 0}건${p.diagnosis ? ' | ' + escapeHtml(p.diagnosis) : ''}</div>
                </div>
                <div class="actions">
                    <button class="delete delete-patient" data-id="${p.id}">삭제</button>
                </div>
            </div>
        `;
    }).join('');

    // Click card → open detail
    list.querySelectorAll('.patient-card-item').forEach(card => {
        card.addEventListener('click', () => openPatientDetail(card.dataset.patientId));
    });

    // Delete
    list.querySelectorAll('.delete-patient').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('이 환자와 모든 평가 기록을 삭제하시겠습니까?')) {
                storage.deletePatient(btn.dataset.id);
                updatePatientCard(storage.getCurrentPatient());
                resetRegionColors();
                loadedAssessmentId = null;
                renderPatientsList();
            }
        });
    });
}

function showNewPatientForm() {
    editingPatientId = null;
    document.getElementById('patient-form').style.display = 'block';
    document.getElementById('patient-form-title').textContent = '새 환자 등록';
    document.getElementById('btn-save-patient').textContent = '저장';
    document.getElementById('input-patient-name').value = '';
    document.getElementById('input-patient-dob').value = '';
    document.getElementById('select-patient-gender').value = '';
    document.getElementById('input-patient-phone').value = '';
    document.getElementById('input-patient-email').value = '';
    document.getElementById('input-patient-diagnosis').value = '';
    document.getElementById('input-patient-history').value = '';
    document.getElementById('input-patient-occupation').value = '';
    document.getElementById('input-patient-notes').value = '';
    document.getElementById('input-patient-name').focus();
}

function showEditPatientForm(patientId) {
    const patient = storage.getPatient(patientId);
    if (!patient) return;

    editingPatientId = patientId;
    document.getElementById('patient-form').style.display = 'block';
    document.getElementById('patient-form-title').textContent = '환자 정보 수정';
    document.getElementById('btn-save-patient').textContent = '수정 저장';
    document.getElementById('input-patient-name').value = patient.name || '';
    document.getElementById('input-patient-dob').value = patient.dob || '';
    document.getElementById('select-patient-gender').value = patient.gender || '';
    document.getElementById('input-patient-phone').value = patient.phone || '';
    document.getElementById('input-patient-email').value = patient.email || '';
    document.getElementById('input-patient-diagnosis').value = patient.diagnosis || '';
    document.getElementById('input-patient-history').value = patient.medicalHistory || '';
    document.getElementById('input-patient-occupation').value = patient.occupation || '';
    document.getElementById('input-patient-notes').value = patient.notes || '';
    document.getElementById('input-patient-name').focus();
}

function hidePatientForm() {
    document.getElementById('patient-form').style.display = 'none';
    editingPatientId = null;
}

function savePatient() {
    const name = document.getElementById('input-patient-name').value.trim();
    if (!name) { document.getElementById('input-patient-name').focus(); return; }

    const patientData = {
        name,
        dob: document.getElementById('input-patient-dob').value,
        gender: document.getElementById('select-patient-gender').value,
        phone: document.getElementById('input-patient-phone').value.trim(),
        email: document.getElementById('input-patient-email').value.trim(),
        diagnosis: document.getElementById('input-patient-diagnosis').value.trim(),
        medicalHistory: document.getElementById('input-patient-history').value.trim(),
        occupation: document.getElementById('input-patient-occupation').value.trim(),
        notes: document.getElementById('input-patient-notes').value.trim(),
    };

    if (editingPatientId) {
        storage.updatePatient(editingPatientId, patientData);
        updatePatientCard(storage.getCurrentPatient());
    } else {
        const patient = storage.createPatient(patientData);
        storage.setCurrentPatient(patient.id);
        updatePatientCard(patient);
    }

    hidePatientForm();
    renderPatientsList();
}

// --- Assessment Management ---

/**
 * Fill regions that don't yet have a severity with 'normal' default
 */
function fillMissingRegionsWithNormal(patient) {
    if (!currentAssessment || !patient) return;

    // Find which regions already have severity set
    const setRegions = new Set();
    for (const sel of (currentAssessment.selections || [])) {
        if (sel.regionKey && sel.severity) setRegions.add(sel.regionKey);
    }

    const allRegions = getAllRegionKeysWithLabels();
    let changed = false;
    for (const r of allRegions) {
        if (setRegions.has(r.key)) continue;
        const meshNames = getRegionMeshNames(r.key);
        for (const meshName of meshNames) {
            const mesh = getMeshByName(meshName);
            if (!mesh) continue;
            const region = getRegion(mesh);
            storage.addSelectionToAssessment(patient.id, currentAssessment.id, {
                meshId: meshName,
                tissue: getTissueName(mesh.userData.tissueType),
                region: region.regionLabel,
                regionKey: r.key,
                side: region.side,
                severity: 'normal',
                notes: '',
                concern: false,
                timestamp: Date.now()
            });
            changed = true;
        }
    }
    if (changed) {
        currentAssessment = storage.getAssessment(patient.id, currentAssessment.id);
    }
}

/**
 * Set all mapped regions to 'normal' severity by default
 */
function setAllRegionsDefaultSeverity(patient) {
    if (!currentAssessment || !patient) return;

    const allRegions = getAllRegionKeysWithLabels();
    for (const r of allRegions) {
        const meshNames = getRegionMeshNames(r.key);
        for (const meshName of meshNames) {
            const mesh = getMeshByName(meshName);
            if (!mesh) continue;
            const region = getRegion(mesh);
            storage.addSelectionToAssessment(patient.id, currentAssessment.id, {
                meshId: meshName,
                tissue: getTissueName(mesh.userData.tissueType),
                region: region.regionLabel,
                regionKey: r.key,
                side: region.side,
                severity: 'normal',
                notes: '',
                concern: false,
                timestamp: Date.now()
            });
        }
    }
    // Re-read assessment to get updated selections
    currentAssessment = storage.getAssessment(patient.id, currentAssessment.id);
}

function startNewAssessment() {
    const patient = storage.getCurrentPatient();
    if (!patient) {
        alert('먼저 환자를 선택해 주세요.');
        return;
    }

    currentAssessment = storage.createAssessment(patient.id);
    assessmentMode = true;
    loadedAssessmentId = currentAssessment.id;

    // Default all mapped regions to 'normal' severity
    setAllRegionsDefaultSeverity(patient);

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');
    document.getElementById('assessment-banner').style.display = 'flex';
    refreshRegionColoring();
    showRegionPanelIfMapped();
}

function showEndAssessmentModal() {
    document.getElementById('end-assessment-overlay').style.display = 'flex';
    document.getElementById('input-overall-notes').value = '';
    document.getElementById('input-overall-notes').focus();
}

function hideEndAssessmentModal() {
    document.getElementById('end-assessment-overlay').style.display = 'none';
}

function confirmEndAssessment() {
    const overallNotes = document.getElementById('input-overall-notes').value.trim();

    if (currentAssessment) {
        const patient = storage.getCurrentPatient();
        if (patient) {
            const hlState = getHighlightState();
            storage.saveHighlightState(patient.id, currentAssessment.id, hlState);

            const updatedAssessment = storage.getAssessment(patient.id, currentAssessment.id);
            if (updatedAssessment) {
                const summary = storage.generateAssessmentSummary(updatedAssessment);
                storage.updateAssessment(patient.id, currentAssessment.id, {
                    summary,
                    overallNotes
                });
            }
        }
    }

    assessmentMode = false;
    currentAssessment = null;
    document.getElementById('assessment-banner').style.display = 'none';
    document.getElementById('region-assessment-panel').style.display = 'none';
    hideEndAssessmentModal();
}

function loadAssessment(patientId, assessmentId) {
    const assessment = storage.getAssessment(patientId, assessmentId);
    if (!assessment) return;

    loadedAssessmentId = assessmentId;

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');
    restoreAssessmentHighlights(assessment);
}

function continueAssessment(patientId, assessmentId) {
    const assessment = storage.getAssessment(patientId, assessmentId);
    if (!assessment) return;

    currentAssessment = assessment;
    assessmentMode = true;
    loadedAssessmentId = assessmentId;

    // Fill unset regions with 'normal' default
    const patient = storage.getPatient(patientId);
    if (patient) fillMissingRegionsWithNormal(patient);

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');
    document.getElementById('assessment-banner').style.display = 'flex';
    restoreAssessmentHighlights(assessment);
    showRegionPanelIfMapped();
}

function restoreAssessmentHighlights(assessment) {
    // Use vertex-level region coloring (v2 style)
    currentAssessment = assessment;
    refreshRegionColoring();
}

// ======== Region Assessment Panel ========

function showRegionPanelIfMapped() {
    if (hasMappingLoaded()) {
        document.getElementById('region-assessment-panel').style.display = 'flex';
        renderRegionAssessmentPanel();
    }
}

function toggleRegionPanel() {
    const panel = document.getElementById('region-assessment-panel');
    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'flex';
        renderRegionAssessmentPanel();
    } else {
        panel.style.display = 'none';
    }
}

function renderRegionAssessmentPanel() {
    const listEl = document.getElementById('region-assessment-list');
    const allRegions = getAllRegionKeysWithLabels();
    const regionMap = new Map(allRegions.map(r => [r.key, r]));

    if (allRegions.length === 0) {
        listEl.innerHTML = '<div class="rap-empty">매핑된 부위가 없습니다.<br>매핑 파일을 불러오거나 매핑 에디터에서 부위를 설정하세요.</div>';
        return;
    }

    // Build current severity map from assessment selections
    const regionSeverityMap = {};
    if (currentAssessment) {
        for (const sel of (currentAssessment.selections || [])) {
            if (sel.regionKey && sel.severity) {
                regionSeverityMap[sel.regionKey] = sel.severity;
            }
        }
        for (const sel of (currentAssessment.selections || [])) {
            if (sel.meshId && sel.severity && !sel.regionKey) {
                const rk = getMeshRegionKey(sel.meshId);
                if (rk && !regionSeverityMap[rk]) {
                    regionSeverityMap[rk] = sel.severity;
                }
            }
        }
    }

    const sevCounts = { normal: 0, mild: 0, moderate: 0, severe: 0 };

    // Helper to render a single region item
    function regionItemHtml(r) {
        const currentSev = regionSeverityMap[r.key] || '';
        if (currentSev && sevCounts.hasOwnProperty(currentSev)) sevCounts[currentSev]++;
        const dotColor = currentSev ? SEV_COLORS[currentSev] : 'var(--border-color)';
        const hasSev = currentSev ? 'has-severity' : '';
        return `
            <div class="rap-region-item ${hasSev}" data-region-key="${r.key}">
                <span class="rap-severity-dot" style="background:${dotColor}"></span>
                <div class="rap-region-info">
                    <div class="rap-region-name">${escapeHtml(r.label)}</div>
                    <div class="rap-region-meta">${r.meshCount}개 메쉬</div>
                </div>
                <select class="rap-severity-select" data-region-key="${r.key}">
                    <option value="normal" ${currentSev === 'normal' || !currentSev ? 'selected' : ''}>정상</option>
                    <option value="mild" ${currentSev === 'mild' ? 'selected' : ''}>경도</option>
                    <option value="moderate" ${currentSev === 'moderate' ? 'selected' : ''}>중등도</option>
                    <option value="severe" ${currentSev === 'severe' ? 'selected' : ''}>중증</option>
                </select>
            </div>
        `;
    }

    // Render grouped (anatomy-viewer-v2 style)
    let html = '';
    const rendered = new Set();

    for (const group of REGION_GROUPS) {
        const groupRegions = group.ids.map(id => regionMap.get(id)).filter(Boolean);
        if (groupRegions.length === 0) continue;
        html += `<div class="rap-group-header">${escapeHtml(group.name)}</div>`;
        for (const r of groupRegions) {
            html += regionItemHtml(r);
            rendered.add(r.key);
        }
    }

    // Custom regions
    const custom = allRegions.filter(r => !rendered.has(r.key));
    if (custom.length > 0) {
        html += `<div class="rap-group-header">기타</div>`;
        for (const r of custom) html += regionItemHtml(r);
    }

    listEl.innerHTML = html;

    // Add summary footer
    const totalEvaluated = Object.values(sevCounts).reduce((a, b) => a + b, 0);
    const summaryHtml = `
        <div class="rap-summary">
            <div class="rap-summary-title">평가 현황 (${totalEvaluated} / ${allRegions.length})</div>
            <div class="rap-summary-counts">
                ${Object.entries(SEV_LABELS).map(([key, label]) => `
                    <div class="rap-summary-item">
                        <span class="rap-severity-dot" style="width:8px;height:8px;background:${SEV_COLORS[key]}"></span>
                        <span>${label}</span>
                        <span class="count">${sevCounts[key]}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    let summaryEl = document.querySelector('.rap-summary');
    if (summaryEl) summaryEl.remove();
    listEl.insertAdjacentHTML('afterend', summaryHtml);

    // Bind events
    listEl.querySelectorAll('.rap-severity-select').forEach(select => {
        select.addEventListener('change', (e) => {
            e.stopPropagation();
            applyRegionSeverity(select.dataset.regionKey, select.value);
        });
    });

    listEl.querySelectorAll('.rap-region-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.tagName === 'SELECT') return;
            previewRegionMeshes(item.dataset.regionKey);
        });
    });
}

function applyRegionSeverity(regionKey, severity) {
    const meshNames = getRegionMeshNames(regionKey);
    const patient = storage.getCurrentPatient();
    if (!patient || !currentAssessment) return;

    const label = regionKeyToLabel(regionKey);

    for (const meshName of meshNames) {
        const mesh = getMeshByName(meshName);
        if (!mesh) continue;

        // Save selection per mesh
        const region = getRegion(mesh);
        storage.addSelectionToAssessment(patient.id, currentAssessment.id, {
            meshId: meshName,
            tissue: getTissueName(mesh.userData.tissueType),
            region: region.regionLabel,
            regionKey: regionKey,
            side: region.side,
            severity: severity || '',
            notes: '',
            concern: !!severity,
            timestamp: Date.now()
        });
    }

    // Re-read assessment to refresh selections
    currentAssessment = storage.getAssessment(patient.id, currentAssessment.id);

    // Apply vertex-level region coloring (v2 style: side + bounds filtering)
    refreshRegionColoring();

    // Refresh panel
    renderRegionAssessmentPanel();
}

/**
 * Rebuild and apply vertex-level region coloring from current assessment state.
 * Collects all regions with severity, builds activeRegions array with
 * side/bounds info, then calls applyRegionColors for vertex-level rendering.
 */
function refreshRegionColoring() {
    if (!currentAssessment) {
        resetRegionColors();
        return;
    }

    // Collect region severities from assessment selections
    const regionSeverityMap = {};
    for (const sel of (currentAssessment.selections || [])) {
        if (sel.regionKey && sel.severity) {
            regionSeverityMap[sel.regionKey] = sel.severity;
        }
    }

    // Build activeRegions array for vertex coloring (matching v2 format)
    const mappingRegions = getMappingRegions();
    const activeRegions = [];

    for (const [regionKey, sev] of Object.entries(regionSeverityMap)) {
        if (!sev || sev === '' || sev === 'normal') continue; // skip unset and normal (keep original color)

        const regionData = mappingRegions[regionKey] || {};
        const predefined = PREDEFINED_REGIONS.find(r => r.id === regionKey);
        const side = predefined ? predefined.side : null;

        activeRegions.push({
            side: side,
            xMin: regionData.xMin ?? null,
            xMax: regionData.xMax ?? null,
            yMin: regionData.yMin ?? null,
            yMax: regionData.yMax ?? null,
            meshes: regionData.meshes || [],
            severity: sev
        });
    }

    applyRegionColors(activeRegions);
}

function previewRegionMeshes(regionKey) {
    // Flash the region with vertex-level coloring, then revert to current state
    const mappingRegions = getMappingRegions();
    const regionData = mappingRegions[regionKey] || {};
    const predefined = PREDEFINED_REGIONS.find(r => r.id === regionKey);

    const preview = [{
        side: predefined ? predefined.side : null,
        xMin: regionData.xMin ?? null,
        xMax: regionData.xMax ?? null,
        yMin: regionData.yMin ?? null,
        yMax: regionData.yMax ?? null,
        meshes: regionData.meshes || [],
        severity: 'mild'
    }];

    applyRegionColors(preview);

    // Revert after 1 second
    setTimeout(() => refreshRegionColoring(), 1000);
}

export function isAssessmentMode() {
    return assessmentMode;
}

// --- Helpers ---

function calculateAge(dob) {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ======== Mapping Editor ========

export function isMappingAssignMode() {
    return assignMode;
}

export function isMappingEditorActive() {
    return mappingEditorActive;
}

export function getSelectedRegionKey() {
    return selectedRegionKey;
}

export function handleMappingAssign(mesh) {
    if (!assignMode || !selectedRegionKey || !mesh) return;
    const meshName = mesh.name;
    if (!meshName) return;

    addMeshToRegion(selectedRegionKey, meshName);
    persistMapping();
    renderRegionDetail();
    renderMappingEditor();

    highlightMesh(mesh, 'normal');
    setTimeout(() => unhighlightMesh(mesh), 400);
}

export function handleMappingRemove(mesh) {
    if (!assignMode || !mesh) return;
    const meshName = mesh.name;
    if (!meshName) return;

    const currentRegion = getMeshRegionKey(meshName);
    if (currentRegion) {
        removeMeshFromRegion(currentRegion, meshName);
        persistMapping();
        renderRegionDetail();
        renderMappingEditor();
    }
}

function renderMappingEditor() {
    const listEl = document.getElementById('me-region-list');
    const allRegions = getAllRegionKeysWithLabels();
    const regionMap = new Map(allRegions.map(r => [r.key, r]));

    if (allRegions.length === 0) {
        listEl.innerHTML = `
            <div class="me-empty">
                <p>정의된 부위가 없습니다.</p>
                <p style="margin-top:4px;">"+ 부위 추가" 버튼을 누르거나 매핑 JSON을 불러오세요.</p>
            </div>
        `;
        document.getElementById('me-region-detail').style.display = 'none';
        return;
    }

    // Render grouped regions (anatomy-viewer-v2 style)
    let html = '';
    let colorIdx = 0;
    const rendered = new Set();

    for (const group of REGION_GROUPS) {
        const groupRegions = group.ids.map(id => regionMap.get(id)).filter(Boolean);
        if (groupRegions.length === 0) continue;

        const totalMeshes = groupRegions.reduce((s, r) => s + r.meshCount, 0);
        html += `<div class="me-group-header">${escapeHtml(group.name)} <span class="me-group-count">${totalMeshes}</span></div>`;

        for (const r of groupRegions) {
            html += `
                <div class="me-region-item ${selectedRegionKey === r.key ? 'active' : ''}" data-region-key="${r.key}">
                    <span class="me-color-dot" style="background:${getRegionColor(colorIdx)};"></span>
                    <div class="me-region-info">
                        <div class="me-region-name">${escapeHtml(r.label)}</div>
                        <div class="me-region-key">${r.key}</div>
                    </div>
                    <span class="me-count">${r.meshCount}</span>
                </div>
            `;
            colorIdx++;
            rendered.add(r.key);
        }
    }

    // Any custom regions not in predefined groups
    const custom = allRegions.filter(r => !rendered.has(r.key));
    if (custom.length > 0) {
        html += `<div class="me-group-header">기타</div>`;
        for (const r of custom) {
            html += `
                <div class="me-region-item ${selectedRegionKey === r.key ? 'active' : ''}" data-region-key="${r.key}">
                    <span class="me-color-dot" style="background:${getRegionColor(colorIdx)};"></span>
                    <div class="me-region-info">
                        <div class="me-region-name">${escapeHtml(r.label)}</div>
                        <div class="me-region-key">${r.key}</div>
                    </div>
                    <span class="me-count">${r.meshCount}</span>
                </div>
            `;
            colorIdx++;
        }
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.me-region-item').forEach(item => {
        item.addEventListener('click', () => {
            selectedRegionKey = item.dataset.regionKey;
            renderMappingEditor();
            renderRegionDetail();
        });
    });

    if (selectedRegionKey) renderRegionDetail();
}

function renderRegionDetail() {
    const detailEl = document.getElementById('me-region-detail');
    const regions = getMappingRegions();

    if (!selectedRegionKey || !regions[selectedRegionKey]) {
        detailEl.style.display = 'none';
        return;
    }

    detailEl.style.display = 'flex';
    const regionData = regions[selectedRegionKey];
    const meshes = regionData.meshes || [];

    document.getElementById('me-detail-name').textContent = regionKeyToLabel(selectedRegionKey);
    document.getElementById('me-detail-meta').textContent = `${meshes.length}개 메쉬 | 키: ${selectedRegionKey}`;

    const meshListEl = document.getElementById('me-mesh-list');
    if (meshes.length === 0) {
        meshListEl.innerHTML = `
            <div class="me-empty">
                <p>할당된 메쉬가 없습니다.</p>
                <p style="margin-top:4px;">"메쉬 할당" 버튼을 누른 후 3D 모델을 클릭하세요.</p>
            </div>
        `;
    } else {
        meshListEl.innerHTML = meshes.map(name => `
            <div class="me-mesh-item" data-mesh-name="${name}">
                <span class="me-mesh-name">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/></svg>
                    ${name}
                </span>
                <button class="me-mesh-remove" title="부위에서 제거" data-remove="${name}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        `).join('');

        meshListEl.querySelectorAll('.me-mesh-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeMeshFromRegion(selectedRegionKey, btn.dataset.remove);
                persistMapping();
                renderRegionDetail();
                renderMappingEditor();
            });
        });
    }

    const assignBtn = document.getElementById('btn-start-assign');
    if (assignMode) {
        assignBtn.textContent = '할당 중...';
        assignBtn.style.background = '#9575CD';
    } else {
        assignBtn.textContent = '메쉬 할당';
        assignBtn.style.background = '';
    }
}

function showNewRegionForm() {
    document.getElementById('new-region-form').style.display = 'block';
    document.getElementById('input-region-name').value = '';
    document.getElementById('select-region-side').value = '';
    document.getElementById('input-region-name').focus();
}

function hideNewRegionForm() {
    document.getElementById('new-region-form').style.display = 'none';
}

function saveNewRegion() {
    const name = document.getElementById('input-region-name').value.trim();
    const side = document.getElementById('select-region-side').value;
    if (!name) { document.getElementById('input-region-name').focus(); return; }

    const key = name.toLowerCase().replace(/\s+/g, '_') + side;
    ensureMapping();
    addRegion(key);
    persistMapping();
    hideNewRegionForm();

    selectedRegionKey = key;
    renderMappingEditor();
    renderRegionDetail();
}

function startAssignMode() {
    if (!selectedRegionKey) return;
    assignMode = true;
    const banner = document.getElementById('mapping-banner');
    banner.style.display = 'flex';
    document.getElementById('mapping-banner-region').textContent = regionKeyToLabel(selectedRegionKey);
    renderRegionDetail();
}

function stopAssignMode() {
    assignMode = false;
    document.getElementById('mapping-banner').style.display = 'none';
    resetRegionColors();

    if (loadedAssessmentId) {
        const patient = storage.getCurrentPatient();
        if (patient) {
            const assessment = storage.getAssessment(patient.id, loadedAssessmentId);
            if (assessment) restoreAssessmentHighlights(assessment);
        }
    }
    renderRegionDetail();
}

function deleteSelectedRegion() {
    if (!selectedRegionKey) return;
    const label = regionKeyToLabel(selectedRegionKey);
    if (!confirm(`"${label}" 부위를 삭제하고 모든 메쉬 할당을 해제하시겠습니까?`)) return;

    if (assignMode) stopAssignMode();
    deleteRegion(selectedRegionKey);
    persistMapping();
    selectedRegionKey = null;
    renderMappingEditor();
    document.getElementById('me-region-detail').style.display = 'none';
}

function exportMapping() {
    const json = exportMappingJson();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapping-v${json.version}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Handle mapping JSON file import from a file input element
 */
function handleMappingFileImport(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const json = JSON.parse(evt.target.result);
            if (!json.regions) {
                alert('잘못된 매핑 파일: "regions" 필드가 없습니다.');
                return;
            }
            const stats = loadMapping(json);
            storage.saveMapping(json);
            renderMappingStatus();
            renderMappingEditor();
            renderRegionAssessmentPanel();
        } catch (err) {
            alert('매핑 JSON 파싱 실패: ' + err.message);
        }
    };
    reader.readAsText(file);
    fileInput.value = '';
}

/**
 * Wire up mapping import buttons in mapping editor & region assessment panel
 */
function initMappingImportButtons() {
    // Mapping editor import button
    const editorImportBtn = document.getElementById('btn-import-mapping');
    const editorFileInput = document.getElementById('input-mapping-editor-file');
    if (editorImportBtn && editorFileInput) {
        editorImportBtn.addEventListener('click', () => editorFileInput.click());
        editorFileInput.addEventListener('change', () => handleMappingFileImport(editorFileInput));
    }

    // Region assessment panel import button
    const rapImportBtn = document.getElementById('btn-load-mapping-rap');
    const rapFileInput = document.getElementById('input-mapping-rap-file');
    if (rapImportBtn && rapFileInput) {
        rapImportBtn.addEventListener('click', () => rapFileInput.click());
        rapFileInput.addEventListener('change', () => handleMappingFileImport(rapFileInput));
    }
}

function persistMapping() {
    const json = exportMappingJson();
    json.version = Math.max((json.version || 1) - 1, 1);
    storage.saveMapping(json);
    renderMappingStatus();
}
