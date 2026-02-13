"""
Naver API proxy router
Proxies Naver Local Search API to keep Client Secret secure on backend.
"""

from math import radians, cos, sin, asin, sqrt
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query

from ..config import settings

router = APIRouter(prefix="/api/naver", tags=["naver"])

NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json"


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two lat/lng points in meters."""
    R = 6371000
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return R * 2 * asin(sqrt(a))


@router.get("/local-search")
async def search_local(
    query: str = Query(..., description="검색어"),
    x: Optional[float] = Query(None, description="경도 (longitude)"),
    y: Optional[float] = Query(None, description="위도 (latitude)"),
    radius: int = Query(0, le=50000, description="검색 반경 (미터), 0이면 필터링 없음"),
    display: int = Query(15, le=15, description="결과 개수"),
):
    if not settings.NAVER_CLIENT_ID or not settings.NAVER_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Naver API credentials not configured in backend .env")

    headers = {
        "X-Naver-Client-Id": settings.NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": settings.NAVER_CLIENT_SECRET,
    }
    params = {
        "query": query,
        "display": min(display, 15),
        "start": 1,
        "sort": "random",
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                NAVER_LOCAL_SEARCH_URL,
                headers=headers,
                params=params,
                timeout=10.0,
            )
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=f"Naver API error: {response.text}")

            data = response.json()

            items = []
            for item in data.get("items", []):
                if "mapx" not in item or "mapy" not in item:
                    continue
                item_x = int(item["mapx"]) / 10_000_000
                item_y = int(item["mapy"]) / 10_000_000

                # Calculate distance if user position is provided
                if x is not None and y is not None:
                    dist = haversine_distance(y, x, item_y, item_x)
                    item["distance"] = round(dist)
                    # Filter by radius only if radius > 0
                    if radius > 0 and dist > radius:
                        continue

                items.append(item)

            # Sort by distance if available
            items.sort(key=lambda i: i.get("distance", 999999))

            return {
                "lastBuildDate": data.get("lastBuildDate"),
                "total": len(items),
                "items": items,
            }

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Naver API request timeout")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Naver API request failed: {str(e)}")
