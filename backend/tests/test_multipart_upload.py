from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.datastructures import UploadFile

from app.api.background import open_upload_form

app = FastAPI()


@app.post("/multipart-probe")
async def multipart_probe(request: Request) -> dict[str, int]:
    async with open_upload_form(request) as form:
        image = form.get("image")
        assert isinstance(image, UploadFile)
        return {"size": image.size or 0}


def test_multipart_parser_accepts_file_larger_than_default_one_megabyte():
    payload = b"x" * (2 * 1024 * 1024 + 137)
    with TestClient(app) as client:
        response = client.post(
            "/multipart-probe",
            files={"image": ("large.png", payload, "image/png")},
            data={"mode": "design"},
        )
    assert response.status_code == 200
    assert response.json() == {"size": len(payload)}
