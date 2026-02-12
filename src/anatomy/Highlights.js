// highlights.js - Mesh highlighting, vertex-level region coloring, tissue visibility

import * as THREE from 'three';

const highlightedMeshes = new Map(); // meshUUID -> { mesh, originalMaterial, severity }
// Simplified 3-level severity palette
const severityColors = {
    normal:   new THREE.Color(0x4a4e58),       // dark gray
    mild:     new THREE.Color(0x29B6F6),       // sky blue
    severe:   new THREE.Color(0xFF1744),       // hot red
    moderate: new THREE.Color(0x29B6F6),       // alias → mild (fallback)
};

const severityEmissive = {
    normal:   new THREE.Color(0x0a0a0e),       // very subtle dark glow
    mild:     new THREE.Color(0x0a3050),       // blue glow
    severe:   new THREE.Color(0x500818),       // red glow
    moderate: new THREE.Color(0x0a3050),       // alias → mild
};

const defaultHighlightColor = new THREE.Color(0xE8734A);

// ═══ Vertex Color System (anatomy-viewer-v2 style) ═══

// Original vertex colors & materials stored per mesh (uuid → data)
const origVertexColors = new Map(); // uuid → Float32Array
const origMaterials = new Map();    // uuid → Material

/**
 * Initialize vertex colors on a mesh (call during model load).
 * Fills color attribute from material color, stores originals.
 * Matches anatomy-viewer-v2's ensureVertexColors().
 */
export function initVertexColors(mesh) {
    if (!mesh || !mesh.isMesh) return;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;

    const count = pos.count;
    const matColor = mesh.material.color ? mesh.material.color.clone() : new THREE.Color(0xcccccc);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        colors[i * 3]     = matColor.r;
        colors[i * 3 + 1] = matColor.g;
        colors[i * 3 + 2] = matColor.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Store originals
    origVertexColors.set(mesh.uuid, new Float32Array(colors));
    origMaterials.set(mesh.uuid, mesh.material.clone());

    // Enable vertex colors
    mesh.material.vertexColors = true;
    mesh.material.color = new THREE.Color(0xffffff);
    mesh.material.needsUpdate = true;
}

/**
 * Apply vertex-level region coloring (anatomy-viewer-v2 style).
 * Colors individual vertices based on side and bounds filters.
 *
 * @param {Array} activeRegions - Array of:
 *   { side: 'l'|'r'|null, xMin, xMax, yMin, yMax, meshes: string[], severity: string }
 *
 * Behavior (matching v2):
 *   1. Reset all vertex colors & materials to originals
 *   2. For each active region's meshes, test each vertex:
 *      - side='l': skip if vertex x < 0 (only color left side = positive x)
 *      - side='r': skip if vertex x >= 0 (only color right side = negative x)
 *      - xMin/xMax/yMin/yMax: additional bounds filter
 *   3. Color matching vertices with severity color
 *   4. Add subtle emissive to touched meshes
 */
export function applyRegionColors(activeRegions) {
    if (!sceneRoot) return;

    // Step 1: Reset all meshes to original state
    sceneRoot.traverse((c) => {
        if (!c.isMesh) return;
        const origMat = origMaterials.get(c.uuid);
        if (origMat) {
            c.material = origMat.clone();
            c.material.vertexColors = true;
            c.material.color = new THREE.Color(0xffffff);
            c.material.needsUpdate = true;
        }
        const origCol = origVertexColors.get(c.uuid);
        const colAttr = c.geometry.attributes.color;
        if (origCol && colAttr) {
            colAttr.array.set(origCol);
            colAttr.needsUpdate = true;
        }
    });

    // Also clear the per-mesh highlight tracking so it doesn't conflict
    highlightedMeshes.clear();

    if (!activeRegions || activeRegions.length === 0) return;

    const vec3 = new THREE.Vector3();

    // Step 2: Color vertices for each active region
    sceneRoot.traverse((c) => {
        if (!c.isMesh) return;
        const pos = c.geometry.attributes.position;
        const colAttr = c.geometry.attributes.color;
        if (!pos || !colAttr) return;

        // Find regions relevant to this mesh
        const rel = activeRegions.filter(ar =>
            ar.meshes.length > 0 ? ar.meshes.includes(c.name) : true
        );
        if (rel.length === 0) return;

        c.updateWorldMatrix(true, false);
        const matW = c.matrixWorld;
        let touched = false;
        let touchedSeverity = null;

        for (let i = 0; i < pos.count; i++) {
            vec3.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(matW);
            let hit = false;
            let hitSeverity = null;

            for (const ar of rel) {
                // Side filter (v2 convention: l=positive x, r=negative x)
                if (ar.side === 'l' && vec3.x < 0) continue;
                if (ar.side === 'r' && vec3.x >= 0) continue;

                // Bounds filter
                if (ar.xMin !== null && vec3.x < ar.xMin) continue;
                if (ar.xMax !== null && vec3.x > ar.xMax) continue;
                if (ar.yMin !== null && vec3.y < ar.yMin) continue;
                if (ar.yMax !== null && vec3.y > ar.yMax) continue;

                hit = true;
                hitSeverity = ar.severity;
                break;
            }

            if (hit) {
                const color = severityColors[hitSeverity] || defaultHighlightColor;
                colAttr.setXYZ(i, color.r, color.g, color.b);
                touched = true;
                if (!touchedSeverity) touchedSeverity = hitSeverity;
            }
        }

        // Step 3: Add emissive glow to touched meshes
        if (touched) {
            colAttr.needsUpdate = true;
            c.material = c.material.clone();
            c.material.vertexColors = true;
            c.material.color = new THREE.Color(0xffffff);
            const emissive = severityEmissive[touchedSeverity] || severityEmissive.severe;
            c.material.emissive = emissive;
            c.material.emissiveIntensity = touchedSeverity === 'normal' ? 0.15 : 0.6;
            c.material.needsUpdate = true;
        }
    });
}

/**
 * Reset all vertex colors to original (clear region coloring)
 */
export function resetRegionColors() {
    if (!sceneRoot) return;
    sceneRoot.traverse((c) => {
        if (!c.isMesh) return;
        const origMat = origMaterials.get(c.uuid);
        if (origMat) {
            c.material = origMat.clone();
            c.material.vertexColors = true;
            c.material.color = new THREE.Color(0xffffff);
            c.material.needsUpdate = true;
        }
        const origCol = origVertexColors.get(c.uuid);
        const colAttr = c.geometry.attributes.color;
        if (origCol && colAttr) {
            colAttr.array.set(origCol);
            colAttr.needsUpdate = true;
        }
    });
    highlightedMeshes.clear();
}

// ═══ Per-mesh highlighting (for individual mesh clicks) ═══

/**
 * Highlight a single mesh with emissive glow
 */
export function highlightMesh(mesh, severity) {
    if (!mesh || !mesh.isMesh) return;

    if (!highlightedMeshes.has(mesh.uuid)) {
        highlightedMeshes.set(mesh.uuid, {
            mesh,
            originalMaterial: mesh.material,
            severity: severity || null
        });
    } else {
        highlightedMeshes.get(mesh.uuid).severity = severity || null;
    }

    const highlighted = mesh.material.clone();
    const color = severity ? (severityColors[severity] || defaultHighlightColor) : defaultHighlightColor;
    highlighted.emissive = color;
    highlighted.emissiveIntensity = severity === 'normal' ? 0.2 : 0.7;
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

// --- Selection highlight (temporary click feedback) ---

let selectedMeshData = null;
const selectionColor = new THREE.Color(0x88BBEE);

export function selectMesh(mesh) {
    if (!mesh || !mesh.isMesh) return;
    deselectCurrentMesh();
    clearHoverHighlight();

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

export function deselectCurrentMesh() {
    if (!selectedMeshData) return;
    const { mesh, isPersistent, savedEmissive, savedIntensity } = selectedMeshData;

    if (!isPersistent && mesh && mesh.material && !highlightedMeshes.has(mesh.uuid)) {
        mesh.material.emissive.copy(savedEmissive);
        mesh.material.emissiveIntensity = savedIntensity;
    }
    selectedMeshData = null;
}

export function getSelectedMesh() {
    return selectedMeshData ? selectedMeshData.mesh : null;
}

// --- Hover highlight ---

let hoveredMesh = null;
let hoveredOriginalEmissive = null;
let hoveredOriginalIntensity = null;

export function setHoverHighlight(mesh) {
    clearHoverHighlight();

    if (!mesh || !mesh.isMesh) return;
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

// --- Tissue visibility (근육 / 뼈 two-group system) ---

// Material prefixes for each group
const MUSCLE_GROUP_PREFIXES = ['Muscles', 'Tendon', 'Ligament', 'Cartilage', 'Articular_capsule', 'Fat', 'Cornea', 'Eye'];
const BONE_GROUP_PREFIXES = ['Bone', 'Suture', 'Teeth'];

function matchesTissueGroup(matName, groupName) {
    if (groupName === 'Muscle') {
        return MUSCLE_GROUP_PREFIXES.some(p => matName.startsWith(p));
    }
    if (groupName === 'Bone') {
        return BONE_GROUP_PREFIXES.some(p => matName.startsWith(p));
    }
    // Fallback: direct match (legacy)
    return matName === groupName || matName.startsWith(groupName.replace('.001', '').replace('.002', ''));
}

const hiddenTissues = new Set();
let sceneRoot = null;

export function setSceneRoot(root) {
    sceneRoot = root;
}

export function setTissueVisible(groupName, visible) {
    if (!sceneRoot) return;

    if (visible) {
        hiddenTissues.delete(groupName);
    } else {
        hiddenTissues.add(groupName);
    }

    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const matName = child.userData.tissueType || child.material.name;
        if (matchesTissueGroup(matName, groupName)) {
            child.visible = visible;
        }
    });
}

export function setTissueOpacity(groupName, opacity) {
    if (!sceneRoot) return;

    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const matName = child.userData.tissueType || child.material.name;
        if (matchesTissueGroup(matName, groupName)) {
            child.material.transparent = true;
            child.material.opacity = opacity;
            child.material.depthWrite = opacity > 0.9;
            child.material.needsUpdate = true;
        }
    });
}

export function isTissueVisible(groupName) {
    return !hiddenTissues.has(groupName);
}

// ═══ Render Mode System (근육 / 골격 / X-Ray) ═══

export let currentRenderMode = 'muscle'; // 'muscle' | 'skeleton' | 'xray'

// Store normal-mode materials before switching (uuid → material)
const normalModeMaterials = new Map();

// X-Ray Fresnel vertex shader
const XRAY_VERT = `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
}`;

// X-Ray Fresnel fragment shader (edges glow, surfaces transparent)
const XRAY_FRAG = `
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
    float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.0);
    float alpha = mix(0.02, uIntensity, fresnel);
    vec3 col = uColor * (0.4 + fresnel * 0.8);
    gl_FragColor = vec4(col, alpha);
}`;

// Cached X-ray ShaderMaterials (uuid → ShaderMaterial)
const xrayMaterialCache = new Map();

function getXrayMaterial(uuid) {
    if (!xrayMaterialCache.has(uuid)) {
        xrayMaterialCache.set(uuid, new THREE.ShaderMaterial({
            vertexShader: XRAY_VERT,
            fragmentShader: XRAY_FRAG,
            uniforms: {
                uColor: { value: new THREE.Color(0x40A8FF) },
                uIntensity: { value: 0.35 },
            },
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
        }));
    }
    return xrayMaterialCache.get(uuid);
}

/**
 * Switch render mode: 'muscle' (default), 'skeleton' (bones only), 'xray' (Fresnel edges)
 */
// ═══ Pulse Animation System (질환 검색 → 3D 깜빡임, 버텍스 레벨) ═══

const pulsingMeshes = new Map(); // uuid → { mesh, origColors, hitIndices, colAttr }
let pulseAnimId = null;
const PULSE_COLOR = { r: 1.0, g: 0.09, b: 0.27 }; // #FF1744

/**
 * 버텍스 레벨 펄스: 해당 측 버텍스만 빨간색으로 깜빡임
 * @param {THREE.Mesh[]} meshes - 대상 메쉬 배열
 * @param {string} regionKey - 부위 키 (e.g. 'shoulder_l') → 좌/우 필터링용
 */
export function startPulseHighlight(meshes, regionKey) {
    stopPulseHighlight();

    const side = regionKey?.endsWith('_l') ? 'l' : regionKey?.endsWith('_r') ? 'r' : null;
    const vec3 = new THREE.Vector3();

    for (const mesh of meshes) {
        if (!mesh || !mesh.isMesh) continue;
        const pos = mesh.geometry.attributes.position;
        const colAttr = mesh.geometry.attributes.color;
        if (!pos || !colAttr) continue;

        const origColors = new Float32Array(colAttr.array);

        mesh.updateWorldMatrix(true, false);
        const matW = mesh.matrixWorld;
        const hitIndices = [];

        for (let i = 0; i < pos.count; i++) {
            vec3.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(matW);
            if (side === 'l' && vec3.x < 0) continue;
            if (side === 'r' && vec3.x >= 0) continue;
            hitIndices.push(i);
        }

        if (hitIndices.length === 0) continue;

        pulsingMeshes.set(mesh.uuid, { mesh, origColors, hitIndices, colAttr });
    }

    if (pulsingMeshes.size > 0) animatePulse();
}

function animatePulse() {
    const t = Date.now() * 0.005;
    const factor = 0.3 + (Math.sin(t) * 0.5 + 0.5) * 0.7; // 0.3 ~ 1.0

    for (const { colAttr, hitIndices, origColors } of pulsingMeshes.values()) {
        for (const i of hitIndices) {
            const oi = i * 3;
            // 원래 색상에서 빨간색으로 보간
            colAttr.array[oi]     = origColors[oi]     + (PULSE_COLOR.r - origColors[oi])     * factor;
            colAttr.array[oi + 1] = origColors[oi + 1] + (PULSE_COLOR.g - origColors[oi + 1]) * factor;
            colAttr.array[oi + 2] = origColors[oi + 2] + (PULSE_COLOR.b - origColors[oi + 2]) * factor;
        }
        colAttr.needsUpdate = true;
    }

    pulseAnimId = requestAnimationFrame(animatePulse);
}

/**
 * 펄스 효과 중지 + 원래 버텍스 색상 복원
 */
export function stopPulseHighlight() {
    if (pulseAnimId) {
        cancelAnimationFrame(pulseAnimId);
        pulseAnimId = null;
    }
    for (const { colAttr, origColors } of pulsingMeshes.values()) {
        colAttr.array.set(origColors);
        colAttr.needsUpdate = true;
    }
    pulsingMeshes.clear();
}

export function setRenderMode(mode) {
    if (!sceneRoot) return;
    if (mode === currentRenderMode) return;

    // Save current materials when leaving muscle mode
    if (currentRenderMode === 'muscle') {
        sceneRoot.traverse((child) => {
            if (child.isMesh) {
                normalModeMaterials.set(child.uuid, child.material);
            }
        });
    }

    currentRenderMode = mode;

    sceneRoot.traverse((child) => {
        if (!child.isMesh) return;
        const matName = child.userData.tissueType || '';
        const isBone = BONE_GROUP_PREFIXES.some(p => matName.startsWith(p));

        switch (mode) {
            case 'muscle': {
                // Restore normal materials
                const saved = normalModeMaterials.get(child.uuid);
                if (saved) child.material = saved;
                // Respect tissue visibility toggles
                child.visible = !hiddenTissues.has(isBone ? 'Bone' : 'Muscle');
                break;
            }

            case 'skeleton': {
                if (isBone) {
                    const saved = normalModeMaterials.get(child.uuid);
                    if (saved) child.material = saved;
                    child.visible = true;
                } else {
                    child.visible = false;
                }
                break;
            }

            case 'xray': {
                child.visible = true;
                if (isBone) {
                    // Bones: bright emissive glow
                    const baseMat = normalModeMaterials.get(child.uuid) || child.material;
                    const boneMat = baseMat.clone();
                    boneMat.emissive = new THREE.Color(0x60D0FF);
                    boneMat.emissiveIntensity = 0.6;
                    boneMat.transparent = false;
                    boneMat.opacity = 1.0;
                    boneMat.depthWrite = true;
                    boneMat.needsUpdate = true;
                    child.material = boneMat;
                } else {
                    // Muscles/soft tissue: Fresnel X-ray shader
                    child.material = getXrayMaterial(child.uuid);
                }
                break;
            }
        }
    });
}
