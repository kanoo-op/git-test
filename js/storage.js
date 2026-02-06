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

export function createPatient(name, dob, notes) {
    const patient = {
        id: crypto.randomUUID(),
        name,
        dob,
        notes,
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
        summary: ''
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
