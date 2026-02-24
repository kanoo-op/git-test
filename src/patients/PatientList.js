// PatientList.js - Patient CRUD, form validation, list rendering

import * as storage from '../services/Storage.js';
import { createPatient as apiCreatePatient, updatePatient as apiUpdatePatient, deletePatient as apiDeletePatient, createInvite } from '../services/Api.js';
import { syncPatientsFromServer } from '../services/Auth.js';
import { resetRegionColors } from '../anatomy/Highlights.js';
import { updatePatientCard } from '../ui/Sidebar.js';
import { calculateAge, escapeHtml } from '../utils/helpers.js';
import {
    switchView,
    setEditingPatientId, getEditingPatientId,
    setLoadedAssessmentId,
    setCurrentDetailPatientId,
    getCompareSelections,
} from '../ui/ViewRouter.js';

export function openPatientDetail(patientId) {
    setCurrentDetailPatientId(patientId);
    storage.setCurrentPatient(patientId);
    updatePatientCard(storage.getCurrentPatient());
    getCompareSelections().clear();

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    switchView('patient-detail');
}

let _syncing = false;

export function renderPatientsList() {
    const list = document.getElementById('patients-list');
    const searchQuery = document.getElementById('input-patient-search').value;
    const sortValue = document.getElementById('select-patient-sort').value;

    let patients = storage.searchPatients(searchQuery);

    // 서버에서 환자 목록 동기화 (중복 호출 방지)
    if (!_syncing) {
        _syncing = true;
        const prevCount = patients.length;
        syncPatientsFromServer().then(() => {
            const newCount = storage.searchPatients(searchQuery).length;
            if (newCount !== prevCount) {
                renderPatientsList();
            }
        }).finally(() => { _syncing = false; });
    }

    const [sortBy, sortDir] = sortValue.split('-');
    patients = storage.sortPatients(patients, sortBy, sortDir === 'asc');

    if (patients.length === 0) {
        const isSearching = searchQuery.trim().length > 0;
        list.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
                <p>${isSearching ? '검색 결과가 없습니다.' : '등록된 환자가 없습니다. 새 환자를 등록해 주세요.'}</p>
            </div>
        `;
        return;
    }

    list.innerHTML = patients.map(p => {
        const age = p.dob ? calculateAge(p.dob) : '-';
        return `
            <div class="patient-card-item" data-patient-id="${p.id}">
                <div>
                    <div class="name">${escapeHtml(p.name)}</div>
                    <div class="meta">나이: ${age} | 내원: ${p.visits?.length || 0}건${p.diagnosis ? ' | ' + escapeHtml(p.diagnosis) : ''}</div>
                </div>
                <div class="actions">
                    <button class="delete delete-patient" data-id="${p.id}">삭제</button>
                </div>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.patient-card-item').forEach(card => {
        card.addEventListener('click', () => openPatientDetail(card.dataset.patientId));
    });

    list.querySelectorAll('.delete-patient').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('이 환자와 모든 평가 기록을 삭제하시겠습니까?')) {
                const id = btn.dataset.id;
                storage.deletePatient(id);
                try { await apiDeletePatient(id); } catch { /* offline OK */ }
                updatePatientCard(storage.getCurrentPatient());
                resetRegionColors();
                setLoadedAssessmentId(null);
                renderPatientsList();
            }
        });
    });
}

export function showNewPatientForm() {
    setEditingPatientId(null);
    document.getElementById('patient-form').style.display = 'block';
    document.getElementById('patient-form-title').textContent = '새 환자 등록';
    document.getElementById('btn-save-patient').textContent = '저장';
    document.getElementById('input-patient-name').value = '';
    document.getElementById('input-patient-dob').value = '';
    document.getElementById('select-patient-gender').value = '';
    document.getElementById('input-patient-phone').value = '';
    document.getElementById('input-patient-email').value = '';
    document.getElementById('input-patient-diagnosis').value = '';
    document.getElementById('input-patient-history').value = '';
    document.getElementById('input-patient-occupation').value = '';
    document.getElementById('input-patient-notes').value = '';
    document.getElementById('input-patient-name').focus();
}

export function showEditPatientForm(patientId) {
    const patient = storage.getPatient(patientId);
    if (!patient) return;

    setEditingPatientId(patientId);
    document.getElementById('patient-form').style.display = 'block';
    document.getElementById('patient-form-title').textContent = '환자 정보 수정';
    document.getElementById('btn-save-patient').textContent = '수정 저장';
    document.getElementById('input-patient-name').value = patient.name || '';
    document.getElementById('input-patient-dob').value = patient.dob || '';
    document.getElementById('select-patient-gender').value = patient.gender || '';
    document.getElementById('input-patient-phone').value = patient.phone || '';
    document.getElementById('input-patient-email').value = patient.email || '';
    document.getElementById('input-patient-diagnosis').value = patient.diagnosis || '';
    document.getElementById('input-patient-history').value = patient.medicalHistory || '';
    document.getElementById('input-patient-occupation').value = patient.occupation || '';
    document.getElementById('input-patient-notes').value = patient.notes || '';
    document.getElementById('input-patient-name').focus();
}

export function hidePatientForm() {
    document.getElementById('patient-form').style.display = 'none';
    setEditingPatientId(null);
}

function clearFormErrors() {
    document.querySelectorAll('#patient-form .form-group.error').forEach(g => {
        g.classList.remove('error');
        const msg = g.querySelector('.form-error-message');
        if (msg) msg.remove();
    });
}

function setFormError(inputId, message) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const group = input.closest('.form-group');
    if (!group) return;
    group.classList.add('error');
    const span = document.createElement('span');
    span.className = 'form-error-message';
    span.textContent = message;
    group.appendChild(span);
}

function validatePatientForm() {
    clearFormErrors();
    let valid = true;

    const name = document.getElementById('input-patient-name').value.trim();
    if (!name) {
        setFormError('input-patient-name', '이름은 필수입니다.');
        valid = false;
    } else if (name.length < 2) {
        setFormError('input-patient-name', '이름은 2자 이상이어야 합니다.');
        valid = false;
    }

    const email = document.getElementById('input-patient-email').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setFormError('input-patient-email', '올바른 이메일 형식이 아닙니다.');
        valid = false;
    }

    const phone = document.getElementById('input-patient-phone').value.trim();
    if (phone && !/^[\d\-+() ]+$/.test(phone)) {
        setFormError('input-patient-phone', '숫자, 하이픈, 괄호만 입력 가능합니다.');
        valid = false;
    }

    const dob = document.getElementById('input-patient-dob').value;
    if (dob) {
        const dobDate = new Date(dob);
        if (dobDate > new Date()) {
            setFormError('input-patient-dob', '미래 날짜는 입력할 수 없습니다.');
            valid = false;
        }
    }

    return valid;
}

export async function savePatient() {
    if (!validatePatientForm()) {
        const firstError = document.querySelector('#patient-form .form-group.error input, #patient-form .form-group.error select');
        if (firstError) firstError.focus();
        window.showToast('입력 정보를 확인해주세요.', 'warning');
        return;
    }

    const name = document.getElementById('input-patient-name').value.trim();
    const patientData = {
        name,
        dob: document.getElementById('input-patient-dob').value,
        gender: document.getElementById('select-patient-gender').value,
        phone: document.getElementById('input-patient-phone').value.trim(),
        email: document.getElementById('input-patient-email').value.trim(),
        diagnosis: document.getElementById('input-patient-diagnosis').value.trim(),
        medicalHistory: document.getElementById('input-patient-history').value.trim(),
        occupation: document.getElementById('input-patient-occupation').value.trim(),
        notes: document.getElementById('input-patient-notes').value.trim(),
    };

    const editingPatientId = getEditingPatientId();
    if (editingPatientId) {
        // Update existing patient
        storage.updatePatient(editingPatientId, patientData);
        updatePatientCard(storage.getCurrentPatient());
        // Sync to backend
        try {
            await apiUpdatePatient(editingPatientId, {
                name: patientData.name,
                dob: patientData.dob || null,
                gender: patientData.gender || null,
                phone: patientData.phone || null,
                email: patientData.email || null,
                diagnosis: patientData.diagnosis || null,
                medical_history: patientData.medicalHistory || null,
                occupation: patientData.occupation || null,
                notes: patientData.notes || null,
            });
        } catch { /* offline OK */ }
        window.showToast(`${name} 환자 정보가 수정되었습니다.`, 'success');
    } else {
        // Create new patient - backend first to get server ID
        let serverId = null;
        let inviteCode = null;
        try {
            const serverPatient = await apiCreatePatient({
                name: patientData.name,
                dob: patientData.dob || null,
                gender: patientData.gender || null,
                phone: patientData.phone || null,
                email: patientData.email || null,
                diagnosis: patientData.diagnosis || null,
                medical_history: patientData.medicalHistory || null,
                occupation: patientData.occupation || null,
                notes: patientData.notes || null,
            });
            serverId = serverPatient.id;

            // Auto-generate invite code
            try {
                const invite = await createInvite(serverId);
                inviteCode = invite.invite_code;
            } catch { /* ignore */ }
        } catch (e) {
            console.warn('Backend patient creation failed, creating locally only:', e);
        }

        // Create locally (use server ID if available)
        if (serverId) patientData.id = serverId;
        const patient = storage.createPatient(patientData);
        storage.setCurrentPatient(patient.id);
        updatePatientCard(patient);

        if (inviteCode) {
            showInviteCodeModal(name, inviteCode);
        } else {
            window.showToast(`${name} 환자가 등록되었습니다.`, 'success');
        }
    }

    hidePatientForm();
    renderPatientsList();
}

function showInviteCodeModal(patientName, code) {
    // Remove existing modal if any
    document.getElementById('invite-code-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'invite-code-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.innerHTML = `
        <div style="background:var(--bg-primary,#fff);border-radius:12px;padding:32px;max-width:400px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:14px;color:var(--text-secondary,#666);margin-bottom:8px;">환자 등록 완료</div>
            <div style="font-size:18px;font-weight:600;color:var(--text-primary,#333);margin-bottom:20px;">${patientName}</div>
            <div style="font-size:13px;color:var(--text-secondary,#666);margin-bottom:8px;">환자 앱 초대 코드</div>
            <div style="font-size:36px;font-weight:700;letter-spacing:6px;color:var(--accent,#4A90D9);margin-bottom:8px;font-family:monospace;">${code}</div>
            <div style="font-size:12px;color:var(--text-tertiary,#999);margin-bottom:24px;">72시간 유효 · 환자에게 이 코드를 전달하세요</div>
            <div style="display:flex;gap:8px;justify-content:center;">
                <button id="btn-copy-invite-code" style="padding:10px 24px;background:var(--accent,#4A90D9);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;">코드 복사</button>
                <button id="btn-close-invite-modal" style="padding:10px 24px;background:var(--bg-secondary,#f0f0f0);color:var(--text-primary,#333);border:none;border-radius:8px;cursor:pointer;font-size:14px;">닫기</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btn-copy-invite-code').addEventListener('click', () => {
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('btn-copy-invite-code');
            btn.textContent = '복사됨!';
            setTimeout(() => { btn.textContent = '코드 복사'; }, 1500);
        });
    });

    document.getElementById('btn-close-invite-modal').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}
