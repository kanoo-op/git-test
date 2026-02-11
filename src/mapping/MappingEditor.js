// MappingEditor.js - Mapping CRUD, assign mode, region detail

import * as storage from '../services/Storage.js';
import { highlightMesh, unhighlightMesh, resetRegionColors } from '../anatomy/Highlights.js';
import {
    addRegion, deleteRegion, addMeshToRegion, removeMeshFromRegion,
    getMappingRegions, exportMappingJson, getMeshRegionKey, getAllRegionKeysWithLabels,
    getRegionColor, ensureMapping, loadMapping, regionKeyToLabel,
    REGION_GROUPS
} from '../anatomy/Regions.js';
import { renderMappingStatus } from '../ui/Sidebar.js';
import { escapeHtml } from '../utils/helpers.js';
import {
    isMappingAssignMode, setAssignMode,
    getSelectedRegionKey, setSelectedRegionKey,
    getLoadedAssessmentId,
} from '../ui/ViewRouter.js';
import { restoreAssessmentHighlights, renderRegionAssessmentPanel } from '../patients/AssessmentManager.js';

function persistMapping() {
    const json = exportMappingJson();
    json.version = Math.max((json.version || 1) - 1, 1);
    storage.saveMapping(json);
    renderMappingStatus();
}

export function handleMappingAssign(mesh) {
    const selectedRegionKey = getSelectedRegionKey();
    if (!isMappingAssignMode() || !selectedRegionKey || !mesh) return;
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
    if (!isMappingAssignMode() || !mesh) return;
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

export function renderMappingEditor() {
    const listEl = document.getElementById('me-region-list');
    const allRegions = getAllRegionKeysWithLabels();
    const regionMap = new Map(allRegions.map(r => [r.key, r]));
    const selectedRegionKey = getSelectedRegionKey();

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
            setSelectedRegionKey(item.dataset.regionKey);
            renderMappingEditor();
            renderRegionDetail();
        });
    });

    if (selectedRegionKey) renderRegionDetail();
}

function renderRegionDetail() {
    const detailEl = document.getElementById('me-region-detail');
    const regions = getMappingRegions();
    const selectedRegionKey = getSelectedRegionKey();

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
    if (isMappingAssignMode()) {
        assignBtn.textContent = '할당 중...';
        assignBtn.style.background = '#9575CD';
    } else {
        assignBtn.textContent = '메쉬 할당';
        assignBtn.style.background = '';
    }
}

export function showNewRegionForm() {
    document.getElementById('new-region-form').style.display = 'block';
    document.getElementById('input-region-name').value = '';
    document.getElementById('select-region-side').value = '';
    document.getElementById('input-region-name').focus();
}

export function hideNewRegionForm() {
    document.getElementById('new-region-form').style.display = 'none';
}

export function saveNewRegion() {
    const name = document.getElementById('input-region-name').value.trim();
    const side = document.getElementById('select-region-side').value;
    if (!name) { document.getElementById('input-region-name').focus(); return; }

    const key = name.toLowerCase().replace(/\s+/g, '_') + side;
    ensureMapping();
    addRegion(key);
    persistMapping();
    hideNewRegionForm();

    setSelectedRegionKey(key);
    renderMappingEditor();
    renderRegionDetail();
}

export function startAssignMode() {
    if (!getSelectedRegionKey()) return;
    setAssignMode(true);
    const banner = document.getElementById('mapping-banner');
    banner.style.display = 'flex';
    document.getElementById('mapping-banner-region').textContent = regionKeyToLabel(getSelectedRegionKey());
    renderRegionDetail();
}

export function stopAssignMode() {
    setAssignMode(false);
    document.getElementById('mapping-banner').style.display = 'none';
    resetRegionColors();

    const loadedAssessmentId = getLoadedAssessmentId();
    if (loadedAssessmentId) {
        const patient = storage.getCurrentPatient();
        if (patient) {
            const assessment = storage.getAssessment(patient.id, loadedAssessmentId);
            if (assessment) restoreAssessmentHighlights(assessment);
        }
    }
    renderRegionDetail();
}

export function deleteSelectedRegion() {
    const selectedRegionKey = getSelectedRegionKey();
    if (!selectedRegionKey) return;
    const label = regionKeyToLabel(selectedRegionKey);
    if (!confirm(`"${label}" 부위를 삭제하고 모든 메쉬 할당을 해제하시겠습니까?`)) return;

    if (isMappingAssignMode()) stopAssignMode();
    deleteRegion(selectedRegionKey);
    persistMapping();
    setSelectedRegionKey(null);
    renderMappingEditor();
    document.getElementById('me-region-detail').style.display = 'none';
}

export function exportMapping() {
    const json = exportMappingJson();
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapping-v${json.version}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function handleMappingFileImport(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        try {
            const json = JSON.parse(evt.target.result);
            if (!json.regions) {
                window.showToast('잘못된 매핑 파일: "regions" 필드가 없습니다.', 'error');
                return;
            }
            loadMapping(json);
            storage.saveMapping(json);
            renderMappingStatus();
            renderMappingEditor();
            renderRegionAssessmentPanel();
            window.showToast('매핑 파일을 불러왔습니다.', 'success');
        } catch (err) {
            window.showToast('매핑 JSON 파싱 실패: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    fileInput.value = '';
}

export function initMappingImportButtons() {
    const editorImportBtn = document.getElementById('btn-import-mapping');
    const editorFileInput = document.getElementById('input-mapping-editor-file');
    if (editorImportBtn && editorFileInput) {
        editorImportBtn.addEventListener('click', () => editorFileInput.click());
        editorFileInput.addEventListener('change', () => handleMappingFileImport(editorFileInput));
    }

    const rapImportBtn = document.getElementById('btn-load-mapping-rap');
    const rapFileInput = document.getElementById('input-mapping-rap-file');
    if (rapImportBtn && rapFileInput) {
        rapImportBtn.addEventListener('click', () => rapFileInput.click());
        rapFileInput.addEventListener('change', () => handleMappingFileImport(rapFileInput));
    }
}
