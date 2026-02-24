// DevSettings.js - 개발자 설정 모듈 (매핑 UI 등 개발용 기능)

import { loadMapping, clearMapping, getMappingInfo } from '../anatomy/Regions.js';
import { saveMapping, getMapping, clearMappingData } from '../services/Storage.js';
import * as api from '../services/Api.js';

/**
 * 개발자 설정 초기화
 */
export function initDevSettings() {
    const overlay = document.getElementById('dev-settings-overlay');
    const closeBtn = document.getElementById('btn-close-dev-settings');
    const openBtn = document.getElementById('btn-open-dev-settings');

    if (openBtn) {
        openBtn.addEventListener('click', openDevSettings);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDevSettings);
    }
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeDevSettings();
        });
    }

    // Init mapping UI within dev settings
    initDevMappingUI();
    initProfileSettings();
}

/**
 * 개발자 설정 열기
 */
export function openDevSettings() {
    const overlay = document.getElementById('dev-settings-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        renderDevMappingStatus();
        loadProfileName();
    }
}

/**
 * 개발자 설정 닫기
 */
export function closeDevSettings() {
    const overlay = document.getElementById('dev-settings-overlay');
    if (overlay) overlay.style.display = 'none';
}

/**
 * 매핑 UI 초기화 (개발자 설정 내부)
 */
function initDevMappingUI() {
    const fileInput = document.getElementById('input-dev-mapping-file');
    const loadBtn = document.getElementById('btn-dev-load-mapping');
    const clearBtn = document.getElementById('btn-dev-clear-mapping');

    if (loadBtn && fileInput) {
        loadBtn.addEventListener('click', () => fileInput.click());

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
                    loadMapping(json);
                    saveMapping(json);
                    renderDevMappingStatus();
                    if (window.showToast) window.showToast('매핑이 로드되었습니다.', 'success');
                } catch (err) {
                    alert('매핑 JSON 파싱 실패: ' + err.message);
                }
            };
            reader.readAsText(file);
            fileInput.value = '';
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearMapping();
            clearMappingData();
            renderDevMappingStatus();
            if (window.showToast) window.showToast('매핑이 초기화되었습니다.', 'info');
        });
    }

    // Initial render
    renderDevMappingStatus();
}

/**
 * 개발자 설정 패널 내 매핑 상태 렌더링
 */
export function renderDevMappingStatus() {
    const statusEl = document.getElementById('dev-mapping-status');
    const regionsEl = document.getElementById('dev-mapping-regions');
    const clearBtn = document.getElementById('btn-dev-clear-mapping');
    if (!statusEl) return;

    const info = getMappingInfo();

    if (!info) {
        statusEl.innerHTML = `
            <div class="mapping-empty">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>매핑이 로드되지 않았습니다</span>
            </div>
        `;
        if (regionsEl) regionsEl.innerHTML = '';
        if (clearBtn) clearBtn.style.display = 'none';
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

    if (clearBtn) clearBtn.style.display = 'flex';

    if (regionsEl) {
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
}

// ======== Profile Settings ========

function loadProfileName() {
    const input = document.getElementById('profile-name-input');
    if (!input) return;
    const user = api.getCurrentUser();
    if (user) input.value = user.full_name || '';
}

function initProfileSettings() {
    const saveBtn = document.getElementById('btn-save-profile');
    const input = document.getElementById('profile-name-input');
    if (!saveBtn || !input) return;

    loadProfileName();

    saveBtn.addEventListener('click', async () => {
        const newName = input.value.trim();
        if (!newName) {
            window.showToast?.('이름을 입력하세요.', 'warning');
            return;
        }

        const user = api.getCurrentUser();
        if (!user) return;

        saveBtn.disabled = true;
        saveBtn.textContent = '저장 중...';
        const statusEl = document.getElementById('profile-save-status');

        try {
            await api.updateUser(user.id, { full_name: newName });

            // Update local user data
            user.full_name = newName;
            api.setCurrentUser(user);

            // Update sidebar display
            const nameEl = document.getElementById('user-display-name');
            if (nameEl) nameEl.textContent = newName;

            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.color = 'var(--status-normal)';
                statusEl.textContent = '이름이 변경되었습니다.';
                setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
            }
            window.showToast?.('이름이 변경되었습니다.', 'success');
        } catch (err) {
            if (statusEl) {
                statusEl.style.display = 'block';
                statusEl.style.color = 'var(--status-severe)';
                statusEl.textContent = err.message || '변경 실패';
            }
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = '이름 변경';
        }
    });
}
