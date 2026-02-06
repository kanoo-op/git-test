// panels.js - Patient management, assessments, context panel, mapping editor

import * as storage from './storage.js';
import { highlightMesh, unhighlightMesh, clearAllHighlights, getHighlightState, restoreHighlightState, deselectCurrentMesh, selectMesh } from './highlights.js';
import { getMeshByName } from './viewer.js';
import {
    getRegion, getTissueName,
    addRegion, deleteRegion, addMeshToRegion, removeMeshFromRegion,
    getMappingRegions, exportMappingJson, getMeshRegionKey, getAllRegionKeysWithLabels,
    getRegionColor, ensureMapping, loadMapping, regionKeyToLabel
} from './regions.js';
import { updatePatientCard, renderMappingStatus } from './sidebar.js';

let currentView = 'viewer';
let assessmentMode = false;
let currentAssessment = null;
let selectedMesh = null;
let loadedAssessmentId = null; // Currently loaded assessment in 3D viewer
let editingPatientId = null; // Patient being edited (null = new patient mode)

// Mapping editor state
let mappingEditorActive = false;
let assignMode = false;
let selectedRegionKey = null;

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
    document.getElementById('btn-end-assessment').addEventListener('click', endAssessment);

    // Save selection note
    document.getElementById('btn-save-selection').addEventListener('click', saveSelectionNote);

    // Severity change → immediate color update
    document.getElementById('select-severity').addEventListener('change', onSeverityChange);

    // --- Mapping Editor ---
    document.getElementById('btn-add-region').addEventListener('click', showNewRegionForm);
    document.getElementById('btn-save-region').addEventListener('click', saveNewRegion);
    document.getElementById('btn-cancel-region').addEventListener('click', hideNewRegionForm);
    document.getElementById('btn-start-assign').addEventListener('click', startAssignMode);
    document.getElementById('btn-stop-assign').addEventListener('click', stopAssignMode);
    document.getElementById('btn-delete-region').addEventListener('click', deleteSelectedRegion);
    document.getElementById('btn-export-mapping').addEventListener('click', exportMapping);

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

    // Exit assign mode when leaving mapping view
    if (view !== 'mapping' && assignMode) {
        stopAssignMode();
    }

    // Hide all views
    document.getElementById('viewer-container').style.display = 'none';
    document.getElementById('patients-view').style.display = 'none';
    document.getElementById('mapping-editor').style.display = 'none';

    mappingEditorActive = false;

    switch (view) {
        case 'viewer':
            document.getElementById('viewer-container').style.display = 'block';
            break;
        case 'patients':
            document.getElementById('patients-view').style.display = 'block';
            renderPatientsList();
            break;
        case 'mapping':
            document.getElementById('viewer-container').style.display = 'block';
            document.getElementById('mapping-editor').style.display = 'flex';
            mappingEditorActive = true;
            renderMappingEditor();
            break;
    }
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

    // Show mapping source badge
    const sourceEl = document.getElementById('detail-source');
    const regionInfo = getRegion(mesh);
    if (regionInfo.source === 'mapping') {
        sourceEl.innerHTML = '<span class="source-badge mapping">JSON 매핑</span>';
    } else {
        sourceEl.innerHTML = '<span class="source-badge auto">자동 감지</span>';
    }

    // Reset form
    document.getElementById('select-severity').value = '';
    document.getElementById('input-mesh-notes').value = '';
    document.getElementById('check-concern').checked = false;
}

export function closeContextPanel() {
    const panel = document.getElementById('context-panel');
    panel.classList.remove('open');
    selectedMesh = null;
    deselectCurrentMesh();
}

/**
 * When severity dropdown changes → immediately apply color
 */
function onSeverityChange() {
    if (!selectedMesh) return;

    const severity = document.getElementById('select-severity').value;

    // Deselect temporary highlight first (restore clean state)
    deselectCurrentMesh();

    if (severity) {
        // Apply persistent severity highlight
        highlightMesh(selectedMesh, severity);
    } else {
        // Severity cleared → remove persistent highlight
        unhighlightMesh(selectedMesh);
    }

    // Re-select so clicking the same mesh again closes the panel
    selectMesh(selectedMesh);

    // Auto-save to assessment if in assessment mode
    if (assessmentMode && currentAssessment) {
        const patient = storage.getCurrentPatient();
        if (patient) {
            saveSelectionToAssessment(patient);
        }
    }
}

function saveSelectionNote() {
    if (!selectedMesh) return;

    const severity = document.getElementById('select-severity').value;
    const notes = document.getElementById('input-mesh-notes').value;
    const concern = document.getElementById('check-concern').checked;

    // If concern checked but no severity → apply mild persistent highlight
    if (concern && !severity) {
        deselectCurrentMesh();
        highlightMesh(selectedMesh, 'mild');
    }

    // Save to assessment if in assessment mode
    if (assessmentMode && currentAssessment) {
        const patient = storage.getCurrentPatient();
        if (patient) {
            saveSelectionToAssessment(patient);
        }
    }

    closeContextPanel();
}

/**
 * Save current selection data to the active assessment
 */
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
        severity: severity,
        notes: notes,
        concern: concern,
        timestamp: Date.now()
    });

    const hlState = getHighlightState();
    storage.saveHighlightState(patient.id, currentAssessment.id, hlState);
}

// --- Patient Management ---

function renderPatientsList() {
    const list = document.getElementById('patients-list');
    const patients = storage.getPatients();
    const currentId = storage.getCurrentPatient()?.id;

    if (patients.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
                <p>등록된 환자가 없습니다. 새 환자를 등록해 주세요.</p>
            </div>
        `;
        renderInlineAssessments();
        return;
    }

    list.innerHTML = patients.map(p => {
        const age = p.dob ? calculateAge(p.dob) : '-';
        const isActive = p.id === currentId;
        return `
            <div class="patient-card-item ${isActive ? 'active' : ''}" data-patient-id="${p.id}">
                <div>
                    <div class="name">${escapeHtml(p.name)}</div>
                    <div class="meta">나이: ${age} | 평가: ${p.assessments?.length || 0}건 | 등록일: ${new Date(p.createdAt).toLocaleDateString('ko-KR')}</div>
                </div>
                <div class="actions">
                    <button class="edit-patient" data-id="${p.id}">수정</button>
                    <button class="delete delete-patient" data-id="${p.id}">삭제</button>
                </div>
            </div>
        `;
    }).join('');

    // Click card to select patient
    list.querySelectorAll('.patient-card-item').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.patientId;
            const prevId = storage.getCurrentPatient()?.id;
            storage.setCurrentPatient(id);
            updatePatientCard(storage.getCurrentPatient());

            if (prevId !== id) {
                clearAllHighlights();
                loadedAssessmentId = null;
            }

            renderPatientsList();
        });
    });

    // Edit patient
    list.querySelectorAll('.edit-patient').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditPatientForm(btn.dataset.id);
        });
    });

    // Delete patient
    list.querySelectorAll('.delete-patient').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('이 환자와 모든 평가 기록을 삭제하시겠습니까?')) {
                storage.deletePatient(btn.dataset.id);
                updatePatientCard(storage.getCurrentPatient());
                clearAllHighlights();
                loadedAssessmentId = null;
                renderPatientsList();
            }
        });
    });

    // Show inline assessments for current patient
    renderInlineAssessments();
}

function showNewPatientForm() {
    editingPatientId = null;
    document.getElementById('patient-form').style.display = 'block';
    document.getElementById('patient-form-title').textContent = '새 환자 등록';
    document.getElementById('btn-save-patient').textContent = '저장';
    document.getElementById('input-patient-name').value = '';
    document.getElementById('input-patient-dob').value = '';
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
    document.getElementById('input-patient-notes').value = patient.notes || '';
    document.getElementById('input-patient-name').focus();
}

function hidePatientForm() {
    document.getElementById('patient-form').style.display = 'none';
    editingPatientId = null;
}

function savePatient() {
    const name = document.getElementById('input-patient-name').value.trim();
    const dob = document.getElementById('input-patient-dob').value;
    const notes = document.getElementById('input-patient-notes').value.trim();

    if (!name) {
        document.getElementById('input-patient-name').focus();
        return;
    }

    if (editingPatientId) {
        // Update existing patient
        const patient = storage.updatePatient(editingPatientId, { name, dob, notes });
        if (patient) {
            updatePatientCard(storage.getCurrentPatient());
        }
    } else {
        // Create new patient
        const patient = storage.createPatient(name, dob, notes);
        storage.setCurrentPatient(patient.id);
        updatePatientCard(patient);
    }

    hidePatientForm();
    renderPatientsList();
}

// --- Assessment Management (Inline in Patients View) ---

function renderInlineAssessments() {
    const section = document.getElementById('patient-assessments-section');
    const list = document.getElementById('assessments-list');
    const titleEl = document.getElementById('assessments-section-title');
    const patient = storage.getCurrentPatient();

    if (!patient) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    titleEl.textContent = `${escapeHtml(patient.name)}님의 평가 기록`;

    // Bind new assessment button
    const newBtn = document.getElementById('btn-new-assessment');
    const newBtnClone = newBtn.cloneNode(true);
    newBtn.parentNode.replaceChild(newBtnClone, newBtn);
    newBtnClone.addEventListener('click', startNewAssessment);

    const assessments = patient.assessments || [];

    if (assessments.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="padding:30px 20px;">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
                <p>평가 기록이 없습니다. 새 평가를 시작하세요.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = assessments.map(a => {
        const date = new Date(a.date).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const selections = a.selections || [];
        const severityCounts = {};
        selections.forEach(s => {
            if (s.severity) severityCounts[s.severity] = (severityCounts[s.severity] || 0) + 1;
        });

        const isLoaded = loadedAssessmentId === a.id;

        return `
            <div class="assessment-card ${isLoaded ? 'active' : ''}" data-assessment-id="${a.id}">
                <div class="date">
                    ${date}
                    ${isLoaded ? '<span class="viewing-badge">보는 중</span>' : ''}
                </div>
                <div class="summary">${selections.length}개 부위 표시 | ${a.summary ? escapeHtml(a.summary) : '요약 없음'}</div>
                <div class="tags">
                    ${Object.entries(severityCounts).map(([sev, count]) => {
                        const sevLabel = {normal:'정상', mild:'경도', moderate:'중등도', severe:'중증'}[sev] || sev;
                        return `<span class="severity-tag ${sev}">${sevLabel}: ${count}</span>`;
                    }).join('')}
                </div>
                <div class="assessment-actions">
                    <button class="view-assessment" data-id="${a.id}">3D에서 보기</button>
                    <button class="continue-assessment" data-id="${a.id}">평가 계속하기</button>
                    <button class="delete-assessment" data-id="${a.id}">삭제</button>
                </div>
            </div>
        `;
    }).join('');

    // Bind action buttons
    list.querySelectorAll('.view-assessment').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            loadAssessment(patient.id, btn.dataset.id);
        });
    });

    list.querySelectorAll('.continue-assessment').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            continueAssessment(patient.id, btn.dataset.id);
        });
    });

    list.querySelectorAll('.delete-assessment').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('이 평가 기록을 삭제하시겠습니까?')) {
                storage.deleteAssessment(patient.id, btn.dataset.id);
                if (loadedAssessmentId === btn.dataset.id) {
                    clearAllHighlights();
                    loadedAssessmentId = null;
                }
                updatePatientCard(storage.getCurrentPatient());
                renderInlineAssessments();
            }
        });
    });
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

    // Switch to viewer
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');

    // Show assessment banner
    document.getElementById('assessment-banner').style.display = 'flex';
    clearAllHighlights();
}

function endAssessment() {
    // Save highlight state before ending
    if (currentAssessment) {
        const patient = storage.getCurrentPatient();
        if (patient) {
            const hlState = getHighlightState();
            storage.saveHighlightState(patient.id, currentAssessment.id, hlState);
        }
    }

    assessmentMode = false;
    currentAssessment = null;
    document.getElementById('assessment-banner').style.display = 'none';
}

function loadAssessment(patientId, assessmentId) {
    const assessment = storage.getAssessment(patientId, assessmentId);
    if (!assessment) return;

    loadedAssessmentId = assessmentId;

    // Switch to viewer
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');

    // Restore highlights
    restoreAssessmentHighlights(assessment);
}

function continueAssessment(patientId, assessmentId) {
    const assessment = storage.getAssessment(patientId, assessmentId);
    if (!assessment) return;

    currentAssessment = assessment;
    assessmentMode = true;
    loadedAssessmentId = assessmentId;

    // Switch to viewer
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');

    // Show assessment banner
    document.getElementById('assessment-banner').style.display = 'flex';

    // Restore highlights
    restoreAssessmentHighlights(assessment);
}

/**
 * Restore 3D highlights from an assessment's saved state
 */
function restoreAssessmentHighlights(assessment) {
    clearAllHighlights();

    // Prefer highlightState if available
    if (assessment.highlightState && assessment.highlightState.length > 0) {
        restoreHighlightState(assessment.highlightState, getMeshByName);
        return;
    }

    // Backward compat: reconstruct from selections
    const selections = assessment.selections || [];
    for (const sel of selections) {
        if (sel.meshId) {
            const mesh = getMeshByName(sel.meshId);
            if (mesh && (sel.severity || sel.concern)) {
                highlightMesh(mesh, sel.severity || 'mild');
            }
        }
    }
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
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
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

/**
 * Handle mesh click during assign mode
 */
export function handleMappingAssign(mesh) {
    if (!assignMode || !selectedRegionKey || !mesh) return;

    const meshName = mesh.name;
    if (!meshName) return;

    addMeshToRegion(selectedRegionKey, meshName);
    persistMapping();
    renderRegionDetail();
    renderMappingEditor();

    // Visual feedback: briefly flash the mesh
    highlightMesh(mesh, 'normal');
    setTimeout(() => unhighlightMesh(mesh), 400);
}

/**
 * Handle mesh right-click during assign mode (remove from region)
 */
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
    const regions = getAllRegionKeysWithLabels();

    if (regions.length === 0) {
        listEl.innerHTML = `
            <div class="me-empty">
                <p>정의된 부위가 없습니다.</p>
                <p style="margin-top:4px;">"+ 부위 추가" 버튼을 누르거나 사이드바에서 매핑 JSON을 불러오세요.</p>
            </div>
        `;
        document.getElementById('me-region-detail').style.display = 'none';
        return;
    }

    listEl.innerHTML = regions.map((r, i) => `
        <div class="me-region-item ${selectedRegionKey === r.key ? 'active' : ''}" data-region-key="${r.key}">
            <span class="me-color-dot" style="background:${getRegionColor(i)};"></span>
            <div class="me-region-info">
                <div class="me-region-name">${escapeHtml(r.label)}</div>
                <div class="me-region-key">${r.key}</div>
            </div>
            <span class="me-count">${r.meshCount}</span>
        </div>
    `).join('');

    // Bind click events
    listEl.querySelectorAll('.me-region-item').forEach(item => {
        item.addEventListener('click', () => {
            selectedRegionKey = item.dataset.regionKey;
            renderMappingEditor();
            renderRegionDetail();
        });
    });

    // Show detail if a region is selected
    if (selectedRegionKey) {
        renderRegionDetail();
    }
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

        // Bind remove buttons
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

    // Update assign button text
    const assignBtn = document.getElementById('btn-start-assign');
    if (assignMode) {
        assignBtn.textContent = '할당 중...';
        assignBtn.style.background = '#9575CD';
    } else {
        assignBtn.textContent = '메쉬 할당';
        assignBtn.style.background = '';
    }
}

// --- New Region ---

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

    if (!name) {
        document.getElementById('input-region-name').focus();
        return;
    }

    // Build region key: lowercase, replace spaces with _, add side suffix
    const key = name.toLowerCase().replace(/\s+/g, '_') + side;

    ensureMapping();
    addRegion(key);
    persistMapping();
    hideNewRegionForm();

    selectedRegionKey = key;
    renderMappingEditor();
    renderRegionDetail();
}

// --- Assign Mode ---

function startAssignMode() {
    if (!selectedRegionKey) return;
    assignMode = true;

    // Show mapping banner
    const banner = document.getElementById('mapping-banner');
    banner.style.display = 'flex';
    document.getElementById('mapping-banner-region').textContent = regionKeyToLabel(selectedRegionKey);

    renderRegionDetail();
}

function stopAssignMode() {
    assignMode = false;
    document.getElementById('mapping-banner').style.display = 'none';
    clearAllHighlights();

    // Re-restore loaded assessment highlights if any
    if (loadedAssessmentId) {
        const patient = storage.getCurrentPatient();
        if (patient) {
            const assessment = storage.getAssessment(patient.id, loadedAssessmentId);
            if (assessment) {
                restoreAssessmentHighlights(assessment);
            }
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

function persistMapping() {
    const json = exportMappingJson();
    // Undo the version increment from exportMappingJson since we're just saving
    json.version = Math.max((json.version || 1) - 1, 1);
    storage.saveMapping(json);
    renderMappingStatus();
}
