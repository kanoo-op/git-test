// ContextPanel.js - Context panel for mesh details and anatomy info

import { deselectCurrentMesh } from '../anatomy/Highlights.js';
import { getRegion, getMeshRegionKey } from '../anatomy/Regions.js';
import { getAnatomyInfo } from '../anatomy/AnatomyData.js';
import { escapeHtml } from '../utils/helpers.js';
import { setSelectedMesh } from './ViewRouter.js';

export function openContextPanel(mesh, info) {
    setSelectedMesh(mesh);
    const panel = document.getElementById('context-panel');
    panel.classList.add('open');

    const regionInfo = getRegion(mesh);
    const titleEl = document.getElementById('context-title');
    if (titleEl) {
        titleEl.textContent = regionInfo.regionLabel || info.region || '선택 상세정보';
    }

    document.getElementById('select-severity').value = 'normal';
    document.getElementById('input-mesh-notes').value = '';
    document.getElementById('check-concern').checked = false;

    const regionKey = getMeshRegionKey(mesh.name);
    renderAnatomyInfo(regionKey);
}

export function closeContextPanel() {
    const panel = document.getElementById('context-panel');
    panel.classList.remove('open');
    setSelectedMesh(null);
    deselectCurrentMesh();
}

function renderAnatomyInfo(regionKey) {
    const section = document.getElementById('anatomy-info-section');
    if (!section) return;

    if (!regionKey) {
        section.style.display = 'none';
        return;
    }

    const info = getAnatomyInfo(regionKey);
    if (!info) {
        section.style.display = 'none';
        return;
    }

    const musclesHtml = info.keyMuscles.map(m =>
        `<span class="anatomy-muscle-tag">${escapeHtml(m)}</span>`
    ).join('');

    const structuresHtml = info.keyStructures.map(s =>
        `<span class="anatomy-structure-tag">${escapeHtml(s)}</span>`
    ).join('');

    const pathologiesHtml = info.commonPathologies.map(p =>
        `<li>${escapeHtml(p)}</li>`
    ).join('');

    const exercisesHtml = info.exercises.map(e =>
        `<div class="anatomy-exercise-item has-video" data-exercise="${escapeHtml(e.name)}" data-video-id="${e.videoId || ''}" data-difficulty="${escapeHtml(e.difficulty)}">
            <span class="exercise-name">${escapeHtml(e.name)}</span>
            <span style="display:flex;align-items:center;gap:4px;">
                <span class="exercise-difficulty difficulty-${e.difficulty === '쉬움' ? 'easy' : e.difficulty === '보통' ? 'medium' : 'hard'}">${escapeHtml(e.difficulty)}</span>
                <span class="exercise-play-icon"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></span>
            </span>
        </div>`
    ).join('');

    section.innerHTML = `
        <div class="section-label" style="margin-top:16px;">해부학 정보</div>
        <p class="anatomy-description">${escapeHtml(info.description)}</p>

        <div class="anatomy-subsection">
            <div class="anatomy-sub-label">주요 근육</div>
            <div class="anatomy-tags">${musclesHtml}</div>
        </div>

        <div class="anatomy-subsection">
            <div class="anatomy-sub-label">주요 구조</div>
            <div class="anatomy-tags">${structuresHtml}</div>
        </div>

        <div class="anatomy-subsection">
            <div class="anatomy-sub-label">흔한 질환</div>
            <ul class="anatomy-pathologies">${pathologiesHtml}</ul>
        </div>

        <div class="anatomy-subsection">
            <div class="anatomy-sub-label">추천 운동</div>
            <div class="anatomy-exercises">${exercisesHtml}</div>
        </div>
    `;
    section.style.display = 'block';

    // Bind exercise video clicks
    section.querySelectorAll('.anatomy-exercise-item.has-video').forEach(item => {
        item.addEventListener('click', () => {
            const name = item.dataset.exercise;
            const videoId = item.dataset.videoId;
            const difficulty = item.dataset.difficulty;
            if (window.openExerciseVideo) {
                window.openExerciseVideo(name, videoId, difficulty);
            }
        });
    });
}

// Expose for anatomy-search module
window._openAnatomyPanel = function(regionKey) {
    renderAnatomyInfo(regionKey);
    const section = document.getElementById('anatomy-info-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
