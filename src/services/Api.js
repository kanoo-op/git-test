// api.js - HTTP client for PostureView backend API
// Handles all communication with FastAPI, token management, and request/response formatting

const API_BASE = '/api';

let accessToken = null;
let refreshToken = null;
let currentUser = null;

// --- Token Management ---

export function setTokens(access, refresh) {
    accessToken = access;
    refreshToken = refresh;
    if (access) {
        localStorage.setItem('pv_access_token', access);
    } else {
        localStorage.removeItem('pv_access_token');
    }
    if (refresh) {
        localStorage.setItem('pv_refresh_token', refresh);
    } else {
        localStorage.removeItem('pv_refresh_token');
    }
}

export function getAccessToken() {
    if (!accessToken) {
        accessToken = localStorage.getItem('pv_access_token');
    }
    return accessToken;
}

export function getRefreshTokenValue() {
    if (!refreshToken) {
        refreshToken = localStorage.getItem('pv_refresh_token');
    }
    return refreshToken;
}

export function clearTokens() {
    accessToken = null;
    refreshToken = null;
    currentUser = null;
    localStorage.removeItem('pv_access_token');
    localStorage.removeItem('pv_refresh_token');
    localStorage.removeItem('pv_current_user');
}

export function setCurrentUser(user) {
    currentUser = user;
    if (user) {
        localStorage.setItem('pv_current_user', JSON.stringify(user));
    } else {
        localStorage.removeItem('pv_current_user');
    }
}

export function getCurrentUser() {
    if (!currentUser) {
        try {
            const stored = localStorage.getItem('pv_current_user');
            if (stored) currentUser = JSON.parse(stored);
        } catch { /* ignore */ }
    }
    return currentUser;
}

export function isLoggedIn() {
    return !!getAccessToken();
}

// --- Core HTTP ---

async function request(method, path, body = null, options = {}) {
    const url = API_BASE + path;
    const headers = {};

    const token = getAccessToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions = { method, headers };

    if (body !== null && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
        // Don't set Content-Type for FormData (browser sets boundary)
        fetchOptions.body = body;
    }

    let response = await fetch(url, fetchOptions);

    // Auto-refresh on 401 (with mutex to prevent concurrent refresh attempts)
    if (response.status === 401 && getRefreshTokenValue()) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
            headers['Authorization'] = `Bearer ${accessToken}`;
            response = await fetch(url, { method, headers, body: fetchOptions.body });
        } else {
            clearTokens();
            window.dispatchEvent(new Event('pv:auth:expired'));
            throw new ApiError(401, 'Session expired. Please log in again.');
        }
    }

    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const errBody = await response.json();
            detail = errBody.detail || detail;
        } catch { /* ignore */ }
        throw new ApiError(response.status, detail);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
        return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    // Binary response (photos)
    return response;
}

let _refreshPromise = null;

async function tryRefreshToken() {
    // Mutex: if a refresh is already in progress, wait for it instead of firing another
    if (_refreshPromise) {
        return _refreshPromise;
    }

    _refreshPromise = (async () => {
        try {
            const rt = getRefreshTokenValue();
            if (!rt) return false;

            const response = await fetch(`${API_BASE}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: rt }),
            });

            if (!response.ok) return false;

            const data = await response.json();
            setTokens(data.access_token, data.refresh_token);
            setCurrentUser(data.user);
            return true;
        } catch {
            return false;
        } finally {
            _refreshPromise = null;
        }
    })();

    return _refreshPromise;
}

export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'ApiError';
    }
}

// --- Auth API ---

export async function login(username, password) {
    const data = await request('POST', '/auth/login', { username, password });
    setTokens(data.access_token, data.refresh_token);
    setCurrentUser(data.user);
    return data;
}

export async function register(userData) {
    return request('POST', '/auth/register', userData);
}

export async function logout() {
    try {
        await request('POST', '/auth/logout');
    } catch { /* ignore */ }
    clearTokens();
}

export async function changePassword(currentPassword, newPassword) {
    return request('PUT', '/auth/password', {
        current_password: currentPassword,
        new_password: newPassword,
    });
}

export async function getMe() {
    return request('GET', '/auth/me');
}

// --- Patients API ---

export async function fetchPatients(params = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.sort) qs.set('sort', params.sort);
    if (params.order) qs.set('order', params.order);
    if (params.page) qs.set('page', params.page);
    if (params.limit) qs.set('limit', params.limit);
    const query = qs.toString();
    return request('GET', `/patients${query ? '?' + query : ''}`);
}

export async function fetchPatient(id) {
    return request('GET', `/patients/${id}`);
}

export async function createPatient(data) {
    return request('POST', '/patients', data);
}

export async function updatePatient(id, data) {
    return request('PUT', `/patients/${id}`, data);
}

export async function deletePatient(id) {
    return request('DELETE', `/patients/${id}`);
}

export async function exportPatient(id) {
    return request('GET', `/patients/${id}/export`);
}

// --- Assessments API ---

export async function fetchAssessments(patientId) {
    return request('GET', `/patients/${patientId}/assessments`);
}

export async function fetchAssessment(patientId, assessmentId) {
    return request('GET', `/patients/${patientId}/assessments/${assessmentId}`);
}

export async function createAssessment(patientId, data = {}) {
    return request('POST', `/patients/${patientId}/assessments`, data);
}

export async function updateAssessment(patientId, assessmentId, data) {
    return request('PUT', `/patients/${patientId}/assessments/${assessmentId}`, data);
}

export async function deleteAssessment(patientId, assessmentId) {
    return request('DELETE', `/patients/${patientId}/assessments/${assessmentId}`);
}

export async function upsertSelections(patientId, assessmentId, selections) {
    return request('PUT', `/patients/${patientId}/assessments/${assessmentId}/selections`, { selections });
}

export async function saveHighlights(patientId, assessmentId, highlightState) {
    return request('PUT', `/patients/${patientId}/assessments/${assessmentId}/highlights`, { highlight_state: highlightState });
}

// --- Photos API ---

export async function uploadPhoto(patientId, assessmentId, blob, mimeType = 'image/jpeg') {
    const formData = new FormData();
    formData.append('file', blob, 'posture.jpg');
    return request('POST', `/patients/${patientId}/assessments/${assessmentId}/photo`, formData);
}

const _activePhotoUrls = new Set();

export async function getPhotoUrl(patientId, assessmentId) {
    try {
        const response = await request('GET', `/patients/${patientId}/assessments/${assessmentId}/photo`);
        if (response instanceof Response) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            _activePhotoUrls.add(url);
            return url;
        }
        return null;
    } catch {
        return null;
    }
}

export function revokePhotoUrl(url) {
    if (url && _activePhotoUrls.has(url)) {
        URL.revokeObjectURL(url);
        _activePhotoUrls.delete(url);
    }
}

export async function deletePhoto(patientId, assessmentId) {
    return request('DELETE', `/patients/${patientId}/assessments/${assessmentId}/photo`);
}

// --- Dashboard API ---

export async function fetchDashboardStats() {
    return request('GET', '/dashboard/stats');
}

// --- Mappings API ---

export async function fetchMappings() {
    return request('GET', '/mappings');
}

export async function saveMapping(data) {
    return request('POST', '/mappings', data);
}

export async function fetchMeshNames() {
    return request('GET', '/mappings/mesh-names');
}

export async function saveMeshName(meshId, customName) {
    return request('PUT', '/mappings/mesh-names', { mesh_id: meshId, custom_name: customName });
}

// --- Users API (admin) ---

export async function fetchUsers() {
    return request('GET', '/users');
}

export async function updateUser(userId, data) {
    return request('PUT', `/users/${userId}`, data);
}

export async function deleteUser(userId) {
    return request('DELETE', `/users/${userId}`);
}

// --- Backup API (admin) ---

export async function createBackup() {
    const token = getAccessToken();
    const response = await fetch(`${API_BASE}/backup`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
        throw new ApiError(response.status, 'Backup failed');
    }
    return response;
}

export async function restoreBackup(file) {
    const token = getAccessToken();
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/backup/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
    });
    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const errBody = await response.json();
            detail = errBody.detail || detail;
        } catch { /* ignore */ }
        throw new ApiError(response.status, detail);
    }
    return response.json();
}

// --- Audit API (admin) ---

export async function fetchAuditLogs(params = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', params.page);
    if (params.limit) qs.set('limit', params.limit);
    if (params.action) qs.set('action', params.action);
    if (params.resource) qs.set('resource', params.resource);
    const query = qs.toString();
    return request('GET', `/audit${query ? '?' + query : ''}`);
}

// --- Naver Local Search ---

export async function searchNearbyPlaces(query, x = null, y = null, radius = 0, display = 15) {
    let url = `/naver/local-search?query=${encodeURIComponent(query)}&display=${display}`;
    if (x != null && y != null) {
        url += `&x=${x}&y=${y}&radius=${radius}`;
    }
    return request('GET', url);
}
