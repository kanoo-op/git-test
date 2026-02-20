// SoapRecords.js - 독립 SOAP 기록 관리 (환자 상세 탭 + 사이드바 전체 보드)

import * as storage from '../services/Storage.js';
import { escapeHtml } from '../utils/helpers.js';
import { getCurrentDetailPatientId } from '../ui/ViewRouter.js';
import { openPatientDetail } from './PatientList.js';

const PROGRESS_LABELS = { initial: '초기', improving: '호전', plateau: '정체', worsening: '악화' };

let editingVisitId = null; // 수정 모드일 때 visit ID

// ======== 초기화 ========

export function initSoapRecordsView() {
    // 사이드바 보드 필터 이벤트
    document.getElementById('soap-search-input')?.addEventListener('input', () => renderSoapRecordsView());
    document.getElementById('soap-patient-filter')?.addEventListener('change', () => renderSoapRecordsView());
    document.getElementById('soap-date-filter')?.addEventListener('change', () => renderSoapRecordsView());

    // 독립 SOAP 폼 이벤트
    document.getElementById('btn-new-standalone-soap')?.addEventListener('click', () => {
        showStandaloneSoapForm();
    });
    document.getElementById('btn-save-standalone-soap')?.addEventListener('click', saveStandaloneSoap);
    document.getElementById('btn-cancel-standalone-soap')?.addEventListener('click', hideStandaloneSoapForm);
    document.getElementById('btn-cancel-standalone-soap-2')?.addEventListener('click', hideStandaloneSoapForm);

    // VAS 슬라이더 연동
    const vasSlider = document.getElementById('standalone-soap-pain-scale');
    const vasValue = document.getElementById('standalone-soap-vas-value');
    if (vasSlider && vasValue) {
        vasSlider.addEventListener('input', () => {
            vasValue.textContent = vasSlider.value;
        });
    }

    // 독립 SOAP 폼 탭 전환
    document.getElementById('standalone-soap-form')?.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('[data-standalone-tab]');
        if (!tabBtn) return;
        const target = tabBtn.dataset.standaloneTab;
        const form = document.getElementById('standalone-soap-form');
        form.querySelectorAll('.soap-tab').forEach(t => t.classList.remove('active'));
        form.querySelectorAll('.soap-tab-content').forEach(p => p.classList.remove('active'));
        tabBtn.classList.add('active');
        form.querySelector(`[data-standalone-panel="${target}"]`)?.classList.add('active');
    });
}

// ======== 환자 상세 SOAP 탭 ========

export function renderPatientSoapTab() {
    const patientId = getCurrentDetailPatientId();
    const patient = storage.getPatient(patientId);
    const listEl = document.getElementById('pd-soap-list');
    if (!patient || !listEl) return;

    const soapVisits = (patient.visits || [])
        .filter(v => v.soapNotes)
        .sort((a, b) => b.date - a.date);

    if (soapVisits.length === 0) {
        listEl.innerHTML = `
            <div class="placeholder-empty" style="min-height:200px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <h3>SOAP 기록이 없습니다</h3>
                <p>위의 '+ 새 SOAP 기록' 버튼으로 기록을 작성하세요.</p>
            </div>`;
        return;
    }

    listEl.innerHTML = soapVisits.map(v => {
        const soap = v.soapNotes;
        const s = soap.subjective || {};
        const o = soap.objective || {};
        const as = soap.assessment || {};
        const p = soap.plan || {};
        const date = new Date(v.date).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const typeBadge = v.type === 'soap-only'
            ? '<span class="soap-type-badge standalone">독립 기록</span>'
            : '<span class="soap-type-badge session">세션 기록</span>';

        const sLine = s.chiefComplaint || s.painLocation || s.symptomDescription || '';
        const vasText = s.painScale > 0 ? ` (VAS ${s.painScale}/10)` : '';
        const oLine = o.rom || o.mmt || o.specialTests || o.autoFindings || '';
        const aLine = as.clinicalImpression || '';
        const pLine = p.treatment || p.hep || '';

        return `
        <div class="soap-record-card" data-visit-id="${v.id}">
            <div class="soap-record-header">
                <span class="soap-record-date">${date}</span>
                ${typeBadge}
                ${as.progressLevel && as.progressLevel !== 'initial' ? `<span class="soap-progress-badge ${as.progressLevel}">${PROGRESS_LABELS[as.progressLevel] || ''}</span>` : ''}
            </div>
            <div class="soap-record-body">
                ${sLine ? `<div class="soap-section-row"><span class="soap-section-label">S</span><span class="soap-section-text">${escapeHtml(sLine)}${vasText}</span></div>` : ''}
                ${oLine ? `<div class="soap-section-row"><span class="soap-section-label">O</span><span class="soap-section-text">${escapeHtml(truncate(oLine, 100))}</span></div>` : ''}
                ${aLine ? `<div class="soap-section-row"><span class="soap-section-label">A</span><span class="soap-section-text">${escapeHtml(truncate(aLine, 100))}</span></div>` : ''}
                ${pLine ? `<div class="soap-section-row"><span class="soap-section-label">P</span><span class="soap-section-text">${escapeHtml(truncate(pLine, 100))}</span></div>` : ''}
            </div>
            ${p.frequency ? `<div class="soap-record-freq">${escapeHtml(p.frequency)}</div>` : ''}
            <div class="soap-record-actions">
                <button class="btn-secondary btn-sm-pad edit-soap" data-visit-id="${v.id}">수정</button>
                <button class="btn-danger-sm delete-soap" data-visit-id="${v.id}">삭제</button>
            </div>
        </div>`;
    }).join('');

    // 이벤트 바인딩
    listEl.querySelectorAll('.edit-soap').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showStandaloneSoapForm(btn.dataset.visitId);
        });
    });
    listEl.querySelectorAll('.delete-soap').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('이 SOAP 기록을 삭제하시겠습니까?')) {
                const patientId = getCurrentDetailPatientId();
                storage.deleteVisit(patientId, btn.dataset.visitId);
                renderPatientSoapTab();
                window.showToast?.('SOAP 기록이 삭제되었습니다.', 'info');
            }
        });
    });
}

// ======== 독립 SOAP 작성 폼 ========

export function showStandaloneSoapForm(visitId) {
    const form = document.getElementById('standalone-soap-form');
    if (!form) return;

    editingVisitId = visitId || null;
    const title = document.getElementById('standalone-soap-title');
    if (title) title.textContent = editingVisitId ? 'SOAP 기록 수정' : '새 SOAP 기록';

    // 폼 초기화
    clearStandaloneSoapForm();

    // 수정 모드: 기존 데이터 로드
    if (editingVisitId) {
        const patientId = getCurrentDetailPatientId();
        const visit = storage.getVisit(patientId, editingVisitId);
        if (visit?.soapNotes) {
            loadSoapDataToForm(visit.soapNotes);
        }
    }

    form.style.display = 'block';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function hideStandaloneSoapForm() {
    const form = document.getElementById('standalone-soap-form');
    if (form) form.style.display = 'none';
    editingVisitId = null;
}

export function saveStandaloneSoap() {
    const patientId = getCurrentDetailPatientId();
    if (!patientId) return;

    const soapNotes = collectStandaloneSoapData();

    // 데이터가 하나라도 있는지 체크
    const hasData = Object.values(soapNotes).some(section =>
        Object.values(section).some(v => v && v !== 0 && v !== 'initial')
    );
    if (!hasData) {
        window.showToast?.('SOAP 기록에 내용을 입력해주세요.', 'warning');
        return;
    }

    // overallNotes 요약
    const overallParts = [];
    if (soapNotes.subjective.chiefComplaint) {
        overallParts.push('주호소: ' + soapNotes.subjective.chiefComplaint);
    } else if (soapNotes.subjective.painLocation) {
        overallParts.push('통증: ' + soapNotes.subjective.painLocation);
    }
    if (soapNotes.assessment.clinicalImpression) {
        overallParts.push('소견: ' + soapNotes.assessment.clinicalImpression);
    }
    if (soapNotes.plan.treatment) {
        overallParts.push('계획: ' + soapNotes.plan.treatment);
    } else if (soapNotes.plan.hep) {
        overallParts.push('HEP: ' + soapNotes.plan.hep);
    }
    const overallNotes = overallParts.join(' | ');
    const summary = soapNotes.subjective.chiefComplaint || soapNotes.subjective.painLocation || 'SOAP 기록';

    if (editingVisitId) {
        // 수정 모드
        storage.updateVisit(patientId, editingVisitId, { soapNotes, overallNotes, summary });
        window.showToast?.('SOAP 기록이 수정되었습니다.', 'success');
    } else {
        // 신규 작성
        const visit = storage.createSoapVisit(patientId);
        if (!visit) {
            window.showToast?.('저장에 실패했습니다.', 'error');
            return;
        }
        storage.updateVisit(patientId, visit.id, { soapNotes, overallNotes, summary });
        window.showToast?.('SOAP 기록이 저장되었습니다.', 'success');
    }

    hideStandaloneSoapForm();
    renderPatientSoapTab();
}

function collectStandaloneSoapData() {
    const val = (id) => document.getElementById(id)?.value?.trim() || '';
    const num = (id) => parseInt(document.getElementById(id)?.value, 10) || 0;
    return {
        subjective: {
            chiefComplaint: val('standalone-soap-chief-complaint'),
            painScale: num('standalone-soap-pain-scale'),
            painLocation: val('standalone-soap-pain-location'),
            symptomDescription: val('standalone-soap-symptom-desc'),
            onset: val('standalone-soap-onset'),
            aggravating: val('standalone-soap-aggravating'),
            relieving: val('standalone-soap-relieving'),
        },
        objective: {
            autoFindings: '',
            rom: val('standalone-soap-rom'),
            mmt: val('standalone-soap-mmt'),
            specialTests: val('standalone-soap-special-tests'),
            palpation: val('standalone-soap-palpation'),
            gait: val('standalone-soap-gait'),
            additionalFindings: '',
        },
        assessment: {
            clinicalImpression: val('standalone-soap-clinical-impression'),
            progressLevel: val('standalone-soap-progress-level') || 'initial',
            functionalLevel: val('standalone-soap-functional-level'),
            goals: val('standalone-soap-goals'),
        },
        plan: {
            treatment: val('standalone-soap-treatment'),
            hep: val('standalone-soap-hep'),
            frequency: val('standalone-soap-frequency'),
            duration: val('standalone-soap-duration'),
            nextVisit: val('standalone-soap-next-visit'),
            precautions: val('standalone-soap-precautions'),
            referral: val('standalone-soap-referral'),
        }
    };
}

function loadSoapDataToForm(soap) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };
    const s = soap.subjective || {};
    const o = soap.objective || {};
    const as = soap.assessment || {};
    const p = soap.plan || {};

    set('standalone-soap-chief-complaint', s.chiefComplaint);
    set('standalone-soap-pain-scale', s.painScale || 0);
    set('standalone-soap-pain-location', s.painLocation);
    set('standalone-soap-symptom-desc', s.symptomDescription);
    set('standalone-soap-onset', s.onset);
    set('standalone-soap-aggravating', s.aggravating);
    set('standalone-soap-relieving', s.relieving);

    set('standalone-soap-rom', o.rom);
    set('standalone-soap-mmt', o.mmt);
    set('standalone-soap-special-tests', o.specialTests);
    set('standalone-soap-palpation', o.palpation);
    set('standalone-soap-gait', o.gait);

    set('standalone-soap-clinical-impression', as.clinicalImpression);
    set('standalone-soap-progress-level', as.progressLevel || 'initial');
    set('standalone-soap-functional-level', as.functionalLevel);
    set('standalone-soap-goals', as.goals);

    set('standalone-soap-treatment', p.treatment);
    set('standalone-soap-hep', p.hep);
    set('standalone-soap-frequency', p.frequency);
    set('standalone-soap-duration', p.duration);
    set('standalone-soap-next-visit', p.nextVisit);
    set('standalone-soap-precautions', p.precautions);
    set('standalone-soap-referral', p.referral);

    // VAS 표시 갱신
    const vasValue = document.getElementById('standalone-soap-vas-value');
    if (vasValue) vasValue.textContent = String(s.painScale || 0);
}

function clearStandaloneSoapForm() {
    const form = document.getElementById('standalone-soap-form');
    if (!form) return;
    form.querySelectorAll('input[type="text"], input[type="range"], textarea, select').forEach(el => {
        if (el.type === 'range') el.value = 0;
        else if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
    });
    const vasValue = document.getElementById('standalone-soap-vas-value');
    if (vasValue) vasValue.textContent = '0';

    // 첫 탭으로 복귀
    form.querySelectorAll('.soap-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    form.querySelectorAll('.soap-tab-content').forEach((p, i) => p.classList.toggle('active', i === 0));
}

// ======== 사이드바 SOAP 보드 (전체 환자) ========

export function renderSoapRecordsView() {
    const listEl = document.getElementById('soap-records-list');
    if (!listEl) return;

    // 환자 필터 드롭다운 갱신
    const patientFilter = document.getElementById('soap-patient-filter');
    if (patientFilter) {
        const currentVal = patientFilter.value;
        const patients = storage.getPatients();
        patientFilter.innerHTML = '<option value="">전체 환자</option>' +
            patients.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
        patientFilter.value = currentVal;
    }

    let records = storage.getAllSoapRecords();

    // 검색 필터
    const query = document.getElementById('soap-search-input')?.value?.trim().toLowerCase();
    if (query) {
        records = records.filter(r => {
            const soap = r.soapNotes;
            const s = soap.subjective || {};
            const as = soap.assessment || {};
            const p = soap.plan || {};
            const searchText = [
                r.patientName, s.chiefComplaint, s.painLocation, s.symptomDescription,
                as.clinicalImpression, p.treatment, p.hep
            ].filter(Boolean).join(' ').toLowerCase();
            return searchText.includes(query);
        });
    }

    // 환자 필터
    const selectedPatient = patientFilter?.value;
    if (selectedPatient) {
        records = records.filter(r => r.patientId === selectedPatient);
    }

    // 날짜 필터
    const dateVal = document.getElementById('soap-date-filter')?.value;
    if (dateVal) {
        const filterDate = new Date(dateVal);
        const filterStart = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate()).getTime();
        const filterEnd = filterStart + 86400000;
        records = records.filter(r => r.date >= filterStart && r.date < filterEnd);
    }

    if (records.length === 0) {
        listEl.innerHTML = `
            <div class="placeholder-empty" style="min-height:300px;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <h3>${query || selectedPatient || dateVal ? '검색 결과가 없습니다' : 'SOAP 기록이 없습니다'}</h3>
                <p>환자 상세에서 SOAP 기록을 작성하면 여기에 표시됩니다.</p>
            </div>`;
        return;
    }

    listEl.innerHTML = records.map(r => {
        const soap = r.soapNotes;
        const s = soap.subjective || {};
        const as = soap.assessment || {};
        const p = soap.plan || {};
        const date = new Date(r.date).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const typeBadge = r.type === 'soap-only'
            ? '<span class="soap-type-badge standalone">독립</span>'
            : '<span class="soap-type-badge session">세션</span>';

        const sLine = s.chiefComplaint || s.painLocation || '';
        const aLine = as.clinicalImpression || '';
        const pLine = p.treatment || p.hep || '';

        return `
        <div class="soap-board-card" data-patient-id="${r.patientId}">
            <div class="soap-board-header">
                <span class="soap-board-patient">${escapeHtml(r.patientName)}</span>
                ${typeBadge}
                <span class="soap-board-date">${date}</span>
            </div>
            <div class="soap-board-content">
                ${sLine ? `<div class="soap-brief-line"><b>S:</b> ${escapeHtml(truncate(sLine, 80))}</div>` : ''}
                ${aLine ? `<div class="soap-brief-line"><b>A:</b> ${escapeHtml(truncate(aLine, 80))}</div>` : ''}
                ${pLine ? `<div class="soap-brief-line"><b>P:</b> ${escapeHtml(truncate(pLine, 80))}</div>` : ''}
            </div>
        </div>`;
    }).join('');

    // 클릭 → 환자 상세로 이동
    listEl.querySelectorAll('.soap-board-card').forEach(card => {
        card.addEventListener('click', () => {
            openPatientDetail(card.dataset.patientId);
        });
    });
}

// ======== Util ========

function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max) + '...' : str;
}
