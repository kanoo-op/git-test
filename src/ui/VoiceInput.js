// VoiceInput.js - 음성 입력 (STT) + 의료 키워드 자동 태깅
// Web Speech API 기반 한국어 음성인식

// ═══ 의료 키워드 사전 ═══

const KEYWORD_CATEGORIES = {
    '통증 양상': ['통증', '아프', '쑤시', '찌르는', '뻐근', '욱신', '화끈', '저림', '저리', '시림',
                 '둔통', '방사통', '이질통', '작열감', '압통', '당기', '뻣뻣', '결리', '쥐가'],
    '부위': ['허리', '목', '어깨', '무릎', '골반', '등', '팔', '다리', '손목', '발목',
            '엉덩이', '가슴', '두통', '머리', '손', '발', '종아리', '허벅지', '팔꿈치',
            '척추', '디스크', '관절', '근육', '힘줄', '인대'],
    '시기·빈도': ['아침', '저녁', '밤', '새벽', '오래', '갑자기', '서서히', '점점', '항상', '가끔',
                 '자주', '매일', '최근', '어제', '오늘', '지난주', '지난달', '몇 달', '몇 년'],
    '악화·완화': ['앉을 때', '서있을 때', '걸을 때', '눕을 때', '구부릴 때', '돌릴 때', '들 때',
                 '계단', '운동', '스트레칭', '휴식', '찜질', '약', '주사', '마사지', '잠잘 때'],
    '정도': ['심하', '약간', '많이', '조금', '극심', '참을 수 없', '견딜 수 없', '불편',
            '호전', '악화', '나아', '심해'],
};

// ═══ 상태 ═══

let recognition = null;
let isRecording = false;
let targetTextarea = null;
let tagsContainer = null;
let statusEl = null;
let micBtn = null;
let detectedTags = new Set();
let onTagsUpdated = null;

// ═══ 초기화 ═══

/**
 * 음성 입력 초기화
 * @param {Object} opts
 * @param {string} opts.targetId - 텍스트를 채울 textarea ID
 * @param {string} opts.tagsContainerId - 태그 표시 컨테이너 ID
 * @param {string} opts.micBtnId - 마이크 버튼 ID
 * @param {string} opts.statusId - 상태 표시 영역 ID
 * @param {Function} opts.onTags - 태그 변경 콜백
 */
export function initVoiceInput(opts = {}) {
    targetTextarea = document.getElementById(opts.targetId);
    tagsContainer = document.getElementById(opts.tagsContainerId);
    micBtn = document.getElementById(opts.micBtnId);
    statusEl = document.getElementById(opts.statusId);
    onTagsUpdated = opts.onTags || null;

    if (!micBtn) return;

    // 브라우저 지원 확인
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micBtn.title = '이 브라우저는 음성인식을 지원하지 않습니다 (Chrome 권장)';
        micBtn.disabled = true;
        micBtn.style.opacity = '0.4';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = handleResult;
    recognition.onerror = handleError;
    recognition.onend = handleEnd;

    micBtn.addEventListener('click', toggleRecording);
}

// ═══ 녹음 제어 ═══

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!recognition || isRecording) return;

    // 기존 텍스트 보존
    preserveExistingText();

    try {
        recognition.start();
        isRecording = true;
        updateUI('recording');
    } catch (e) {
        console.warn('Speech recognition start failed:', e);
    }
}

function stopRecording() {
    if (!recognition || !isRecording) return;

    recognition.stop();
    isRecording = false;
    updateUI('idle');
}

// ═══ 음성 결과 처리 ═══

let finalTranscript = '';
let pendingText = '';

function handleResult(event) {
    let interim = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
            finalTranscript += transcript;
            extractKeywords(transcript);
        } else {
            interim += transcript;
        }
    }

    // textarea 업데이트
    if (targetTextarea) {
        const existing = pendingText;
        const combined = (existing ? existing + ' ' : '') + finalTranscript;
        targetTextarea.value = combined + (interim ? ' ' + interim : '');
    }

    updateUI('recording', interim);
}

function handleError(event) {
    if (event.error === 'no-speech') {
        updateUI('no-speech');
        return;
    }
    if (event.error === 'aborted') return;

    console.warn('Speech recognition error:', event.error);
    isRecording = false;
    updateUI('error', event.error);
}

function handleEnd() {
    if (isRecording) {
        // auto-restart for continuous recording
        try {
            recognition.start();
        } catch (e) {
            isRecording = false;
            updateUI('idle');
        }
    }
}

// ═══ 키워드 추출 ═══

function extractKeywords(text) {
    if (!text) return;

    const normalized = text.toLowerCase();

    for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
        for (const kw of keywords) {
            if (normalized.includes(kw.toLowerCase())) {
                detectedTags.add(JSON.stringify({ category, keyword: kw }));
            }
        }
    }

    renderTags();
}

function renderTags() {
    if (!tagsContainer) return;

    const tagMap = new Map();
    for (const raw of detectedTags) {
        const { category, keyword } = JSON.parse(raw);
        if (!tagMap.has(category)) tagMap.set(category, []);
        if (!tagMap.get(category).includes(keyword)) {
            tagMap.get(category).push(keyword);
        }
    }

    let html = '';
    for (const [category, keywords] of tagMap) {
        html += `<div class="voice-tag-group">`;
        html += `<span class="voice-tag-category">${category}</span>`;
        html += keywords.map(kw =>
            `<span class="voice-tag" data-keyword="${kw}">${kw}<button class="voice-tag-remove" data-keyword="${kw}">&times;</button></span>`
        ).join('');
        html += `</div>`;
    }

    tagsContainer.innerHTML = html;
    if (tagMap.size > 0) {
        tagsContainer.style.display = 'block';
    }

    // 태그 삭제 이벤트
    tagsContainer.querySelectorAll('.voice-tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const kw = btn.dataset.keyword;
            detectedTags.forEach(raw => {
                if (JSON.parse(raw).keyword === kw) detectedTags.delete(raw);
            });
            renderTags();
        });
    });

    if (onTagsUpdated) onTagsUpdated(getTagsSummary());
}

// ═══ UI 업데이트 ═══

function updateUI(state, detail) {
    if (!micBtn) return;

    switch (state) {
        case 'recording':
            micBtn.classList.add('recording');
            micBtn.title = '녹음 중 (클릭하여 중지)';
            if (statusEl) {
                statusEl.style.display = 'flex';
                statusEl.textContent = detail ? `인식 중: "${detail}"` : '듣고 있습니다...';
                statusEl.className = 'voice-status listening';
            }
            break;
        case 'no-speech':
            if (statusEl) {
                statusEl.textContent = '음성이 감지되지 않습니다. 다시 말씀해주세요.';
                statusEl.className = 'voice-status warning';
            }
            break;
        case 'error':
            micBtn.classList.remove('recording');
            if (statusEl) {
                statusEl.textContent = `오류: ${detail}`;
                statusEl.className = 'voice-status error';
            }
            break;
        default: // idle
            micBtn.classList.remove('recording');
            micBtn.title = '음성 녹음 시작';
            if (statusEl) {
                statusEl.style.display = 'none';
            }
            break;
    }
}

// ═══ 외부 API ═══

/**
 * 현재 감지된 태그 요약 반환
 */
export function getTagsSummary() {
    const tagMap = new Map();
    for (const raw of detectedTags) {
        const { category, keyword } = JSON.parse(raw);
        if (!tagMap.has(category)) tagMap.set(category, []);
        if (!tagMap.get(category).includes(keyword)) {
            tagMap.get(category).push(keyword);
        }
    }
    return tagMap;
}

/**
 * 태그에서 자동 필드 추천 반환
 */
export function getAutoFillSuggestions() {
    const tags = getTagsSummary();
    const suggestions = {};

    if (tags.has('부위')) {
        suggestions.painLocation = tags.get('부위').join(', ');
    }
    if (tags.has('악화·완화')) {
        const factors = tags.get('악화·완화');
        const aggravating = factors.filter(f =>
            ['앉을 때', '서있을 때', '걸을 때', '구부릴 때', '돌릴 때', '들 때', '계단', '운동'].includes(f)
        );
        const relieving = factors.filter(f =>
            ['휴식', '찜질', '약', '주사', '마사지', '스트레칭', '눕을 때'].includes(f)
        );
        if (aggravating.length) suggestions.aggravating = aggravating.join(', ');
        if (relieving.length) suggestions.relieving = relieving.join(', ');
    }
    if (tags.has('시기·빈도')) {
        suggestions.onset = tags.get('시기·빈도').join(', ');
    }

    return suggestions;
}

/**
 * 자동 추천을 빈 필드에 적용
 */
export function applyAutoSuggestions() {
    const suggestions = getAutoFillSuggestions();

    for (const [field, value] of Object.entries(suggestions)) {
        const fieldMap = {
            painLocation: 'soap-pain-location',
            aggravating: 'soap-aggravating',
            relieving: 'soap-relieving',
            onset: 'soap-onset',
        };
        const el = document.getElementById(fieldMap[field]);
        if (el && !el.value.trim()) {
            el.value = value;
            el.classList.add('voice-auto-filled');
            setTimeout(() => el.classList.remove('voice-auto-filled'), 2000);
        }
    }
}

/**
 * 상태 초기화
 */
export function resetVoiceInput() {
    if (isRecording) stopRecording();
    finalTranscript = '';
    pendingText = '';
    detectedTags.clear();
    if (tagsContainer) {
        tagsContainer.innerHTML = '';
        tagsContainer.style.display = 'none';
    }
    if (statusEl) statusEl.style.display = 'none';
    if (micBtn) micBtn.classList.remove('recording');
}

/**
 * 녹음 시작 시 기존 텍스트 보존
 */
export function preserveExistingText() {
    if (targetTextarea) {
        pendingText = targetTextarea.value.trim();
        finalTranscript = '';
    }
}
