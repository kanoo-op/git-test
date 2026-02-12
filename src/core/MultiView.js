// multi-view.js - 다중 뷰포트 모드 (단일 / 2분할 / 4분할)
// 단일 renderer + scissor test 방식으로 다중 카메라 렌더링

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export let viewMode = 'single'; // 'single' | 'dual' | 'quad'

// 뷰포트 배열: 0=메인(전면), 1=후면, 2=좌측, 3=우측
const viewports = [];
let canvasEl = null;
let sceneRef = null;
let mainCamera = null; // viewer.js의 기존 카메라 참조
let modelCenterRef = new THREE.Vector3();
let overlayCanvas = null;
let overlayCtx = null;
let activeViewportIndex = 0;
let mainOrbitControls = null; // controls.js의 orbitControls 참조

// 카메라 거리 (프리셋)
const CAM_DIST = 2.5;
const CAM_Y_OFFSET = 0.3;

const VIEWPORT_PRESETS = [
    { id: 'front', label: '전면', pos: (c) => [c.x, c.y + CAM_Y_OFFSET, c.z + CAM_DIST] },
    { id: 'back',  label: '후면', pos: (c) => [c.x, c.y + CAM_Y_OFFSET, c.z - CAM_DIST] },
    { id: 'left',  label: '좌측', pos: (c) => [c.x - CAM_DIST, c.y + CAM_Y_OFFSET, c.z] },
    { id: 'right', label: '우측', pos: (c) => [c.x + CAM_DIST, c.y + CAM_Y_OFFSET, c.z] },
];

/**
 * 다중 뷰 초기화
 * @param {HTMLCanvasElement} canvas
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} existingCamera - viewer.js의 기존 카메라
 * @param {THREE.Vector3} modelCenter
 */
export function initMultiView(canvas, scene, existingCamera, modelCenter) {
    canvasEl = canvas;
    sceneRef = scene;
    mainCamera = existingCamera;
    modelCenterRef.copy(modelCenter);

    overlayCanvas = document.getElementById('viewport-overlay-canvas');
    if (overlayCanvas) {
        overlayCtx = overlayCanvas.getContext('2d');
    }

    // 뷰포트 0 = 메인 카메라 (기존 것 재사용, controls는 controls.js가 관리)
    viewports.length = 0;
    viewports.push({
        id: 'front',
        label: '전면',
        camera: mainCamera,
        controls: null, // controls.js의 orbitControls가 관리
        rect: { x: 0, y: 0, w: 1, h: 1 },
    });

    // 뷰포트 1~3 = 서브 카메라 + 개별 OrbitControls
    for (let i = 1; i < 4; i++) {
        const preset = VIEWPORT_PRESETS[i];
        const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
        const pos = preset.pos(modelCenterRef);
        cam.position.set(pos[0], pos[1], pos[2]);
        cam.lookAt(modelCenterRef);

        const controls = new OrbitControls(cam, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.screenSpacePanning = true;
        controls.minDistance = 0.3;
        controls.maxDistance = 10;
        controls.target.copy(modelCenterRef);
        controls.enabled = false; // 기본 비활성
        controls.update();

        viewports.push({
            id: preset.id,
            label: preset.label,
            camera: cam,
            controls,
            rect: { x: 0, y: 0, w: 0, h: 0 },
        });
    }

    // 포인터 이벤트로 활성 뷰포트 결정
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMoveForViewport);
}

/**
 * 다중 뷰 정리 (이벤트 리스너 제거 + sub controls dispose)
 */
export function disposeMultiView() {
    if (canvasEl) {
        canvasEl.removeEventListener('pointerdown', onPointerDown);
        canvasEl.removeEventListener('pointermove', onPointerMoveForViewport);
    }
    for (let i = 1; i < viewports.length; i++) {
        if (viewports[i].controls) {
            viewports[i].controls.dispose();
        }
    }
    viewports.length = 0;
}

/**
 * 뷰 모드 전환
 */
export function setViewMode(mode) {
    if (mode === viewMode) return;
    viewMode = mode;
    recalcRects();
    updateControlsState();

    // 서브 카메라 위치를 프리셋으로 리셋
    for (let i = 1; i < viewports.length; i++) {
        const preset = VIEWPORT_PRESETS[i];
        const pos = preset.pos(modelCenterRef);
        viewports[i].camera.position.set(pos[0], pos[1], pos[2]);
        viewports[i].camera.lookAt(modelCenterRef);
        if (viewports[i].controls) {
            viewports[i].controls.target.copy(modelCenterRef);
            viewports[i].controls.update();
        }
    }

    // 오버레이 갱신
    drawOverlay();
}

/**
 * 뷰포트 rect 재계산 (정규화 좌표 0~1)
 */
function recalcRects() {
    switch (viewMode) {
        case 'single':
            viewports[0].rect = { x: 0, y: 0, w: 1, h: 1 };
            break;
        case 'dual':
            viewports[0].rect = { x: 0, y: 0, w: 0.5, h: 1 };    // 전면 (좌)
            viewports[1].rect = { x: 0.5, y: 0, w: 0.5, h: 1 };  // 후면 (우)
            break;
        case 'quad':
            viewports[0].rect = { x: 0, y: 0, w: 0.5, h: 0.5 };    // 전면 (좌상)
            viewports[1].rect = { x: 0.5, y: 0, w: 0.5, h: 0.5 };  // 후면 (우상)
            viewports[2].rect = { x: 0, y: 0.5, w: 0.5, h: 0.5 };  // 좌측 (좌하)
            viewports[3].rect = { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };// 우측 (우하)
            break;
    }

    // 카메라 aspect 갱신
    const cw = canvasEl.clientWidth;
    const ch = canvasEl.clientHeight;
    const count = getActiveViewportCount();
    for (let i = 0; i < count; i++) {
        const r = viewports[i].rect;
        const aspect = (r.w * cw) / (r.h * ch);
        viewports[i].camera.aspect = aspect;
        viewports[i].camera.updateProjectionMatrix();
    }
}

function getActiveViewportCount() {
    switch (viewMode) {
        case 'single': return 1;
        case 'dual': return 2;
        case 'quad': return 4;
        default: return 1;
    }
}

function updateControlsState() {
    // single 모드에서는 메인 controls 활성, 서브 모두 비활성
    if (mainOrbitControls) {
        mainOrbitControls.enabled = (viewMode === 'single' || activeViewportIndex === 0);
    }
    for (let i = 1; i < viewports.length; i++) {
        if (viewports[i].controls) {
            viewports[i].controls.enabled = false;
        }
    }
    activeViewportIndex = 0;
}

/**
 * 다중 뷰 렌더링 (scissor test)
 */
export function renderMultiView(renderer, scene) {
    // CSS 픽셀 기준 (Three.js setViewport/setScissor가 내부적으로 pixelRatio 곱함)
    const cw = canvasEl.clientWidth;
    const ch = canvasEl.clientHeight;
    const count = getActiveViewportCount();

    renderer.setScissorTest(true);
    renderer.autoClear = false;

    // 전체 캔버스 clear (scissor가 이전 프레임 영역으로 남아있을 수 있음)
    renderer.setViewport(0, 0, cw, ch);
    renderer.setScissor(0, 0, cw, ch);
    renderer.clear();

    for (let i = 0; i < count; i++) {
        const vp = viewports[i];
        const r = vp.rect;

        // Three.js viewport은 좌하 원점
        const x = r.x * cw;
        const y = (1 - r.y - r.h) * ch; // 위→아래를 아래→위로 변환
        const w = r.w * cw;
        const h = r.h * ch;

        renderer.setViewport(x, y, w, h);
        renderer.setScissor(x, y, w, h);
        renderer.render(scene, vp.camera);
    }

    renderer.setScissorTest(false);
    renderer.autoClear = true;
}

/**
 * 리사이즈 핸들러
 */
export function handleMultiViewResize(width, height) {
    if (viewMode === 'single') return;
    recalcRects();
    resizeOverlay();
}

function resizeOverlay() {
    if (!overlayCanvas || !canvasEl) return;
    overlayCanvas.width = canvasEl.clientWidth;
    overlayCanvas.height = canvasEl.clientHeight;
    overlayCanvas.style.width = canvasEl.clientWidth + 'px';
    overlayCanvas.style.height = canvasEl.clientHeight + 'px';
}

/**
 * 카메라 줌 퍼센트 계산 (기본 거리 대비)
 */
function getZoomPercent(vpIndex) {
    const vp = viewports[vpIndex];
    if (!vp) return 100;
    const target = (vpIndex === 0 && mainOrbitControls)
        ? mainOrbitControls.target
        : (vp.controls ? vp.controls.target : modelCenterRef);
    const dist = vp.camera.position.distanceTo(target);
    if (dist === 0) return 100;
    return Math.round((CAM_DIST / dist) * 100);
}

/**
 * 오버레이: 뷰포트 경계선 + 라벨 + 줌 퍼센트
 */
function drawOverlay() {
    if (!overlayCtx || !overlayCanvas) return;

    resizeOverlay();
    const cw = overlayCanvas.width;
    const ch = overlayCanvas.height;
    overlayCtx.clearRect(0, 0, cw, ch);

    const count = getActiveViewportCount();

    // 경계선 (multi-view only)
    if (viewMode !== 'single') {
        overlayCtx.strokeStyle = 'rgba(74, 124, 111, 0.5)';
        overlayCtx.lineWidth = 1;

        if (viewMode === 'dual') {
            overlayCtx.beginPath();
            overlayCtx.moveTo(cw / 2, 0);
            overlayCtx.lineTo(cw / 2, ch);
            overlayCtx.stroke();
        } else if (viewMode === 'quad') {
            overlayCtx.beginPath();
            overlayCtx.moveTo(cw / 2, 0);
            overlayCtx.lineTo(cw / 2, ch);
            overlayCtx.moveTo(0, ch / 2);
            overlayCtx.lineTo(cw, ch / 2);
            overlayCtx.stroke();
        }
    }

    // 뷰포트별 라벨 + 줌 퍼센트
    for (let i = 0; i < count; i++) {
        const vp = viewports[i];
        const r = vp.rect;
        const zoom = getZoomPercent(i);

        // 라벨 (multi-view only)
        if (viewMode !== 'single') {
            const px = r.x * cw + 8;
            const py = r.y * ch + 8;
            const label = vp.label;

            overlayCtx.font = '11px Inter, sans-serif';
            overlayCtx.textAlign = 'left';
            overlayCtx.textBaseline = 'top';

            // 배경
            const metrics = overlayCtx.measureText(label);
            const pad = 4;
            overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            overlayCtx.beginPath();
            overlayCtx.roundRect(px - pad, py - 2, metrics.width + pad * 2, 18, 3);
            overlayCtx.fill();

            // 텍스트
            overlayCtx.fillStyle = i === activeViewportIndex ? '#4DE8B4' : 'rgba(255, 255, 255, 0.7)';
            overlayCtx.fillText(label, px, py);
        }

        // 줌 퍼센트 (all modes)
        const zoomText = zoom + '%';
        overlayCtx.font = '10px "Consolas", "Monaco", monospace';
        overlayCtx.textAlign = 'right';
        overlayCtx.textBaseline = 'bottom';

        const zx = (r.x + r.w) * cw - 10;
        const zy = (r.y + r.h) * ch - 10;
        const zoomMetrics = overlayCtx.measureText(zoomText);
        const zPad = 4;

        // 줌 배경 pill
        overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        overlayCtx.beginPath();
        overlayCtx.roundRect(
            zx - zoomMetrics.width - zPad,
            zy - 14,
            zoomMetrics.width + zPad * 2,
            16,
            3
        );
        overlayCtx.fill();

        // 줌 텍스트 (100% 이상이면 초록, 미만이면 연한 색)
        overlayCtx.fillStyle = zoom >= 100 ? 'rgba(77, 232, 180, 0.8)' : 'rgba(200, 220, 240, 0.6)';
        overlayCtx.fillText(zoomText, zx, zy);
    }
}

/**
 * 마우스 좌표로 뷰포트 인덱스 결정
 */
export function getViewportAtMouse(clientX, clientY) {
    if (viewMode === 'single') return 0;

    const rect = canvasEl.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;  // 0~1
    const ny = (clientY - rect.top) / rect.height;   // 0~1

    const count = getActiveViewportCount();
    for (let i = 0; i < count; i++) {
        const r = viewports[i].rect;
        if (nx >= r.x && nx < r.x + r.w && ny >= r.y && ny < r.y + r.h) {
            return i;
        }
    }
    return 0;
}

/**
 * 특정 뷰포트의 카메라 반환
 */
export function getViewportCamera(index) {
    if (index >= 0 && index < viewports.length) {
        return viewports[index].camera;
    }
    return mainCamera;
}

/**
 * 마우스 좌표를 해당 뷰포트 NDC (-1~1)로 변환
 */
export function mouseToViewportNDC(clientX, clientY, viewportIndex) {
    const rect = canvasEl.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;

    const r = viewports[viewportIndex]?.rect;
    if (!r) return { x: 0, y: 0 };

    // 뷰포트 내 로컬 좌표 (0~1)
    const localX = (nx - r.x) / r.w;
    const localY = (ny - r.y) / r.h;

    // NDC (-1~1)
    return {
        x: localX * 2 - 1,
        y: -(localY * 2 - 1),
    };
}

/**
 * 활성 뷰포트 인덱스
 */
export function getActiveViewportIndex() {
    return activeViewportIndex;
}

// ═══ 내부 이벤트 ═══

function onPointerDown(event) {
    if (viewMode === 'single') return;

    const idx = getViewportAtMouse(event.clientX, event.clientY);
    activeViewportIndex = idx;

    // 메인 controls: 뷰포트 0일 때만 활성
    if (mainOrbitControls) {
        mainOrbitControls.enabled = (idx === 0);
    }

    // 서브 controls: 클릭한 뷰포트만 활성
    const count = getActiveViewportCount();
    for (let i = 1; i < count; i++) {
        if (viewports[i].controls) {
            viewports[i].controls.enabled = (i === idx);
        }
    }

    drawOverlay();
}

function onPointerMoveForViewport(event) {
    if (viewMode === 'single') return;

    // 서브 controls update (damping)
    const count = getActiveViewportCount();
    for (let i = 1; i < count; i++) {
        if (viewports[i].controls) {
            viewports[i].controls.update();
        }
    }
}

/**
 * 메인 OrbitControls 참조 등록 (controls.js에서 호출)
 */
export function registerMainControls(controls) {
    mainOrbitControls = controls;
}

/**
 * 서브 controls 매 프레임 업데이트 (damping 적용)
 */
export function updateMultiViewControls() {
    // 줌 퍼센트 + 라벨 오버레이 매 프레임 갱신
    drawOverlay();

    if (viewMode === 'single') return;
    const count = getActiveViewportCount();
    for (let i = 1; i < count; i++) {
        if (viewports[i].controls) {
            viewports[i].controls.update();
        }
    }
}
