# Composants tiers

Vérification effectuée le 29 juillet 2026. Les versions réellement installées doivent être
figées dans le déploiement de production, puis leurs notices doivent être archivées avec
l'image Docker distribuée.

| Composant | Rôle | Licence déclarée | Source |
|---|---|---|---|
| BiRefNet (code) | architecture de segmentation | MIT | https://github.com/ZhengPeng7/BiRefNet |
| BiRefNet (poids officiels) | segmentation du sujet | MIT, indiquée séparément sur la carte du modèle | https://huggingface.co/ZhengPeng7/BiRefNet |
| FastAPI | API HTTP | MIT | https://github.com/fastapi/fastapi |
| Uvicorn | serveur ASGI | BSD-3-Clause | https://github.com/encode/uvicorn |
| ONNX Runtime | inférence locale CPU/GPU | MIT | https://github.com/microsoft/onnxruntime |
| OpenCV | raffinement du masque | Apache-2.0 (versions 4.5+) | https://github.com/opencv/opencv |
| NumPy | calcul matriciel | BSD-3-Clause | https://github.com/numpy/numpy |
| Pillow | décodage/encodage d'images | HPND | https://github.com/python-pillow/Pillow |
| python-multipart | upload multipart | Apache-2.0 | https://github.com/Kludex/python-multipart |
| httpx | tests de l'API | BSD-3-Clause | https://github.com/encode/httpx |
| pytest | tests Python | MIT | https://github.com/pytest-dev/pytest |
| nginx | serveur du frontend Docker | BSD-2-Clause | https://nginx.org/LICENSE |

Aucun de ces composants n'impose un abonnement, un paiement par image, une clé commerciale
ou l'envoi d'images à un tiers. Ce document n'est pas un avis juridique : toute nouvelle
version ou tout nouveau poids doit faire l'objet d'une nouvelle vérification.

## Composants explicitement interdits dans cette architecture

Remove.bg, Clipdrop, Adobe, Photoroom, BRIA API, poids BRIA RMBG-2.0 et tout modèle limité
à la recherche/non-commercial ne doivent pas être ajoutés sans nouvelle décision de
licence documentée.
