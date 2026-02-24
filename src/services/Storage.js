// storage.js - IndexedDB + localStorage persistence for patients & visits (sessions)
// IndexedDB is primary storage; localStorage used as fallback and for migration

const STORAGE_KEY = 'postureview_data';
const DB_NAME = 'PostureViewDB';
const DB_VERSION = 1;
const STORE_DATA = 'appData';
const STORE_PHOTOS = 'photos';

let db = null;
let dbReady = false;

// ===== IndexedDB Initialization =====

function openDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('IndexedDB not supported'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_DATA)) {
                db.createObjectStore(STORE_DATA, { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
                db.createObjectStore(STORE_PHOTOS, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function initDB() {
    try {
        db = await openDB();
        dbReady = true;
        await migrateFromLocalStorage();
    } catch (e) {
        console.warn('IndexedDB init failed, using localStorage fallback:', e);
        dbReady = false;
    }
}

// Auto-init (non-blocking)
const dbInitPromise = initDB();

// ===== Migration from localStorage =====

async function migrateFromLocalStorage() {
    if (!db) return;
    const migrated = localStorage.getItem('_idb_migrated');
    if (migrated) return;

    try {
        // Migrate main data
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            await idbPut(STORE_DATA, { key: 'main', ...parsed });
        }

        // Migrate photos
        const photoKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('pv_photo_')) {
                photoKeys.push(key);
            }
        }

        for (const key of photoKeys) {
            const assessmentId = key.replace('pv_photo_', '');
            const base64 = localStorage.getItem(key);
            if (base64) {
                // Convert base64 to Blob for 33% savings
                try {
                    const blob = base64ToBlob(base64);
                    await idbPut(STORE_PHOTOS, { id: assessmentId, blob, mimeType: 'image/jpeg' });
                } catch {
                    // Fallback: store as-is
                    await idbPut(STORE_PHOTOS, { id: assessmentId, base64 });
                }
            }
        }

        localStorage.setItem('_idb_migrated', 'true');
        console.log('Migration from localStorage to IndexedDB complete');
    } catch (e) {
        console.warn('Migration error:', e);
    }
}

function base64ToBlob(dataUrl) {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mime });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ===== IndexedDB Helpers =====

function idbPut(storeName, value) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('No DB')); return; }
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(value);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

function idbGet(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('No DB')); return; }
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
    });
}

function idbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
        if (!db) { reject(new Error('No DB')); return; }
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
}

// ===== Data Layer (sync in-memory + async persist) =====

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (e) {
        console.warn('Failed to load data from localStorage:', e);
    }
    return { patients: [], currentPatientId: null, meshNames: {} };
}

function saveData(d) {
    // Always save to localStorage for immediate sync reads
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } catch (e) {
        console.warn('Failed to save data to localStorage:', e);
        if (window.showToast) {
            window.showToast('데이터 저장 실패: 저장소 용량이 부족합니다.', 'error', 5000);
        }
    }
    // Also persist to IndexedDB (async, non-blocking)
    if (dbReady) {
        idbPut(STORE_DATA, { key: 'main', ...d }).catch(e => {
            console.warn('IndexedDB save failed:', e);
        });
    }
}

// --- Data Migration: assessments → visits ---

function migrateAssessmentsToVisits(d) {
    if (!d || !d.patients) return d;
    for (const patient of d.patients) {
        if (patient.assessments && !patient.visits) {
            patient.visits = patient.assessments.map((a, i) => ({
                ...a,
                visitNumber: i + 1,
                status: 'completed',
                exercisePlan: [],
            }));
            delete patient.assessments;
        }
    }
    return d;
}

let data = migrateAssessmentsToVisits(loadData());

// When IndexedDB is ready, try to load from there (may have newer data)
dbInitPromise.then(async () => {
    if (!dbReady) return;
    try {
        const idbData = await idbGet(STORE_DATA, 'main');
        if (idbData && idbData.patients) {
            // Use IDB data if it has more patients (likely newer)
            if (idbData.patients.length >= data.patients.length) {
                delete idbData.key;
                data = migrateAssessmentsToVisits(idbData);
            }
        }
    } catch {
        // Ignore
    }
});

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
        id: patientData.id || crypto.randomUUID(),
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
        visits: []
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

// --- Visits (Sessions) ---

export function createVisit(patientId) {
    const patient = getPatient(patientId);
    if (!patient) return null;
    const visit = {
        id: crypto.randomUUID(),
        visitNumber: (patient.visits?.length || 0) + 1,
        date: Date.now(),
        status: 'in-progress',
        selections: [],
        highlightState: [],
        summary: '',
        overallNotes: '',
        soapNotes: null,
        exercisePlan: []
    };
    patient.visits.push(visit);
    saveData(data);
    return visit;
}

export function createSoapVisit(patientId) {
    const patient = getPatient(patientId);
    if (!patient) return null;
    const visit = {
        id: crypto.randomUUID(),
        visitNumber: (patient.visits?.length || 0) + 1,
        date: Date.now(),
        status: 'completed',
        type: 'soap-only',
        selections: [],
        highlightState: [],
        summary: '',
        overallNotes: '',
        soapNotes: null,
        exercisePlan: []
    };
    patient.visits.push(visit);
    saveData(data);
    return visit;
}

export function getAllSoapRecords() {
    const records = [];
    for (const p of data.patients) {
        for (const v of (p.visits || [])) {
            if (v.soapNotes) {
                records.push({
                    ...v,
                    patientId: p.id,
                    patientName: p.name,
                    patientDiagnosis: p.diagnosis || ''
                });
            }
        }
    }
    records.sort((a, b) => b.date - a.date);
    return records;
}

export function getVisit(patientId, visitId) {
    const patient = getPatient(patientId);
    if (!patient) return null;
    return (patient.visits || []).find(v => v.id === visitId) || null;
}

export function updateVisit(patientId, visitId, updates) {
    const visit = getVisit(patientId, visitId);
    if (!visit) return null;
    Object.assign(visit, updates);
    saveData(data);
    return visit;
}

export function addSelectionToVisit(patientId, visitId, selection) {
    const visit = getVisit(patientId, visitId);
    if (!visit) return null;
    const idx = visit.selections.findIndex(s => s.meshId === selection.meshId);
    if (idx >= 0) {
        visit.selections[idx] = selection;
    } else {
        visit.selections.push(selection);
    }
    saveData(data);
    return visit;
}

export function deleteVisit(patientId, visitId) {
    const patient = getPatient(patientId);
    if (!patient) return;
    patient.visits = (patient.visits || []).filter(v => v.id !== visitId);
    deletePosturePhoto(visitId);
    saveData(data);
}

export function saveHighlightState(patientId, visitId, highlightState) {
    const visit = getVisit(patientId, visitId);
    if (!visit) return null;
    visit.highlightState = highlightState;
    saveData(data);
    return visit;
}

// Backward compatibility aliases
export { createVisit as createAssessment };
export { getVisit as getAssessment };
export { updateVisit as updateAssessment };
export { addSelectionToVisit as addSelectionToAssessment };
export { deleteVisit as deleteAssessment };

// --- Search & Sort ---

export function searchPatients(query) {
    if (!query || !query.trim()) return data.patients;
    const q = query.trim().toLowerCase();
    return data.patients.filter(p => {
        // 이름 검색
        if (p.name.toLowerCase().includes(q)) return true;
        // 진단/호소 검색
        if (p.diagnosis && p.diagnosis.toLowerCase().includes(q)) return true;
        // 내원(세션) 내 SOAP 노트 검색
        for (const v of (p.visits || [])) {
            if (v.overallNotes && v.overallNotes.toLowerCase().includes(q)) return true;
            const soap = v.soapNotes;
            if (!soap) continue;
            const s = soap.subjective || {};
            const o = soap.objective || {};
            const as = soap.assessment || {};
            const pl = soap.plan || {};
            const fields = [
                s.chiefComplaint, s.painLocation, s.symptomDescription,
                o.autoFindings, o.rom, o.mmt, o.specialTests, o.palpation,
                as.clinicalImpression, as.functionalLevel, as.goals,
                pl.treatment, pl.hep, pl.frequency, pl.precautions, pl.referral,
            ];
            if (fields.some(f => f && String(f).toLowerCase().includes(q))) return true;
        }
        return false;
    });
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
                cmp = (a.visits?.length || 0) - (b.visits?.length || 0);
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

    let totalVisits = 0;
    let todayVisits = 0;
    const severityCounts = { normal: 0, mild: 0, moderate: 0, severe: 0 };
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    let recentVisits = [];

    for (const p of patients) {
        for (const v of (p.visits || [])) {
            totalVisits++;
            if (v.date >= todayStart && v.date < todayEnd) todayVisits++;
            if (v.date >= sevenDaysAgo) {
                recentVisits.push({ ...v, patientName: p.name, patientId: p.id });
            }
            for (const s of (v.selections || [])) {
                if (s.severity && severityCounts.hasOwnProperty(s.severity)) {
                    severityCounts[s.severity]++;
                }
            }
        }
    }

    recentVisits.sort((a, b) => b.date - a.date);

    const recentPatients = [...patients]
        .filter(p => p.visits && p.visits.length > 0)
        .sort((a, b) => {
            const lastA = Math.max(...a.visits.map(x => x.date));
            const lastB = Math.max(...b.visits.map(x => x.date));
            return lastB - lastA;
        })
        .slice(0, 5);

    return {
        totalPatients: patients.length,
        totalVisits,
        todayVisits,
        recentVisits: recentVisits.slice(0, 10),
        recentPatients,
        severityCounts
    };
}

// --- Visit Summary ---

export function generateVisitSummary(visit) {
    const selections = visit.selections || [];
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

export { generateVisitSummary as generateAssessmentSummary };

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

// --- Posture Photos (IndexedDB primary, localStorage fallback) ---

const PHOTO_PREFIX = 'pv_photo_';

export function savePosturePhoto(assessmentId, base64Data) {
    // Try IndexedDB first (Blob storage for efficiency)
    if (dbReady) {
        try {
            const blob = base64ToBlob(base64Data);
            idbPut(STORE_PHOTOS, { id: assessmentId, blob, mimeType: 'image/jpeg' }).catch(() => {});
        } catch {
            idbPut(STORE_PHOTOS, { id: assessmentId, base64: base64Data }).catch(() => {});
        }
    }
    // Also try localStorage as fallback
    try {
        localStorage.setItem(PHOTO_PREFIX + assessmentId, base64Data);
    } catch (e) {
        console.warn('사진 localStorage 저장 실패 (용량 초과 가능):', e);
        if (!dbReady && window.showToast) {
            const usage = getStorageUsage();
            window.showToast(`사진 저장 실패: 저장소 용량 부족 (${usage.usedMB}MB / ${usage.limitMB}MB 사용 중)`, 'error', 5000);
            return false;
        }
    }
    return true;
}

export function getPosturePhoto(assessmentId) {
    // Sync: return from localStorage immediately
    const lsPhoto = localStorage.getItem(PHOTO_PREFIX + assessmentId);
    if (lsPhoto) return lsPhoto;

    // IndexedDB photos are async - can't return synchronously
    // Trigger async load for future use
    if (dbReady) {
        idbGet(STORE_PHOTOS, assessmentId).then(record => {
            if (record) {
                if (record.blob) {
                    blobToBase64(record.blob).then(b64 => {
                        try { localStorage.setItem(PHOTO_PREFIX + assessmentId, b64); } catch {}
                    });
                } else if (record.base64) {
                    try { localStorage.setItem(PHOTO_PREFIX + assessmentId, record.base64); } catch {}
                }
            }
        }).catch(() => {});
    }
    return null;
}

export function deletePosturePhoto(assessmentId) {
    localStorage.removeItem(PHOTO_PREFIX + assessmentId);
    if (dbReady) {
        idbDelete(STORE_PHOTOS, assessmentId).catch(() => {});
    }
}

// --- Storage Usage ---

export function getStorageUsage() {
    let totalBytes = 0;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            totalBytes += (key.length + value.length) * 2; // UTF-16
        }
    } catch (e) {
        // Ignore
    }
    const limitBytes = dbReady ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    const limitMB = dbReady ? 50 : 5;
    return {
        usedBytes: totalBytes,
        usedMB: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
        limitMB,
        percent: Math.min(Math.round((totalBytes / limitBytes) * 100), 100),
        usingIndexedDB: dbReady,
    };
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
        let imported = JSON.parse(jsonString);
        if (imported.patients && Array.isArray(imported.patients)) {
            data = migrateAssessmentsToVisits(imported);
            saveData(data);
            return true;
        }
    } catch (e) {
        console.error('Import failed:', e);
    }
    return false;
}

