// VideoModal.js - Exercise video modal

const SEV_DIFF_LABELS = { '쉬움': 'easy', '보통': 'medium', '어려움': 'hard' };
const SEV_DIFF_TEXT = { '쉬움': '쉬움 (Easy)', '보통': '보통 (Medium)', '어려움': '어려움 (Hard)' };

let currentExerciseName = '';

export function openExerciseVideo(exerciseName, videoId, difficulty) {
    const overlay = document.getElementById('video-modal-overlay');
    const titleEl = document.getElementById('video-modal-title');
    const playerEl = document.getElementById('video-modal-player');
    const diffEl = document.getElementById('video-modal-difficulty');
    const ytLink = document.getElementById('video-modal-yt-link');

    if (!overlay || !playerEl) return;

    titleEl.textContent = exerciseName;
    currentExerciseName = exerciseName;

    const diffClass = SEV_DIFF_LABELS[difficulty] || 'medium';
    diffEl.textContent = SEV_DIFF_TEXT[difficulty] || difficulty;
    diffEl.className = `video-modal-difficulty difficulty-${diffClass}`;

    if (videoId) {
        playerEl.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        ytLink.href = `https://www.youtube.com/watch?v=${videoId}`;
        ytLink.style.display = '';
    } else {
        const searchQuery = encodeURIComponent(exerciseName + ' 운동 방법');
        playerEl.innerHTML = `
            <div style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-secondary);gap:16px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <p style="color:var(--text-secondary);font-size:14px;text-align:center;margin:0;">등록된 영상이 없습니다</p>
                <a href="https://www.youtube.com/results?search_query=${searchQuery}" target="_blank" rel="noopener" style="color:var(--accent-primary);font-size:13px;">YouTube에서 검색하기 &rarr;</a>
            </div>`;
        ytLink.href = `https://www.youtube.com/results?search_query=${searchQuery}`;
        ytLink.style.display = '';
    }

    overlay.style.display = 'flex';
}

export function closeExerciseVideo() {
    const overlay = document.getElementById('video-modal-overlay');
    const playerEl = document.getElementById('video-modal-player');
    if (overlay) overlay.style.display = 'none';
    if (playerEl) playerEl.innerHTML = '';
}

// Expose globally for compatibility
window.openExerciseVideo = openExerciseVideo;
window.closeExerciseVideo = closeExerciseVideo;

// Close on button/overlay click
document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-close-video' || e.target.id === 'video-modal-overlay') {
        closeExerciseVideo();
    }
});

// Exercise mode button
document.addEventListener('click', (e) => {
    if (e.target.closest('#video-modal-exercise-btn')) {
        if (window.startExerciseMode && currentExerciseName) {
            window.startExerciseMode(currentExerciseName);
        }
    }
});
