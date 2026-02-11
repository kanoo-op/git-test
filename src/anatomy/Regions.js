// regions.js - Body region mapping based on bounding box positions + JSON mapping

import * as THREE from 'three';

// ═══ REGIONS (좌/우 분리) - anatomy-viewer-v2.html과 동일 ═══
export const PREDEFINED_REGIONS = [
    { id: 'head_l',       name: '머리 (좌)',     side: 'l' },
    { id: 'head_r',       name: '머리 (우)',     side: 'r' },
    { id: 'neck_l',       name: '목 (좌)',       side: 'l' },
    { id: 'neck_r',       name: '목 (우)',       side: 'r' },
    { id: 'shoulder_l',   name: '왼쪽 어깨',     side: 'l' },
    { id: 'shoulder_r',   name: '오른쪽 어깨',   side: 'r' },
    { id: 'chest_l',      name: '가슴 (좌)',     side: 'l' },
    { id: 'chest_r',      name: '가슴 (우)',     side: 'r' },
    { id: 'upper_back_l', name: '상부 등 (좌)',  side: 'l' },
    { id: 'upper_back_r', name: '상부 등 (우)',  side: 'r' },
    { id: 'lower_back_l', name: '허리 (좌)',     side: 'l' },
    { id: 'lower_back_r', name: '허리 (우)',     side: 'r' },
    { id: 'abdomen_l',    name: '복부 (좌)',     side: 'l' },
    { id: 'abdomen_r',    name: '복부 (우)',     side: 'r' },
    { id: 'arm_l',        name: '왼팔',          side: 'l' },
    { id: 'arm_r',        name: '오른팔',        side: 'r' },
    { id: 'hip_l',        name: '골반 (좌)',     side: 'l' },
    { id: 'hip_r',        name: '골반 (우)',     side: 'r' },
    { id: 'thigh_l',      name: '왼대퇴',        side: 'l' },
    { id: 'thigh_r',      name: '오른대퇴',      side: 'r' },
    { id: 'shin_l',       name: '왼종아리',      side: 'l' },
    { id: 'shin_r',       name: '오른종아리',    side: 'r' },
    { id: 'foot_l',       name: '왼발',          side: 'l' },
    { id: 'foot_r',       name: '오른발',        side: 'r' },
];

export const REGION_GROUPS = [
    { name: '머리',    ids: ['head_l',       'head_r'] },
    { name: '목',      ids: ['neck_l',       'neck_r'] },
    { name: '어깨',    ids: ['shoulder_l',   'shoulder_r'] },
    { name: '가슴',    ids: ['chest_l',      'chest_r'] },
    { name: '상부 등', ids: ['upper_back_l', 'upper_back_r'] },
    { name: '허리',    ids: ['lower_back_l', 'lower_back_r'] },
    { name: '복부',    ids: ['abdomen_l',    'abdomen_r'] },
    { name: '팔',      ids: ['arm_l',        'arm_r'] },
    { name: '골반',    ids: ['hip_l',        'hip_r'] },
    { name: '대퇴',    ids: ['thigh_l',      'thigh_r'] },
    { name: '종아리',  ids: ['shin_l',       'shin_r'] },
    { name: '발',      ids: ['foot_l',       'foot_r'] },
];

// Build label map from predefined regions
const REGION_LABEL_MAP = {};
for (const r of PREDEFINED_REGIONS) {
    REGION_LABEL_MAP[r.id] = r.name;
}

// Body region definitions by Y-axis range (fallback when no mapping loaded)
const REGION_DEFS = [
    { id: 'head',       label: '머리',              yMin: 0.88, yMax: 1.0  },
    { id: 'neck',       label: '목',                yMin: 0.82, yMax: 0.88 },
    { id: 'shoulder',   label: '어깨',              yMin: 0.75, yMax: 0.85 },
    { id: 'upperBack',  label: '상부 등',           yMin: 0.65, yMax: 0.82 },
    { id: 'chest',      label: '가슴',              yMin: 0.65, yMax: 0.80 },
    { id: 'arm',        label: '팔',                yMin: 0.35, yMax: 0.75 },
    { id: 'lowerBack',  label: '허리',              yMin: 0.50, yMax: 0.65 },
    { id: 'abdomen',    label: '복부',              yMin: 0.48, yMax: 0.60 },
    { id: 'hip',        label: '골반',              yMin: 0.42, yMax: 0.52 },
    { id: 'thigh',      label: '대퇴',              yMin: 0.25, yMax: 0.45 },
    { id: 'shin',       label: '종아리',            yMin: 0.07, yMax: 0.25 },
    { id: 'foot',       label: '발',                yMin: 0.00, yMax: 0.08 },
];

// Tissue type display names (simplified: 근육 / 뼈 two categories)
// Muscle group includes: muscles, tendons, ligaments, cartilage, joint capsule, fat
export const TISSUE_NAMES = {
    'Muscles.001':              '근육',
    'Bone':                     '뼈',
    'Tendon.001':               '근육',
    'Ligament.002':             '근육',
    'Cartilage':                '근육',
    'Cartilage.001':            '근육',
    'Cartilage.002':            '근육',
    'Articular_capsule.002':    '근육',
    'Fat.001':                  '근육',
    'Fat.002':                  '근육',
    'Cornea.001':               '근육',
    'Eye.001':                  '근육',
    'Suture':                   '뼈',
    'Teeth':                    '뼈',
    'None':                     '기타',
};

let modelBounds = null;
let cachedModelRoot = null;

// Store per-mesh region data (uuid -> region info)
const meshRegions = new Map();

// JSON mapping: mesh name -> { regionId, regionLabel, side, state }
const mappingByMeshName = new Map();

// Current loaded mapping metadata
let currentMapping = null;

// Tracks which meshNames actually passed bounds filtering per region
// regionKey -> Set of meshNames
const effectiveMeshes = new Map();

/**
 * Compute bounding box for entire model and classify each mesh
 */
export function computeRegions(modelRoot) {
    cachedModelRoot = modelRoot;

    // Get global bounding box
    const globalBox = new THREE.Box3().setFromObject(modelRoot);
    modelBounds = {
        min: globalBox.min.clone(),
        max: globalBox.max.clone(),
        height: globalBox.max.y - globalBox.min.y
    };

    // Classify each mesh using bounding-box fallback
    modelRoot.traverse((child) => {
        if (!child.isMesh) return;

        const box = new THREE.Box3().setFromObject(child);
        const center = box.getCenter(new THREE.Vector3());

        // Normalize Y position to 0..1 range
        const normalY = (center.y - modelBounds.min.y) / modelBounds.height;
        // Determine left/right from X position (center of model = 0)
        const modelCenterX = (modelBounds.min.x + modelBounds.max.x) / 2;
        const side = center.x < modelCenterX - 0.02 ? 'Right' :
                     center.x > modelCenterX + 0.02 ? 'Left' : 'Center';

        // Find best matching region
        let bestRegion = REGION_DEFS[0];
        let bestOverlap = -1;

        for (const region of REGION_DEFS) {
            const overlapMin = Math.max(region.yMin, normalY - 0.05);
            const overlapMax = Math.min(region.yMax, normalY + 0.05);
            const overlap = overlapMax - overlapMin;
            if (overlap > bestOverlap) {
                bestOverlap = overlap;
                bestRegion = region;
            }
        }

        meshRegions.set(child.uuid, {
            regionId: bestRegion.id,
            regionLabel: bestRegion.label,
            side: side,
            normalY: normalY,
            center: center.clone(),
            source: 'auto'
        });
    });

    // If a mapping was previously loaded, re-apply it on top
    if (currentMapping) {
        applyMappingToModel();
    }
}

/**
 * Get region info for a mesh (mapping takes priority over bounding-box)
 */
export function getRegion(mesh) {
    // 1. Check JSON mapping by mesh name
    const meshName = mesh.name;
    if (meshName && mappingByMeshName.has(meshName)) {
        const mapped = mappingByMeshName.get(meshName);
        // Merge with bounding-box data for center/normalY
        const bbData = meshRegions.get(mesh.uuid);
        return {
            regionId: mapped.regionId,
            regionLabel: mapped.regionLabel,
            side: mapped.side,
            state: mapped.state,
            normalY: bbData ? bbData.normalY : 0.5,
            center: bbData ? bbData.center : new THREE.Vector3(),
            source: 'mapping'
        };
    }

    // 2. Fallback to bounding-box classification
    return meshRegions.get(mesh.uuid) || {
        regionId: 'unknown',
        regionLabel: 'Unknown Region',
        side: 'Center',
        normalY: 0.5,
        center: new THREE.Vector3(),
        source: 'auto'
    };
}

/**
 * Get tissue display name from material name
 */
export function getTissueName(materialName) {
    return TISSUE_NAMES[materialName] || materialName || 'Unknown';
}

/**
 * Get all available regions
 */
export function getRegionList() {
    return REGION_DEFS.map(r => ({ id: r.id, label: r.label }));
}

// ======== JSON Mapping System ========

/**
 * Convert a region key like "neck_l" to a readable label
 */
export function regionKeyToLabel(key) {
    if (REGION_LABEL_MAP[key]) return REGION_LABEL_MAP[key];
    // Auto-generate: replace _ with space, capitalize, detect _l/_r suffix
    let side = '';
    let base = key;
    if (key.endsWith('_l')) {
        side = ' (Left)';
        base = key.slice(0, -2);
    } else if (key.endsWith('_r')) {
        side = ' (Right)';
        base = key.slice(0, -2);
    }
    const label = base.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return label + side;
}

/**
 * Detect side from region key suffix
 */
function regionKeyToSide(key) {
    if (key.endsWith('_l')) return 'Left';
    if (key.endsWith('_r')) return 'Right';
    return 'Center';
}

/**
 * Load mapping JSON data and apply it
 * @param {object} mappingJson - Parsed mapping JSON (with .regions)
 * @returns {{ regionCount, meshCount }} stats
 */
export function loadMapping(mappingJson) {
    currentMapping = mappingJson;

    // Ensure all predefined regions exist in the mapping
    if (currentMapping && currentMapping.regions) {
        for (const r of PREDEFINED_REGIONS) {
            if (!currentMapping.regions[r.id]) {
                currentMapping.regions[r.id] = {
                    meshes: [], state: 'normal',
                    xMin: null, xMax: null, yMin: null, yMax: null
                };
            }
        }
    }

    // Re-apply mapping to already-loaded model if available
    if (cachedModelRoot) {
        applyMappingToModel();
    }

    const regionCount = currentMapping?.regions ? Object.keys(currentMapping.regions).length : 0;
    let meshCount = 0;
    for (const s of effectiveMeshes.values()) meshCount += s.size;
    return { regionCount, meshCount };
}

/**
 * Apply loaded mapping over existing bounding-box regions.
 * Matching anatomy-viewer-v2.html behavior:
 *   - Meshes are assigned to regions by NAME (meshes array).
 *   - ALL listed meshes count as "effective" for the region (mesh count display).
 *   - xMin/xMax/yMin/yMax bounds are stored for vertex-level coloring only,
 *     NOT used for mesh registration filtering.
 *   - Side filtering (_l → x>=0, _r → x<0) is used only when choosing
 *     which single region "owns" a shared mesh for click identification.
 */
function applyMappingToModel() {
    if (!cachedModelRoot) return;

    // Clear previous mapping state
    mappingByMeshName.clear();
    effectiveMeshes.clear();

    if (!currentMapping || !currentMapping.regions) return;

    // Build mesh name → mesh object + world-space center lookup
    const meshLookup = new Map(); // meshName → { child, center, uuid }
    cachedModelRoot.traverse((child) => {
        if (!child.isMesh || !child.name) return;
        const existing = meshRegions.get(child.uuid);
        let center = existing?.center || null;
        if (!center) {
            const box = new THREE.Box3().setFromObject(child);
            center = box.getCenter(new THREE.Vector3());
        }
        meshLookup.set(child.name, {
            child,
            center,
            uuid: child.uuid
        });
    });

    // Iterate all regions, assign meshes by name
    // (anatomy-viewer-v2.html style: all listed meshes belong to the region)
    for (const [regionKey, regionData] of Object.entries(currentMapping.regions)) {
        const meshes = regionData.meshes || [];
        const label = regionKeyToLabel(regionKey);
        const side = regionKeyToSide(regionKey);

        // Side key for click-ownership disambiguation
        const sideKey = regionKey.endsWith('_l') ? 'l' : regionKey.endsWith('_r') ? 'r' : null;

        for (const meshName of meshes) {
            const info = meshLookup.get(meshName);
            if (!info) continue;

            // Track ALL listed meshes as effective (for mesh count display)
            if (!effectiveMeshes.has(regionKey)) {
                effectiveMeshes.set(regionKey, new Set());
            }
            effectiveMeshes.get(regionKey).add(meshName);

            // For mappingByMeshName (single-owner click identification):
            // Use side filtering to pick the correct L/R region for shared meshes
            const cx = info.center ? info.center.x : 0;
            if (sideKey === 'l' && cx < 0) continue;
            if (sideKey === 'r' && cx >= 0) continue;

            const mappedData = {
                regionId: regionKey,
                regionLabel: label,
                side: side,
                state: regionData.state || 'normal'
            };

            mappingByMeshName.set(meshName, mappedData);

            // Update meshRegions
            const existing = meshRegions.get(info.uuid);
            if (existing) {
                meshRegions.set(info.uuid, {
                    ...existing,
                    regionId: regionKey,
                    regionLabel: label,
                    side: side,
                    state: regionData.state || 'normal',
                    source: 'mapping'
                });
            }
        }
    }
}

/**
 * Clear loaded mapping, revert to bounding-box regions
 */
export function clearMapping() {
    mappingByMeshName.clear();
    effectiveMeshes.clear();
    currentMapping = null;

    // Recompute pure bounding-box regions
    if (cachedModelRoot) {
        computeRegions(cachedModelRoot);
    }
}

/**
 * Get current mapping metadata
 */
export function getMappingInfo() {
    if (!currentMapping) return null;

    let totalEffective = 0;
    const regions = currentMapping.regions ? Object.keys(currentMapping.regions).map(key => {
        const effective = effectiveMeshes.get(key);
        const effCount = effective ? effective.size : 0;
        totalEffective += effCount;
        return {
            id: key,
            label: regionKeyToLabel(key),
            meshCount: effCount,
            totalMeshCount: currentMapping.regions[key].meshes?.length || 0,
            state: currentMapping.regions[key].state || 'normal'
        };
    }) : [];

    return {
        version: currentMapping.version || '-',
        timestamp: currentMapping.timestamp || null,
        regionCount: regions.length,
        meshCount: totalEffective,
        regions
    };
}

/**
 * Check if a mapping is currently loaded
 */
export function hasMappingLoaded() {
    return currentMapping !== null;
}

// ======== Mapping Editor API ========

// Region colors for visual feedback (cycling palette)
const REGION_COLORS = [
    '#E8734A', '#4A90D9', '#6BA88C', '#D4A843', '#9575CD',
    '#4DB6AC', '#E57373', '#64B5F6', '#81C784', '#FFB74D',
    '#BA68C8', '#4DD0E1', '#FF8A65', '#AED581', '#7986CB',
    '#F06292', '#A1887F', '#90A4AE', '#DCE775', '#FFD54F',
];

/**
 * Get a color for a region by index
 */
export function getRegionColor(index) {
    return REGION_COLORS[index % REGION_COLORS.length];
}

/**
 * Initialize a blank mapping (or keep current)
 */
export function ensureMapping() {
    if (!currentMapping) {
        currentMapping = {
            version: 1,
            timestamp: new Date().toISOString(),
            regions: {}
        };
    }
    // Ensure all predefined regions exist
    for (const r of PREDEFINED_REGIONS) {
        if (!currentMapping.regions[r.id]) {
            currentMapping.regions[r.id] = {
                meshes: [],
                state: 'normal',
                xMin: null, xMax: null, yMin: null, yMax: null
            };
        }
    }
    return currentMapping;
}

/**
 * Add a new region to the mapping
 */
export function addRegion(regionKey) {
    ensureMapping();
    if (!currentMapping.regions[regionKey]) {
        currentMapping.regions[regionKey] = {
            meshes: [],
            state: 'normal',
            yMin: null,
            yMax: null
        };
    }
    return currentMapping.regions[regionKey];
}

/**
 * Delete a region from the mapping
 */
export function deleteRegion(regionKey) {
    if (!currentMapping || !currentMapping.regions[regionKey]) return;

    // Remove mesh-name entries for this region
    const regionData = currentMapping.regions[regionKey];
    if (regionData.meshes) {
        for (const meshName of regionData.meshes) {
            mappingByMeshName.delete(meshName);
        }
    }

    delete currentMapping.regions[regionKey];

    // Re-apply to revert affected meshes to bounding-box
    if (cachedModelRoot) {
        recomputeAndApply();
    }
}

/**
 * Add a mesh to a region
 */
export function addMeshToRegion(regionKey, meshName) {
    ensureMapping();
    if (!currentMapping.regions[regionKey]) {
        addRegion(regionKey);
    }

    const regionData = currentMapping.regions[regionKey];

    // Remove from any other region first
    for (const [key, data] of Object.entries(currentMapping.regions)) {
        const idx = data.meshes.indexOf(meshName);
        if (idx >= 0) {
            data.meshes.splice(idx, 1);
        }
    }

    // Add to target region
    if (!regionData.meshes.includes(meshName)) {
        regionData.meshes.push(meshName);
    }

    // Update lookup
    const label = regionKeyToLabel(regionKey);
    const side = regionKeyToSide(regionKey);
    mappingByMeshName.set(meshName, {
        regionId: regionKey,
        regionLabel: label,
        side: side,
        state: regionData.state || 'normal'
    });

    // Update mesh regions cache
    if (cachedModelRoot) {
        applyMappingToModel();
    }

    currentMapping.timestamp = new Date().toISOString();
}

/**
 * Remove a mesh from a region
 */
export function removeMeshFromRegion(regionKey, meshName) {
    if (!currentMapping || !currentMapping.regions[regionKey]) return;

    const regionData = currentMapping.regions[regionKey];
    const idx = regionData.meshes.indexOf(meshName);
    if (idx >= 0) {
        regionData.meshes.splice(idx, 1);
    }

    mappingByMeshName.delete(meshName);

    // Revert this mesh to bounding-box classification
    if (cachedModelRoot) {
        recomputeAndApply();
    }

    currentMapping.timestamp = new Date().toISOString();
}

/**
 * Get the raw mapping regions object (for editor UI)
 */
export function getMappingRegions() {
    if (!currentMapping || !currentMapping.regions) return {};
    return currentMapping.regions;
}

/**
 * Get the full raw mapping JSON (for export)
 */
export function exportMappingJson() {
    ensureMapping();
    currentMapping.timestamp = new Date().toISOString();
    // Auto-increment version
    currentMapping.version = (currentMapping.version || 0) + 1;
    return JSON.parse(JSON.stringify(currentMapping));
}

/**
 * Get the region key for a given mesh name (if mapped)
 */
export function getMeshRegionKey(meshName) {
    const mapped = mappingByMeshName.get(meshName);
    return mapped ? mapped.regionId : null;
}

/**
 * Get mesh names belonging to a region (filtered by bounds)
 */
export function getRegionMeshNames(regionKey) {
    // Return only meshes that passed bounds filtering during applyMappingToModel
    const effective = effectiveMeshes.get(regionKey);
    return effective ? [...effective] : [];
}

/**
 * Get all region keys with labels (predefined regions first, in order)
 */
export function getAllRegionKeysWithLabels() {
    if (!currentMapping || !currentMapping.regions) return [];

    const result = [];
    const seen = new Set();

    // Predefined regions first (in v2 order)
    for (const r of PREDEFINED_REGIONS) {
        if (currentMapping.regions[r.id]) {
            const effective = effectiveMeshes.get(r.id);
            result.push({
                key: r.id,
                label: r.name,
                side: r.side,
                meshCount: effective ? effective.size : 0
            });
            seen.add(r.id);
        }
    }

    // Any custom regions not in predefined list
    for (const key of Object.keys(currentMapping.regions)) {
        if (!seen.has(key)) {
            const effective = effectiveMeshes.get(key);
            result.push({
                key,
                label: regionKeyToLabel(key),
                side: regionKeyToSide(key),
                meshCount: effective ? effective.size : 0
            });
        }
    }

    return result;
}

/**
 * Recompute bounding-box regions and re-apply mapping
 */
function recomputeAndApply() {
    // Recompute base bounding-box for all meshes
    cachedModelRoot.traverse((child) => {
        if (!child.isMesh) return;
        const existing = meshRegions.get(child.uuid);
        if (existing) {
            existing.source = 'auto';
            // Restore bounding-box based regionId (recompute)
        }
    });
    // Re-apply JSON mapping on top
    applyMappingToModel();
}
