// RealtimePose.js - 실시간 포즈 감지 + 3D 스켈레톤 오버레이
// VIDEO 모드 PoseLandmarker (lite 모델) + Three.js 스켈레톤 렌더링

import * as THREE from 'three';
import { scene } from '../core/SceneManager.js';
import { modelRoot, getMeshByName } from '../core/ModelLoader.js';
import { LM, CONNECTIONS, calculatePostureMetrics, mapMetricsToRegions } from './PoseDetector.js';
import { highlightMesh, unhighlightMesh } from '../anatomy/Highlights.js';
import { getRegionMeshNames } from '../anatomy/Regions.js';

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const LITE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let videoLandmarker = null;
let videoInitPromise = null;
let animFrameId = null;
let frameCount = 0;
let running = false;
let onUpdateCallback = null;

// 3D Skeleton
let skeletonGroup = null;
const jointSpheres = [];
const connectionLines = [];

// Model metrics for coordinate mapping
let modelHeight = 1.6;
let modelMinY = 0;
let modelCenterX = 0;
let modelCenterZ = 0;

// Live region highlight state
let liveHighlightedMeshes = new Set();

// SEV colors for skeleton joints
const JOINT_COLOR = 0x00ff88;
const LINE_COLOR = 0x00ccaa;

/**
 * VIDEO 모드 lite 모델 PoseLandmarker 초기화
 */
export async function initRealtimePose() {
    if (videoLandmarker) return videoLandmarker;
    if (videoInitPromise) return videoInitPromise;

    videoInitPromise = (async () => {
        try {
            const { PoseLandmarker, FilesetResolver } = await import(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs'
            );

            const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);

            videoLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: LITE_MODEL_URL,
                    delegate: 'GPU',
                },
                runningMode: 'VIDEO',
                numPoses: 1,
            });

            return videoLandmarker;
        } catch (err) {
            videoInitPromise = null;
            videoLandmarker = null;
            throw err;
        }
    })();

    return videoInitPromise;
}

/**
 * 모델 좌표 기준값 계산
 */
function computeModelMetrics() {
    if (!modelRoot) return;
    const box = new THREE.Box3().setFromObject(modelRoot);
    modelHeight = box.max.y - box.min.y;
    modelMinY = box.min.y;
    modelCenterX = (box.min.x + box.max.x) / 2;
    modelCenterZ = (box.min.z + box.max.z) / 2;
}

/**
 * 3D 스켈레톤 그룹 생성 (33개 Sphere + 14개 Line)
 */
export function createSkeletonGroup() {
    if (skeletonGroup) {
        scene.remove(skeletonGroup);
    }

    computeModelMetrics();

    skeletonGroup = new THREE.Group();
    skeletonGroup.name = 'realtime-skeleton';
    skeletonGroup.renderOrder = 999;

    // 33개 관절 Sphere
    const sphereGeom = new THREE.SphereGeometry(0.015, 8, 6);
    const sphereMat = new THREE.MeshBasicMaterial({
        color: JOINT_COLOR,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
    });

    for (let i = 0; i < 33; i++) {
        const sphere = new THREE.Mesh(sphereGeom, sphereMat.clone());
        sphere.visible = false;
        sphere.renderOrder = 999;
        skeletonGroup.add(sphere);
        jointSpheres.push(sphere);
    }

    // 연결선
    const lineMat = new THREE.LineBasicMaterial({
        color: LINE_COLOR,
        depthTest: false,
        transparent: true,
        opacity: 0.7,
        linewidth: 2,
    });

    for (const [i, j] of CONNECTIONS) {
        const geom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(), new THREE.Vector3()
        ]);
        const line = new THREE.Line(geom, lineMat.clone());
        line.visible = false;
        line.renderOrder = 998;
        skeletonGroup.add(line);
        connectionLines.push({ line, from: i, to: j });
    }

    scene.add(skeletonGroup);
    return skeletonGroup;
}

/**
 * MediaPipe world 좌표 → Three.js 모델 좌표 변환
 * MediaPipe: 미터 단위, hip 중심, Y-down
 * Three.js: Y-up, feet 기준
 */
function mapToModelCoords(mp) {
    const scaleFactor = modelHeight / 1.7;
    const hipY = modelMinY + modelHeight * 0.52;

    return {
        x: modelCenterX - mp.x * scaleFactor,      // L/R 반전
        y: hipY - mp.y * scaleFactor,                // hip 기준 오프셋
        z: modelCenterZ - mp.z * scaleFactor,        // 전후 반전
    };
}

/**
 * 스켈레톤 포지션 업데이트
 * @param {Array} worldLandmarks - MediaPipe worldLandmarks[0]
 */
export function updateSkeleton(worldLandmarks) {
    if (!skeletonGroup || !worldLandmarks) return;

    // Update joint positions
    for (let i = 0; i < Math.min(worldLandmarks.length, 33); i++) {
        const wl = worldLandmarks[i];
        const pos = mapToModelCoords(wl);
        jointSpheres[i].position.set(pos.x, pos.y, pos.z);
        jointSpheres[i].visible = (wl.visibility || 0) > 0.3;
    }

    // Update connection lines
    for (const { line, from, to } of connectionLines) {
        const a = jointSpheres[from];
        const b = jointSpheres[to];
        if (a.visible && b.visible) {
            const positions = line.geometry.attributes.position;
            positions.setXYZ(0, a.position.x, a.position.y, a.position.z);
            positions.setXYZ(1, b.position.x, b.position.y, b.position.z);
            positions.needsUpdate = true;
            line.visible = true;
        } else {
            line.visible = false;
        }
    }
}

/**
 * 실시간 포즈 분석 시작
 * @param {HTMLVideoElement} videoEl - 웹캠 비디오 요소
 * @param {Function} onUpdate - 콜백: (result) => {}
 *   result: { landmarks, worldLandmarks, metrics, regionMapping, confidence }
 */
export function startRealtimePose(videoEl, onUpdate) {
    if (running) return;
    running = true;
    frameCount = 0;
    onUpdateCallback = onUpdate;

    if (!skeletonGroup) {
        createSkeletonGroup();
    }

    function processFrame() {
        if (!running) return;
        animFrameId = requestAnimationFrame(processFrame);

        frameCount++;
        // 3프레임마다 분석 (~10fps at 30fps video)
        if (frameCount % 3 !== 0) return;

        if (!videoLandmarker || videoEl.readyState < 2) return;

        try {
            const timestamp = performance.now();
            const result = videoLandmarker.detectForVideo(videoEl, timestamp);

            if (result.landmarks && result.landmarks.length > 0) {
                const landmarks = result.landmarks[0];
                const worldLandmarks = result.worldLandmarks?.[0] || null;

                // Calculate confidence
                const keyIndices = [
                    LM.NOSE, LM.LEFT_EAR, LM.RIGHT_EAR,
                    LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER,
                    LM.LEFT_HIP, LM.RIGHT_HIP,
                    LM.LEFT_KNEE, LM.RIGHT_KNEE,
                    LM.LEFT_ANKLE, LM.RIGHT_ANKLE,
                ];
                let totalVis = 0, visCount = 0;
                for (const idx of keyIndices) {
                    if (landmarks[idx]?.visibility !== undefined) {
                        totalVis += landmarks[idx].visibility;
                        visCount++;
                    }
                }
                const confidence = visCount > 0 ? Math.round((totalVis / visCount) * 100) / 100 : 0;

                // Calculate metrics
                const metrics = calculatePostureMetrics(landmarks, worldLandmarks, videoEl);
                const regionMapping = mapMetricsToRegions(metrics);

                // Update 3D skeleton
                if (worldLandmarks) {
                    updateSkeleton(worldLandmarks);
                }

                // Apply live region highlights
                applyLiveRegionHighlights(regionMapping);

                if (onUpdateCallback) {
                    onUpdateCallback({
                        landmarks,
                        worldLandmarks,
                        metrics,
                        regionMapping,
                        confidence,
                    });
                }
            }
        } catch (err) {
            // Skip frame on error (common during initialization)
            console.warn('Realtime pose frame error:', err);
        }
    }

    processFrame();
}

/**
 * 실시간 포즈 감지 중지
 */
export function stopRealtimePose() {
    running = false;
    onUpdateCallback = null;

    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }

    // Hide skeleton
    if (skeletonGroup) {
        skeletonGroup.visible = false;
    }

    // Clear live highlights
    clearLiveHighlights();
}

/**
 * 스켈레톤 제거
 */
export function removeSkeletonGroup() {
    if (skeletonGroup) {
        scene.remove(skeletonGroup);
        skeletonGroup = null;
    }
    jointSpheres.length = 0;
    connectionLines.length = 0;
}

/**
 * 실시간 부위 하이라이트 적용
 * @param {Array<{regionKey, severity}>} regionMapping
 */
export function applyLiveRegionHighlights(regionMapping) {
    // Clear previous
    clearLiveHighlights();

    for (const { regionKey, severity } of regionMapping) {
        if (severity === 'normal') continue;

        const meshNames = getRegionMeshNames(regionKey);
        for (const name of meshNames) {
            const mesh = getMeshByName(name);
            if (mesh && mesh.visible) {
                highlightMesh(mesh, severity);
                liveHighlightedMeshes.add(name);
            }
        }
    }
}

/**
 * 라이브 하이라이트 제거
 */
function clearLiveHighlights() {
    for (const name of liveHighlightedMeshes) {
        const mesh = getMeshByName(name);
        if (mesh) {
            unhighlightMesh(mesh);
        }
    }
    liveHighlightedMeshes.clear();
}

/**
 * 실시간 모드 활성 여부
 */
export function isRealtimeRunning() {
    return running;
}

/**
 * VIDEO 모드 PoseLandmarker 인스턴스 반환 (운동 모드 등 외부 사용)
 */
export function getVideoLandmarker() {
    return videoLandmarker;
}
