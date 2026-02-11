// AssessmentManager.js - Assessment start/end, SOAP notes, region assessment panel, severity handling

import * as storage from '../services/Storage.js';
import { highlightMesh, unhighlightMesh, getHighlightState, deselectCurrentMesh, selectMesh, applyRegionColors, resetRegionColors } from '../anatomy/Highlights.js';
import { getMeshByName } from '../core/ModelLoader.js';
import {
    getRegion, getTissueName,
    getAllRegionKeysWithLabels, getRegionMeshNames, getMeshRegionKey,
    getMappingRegions, regionKeyToLabel, getRegionColor, hasMappingLoaded,
    PREDEFINED_REGIONS, REGION_GROUPS
} from '../anatomy/Regions.js';
import { SEV_LABELS, SEV_COLORS, escapeHtml } from '../utils/helpers.js';
import {
    switchView,
    isAssessmentMode, setAssessmentMode,
    getCurrentAssessment, setCurrentAssessment,
    getSelectedMesh,
    getLoadedAssessmentId, setLoadedAssessmentId,
} from '../ui/ViewRouter.js';
import { closeContextPanel } from '../ui/ContextPanel.js';

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

    initSoapTabs();

    const patient = storage.getCurrentPatient();
    const currentAssessment = getCurrentAssessment();
    if (patient && currentAssessment && currentAssessment.soapNotes) {
        loadSoapData(currentAssessment.soapNotes);
    } else {
        clearSoapForm();
    }

    fillObjectiveAutoFindings();
    document.getElementById('soap-chief-complaint').focus();
}

export function hideEndAssessmentModal() {
    document.getElementById('end-assessment-overlay').style.display = 'none';
}

export function confirmEndAssessment() {
    const soapNotes = collectSoapData();
    const currentAssessment = getCurrentAssessment();

    const overallParts = [];
    if (soapNotes.subjective.chiefComplaint) overallParts.push('주호소: ' + soapNotes.subjective.chiefComplaint);
    if (soapNotes.assessment.clinicalImpression) overallParts.push('소견: ' + soapNotes.assessment.clinicalImpression);
    if (soapNotes.plan.treatment) overallParts.push('계획: ' + soapNotes.plan.treatment);
    const overallNotes = overallParts.join(' | ');

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
                    overallNotes,
                    soapNotes
                });
            }
        }
    }

    setAssessmentMode(false);
    setCurrentAssessment(null);
    document.getElementById('assessment-banner').style.display = 'none';
    document.getElementById('region-assessment-panel').style.display = 'none';
    hideEndAssessmentModal();
}

// ======== SOAP Notes ========

function initSoapTabs() {
    const tabs = document.querySelectorAll('.soap-tab');
    const contents = document.querySelectorAll('.soap-tab-content');

    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.soapTab;
            document.getElementById('soap-' + target).classList.add('active');
        };
    });

    const vasSlider = document.getElementById('soap-pain-scale');
    const vasValue = document.getElementById('soap-vas-value');
    vasSlider.oninput = () => { vasValue.textContent = vasSlider.value; };

    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    tabs[0].classList.add('active');
    contents[0].classList.add('active');
}

function clearSoapForm() {
    document.getElementById('soap-chief-complaint').value = '';
    document.getElementById('soap-pain-scale').value = 0;
    document.getElementById('soap-vas-value').textContent = '0';
    document.getElementById('soap-symptom-desc').value = '';
    document.getElementById('soap-pain-location').value = '';
    document.getElementById('soap-onset').value = '';
    document.getElementById('soap-aggravating').value = '';
    document.getElementById('soap-relieving').value = '';

    document.getElementById('soap-auto-findings').value = '';
    document.getElementById('soap-rom').value = '';
    document.getElementById('soap-mmt').value = '';
    document.getElementById('soap-special-tests').value = '';
    document.getElementById('soap-palpation').value = '';
    document.getElementById('soap-gait').value = '';
    document.getElementById('soap-additional-findings').value = '';

    document.getElementById('soap-clinical-impression').value = '';
    document.getElementById('soap-progress-level').value = 'initial';
    document.getElementById('soap-functional-level').value = '';
    document.getElementById('soap-goals').value = '';

    document.getElementById('soap-treatment').value = '';
    document.getElementById('soap-hep').value = '';
    document.getElementById('soap-frequency').value = '';
    document.getElementById('soap-duration').value = '';
    document.getElementById('soap-next-visit').value = '';
    document.getElementById('soap-precautions').value = '';
    document.getElementById('soap-referral').value = '';
}

function loadSoapData(soap) {
    if (!soap) return;
    const s = soap.subjective || {};
    document.getElementById('soap-chief-complaint').value = s.chiefComplaint || '';
    document.getElementById('soap-pain-scale').value = s.painScale || 0;
    document.getElementById('soap-vas-value').textContent = String(s.painScale || 0);
    document.getElementById('soap-symptom-desc').value = s.symptomDescription || '';
    document.getElementById('soap-pain-location').value = s.painLocation || '';
    document.getElementById('soap-onset').value = s.onset || '';
    document.getElementById('soap-aggravating').value = s.aggravating || '';
    document.getElementById('soap-relieving').value = s.relieving || '';

    const o = soap.objective || {};
    document.getElementById('soap-auto-findings').value = o.autoFindings || '';
    document.getElementById('soap-rom').value = o.rom || '';
    document.getElementById('soap-mmt').value = o.mmt || '';
    document.getElementById('soap-special-tests').value = o.specialTests || '';
    document.getElementById('soap-palpation').value = o.palpation || '';
    document.getElementById('soap-gait').value = o.gait || '';
    document.getElementById('soap-additional-findings').value = o.additionalFindings || '';

    const a = soap.assessment || {};
    document.getElementById('soap-clinical-impression').value = a.clinicalImpression || '';
    document.getElementById('soap-progress-level').value = a.progressLevel || 'initial';
    document.getElementById('soap-functional-level').value = a.functionalLevel || '';
    document.getElementById('soap-goals').value = a.goals || '';

    const p = soap.plan || {};
    document.getElementById('soap-treatment').value = p.treatment || '';
    document.getElementById('soap-hep').value = p.hep || '';
    document.getElementById('soap-frequency').value = p.frequency || '';
    document.getElementById('soap-duration').value = p.duration || '';
    document.getElementById('soap-next-visit').value = p.nextVisit || '';
    document.getElementById('soap-precautions').value = p.precautions || '';
    document.getElementById('soap-referral').value = p.referral || '';
}

function collectSoapData() {
    return {
        subjective: {
            chiefComplaint: document.getElementById('soap-chief-complaint').value.trim(),
            painScale: parseInt(document.getElementById('soap-pain-scale').value, 10) || 0,
            symptomDescription: document.getElementById('soap-symptom-desc').value.trim(),
            painLocation: document.getElementById('soap-pain-location').value.trim(),
            onset: document.getElementById('soap-onset').value.trim(),
            aggravating: document.getElementById('soap-aggravating').value.trim(),
            relieving: document.getElementById('soap-relieving').value.trim(),
        },
        objective: {
            autoFindings: document.getElementById('soap-auto-findings').value.trim(),
            rom: document.getElementById('soap-rom').value.trim(),
            mmt: document.getElementById('soap-mmt').value.trim(),
            specialTests: document.getElementById('soap-special-tests').value.trim(),
            palpation: document.getElementById('soap-palpation').value.trim(),
            gait: document.getElementById('soap-gait').value.trim(),
            additionalFindings: document.getElementById('soap-additional-findings').value.trim(),
        },
        assessment: {
            clinicalImpression: document.getElementById('soap-clinical-impression').value.trim(),
            progressLevel: document.getElementById('soap-progress-level').value,
            functionalLevel: document.getElementById('soap-functional-level').value.trim(),
            goals: document.getElementById('soap-goals').value.trim(),
        },
        plan: {
            treatment: document.getElementById('soap-treatment').value.trim(),
            hep: document.getElementById('soap-hep').value.trim(),
            frequency: document.getElementById('soap-frequency').value.trim(),
            duration: document.getElementById('soap-duration').value.trim(),
            nextVisit: document.getElementById('soap-next-visit').value.trim(),
            precautions: document.getElementById('soap-precautions').value.trim(),
            referral: document.getElementById('soap-referral').value.trim(),
        }
    };
}

function fillObjectiveAutoFindings() {
    const currentAssessment = getCurrentAssessment();
    if (!currentAssessment) return;
    const lines = [];

    const selections = currentAssessment.selections || [];
    const sevGroups = {};
    for (const s of selections) {
        if (!s.severity || s.severity === 'normal') continue;
        const label = s.region || s.meshId;
        if (!sevGroups[s.severity]) sevGroups[s.severity] = [];
        if (!sevGroups[s.severity].includes(label)) {
            sevGroups[s.severity].push(label);
        }
    }
    for (const [sev, regions] of Object.entries(sevGroups)) {
        lines.push(`[${SEV_LABELS[sev] || sev}] ${regions.join(', ')}`);
    }

    const pa = currentAssessment.postureAnalysis;
    if (pa && pa.metrics) {
        lines.push('--- 자세분석 ---');
        const m = pa.metrics;
        if (m.forwardHead) lines.push(`전방두부: ${m.forwardHead.value}° (${SEV_LABELS[m.forwardHead.severity] || m.forwardHead.severity})`);
        if (m.shoulderDiff) lines.push(`어깨 높이차: ${m.shoulderDiff.value}cm`);
        if (m.pelvicTilt) lines.push(`골반 기울기: ${m.pelvicTilt.value}°`);
        if (m.trunkTilt) lines.push(`체간 측방: ${m.trunkTilt.value}°`);
    }

    document.getElementById('soap-auto-findings').value = lines.join('\n');
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
