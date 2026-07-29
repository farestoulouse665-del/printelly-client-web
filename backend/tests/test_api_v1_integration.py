from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app


def _payload() -> bytes:
    output = BytesIO()
    Image.new("RGBA", (96, 72), (220, 30, 90, 255)).save(output, format="PNG")
    return output.getvalue()


def test_guest_upload_library_queue_and_cancellation_are_connected():
    with TestClient(app) as client:
        session_response = client.post("/api/v1/sessions/guest")
        assert session_response.status_code == 201
        token = session_response.json()["token"]
        headers = {"X-Guest-Token": token}

        bad_response = client.post(
            "/api/v1/assets/upload",
            headers=headers,
            files={"image": ("mensonge.jpg", _payload(), "image/jpeg")},
        )
        assert bad_response.status_code == 415

        upload_response = client.post(
            "/api/v1/assets/upload",
            headers=headers,
            files={"image": ("logo.png", _payload(), "image/png")},
        )
        assert upload_response.status_code == 201, upload_response.text
        asset = upload_response.json()
        assert asset["width"] == 96
        assert asset["height"] == 72
        assert "/data/" not in str(asset)
        assert asset["original_download_url"].startswith("/api/v1/files/")

        library_response = client.get("/api/v1/assets", headers=headers)
        assert library_response.status_code == 200
        assert library_response.json()["total"] == 1

        register_response = client.post(
            "/api/v1/accounts/register",
            headers=headers,
            json={
                "email": "atelier@example.dz",
                "display_name": "Atelier test",
                "password": "une-phrase-secrete-solide",
                "locale": "fr",
            },
        )
        assert register_response.status_code == 201, register_response.text
        assert register_response.json()["user"]["email"] == "atelier@example.dz"
        assert register_response.json()["retention_days"] > 7

        me_response = client.get("/api/v1/accounts/me", headers=headers)
        assert me_response.status_code == 200

        assert client.post("/api/v1/accounts/logout", headers=headers).status_code == 204
        next_guest = client.post("/api/v1/sessions/guest").json()["token"]
        login_response = client.post(
            "/api/v1/accounts/login",
            headers={"X-Guest-Token": next_guest},
            json={
                "email": "atelier@example.dz",
                "password": "une-phrase-secrete-solide",
            },
        )
        assert login_response.status_code == 200, login_response.text
        token = login_response.json()["token"]
        headers = {"X-Guest-Token": token}
        persistent_library = client.get("/api/v1/assets", headers=headers)
        assert persistent_library.status_code == 200
        assert persistent_library.json()["total"] == 1

        job_response = client.post(
            "/api/v1/background-removal/jobs",
            headers=headers,
            json={
                "asset_id": asset["id"],
                "mode": "logo_text",
                "cleanup": "normal",
                "protect_details": True,
            },
        )
        assert job_response.status_code == 202, job_response.text
        job = job_response.json()
        assert job["state"] == "queued"
        assert job["progress"] == 0

        cancel_response = client.post(
            f"/api/v1/background-removal/jobs/{job['id']}/cancel",
            headers=headers,
        )
        assert cancel_response.status_code == 200
        assert cancel_response.json()["cancel_requested"] is True
