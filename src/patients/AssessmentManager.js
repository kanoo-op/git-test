// AssessmentManager.js - Session (visit) start/end, SOAP notes, region assessment panel, severity handling

import * as storage from '../services/Storage.js';
import { highlightMesh, unhighlightMesh, getHighlightState, deselectCurrentMesh, selectMesh, applyRegionColors, resetRegionColors } from '../anatomy/Highlights.js';
import { getMeshByName } from '../core/ModelLoader.js';
import {
    getRegion, getTissueName,
    getAllRegionKeysWithLabels, getRegionMeshNames, getMeshRegionKey,
    getMappingRegions, regionKeyToLabel, getRegionColor, hasMappingLoaded,
    PREDEFINED_REGIONS, REGION_GROUPS
} from '../anatomy/Regions.js';
import { SEV_LABELS, SEV_COLORS, escapeHtml, severityRank } from '../utils/helpers.js';
import {
    switchView,
    isAssessmentMode, setAssessmentMode,
    getCurrentAssessment, setCurrentAssessment,
    getSelectedMesh,
    getLoadedAssessmentId, setLoadedAssessmentId,
} from '../ui/ViewRouter.js';
import { closeContextPanel } from '../ui/ContextPanel.js';
import { getAnatomyInfo } from '../anatomy/AnatomyData.js';

// ======== Region coloring ========

export function refreshRegionColoring() {
    const currentAssessment = getCurrentAssessment();
    if (!currentAssessment) {
        resetRegionColors();
        return;
    }

    const regionSeverityMap = {};
    for (const sel of (currentAssessment.selections || [])) {
        if (sel.regionKey && sel.severity) {
            regionSeverityMap[sel.regionKey] = sel.severity;
        }
    }

    const mappingRegions = getMappingRegions();
    const activeRegions = [];

    for (const [regionKey, sev] of Object.entries(regionSeverityMap)) {
        if (!sev || sev === '' || sev === 'normal') continue;

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
    setTimeout(() => refreshRegionColoring(), 1000);
}

export function restoreAssessmentHighlights(assessment) {
    setCurrentAssessment(assessment);
    refreshRegionColoring();
}

// ======== Assessment defaults ========

export function setAllRegionsDefaultSeverity(patient) {
    const currentAssessment = getCurrentAssessment();
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
    setCurrentAssessment(storage.getAssessment(patient.id, currentAssessment.id));
}

export function fillMissingRegionsWithNormal(patient) {
    const currentAssessment = getCurrentAssessment();
    if (!currentAssessment || !patient) return;

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
        setCurrentAssessment(storage.getAssessment(patient.id, currentAssessment.id));
    }
}

// ======== Start / End Assessment ========

export function startNewAssessment() {
    const patient = storage.getCurrentPatient();
    if (!patient) {
        window.showToast('먼저 환자를 선택해 주세요.', 'warning');
        return;
    }

    const assessment = storage.createAssessment(patient.id);
    setCurrentAssessment(assessment);
    setAssessmentMode(true);
    setLoadedAssessmentId(assessment.id);

    setAllRegionsDefaultSeverity(patient);

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-view="viewer"]').classList.add('active');
    switchView('viewer');
    document.getElementById('assessment-banner').style.display = 'flex';
    refreshRegionColoring();
    showRegionPanelIfMapped();
}

export function showEndAssessmentModal() {
    document.getElementById('end-assessment-overlay').style.display = 'flex';
    const notesEl = document.getElementById('end-assessment-notes');
    if (notesEl) {
        const currentAssessment = getCurrentAssessment();
        notesEl.value = currentAssessment?.overallNotes || '';
        notesEl.focus();
    }
}

export function hideEndAssessmentModal() {
    document.getElementById('end-assessment-overlay').style.display = 'none';
}

export function confirmEndAssessment() {
    const currentAssessment = getCurrentAssessment();
    const notesEl = document.getElementById('end-assessment-notes');
    const overallNotes = notesEl ? notesEl.value.trim() : '';

    if (currentAssessment) {
        const patient = storage.getCurrentPatient();
        if (patient) {
            const hlState = getHighlightState();
            storage.saveHighlightState(patient.id, currentAssessment.id, hlState);

            const updatedAssessment = storage.getAssessment(patient.id, currentAssessment.id);
            if (updatedAssessment) {
                const summary = storage.generateAssessmentSummary(updatedAssessment);
                const exercisePlan = buildExercisePlan(updatedAssessment);
                storage.updateAssessment(patient.id, currentAssessment.id, {
                    summary,
                    overallNotes,
                    status: 'completed',
                    exercisePlan
                });
            }
        }
    }

    setAssessmentMode(false);
    setCurrentAssessment(null);
    document.getElementById('assessment-banner').style.display = 'none';
    document.getElementById('region-assessment-panel').style.display = 'none';
    hideEndAssessmentModal();

    switchView('patient-detail');
}

// ======== Exercise Plan Builder ========

const SEVERITY_PHASE_MAP = { severe: 'acute', moderate: 'subacute', mild: 'chronic' };

function buildExercisePlan(assessment) {
    const exercisePlan = [];
    const seenBaseRegions = new Set();
    const regionSevMap = getRegionSeverityMap(assessment);

    for (const [key, sev] of regionSevMap) {
        const baseKey = key.replace(/_(l|r)$/, '');
        if (seenBaseRegions.has(baseKey)) continue;
        seenBaseRegions.add(baseKey);

        const info = getAnatomyInfo(key);
        if (info && info.exercises) {
            // severity→phase 매칭: 해당 phase 운동 우선 선택
            const targetPhase = SEVERITY_PHASE_MAP[sev] || 'chronic';
            const sorted = [...info.exercises].sort((a, b) => {
                const aMatch = (a.phase || []).includes(targetPhase) ? 0 : 1;
                const bMatch = (b.phase || []).includes(targetPhase) ? 0 : 1;
                return aMatch - bMatch;
            });

            for (const ex of sorted.slice(0, 2)) {
                exercisePlan.push({
                    name: ex.name,
                    region: info.name.replace(/ \((좌|우)\)$/, ''),
                    sets: ex.sets || 3,
                    reps: ex.reps || 10,
                    difficulty: sev === 'severe' ? 'easy' : (sev === 'moderate' ? 'medium' : 'normal'),
                    precautions: ex.precautions || '',
                    videoId: ex.videoId || '',
                    purpose: ex.purpose || [],
                    phase: ex.phase || [],
                    equipment: ex.equipment || [],
                    pattern: ex.pattern || [],
                });
            }
        }
    }
    return exercisePlan;
}

// ======== Region Severity Map (used by exercise plan) ========

function getRegionSeverityMap(assessment) {
    const SEV_ORDER = { severe: 3, moderate: 2, mild: 1, normal: 0 };
    const map = new Map();
    for (const s of (assessment.selections || [])) {
        if (!s.severity || s.severity === 'normal') continue;
        const key = s.regionKey || s.region || s.meshId;
        const existing = map.get(key);
        if (!existing || (SEV_ORDER[s.severity] || 0) > (SEV_ORDER[existing] || 0)) {
            map.set(key, s.severity);
        }
    }
    return map;
}

// ======== Selection/Severity Handling ========

export function onSeverityChange() {
    const selectedMesh = getSelectedMesh();
    if (!selectedMesh) return;
    const severity = document.getElementById('select-severity').value;

    deselectCurrentMesh();
    if (severity) {
        highlightMesh(selectedMesh, severity);
    } else {
        unhighlightMesh(selectedMesh);
    }
    selectMesh(selectedMesh);

    const currentAssessment = getCurrentAssessment();
    if (isAssessmentMode() && currentAssessment) {
        const patient = storage.getCurrentPatient();
        if (patient) saveSelectionToAssessment(patient);
    }
}

export function saveSelectionNote() {
    const selectedMesh = getSelectedMesh();
    if (!selectedMesh) return;
    const severity = document.getElementById('select-severity').value;
    const concern = document.getElementById('check-concern').checked;

    if (concern && !severity) {
        deselectCurrentMesh();
        highlightMesh(selectedMesh, 'mild');
    }

    const currentAssessment = getCurrentAssessment();
    if (isAssessmentMode() && currentAssessment) {
        const patient = storage.getCurrentPatient();
        if (patient) saveSelectionToAssessment(patient);
    }
    closeContextPanel();
}

function saveSelectionToAssessment(patient) {
    const selectedMesh = getSelectedMesh();
    const currentAssessment = getCurrentAssessment();
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

// ======== Region Assessment Panel ========

export function showRegionPanelIfMapped() {
    if (hasMappingLoaded()) {
        document.getElementById('region-assessment-panel').style.display = 'flex';
        renderRegionAssessmentPanel();
    }
}

export function toggleRegionPanel() {
    const panel = document.getElementById('region-assessment-panel');
    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'flex';
        renderRegionAssessmentPanel();
    } else {
        panel.style.display = 'none';
    }
}

export function renderRegionAssessmentPanel() {
    const listEl = document.getElementById('region-assessment-list');
    const allRegions = getAllRegionKeysWithLabels();
    const regionMap = new Map(allRegions.map(r => [r.key, r]));
    const currentAssessment = getCurrentAssessment();

    if (allRegions.length === 0) {
        listEl.innerHTML = '<div class="rap-empty">매핑된 부위가 없습니다.<br>매핑 파일을 불러오거나 매핑 에디터에서 부위를 설정하세요.</div>';
        return;
    }

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
                    <option value="mild" ${currentSev === 'mild' || currentSev === 'moderate' ? 'selected' : ''}>경도</option>
                    <option value="severe" ${currentSev === 'severe' ? 'selected' : ''}>중증</option>
                </select>
            </div>
        `;
    }

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

    const custom = allRegions.filter(r => !rendered.has(r.key));
    if (custom.length > 0) {
        html += `<div class="rap-group-header">기타</div>`;
        for (const r of custom) html += regionItemHtml(r);
    }

    listEl.innerHTML = html;

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

export function applyRegionSeverity(regionKey, severity) {
    const meshNames = getRegionMeshNames(regionKey);
    const patient = storage.getCurrentPatient();
    const currentAssessment = getCurrentAssessment();
    if (!patient || !currentAssessment) return;

    for (const meshName of meshNames) {
        const mesh = getMeshByName(meshName);
        if (!mesh) continue;

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

    setCurrentAssessment(storage.getAssessment(patient.id, currentAssessment.id));
    refreshRegionColoring();
    renderRegionAssessmentPanel();
}

// ======== Forward aliases (new naming convention) ========
export { startNewAssessment as startNewVisit };
export { confirmEndAssessment as confirmEndSession };
export { showEndAssessmentModal as showEndSessionModal };
export { hideEndAssessmentModal as hideEndSessionModal };
export { restoreAssessmentHighlights as restoreVisitHighlights };
