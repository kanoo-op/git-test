// storage.js - localStorage persistence for patients & assessments

const STORAGE_KEY = 'postureview_data';

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to load data from localStorage:', e);
    }
    return { patients: [], currentPatientId: null, meshNames: {} };
}

function saveData(data) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save data to localStorage:', e);
    }
}

let data = loadData();

// --- Patients ---

export function getPatients() {
    return data.patients;
}

export function getPatient(id) {
    return data.patients.find(p => p.id === id) || null;
}

export function getCurrentPatient() {
    if (!data.currentPatientId) return null;
    return getPatient(data.currentPatientId);
}

export function setCurrentPatient(id) {
    data.currentPatientId = id;
    saveData(data);
}

export function createPatient(patientData) {
    const patient = {
        id: crypto.randomUUID(),
        name: patientData.name,
        dob: patientData.dob || '',
        gender: patientData.gender || '',
        phone: patientData.phone || '',
        email: patientData.email || '',
        diagnosis: patientData.diagnosis || '',
        medicalHistory: patientData.medicalHistory || '',
        occupation: patientData.occupation || '',
        notes: patientData.notes || '',
        createdAt: Date.now(),
        assessments: []
    };
    data.patients.push(patient);
    saveData(data);
    return patient;
}

export function updatePatient(id, updates) {
    const patient = getPatient(id);
    if (!patient) return null;
    Object.assign(patient, updates);
    saveData(data);
    return patient;
}

export function deletePatient(id) {
    data.patients = data.patients.filter(p => p.id !== id);
    if (data.currentPatientId === id) {
        data.currentPatientId = null;
    }
    saveData(data);
}

// --- Assessments ---

export function createAssessment(patientId) {
    const patient = getPatient(patientId);
    if (!patient) return null;
    const assessment = {
        id: crypto.randomUUID(),
        date: Date.now(),
        selections: [],
        highlightState: [],
        summary: '',
        overallNotes: ''
    };
    patient.assessments.push(assessment);
    saveData(data);
    return assessment;
}

export function getAssessment(patientId, assessmentId) {
    const patient = getPatient(patientId);
    if (!patient) return null;
    return patient.assessments.find(a => a.id === assessmentId) || null;
}

export function updateAssessment(patientId, assessmentId, updates) {
    const assessment = getAssessment(patientId, assessmentId);
    if (!assessment) return null;
    Object.assign(assessment, updates);
    saveData(data);
    return assessment;
}

export function addSelectionToAssessment(patientId, assessmentId, selection) {
    const assessment = getAssessment(patientId, assessmentId);
    if (!assessment) return null;
    // Replace if same mesh already selected
    const idx = assessment.selections.findIndex(s => s.meshId === selection.meshId);
    if (idx >= 0) {
        assessment.selections[idx] = selection;
    } else {
        assessment.selections.push(selection);
    }
    saveData(data);
    return assessment;
}

export function deleteAssessment(patientId, assessmentId) {
    const patient = getPatient(patientId);
    if (!patient) return;
    patient.assessments = patient.assessments.filter(a => a.id !== assessmentId);
    saveData(data);
}

export function saveHighlightState(patientId, assessmentId, highlightState) {
    const assessment = getAssessment(patientId, assessmentId);
    if (!assessment) return null;
    assessment.highlightState = highlightState;
    saveData(data);
    return assessment;
}

// --- Search & Sort ---

export function searchPatients(query) {
    if (!query || !query.trim()) return data.patients;
    const q = query.trim().toLowerCase();
    return data.patients.filter(p => p.name.toLowerCase().includes(q));
}

export function sortPatients(patients, sortBy = 'name', ascending = true) {
    const sorted = [...patients];
    sorted.sort((a, b) => {
        let cmp = 0;
        switch (sortBy) {
            case 'name':
                cmp = a.name.localeCompare(b.name, 'ko');
                break;
            case 'date':
                cmp = a.createdAt - b.createdAt;
                break;
            case 'assessments':
                cmp = (a.assessments?.length || 0) - (b.assessments?.length || 0);
                break;
        }
        return ascending ? cmp : -cmp;
    });
    return sorted;
}

// --- Dashboard Stats ---

export function getDashboardStats() {
    const patients = data.patients;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 86400000;

    let totalAssessments = 0;
    let todayAssessments = 0;
    const severityCounts = { normal: 0, mild: 0, moderate: 0, severe: 0 };
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    let recentAssessments = [];

    for (const p of patients) {
        for (const a of (p.assessments || [])) {
            totalAssessments++;
            if (a.date >= todayStart && a.date < todayEnd) todayAssessments++;
            if (a.date >= sevenDaysAgo) {
                recentAssessments.push({ ...a, patientName: p.name, patientId: p.id });
            }
            for (const s of (a.selections || [])) {
                if (s.severity && severityCounts.hasOwnProperty(s.severity)) {
                    severityCounts[s.severity]++;
                }
            }
        }
    }

    recentAssessments.sort((a, b) => b.date - a.date);

    const recentPatients = [...patients]
        .filter(p => p.assessments && p.assessments.length > 0)
        .sort((a, b) => {
            const lastA = Math.max(...a.assessments.map(x => x.date));
            const lastB = Math.max(...b.assessments.map(x => x.date));
            return lastB - lastA;
        })
        .slice(0, 5);

    return {
        totalPatients: patients.length,
        totalAssessments,
        todayAssessments,
        recentAssessments: recentAssessments.slice(0, 10),
        recentPatients,
        severityCounts
    };
}

// --- Assessment Summary ---

export function generateAssessmentSummary(assessment) {
    const selections = assessment.selections || [];
    const counts = { normal: 0, mild: 0, moderate: 0, severe: 0 };
    const concerns = [];

    for (const s of selections) {
        if (s.severity && counts.hasOwnProperty(s.severity)) {
            counts[s.severity]++;
        }
        if (s.concern) concerns.push(s.region || s.meshId);
    }

    const labels = { severe: '중증', moderate: '중등도', mild: '경도', normal: '정상' };
    const parts = [];
    for (const [key, label] of Object.entries(labels)) {
        if (counts[key] > 0) parts.push(`${label} ${counts[key]}`);
    }

    let summary = parts.length > 0 ? parts.join(', ') : '평가 없음';
    if (concerns.length > 0) {
        summary += ` | 관심: ${concerns.slice(0, 3).join(', ')}`;
    }
    return summary;
}

// --- Per-Patient Export ---

export function exportPatientData(patientId) {
    const patient = getPatient(patientId);
    if (!patient) return;
    const blob = new Blob([JSON.stringify(patient, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = patient.name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    a.download = `postureview-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// --- Mapping Data ---

export function saveMapping(mappingJson) {
    data.mapping = mappingJson;
    saveData(data);
}

export function getMapping() {
    return data.mapping || null;
}

export function clearMappingData() {
    data.mapping = null;
    saveData(data);
}

// --- Custom Mesh Names ---

export function getMeshName(meshId) {
    return data.meshNames[meshId] || null;
}

export function setMeshName(meshId, name) {
    data.meshNames[meshId] = name;
    saveData(data);
}

// --- Export / Import ---

export function exportAllData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `postureview-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function importData(jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        if (imported.patients && Array.isArray(imported.patients)) {
            data = imported;
            saveData(data);
            return true;
        }
    } catch (e) {
        console.error('Import failed:', e);
    }
    return false;
}
