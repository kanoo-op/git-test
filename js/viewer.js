// viewer.js - Three.js scene, camera, renderer, model loading

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { computeRegions } from './regions.js';
import { setSceneRoot } from './highlights.js';

const MODELS = {
    original: { path: './OriginalMuscular002.glb', label: '원본 (고해상도)', size: 161311360 },
    rigging:  { path: './RiggingModel.glb',        label: '리깅용 (경량)',    size: 42000000 },
};

let currentModelKey = 'original';

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
 * @param {string|Function} modelKeyOrProgress - model key ('original'|'rigging') or onProgress callback (defaults to 'original')
 */
export function loadModel(modelKeyOrProgress, onProgressOrComplete, onCompleteOrError, onErrorOpt) {
    // Support both signatures:
    //   loadModel(onProgress, onComplete, onError)          — legacy
    //   loadModel(modelKey, onProgress, onComplete, onError) — new
    let modelKey, onProgress, onComplete, onError;
    if (typeof modelKeyOrProgress === 'string') {
        modelKey = modelKeyOrProgress;
        onProgress = onProgressOrComplete;
        onComplete = onCompleteOrError;
        onError = onErrorOpt;
    } else {
        modelKey = 'original';
        onProgress = modelKeyOrProgress;
        onComplete = onProgressOrComplete;
        onError = onCompleteOrError;
    }

    const model = MODELS[modelKey] || MODELS.original;
    currentModelKey = modelKey;

    const loader = new GLTFLoader();

    loader.load(
        model.path,
        // onLoad
        (gltf) => {
            // Remove previous model if exists
            if (modelRoot) {
                scene.remove(modelRoot);
                modelRoot = null;
            }

            modelRoot = gltf.scene;

            // Clone materials so each mesh has independent material (for per-mesh highlighting)
            modelRoot.traverse((child) => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.userData.tissueType = child.material.name;
                    child.material.side = THREE.DoubleSide;
                }
            });

            // Auto-center the model
            const box = new THREE.Box3().setFromObject(modelRoot);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            modelRoot.position.sub(center);

            // Adjust camera to fit model
            const maxDim = Math.max(size.x, size.y, size.z);
            camera.position.set(0, size.y * 0.3, maxDim * 1.5);
            camera.lookAt(0, 0, 0);

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
            const total = xhr.total > 0 ? xhr.total : model.size;
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
 * Get available model list
 */
export function getModelList() {
    return Object.entries(MODELS).map(([key, m]) => ({ key, label: m.label }));
}

/**
 * Get current model key
 */
export function getCurrentModelKey() {
    return currentModelKey;
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
