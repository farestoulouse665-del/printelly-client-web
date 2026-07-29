# Licence du modèle local

## Modèle retenu

- **Architecture / poids** : BiRefNet, variante ONNX `BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx`
- **Projet officiel** : https://github.com/ZhengPeng7/BiRefNet
- **Publication ONNX officielle** : https://github.com/ZhengPeng7/BiRefNet/releases/tag/v1
- **Carte officielle des poids** : https://huggingface.co/ZhengPeng7/BiRefNet
- **Licence déclarée pour le code** : MIT
- **Licence déclarée sur la carte des poids** : MIT
- **Usage commercial** : autorisé par les termes MIT, sous réserve de conserver la notice de licence.

La licence du code et celle des poids ont été vérifiées séparément. Le fichier ONNX n'est
pas commité dans ce dépôt et n'est jamais téléchargé silencieusement. Le propriétaire du
déploiement choisit l'artefact, contrôle son empreinte SHA-256 puis lance l'installateur
explicite.

## Exclusion importante

Les poids **BRIA RMBG-2.0**, y compris les variantes dérivées présentes dans certains
écosystèmes de détourage, sont volontairement exclus : leur licence de poids comporte des
restrictions commerciales. Aucun modèle BRIA n'est utilisé par ce projet.

## Notice MIT BiRefNet

Copyright (c) Zheng Peng and BiRefNet contributors.

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
