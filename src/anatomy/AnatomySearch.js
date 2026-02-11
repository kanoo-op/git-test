// AnatomySearch.js - 질환 검색 뷰
// 메인 콘텐츠 영역에서 질환/근육/부위 검색 → 결과 카드 → 클릭 시 3D 뷰어 포커스

import * as THREE from 'three';
import { searchAnatomy, getAnatomyInfo } from './AnatomyData.js';
import { getRegionMeshNames } from './Regions.js';
import { getMeshByName } from '../core/ModelLoader.js';
import { animateCameraTo } from '../core/Controls.js';
import { highlightMesh, unhighlightMesh } from './Highlights.js';

let searchInput = null;
let resultsContainer = null;
let debounceTimer = null;
let highlightedMeshes = [];

// switchView callback (set from app.js)
let switchViewFn = null;

const SEV_DIFFICULTY = {
    '쉬움': 'easy',
    '보통': 'medium',
    '어려움': 'hard',
};

/**
 * 질환 검색 뷰 초기화
 * @param {Object} opts - { switchView: fn }
 */
export function initAnatomySearch(opts = {}) {
    switchViewFn = opts.switchView || null;

    searchInput = document.getElementById('disease-search-input');
    resultsContainer = document.getElementById('disease-search-results');

    if (!searchInput || !resultsContainer) return;

    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            performSearch(searchInput.value);
        }, 150);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.value = '';
            performSearch('');
            searchInput.blur();
        }
    });
}

/**
 * 검색 탭으로 전환 + 포커스
 */
export function showAnatomySearch() {
    if (switchViewFn) switchViewFn('disease-search');
    setTimeout(() => {
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }, 100);
}

/**
 * 검색 실행 + 결과 카드 렌더링
 */
function performSearch(query) {
    if (!resultsContainer) return;

    if (!query || query.trim().length === 0) {
        resultsContainer.innerHTML = `
            <div class="disease-search-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <p>검색어를 입력하면 관련 질환, 근육, 부위가 표시됩니다.</p>
            </div>`;
        return;
    }

    const results = searchAnatomy(query);

    if (results.length === 0) {
        resultsContainer.innerHTML = `
            <div class="disease-search-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <p>"${escapeHtml(query)}"에 대한 검색 결과가 없습니다.</p>
            </div>`;
        return;
    }

    // 각 결과에 대해 전체 해부학 정보를 가져와서 카드로 렌더링
    const cards = results.map(r => {
        const info = getAnatomyInfo(r.regionKey);
        if (!info) return '';
        return renderResultCard(r.regionKey, info, r.matchField);
    }).join('');

    resultsContainer.innerHTML = `<div class="disease-result-grid">${cards}</div>`;

    // 운동 항목 클릭 → 영상 모달
    resultsContainer.querySelectorAll('.disease-exercise-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation(); // 카드 클릭 전파 방지
            const name = item.dataset.exercise;
            const videoId = item.dataset.videoId;
            const difficulty = item.dataset.difficulty;
            if (window.openExerciseVideo) {
                window.openExerciseVideo(name, videoId, difficulty);
            }
        });
    });

    // "3D 뷰에서 보기" 버튼만 클릭 시 포커스 이동
    resultsContainer.querySelectorAll('.disease-card-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.disease-result-card');
            if (card) {
                const key = card.dataset.regionKey;
                focusOnRegion(key);
            }
        });
    });
}

/**
 * 결과 카드 HTML 생성
 */
function renderResultCard(regionKey, info, matchField) {
    const musclesHtml = info.keyMuscles.slice(0, 4).map(m =>
        `<span class="anatomy-muscle-tag">${escapeHtml(m)}</span>`
    ).join('');

    const pathologiesHtml = info.commonPathologies.map(p =>
        `<span class="disease-pathology-tag">${escapeHtml(p)}</span>`
    ).join('');

    const exercisesHtml = info.exercises.slice(0, 3).map(e =>
        `<div class="disease-exercise-item" data-exercise="${escapeHtml(e.name)}" data-video-id="${e.videoId || ''}" data-difficulty="${escapeHtml(e.difficulty)}">
            <span class="exercise-name">${escapeHtml(e.name)}</span>
            <span style="display:flex;align-items:center;gap:4px;">
                <span class="exercise-difficulty difficulty-${SEV_DIFFICULTY[e.difficulty] || 'medium'}">${escapeHtml(e.difficulty)}</span>
                <span class="exercise-play-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></span>
            </span>
        </div>`
    ).join('');

    return `
        <div class="disease-result-card" data-region-key="${regionKey}" tabindex="0">
            <div class="disease-card-header">
                <h4 class="disease-card-title">${escapeHtml(info.name)}</h4>
                <span class="disease-card-match">${escapeHtml(matchField)}</span>
            </div>
            <p class="disease-card-desc">${escapeHtml(info.description)}</p>
            <div class="disease-card-section">
                <div class="disease-card-label">흔한 질환</div>
                <div class="disease-pathology-tags">${pathologiesHtml}</div>
            </div>
            <div class="disease-card-section">
                <div class="disease-card-label">주요 근육</div>
                <div class="anatomy-tags">${musclesHtml}</div>
            </div>
            <div class="disease-card-section">
                <div class="disease-card-label">추천 운동</div>
                <div class="anatomy-exercises">${exercisesHtml}</div>
            </div>
            <div class="disease-card-footer">
                <span class="disease-card-view-btn">3D 뷰에서 보기 &rarr;</span>
            </div>
        </div>
    `;
}

/**
 * 해당 부위 → 3D 뷰어로 전환 + 카메라 이동 + 하이라이트
 */
function focusOnRegion(regionKey) {
    const info = getAnatomyInfo(regionKey);
    if (!info) return;

    clearSearchHighlights();

    // 3D 뷰어로 전환
    if (switchViewFn) switchViewFn('viewer');

    // 약간의 딜레이 후 카메라 이동 (뷰 전환 렌더링 대기)
    setTimeout(() => {
        const meshNames = getRegionMeshNames(regionKey);
        if (meshNames.length === 0) {
            window.showToast?.(`"${info.name}" 부위에 매핑된 메쉬가 없습니다.`, 'warning');
            return;
        }

        const box = new THREE.Box3();
        let meshCount = 0;

        for (const name of meshNames) {
            const mesh = getMeshByName(name);
            if (mesh && mesh.visible) {
                box.expandByObject(mesh);
                highlightMesh(mesh, 'mild');
                highlightedMeshes.push(mesh);
                meshCount++;
            }
        }

        if (meshCount === 0) {
            window.showToast?.(`"${info.name}" 부위의 메쉬가 보이지 않습니다.`, 'warning');
            return;
        }

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = Math.max(maxDim * 2.5, 0.8);

        const preset = info.cameraPreset || { position: 'front' };
        let camPos;

        switch (preset.position) {
            case 'front':
                camPos = [center.x, center.y + 0.1, center.z + dist];
                break;
            case 'back':
                camPos = [center.x, center.y + 0.1, center.z - dist];
                break;
            case 'left':
                camPos = [center.x - dist, center.y + 0.1, center.z];
                break;
            case 'right':
                camPos = [center.x + dist, center.y + 0.1, center.z];
                break;
            default:
                camPos = [center.x, center.y + 0.1, center.z + dist];
        }

        animateCameraTo(camPos, [center.x, center.y, center.z], 1000);

        // 컨텍스트 패널에 해부학 정보 표시
        if (window._openAnatomyPanel) {
            window._openAnatomyPanel(regionKey);
        }

        setTimeout(() => clearSearchHighlights(), 5000);
    }, 200);
}

function clearSearchHighlights() {
    for (const mesh of highlightedMeshes) {
        unhighlightMesh(mesh);
    }
    highlightedMeshes = [];
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
