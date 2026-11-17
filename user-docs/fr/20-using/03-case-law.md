---
title: "Jurisprudence"
level: guide
tags: [case-law, judilibre, legifrance, decisions]
summary: "Choisissez entre Légifrance et Judilibre, trouvez une décision par son numéro, son ECLI ou des mots, et lisez-la en entier ou par zone."
updated: 2026-11-17
---

# Jurisprudence

Vigueur lit la jurisprudence dans deux sources. Elles se recoupent pour la Cour de cassation, mais
aucune ne détient tout ce que détient l'autre. Ce guide vous indique laquelle interroger, comment trouver
une décision et comment la lire. Vous n'avez pas à choisir : dites ce que vous voulez et Claude
choisit. Connaître la différence vous aide à lire la réponse.

## Les deux sources

| | Légifrance | Judilibre |
|---|---|---|
| Outil pour trouver | [`legifrance_search_case_law`](../30-tools/legifrance_search_case_law.md) | [`judilibre_search_decisions`](../30-tools/judilibre_search_decisions.md) |
| Outil pour lire | [`legifrance_get_decision`](../30-tools/legifrance_get_decision.md) | [`judilibre_get_decision`](../30-tools/judilibre_get_decision.md) |
| Cour de cassation | Une partie de ses décisions | Ses décisions |
| Cours d'appel et juridictions du premier degré | Certaines cours d'appel | Cours d'appel, tribunaux judiciaires, tribunaux de commerce, conseils de prud'hommes |
| Conseil d'État et juridictions administratives | Oui | Non |
| Conseil constitutionnel, CNIL, juridictions financières | Oui | Non |
| [Zones](../00-intro/03-glossary.md#zone) de la décision (introduction, moyens, motivations, dispositif…) | Non | Oui, quand la source les balise |
| Tri du plus ancien au plus récent | Non | Oui |

### Ce qui manque sur Légifrance

Vigueur le rappelle à chaque recherche dans le fonds judiciaire de Légifrance, par une phrase dans `warnings` :

```
"Note: Légifrance does not hold every Cour de cassation decision (in particular not its unreasoned rejections and non-admissions, formation restreinte RNSM/NA), receives the ones it holds weeks after Judilibre, and holds no appeal-court decisions after early 2023. For a recent, unreasoned or appeal-court decision, use judilibre_search_decisions."
```

En clair : pour une décision récente, une décision non spécialement motivée
([rejet non spécialement motivé, non-admission](../00-intro/03-glossary.md#rnsmna)) ou une décision de
cour d'appel, Judilibre est la source à interroger.

> **Une décision absente n'est pas une décision inexistante**
> Si Légifrance ne renvoie rien pour une décision de la Cour de cassation ou d'une cour d'appel,
> demandez à Claude d'essayer Judilibre avant d'en conclure quoi que ce soit.

### Ce qui manque sur Judilibre

Judilibre ne détient que les décisions de la Cour de cassation et des juridictions judiciaires du
fond. Le Conseil
d'État, le Conseil constitutionnel, la CNIL et les juridictions financières sont sur Légifrance.
Judilibre exige des mots de recherche, un numéro ou un ECLI : il ne peut pas lister des décisions sans
critère de recherche.

Les fonds de Légifrance, quand vous en demandez un : *judicial* (Cour de cassation et certaines cours
d'appel), *administrative* (Conseil d'État, cours administratives d'appel, tribunaux administratifs),
*constitutional*, *cnil* et *financial* (Cour des comptes et chambres régionales et territoriales des
comptes).

## Trouver une décision

Vous pouvez chercher de trois façons.

**Par numéro.** Un numéro de [pourvoi](../00-intro/03-glossary.md#pourvoi) fonctionne quelle que soit
sa graphie (`24-16.924`, `2416924`) :

> Décision du Conseil constitutionnel 2026-1217 QPC. / Find pourvoi 24-16.924.

Sur Judilibre, donnez le numéro comme mots de recherche. Sur Légifrance, le numéro a son propre champ
et accepte aussi les numéros du Conseil d'État, de la CNIL, du Conseil constitutionnel et de la Cour
des comptes. Une décision du Conseil constitutionnel rendue sur des affaires jointes porte un numéro
combiné tel que `2026-1217/1218` ; si vous ne donnez que l'un des deux numéros et que rien ne
correspond, la réponse vous rappelle la forme combinée.

**Par ECLI.**

> Trouve ECLI:FR:CCASS:2025:SO01200.

**Par mots.**

> Décisions de la Cour de cassation sur la « clause de non-concurrence » depuis 2024.

Sur Judilibre, vous choisissez comment les mots se combinent : tous (par défaut), n'importe lequel, ou
une expression exacte. Quand Judilibre ne trouve aucune correspondance exacte, il peut élargir la
recherche : la réponse contient alors `"relaxed": true` et un avertissement, `Judilibre found no exact match and loosened the search: these results match only some of the words.` Sur Légifrance,
tous les mots doivent apparaître.

Vous pouvez restreindre une recherche par dates de décision, type de juridiction, chambre de la Cour
de cassation et publication, sur les deux sources. Sur Judilibre, vous pouvez aussi filtrer par
formation, solution et lieu de la juridiction, et chercher dans une seule partie de la décision : les
moyens, la motivation, le sommaire, etc. Demandez à Claude les valeurs qu'accepte un filtre :
[`judilibre_list_taxonomy`](../30-tools/judilibre_list_taxonomy.md) liste celles de Judilibre.

Les résultats sont découpés en pages de 10 par défaut (jusqu'à 20). La réponse indique combien de
décisions correspondent (`results`), à quelle page vous êtes (`page`) et l'ordre de tri (`order`). Sur
Légifrance, vous pouvez trier par pertinence ou du plus récent au plus ancien ; sur Judilibre, aussi du
plus ancien au plus récent. Judilibre ne permet de parcourir que ses 10 000 premiers résultats ; un
avertissement le signale quand une recherche est plus large, et la restreindre permet d'atteindre
les autres.

Quand rien ne correspond, la réponse contient `"outcome": "no_results"` et ses avertissements répètent
vos critères. Sur Judilibre, elle suggère aussi des pistes : n'importe quel mot au lieu de tous,
moins de filtres, une autre juridiction, ou Légifrance. Sur le fonds judiciaire de Légifrance, elle
répète la note de couverture ci-dessus.

## Lire une décision

Chaque résultat porte un champ `read_with` qui indique à Claude comment le lire :

```
"read_with": { "tool": "judilibre_get_decision", "id": "6abcc10bc27382d099087409" }
"read_with": { "tool": "legifrance_get_decision", "id": "JURITEXT000053197030" }
```

Demandez à Claude de « la lire ». Les identifiants diffèrent selon la source : ceux de Judilibre ont 24
caractères hexadécimaux ; ceux de Légifrance sont `JURITEXT`, `CETATEXT`, `CONSTEXT`, `CNILTEXT` ou
`JUFITEXT` suivis de 12 chiffres.

Le texte est repris mot pour mot de la source. Les noms des personnes physiques sont pseudonymisés
par la source.

### Une seule zone d'une décision

Sur Judilibre, une décision est découpée en zones quand la source les balise : introduction,
expose, moyens, motivations, dispositif et annexes. Les décisions de la Cour de cassation
en portent ; les décisions de cour d'appel observées en novembre 2026 aussi, sans zone moyens.

> Donne-moi seulement le dispositif. / Show me only the motivations of that decision.

Toutes les décisions ne portent pas ce balisage. Quand la zone demandée manque, Vigueur le dit dans un
avertissement et montre le texte entier : `This decision has no "moyens" zone; showing the full text.` ou, pour une décision
sans aucun balisage, `This decision has no zone markup, so no "motivations" zone; showing the full
text.`

### Ce que montre la fiche d'une décision

Outre le `text`, la réponse donne ce que la source enregistre sur la décision, chaque élément dans son
propre champ :

| Champ | Signification |
|---|---|
| `title`, `court`, `chamber`, `decided`, `numbers`, `ecli` | Juridiction, chambre, date de la décision, numéros, ECLI |
| `formation`, `publication`, `solution`, `nature` | Sur Judilibre : formation, publication (une liste, vide pour une décision de la Cour de cassation non publiée au Bulletin) et solution (Rejet, Cassation partielle sans renvoi…). Sur Légifrance : nature, publication et solution telles que Légifrance les libelle (`ARRET`, `Inédit`, `Cassation`) |
| `attacked` | La décision attaquée par le pourvoi : sa juridiction et sa date, et sur Judilibre son numéro et, quand Judilibre la détient, l'appel qui permet de la lire |
| `summary` ([sommaire](../00-intro/03-glossary.md#sommaire)) | Le sommaire de la juridiction, quand il y en a un |
| `titles`, `visa`, `rapprochements`, `files` | Judilibre seulement, quand la décision en a |
| `zones`, `zone` | Judilibre seulement : les zones que porte la décision, et celle à laquelle le texte est limité |
| `constitutional_council_link`, `jo_link` | Pour les décisions du Conseil constitutionnel sur Légifrance |
| `legifrance_status` | Pour les délibérations de la CNIL, l'état juridique tel que Légifrance le libelle |

Un champ sans rien à montrer vaut `null` (ou une liste vide). Les longues décisions sont paginées :
`part` indique quels caractères sont affichés et `next` donne l'`offset` à partir duquel continuer, et
Claude continue à partir de là. Voir [Lire les réponses de Vigueur](05-reading-answers.md).

### Recouper avec l'autre source

Une décision de la Cour de cassation qui a un ECLI porte, sur sa dernière page, un champ `other_source`
qui contient la recherche permettant de la trouver dans l'autre source : sur Légifrance, la recherche
Judilibre (où elle figure en général plus tôt, avec ses zones) ; sur Judilibre, la recherche Légifrance (quand
Légifrance la détient, en général des semaines plus tard).

## Voir aussi

- [Lire les réponses de Vigueur](05-reading-answers.md)
- [Judilibre](../40-sources/02-judilibre.md) et [Légifrance](../40-sources/01-legifrance.md)
- [Glossaire](../00-intro/03-glossary.md) pour pourvoi, formation, moyens, dispositif
