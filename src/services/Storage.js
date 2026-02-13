// storage.js - IndexedDB + localStorage persistence for patients & assessments
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

let data = loadData();

// When IndexedDB is ready, try to load from there (may have newer data)
dbInitPromise.then(async () => {
    if (!dbReady) return;
    try {
        const idbData = await idbGet(STORE_DATA, 'main');
        if (idbData && idbData.patients) {
            // Use IDB data if it has more patients (likely newer)
            if (idbData.patients.length >= data.patients.length) {
                delete idbData.key;
                data = idbData;
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
        overallNotes: '',
        soapNotes: null
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
    deletePosturePhoto(assessmentId);
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

// --- Naver API Settings (localStorage) ---

const NAVER_API_KEY = 'pv_naver_api';

export function getNaverApiSettings() {
    try {
        const stored = localStorage.getItem(NAVER_API_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch {
        return null;
    }
}

export function setNaverApiSettings(clientId, clientSecret = '') {
    localStorage.setItem(NAVER_API_KEY, JSON.stringify({ clientId, clientSecret }));
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

// --- PIN / Data Protection ---

const PIN_KEY = 'pv_pin_hash';

export async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + 'PostureView_Salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hasPinSet() {
    return !!localStorage.getItem(PIN_KEY);
}

export async function setPin(pin) {
    const hash = await hashPin(pin);
    localStorage.setItem(PIN_KEY, hash);
}

export async function verifyPin(pin) {
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored) return true; // No PIN set = always pass
    const hash = await hashPin(pin);
    return hash === stored;
}

export function removePin() {
    localStorage.removeItem(PIN_KEY);
}
