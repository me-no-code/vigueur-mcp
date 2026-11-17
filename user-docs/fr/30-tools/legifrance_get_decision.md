---
title: "legifrance_get_decision"
level: reference
tags: [tool, legifrance, case-law, read]
summary: "Lire une décision de Légifrance à partir de son identifiant, avec son identité, son lien officiel et son texte intégral, page par page."
updated: 2026-11-17
---

# legifrance_get_decision

Lit une décision détenue par Légifrance : son identité, son lien officiel, les libellés que la source enregistre et le texte intégral, mot pour mot.

## Ce que vous pouvez demander

- « Lis la décision JURITEXT000053197030. » / « Read decision JURITEXT000053197030. »
- « Montre-moi le texte complet de la décision du Conseil constitutionnel trouvée plus haut. » / « Show me the full text of the Conseil constitutionnel decision found above. »
- « Continue la lecture de cette décision. » / « Continue reading that decision. » (Claude demande la page suivante.)

L'identifiant vient normalement de [`legifrance_search_case_law`](legifrance_search_case_law.md).

## Ce qu'il faut fournir

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `id` | Oui | L'identifiant Légifrance de la décision. | `JURITEXT`, `CETATEXT`, `CONSTEXT`, `CNILTEXT` ou `JUFITEXT` suivi de 12 chiffres, par exemple `JURITEXT000053197030`. Les identifiants Judilibre (24 caractères hexadécimaux) relèvent de [`judilibre_get_decision`](judilibre_get_decision.md). | Aucun |
| `offset` | Non | Où reprendre un texte long, en caractères. La page précédente indique quelle valeur utiliser. | Un nombre entier, 0 ou plus | 0 |

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés, et `…` marque les champs ou le texte omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `found` ou `not_found`.

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [
    "Same decision on Judilibre (usually earlier, with zones)."
  ],
  "id": "JURITEXT000053197030",
  "ecli": "ECLI:FR:CCASS:2025:SO01200",
  "link": "https://www.legifrance.gouv.fr/juri/id/JURITEXT000053197030",
  "title": "Cour de cassation, civile, Chambre sociale, 17 décembre 2025, 24-16.924, Inédit",
  "court": "Cour de cassation",
  "chamber": "Chambre sociale",
  "nature": "ARRET",
  "decided": "2025-12-17",
  "numbers": [
    "24-16.924"
  ],
  "publication": "Inédit",
  "solution": "Cassation",
  "legifrance_status": null,
  "published": null,
  "attacked": {
    "court": "Cour d'appel de Bordeaux",
    "decided": "2024-05-29"
  },
  "constitutional_council_link": null,
  "jo_link": null,
  "summary": null,
  "part": null,
  "next": null,
  "text": "LA COUR DE CASSATION, CHAMBRE SOCIALE, a rendu l'arrêt suivant :\nSOC.\nZB1\nCOUR DE CASSATIO…",
  "other_source": {
    "tool": "judilibre_search_decisions",
    "query": "ECLI:FR:CCASS:2025:SO01200"
  },
  "request": {
    "tool": "legifrance_get_decision",
    "id": "JURITEXT000053197030",
    "offset": 0
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

| Champ | Ce qu'il contient |
|---|---|
| `id`, `ecli`, `link` | L'identifiant Légifrance, l'ECLI (`null` s'il n'y en a pas) et la page officielle, construite par Vigueur à partir de l'identifiant. |
| `title` | Le titre tel que Légifrance l'écrit, coupé à 300 caractères. |
| `court`, `chamber`, `nature` | La juridiction, la chambre ou la formation et la nature de l'acte, tels que la source les indique ; chacun vaut `null` s'il n'est pas donné. |
| `decided`, `numbers` | La date de la décision et les numéros de la décision. |
| `publication`, `solution` | Comment la source enregistre la publication et la solution ; `null` quand elle n'en donne aucune. |
| `legifrance_status`, `published` | Pour une délibération de la CNIL, le libellé de statut de Légifrance et la date de publication ; `null` sinon. |
| `attacked` | La décision attaquée (`court` et date `decided`), quand la source l'indique ; `null` sinon. |
| `constitutional_council_link`, `jo_link` | Pour une décision du Conseil constitutionnel, sa page sur conseil-constitutionnel.fr et son lien vers le Journal officiel ; `null` sinon. |
| `summary` | Le [sommaire](../00-intro/03-glossary.md), coupé s'il est long ; `null` quand il n'y en a pas et sur chaque page après la première. |
| `part`, `next` | `null` quand le texte est entier. Voir « Textes longs » ci-dessous. |
| `text` | Le texte de la décision, mot pour mot. Les noms sont pseudonymisés par la source. |
| `other_source` | Sur la dernière page d'une décision judiciaire ayant un ECLI, l'appel qui trouve la même décision sur Judilibre ; `null` sinon. Un avertissement dit la même chose : `Same decision on Judilibre (usually earlier, with zones).` |

Une décision du Conseil constitutionnel remplit ses propres champs :

```
{
  …
  "outcome": "found",
  …
  "id": "CONSTEXT000054952962",
  "ecli": "ECLI:FR:CC:2026:2026.1217.1218.QPC",
  "link": "https://www.legifrance.gouv.fr/cons/id/CONSTEXT000054952962",
  "title": "Décision 2026-1217/1218 QPC - 06 août 2026 - M. Bruno N. et M. Joseph A. [Absence d'indemn…",
  "court": "Conseil constitutionnel",
  …
  "nature": "QPC",
  "decided": "2026-08-06",
  "numbers": [
    "2026-1217/1218"
  ],
  …
  "solution": "Non conformité totale",
  …
  "constitutional_council_link": "https://www.conseil-constitutionnel.fr/decision/2026/20261217_1218QPC.htm",
  "jo_link": "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054633588",
  …
  "text": "LE CONSEIL CONSTITUTIONNEL A ÉTÉ SAISI le 17 juin 2026 par la Cour de cassation (chambre s…",
  …
}
```

**Textes longs.** Une page contient au plus 40 000 caractères. Quand le texte est coupé, `part` donne les caractères affichés (`from`, `to`, et `of`, la longueur du texte) et `next` donne `{ "offset": <number> }`, là où le reste commence. Quand il ne reste rien, `next` vaut `null`. Demandez à Claude de continuer, et il transmet ce décalage. Les champs d'identité se répètent sur chaque page ; le sommaire n'apparaît que sur la première.

**Introuvable.** C'est une réponse normale, pas une erreur. Le type de réponse est `not_found`, `id` répète l'identifiant, et `warnings` dit quoi faire :

```
{
  "source": "Légifrance",
  "outcome": "not_found",
  "warnings": [
    "No Légifrance decision with id \"JURITEXT000099999999\".",
    "Find decisions with legifrance_search_case_law.",
    …
  ],
  "id": "JURITEXT000099999999",
  …
}
```

Le troisième avertissement, la note sur la couverture, n'apparaît que pour un identifiant `JURITEXT` (voir Limites).

**Erreurs de saisie.**

- Un identifiant de mauvaise forme : `"…" is not a Légifrance decision id (JURITEXT…, CETATEXT…, CONSTEXT…, CNILTEXT…, JUFITEXT… + 12 digits). Judilibre ids (24 hexadecimal characters) go to judilibre_get_decision.`
- Un décalage situé à la fin du texte ou au-delà : `"offset" {offset} is past the end of the text ({length} characters).`

Les erreurs de la source (identifiants, quota, indisponibilité, pas de réponse en 45 secondes) sont des réponses d'erreur (`outcome: "error"`, avec un `kind` et un `message` ; voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)).

## Limites

> **Le texte est celui de la source, pas celui de Vigueur**
> Le texte de Légifrance peut comporter des défauts d'encodage (observé en novembre 2026 : un caractère parasite à la place d'un tiret). Vigueur ne le corrige pas.

- Seuls les cinq fonds de [`legifrance_search_case_law`](legifrance_search_case_law.md) sont lus ici. Une décision absente de Légifrance, par exemple un rejet non spécialement motivé de la Cour de cassation, se lit sur Judilibre.
- Le lien officiel est construit à partir de l'identifiant. Vigueur ne peut pas vérifier que la page s'ouvre : le site de Légifrance a refusé les vérifications automatisées (observé en novembre 2026).
- Un sommaire long est coupé pour tenir dans la page ; le sommaire complet n'est pas disponible par morceaux.
- Vigueur ne résume, ne compare ni n'interprète les décisions.

## Voir aussi

- [`legifrance_search_case_law`](legifrance_search_case_law.md) : trouver l'identifiant.
- [`judilibre_get_decision`](judilibre_get_decision.md) : lire la même décision de la Cour de cassation avec ses zones.
- [Jurisprudence](../20-using/03-case-law.md)
- [Légifrance](../40-sources/01-legifrance.md)
