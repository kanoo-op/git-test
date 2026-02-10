// controls.js - OrbitControls, raycaster, mesh picking, camera presets

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { scene, camera, renderer } from './viewer.js';
import { getRegion, getTissueName } from './regions.js';
import { setHoverHighlight, clearHoverHighlight } from './highlights.js';

export let orbitControls;

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let canvas;

// Model center (set from viewer bounds, used for camera presets)
let modelCenter = new THREE.Vector3();

// Callbacks
let onMeshClick = null;
let onMeshHover = null;
let onMeshRightClick = null;

// Camera animation
let cameraAnimation = null;

/**
 * Initialize controls
 */
export function initControls(canvasEl, callbacks = {}) {
    canvas = canvasEl;
    onMeshClick = callbacks.onMeshClick || null;
    onMeshHover = callbacks.onMeshHover || null;
    onMeshRightClick = callbacks.onMeshRightClick || null;

    // Set model center if provided
    if (callbacks.modelCenter) {
        modelCenter.copy(callbacks.modelCenter);
    }

    // OrbitControls
    orbitControls = new OrbitControls(camera, canvas);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.screenSpacePanning = true;
    orbitControls.minDistance = 0.3;
    orbitControls.maxDistance = 10;
    orbitControls.target.copy(modelCenter);
    orbitControls.update();

    // Event listeners
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onRightClick);

    // Start update loop
    updateLoop();
}

function updateLoop() {
    requestAnimationFrame(updateLoop);

    // Update orbit controls
    if (orbitControls) {
        orbitControls.update();
    }

    // Animate camera if active
    if (cameraAnimation) {
        const { startPos, endPos, startTarget, endTarget, startTime, duration } = cameraAnimation;
        const elapsed = Date.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Smooth ease-in-out
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        camera.position.lerpVectors(startPos, endPos, ease);
        orbitControls.target.lerpVectors(startTarget, endTarget, ease);

        if (t >= 1) {
            cameraAnimation = null;
        }
    }
}

function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast for hover
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    const hit = intersects.find(i => i.object.isMesh && i.object.visible);

    if (hit) {
        setHoverHighlight(hit.object);
        canvas.style.cursor = 'pointer';

        if (onMeshHover) {
            const region = getRegion(hit.object);
            const tissue = getTissueName(hit.object.userData.tissueType);
            onMeshHover(hit.object, {
                tissue,
                region: region.regionLabel,
                side: region.side,
                source: region.source,
                x: event.clientX,
                y: event.clientY
            });
        }
    } else {
        clearHoverHighlight();
        canvas.style.cursor = 'default';
        if (onMeshHover) onMeshHover(null, null);
    }
}

function onClick(event) {
    // Ignore if user was orbiting (dragged)
    if (orbitControls && orbitControls._isDragging) return;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    const hit = intersects.find(i => i.object.isMesh && i.object.visible);

    if (hit && onMeshClick) {
        const region = getRegion(hit.object);
        const tissue = getTissueName(hit.object.userData.tissueType);
        onMeshClick(hit.object, {
            tissue,
            region: region.regionLabel,
            side: region.side,
            source: region.source,
            meshId: hit.object.name || hit.object.uuid
        });
    }
}

function onRightClick(event) {
    if (!onMeshRightClick) return;

    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    const hit = intersects.find(i => i.object.isMesh && i.object.visible);

    if (hit) {
        onMeshRightClick(hit.object);
    }
}

/**
 * Animate camera to a preset position
 */
export function animateCameraTo(position, target, duration = 800) {
    cameraAnimation = {
        startPos: camera.position.clone(),
        endPos: new THREE.Vector3(...position),
        startTarget: orbitControls.target.clone(),
        endTarget: target ? new THREE.Vector3(...target) : modelCenter.clone(),
        startTime: Date.now(),
        duration
    };
}

/**
 * Camera preset views
 */
export function setCameraPreset(preset) {
    const dist = 2.5;
    const cx = modelCenter.x, cy = modelCenter.y, cz = modelCenter.z;
    const target = [cx, cy, cz];

    switch (preset) {
        case 'front':
            animateCameraTo([cx, cy + 0.3, cz + dist], target);
            break;
        case 'back':
            animateCameraTo([cx, cy + 0.3, cz - dist], target);
            break;
        case 'left':
            animateCameraTo([cx - dist, cy + 0.3, cz], target);
            break;
        case 'right':
            animateCameraTo([cx + dist, cy + 0.3, cz], target);
            break;
        case 'top':
            animateCameraTo([cx, cy + dist, cz + 0.01], target);
            break;
        case 'reset':
            animateCameraTo([cx, cy + 0.5, cz + dist * 1.2], target);
            break;
    }
}
