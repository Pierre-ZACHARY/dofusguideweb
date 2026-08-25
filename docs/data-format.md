# Format réel des archives DofusGuide

Ce document décrit l’audit en lecture seule de `data/raw` effectué le 24 août 2026. Les JSON bruts restent la source de vérité ; aucune correction ou conversion n’est appliquée à ces fichiers.

Le rapport est reproductible avec :

```powershell
npm run audit-data
npm run audit-data -- --json
```

## Inventaire

- 1 guide, 331 fichiers d’étape, dont 5 tableaux vides.
- 326 étapes non vides et 2 692 éléments.
- 58 étapes changeraient d’ordre avec le tri visuel stable `pos_y`, `pos_x`, puis ordre source. L’ordre source reste conservé séparément.
- Aucun identifiant manquant ou dupliqué, aucune incohérence de numéro d’étape, position invalide, quête malformée ou type inconnu.

| `element.type` | Occurrences | Forme de `valeur` |
|---|---:|---|
| ITEMS | 537 | objet `{ id, image, name, qte }` |
| TEXTE | 512 | chaîne |
| QUEST | 471 | objet quête |
| HTML | 373 | chaîne avec markup historique possible |
| QUEST_START | 235 | objet quête |
| QUEST_FINISH | 183 | objet quête |
| IMAGE | 165 | URL sous forme de chaîne |
| DUNGEON | 113 | objet `{ id, image, lien, name, success }` |
| CAC | 44 | chaîne |
| TRAVEL | 39 | objet `{ label, link, map }` |
| LIEN | 20 | objet `{ label, link }` |

`MONSTER` fait partie des types connus du client historique mais n’apparaît pas dans les archives actuelles. Un futur type est classé `UNKNOWN`, signalé par l’audit et doit rester rendu inspectable.

## Sous-types et quêtes

Les 889 occurrences de quête contiennent toutes une position. Leur `valeur.type` se répartit ainsi :

| Sous-type | Occurrences |
|---|---:|
| QUEST | 322 |
| QUEST_START | 209 |
| QUEST_FINISH | 158 |
| ALI | 90 |
| TDM | 59 |
| ALI_START | 26 |
| ALI_FINISH | 25 |

Les relations de guide `START`, `ACTIVE` et `FINISH` sont dérivées de `element.type`. Elles sont distinctes des futurs états de progression utilisateur. `position_start` contient `cmd`, `map` et `position` sous forme de chaînes. Deux positions utilisent un espace plutôt qu’une virgule ; le normalizer les accepte sans modifier leur représentation brute.

Les 113 donjons ont chacun quatre succès structurés avec `id`, `nom` et `description`.

## Positions, polices et markup

- Tous les éléments possèdent `pos_x` et `pos_y` ; 1 114 possèdent aussi `hauteur` et `largeur`.
- 116 coordonnées sont encodées comme chaînes numériques. La couche normalisée les convertit, le brut les conserve.
- `font` est un objet sur 944 éléments et `null` sur 1 748. Les objets observés utilisent `bold`, `color`, `family`, `italic`, `size` et `underline`.
- 370 chaînes contiennent 936 balises `<fc=R,G,B>…</fc=R,G,B>`, toutes équilibrées. Aucun autre dialecte de markup n’a été observé.
- Ce markup n’est pas du HTML et ne doit jamais être rendu avec `dangerouslySetInnerHTML`.

## Chapitres et niveaux

32 chapitres numérotés sont détectables à partir des éléments `TEXTE`. Les tranches utilisent principalement `lvl N à M`. À partir de l’étape 269, la forme `lvl 200` est interprétée conservativement comme `200–200`.

Les étapes 253 à 264 sont des sous-séquences du chapitre 23 : un titre intermédiaire ne doit pas être confondu avec un nouveau chapitre. La détection d’un chapitre exige donc un préfixe numérique explicite ; en cas d’échec, les champs dérivés restent `null`.

## Cas réels de référence

- Étape 1 : introduction `TEXTE`, `HTML` et série d’images.
- Étape 18 : chapitre, tranche 20–50 et équipement illustré.
- Étape 28 : quêtes actives et quêtes à lancer avec PNJ, positions et conseils.
- Étape 37 : chapitre 3, quête d’alignement et instruction importante.
- Étape 54 : donjon, succès, quête à rendre et quêtes à lancer.
- Étapes 6, 12 et 16 : couverture complémentaire de `ITEMS`, `DUNGEON`, `CAC`, `LIEN` et `TRAVEL`.
