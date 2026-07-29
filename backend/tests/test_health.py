from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


async def _crash_for_diagnostics() -> None:
    raise RuntimeError("private diagnostic details")


if not any(getattr(route, "path", None) == "/__test/crash" for route in app.routes):
    app.add_api_route("/__test/crash", _crash_for_diagnostics, methods=["GET"])


def assert_request_id(value: str) -> None:
    assert len(value) == 32
    int(value, 16)


def test_health_stays_available_when_model_is_not_installed():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["model_loaded"] is False
    assert "tiers" in body["privacy"]
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert_request_id(response.headers["x-request-id"])


def test_unhandled_errors_return_a_safe_traceable_response():
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/__test/crash")
    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == "Erreur interne du serveur."
    assert body["request_id"] == response.headers["x-request-id"]
    assert "private diagnostic details" not in response.text
    assert_request_id(body["request_id"])
