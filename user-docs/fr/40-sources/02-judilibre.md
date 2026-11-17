---
title: "Judilibre"
level: reference
tags: [sources, judilibre, case-law, cour-de-cassation]
summary: "Sachez ce que détient Judilibre, comment se comportent sa recherche et ses zones, quels filtres fonctionnent et quelles particularités ont été observées à la source."
updated: 2026-11-17
---

# Judilibre

Judilibre est la base de décisions de justice que la Cour de cassation diffuse en données ouvertes.
Vigueur la lit par la passerelle PISTE ([PISTE](03-piste.md)) avec
[`judilibre_search_decisions`](../30-tools/judilibre_search_decisions.md),
[`judilibre_get_decision`](../30-tools/judilibre_get_decision.md) et
[`judilibre_list_taxonomy`](../30-tools/judilibre_list_taxonomy.md). Les observations de cette page
sont datées : elles décrivent la source en novembre 2026 et peuvent changer.

## Ce que détient Judilibre

| Juridictions | Clé | Décision la plus récente observée | Décision la plus ancienne observée | Volume observé |
|---|---|---|---|---|
| Cour de cassation | `cc` | 12 novembre 2026 | 1860 | environ 570 000 décisions |
| Cours d'appel | `ca` | 3 novembre 2026 | voir la note | environ 650 000 |
| Tribunaux judiciaires | `tj` | 5 novembre 2026 | 14 décembre 2023 | environ 780 000 |
| Tribunaux de commerce | `tcom` | 4 novembre 2026 | 31 décembre 2024 | environ 210 000 |
| Conseils de prud'hommes | `cph` | 3 novembre 2026 | 1er octobre 2026 | environ 1 000 |

Note : les statistiques de la source donnent pour les cours d'appel une date la plus ancienne
impossible (l'année 201), une erreur de données. Ne la prenez pas pour le début de la couverture.

- Judilibre ne détient que les décisions de la Cour de cassation et des juridictions du fond de l'ordre
  judiciaire.
  Le Conseil d'État, le Conseil constitutionnel, la CNIL et les juridictions financières sont sur
  Légifrance ([Légifrance](01-legifrance.md)).
- **À jour.** Observé : une décision de la Cour de cassation datée du 10 novembre 2026 était déjà sur
  Judilibre le jour même. Légifrance ne reçoit ces décisions que des semaines plus tard, et pas toutes.
- **Types de décisions.** Judilibre classe les décisions en [arrêt](../00-intro/03-glossary.md), demande
  d'avis (avis), QPC, ordonnance, saisie ou autre. Observé : toutes les décisions de la Cour de
  cassation observées à partir de 2021 étaient classées « autre » ; le type n'est donc pas un filtre utile et
  Vigueur ne l'affiche ni ne le propose.
- **Rejets non spécialement motivés.** Judilibre détient les rejets non spécialement motivés et les
  non-admissions de la Cour de cassation, que Légifrance ne détient pas. Ils portent la formation
  `Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)` et la solution
  `Rejet`.
- **Identifiants.** Un identifiant de décision Judilibre compte 24 caractères hexadécimaux. Un
  identifiant inconnu et un identifiant mal formé reçoivent la même réponse de la source ; Vigueur
  vérifie lui-même la forme et le signale.
- **La même décision dans Légifrance.** Une décision de la Cour de cassation détenue par les deux porte
  le même ECLI ; la dernière page de la décision contient un champ `other_source` avec l'appel qui recherche
  cet ECLI dans Légifrance.

## À quoi ressemble une décision

- **Pseudonymisée.** La source remplace les noms et adresses des parties par des marqueurs tels que
  `[M]`, `[T]`, `[Adresse 1]`. Les noms des magistrats et des avocats apparaissent tels qu'ils figurent
  dans la décision.
- **En-tête dans le texte.** Un texte de la Cour de cassation s'ouvre par son en-tête : la chambre, le
  numéro de l'arrêt et un code tel que `F-D` ou `FS-B`. Ce code (formation et publication) ne se trouve
  que dans le texte.
- **Solution abrégée et complète.** Dans les résultats de recherche, la solution est la catégorie de
  Judilibre (`Cassation`). La page de la décision montre le libellé complet quand la source le donne
  (`Cassation partielle sans renvoi`).
- **Numéros.** Judilibre peut répéter plusieurs fois les numéros d'une décision (observé) ; Vigueur
  liste chacun une seule fois.
- **Dates.** La date de la décision est une date sans heure. L'horodatage de la source tombe la veille pour
  certaines décisions ; Vigueur ne l'utilise jamais.
- **Publication.** Une décision de la Cour de cassation sans aucune publication a une liste
  `publication` vide (non publiée au Bulletin). Les autres publications sont le Rapport, les Lettres de
  chambre et les communiqués.
- **Sommaire, titres, visa, rapprochements.** La Cour de cassation donne, pour certaines décisions, un
  sommaire, des titres, les textes cités (visa) et des décisions liées (rapprochements). Beaucoup de
  décisions n'en ont aucun.
- **Fichiers joints.** Certaines décisions portent des documents préparatoires (un rapport, un avis).
  La réponse sur la décision liste chaque fichier dans `files`, avec son nom, son type et son adresse.
- **Cours d'appel et tribunaux.** Leurs chambres et leurs solutions sont du texte libre, non des listes.
  Les décisions de cour d'appel et de tribunal judiciaire observées ne portaient pas d'ECLI. Le numéro d'une
  décision de cour d'appel est son numéro RG, tel que `22/10744`.

## Zones

Pour de nombreuses décisions, Judilibre balise le texte en zones : `introduction`, `expose`, `moyens`,
`motivations`, `dispositif`, parfois `annexes`. Une zone peut venir en plusieurs morceaux ; les
morceaux s'entrelacent (les moyens et les motivations alternent).

**Décisions sans zones.** Observé : une décision non publiée de 2025 et une ancienne décision publiée au
Bulletin (2012) n'avaient pas de zones ; les décisions publiées au Bulletin et les décisions de cour
d'appel en avaient. La décision de cour d'appel observée n'avait pas de zone `moyens`. Quand vous
demandez une zone qu'une décision n'a pas, Vigueur montre le texte entier et le dit.

## Comportement de la recherche

- **Les mots de recherche sont obligatoires.** Sans eux, Judilibre répond « aucune décision », non une
  erreur. Vigueur refuse une recherche vide et explique pourquoi.
- **Tous les mots par défaut.** Si on ne lui précise rien, Judilibre retient n'importe lequel des mots,
  ce qui donne des résultats énormes et pleins de bruit (observé : une recherche de deux mots a renvoyé des dizaines de
  milliers de décisions là où l'expression exacte en renvoyait 568). Vigueur demande par défaut tous les
  mots. Les trois modes sont `all_words`, `any_word` et `exact_phrase`.
- **Numéro et ECLI.** Un numéro de pourvoi ou un ECLI dans `query` permet de trouver la décision. Toute
  graphie d'un numéro de pourvoi fonctionne (`24-16.924`, `2416924`, `24-16924`, `n° 24-16.924`). La source
  traite le numéro comme un filtre, si bien que le résultat n'a ni score de pertinence ni surlignage.
- **Juridiction par défaut.** Sans `jurisdiction`, la recherche porte sur la Cour de cassation, numéros
  et ECLI compris.
- **Recherches élargies.** Quand rien ne correspond et que la source relance une recherche plus large,
  Vigueur dit que les résultats ne correspondent qu'à certains des mots (`relaxed` vaut `true`).
- **Extraits.** La source marque les mots qui correspondent ; Vigueur les montre entre `**`.
- **Ordre.** `newest` et `oldest` trient par date de décision. La source ignore un tri si on ne lui
  indique pas aussi le sens du tri ; Vigueur le lui indique toujours.
- **Pagination.** La source ne permet de parcourir que les 10 000 premiers résultats, et refuse
  au-delà. Vigueur le vérifie avant de demander, et vous invite à restreindre la recherche. Vigueur montre au plus 20 décisions par
  page ; la source en accepte davantage.
- **Dates.** `date_from` et `date_to` filtrent sur la date de la décision et doivent être au format ISO ;
  la source refuse `13/11/2026`.

## Filtres

| Filtre | À la source | Ce que fait Vigueur |
|---|---|---|
| `chamber`, `formation`, `publication`, `solution` | Significatifs pour la Cour de cassation seulement | Proposés pour `cc` seulement ; refusés avec une explication pour une autre juridiction |
| `location` | Cours d'appel et tribunaux (36 cours d'appel) | Proposé pour `ca`, `tj`, `tcom`, `cph` ; refusé pour `cc` |
| `type` | Écarte les décisions récentes de la Cour de cassation (elles sont typées « autre ») : un filtre par arrêt n'a rien renvoyé | Non proposé |
| `theme` | N'a rien renvoyé, même pour le thème propre d'une décision | Non proposé ; `search_in` `themes` cherche plutôt dans le texte des thèmes |
| Tri sans sens précisé | Ignoré sans avertissement | Toujours envoyé avec un sens de tri |
| Filtres sur les fichiers joints et sur l'« intérêt particulier » | Acceptés, mais un essai n'a rien renvoyé | Non proposés |

Les clés des listes de la source ne sont pas toujours les noms que la recherche accepte :
`judilibre_search_decisions` utilise les noms de Vigueur pour les chambres et les publications. Voir
[`judilibre_list_taxonomy`](../30-tools/judilibre_list_taxonomy.md).

## Particularités

- **La recherche par numéro de cour d'appel est approximative.** Avec `jurisdiction` `ca`, un numéro tel
  que `22/10744` a renvoyé des décisions qui n'en partageaient qu'une partie : le même numéro d'ordre
  d'autres années (`21/10744`, `19/10744`, `23/10744`) ou la même année avec un autre numéro d'ordre.
  La décision exacte en faisait partie. Vérifiez les numéros dans la réponse.
- **Orthographe des thèmes.** Les thèmes dans les résultats de recherche sont en minuscules et sans
  accents, contrairement aux listes de thèmes.
- **Les listes des cours d'appel reprennent celles de la Cour de cassation.** Quand on lui demande les
  chambres des cours d'appel, la source renvoie la liste de la Cour de cassation, qui ne peut pas les
  décrire. Vigueur indique à la place qu'il s'agit de texte libre.

## Liens

La page officielle d'une décision est `courdecassation.fr/decision/` suivi de son identifiant. Vigueur
construit le lien à partir de l'identifiant : le site répond aux requêtes automatisées par un test
anti-robot en script, si bien que le lien ne peut pas être vérifié.

## Voir aussi

- [Jurisprudence](../20-using/03-case-law.md)
- [Légifrance](01-legifrance.md)
- [PISTE](03-piste.md)
