// ModelLoader.js - GLB model loading, mesh management, material enhancement
// viewer.js 후반부에서 분리

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene, camera, envMap } from './SceneManager.js';
import { computeRegions } from '../anatomy/Regions.js';
import { setSceneRoot, initVertexColors } from '../anatomy/Highlights.js';

const MODEL_PATH = '/models/RiggingModel.glb';
const MODEL_SIZE = 42056484;

export let modelRoot;
export let modelBounds = null;

// Mesh name index for fast lookup
const meshNameIndex = new Map();

// Bone material prefixes
const BONE_PREFIXES = ['Bone', 'Suture', 'Teeth'];

function isBoneMaterial(matName) {
    return BONE_PREFIXES.some(p => matName.startsWith(p));
}

/**
 * Per-tissue material enhancement (근육 / 뼈 two categories)
 */
function enhanceMaterial(material, tissueType) {
    const matName = tissueType || material.name || '';

    if (isBoneMaterial(matName)) {
        // 뼈: matte, dry
        material.roughness = 0.75;
        material.metalness = 0.0;
        material.envMapIntensity = 0.25;
    } else {
        // 근육 (muscles, tendons, ligaments, cartilage, capsule, fat): slightly glossy, wet tissue look
        material.roughness = 0.45;
        material.metalness = 0.02;
        material.envMapIntensity = 0.6;
    }

    if (envMap) {
        material.envMap = envMap;
    }
    material.needsUpdate = true;
}

function buildMeshIndex() {
    meshNameIndex.clear();
    if (!modelRoot) return;
    modelRoot.traverse((child) => {
        if (child.isMesh && child.name) {
            meshNameIndex.set(child.name, child);
        }
    });
}

/**
 * Get a mesh by its name
 */
export function getMeshByName(name) {
    return meshNameIndex.get(name) || null;
}

/**
 * Load a GLB model with progress tracking
 */
export function loadModel(onProgress, onComplete, onError) {
    const loader = new GLTFLoader();

    loader.load(
        MODEL_PATH,
        // onLoad
        (gltf) => {
            // Remove previous model if exists
            if (modelRoot) {
                scene.remove(modelRoot);
                modelRoot = null;
            }

            modelRoot = gltf.scene;

            // Clone materials and init vertex colors (for per-vertex region coloring)
            // First pass: find muscle color
            let muscleColor = null;
            modelRoot.traverse((child) => {
                if (child.isMesh && !muscleColor) {
                    const matName = child.material.name || '';
                    if (matName.startsWith('Muscles') && child.material.color) {
                        muscleColor = child.material.color.clone();
                    }
                }
            });

            // Second pass: clone materials, enhance, set tendon color = muscle color
            modelRoot.traverse((child) => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.userData.tissueType = child.material.name;
                    child.material.side = THREE.DoubleSide;
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // Make all muscle-group tissues match muscle color
                    const matName = child.material.name || '';
                    if (muscleColor && !isBoneMaterial(matName) && !matName.startsWith('Muscles')) {
                        child.material.color.copy(muscleColor);
                    }

                    // Premium material properties per tissue type
                    enhanceMaterial(child.material, matName);

                    initVertexColors(child);
                }
            });

            // Compute model bounds (do NOT move model - keep original coordinates for mapping)
            const box = new THREE.Box3().setFromObject(modelRoot);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            // Store model bounds for external use (realtime pose, anatomy search)
            modelBounds = {
                min: box.min.clone(),
                max: box.max.clone(),
                center: center.clone(),
                height: size.y,
            };

            // Position camera relative to model center (like anatomy-viewer-v2)
            const maxDim = Math.max(size.x, size.y, size.z);
            camera.position.set(center.x + maxDim * 0.6, center.y + maxDim * 0.4, center.z + maxDim * 0.8);
            camera.lookAt(center);

            // Update shadow camera to fit model
            const keyLight = scene.children.find(c => c.isDirectionalLight && c.castShadow);
            if (keyLight) {
                keyLight.target.position.copy(center);
                scene.add(keyLight.target);
                const halfSize = maxDim * 0.8;
                keyLight.shadow.camera.left = -halfSize;
                keyLight.shadow.camera.right = halfSize;
                keyLight.shadow.camera.top = halfSize;
                keyLight.shadow.camera.bottom = -halfSize;
                keyLight.shadow.camera.updateProjectionMatrix();
            }

            scene.add(modelRoot);

            // Compute body regions for all meshes
            computeRegions(modelRoot);

            // Register with highlights system
            setSceneRoot(modelRoot);

            // Build mesh name index for fast lookup
            buildMeshIndex();

            if (onComplete) onComplete(modelRoot, { center, size, maxDim });
        },
        // onProgress
        (xhr) => {
            const total = xhr.total > 0 ? xhr.total : MODEL_SIZE;
            const percent = Math.min((xhr.loaded / total) * 100, 100);
            const mbLoaded = (xhr.loaded / (1024 * 1024)).toFixed(1);
            const mbTotal = (total / (1024 * 1024)).toFixed(0);
            if (onProgress) onProgress(percent, mbLoaded, mbTotal);
        },
        // onError
        (error) => {
            console.error('Model load error:', error);
            if (onError) onError(error);
        }
    );
}
