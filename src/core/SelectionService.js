// SelectionService.js - Unified selection state, hit list, layer filtering
//
// All click/hover/right-click events flow through here.
// Controls.js passes raw intersects → this module filters, enriches,
// handles mapping mode, shows hit list for overlapping meshes, and
// notifies listeners (main.js tooltip, ContextPanel, etc.)

import { getRegion, getTissueName, getMeshRegionKey } from '../anatomy/Regions.js';
import {
    selectMesh, deselectCurrentMesh, getSelectedMesh,
    setHoverHighlight, clearHoverHighlight,
    currentRenderMode,
} from '../anatomy/Highlights.js';
import { openContextPanel, closeContextPanel } from '../ui/ContextPanel.js';
import { isMappingAssignMode } from '../ui/ViewRouter.js';
import { handleMappingAssign, handleMappingRemove } from '../mapping/MappingEditor.js';

// ═══ Tissue group prefixes (mirrored from Highlights.js for layer filtering) ═══
const BONE_PREFIXES = ['Bone', 'Suture', 'Teeth'];

// ═══ State ═══
let hitList = [];       // enriched hit objects after filtering
let hitIndex = 0;       // current cycle index within hitList

// Listeners: { select: [], deselect: [], hover: [] }
const listeners = { select: [], deselect: [], hover: [] };

// ═══ Public API ═══

/**
 * Called by Controls.js onClick → passes ALL raw intersects.
 */
export function handleClick(allIntersects, event) {
    // 1. Filter + enrich
    const hits = enrichHits(filterHits(allIntersects));

    // 2. Mapping assign mode takes priority
    if (isMappingAssignMode() && hits.length > 0) {
        handleMappingAssign(hits[0].mesh);
        return;
    }

    // 3. No hits → deselect
    if (hits.length === 0) {
        performDeselect();
        hideHitListUI();
        return;
    }

    // 4. Toggle: re-clicking same mesh deselects
    const currentSel = getSelectedMesh();
    if (hits.length === 1 && currentSel === hits[0].mesh) {
        performDeselect();
        hideHitListUI();
        return;
    }

    // 5. Single hit → select directly
    if (hits.length === 1) {
        hitList = hits;
        hitIndex = 0;
        hideHitListUI();
        selectHit(hits[0]);
        return;
    }

    // 6. Multiple hits → show hit list, select first
    hitList = hits;
    hitIndex = 0;
    selectHit(hits[0]);
    showHitListUI();
}

/**
 * Called by Controls.js onPointerMove → passes ALL raw intersects.
 */
export function handleHover(allIntersects, event) {
    const hits = filterHits(allIntersects);

    if (hits.length > 0) {
        const hit = hits[0];
        setHoverHighlight(hit.object);

        const region = getRegion(hit.object);
        const tissue = getTissueName(hit.object.userData.tissueType);

        notifyListeners('hover', {
            mesh: hit.object,
            info: {
                tissue,
                region: region.regionLabel,
                side: region.side,
                source: region.source,
                x: event.clientX,
                y: event.clientY,
            },
        });
    } else {
        clearHoverHighlight();
        notifyListeners('hover', { mesh: null, info: null });
    }
}

/**
 * Called by Controls.js onRightClick → passes ALL raw intersects.
 */
export function handleRightClick(allIntersects) {
    if (!isMappingAssignMode()) return;

    const hits = filterHits(allIntersects);
    if (hits.length > 0) {
        handleMappingRemove(hits[0].object);
    }
}

/**
 * Cycle to the next/previous hit in the hit list.
 * @param {number} direction  1 = next, -1 = previous
 */
export function cycleHit(direction = 1) {
    if (hitList.length < 2) return;
    hitIndex = (hitIndex + direction + hitList.length) % hitList.length;
    selectHit(hitList[hitIndex]);
    updateHitListUI();
}

/**
 * Programmatic select (e.g. from AnatomySearch).
 */
export function select(mesh, info) {
    hitList = [];
    hitIndex = 0;
    hideHitListUI();

    deselectCurrentMesh();
    selectMesh(mesh);
    openContextPanel(mesh, info);
    notifyListeners('select', { mesh, regionId: null, info });
}

/**
 * Programmatic deselect.
 */
export function deselect() {
    performDeselect();
    hideHitListUI();
}

export function getActiveMesh() {
    return getSelectedMesh();
}

export function getHitList() {
    return hitList;
}

export function onSelect(callback) {
    listeners.select.push(callback);
}

export function onDeselect(callback) {
    listeners.deselect.push(callback);
}

export function onHover(callback) {
    listeners.hover.push(callback);
}

// ═══ Keyboard bindings ═══

/**
 * Initialize keyboard event listeners for hit list cycling.
 * Called once from main.js after app boot.
 */
export function initSelectionKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Only handle Tab/Esc when hit list is visible
        const panel = document.getElementById('hit-list-panel');
        if (!panel) return;

        if (e.key === 'Tab' && panel.style.display !== 'none') {
            e.preventDefault();
            cycleHit(e.shiftKey ? -1 : 1);
            return;
        }

        // Esc dismisses hit list (selection stays)
        if (e.key === 'Escape' && panel.style.display !== 'none') {
            hideHitListUI();
            // Don't stopPropagation – let main.js Esc handler chain continue
        }
    });
}

// ═══ Internal helpers ═══

/**
 * Filter raw Three.js intersects by visibility + render mode layer.
 */
function filterHits(intersects) {
    return intersects.filter(hit => {
        if (!hit.object.isMesh || !hit.object.visible) return false;
        return passesLayerFilter(hit.object);
    });
}

/**
 * Layer filter: in skeleton mode, only bones are selectable.
 * In muscle/xray mode, everything visible is selectable.
 */
function passesLayerFilter(mesh) {
    const mode = currentRenderMode;
    if (mode === 'skeleton') {
        const tissue = mesh.userData.tissueType || '';
        return BONE_PREFIXES.some(p => tissue.startsWith(p));
    }
    // muscle, xray: all visible meshes are selectable
    return true;
}

/**
 * Enrich filtered hits with region/tissue metadata.
 */
function enrichHits(filteredIntersects) {
    return filteredIntersects.map(hit => {
        const mesh = hit.object;
        const region = getRegion(mesh);
        const tissue = getTissueName(mesh.userData.tissueType);
        const regionKey = getMeshRegionKey(mesh.name);
        return {
            mesh,
            region,
            tissue,
            regionKey,
            meshId: mesh.name || mesh.uuid,
            info: {
                tissue,
                region: region.regionLabel,
                side: region.side,
                source: region.source,
                meshId: mesh.name || mesh.uuid,
            },
        };
    });
}

/**
 * Select a single enriched hit: update 3D highlight + open context panel.
 */
function selectHit(hit) {
    deselectCurrentMesh();
    selectMesh(hit.mesh);
    openContextPanel(hit.mesh, hit.info);
    notifyListeners('select', {
        mesh: hit.mesh,
        regionId: hit.region?.regionId || null,
        info: hit.info,
    });
}

function performDeselect() {
    hitList = [];
    hitIndex = 0;
    deselectCurrentMesh();
    closeContextPanel();
    notifyListeners('deselect', {});
}

function notifyListeners(event, data) {
    for (const cb of listeners[event]) {
        try { cb(data); } catch (e) { console.error('SelectionService listener error:', e); }
    }
}

// ═══ Hit List UI ═══

function showHitListUI() {
    const panel = document.getElementById('hit-list-panel');
    if (!panel) return;
    panel.style.display = '';
    updateHitListUI();
}

function hideHitListUI() {
    const panel = document.getElementById('hit-list-panel');
    if (!panel) return;
    panel.style.display = 'none';
}

function updateHitListUI() {
    const container = document.getElementById('hit-list-items');
    if (!container) return;

    container.innerHTML = hitList.map((hit, idx) => {
        const active = idx === hitIndex ? ' active' : '';
        const side = hit.region?.side === 'l' ? '좌' : hit.region?.side === 'r' ? '우' : '';
        const sideLabel = side ? ` (${side})` : '';
        return `
            <div class="hit-list-item${active}" data-hit-idx="${idx}">
                <span class="hit-list-item-idx">${idx + 1}</span>
                <span>${hit.tissue}${sideLabel}</span>
                <span class="hit-list-item-region">${hit.region?.regionLabel || ''}</span>
            </div>
        `;
    }).join('');

    // Click handler for each item
    container.querySelectorAll('.hit-list-item').forEach(el => {
        el.addEventListener('click', (e) => {
            const idx = parseInt(el.dataset.hitIdx, 10);
            if (!isNaN(idx) && idx >= 0 && idx < hitList.length) {
                hitIndex = idx;
                selectHit(hitList[idx]);
                updateHitListUI();
            }
        });
    });
}
