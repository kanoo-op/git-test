// main.js - Application entry point and coordinator

import './styles/main.css';

import { initScene, startRenderLoop, captureScreenshot } from './core/SceneManager.js';
import { loadModel } from './core/ModelLoader.js';
import { scene, camera } from './core/SceneManager.js';
import { initControls } from './core/Controls.js';
import { onHover, initSelectionKeyboard } from './core/SelectionService.js';
import { initSidebar, initFloatingControls } from './ui/Sidebar.js';
import { initPanels, switchView } from './ui/ViewRouter.js';
import { initDevSettings } from './ui/DevSettings.js';
import { closeContextPanel } from './ui/ContextPanel.js';
import { setRenderMode } from './anatomy/Highlights.js';
import { exportAllData, clearMappingData } from './services/Storage.js';
import { initPostureUI } from './pose/PoseUI.js';
import { initRealtimePoseUI } from './pose/RealtimeUI.js';
import { initPoseDashboard, updateDashboardFromAnalysis, refreshDashboardCharts } from './pose/PoseDashboard.js';
import { initMultiView, setViewMode } from './core/MultiView.js';
import { initExerciseRecPanel, hideExerciseRecommendations } from './ui/ExerciseRecommendation.js';
import { initExerciseMode, stopExerciseMode } from './pose/ExerciseMode.js';
import { initReportPanel } from './ui/ReportPanel.js';
import { initSoapRecordsView } from './patients/SoapRecords.js';
import { initAuth, handleLogout } from './services/Auth.js';

// Toast + Video Modal (self-registering on window)
import './ui/Toast.js';
import './ui/VideoModal.js';

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

// One-time: clear old mapping cache so default mapping_Final.json loads with v2 region structure
if (!localStorage.getItem('_mapping_migrated_v2')) {
    clearMappingData();
    localStorage.setItem('_mapping_migrated_v2', 'true');
}

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
    async (modelRoot, bounds) => {
        // Start render loop (background, not visible yet)
        startRenderLoop();

        // Initialize auth - shows login overlay if not authenticated
        // App is hidden until authentication succeeds
        initAuth(() => {
            // Called after successful authentication — now show the app
            loadingOverlay.classList.add('fade-out');
            app.style.display = 'flex';
        });

        // Initialize controls (selection logic lives in SelectionService)
        initControls(canvas, {
            modelCenter: bounds.center
        });

        // Initialize UI
        initSidebar({
            onNavigate: (view) => switchView(view),
            onExport: () => exportAllData()
        });

        initPanels();
        initFloatingControls();
        initDevSettings();

        // Logout button
        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
        initPostureTabs();
        initPostureUI();
        initRealtimePoseUI();
        initPoseDashboard();
        window._refreshDashboardCharts = refreshDashboardCharts;
        window._updateDashboardFromAnalysis = updateDashboardFromAnalysis;
        initMultiView(canvas, scene, camera, bounds.center);
        initExerciseRecPanel();
        initExerciseMode();
        initReportPanel();
        initSoapRecordsView();

        // Selection service: keyboard bindings + hover tooltip listener
        initSelectionKeyboard();
        onHover(({ mesh, info }) => handleMeshHover(mesh, info));

        initViewModeToggle();
        initRenderModeToggle();
        initMobileMenu();
        initKeyboardShortcuts();
        initThemeToggle();

        // Default view: dashboard
        switchView('session-timeline');

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

function handleMeshHover(mesh, info) {
    if (mesh && info) {
        tooltip.style.display = 'block';
        tooltip.style.left = (info.x + 16) + 'px';
        tooltip.style.top = (info.y + 16) + 'px';
        tooltipTissue.textContent = info.tissue;
        tooltipRegion.textContent = `${info.region} (${info.side})`;

        if (info.source === 'mapping') {
            tooltipMapped.style.display = 'block';
            tooltipMapped.textContent = '매핑됨';
        } else {
            tooltipMapped.style.display = 'none';
        }

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

// ===== Posture Tabs =====

function initPostureTabs() {
    document.querySelectorAll('.posture-tab[data-posture-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab button
            document.querySelectorAll('.posture-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding content
            const target = tab.dataset.postureTab;
            document.querySelectorAll('.posture-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const targetContent = document.getElementById(`posture-tab-${target}`);
            if (targetContent) targetContent.classList.add('active');

            // Refresh charts when switching to dashboard tab
            if (target === 'dashboard' && window._refreshDashboardCharts) {
                window._refreshDashboardCharts();
            }
        });
    });
}

// ===== 3D Screenshot =====

function handleScreenshot() {
    try {
        const dataUrl = captureScreenshot();
        if (!dataUrl) {
            window.showToast('스크린샷을 캡처할 수 없습니다.', 'error');
            return;
        }
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `postureview-screenshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
        a.click();
        window.showToast('스크린샷이 저장되었습니다.', 'success');
    } catch (e) {
        window.showToast('스크린샷 저장 실패: ' + e.message, 'error');
    }
}

document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-screenshot')) {
        handleScreenshot();
    }
});

// ===== Mobile Menu =====

function initMobileMenu() {
    const hamburger = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!hamburger || !sidebar || !overlay) return;

    hamburger.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    });

    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });

    sidebar.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            }
        });
    });
}

// ===== Keyboard Shortcuts =====

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (!e.target.matches('input, textarea, select') && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if (e.key === '1') { switchViewMode('single'); return; }
            if (e.key === '2') { switchViewMode('dual'); return; }
            if (e.key === '4') { switchViewMode('quad'); return; }
        }

        if (e.key === 'Escape') {
            const exerciseMode = document.getElementById('exercise-mode-overlay');
            if (exerciseMode && exerciseMode.style.display !== 'none') {
                stopExerciseMode();
                return;
            }
            const devSettings = document.getElementById('dev-settings-overlay');
            if (devSettings && devSettings.style.display !== 'none') {
                devSettings.style.display = 'none';
                return;
            }
            const videoModal = document.getElementById('video-modal-overlay');
            if (videoModal && videoModal.style.display !== 'none') {
                window.closeExerciseVideo();
                return;
            }
            const endModal = document.getElementById('end-assessment-overlay');
            if (endModal && endModal.style.display !== 'none') {
                endModal.style.display = 'none';
                return;
            }
            const recPanel = document.getElementById('exercise-rec-panel');
            if (recPanel && recPanel.style.display !== 'none') {
                hideExerciseRecommendations();
                return;
            }
            const contextPanel = document.getElementById('context-panel');
            if (contextPanel && contextPanel.classList.contains('open')) {
                closeContextPanel();
                return;
            }
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                document.getElementById('sidebar-overlay')?.classList.remove('active');
                return;
            }
        }
    });
}

// ===== View Mode Toggle =====

function initViewModeToggle() {
    document.querySelectorAll('.view-mode-btn[data-view-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.viewMode;
            switchViewMode(mode);
        });
    });
}

function switchViewMode(mode) {
    setViewMode(mode);
    document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.view-mode-btn[data-view-mode="${mode}"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

// ===== Render Mode Toggle =====

function initRenderModeToggle() {
    document.querySelectorAll('.render-mode-btn[data-render-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchRenderMode(btn.dataset.renderMode);
        });
    });
}

function switchRenderMode(mode) {
    setRenderMode(mode);
    document.querySelectorAll('.render-mode-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.render-mode-btn[data-render-mode="${mode}"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

// ===== Theme Toggle =====

function initThemeToggle() {
    const saved = localStorage.getItem('postureview_theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateThemeLabel();

    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
        btn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (isDark) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('postureview_theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('postureview_theme', 'dark');
            }
            updateThemeLabel();
        });
    }
}

function updateThemeLabel() {
    const label = document.querySelector('.theme-label-text');
    if (label) {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        label.textContent = isDark ? '라이트모드' : '다크모드';
    }
}

