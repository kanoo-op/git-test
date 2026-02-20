// Dashboard.js - Dashboard rendering

import * as storage from '../services/Storage.js';
import { SEV_LABELS, SEV_COLORS, escapeHtml } from '../utils/helpers.js';

// Forward declaration - will be set by ViewRouter to avoid circular import
let openPatientDetailFn = null;

export function setOpenPatientDetail(fn) {
    openPatientDetailFn = fn;
}

export function renderDashboard() {
    const stats = storage.getDashboardStats();

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
