// sidebar.js - Sidebar navigation and tissue controls

import { setTissueVisible, setTissueOpacity, clearAllHighlights } from './highlights.js';
import { setCameraPreset } from './controls.js';
import { loadMapping, clearMapping, getMappingInfo, hasMappingLoaded } from './regions.js';
import { saveMapping, getMapping, clearMappingData } from './storage.js';
import { loadModel, getCurrentModelKey } from './viewer.js';

/**
 * Initialize sidebar interactions
 */
export function initSidebar(callbacks = {}) {
    // Navigation
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const view = btn.dataset.view;
            if (callbacks.onNavigate) callbacks.onNavigate(view);
        });
    });

    // Tissue visibility toggles
    document.querySelectorAll('[data-tissue]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            setTissueVisible(checkbox.dataset.tissue, checkbox.checked);
        });
    });

    // Tissue opacity sliders
    document.querySelectorAll('[data-tissue-opacity]').forEach(slider => {
        slider.addEventListener('input', () => {
            const opacity = parseInt(slider.value) / 100;
            setTissueOpacity(slider.dataset.tissueOpacity, opacity);
        });
    });

    // Camera presets
    document.querySelectorAll('[data-view-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            setCameraPreset(btn.dataset.viewPreset);
        });
    });

    // Export button
    const exportBtn = document.getElementById('btn-export');
    if (exportBtn && callbacks.onExport) {
        exportBtn.addEventListener('click', callbacks.onExport);
    }

    // --- Model selector ---
    initModelSelector();

    // --- Mapping ---
    initMappingUI();
}

/**
 * Update patient card display in sidebar
 */
export function updatePatientCard(patient) {
    const card = document.getElementById('patient-card');
    const nameEl = document.getElementById('patient-name');
    const metaEl = document.getElementById('patient-meta');

    if (patient) {
        card.style.display = 'block';
        nameEl.textContent = patient.name;
        const age = patient.dob ? calculateAge(patient.dob) : '-';
        const assessCount = patient.assessments ? patient.assessments.length : 0;
        metaEl.textContent = `나이: ${age} | 평가: ${assessCount}건`;
    } else {
        card.style.display = 'none';
    }
}

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

// ======== Model Selector ========

function initModelSelector() {
    const select = document.getElementById('select-model');
    const loadingBar = document.getElementById('model-loading-bar');
    const loadingFill = document.getElementById('model-loading-fill');

    select.value = getCurrentModelKey();

    select.addEventListener('change', () => {
        const key = select.value;
        if (key === getCurrentModelKey()) return;

        // Show loading bar
        loadingBar.style.display = 'block';
        loadingFill.style.width = '0%';
        select.disabled = true;

        clearAllHighlights();

        loadModel(
            key,
            // onProgress
            (percent) => {
                loadingFill.style.width = percent + '%';
            },
            // onComplete
            () => {
                loadingBar.style.display = 'none';
                loadingFill.style.width = '0%';
                select.disabled = false;
            },
            // onError
            (err) => {
                loadingBar.style.display = 'none';
                select.disabled = false;
                select.value = getCurrentModelKey();
                alert('모델 로딩 실패: ' + (err.message || err));
            }
        );
    });
}

// ======== Mapping UI ========

function initMappingUI() {
    const fileInput = document.getElementById('input-mapping-file');
    const loadBtn = document.getElementById('btn-load-mapping');
    const clearBtn = document.getElementById('btn-clear-mapping');

    // Load button triggers file input
    loadBtn.addEventListener('click', () => fileInput.click());

    // File selected
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
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
                saveMapping(json);
                renderMappingStatus();
            } catch (err) {
                alert('매핑 JSON 파싱 실패: ' + err.message);
            }
        };
        reader.readAsText(file);
        // Reset so the same file can be re-selected
        fileInput.value = '';
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
        clearMapping();
        clearMappingData();
        renderMappingStatus();
    });

    // Restore saved mapping on init
    const savedMapping = getMapping();
    if (savedMapping) {
        loadMapping(savedMapping);
    }
    renderMappingStatus();
}

/**
 * Render the mapping status and region list in the sidebar
 */
export function renderMappingStatus() {
    const statusEl = document.getElementById('mapping-status');
    const regionsEl = document.getElementById('mapping-regions');
    const clearBtn = document.getElementById('btn-clear-mapping');
    const info = getMappingInfo();

    if (!info) {
        statusEl.innerHTML = `
            <div class="mapping-empty">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>매핑이 로드되지 않았습니다</span>
            </div>
        `;
        regionsEl.innerHTML = '';
        clearBtn.style.display = 'none';
        return;
    }

    const date = info.timestamp
        ? new Date(info.timestamp).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
        : '-';

    statusEl.innerHTML = `
        <div class="mapping-loaded">
            <div class="mapping-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                매핑 v${info.version}
            </div>
            <div class="mapping-meta">${info.regionCount}개 부위 | ${info.meshCount}개 메쉬 | ${date}</div>
        </div>
    `;

    clearBtn.style.display = 'flex';

    // Render region list
    regionsEl.innerHTML = info.regions.map(r => `
        <div class="mapping-region-item" data-region="${r.id}">
            <div class="region-name">
                <span class="region-dot"></span>
                <span>${r.label}</span>
            </div>
            <span class="mesh-count">${r.meshCount}</span>
        </div>
    `).join('');
}
