---
title: "judilibre_get_decision"
level: reference
tags: [tool, judilibre, case-law, read]
summary: "Lire une décision de Judilibre, entière ou par partie (zone), avec son sommaire, son visa et sa décision attaquée, page par page."
updated: 2026-11-18
---

# judilibre_get_decision

Lit une décision de Judilibre : son identité, son lien officiel, les libellés et le sommaire que la source enregistre, et le texte intégral mot pour mot. Pour une décision de la Cour de cassation, l'outil peut ne renvoyer qu'une partie du texte.

## Ce que vous pouvez demander

- « Lis l'arrêt trouvé ci-dessus. » / « Read the decision found above. »
- « Montre-moi seulement le dispositif de cet arrêt. » / « Show me only the operative part ([*dispositif*](../00-intro/03-glossary.md)) of this decision. »
- « Quelle est la décision attaquée ? » / « What is the attacked decision? »
- « Continue la lecture. » / « Continue reading. » (Claude demande la page suivante.)

L'identifiant vient normalement de [`judilibre_search_decisions`](judilibre_search_decisions.md), ou du champ `attacked` d'une autre décision.

## Ce qu'il faut fournir

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `id` | Oui | L'identifiant Judilibre de la décision. | 24 caractères hexadécimaux. Les identifiants Légifrance (`JURITEXT…`) relèvent de [`legifrance_get_decision`](legifrance_get_decision.md). | Aucun |
| `zone` | Non | Ne renvoyer que cette partie de la décision, quand la source marque des zones. | `introduction`, `expose`, `moyens`, `motivations`, `dispositif`, `annexes` | Le texte intégral |
| `offset` | Non | Où reprendre un texte long, en caractères. La page précédente indique quelle valeur utiliser. | Un nombre entier, 0 ou plus | 0 |

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés, et `…` marque le texte omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `found` ou `not_found`.

```
{
  "source": "Judilibre",
  "outcome": "found",
  "warnings": [
    "other_source searches Légifrance for this decision's ECLI."
  ],
  "id": "6a0e9ff1cdc6046d47668703",
  "ecli": "ECLI:FR:CCASS:2026:C210500",
  "link": "https://www.courdecassation.fr/decision/6a0e9ff1cdc6046d47668703",
  "title": "Cour de cassation, Deuxième chambre civile — decision of 2026-05-21 — n° 23-20.348 — ECLI:…",
  "jurisdiction": "cc",
  "location": null,
  "chamber": "Deuxième chambre civile",
  "decided": "2026-05-21",
  "numbers": [
    "23-20.348"
  ],
  "formation": "Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)",
  "publication": [],
  "solution": "Rejet non spécialement motivé",
  "source_updated": "2026-05-29",
  "attacked": {
    "title": "Cour d'appel de Paris, B1",
    "number": "22/10744",
    "decided": "2023-06-22",
    "read_with": {
      "tool": "judilibre_get_decision",
      "id": "64953aa7aa086705db6f12ef"
    }
  },
  "summary": null,
  "titles": [],
  "visa": [],
  "rapprochements": [],
  "files": [],
  "zones": [
    "introduction",
    "motivations",
    …
  ],
  "zone": null,
  "part": null,
  "next": null,
  "text": "CIV. 2\n \n MC22\n \n \n \n COUR DE CASSATION\n ______________________\n \n \n Arrêt du 21 mai 2026…",
  "other_source": {
    "tool": "legifrance_search_case_law",
    "collection": "judicial",
    "ecli": "ECLI:FR:CCASS:2026:C210500"
  },
  "request": {
    "tool": "judilibre_get_decision",
    "id": "6a0e9ff1cdc6046d47668703",
    "offset": 0
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

| Champ | Ce qu'il contient |
|---|---|
| `id`, `ecli`, `link` | L'identifiant Judilibre, l'ECLI (`null` s'il n'y en a pas) et la page officielle, construite par Vigueur à partir de l'identifiant. |
| `title` | Une ligne avec la juridiction, la chambre, la date de la décision, les numéros et l'ECLI. |
| `jurisdiction`, `location`, `chamber` | La clé Judilibre de la juridiction (`cc`, `ca`, `tj`, `tcom`, `cph`), la juridiction précise à l'intérieur, et la chambre ; `location` et `chamber` valent `null` s'ils ne sont pas donnés. |
| `decided`, `numbers`, `source_updated` | La date de la décision, les numéros de la décision, et la date de dernière mise à jour de la décision par Judilibre (`null` quand elle n'est pas donnée). |
| `formation`, `publication`, `solution` | La formation, la manière dont la Cour de cassation a publié la décision (une liste, vide quand elle n'est pas publiée au Bulletin) et la solution. |
| `attacked` | La décision attaquée : son `title`, son `number`, sa date `decided`, et `read_with`, l'appel qui la lit quand Judilibre la détient (sinon `null`). `null` quand la source ne l'indique pas. |
| `summary`, `titles`, `visa`, `rapprochements`, `files` | Le sommaire, ses titres, le visa, les rapprochements et les fichiers joints (`name`, `type`, `link` ; `link` vaut `null` quand le lien donné par la source n'est pas un lien https vers le stockage de fichiers ou le site de Judilibre). Ils ne sont donnés que sur la première page : sur chaque page suivante, le sommaire vaut `null` et les listes sont vides. |
| `zones` | Les zones que la source marque dans le texte ; vide quand il n'y en a pas. |
| `zone` | La zone à laquelle le texte affiché est limité ; `null` pour la décision entière. |
| `part`, `next` | `null` quand le texte est entier. Voir « Textes longs » ci-dessous. |
| `text` | Le texte de la décision, mot pour mot. Les noms sont pseudonymisés par la source. |
| `other_source` | Sur la dernière page d'une décision de la Cour de cassation ayant un ECLI, l'appel qui cherche l'ECLI de cette décision sur Légifrance ; `null` sinon. Un avertissement dit la même chose : `other_source searches Légifrance for this decision's ECLI.` La recherche peut ne rien trouver. |

**Zones.** La source découpe les décisions de la Cour de cassation en parties : `introduction`, `expose`, `moyens`, `motivations`, `dispositif` et parfois `annexes`. Demandez-en une avec `zone` ; `zone` dans la réponse la nomme alors et `text` contient cette partie. Quand une partie apparaît à plusieurs endroits du texte, les morceaux sont joints par une ligne contenant `[…]`.

```
{
  …
  "outcome": "found",
  "warnings": [
    "other_source searches Légifrance for this decision's ECLI."
  ],
  …
  "zones": [
    "introduction",
    "motivations",
    …
  ],
  "zone": "dispositif",
  "part": null,
  "next": null,
  "text": "PAR CES MOTIFS, la Cour :\n \n REJETTE le pourvoi ;\n \n Condamne La Maison de poésie aux dépe…",
  "other_source": {
    "tool": "legifrance_search_case_law",
    "collection": "judicial",
    "ecli": "ECLI:FR:CCASS:2026:C210500"
  },
  …
}
```

**Quand la zone demandée est absente**, le texte intégral est affiché et un avertissement en donne la raison, de l'une de ces manières :

- `This decision has no "motivations" zone; showing the full text.` (la décision a des zones, mais pas celle-là)
- `This decision has no zone markup, so no "motivations" zone; showing the full text.`

Sans `zone`, une décision sans balisage indique `This decision has no zone markup; showing the full text.`

**Textes longs.** Une page contient au plus 40 000 caractères. Quand le texte est coupé, `part` donne les caractères affichés (`from`, `to`, et `of`, la longueur du texte) et `next` donne `{ "offset": <number> }`, là où le reste commence. Quand il ne reste rien, `next` vaut `null`. Demandez à Claude de continuer, et il transmet ce décalage. La pagination fonctionne aussi à l'intérieur d'une zone. Les longues listes de la première page (titres, visa, rapprochements, fichiers) montrent jusqu'à 30 éléments, chacun coupé à 500 caractères, puis un avertissement tel que `Titles: (+2 more)` ou `Files: (+3 more)` ; quand l'en-tête de la page prendrait la place du texte, Vigueur raccourcit d'abord les listes et le sommaire.

**Introuvable.** C'est une réponse normale, pas une erreur. Le type de réponse est `not_found`, `id` répète l'identifiant, et `warnings` dit quoi faire :

```
{
  "source": "Judilibre",
  "outcome": "not_found",
  "warnings": [
    "No Judilibre decision with id \"000000000000000000000000\".",
    "Find decisions with judilibre_search_decisions (a pourvoi number or ECLI works as the query)."
  ],
  "id": "000000000000000000000000",
  …
}
```

**Erreurs de saisie.**

- Un identifiant de mauvaise forme : `"…" is not a Judilibre decision id (24 hexadecimal characters). Légifrance ids (JURITEXT…, CETATEXT…) go to legifrance_get_decision.`
- Un décalage situé à la fin du texte ou au-delà : `"offset" {offset} is past the end of the text ({length} characters).`

Les erreurs de la source (identifiants, quota, indisponibilité, pas de réponse en 45 secondes) sont des réponses d'erreur (`outcome: "error"`, avec un `kind` et un `message` ; voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)).

## Limites

> **Toutes les décisions n'ont pas de zones**
> Les décisions sans balisage montrent leur texte intégral même quand vous demandez une zone. Dans les réponses observées (novembre 2026), une décision non publiée et une ancienne décision du Bulletin n'en avaient pas, et la décision de cour d'appel observée avait des zones mais pas de zone `moyens`.

- Le lien officiel est construit à partir de l'identifiant. Vigueur ne peut pas vérifier que la page s'ouvre : le site de la Cour de cassation a refusé les vérifications automatisées (observé en novembre 2026).
- Le texte est celui de la source. Les zones en marquent des parties ; Vigueur ne le réécrit ni ne le résume.
- Vigueur rapporte ce que Judilibre enregistre. Il ne vous dit pas ce qu'une décision signifie pour votre cas.

## Voir aussi

- [`judilibre_search_decisions`](judilibre_search_decisions.md) : trouver l'identifiant.
- [`legifrance_get_decision`](legifrance_get_decision.md) : la même décision de la Cour de cassation telle que Légifrance la détient, et les autres juridictions.
- [Jurisprudence](../20-using/03-case-law.md)
- [Judilibre](../40-sources/02-judilibre.md)
