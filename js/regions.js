// regions.js - Body region mapping based on bounding box positions + JSON mapping

import * as THREE from 'three';

// Body region definitions by Y-axis range (fallback when no mapping loaded)
const REGION_DEFS = [
    { id: 'head',       label: 'Head',                    yMin: 0.88, yMax: 1.0  },
    { id: 'neck',       label: 'Cervical (Neck)',         yMin: 0.82, yMax: 0.88 },
    { id: 'shoulder',   label: 'Shoulders / Deltoids',    yMin: 0.75, yMax: 0.85 },
    { id: 'upperBack',  label: 'Thoracic (Upper Back)',   yMin: 0.65, yMax: 0.82 },
    { id: 'chest',      label: 'Chest / Pectorals',      yMin: 0.65, yMax: 0.80 },
    { id: 'upperArm',   label: 'Upper Arms',             yMin: 0.55, yMax: 0.75 },
    { id: 'lowerBack',  label: 'Lumbar (Lower Back)',     yMin: 0.50, yMax: 0.65 },
    { id: 'abdomen',    label: 'Abdomen',                 yMin: 0.48, yMax: 0.60 },
    { id: 'forearm',    label: 'Forearms',                yMin: 0.35, yMax: 0.55 },
    { id: 'hip',        label: 'Hip / Pelvis',            yMin: 0.42, yMax: 0.52 },
    { id: 'hand',       label: 'Hands / Wrists',         yMin: 0.22, yMax: 0.38 },
    { id: 'upperLeg',   label: 'Upper Legs',             yMin: 0.25, yMax: 0.45 },
    { id: 'knee',       label: 'Knee',                    yMin: 0.20, yMax: 0.28 },
    { id: 'lowerLeg',   label: 'Lower Legs (Calves)',    yMin: 0.07, yMax: 0.22 },
    { id: 'foot',       label: 'Feet / Ankles',          yMin: 0.00, yMax: 0.08 },
];

// Readable labels for mapping region keys (e.g. "neck_l" -> "Neck (Left)")
const REGION_LABEL_MAP = {
    'neck_l':       'Neck (Left)',
    'neck_r':       'Neck (Right)',
    'shoulder_l':   'Shoulder (Left)',
    'shoulder_r':   'Shoulder (Right)',
    'chest_l':      'Chest (Left)',
    'chest_r':      'Chest (Right)',
    'upper_back_l': 'Upper Back (Left)',
    'upper_back_r': 'Upper Back (Right)',
    'lower_back_l': 'Lower Back (Left)',
    'lower_back_r': 'Lower Back (Right)',
    'abdomen_l':    'Abdomen (Left)',
    'abdomen_r':    'Abdomen (Right)',
    'hip_l':        'Hip (Left)',
    'hip_r':        'Hip (Right)',
    'thigh_l':      'Thigh (Left)',
    'thigh_r':      'Thigh (Right)',
    'knee_l':       'Knee (Left)',
    'knee_r':       'Knee (Right)',
    'calf_l':       'Calf (Left)',
    'calf_r':       'Calf (Right)',
    'foot_l':       'Foot (Left)',
    'foot_r':       'Foot (Right)',
    'upper_arm_l':  'Upper Arm (Left)',
    'upper_arm_r':  'Upper Arm (Right)',
    'forearm_l':    'Forearm (Left)',
    'forearm_r':    'Forearm (Right)',
    'hand_l':       'Hand (Left)',
    'hand_r':       'Hand (Right)',
    'head':         'Head',
};

// Tissue type display names
export const TISSUE_NAMES = {
    'Muscles.001':              'Muscle',
    'Bone':                     'Bone',
    'Tendon.001':               'Tendon',
    'Ligament.002':             'Ligament',
    'Cartilage':                'Cartilage',
    'Cartilage.001':            'Cartilage',
    'Cartilage.002':            'Cartilage',
    'Articular_capsule.002':    'Joint Capsule',
    'Fat.001':                  'Fat Tissue',
    'Fat.002':                  'Fat Tissue',
    'Cornea.001':               'Cornea',
    'Eye.001':                  'Eye',
    'Suture':                   'Suture',
    'Teeth':                    'Teeth',
    'None':                     'Other',
};

let modelBounds = null;
let cachedModelRoot = null;

// Store per-mesh region data (uuid -> region info)
const meshRegions = new Map();

// JSON mapping: mesh name -> { regionId, regionLabel, side, state }
const mappingByMeshName = new Map();

// Current loaded mapping metadata
let currentMapping = null;

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
    mappingByMeshName.clear();

    currentMapping = mappingJson;
    let regionCount = 0;
    let meshCount = 0;

    if (mappingJson && mappingJson.regions) {
        for (const [regionKey, regionData] of Object.entries(mappingJson.regions)) {
            regionCount++;
            const label = regionKeyToLabel(regionKey);
            const side = regionKeyToSide(regionKey);

            if (regionData.meshes && Array.isArray(regionData.meshes)) {
                for (const meshName of regionData.meshes) {
                    meshCount++;
                    mappingByMeshName.set(meshName, {
                        regionId: regionKey,
                        regionLabel: label,
                        side: side,
                        state: regionData.state || 'normal'
                    });
                }
            }
        }
    }

    // Re-apply mapping to already-loaded model if available
    if (cachedModelRoot) {
        applyMappingToModel();
    }

    return { regionCount, meshCount };
}

/**
 * Apply loaded mapping over existing bounding-box regions
 */
function applyMappingToModel() {
    if (!cachedModelRoot) return;

    cachedModelRoot.traverse((child) => {
        if (!child.isMesh) return;
        const meshName = child.name;
        if (meshName && mappingByMeshName.has(meshName)) {
            const mapped = mappingByMeshName.get(meshName);
            const existing = meshRegions.get(child.uuid);
            meshRegions.set(child.uuid, {
                ...existing,
                regionId: mapped.regionId,
                regionLabel: mapped.regionLabel,
                side: mapped.side,
                state: mapped.state,
                source: 'mapping'
            });
        }
    });
}

/**
 * Clear loaded mapping, revert to bounding-box regions
 */
export function clearMapping() {
    mappingByMeshName.clear();
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
    return {
        version: currentMapping.version || '-',
        timestamp: currentMapping.timestamp || null,
        regionCount: currentMapping.regions ? Object.keys(currentMapping.regions).length : 0,
        meshCount: mappingByMeshName.size,
        regions: currentMapping.regions ? Object.keys(currentMapping.regions).map(key => ({
            id: key,
            label: regionKeyToLabel(key),
            meshCount: currentMapping.regions[key].meshes?.length || 0,
            state: currentMapping.regions[key].state || 'normal'
        })) : []
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
 * Get all region keys with labels
 */
export function getAllRegionKeysWithLabels() {
    if (!currentMapping || !currentMapping.regions) return [];
    return Object.keys(currentMapping.regions).map(key => ({
        key,
        label: regionKeyToLabel(key),
        meshCount: currentMapping.regions[key].meshes?.length || 0
    }));
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
