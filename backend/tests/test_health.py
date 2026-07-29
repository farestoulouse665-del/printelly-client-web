from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_health_stays_available_when_model_is_not_installed():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["model_loaded"] is False
    assert "tiers" in body["privacy"]
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
