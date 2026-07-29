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
