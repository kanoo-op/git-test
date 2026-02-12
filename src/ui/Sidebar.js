// Sidebar.js - Sidebar navigation and controls

import { setTissueVisible, setTissueOpacity } from '../anatomy/Highlights.js';
import { setCameraPreset } from '../core/Controls.js';
import { loadMapping, clearMapping, getMappingInfo, hasMappingLoaded } from '../anatomy/Regions.js';
import { saveMapping, getMapping, clearMappingData } from '../services/Storage.js';

/**
 * Initialize sidebar interactions
 */
export function initSidebar(callbacks = {}) {
    // Navigation
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const view = btn.dataset.view;
            if (callbacks.onNavigate) callbacks.onNavigate(view);
        });
    });

    // Export button
    const exportBtn = document.getElementById('btn-export');
    if (exportBtn && callbacks.onExport) {
        exportBtn.addEventListener('click', callbacks.onExport);
    }

    // Auto-load mapping (no sidebar UI, just background load)
    loadDefaultMapping();
}

/**
 * Initialize floating controls inside the 3D viewer
 * (tissue toggles + camera presets moved from sidebar)
 */
export function initFloatingControls() {
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
        const diagnosis = patient.diagnosis || '';
        metaEl.textContent = diagnosis
            ? `나이: ${age} | ${diagnosis} | 평가: ${assessCount}건`
            : `나이: ${age} | 평가: ${assessCount}건`;
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

/**
 * Load default mapping from mapping_Final.json (auto-load, no UI)
 */
async function loadDefaultMapping() {
    const savedMapping = getMapping();
    if (savedMapping) {
        loadMapping(savedMapping);
        return;
    }

    try {
        const res = await fetch('./mapping_Final.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.regions) {
            loadMapping(json);
            saveMapping(json);
        }
    } catch (err) {
        console.warn('기본 매핑 로드 실패:', err);
    }
}

/**
 * renderMappingStatus - kept as no-op for backward compatibility
 */
export function renderMappingStatus() {
    // Mapping status is now rendered in DevSettings
}
