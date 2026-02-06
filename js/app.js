// app.js - Application entry point and coordinator

import { initScene, loadModel, startRenderLoop } from './viewer.js';
import { initControls } from './controls.js';
import { initSidebar } from './sidebar.js';
import { initPanels, switchView, openContextPanel, closeContextPanel, isMappingAssignMode, handleMappingAssign, handleMappingRemove } from './panels.js';
import { selectMesh, deselectCurrentMesh, getSelectedMesh } from './highlights.js';
import { exportAllData } from './storage.js';

// DOM references
const loadingOverlay = document.getElementById('loading-overlay');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressPercent = document.getElementById('progress-percent');
const progressText = document.getElementById('progress-text');
const protocolWarning = document.getElementById('protocol-warning');
const app = document.getElementById('app');
const tooltip = document.getElementById('tooltip');
const tooltipTissue = document.getElementById('tooltip-tissue');
const tooltipRegion = document.getElementById('tooltip-region');
const tooltipMapped = document.getElementById('tooltip-mapped');
const canvas = document.getElementById('three-canvas');

// Check for file:// protocol
if (window.location.protocol === 'file:') {
    protocolWarning.style.display = 'flex';
}

// --- Initialize Three.js ---
initScene(canvas);

// --- Load Model ---
loadModel(
    // onProgress
    (percent, mbLoaded, mbTotal) => {
        progressBarFill.style.width = percent + '%';
        progressPercent.textContent = Math.round(percent) + '%';
        progressText.textContent = `근육 모델 로딩 중 (${mbLoaded} / ${mbTotal} MB)`;
    },
    // onComplete
    (modelRoot, bounds) => {
        // Fade out loading overlay
        loadingOverlay.classList.add('fade-out');
        app.style.display = 'flex';

        // Start render loop
        startRenderLoop();

        // Initialize controls
        initControls(canvas, {
            onMeshClick: handleMeshClick,
            onMeshHover: handleMeshHover,
            onMeshRightClick: handleMeshRightClick
        });

        // Initialize UI
        initSidebar({
            onNavigate: (view) => switchView(view),
            onExport: () => exportAllData()
        });

        initPanels();

        // Remove loading overlay from DOM after animation
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 700);
    },
    // onError
    (error) => {
        progressText.textContent = '모델 로딩 오류. 로컬 HTTP 서버를 실행해 주세요.';
        progressPercent.textContent = '';
        progressBarFill.style.width = '0%';
        progressBarFill.style.background = '#C45B4A';
        protocolWarning.style.display = 'flex';
    }
);

// --- Event Handlers ---

function handleMeshClick(mesh, info) {
    if (!mesh) return;

    // If in mapping assign mode, add mesh to selected region
    if (isMappingAssignMode()) {
        handleMappingAssign(mesh);
        return;
    }

    const currentSel = getSelectedMesh();

    // Click same mesh → deselect + close panel
    if (currentSel === mesh) {
        deselectCurrentMesh();
        closeContextPanel();
        return;
    }

    // Deselect previous, select new
    deselectCurrentMesh();
    selectMesh(mesh);
    openContextPanel(mesh, info);
}

function handleMeshRightClick(mesh) {
    if (isMappingAssignMode()) {
        handleMappingRemove(mesh);
    }
}

function handleMeshHover(mesh, info) {
    if (mesh && info) {
        tooltip.style.display = 'block';
        tooltip.style.left = (info.x + 16) + 'px';
        tooltip.style.top = (info.y + 16) + 'px';
        tooltipTissue.textContent = info.tissue;
        tooltipRegion.textContent = `${info.region} (${info.side})`;

        // Show mapping source indicator
        if (info.source === 'mapping') {
            tooltipMapped.style.display = 'block';
            tooltipMapped.textContent = '매핑됨';
        } else {
            tooltipMapped.style.display = 'none';
        }

        // Keep tooltip within viewport
        const rect = tooltip.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            tooltip.style.left = (info.x - rect.width - 16) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            tooltip.style.top = (info.y - rect.height - 16) + 'px';
        }
    } else {
        tooltip.style.display = 'none';
    }
}
