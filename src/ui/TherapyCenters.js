// TherapyCenters.js - 주변 치료센터 검색 (네이버 지도 + Local Search API)

import { searchNearbyPlaces } from '../services/Api.js';
import { getNaverApiSettings } from '../services/Storage.js';

let map = null;
let markers = [];
let infoWindow = null;
let currentPosition = null;
let currentResults = [];
let sdkLoaded = false;
let mapInitialized = false;

// 대구과학대학교 좌표 (기본 위치)
const DEFAULT_POSITION = { lat: 35.9070, lng: 128.6025 };

// ======== Init ========

export function initTherapyCenters() {
    document.getElementById('therapy-refresh-btn')?.addEventListener('click', () => performSearch());
    document.getElementById('therapy-search-btn')?.addEventListener('click', () => performSearch());
    document.getElementById('therapy-use-location-btn')?.addEventListener('click', handleUseLocation);
    document.getElementById('therapy-clear-location-btn')?.addEventListener('click', handleClearLocation);
    document.getElementById('therapy-open-settings-btn')?.addEventListener('click', () => {
        document.getElementById('dev-settings-overlay').style.display = 'flex';
    });

    // Enter key to search
    document.getElementById('therapy-search-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch();
        }
    });
}

export function activateTherapyCentersView() {
    const settings = getNaverApiSettings();
    if (!settings || !settings.clientId) {
        document.getElementById('therapy-setup-notice').style.display = 'flex';
        document.getElementById('therapy-main-content').style.display = 'none';
        return;
    }

    document.getElementById('therapy-setup-notice').style.display = 'none';
    document.getElementById('therapy-main-content').style.display = 'block';

    loadNaverMapsSDK(() => {
        if (!mapInitialized) {
            initializeMap();
            mapInitialized = true;
        }
    });
}

// ======== Naver Maps SDK ========

function loadNaverMapsSDK(callback) {
    if (sdkLoaded && window.naver && window.naver.maps) {
        callback();
        return;
    }

    const settings = getNaverApiSettings();
    if (!settings || !settings.clientId) return;

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${settings.clientId}&submodules=geocoder`;
    script.onload = () => {
        sdkLoaded = true;
        callback();
    };
    script.onerror = () => {
        showError('지도 SDK 로딩 실패. Client ID를 확인하세요.');
    };
    document.head.appendChild(script);
}

function initializeMap() {
    const container = document.getElementById('therapy-naver-map');
    if (!container || !window.naver) return;

    map = new naver.maps.Map(container, {
        center: new naver.maps.LatLng(DEFAULT_POSITION.lat, DEFAULT_POSITION.lng),
        zoom: 15,
        zoomControl: true,
        zoomControlOptions: { position: naver.maps.Position.TOP_RIGHT }
    });

    infoWindow = new naver.maps.InfoWindow({ anchorSkew: true });

    // 대구과학대 기본 위치 마커
    new naver.maps.Marker({
        position: new naver.maps.LatLng(DEFAULT_POSITION.lat, DEFAULT_POSITION.lng),
        map,
        icon: {
            content: '<div style="width:20px;height:20px;background:#e53935;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);"></div>',
            anchor: new naver.maps.Point(10, 10)
        }
    });

    // 뷰 활성화 시 자동 검색
    const query = document.getElementById('therapy-search-input').value.trim();
    if (query) {
        currentPosition = { ...DEFAULT_POSITION };
        updateLocationDisplay('대구과학대학교');
        performSearch();
    }
}

// ======== Location ========

function handleUseLocation() {
    if (!navigator.geolocation) {
        showError('이 브라우저는 위치 정보를 지원하지 않습니다.');
        return;
    }

    showLoading('위치 확인 중...');

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            updateLocationDisplay(`현재 위치 (${currentPosition.lat.toFixed(4)}, ${currentPosition.lng.toFixed(4)})`);
            panMap(currentPosition);
            hideLoading();
            // Auto-search if there's a query
            const query = document.getElementById('therapy-search-input').value.trim();
            if (query) performSearch();
        },
        (err) => {
            hideLoading();
            const msg = err.code === err.PERMISSION_DENIED
                ? '위치 권한이 거부되었습니다. 브라우저 설정에서 허용하세요.'
                : '위치를 가져올 수 없습니다.';
            showError(msg);
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

function handleClearLocation() {
    currentPosition = null;
    document.getElementById('therapy-current-location').style.display = 'none';
}

// ======== Search ========

async function performSearch() {
    const query = document.getElementById('therapy-search-input').value.trim();
    if (!query) {
        showError('검색어를 입력하세요.');
        return;
    }

    showLoading('검색 중...');
    clearResults();

    try {
        const x = currentPosition ? currentPosition.lng : null;
        const y = currentPosition ? currentPosition.lat : null;
        const response = await searchNearbyPlaces(query, x, y, 0);

        hideLoading();

        if (!response || !response.items || response.items.length === 0) {
            showEmpty();
            return;
        }

        currentResults = response.items;
        renderResults(response.items);

        // Center map on first result (or user position if set)
        const firstPos = getItemPosition(response.items[0]);
        const mapCenter = currentPosition || firstPos;
        if (mapCenter) {
            renderMarkersOnMap(response.items, mapCenter);
        }

    } catch (error) {
        hideLoading();
        if (error && (error.status === 503 || error.status === 404)) {
            showError('백엔드 서버에 연결할 수 없습니다. 백엔드 .env의 네이버 API 설정을 확인하세요.');
        } else {
            showError('검색 오류: ' + (error?.message || '알 수 없는 오류'));
        }
    }
}

function getItemPosition(item) {
    if (!item || !item.mapx || !item.mapy) return null;
    return {
        lat: parseInt(item.mapy, 10) / 10_000_000,
        lng: parseInt(item.mapx, 10) / 10_000_000
    };
}

// ======== Rendering ========

function renderResults(items) {
    const list = document.getElementById('therapy-results-list');

    list.innerHTML = items.map((item, i) => {
        const category = (item.category || '').split('>').pop().trim();
        const address = item.roadAddress || item.address || '';
        const phone = item.telephone || '';
        const distance = item.distance != null ? `${item.distance >= 1000 ? (item.distance / 1000).toFixed(1) + 'km' : item.distance + 'm'}` : '';

        return `
            <div class="therapy-result-card" data-index="${i}">
                <div class="therapy-result-header">
                    <span class="therapy-result-num">${i + 1}</span>
                    <h4 class="therapy-result-title">${stripTags(item.title)}</h4>
                    ${category ? `<span class="therapy-result-category">${category}</span>` : ''}
                </div>
                <div class="therapy-result-info">
                    <div class="therapy-result-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        <span>${address}${distance ? ` (${distance})` : ''}</span>
                    </div>
                    ${phone ? `<div class="therapy-result-row">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                        <span>${phone}</span>
                    </div>` : ''}
                </div>
                ${item.link ? `<a class="therapy-result-link-btn" href="${item.link}" target="_blank" rel="noopener noreferrer">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    상세보기
                </a>` : ''}
            </div>
        `;
    }).join('');

    // Card click → highlight marker
    list.querySelectorAll('.therapy-result-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.therapy-result-link-btn')) return;
            highlightMarker(parseInt(card.dataset.index, 10));
        });
    });
}

function renderMarkersOnMap(items, center) {
    if (!map) return;
    clearMarkers();

    const bounds = new naver.maps.LatLngBounds();

    // User position marker (blue dot)
    if (currentPosition) {
        const centerMarker = new naver.maps.Marker({
            position: new naver.maps.LatLng(currentPosition.lat, currentPosition.lng),
            map,
            icon: {
                content: '<div style="width:18px;height:18px;background:var(--accent-primary,#4a7c6f);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3);"></div>',
                anchor: new naver.maps.Point(9, 9)
            }
        });
        markers.push(centerMarker);
        bounds.extend(centerMarker.getPosition());
    }

    // Result markers
    items.forEach((item, i) => {
        const pos = getItemPosition(item);
        if (!pos) return;

        const latlng = new naver.maps.LatLng(pos.lat, pos.lng);
        const marker = new naver.maps.Marker({
            position: latlng,
            map,
            icon: {
                content: `<div style="width:28px;height:28px;background:#fff;border:2px solid var(--accent-primary,#4a7c6f);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:var(--accent-primary,#4a7c6f);box-shadow:0 2px 6px rgba(0,0,0,.15);cursor:pointer;">${i + 1}</div>`,
                anchor: new naver.maps.Point(14, 14)
            }
        });

        naver.maps.Event.addListener(marker, 'click', () => {
            openInfoWindow(marker, item);
            highlightCard(i);
        });

        markers.push(marker);
        bounds.extend(latlng);
    });

    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
}

function highlightMarker(index) {
    const markerOffset = currentPosition ? 1 : 0;
    const marker = markers[index + markerOffset];
    if (!marker) return;

    openInfoWindow(marker, currentResults[index]);
    map.panTo(marker.getPosition());
    highlightCard(index);
}

function openInfoWindow(marker, item) {
    if (!infoWindow) return;
    const title = stripTags(item.title);
    const addr = item.roadAddress || item.address || '';
    const phone = item.telephone || '';

    infoWindow.setContent(`
        <div style="padding:12px;min-width:200px;font-family:Pretendard,sans-serif;">
            <div style="font-size:14px;font-weight:600;margin-bottom:6px;">${title}</div>
            <div style="font-size:12px;color:#666;margin-bottom:2px;">${addr}</div>
            ${phone ? `<div style="font-size:12px;font-weight:500;">${phone}</div>` : ''}
        </div>
    `);
    infoWindow.open(map, marker);
}

function highlightCard(index) {
    document.querySelectorAll('.therapy-result-card').forEach(c => c.classList.remove('active'));
    const card = document.querySelector(`.therapy-result-card[data-index="${index}"]`);
    if (card) {
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ======== Helpers ========

function clearMarkers() {
    markers.forEach(m => m.setMap(null));
    markers = [];
}

function clearResults() {
    document.getElementById('therapy-results-list').innerHTML = '';
    document.getElementById('therapy-empty').style.display = 'none';
    document.getElementById('therapy-error').style.display = 'none';
}

function updateLocationDisplay(text) {
    const el = document.getElementById('therapy-current-location');
    document.getElementById('therapy-location-text').textContent = text;
    el.style.display = 'flex';
}

function panMap(position) {
    if (map) {
        map.setCenter(new naver.maps.LatLng(position.lat, position.lng));
        map.setZoom(15);
    }
}

function showLoading(msg) {
    const el = document.getElementById('therapy-loading');
    el.querySelector('span').textContent = msg;
    el.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('therapy-loading').style.display = 'none';
}

function showError(msg) {
    const el = document.getElementById('therapy-error');
    el.textContent = msg;
    el.style.display = 'block';
}

function showEmpty() {
    document.getElementById('therapy-empty').style.display = 'flex';
}

function stripTags(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    return div.textContent || '';
}
