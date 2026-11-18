---
title: "legifrance_search_case_law"
level: reference
tags: [tool, legifrance, case-law, search]
summary: "Chercher parmi les décisions détenues par Légifrance (juridictions judiciaires, administratives, constitutionnelle, CNIL et financières) et savoir ce que chaque réponse montre et omet."
updated: 2026-11-18
---

# legifrance_search_case_law

Cherche dans les fonds de jurisprudence de Légifrance par mots, numéro de décision ou ECLI, et liste les décisions trouvées avec leur lien officiel et l'identifiant qui permet de lire chacune.

## Ce que vous pouvez demander

- « Trouve l'arrêt de la Cour de cassation n° 24-16.924. » / « Find Cour de cassation decision 24-16.924. »
- « Cherche les décisions du Conseil constitutionnel de 2026 sur les congés payés. » / « Search Conseil constitutionnel decisions from 2026 about paid leave. »
- « Quelles sont les dernières délibérations de la CNIL ? » / « What are the latest CNIL deliberations? »
- « Cherche les décisions publiées de la chambre sociale entre le 1er janvier et le 30 juin 2025. » / « Find published social-chamber decisions between 1 January and 30 June 2025. »

## Ce qu'il faut fournir

Seul `collection` est obligatoire. Sans autre critère, l'outil liste les décisions les plus récentes de ce fonds.

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `collection` | Oui | Le fonds où chercher. | `judicial` (Cour de cassation et certaines cours d'appel), `administrative` (Conseil d'État, cours administratives d'appel, tribunaux administratifs), `constitutional` (Conseil constitutionnel), `cnil` (délibérations de la CNIL), `financial` (Cour des comptes et chambres régionales et territoriales des comptes) | Aucun |
| `query` | Non | Les mots à trouver dans la décision. Tous les mots doivent apparaître. | Texte libre | Aucun |
| `number` | Non | Un numéro de décision. Un « n° » en tête est retiré et le numéro est réécrit sous la forme où Légifrance l'enregistre. | [Pourvoi](../00-intro/03-glossary.md) `24-16.924` ou `2416924` ; Conseil d'État `400000` ; CNIL `2026-023` ; Conseil constitutionnel `2026-1217` (une nature en fin de numéro, comme `QPC`, est retirée ; une décision rendue sur des affaires jointes exige le numéro combiné `2026-1217/1218`) ; Cour des comptes `S-2026-1111` | Aucun |
| `ecli` | Non | Un identifiant européen de jurisprudence (*European Case Law Identifier*). Fonds judiciaire et administratif seulement. | Par exemple `ECLI:FR:CCASS:2025:SO01200` | Aucun |
| `date_from` | Non | Date de décision la plus ancienne. Une valeur vide compte comme non fournie. | `YYYY-MM-DD` | Aucun |
| `date_to` | Non | Date de décision la plus récente. Ne doit pas être antérieure à `date_from`. | `YYYY-MM-DD` | Aucun |
| `court` | Non | Type de juridiction. Fonds judiciaire seulement. | `cassation`, `appeal`, `first_instance` | Aucun |
| `chamber` | Non | La chambre de la Cour de cassation. Fonds judiciaire seulement, et seulement avec `court` à `cassation` ou sans `court`. | `plenary`, `mixed`, `civ1`, `civ2`, `civ3`, `commercial`, `social`, `criminal` | Aucun |
| `publication` | Non | Publiée ou non, comme la source l'enregistre. Indisponible pour `constitutional` et `cnil`. | `published`, `unpublished` | Aucun |
| `sort` | Non | L'ordre des résultats. | `relevance`, `newest` | `relevance` quand vous donnez `query`, `number` ou `ecli` ; `newest` sinon |
| `page` | Non | La page de résultats. | Un nombre entier, 1 ou plus | 1 |
| `page_size` | Non | Le nombre de résultats par page. | Un nombre entier de 1 à 20 | 10 |

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés, et `…` marque le texte omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md). Elle nomme toujours sa source : chaque décision porte son `link` Légifrance et l'appel qui la lit dans `read_with`, pour [`legifrance_get_decision`](legifrance_get_decision.md).

Le type de réponse (`outcome`) vaut `results`, ou `no_results` quand rien ne correspond ou quand vous demandez une page au-delà de la dernière.

```
{
  "source": "Légifrance",
  "outcome": "results",
  "warnings": [
    "Note: Légifrance does not hold every Cour de cassation decision (in particular not its unreasoned rejections and non-admissions, f…"
  ],
  "collection": "judicial",
  "results": 1,
  "page": {
    "number": 1,
    "of": 1
  },
  "order": "most_relevant_first",
  "next": null,
  "items": [
    {
      "title": "Cour de cassation, civile, Chambre sociale, 17 décembre 2025, 24-16.924, Inédit",
      "id": "JURITEXT000053197030",
      "court": "Cour de cassation",
      "chamber": "Chambre sociale",
      "nature": "arret",
      "decided": "2025-12-17",
      "numbers": [
        "24-16.924"
      ],
      "publication": "Inédit",
      "solution": "Cassation",
      "excerpt": null,
      "link": "https://www.legifrance.gouv.fr/juri/id/JURITEXT000053197030",
      "read_with": {
        "tool": "legifrance_get_decision",
        "id": "JURITEXT000053197030"
      }
    }
  ],
  "request": {
    "tool": "legifrance_search_case_law",
    "collection": "judicial",
    "number": "24-16.924",
    "sort": "relevance",
    "page": 1,
    "page_size": 10
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

| Champ | Ce qu'il contient |
|---|---|
| `collection` | Le fonds interrogé. |
| `results` | Le nombre de décisions sur toutes les pages. |
| `page`, `next` | Cette page et le nombre de pages, et la page suivante (`{ "page": 2 }`, ou `null`). |
| `order` | `most_relevant_first` ou `newest_first`. |
| `items` | Les décisions de cette page. |

Une décision contient :

| Champ | Ce qu'il contient |
|---|---|
| `title` | Le titre tel que Légifrance l'écrit, coupé à 300 caractères. |
| `id`, `link` | L'identifiant Légifrance et la page officielle, construite par Vigueur à partir de l'identifiant. |
| `court`, `chamber`, `nature` | La juridiction, la chambre ou la formation et la nature de la décision, tels que la source les indique ; chacun vaut `null` s'il n'est pas donné. |
| `decided`, `numbers` | La date de la décision et les numéros de la décision (plusieurs pour des affaires jointes). |
| `publication`, `solution` | Comment la source enregistre la publication et la solution ; `null` quand elle n'en donne aucune. Une décision sans information de publication affiche `null` : Vigueur n'écrit jamais « unpublished » à sa place. |
| `excerpt` | Le passage correspondant quand Légifrance en donne un, coupé à 300 caractères ; sinon `null`. |
| `read_with` | L'appel qui renvoie la décision complète. |

Pour le fonds judiciaire, `warnings` porte la note sur la couverture montrée ci-dessus.

- `request` reprend le numéro tel que vous l'avez saisi, par exemple `2416924` ; `numbers`, dans chaque décision, donne la forme officielle, `24-16.924`.
- Une page trop longue pour une seule réponse montre les premières décisions qui tiennent, et un avertissement dit `(Only the first {n} of {m} hits of this page fit — use a smaller "page_size".)`.

**Aucun résultat.** `items` est vide et `warnings` nomme le fonds et les critères. Pour le fonds judiciaire, il répète la note sur la couverture. Par exemple, `No Conseil constitutionnel (CONSTIT) decision on Légifrance matches these criteria: n° 2026-1217.` suivi, pour un numéro du Conseil constitutionnel sans `/`, de `Joined decisions carry a combined number such as "2026-1217/1218"; give the full number, or search by words with "query".`

**Page au-delà de la dernière.** Le type de réponse est `no_results` et `page` indique la page demandée et le nombre de pages :

```
{
  …
  "outcome": "no_results",
  "warnings": [
    "Note: Légifrance does not hold every Cour de cassation decision (in pa…"
  ],
  …
  "results": 1,
  "page": {
    "number": 99,
    "of": 1
  },
  …
  "next": null,
  "items": [],
  …
}
```

**Erreurs de saisie.** Certaines combinaisons sont refusées avec une erreur, et aucune recherche n'est faite :

- `"ecli" works for the judicial and administrative collections. For the Conseil constitutionnel, use "number" (e.g. "2026-1217/1218").`
- `"<input>" is not an ECLI (e.g. ECLI:FR:CCASS:2025:SO01200).` (la valeur donnée n'a pas la forme d'un ECLI)
- `"court" and "chamber" apply to the judicial collection only.`
- `"chamber" applies to Cour de cassation decisions (court "cassation").`
- `"publication" is not available for the Conseil constitutionnel (CONSTIT) collection.` (même formulation pour `cnil`)
- `"date_from" must not be after "date_to".`
- Une valeur qui n'est pas une date valide, ou un `page_size` supérieur à 20, est également refusé.

**Erreurs de la source.** Quand PISTE ou Légifrance ne peut pas répondre, vous obtenez une réponse d'erreur (`outcome: "error"`, avec un `kind` et un `message` ; voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)) : identifiants rejetés, accès refusé (HTTP 403, par exemple quand votre application PISTE n'est pas abonnée à l'API), quota atteint, service indisponible, ou pas de réponse en 45 secondes. Certaines indiquent quand réessayer ; un service indisponible renvoie aussi vers [`vigueur_status`](vigueur_status.md).

## Limites

> **Légifrance ne détient pas toutes les décisions**
> Légifrance détient une partie des décisions de la Cour de cassation. Il ne détient pas les rejets non spécialement motivés ni les non-admissions, il reçoit les décisions qu'il détient plusieurs semaines après Judilibre, et il ne détient aucune décision de cour d'appel après le début de 2023. Pour une décision récente, non spécialement motivée ou de cour d'appel, demandez à Claude d'utiliser [`judilibre_search_decisions`](judilibre_search_decisions.md). « Introuvable ici » ne prouve pas qu'une décision n'existe pas.

- Les mots sont cherchés selon la règle « tous les mots ». Il n'y a pas ici de choix « un mot quelconque » ni « expression exacte » ; la recherche de Judilibre en propose un.
- Aucun filtre ne distingue le Conseil d'État, les cours administratives d'appel et les tribunaux administratifs : la source a échoué quand on le lui a demandé (observé en novembre 2026), donc Vigueur ne le propose pas.
- `sort` ne peut pas classer « du plus ancien au plus récent ».
- La recherche liste seulement des décisions et des extraits. Les sommaires, les décisions attaquées et le texte intégral viennent avec [`legifrance_get_decision`](legifrance_get_decision.md).
- Une réponse est plafonnée à 40 000 caractères.
- Vigueur rapporte ce que Légifrance détient. Il ne classe pas les décisions par importance et ne dit pas laquelle s'applique.

Voir [Légifrance](../40-sources/01-legifrance.md) pour le comportement de chaque fonds.

## Voir aussi

- [`legifrance_get_decision`](legifrance_get_decision.md) : lire une décision trouvée ici.
- [`judilibre_search_decisions`](judilibre_search_decisions.md) : chercher directement les décisions de la Cour de cassation et des juridictions du fond.
- [Jurisprudence](../20-using/03-case-law.md) : le guide pour interroger les décisions.
- [Légifrance](../40-sources/01-legifrance.md) : ce que la source détient.
