// viewer.js - Three.js scene, camera, renderer, model loading

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeRegions } from './regions.js';
import { setSceneRoot, initVertexColors } from './highlights.js';

const MODEL_PATH = './RiggingModel.glb';
const MODEL_SIZE = 42056484;

export let scene, camera, renderer, modelRoot;
let animationId;

// Mesh name index for fast lookup
const meshNameIndex = new Map();

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
 * Initialize the Three.js scene
 */
export function initScene(canvas) {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xF0EEEA);

    // Camera
    const aspect = canvas.clientWidth / canvas.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
    camera.position.set(0, 1.0, 3.0);

    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Lighting (clinical: even, soft, no harsh shadows)
    const ambientLight = new THREE.AmbientLight(0xFFF5EB, 0.7);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xFFFAF0, 0xE8E0D4, 0.5);
    scene.add(hemiLight);

    const dirLight1 = new THREE.DirectionalLight(0xFFFFFF, 0.9);
    dirLight1.position.set(3, 5, 4);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xFFFFFF, 0.35);
    dirLight2.position.set(-3, 2, -2);
    scene.add(dirLight2);

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width === 0 || height === 0) return;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
    });
    resizeObserver.observe(canvas.parentElement);

    return { scene, camera, renderer };
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

            // Second pass: clone materials, set tendon color = muscle color
            modelRoot.traverse((child) => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.userData.tissueType = child.material.name;
                    child.material.side = THREE.DoubleSide;

                    // Make tendon & joint capsule color match muscle color
                    const matName = child.material.name || '';
                    if (muscleColor && (matName.startsWith('Tendon') || matName.startsWith('Articular_capsule'))) {
                        child.material.color.copy(muscleColor);
                    }

                    initVertexColors(child);
                }
            });

            // Compute model bounds (do NOT move model - keep original coordinates for mapping)
            const box = new THREE.Box3().setFromObject(modelRoot);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            // Position camera relative to model center (like anatomy-viewer-v2)
            const maxDim = Math.max(size.x, size.y, size.z);
            camera.position.set(center.x + maxDim * 0.6, center.y + maxDim * 0.4, center.z + maxDim * 0.8);
            camera.lookAt(center);

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

/**
 * Start the render loop
 */
export function startRenderLoop() {
    function animate() {
        animationId = requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();
}

/**
 * Stop the render loop
 */
export function stopRenderLoop() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}
