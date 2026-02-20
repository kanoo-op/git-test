// ViewRouter.js - Shared state + view routing + panel initialization

import * as storage from '../services/Storage.js';
import { resetRegionColors, stopPulseHighlight } from '../anatomy/Highlights.js';
import { updatePatientCard, renderMappingStatus, expandGroupForView } from './Sidebar.js';
import { renderDashboard, setOpenPatientDetail } from './Dashboard.js';
import { closeContextPanel } from './ContextPanel.js';
import { renderPatientsList, showNewPatientForm, showEditPatientForm, hidePatientForm, savePatient, openPatientDetail } from '../patients/PatientList.js';
import { renderPatientDetail, doCompareAssessments } from '../patients/PatientDetail.js';
import {
    startNewAssessment, showEndAssessmentModal, confirmEndAssessment, hideEndAssessmentModal,
    saveSelectionNote, onSeverityChange, toggleRegionPanel, setAllRegionsDefaultSeverity,
} from '../patients/AssessmentManager.js';
import { renderMappingEditor, showNewRegionForm, hideNewRegionForm, saveNewRegion, startAssignMode, stopAssignMode, deleteSelectedRegion, exportMapping, initMappingImportButtons } from '../mapping/MappingEditor.js';
import { hideExerciseRecommendations } from './ExerciseRecommendation.js';
import { refreshReportPanel } from './ReportPanel.js';
import { stopRealtimePose, isRealtimeRunning } from '../pose/RealtimePose.js';
import { renderSoapRecordsView } from '../patients/SoapRecords.js';

// ======== Shared State ========

let currentView = 'dashboard';
let sessionMode = false;
let currentVisit = null;
let selectedMesh = null;
let loadedVisitId = null;
let editingPatientId = null;
let currentDetailPatientId = null;
let compareSelections = new Set();

// Mapping editor state
let mappingEditorActive = false;
let assignMode = false;
let selectedRegionKey = null;

// --- State getters/setters ---

export function getCurrentView() { return currentView; }
export function isSessionMode() { return sessionMode; }
export function setSessionMode(val) { sessionMode = val; }
export function getCurrentVisit() { return currentVisit; }
export function setCurrentVisit(val) { currentVisit = val; }
export function getSelectedMesh() { return selectedMesh; }
export function setSelectedMesh(val) { selectedMesh = val; }
export function getLoadedVisitId() { return loadedVisitId; }
export function setLoadedVisitId(val) { loadedVisitId = val; }
export function getEditingPatientId() { return editingPatientId; }
export function setEditingPatientId(val) { editingPatientId = val; }
export function getCurrentDetailPatientId() { return currentDetailPatientId; }
export function setCurrentDetailPatientId(val) { currentDetailPatientId = val; }
export function getCompareSelections() { return compareSelections; }

export function isMappingEditorActive() { return mappingEditorActive; }
export function isMappingAssignMode() { return assignMode; }
export function setAssignMode(val) { assignMode = val; }
export function getSelectedRegionKey() { return selectedRegionKey; }
export function setSelectedRegionKey(val) { selectedRegionKey = val; }

// Backward compatibility aliases
export { isSessionMode as isAssessmentMode };
export { setSessionMode as setAssessmentMode };
export { getCurrentVisit as getCurrentAssessment };
export { setCurrentVisit as setCurrentAssessment };
export { getLoadedVisitId as getLoadedAssessmentId };
export { setLoadedVisitId as setLoadedAssessmentId };

/**
 * 현재 활성 세션 정보 반환 (posture-ui 등 외부에서 사용)
 */
export function getCurrentVisitInfo() {
    if (!currentVisit) return null;
    return { id: currentVisit.id, sessionMode };
}
export { getCurrentVisitInfo as getCurrentAssessmentInfo };

/**
 * 외부에서 새 세션을 생성하고 세션 모드 진입 (자세 분석 등에서 사용)
 */
export function ensureSessionMode() {
    const patient = storage.getCurrentPatient();
    if (!patient) return null;

    if (sessionMode && currentVisit) return currentVisit;

    currentVisit = storage.createVisit(patient.id);
    sessionMode = true;
    loadedVisitId = currentVisit.id;

    setAllRegionsDefaultSeverity(patient);

    document.getElementById('assessment-banner').style.display = 'flex';

    return currentVisit;
}
export { ensureSessionMode as ensureAssessmentMode };

/**
 * 자세분석 뷰의 환자 정보 바 업데이트
 */
function updatePosturePatientBar() {
    const patient = storage.getCurrentPatient();
    const nameEl = document.getElementById('posture-patient-name');
    const selectBtn = document.getElementById('posture-select-patient-btn');
    if (!nameEl) return;

    if (patient) {
        nameEl.textContent = patient.name;
        nameEl.style.color = '';
        if (selectBtn) selectBtn.textContent = '변경';
    } else {
        nameEl.textContent = '환자를 먼저 선택해주세요';
        nameEl.style.color = 'var(--status-severe)';
        if (selectBtn) selectBtn.textContent = '환자 선택';
    }
}

// ======== View Switching ========

// Alias map: new nav items that map to existing views
const VIEW_ALIASES = {
    'new-session': 'dashboard',
    'session-timeline': 'dashboard',
};

// Map views without their own nav-item to a parent nav-item for highlighting
const VIEW_PARENT_MAP = {
    'patient-detail': 'patients',
};

export function switchView(view) {
    const resolvedView = VIEW_ALIASES[view] || view;
    currentView = resolvedView;

    if (resolvedView !== 'mapping' && assignMode) stopAssignMode();
    if (resolvedView !== 'viewer') {
        stopPulseHighlight();
        hideExerciseRecommendations();
        if (isRealtimeRunning()) stopRealtimePose();
    }

    // Update sidebar nav active state (use original view for highlighting)
    const highlightView = VIEW_PARENT_MAP[view] || view;
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === highlightView);
    });

    // Update nav group active state
    document.querySelectorAll('.nav-group').forEach(group => {
        const hasActiveChild = group.querySelector('.nav-item.active') !== null;
        group.classList.toggle('has-active', hasActiveChild);
    });

    // Auto-expand the group containing the active view
    expandGroupForView(highlightView);

    // Hide all views
    document.getElementById('viewer-container').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'none';
    document.getElementById('patients-view').style.display = 'none';
    document.getElementById('patient-detail-view').style.display = 'none';
    document.getElementById('mapping-editor').style.display = 'none';
    document.getElementById('posture-analysis-view').style.display = 'none';
    document.getElementById('disease-search-view').style.display = 'none';
    document.getElementById('soap-records-view').style.display = 'none';
    document.getElementById('exercise-view').style.display = 'none';
    document.getElementById('reports-view').style.display = 'none';
    document.getElementById('therapy-centers-view').style.display = 'none';

    mappingEditorActive = false;

    switch (resolvedView) {
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
        case 'posture':
            document.getElementById('posture-analysis-view').style.display = 'block';
            updatePosturePatientBar();
            if (window._refreshDashboardCharts) window._refreshDashboardCharts();
            break;
        case 'disease-search':
            document.getElementById('disease-search-view').style.display = 'block';
            break;
        case 'soap-records':
            document.getElementById('soap-records-view').style.display = 'block';
            renderSoapRecordsView();
            break;
        case 'exercise':
            document.getElementById('exercise-view').style.display = 'block';
            break;
        case 'reports':
            document.getElementById('reports-view').style.display = 'block';
            refreshReportPanel();
            break;
        case 'therapy-centers':
            document.getElementById('therapy-centers-view').style.display = 'block';
            if (window._activateTherapyCentersView) window._activateTherapyCentersView();
            break;
        case 'mapping':
            document.getElementById('viewer-container').style.display = 'block';
            document.getElementById('mapping-editor').style.display = 'flex';
            mappingEditorActive = true;
            renderMappingEditor();
            break;
    }
}

// ======== Init ========

export function initPanels() {
    // Wire up Dashboard's openPatientDetail callback
    setOpenPatientDetail(openPatientDetail);

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

    // Severity change
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

    // Region Assessment Panel
    document.getElementById('btn-toggle-region-panel').addEventListener('click', toggleRegionPanel);
    document.getElementById('btn-close-region-panel').addEventListener('click', () => {
        document.getElementById('region-assessment-panel').style.display = 'none';
    });

    // Mapping Editor
    document.getElementById('btn-add-region').addEventListener('click', showNewRegionForm);
    document.getElementById('btn-save-region').addEventListener('click', saveNewRegion);
    document.getElementById('btn-cancel-region').addEventListener('click', hideNewRegionForm);
    document.getElementById('btn-start-assign').addEventListener('click', startAssignMode);
    document.getElementById('btn-stop-assign').addEventListener('click', stopAssignMode);
    document.getElementById('btn-delete-region').addEventListener('click', deleteSelectedRegion);
    document.getElementById('btn-export-mapping').addEventListener('click', exportMapping);
    initMappingImportButtons();

    // Posture patient select button -> switch to patients view
    const postureSelectBtn = document.getElementById('posture-select-patient-btn');
    if (postureSelectBtn) {
        postureSelectBtn.addEventListener('click', () => switchView('patients'));
    }

    // Load current patient
    const patient = storage.getCurrentPatient();
    if (patient) {
        updatePatientCard(patient);
    }
}
