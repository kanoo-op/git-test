// Dashboard.js - Dashboard rendering

import * as storage from '../services/Storage.js';
import { fetchDashboardStats, isLoggedIn } from '../services/Api.js';
import { SEV_LABELS, SEV_COLORS, escapeHtml } from '../utils/helpers.js';

// Forward declaration - will be set by ViewRouter to avoid circular import
let openPatientDetailFn = null;

export function setOpenPatientDetail(fn) {
    openPatientDetailFn = fn;
}

export async function renderDashboard() {
    let stats;
    let appData = null;

    if (isLoggedIn()) {
        try {
            const apiStats = await fetchDashboardStats();
            stats = {
                totalPatients: apiStats.total_patients,
                totalVisits: apiStats.total_assessments,
                todayVisits: apiStats.today_assessments,
                severityCounts: apiStats.severity_counts || {},
                recentVisits: (apiStats.recent_assessments || []).map(a => ({
                    ...a,
                    date: new Date(a.date).getTime(),
                    selections: Array(a.selectionCount || 0).fill(null),
                })),
                recentPatients: (apiStats.recent_patients || []).map(p => ({
                    ...p,
                    visits: Array(p.assessmentCount || 0).fill(null),
                })),
            };
            appData = {
                totalCheckins: apiStats.total_checkins || 0,
                totalWorkouts: apiStats.total_workouts || 0,
                totalPainLogs: apiStats.total_pain_logs || 0,
                avgPain7d: apiStats.avg_pain_7d,
                completionRate7d: apiStats.completion_rate_7d,
                activeAppPatients: apiStats.active_app_patients || 0,
                recentAppActivity: apiStats.recent_app_activity || [],
            };
        } catch (e) {
            console.warn('Dashboard API failed, using local storage:', e);
            stats = storage.getDashboardStats();
        }
    } else {
        stats = storage.getDashboardStats();
    }

    document.getElementById('stat-total-patients').textContent = stats.totalPatients;
    document.getElementById('stat-total-assessments').textContent = stats.totalVisits;
    document.getElementById('stat-today-assessments').textContent = stats.todayVisits;

    // Severity distribution bars
    const distEl = document.getElementById('severity-distribution');
    const maxCount = Math.max(...Object.values(stats.severityCounts), 1);
    distEl.innerHTML = Object.entries(stats.severityCounts).map(([key, count]) => `
        <div class="severity-bar-item">
            <span class="severity-bar-count" style="color:${SEV_COLORS[key]}">${count}</span>
            <div class="severity-bar-fill" style="height:${Math.max((count / maxCount) * 70, 4)}px; background:${SEV_COLORS[key]}"></div>
            <span class="severity-bar-label">${SEV_LABELS[key]}</span>
        </div>
    `).join('');

    // Storage usage
    renderStorageUsage();

    // Recent patients
    const rpList = document.getElementById('recent-patients-list');
    if (stats.recentPatients.length === 0) {
        rpList.innerHTML = '<div class="empty-state" style="padding:20px;"><p>아직 환자가 없습니다.</p></div>';
    } else {
        rpList.innerHTML = stats.recentPatients.map(p => {
            const lastDate = p.visits.length > 0
                ? new Date(Math.max(...p.visits.map(a => a.date))).toLocaleDateString('ko-KR')
                : '-';
            return `
                <div class="recent-patient-card" data-patient-id="${p.id}">
                    <div>
                        <div class="recent-card-name">${escapeHtml(p.name)}</div>
                        <div class="recent-card-meta">내원 ${p.visits.length}건 | 마지막: ${lastDate}${p.diagnosis ? ' | ' + escapeHtml(p.diagnosis) : ''}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            `;
        }).join('');

        rpList.querySelectorAll('.recent-patient-card').forEach(card => {
            card.addEventListener('click', () => {
                if (openPatientDetailFn) openPatientDetailFn(card.dataset.patientId);
            });
        });
    }

    // Recent assessments
    const raList = document.getElementById('recent-assessments-list');
    if (stats.recentVisits.length === 0) {
        raList.innerHTML = '<div class="empty-state" style="padding:20px;"><p>최근 내원이 없습니다.</p></div>';
    } else {
        raList.innerHTML = stats.recentVisits.map(a => {
            const date = new Date(a.date).toLocaleDateString('ko-KR', {
                month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            return `
                <div class="recent-assessment-card" data-patient-id="${a.patientId}">
                    <div>
                        <div class="recent-card-name">${escapeHtml(a.patientName)}</div>
                        <div class="recent-card-meta">${date} | ${(a.selections || []).length}개 부위${a.summary ? ' | ' + escapeHtml(a.summary) : ''}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            `;
        }).join('');

        raList.querySelectorAll('.recent-assessment-card').forEach(card => {
            card.addEventListener('click', () => {
                if (openPatientDetailFn) openPatientDetailFn(card.dataset.patientId);
            });
        });
    }

    // Patient app data sections
    renderAppStats(appData);
    renderRecentAppActivity(appData?.recentAppActivity || []);
}

function renderAppStats(appData) {
    const container = document.getElementById('app-stats-section');
    if (!container) return;

    if (!appData || (appData.totalCheckins === 0 && appData.totalWorkouts === 0 && appData.totalPainLogs === 0)) {
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    const cardsEl = document.getElementById('app-stats-cards');
    if (!cardsEl) return;

    cardsEl.innerHTML = `
        <div class="stat-card stat-card--app">
            <div class="stat-value">${appData.activeAppPatients}</div>
            <div class="stat-label">앱 연결 환자</div>
        </div>
        <div class="stat-card stat-card--app">
            <div class="stat-value">${appData.totalCheckins}</div>
            <div class="stat-label">총 체크인</div>
        </div>
        <div class="stat-card stat-card--app">
            <div class="stat-value">${appData.totalWorkouts}</div>
            <div class="stat-label">총 운동</div>
        </div>
        <div class="stat-card stat-card--app">
            <div class="stat-value">${appData.avgPain7d != null ? appData.avgPain7d : '-'}</div>
            <div class="stat-label">7일 평균 통증</div>
        </div>
        <div class="stat-card stat-card--app">
            <div class="stat-value">${appData.completionRate7d != null ? appData.completionRate7d + '%' : '-'}</div>
            <div class="stat-label">7일 완수율</div>
        </div>
    `;
}

function renderRecentAppActivity(activities) {
    const container = document.getElementById('app-activity-section');
    if (!container) return;

    if (!activities || activities.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    const listEl = document.getElementById('recent-app-activity-list');
    if (!listEl) return;

    listEl.innerHTML = activities.map(item => {
        const date = item.date || '';
        let detail = '';
        if (item.type === 'checkin') {
            const pain = item.prePain != null ? `통증 ${item.prePain}→${item.postPain ?? '-'}` : '';
            const completed = item.routineCompleted ? '완료' : '미완료';
            detail = `체크인 | ${pain} | ${completed}`;
        } else {
            const dur = item.duration ? Math.round(item.duration / 60) + '분' : '-';
            detail = `운동 | ${dur} | RPE: ${item.rpe || '-'}`;
        }

        return `
            <div class="recent-assessment-card" data-patient-id="${item.patientId}">
                <div>
                    <div class="recent-card-name">${escapeHtml(item.patientName || '')}</div>
                    <div class="recent-card-meta">${date} | ${detail}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.recent-assessment-card').forEach(card => {
        card.addEventListener('click', () => {
            if (openPatientDetailFn) openPatientDetailFn(card.dataset.patientId);
        });
    });
}

export function renderStorageUsage() {
    const container = document.getElementById('dashboard-view');
    if (!container) return;

    let usageEl = container.querySelector('.storage-usage');
    if (!usageEl) {
        usageEl = document.createElement('div');
        usageEl.className = 'storage-usage';
        const firstSection = container.querySelector('.dashboard-section');
        if (firstSection) {
            firstSection.parentNode.insertBefore(usageEl, firstSection);
        } else {
            container.appendChild(usageEl);
        }
    }

    const usage = storage.getStorageUsage();
    const fillClass = usage.percent > 90 ? 'danger' : usage.percent > 70 ? 'warning' : '';

    usageEl.innerHTML = `
        <div class="storage-usage-header">
            <span>저장소 사용량</span>
            <span>${usage.usedMB} MB / ~${usage.limitMB} MB</span>
        </div>
        <div class="storage-usage-bar">
            <div class="storage-usage-fill ${fillClass}" style="width:${usage.percent}%"></div>
        </div>
    `;
}
