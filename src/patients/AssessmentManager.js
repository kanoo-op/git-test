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
import { initVoiceInput, resetVoiceInput, preserveExistingText, applyAutoSuggestions, getTagsSummary } from '../ui/VoiceInput.js';

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
    autoFillAllSoapSections();

    // 전체 자동채우기 버튼
    const soapAutoFillBtn = document.getElementById('soap-autofill-btn');
    if (soapAutoFillBtn) {
        soapAutoFillBtn.onclick = () => {
            autoFillAllSoapSections();
            window.showToast?.('빈 필드에 자동 소견이 채워졌습니다.', 'success', 2000);
        };
    }

    // 음성 입력 초기화
    resetVoiceInput();
    initVoiceInput({
        targetId: 'soap-symptom-desc',
        tagsContainerId: 'voice-tags',
        micBtnId: 'voice-mic-btn',
        statusId: 'voice-status',
        onTags: (tags) => {
            const autoBtn = document.getElementById('voice-autofill-btn');
            if (autoBtn) autoBtn.style.display = tags.size > 0 ? 'inline-flex' : 'none';
        }
    });

    // 자동채우기 버튼
    const autoFillBtn = document.getElementById('voice-autofill-btn');
    if (autoFillBtn) {
        autoFillBtn.onclick = () => {
            applyAutoSuggestions();
            window.showToast?.('감지된 키워드가 빈 필드에 자동 적용되었습니다.', 'success', 2000);
        };
    }

    document.getElementById('soap-chief-complaint').focus();
}

export function hideEndAssessmentModal() {
    document.getElementById('end-assessment-overlay').style.display = 'none';
    resetVoiceInput();
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

function serializeVoiceTags() {
    const tags = getTagsSummary();
    if (tags.size === 0) return null;
    const obj = {};
    for (const [cat, keywords] of tags) {
        obj[cat] = keywords;
    }
    return obj;
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
            voiceTags: serializeVoiceTags(),
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

    // regionKey 기반으로 중증도 그룹핑 (중복 제거, 최고 중증도 유지)
    const SEV_ORDER = { severe: 3, moderate: 2, mild: 1, normal: 0 };
    const regionSevMap = new Map();
    for (const s of selections) {
        if (!s.severity || s.severity === 'normal') continue;
        const key = s.regionKey || s.region || s.meshId;
        const existing = regionSevMap.get(key);
        if (!existing || (SEV_ORDER[s.severity] || 0) > (SEV_ORDER[existing] || 0)) {
            regionSevMap.set(key, s.severity);
        }
    }

    // 중증도별 그룹 (해부학 이름 사용)
    const sevGroups = {};
    for (const [key, sev] of regionSevMap) {
        const info = getAnatomyInfo(key);
        const label = info ? info.name : (regionKeyToLabel(key) || key);
        if (!sevGroups[sev]) sevGroups[sev] = [];
        sevGroups[sev].push(label);
    }

    // 중증 → 경도 순으로 출력
    const sevOrder = ['severe', 'moderate', 'mild'];
    for (const sev of sevOrder) {
        if (sevGroups[sev]) {
            lines.push(`[${SEV_LABELS[sev]}] ${sevGroups[sev].join(', ')}`);
        }
    }

    // 자세분석 지표
    const pa = currentAssessment.postureAnalysis;
    if (pa && pa.metrics) {
        lines.push('');
        lines.push('── 자세분석 지표 ──');
        const m = pa.metrics;
        if (m.forwardHead) lines.push(`전방두부: ${m.forwardHead.value}° (${SEV_LABELS[m.forwardHead.severity] || m.forwardHead.severity})`);
        if (m.shoulderDiff) lines.push(`어깨 높이차: ${m.shoulderDiff.value}cm (${SEV_LABELS[m.shoulderDiff.severity] || ''})`);
        if (m.pelvicTilt) lines.push(`골반 기울기: ${m.pelvicTilt.value}° (${SEV_LABELS[m.pelvicTilt.severity] || ''})`);
        if (m.trunkTilt) lines.push(`체간 측방: ${m.trunkTilt.value}° (${SEV_LABELS[m.trunkTilt.severity] || ''})`);
        if (m.kneeLeft && m.kneeLeft.severity !== 'normal') lines.push(`좌측 무릎: ${m.kneeLeft.type} (${SEV_LABELS[m.kneeLeft.severity]})`);
        if (m.kneeRight && m.kneeRight.severity !== 'normal') lines.push(`우측 무릎: ${m.kneeRight.type} (${SEV_LABELS[m.kneeRight.severity]})`);
        if (m.kyphosis && m.kyphosis.severity !== 'normal') lines.push(`상부 후만: ${SEV_LABELS[m.kyphosis.severity]}`);
    }

    // 주요 관련 근육 요약
    const affectedMuscles = new Set();
    for (const [key] of regionSevMap) {
        const info = getAnatomyInfo(key);
        if (info && info.keyMuscles) {
            info.keyMuscles.slice(0, 2).forEach(m => affectedMuscles.add(m));
        }
    }
    if (affectedMuscles.size > 0) {
        lines.push('');
        lines.push(`관련 근육: ${[...affectedMuscles].join(', ')}`);
    }

    document.getElementById('soap-auto-findings').value = lines.join('\n');
}

// ======== SOAP 전체 자동채우기 ========

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

export function autoFillAllSoapSections() {
    const currentAssessment = getCurrentAssessment();
    if (!currentAssessment) return;

    const patient = storage.getCurrentPatient();
    if (!patient) return;

    const regionSevMap = getRegionSeverityMap(currentAssessment);

    // === S (Subjective): 통증 위치 ===
    const painLocEl = document.getElementById('soap-pain-location');
    if (painLocEl && !painLocEl.value.trim()) {
        const painParts = [];
        for (const [key] of regionSevMap) {
            const info = getAnatomyInfo(key);
            const label = info ? info.name : (regionKeyToLabel(key) || key);
            painParts.push(label);
        }
        if (painParts.length > 0) {
            painLocEl.value = painParts.join(', ');
        }
    }

    // === S (Subjective): VAS 통증 척도 ===
    const vasSlider = document.getElementById('soap-pain-scale');
    const vasValue = document.getElementById('soap-vas-value');
    if (vasSlider && parseInt(vasSlider.value, 10) === 0 && regionSevMap.size > 0) {
        let maxSev = 0;
        for (const sev of regionSevMap.values()) {
            const rank = severityRank(sev);
            if (rank > maxSev) maxSev = rank;
        }
        const vasMap = { 3: 7, 2: 5, 1: 3 };
        const suggestedVas = vasMap[maxSev] || 0;
        if (suggestedVas > 0) {
            vasSlider.value = suggestedVas;
            if (vasValue) vasValue.textContent = String(suggestedVas);
        }
    }

    // === A (Assessment): 진행 수준 ===
    const progressEl = document.getElementById('soap-progress-level');
    if (progressEl && progressEl.value === 'initial') {
        const prevAssessments = (patient.assessments || [])
            .filter(a => a.id !== currentAssessment.id)
            .sort((a, b) => (b.date || 0) - (a.date || 0));

        if (prevAssessments.length > 0) {
            const prevMap = getRegionSeverityMap(prevAssessments[0]);
            const curValues = [...regionSevMap.values()].map(severityRank);
            const prevValues = [...prevMap.values()].map(severityRank);

            // 비교 가능한 데이터가 양쪽 모두 있을 때만 판정
            if (curValues.length > 0 || prevValues.length > 0) {
                const avgSev = arr => arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
                const curAvg = avgSev(curValues);
                const prevAvg = avgSev(prevValues);

                if (curAvg < prevAvg - 0.3) {
                    progressEl.value = 'improving';
                } else if (curAvg > prevAvg + 0.3) {
                    progressEl.value = 'worsening';
                } else {
                    progressEl.value = 'plateau';
                }
            }
        }
    }

    // === A (Assessment): 임상 소견 ===
    const impressionEl = document.getElementById('soap-clinical-impression');
    if (impressionEl && !impressionEl.value.trim()) {
        const parts = [];

        // 부위별 심각도 요약 (중증→경도 순 정렬)
        const sevOrder = ['severe', 'moderate', 'mild'];
        const sevSummary = [];
        for (const sev of sevOrder) {
            for (const [key, s] of regionSevMap) {
                if (s !== sev) continue;
                const info = getAnatomyInfo(key);
                const label = info ? info.name : (regionKeyToLabel(key) || key);
                sevSummary.push(`${label} ${SEV_LABELS[sev]}`);
            }
        }
        if (sevSummary.length > 0) parts.push(sevSummary.join(', '));

        // 관련 질환 추정 (moderate/severe만)
        const diseases = new Set();
        for (const [key, sev] of regionSevMap) {
            if (sev === 'mild') continue;
            const info = getAnatomyInfo(key);
            if (info && info.commonPathologies && info.commonPathologies.length > 0) {
                diseases.add(info.commonPathologies[0] + ' 의심');
            }
        }
        if (diseases.size > 0) parts.push('관련 질환: ' + [...diseases].join(', '));

        // 자세분석 지표 요약
        const pa = currentAssessment.postureAnalysis;
        if (pa && pa.metrics) {
            const m = pa.metrics;
            const postureParts = [];
            if (m.forwardHead) postureParts.push(`전방두부 ${m.forwardHead.value}°`);
            if (m.shoulderDiff && m.shoulderDiff.severity !== 'normal') postureParts.push(`어깨 높이차 ${m.shoulderDiff.value}cm`);
            if (m.pelvicTilt && m.pelvicTilt.severity !== 'normal') postureParts.push(`골반 기울기 ${m.pelvicTilt.value}°`);
            if (postureParts.length > 0) parts.push(postureParts.join(', '));
        }

        if (parts.length > 0) {
            impressionEl.value = parts.join('. ') + '.';
        }
    }

    // === P (Plan): 홈 운동 프로그램 (좌/우 중복 제거) ===
    const hepEl = document.getElementById('soap-hep');
    if (hepEl && !hepEl.value.trim()) {
        const seenBaseRegions = new Set();
        const exerciseParts = [];
        for (const [key] of regionSevMap) {
            // 좌/우 접미사 제거하여 기본 부위명 추출
            const baseKey = key.replace(/_(l|r)$/, '');
            if (seenBaseRegions.has(baseKey)) continue;
            seenBaseRegions.add(baseKey);

            const info = getAnatomyInfo(key);
            if (info && info.exercises && info.exercises.length > 0) {
                // 좌/우 표기 없는 부위명 사용
                const regionLabel = info.name.replace(/ \((좌|우)\)$/, '');
                const exNames = info.exercises.slice(0, 2).map(e => e.name).join(', ');
                exerciseParts.push(`${regionLabel}: ${exNames}`);
            }
        }
        if (exerciseParts.length > 0) {
            hepEl.value = exerciseParts.join(' / ');
        }
    }

    // === P (Plan): 빈도 ===
    const freqEl = document.getElementById('soap-frequency');
    if (freqEl && !freqEl.value.trim()) {
        let maxSev = 0;
        for (const sev of regionSevMap.values()) {
            const rank = severityRank(sev);
            if (rank > maxSev) maxSev = rank;
        }
        if (maxSev >= 3) {
            freqEl.value = '주 3~5회';
        } else if (maxSev >= 2) {
            freqEl.value = '주 2~3회';
        } else if (maxSev >= 1) {
            freqEl.value = '주 1~2회';
        }
    }
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
