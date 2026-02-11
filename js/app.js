// app.js - Application entry point and coordinator

import { initScene, loadModel, startRenderLoop, captureScreenshot } from './viewer.js';
import { initControls } from './controls.js';
import { initSidebar } from './sidebar.js';
import { initPanels, switchView, openContextPanel, closeContextPanel, isMappingAssignMode, handleMappingAssign, handleMappingRemove } from './panels.js';
import { selectMesh, deselectCurrentMesh, getSelectedMesh } from './highlights.js';
import { exportAllData, clearMappingData, hasPinSet, verifyPin, setPin, removePin } from './storage.js';
import { initPostureUI } from './posture-ui.js';

// ===== Toast Notification System =====

const TOAST_ICONS = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
};

window.showToast = function(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" aria-label="닫기">&times;</button>
    `;

    container.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    const removeToast = () => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    };
    closeBtn.addEventListener('click', removeToast);

    if (duration > 0) {
        setTimeout(removeToast, duration);
    }
};

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
        // Check PIN lock before showing app
        await initPinLock();

        // Fade out loading overlay
        loadingOverlay.classList.add('fade-out');
        app.style.display = 'flex';

        // Start render loop
        startRenderLoop();

        // Initialize controls (pass model center so camera targets it, not origin)
        initControls(canvas, {
            onMeshClick: handleMeshClick,
            onMeshHover: handleMeshHover,
            onMeshRightClick: handleMeshRightClick,
            modelCenter: bounds.center
        });

        // Initialize UI
        initSidebar({
            onNavigate: (view) => switchView(view),
            onExport: () => exportAllData()
        });

        initPanels();
        initPostureUI();
        initMobileMenu();
        initKeyboardShortcuts();
        initPinManagement();

        // Default view: dashboard
        switchView('dashboard');

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

// Bind screenshot button (added via HUD)
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

    // Close sidebar when navigating on mobile
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
        // Esc = close panels/modals
        if (e.key === 'Escape') {
            const endModal = document.getElementById('end-assessment-overlay');
            if (endModal && endModal.style.display !== 'none') {
                endModal.style.display = 'none';
                return;
            }
            const photoModal = document.getElementById('photo-modal-overlay');
            if (photoModal && photoModal.style.display !== 'none') {
                photoModal.style.display = 'none';
                return;
            }
            const contextPanel = document.getElementById('context-panel');
            if (contextPanel && contextPanel.classList.contains('open')) {
                closeContextPanel();
                return;
            }
            // Close mobile sidebar
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
                document.getElementById('sidebar-overlay')?.classList.remove('active');
                return;
            }
        }
    });
}

// ===== PIN Lock =====

function initPinLock() {
    const overlay = document.getElementById('pin-overlay');
    const input = document.getElementById('pin-input');
    const error = document.getElementById('pin-error');
    const submitBtn = document.getElementById('btn-pin-submit');
    const setupBtn = document.getElementById('btn-pin-setup');

    if (!overlay) return Promise.resolve();

    if (!hasPinSet()) {
        // No PIN set - skip lock screen
        return Promise.resolve();
    }

    // PIN is set - show lock screen
    return new Promise((resolve) => {
        overlay.style.display = 'flex';
        submitBtn.style.display = '';
        setupBtn.style.display = 'none';
        setTimeout(() => input.focus(), 100);

        async function handleSubmit() {
            const pin = input.value.trim();
            if (!pin || pin.length < 4) {
                error.textContent = '4자리 PIN을 입력하세요.';
                input.focus();
                return;
            }
            submitBtn.disabled = true;
            try {
                const valid = await verifyPin(pin);
                if (valid) {
                    overlay.style.display = 'none';
                    resolve();
                } else {
                    error.textContent = 'PIN이 올바르지 않습니다.';
                    input.value = '';
                    input.focus();
                }
            } catch {
                error.textContent = '인증 오류가 발생했습니다.';
            }
            submitBtn.disabled = false;
        }

        submitBtn.addEventListener('click', handleSubmit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleSubmit();
        });
    });
}

// ===== PIN Management (sidebar) =====

function initPinManagement() {
    const footer = document.querySelector('.sidebar-footer');
    if (!footer) return;

    const pinBtn = document.createElement('button');
    pinBtn.className = 'footer-btn';
    pinBtn.id = 'btn-pin-manage';
    pinBtn.title = '데이터 보호 PIN 설정';
    pinBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        ${hasPinSet() ? 'PIN 변경' : 'PIN 설정'}
    `;
    footer.appendChild(pinBtn);

    pinBtn.addEventListener('click', () => {
        if (hasPinSet()) {
            showPinChangeDialog(pinBtn);
        } else {
            showPinSetupDialog(pinBtn);
        }
    });
}

function showPinSetupDialog(pinBtn) {
    const pin = prompt('새 4자리 PIN을 입력하세요 (숫자만):');
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) {
        window.showToast('PIN은 4자리 숫자여야 합니다.', 'warning');
        return;
    }
    const confirm2 = prompt('PIN을 다시 입력하세요:');
    if (pin !== confirm2) {
        window.showToast('PIN이 일치하지 않습니다.', 'error');
        return;
    }
    setPin(pin).then(() => {
        window.showToast('PIN이 설정되었습니다. 다음 접속 시 PIN 입력이 필요합니다.', 'success', 4000);
        if (pinBtn) pinBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            PIN 변경
        `;
    });
}

function showPinChangeDialog(pinBtn) {
    const action = prompt('1: PIN 변경\n2: PIN 제거\n번호를 입력하세요:');
    if (action === '1') {
        showPinSetupDialog(pinBtn);
    } else if (action === '2') {
        if (confirm('PIN을 제거하면 앱 시작 시 인증 없이 접속됩니다. 계속하시겠습니까?')) {
            removePin();
            window.showToast('PIN이 제거되었습니다.', 'info');
            if (pinBtn) pinBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                PIN 설정
            `;
        }
    }
}
