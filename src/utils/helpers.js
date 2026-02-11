// helpers.js - Shared utility functions and constants

export const SEV_LABELS = { normal: '정상', mild: '경도', moderate: '중등도', severe: '중증' };
export const SEV_COLORS = {
    normal: 'var(--status-normal)', mild: 'var(--status-mild)',
    moderate: 'var(--status-moderate)', severe: 'var(--status-severe)'
};
export const GENDER_LABELS = { male: '남성', female: '여성', other: '기타' };
export const PROGRESS_LABELS = { initial: '초기 평가', improving: '호전', plateau: '정체', worsening: '악화' };

export function calculateAge(dob) {
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function severityRank(sev) {
    return { normal: 0, mild: 1, moderate: 2, severe: 3 }[sev] || 0;
}
