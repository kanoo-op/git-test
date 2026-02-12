// ExerciseLibrary.js - 운동 처방 라이브러리
// AnatomyData의 24개 부위별 운동을 카테고리/난이도/검색으로 탐색

import { getAnatomyInfo } from '../anatomy/AnatomyData.js';

// ═══ 카테고리 정의 ═══

const CATEGORIES = [
    { id: 'all', label: '전체', icon: '⊞', regions: [] },
    { id: 'head-neck', label: '머리/목', icon: '🦴', regions: ['head_l', 'head_r', 'neck_l', 'neck_r'] },
    { id: 'shoulder', label: '어깨', icon: '💪', regions: ['shoulder_l', 'shoulder_r'] },
    { id: 'chest-back', label: '가슴/등', icon: '🫁', regions: ['chest_l', 'chest_r', 'upper_back_l', 'upper_back_r'] },
    { id: 'lower-back', label: '허리', icon: '🔻', regions: ['lower_back_l', 'lower_back_r'] },
    { id: 'abdomen', label: '복부', icon: '🎯', regions: ['abdomen_l', 'abdomen_r'] },
    { id: 'arm', label: '팔', icon: '🤚', regions: ['arm_l', 'arm_r'] },
    { id: 'hip', label: '골반', icon: '🦵', regions: ['hip_l', 'hip_r'] },
    { id: 'thigh', label: '대퇴', icon: '🏃', regions: ['thigh_l', 'thigh_r'] },
    { id: 'lower-leg', label: '하퇴/발', icon: '🦶', regions: ['shin_l', 'shin_r', 'foot_l', 'foot_r'] },
];

const ALL_REGIONS = [
    'head_l', 'head_r', 'neck_l', 'neck_r',
    'shoulder_l', 'shoulder_r', 'chest_l', 'chest_r',
    'upper_back_l', 'upper_back_r', 'lower_back_l', 'lower_back_r',
    'abdomen_l', 'abdomen_r', 'arm_l', 'arm_r',
    'hip_l', 'hip_r', 'thigh_l', 'thigh_r',
    'shin_l', 'shin_r', 'foot_l', 'foot_r',
];

const DIFF_CLASS = { '쉬움': 'easy', '보통': 'medium', '어려움': 'hard' };
const DIFF_ORDER = { '쉬움': 0, '보통': 1, '어려움': 2 };

let allExercises = [];
let selectedCategory = 'all';
let selectedDifficulty = 'all';
let searchQuery = '';

// ═══ 초기화 ═══

export function initExerciseLibrary() {
    buildDatabase();
    renderCategories();
    renderExercises();
    bindEvents();
}

// ═══ 운동 DB 구축 (중복 제거) ═══

function buildDatabase() {
    const map = new Map();

    for (const regionKey of ALL_REGIONS) {
        const info = getAnatomyInfo(regionKey);
        if (!info?.exercises) continue;

        for (const ex of info.exercises) {
            const key = `${ex.name}|${ex.videoId || ''}`;
            if (!map.has(key)) {
                map.set(key, {
                    name: ex.name,
                    difficulty: ex.difficulty,
                    videoId: ex.videoId,
                    regions: new Set(),
                    regionNames: new Set(),
                    pathologies: new Set(),
                    muscles: new Set(),
                });
            }
            const entry = map.get(key);
            entry.regions.add(regionKey);
            entry.regionNames.add(info.name.replace(/\s*\(좌\)|\s*\(우\)/g, '').trim());
            info.commonPathologies.forEach(p => entry.pathologies.add(p));
            info.keyMuscles.slice(0, 3).forEach(m => entry.muscles.add(m));
        }
    }

    allExercises = [...map.values()].map(e => ({
        ...e,
        regions: [...e.regions],
        regionNames: [...e.regionNames],
        pathologies: [...e.pathologies],
        muscles: [...e.muscles],
    }));

    allExercises.sort((a, b) => {
        const d = (DIFF_ORDER[a.difficulty] ?? 1) - (DIFF_ORDER[b.difficulty] ?? 1);
        return d !== 0 ? d : a.name.localeCompare(b.name, 'ko');
    });
}

// ═══ 필터링 ═══

function getFiltered() {
    return allExercises.filter(ex => {
        if (selectedCategory !== 'all') {
            const cat = CATEGORIES.find(c => c.id === selectedCategory);
            if (cat && !cat.regions.some(r => ex.regions.includes(r))) return false;
        }
        if (selectedDifficulty !== 'all' && ex.difficulty !== selectedDifficulty) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const text = [ex.name, ...ex.regionNames, ...ex.pathologies, ...ex.muscles].join(' ').toLowerCase();
            if (!text.includes(q)) return false;
        }
        return true;
    });
}

// ═══ 렌더링 ═══

function renderCategories() {
    const container = document.getElementById('ex-lib-categories');
    if (!container) return;

    container.innerHTML = CATEGORIES.map(cat => {
        const count = cat.id === 'all'
            ? allExercises.length
            : allExercises.filter(ex => cat.regions.some(r => ex.regions.includes(r))).length;
        return `<button class="exercise-cat-btn ${cat.id === selectedCategory ? 'active' : ''}" data-cat="${cat.id}">
            ${cat.label}<span class="cat-count">${count}</span>
        </button>`;
    }).join('');
}

function renderExercises() {
    const container = document.getElementById('ex-lib-grid');
    if (!container) return;

    const filtered = getFiltered();
    const countEl = document.getElementById('ex-lib-result-count');

    if (filtered.length === 0) {
        if (countEl) countEl.textContent = '0개 운동';
        container.innerHTML = `
            <div class="ex-lib-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p>검색 결과가 없습니다</p>
            </div>`;
        return;
    }

    const dc = { '쉬움': 0, '보통': 0, '어려움': 0 };
    filtered.forEach(ex => dc[ex.difficulty] = (dc[ex.difficulty] || 0) + 1);

    if (countEl) countEl.textContent = `${filtered.length}개 운동`;

    let html = `<div class="ex-lib-stats">
        <span class="ex-stat-total">${filtered.length}개 운동</span>
        <span class="ex-stat-item"><span class="ex-stat-dot difficulty-easy"></span>${dc['쉬움']}</span>
        <span class="ex-stat-item"><span class="ex-stat-dot difficulty-medium"></span>${dc['보통']}</span>
        <span class="ex-stat-item"><span class="ex-stat-dot difficulty-hard"></span>${dc['어려움']}</span>
    </div><div class="ex-lib-cards">`;

    for (const ex of filtered) {
        const dc2 = DIFF_CLASS[ex.difficulty] || 'medium';
        html += `
        <div class="ex-lib-card" data-exercise="${esc(ex.name)}" data-video-id="${ex.videoId || ''}" data-difficulty="${esc(ex.difficulty)}">
            <div class="ex-lib-card-top">
                <span class="ex-lib-card-name">${esc(ex.name)}</span>
                <span class="ex-lib-card-diff difficulty-${dc2}">${esc(ex.difficulty)}</span>
            </div>
            <div class="ex-lib-card-regions">${ex.regionNames.map(r => `<span class="ex-lib-region-tag">${esc(r)}</span>`).join('')}</div>
            <div class="ex-lib-card-meta">${ex.pathologies.slice(0, 3).map(p => esc(p)).join(' · ')}</div>
            <div class="ex-lib-card-muscles">${ex.muscles.map(m => esc(m)).join(', ')}</div>
            <div class="ex-lib-card-actions">
                <button class="ex-lib-btn-video" title="영상 보기">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    영상
                </button>
                <button class="ex-lib-btn-start" title="웹캠으로 운동 자세 확인">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M6 8H5a4 4 0 000 8h1"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
                    운동하기
                </button>
            </div>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// ═══ 이벤트 바인딩 ═══

function bindEvents() {
    // 카테고리
    document.getElementById('ex-lib-categories')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.exercise-cat-btn');
        if (!btn) return;
        selectedCategory = btn.dataset.cat;
        document.querySelectorAll('#ex-lib-categories .exercise-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderExercises();
    });

    // 난이도 필터
    document.querySelectorAll('.ex-diff-btn[data-diff]').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedDifficulty = btn.dataset.diff;
            document.querySelectorAll('.ex-diff-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderExercises();
        });
    });

    // 검색
    document.getElementById('ex-lib-search')?.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        renderExercises();
    });

    // 카드 액션 (위임)
    document.getElementById('ex-lib-grid')?.addEventListener('click', (e) => {
        const card = e.target.closest('.ex-lib-card');
        if (!card) return;

        const name = card.dataset.exercise;
        const videoId = card.dataset.videoId;
        const difficulty = card.dataset.difficulty;

        if (e.target.closest('.ex-lib-btn-start')) {
            window.startExerciseMode?.(name, videoId);
        } else if (e.target.closest('.ex-lib-btn-video')) {
            window.openExerciseVideo?.(name, videoId, difficulty);
        }
    });
}

function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
