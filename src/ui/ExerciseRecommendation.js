// ExerciseRecommendation.js - 자세분석 결과 기반 추천 운동 패널
// 3D 뷰어 내부에 중증도별 추천 운동 영상을 표시

import { getAnatomyInfo } from '../anatomy/AnatomyData.js';

const SEV_LABELS = { normal: '정상', mild: '경도', moderate: '중등도', severe: '중증' };
const SEV_ORDER = { severe: 0, moderate: 1, mild: 2, normal: 3 };
const DIFF_CLASS = { '쉬움': 'easy', '보통': 'medium', '어려움': 'hard' };

/**
 * 자세분석 결과에서 영향 부위의 추천 운동 패널 표시
 * @param {Map<string, {regionKey, severity, reason}>} regionMap - deduped region mapping
 */
export function showExerciseRecommendations(regionMap) {
    const panel = document.getElementById('exercise-rec-panel');
    if (!panel) return;

    // normal 제외, severity 높은 순 정렬
    const entries = [...regionMap.entries()]
        .filter(([, data]) => data.severity !== 'normal')
        .sort((a, b) => (SEV_ORDER[a[1].severity] ?? 3) - (SEV_ORDER[b[1].severity] ?? 3));

    if (entries.length === 0) {
        panel.style.display = 'none';
        return;
    }

    // 부위별 운동 수집 (중복 운동 제거)
    const seenExercises = new Set();
    const sections = [];

    for (const [regionKey, data] of entries) {
        const info = getAnatomyInfo(regionKey);
        if (!info || !info.exercises || info.exercises.length === 0) continue;

        const exercises = info.exercises.filter(e => {
            const key = e.name + '|' + (e.videoId || '');
            if (seenExercises.has(key)) return false;
            seenExercises.add(key);
            return true;
        });

        if (exercises.length === 0) continue;

        sections.push({
            regionKey,
            name: info.name,
            severity: data.severity,
            reason: data.reason,
            exercises,
        });
    }

    if (sections.length === 0) {
        panel.style.display = 'none';
        return;
    }

    const totalExercises = sections.reduce((sum, s) => sum + s.exercises.length, 0);

    const listEl = document.getElementById('exercise-rec-list');
    const countEl = document.getElementById('exercise-rec-count');

    if (countEl) {
        countEl.textContent = `${sections.length}개 부위 · ${totalExercises}개 운동`;
    }

    listEl.innerHTML = sections.map(section => {
        const sevClass = section.severity;
        const exercisesHtml = section.exercises.map(e => `
            <div class="rec-exercise-item" data-exercise="${esc(e.name)}" data-video-id="${e.videoId || ''}" data-difficulty="${esc(e.difficulty)}">
                <div class="rec-exercise-info">
                    <span class="rec-exercise-name">${esc(e.name)}</span>
                    <span class="rec-exercise-diff difficulty-${DIFF_CLASS[e.difficulty] || 'medium'}">${esc(e.difficulty)}</span>
                </div>
                <span class="rec-exercise-play">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </span>
            </div>
        `).join('');

        return `
            <div class="rec-section" data-severity="${sevClass}">
                <div class="rec-section-header">
                    <span class="rec-section-dot sev-${sevClass}"></span>
                    <span class="rec-section-name">${esc(section.name)}</span>
                    <span class="rec-section-sev sev-text-${sevClass}">${SEV_LABELS[section.severity]}</span>
                </div>
                <div class="rec-section-reason">${esc(section.reason)}</div>
                <div class="rec-exercise-list">${exercisesHtml}</div>
            </div>
        `;
    }).join('');

    // 비디오 클릭 바인딩
    listEl.querySelectorAll('.rec-exercise-item').forEach(item => {
        item.addEventListener('click', () => {
            const name = item.dataset.exercise;
            const videoId = item.dataset.videoId;
            const difficulty = item.dataset.difficulty;
            if (window.openExerciseVideo) {
                window.openExerciseVideo(name, videoId, difficulty);
            }
        });
    });

    panel.style.display = 'flex';
    panel.classList.add('open');
}

/**
 * 추천 운동 패널 숨기기
 */
export function hideExerciseRecommendations() {
    const panel = document.getElementById('exercise-rec-panel');
    if (panel) {
        panel.classList.remove('open');
        panel.style.display = 'none';
    }
}

/**
 * 패널 토글 초기화 (닫기 버튼, 최소화/확장)
 */
export function initExerciseRecPanel() {
    const closeBtn = document.getElementById('btn-close-exercise-rec');
    const toggleBtn = document.getElementById('btn-toggle-exercise-rec');
    const panel = document.getElementById('exercise-rec-panel');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => hideExerciseRecommendations());
    }

    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            const icon = toggleBtn.querySelector('svg');
            if (icon) {
                icon.style.transform = panel.classList.contains('collapsed') ? 'rotate(180deg)' : '';
            }
        });
    }
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
