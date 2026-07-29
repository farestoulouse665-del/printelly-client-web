# Jeu de validation visuelle privé

Les images de clients ne doivent jamais être commitées. Pour exécuter l'acceptation visuelle,
placez des images consenties dans ce dossier avec les noms suivants, plus un masque de
référence `*-expected-mask.png` créé et validé manuellement :

1. `white-dress-white-background.png`
2. `black-dress-black-background.png`
3. `white-logo-white-background.png`
4. `red-logo-red-background.png`
5. `green-product-forest.png`
6. `person-street.png`
7. `fine-hair-complex-background.png`
8. `lace.png`
9. `semi-transparent-veil.png`
10. `white-text-design.png`
11. `object-shadow.png`
12. `multiple-subjects.png`
13. `already-transparent.png`
14. `very-large-image.png`
15. `corrupted.bin`
16. `unsupported.gif`
17. `cpu-reference.png`
18. `rgba-export.png`
19. `order-transfer.png`
20. `edge-subject.png`

Mesures recommandées : IoU du sujet, MAE alpha sur les contours, différence RGB sur
l'intérieur opaque, dimensions, canal alpha et inspection humaine à 800 %. Les tests
automatiques unitaires ne remplacent pas cette recette visuelle.
