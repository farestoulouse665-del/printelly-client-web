# Modèles locaux

Placez ici le fichier approuvé sous le nom `background-removal.onnx`.

Ce dossier ne doit contenir dans Git que cette documentation et `.gitkeep`. Les poids,
volumineux, restent locaux et sont montés en lecture seule dans Docker.

L'installation est toujours explicite :

```bash
python backend/scripts/install_model.py \
  --sha256 VOTRE_EMPREINTE_SHA256_APPROUVEE \
  --accept-mit-license
```

L'URL par défaut pointe vers l'artefact ONNX officiel BiRefNet general tiny de la release
`v1`. Vous pouvez fournir un miroir contrôlé avec `--url`. N'utilisez jamais un poids
dont la licence ou la provenance est ambiguë.
