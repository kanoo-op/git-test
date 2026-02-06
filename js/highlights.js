// highlights.js - Mesh highlighting and tissue visibility system

import * as THREE from 'three';

const highlightedMeshes = new Map(); // meshUUID -> { mesh, originalMaterial, severity }
const severityColors = {
    normal:   new THREE.Color(0x6BA88C),
    mild:     new THREE.Color(0xD4A843),
    moderate: new THREE.Color(0xD47643),
    severe:   new THREE.Color(0xC45B4A),
};

const defaultHighlightColor = new THREE.Color(0xE8734A);

/**
 * Highlight a single mesh with emissive glow
 */
export function highlightMesh(mesh, severity) {
    if (!mesh || !mesh.isMesh) return;

    // Store original material if not already stored
    if (!highlightedMeshes.has(mesh.uuid)) {
        highlightedMeshes.set(mesh.uuid, {
            mesh,
            originalMaterial: mesh.material,
            severity: severity || null
        });
    } else {
        // Update severity if re-highlighting
        highlightedMeshes.get(mesh.uuid).severity = severity || null;
    }

    // Create highlighted material
    const highlighted = mesh.material.clone();
    const color = severity ? (severityColors[severity] || defaultHighlightColor) : defaultHighlightColor;
    highlighted.emissive = color;
    highlighted.emissiveIntensity = 0.6;
    mesh.material = highlighted;
}

/**
 * Remove highlight from a mesh
 */
export function unhighlightMesh(mesh) {
    if (!mesh || !mesh.isMesh) return;

    const stored = highlightedMeshes.get(mesh.uuid);
    if (stored) {
        mesh.material = stored.originalMaterial;
        highlightedMeshes.delete(mesh.uuid);
    }
}

/**
 * Clear all highlights
 */
export function clearAllHighlights() {
    for (const [uuid, stored] of highlightedMeshes) {
        stored.mesh.material = stored.originalMaterial;
    }
    highlightedMeshes.clear();
}

/**
 * Check if a mesh is highlighted
 */
export function isHighlighted(mesh) {
    return highlightedMeshes.has(mesh.uuid);
}

/**
 * Get all highlighted meshes
 */
export function getHighlightedMeshes() {
    return Array.from(highlightedMeshes.values()).map(v => v.mesh);
}

/**
 * Serialize current highlight state for storage
 * Returns array of { meshName, severity }
 */
export function getHighlightState() {
    const state = [];
    for (const [uuid, stored] of highlightedMeshes) {
        const meshName = stored.mesh.name;
        if (meshName) {
            state.push({
                meshName,
                severity: stored.severity || null
            });
        }
    }
    return state;
}

/**
 * Restore highlight state from a serialized array
 * @param {Array} stateArray - [{meshName, severity}]
 * @param {Function} getMeshByNameFn - function(name) => mesh
 */
export function restoreHighlightState(stateArray, getMeshByNameFn) {
    clearAllHighlights();
    if (!stateArray || !Array.isArray(stateArray)) return;

    for (const entry of stateArray) {
        const mesh = getMeshByNameFn(entry.meshName);
        if (mesh) {
            highlightMesh(mesh, entry.severity);
        }
    }
}

// --- Selection highlight (temporary click feedback, separate from assessment highlights) ---

let selectedMeshData = null;
const selectionColor = new THREE.Color(0x88BBEE);

/**
 * Apply temporary selection highlight to a mesh (click feedback)
 */
export function selectMesh(mesh) {
    if (!mesh || !mesh.isMesh) return;
    deselectCurrentMesh();

    // Clear hover first so we save the TRUE original emissive (not hover-modified)
    clearHoverHighlight();

    // If already has persistent assessment highlight, just track selection
    if (highlightedMeshes.has(mesh.uuid)) {
        selectedMeshData = { mesh, isPersistent: true };
        return;
    }

    selectedMeshData = {
        mesh,
        isPersistent: false,
        savedEmissive: mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0),
        savedIntensity: mesh.material.emissiveIntensity || 0
    };
    mesh.material.emissive = selectionColor.clone();
    mesh.material.emissiveIntensity = 0.18;
}

/**
 * Remove temporary selection highlight
 */
export function deselectCurrentMesh() {
    if (!selectedMeshData) return;
    const { mesh, isPersistent, savedEmissive, savedIntensity } = selectedMeshData;

    if (!isPersistent && mesh && mesh.material && !highlightedMeshes.has(mesh.uuid)) {
        mesh.material.emissive.copy(savedEmissive);
        mesh.material.emissiveIntensity = savedIntensity;
    }
    selectedMeshData = null;
}

/**
 * Get currently selected mesh
 */
export function getSelectedMesh() {
    return selectedMeshData ? selectedMeshData.mesh : null;
}

// --- Hover highlight (temporary, separate from persistent highlights) ---

let hoveredMesh = null;
let hoveredOriginalEmissive = null;
let hoveredOriginalIntensity = null;

export function setHoverHighlight(mesh) {
    // Clear previous hover
    clearHoverHighlight();

    if (!mesh || !mesh.isMesh) return;
    // Don't hover-highlight if already assessment-highlighted or selected
    if (highlightedMeshes.has(mesh.uuid)) return;
    if (selectedMeshData && selectedMeshData.mesh === mesh) return;

    hoveredMesh = mesh;
    hoveredOriginalEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : new THREE.Color(0);
    hoveredOriginalIntensity = mesh.material.emissiveIntensity || 0;

    mesh.material.emissive = new THREE.Color(0xFFFFFF);
    mesh.material.emissiveIntensity = 0.12;
}

export function clearHoverHighlight() {
    if (hoveredMesh && hoveredMesh.material) {
        // Only restore if not assessment-highlighted or selected
        if (!highlightedMeshes.has(hoveredMesh.uuid) &&
            !(selectedMeshData && selectedMeshData.mesh === hoveredMesh)) {
            hoveredMesh.material.emissive = hoveredOriginalEmissive || new THREE.Color(0);
            hoveredMesh.material.emissiveIntensity = hoveredOriginalIntensity || 0;
        }
    }
    hoveredMesh = null;
    hoveredOriginalEmissive = null;
    hoveredOriginalIntensity = null;
}

// --- Tissue visibility ---

const hiddenTissues = new Set();
let sceneRoot = null;

export function setSceneRoot(root) {
    sceneRoot = root;
}

export function setTissueVisible(materialName, visible) {
    if (!sceneRoot) return;

    if (visible) {
        hiddenTissues.delete(materialName);
    } else {
        hiddenTissues.add(materialName);
    }

    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const matName = child.userData.tissueType || child.material.name;
        if (matName === materialName || matName.startsWith(materialName.replace('.001', '').replace('.002', ''))) {
            child.visible = visible;
        }
    });
}

export function setTissueOpacity(materialName, opacity) {
    if (!sceneRoot) return;

    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const matName = child.userData.tissueType || child.material.name;
        if (matName === materialName || matName.startsWith(materialName.replace('.001', '').replace('.002', ''))) {
            child.material.transparent = true;
            child.material.opacity = opacity;
            child.material.depthWrite = opacity > 0.9;
            child.material.needsUpdate = true;
        }
    });
}

export function isTissueVisible(materialName) {
    return !hiddenTissues.has(materialName);
}
