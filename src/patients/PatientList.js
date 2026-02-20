// PatientList.js - Patient CRUD, form validation, list rendering

import * as storage from '../services/Storage.js';
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

export function renderPatientsList() {
    const list = document.getElementById('patients-list');
    const searchQuery = document.getElementById('input-patient-search').value;
    const sortValue = document.getElementById('select-patient-sort').value;

    let patients = storage.searchPatients(searchQuery);

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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('이 환자와 모든 평가 기록을 삭제하시겠습니까?')) {
                storage.deletePatient(btn.dataset.id);
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

export function savePatient() {
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
        storage.updatePatient(editingPatientId, patientData);
        updatePatientCard(storage.getCurrentPatient());
        window.showToast(`${name} 환자 정보가 수정되었습니다.`, 'success');
    } else {
        const patient = storage.createPatient(patientData);
        storage.setCurrentPatient(patient.id);
        updatePatientCard(patient);
        window.showToast(`${name} 환자가 등록되었습니다.`, 'success');
    }

    hidePatientForm();
    renderPatientsList();
}
