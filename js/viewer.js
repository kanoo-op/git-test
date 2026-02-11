// viewer.js - Three.js scene, camera, renderer, model loading

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { computeRegions } from './regions.js';
import { setSceneRoot, initVertexColors } from './highlights.js';

const MODEL_PATH = './RiggingModel.glb';
const MODEL_SIZE = 42056484;

export let scene, camera, renderer, modelRoot;
let animationId;
let envMap = null;

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
 * Create a dark clinical analysis background texture
 */
function createGradientBackground() {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, '#0a0f1a');
    gradient.addColorStop(0.3, '#0d1525');
    gradient.addColorStop(0.6, '#0f1a2e');
    gradient.addColorStop(1, '#080d18');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
}

/**
 * Per-tissue material enhancement for premium medical look
 */
function enhanceMaterial(material, tissueType) {
    const matName = tissueType || material.name || '';

    if (matName.startsWith('Muscles') || matName.startsWith('Tendon') || matName.startsWith('Articular_capsule')) {
        // Muscle/tendon/capsule: slightly glossy, wet tissue look
        material.roughness = 0.45;
        material.metalness = 0.02;
        material.envMapIntensity = 0.6;
    } else if (matName.startsWith('Bone')) {
        // Bone: matte, dry
        material.roughness = 0.75;
        material.metalness = 0.0;
        material.envMapIntensity = 0.25;
    } else if (matName.startsWith('Ligament')) {
        // Ligament: semi-glossy
        material.roughness = 0.5;
        material.metalness = 0.01;
        material.envMapIntensity = 0.5;
    } else if (matName.startsWith('Cartilage')) {
        // Cartilage: smooth, slightly translucent feel
        material.roughness = 0.35;
        material.metalness = 0.01;
        material.envMapIntensity = 0.7;
    } else if (matName.startsWith('Fat')) {
        // Fat: soft, matte
        material.roughness = 0.65;
        material.metalness = 0.0;
        material.envMapIntensity = 0.3;
    } else {
        // Default: moderate
        material.roughness = 0.55;
        material.metalness = 0.01;
        material.envMapIntensity = 0.4;
    }

    if (envMap) {
        material.envMap = envMap;
    }
    material.needsUpdate = true;
}

/**
 * Initialize the Three.js scene
 */
export function initScene(canvas) {
    // Scene
    scene = new THREE.Scene();
    scene.background = createGradientBackground();

    // Camera
    const aspect = canvas.clientWidth / canvas.clientHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
    camera.position.set(0, 1.0, 3.0);

    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;

    // Environment map (subtle studio reflections)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment(renderer);
    envMap = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    scene.environment = envMap;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // --- Dark clinical analysis lighting ---

    // Soft ambient base (cooler, dimmer for dark bg)
    const ambientLight = new THREE.AmbientLight(0xc8d8f0, 0.35);
    scene.add(ambientLight);

    // Hemisphere: cool sky, dark ground
    const hemiLight = new THREE.HemisphereLight(0xd0e0ff, 0x102040, 0.5);
    scene.add(hemiLight);

    // Key light (main, with shadows) - bright clinical white
    const keyLight = new THREE.DirectionalLight(0xf0f4ff, 1.3);
    keyLight.position.set(3, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -3;
    keyLight.shadow.camera.right = 3;
    keyLight.shadow.camera.top = 3;
    keyLight.shadow.camera.bottom = -3;
    keyLight.shadow.bias = -0.001;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);

    // Fill light (cool blue, from opposite side)
    const fillLight = new THREE.DirectionalLight(0x8ab4ff, 0.5);
    fillLight.position.set(-3, 3, -2);
    scene.add(fillLight);

    // Rim light (cyan edge definition from behind)
    const rimLight = new THREE.DirectionalLight(0x40e0d0, 0.45);
    rimLight.position.set(0, 2, -5);
    scene.add(rimLight);

    // Subtle bottom bounce
    const bounceLight = new THREE.DirectionalLight(0x203060, 0.2);
    bounceLight.position.set(0, -3, 1);
    scene.add(bounceLight);

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

            // Second pass: clone materials, enhance, set tendon color = muscle color
            modelRoot.traverse((child) => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.userData.tissueType = child.material.name;
                    child.material.side = THREE.DoubleSide;
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // Make tendon & joint capsule color match muscle color
                    const matName = child.material.name || '';
                    if (muscleColor && (matName.startsWith('Tendon') || matName.startsWith('Articular_capsule'))) {
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

/**
 * Capture a screenshot of the current 3D view
 * @returns {string|null} data URL of the screenshot
 */
export function captureScreenshot() {
    if (!renderer) return null;
    // Force a render to ensure the latest frame
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
}
