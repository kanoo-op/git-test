// auth.js - Login UI + token management for PostureView
// Replaces PIN-based auth with JWT login/session management

import * as api from './api.js';

let onAuthSuccess = null;

// --- Inactivity Timeout ---
const TIMEOUT_MS = 15 * 60 * 1000;       // 15 minutes
const WARNING_MS = 13 * 60 * 1000;       // 13 minutes (2 min warning)
let inactivityTimer = null;
let warningTimer = null;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
    hideTimeoutWarning();
    warningTimer = setTimeout(() => showTimeoutWarning(), WARNING_MS);
    inactivityTimer = setTimeout(() => forceLogout(), TIMEOUT_MS);
}

function startActivityMonitor() {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt =>
        document.addEventListener(evt, resetInactivityTimer, { passive: true })
    );
    resetInactivityTimer();
}

function stopActivityMonitor() {
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt =>
        document.removeEventListener(evt, resetInactivityTimer)
    );
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
}

function showTimeoutWarning() {
    const modal = document.getElementById('timeout-warning-modal');
    if (modal) modal.style.display = 'flex';
}

function hideTimeoutWarning() {
    const modal = document.getElementById('timeout-warning-modal');
    if (modal) modal.style.display = 'none';
}

async function forceLogout() {
    stopActivityMonitor();
    hideTimeoutWarning();
    await api.logout();
    showLoginOverlay('보안을 위해 자동 로그아웃 되었습니다 (15분 무활동).');
}

/**
 * Initialize auth system. Call on app load.
 * @param {Function} onSuccess - Callback when user is authenticated
 */
export function initAuth(onSuccess) {
    onAuthSuccess = onSuccess;

    // Listen for session expiry
    window.addEventListener('pv:auth:expired', () => {
        showLoginOverlay('세션이 만료되었습니다. 다시 로그인해 주세요.');
    });

    // Bind timeout warning extend button
    const extendBtn = document.getElementById('btn-extend-session');
    if (extendBtn && !extendBtn._bound) {
        extendBtn._bound = true;
        extendBtn.addEventListener('click', () => {
            hideTimeoutWarning();
            resetInactivityTimer();
        });
    }

    // Check for existing valid session
    if (api.isLoggedIn()) {
        // Verify token is still valid
        api.getMe().then(user => {
            api.setCurrentUser(user);
            updateUserDisplay(user);
            startActivityMonitor();
            if (onAuthSuccess) onAuthSuccess();
        }).catch(() => {
            // Token invalid, show login
            showLoginOverlay();
        });
    } else {
        showLoginOverlay();
    }
}

/**
 * Show login overlay
 */
export function showLoginOverlay(message = '') {
    const overlay = document.getElementById('login-overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = message ? 'block' : 'none';
    }

    const usernameInput = document.getElementById('login-username');
    if (usernameInput) {
        usernameInput.value = '';
        setTimeout(() => usernameInput.focus(), 100);
    }
    const passwordInput = document.getElementById('login-password');
    if (passwordInput) passwordInput.value = '';

    // Bind events (only once)
    const submitBtn = document.getElementById('btn-login-submit');
    if (submitBtn && !submitBtn._bound) {
        submitBtn._bound = true;
        submitBtn.addEventListener('click', handleLogin);
        passwordInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        usernameInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') passwordInput?.focus();
        });
    }
}

/**
 * Handle login form submit
 */
async function handleLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('btn-login-submit');

    if (!username || !password) {
        errorEl.textContent = '사용자명과 비밀번호를 입력하세요.';
        errorEl.style.display = 'block';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '로그인 중...';

    try {
        const data = await api.login(username, password);
        errorEl.style.display = 'none';

        // Hide overlay
        const overlay = document.getElementById('login-overlay');
        overlay.style.display = 'none';

        updateUserDisplay(data.user);
        startActivityMonitor();

        if (onAuthSuccess) onAuthSuccess();
    } catch (err) {
        errorEl.textContent = err.message || '로그인 실패';
        errorEl.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '로그인';
    }
}

/**
 * Logout and show login screen
 */
export async function handleLogout() {
    stopActivityMonitor();
    await api.logout();
    showLoginOverlay('로그아웃 되었습니다.');
}

/**
 * Update user display in sidebar
 */
function updateUserDisplay(user) {
    if (!user) return;

    const ROLE_LABELS = {
        admin: '관리자',
        doctor: '의사',
        therapist: '치료사',
        nurse: '간호사',
    };

    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-display-role');

    if (nameEl) nameEl.textContent = user.full_name || user.username;
    if (roleEl) roleEl.textContent = ROLE_LABELS[user.role] || user.role;

    // Show user info section
    const userSection = document.getElementById('user-info-section');
    if (userSection) userSection.style.display = 'block';
}

/**
 * Check if current user has a specific role
 */
export function hasRole(...roles) {
    const user = api.getCurrentUser();
    return user && roles.includes(user.role);
}

/**
 * Check if current user has at least the given role level
 */
export function hasMinRole(minRole) {
    const hierarchy = { admin: 4, doctor: 3, therapist: 2, nurse: 1 };
    const user = api.getCurrentUser();
    if (!user) return false;
    return (hierarchy[user.role] || 0) >= (hierarchy[minRole] || 0);
}
