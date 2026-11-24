---
title: "judilibre_search_decisions"
level: reference
tags: [tool, judilibre, case-law, search]
summary: "Chercher dans Judilibre des décisions de la Cour de cassation et des juridictions du fond, choisir comment les mots se combinent, et lire ce que montre chaque réponse."
updated: 2026-11-23
---

# judilibre_search_decisions

Cherche dans Judilibre, la base de données ouvertes de la Cour de cassation, des décisions de la Cour de cassation et, sur demande, des cours d'appel, des tribunaux judiciaires, des tribunaux de commerce et des conseils de prud'hommes.

## Ce que vous pouvez demander

- « Trouve l'arrêt n° 23-20.348 de la Cour de cassation. » / « Find Cour de cassation decision 23-20.348. »
- « Cherche l'expression exacte “forfait jours” dans les arrêts de la chambre sociale, les plus récents d'abord. » / « Search the exact phrase 'forfait jours' in social-chamber decisions, newest first. »
- « Cherche les arrêts de la cour d'appel de Paris sur le bail depuis 2024. » / « Find Paris court of appeal decisions about leases since 2024. »
- « Y a-t-il des arrêts publiés au Bulletin sur ce sujet ? » / « Are there decisions published in the Bulletin on this subject? »

## Ce qu'il faut fournir

Seul `query` est obligatoire. Judilibre ne renvoie rien sans mots de recherche.

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `query` | Oui | Des mots de recherche, un numéro de [pourvoi](../00-intro/03-glossary.md) ou un ECLI. Un numéro ou un ECLI trouve cette décision. | Texte libre, jusqu'à 512 caractères | Aucun |
| `match` | Non | Comment les mots se combinent. | `all_words`, `any_word`, `exact_phrase` (les mots dans cet ordre) | `all_words` |
| `jurisdiction` | Non | Les juridictions où chercher. | `cc` Cour de cassation, `ca` cours d'appel, `tj` tribunaux judiciaires, `tcom` tribunaux de commerce, `cph` conseils de prud'hommes | `cc` |
| `chamber` | Non | La chambre de la Cour de cassation. `cc` seulement. | `plenary`, `mixed`, `civ1`, `civ2`, `civ3`, `commercial`, `social`, `criminal` | Aucun |
| `formation` | Non | La formation de la Cour de cassation. `cc` seulement. Leur liste est donnée par [`judilibre_list_taxonomy`](judilibre_list_taxonomy.md). | `fp`, `fm`, `fs`, `f`, `frh`, `frr` | Aucun |
| `publication` | Non | Comment la Cour de cassation a publié la décision. `cc` seulement. | `bulletin`, `report`, `chamber_letter`, `press_release` | Aucun |
| `solution` | Non | La clé de solution, par exemple `cassation` ou `rejet`. `cc` seulement. Leur liste est donnée par [`judilibre_list_taxonomy`](judilibre_list_taxonomy.md). | Une clé de la liste `solution` | Aucun |
| `location` | Non | La clé de juridiction pour `ca`, `tj`, `tcom` et `cph`, par exemple `ca_paris`. Pas avec `cc`. | Une clé de la liste `location` de la juridiction | Aucun |
| `search_in` | Non | Chercher dans une seule partie de la décision. | `text`, `introduction`, `expose`, `moyens`, `motivations`, `dispositif`, `visa`, `summary`, `themes` | La décision entière |
| `date_from` | Non | Date de décision la plus ancienne. Une valeur vide compte comme non fournie. | `YYYY-MM-DD` | Aucun |
| `date_to` | Non | Date de décision la plus récente. Ne doit pas être antérieure à `date_from`. | `YYYY-MM-DD` | Aucun |
| `sort` | Non | L'ordre des résultats. | `relevance`, `newest`, `oldest` | `relevance` |
| `page` | Non | La page de résultats. | Un nombre entier, 1 ou plus | 1 |
| `page_size` | Non | Le nombre de résultats par page. | Un nombre entier de 1 à 20 | 10 |

`chamber` et `publication` prennent les noms propres à Vigueur (`social`, `bulletin`), pas les clés des listes de la source (`soc`, `b`). La différence n'importe que lorsque vous lisez les listes avec `judilibre_list_taxonomy`.

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés, et `…` marque les éléments omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `results`, ou `no_results` quand rien ne correspond ou quand vous demandez une page au-delà de la dernière.

```
{
  "source": "Judilibre",
  "outcome": "results",
  "warnings": [],
  "results": 568,
  "page": {
    "number": 1,
    "of": 57
  },
  "order": "most_relevant_first",
  "next": {
    "page": 2
  },
  "relaxed": false,
  "items": [
    {
      "title": "Cour de cassation, Chambre sociale — decision of 2026-09-30 — n° 25-14.434 — ECLI:FR:CCASS:2026:SO00…",
      "id": "6abcc10bc27382d099087409",
      "ecli": "ECLI:FR:CCASS:2026:SO00769",
      "link": "https://www.courdecassation.fr/decision/6abcc10bc27382d099087409",
      "jurisdiction": "cc",
      "location": null,
      "chamber": "Chambre sociale",
      "decided": "2026-09-30",
      "numbers": [
        "25-14.434"
      ],
      "formation": "Formation restreinte hors RNSM/NA",
      "publication": [],
      "solution": "Cassation",
      "summary": null,
      "excerpt": "supplémentaires accomplies en 2017 et les congés payés afférents en soutenant que la convention de *…",
      "read_with": {
        "tool": "judilibre_get_decision",
        "id": "6abcc10bc27382d099087409"
      }
    },
    …
  ],
  "request": {
    "tool": "judilibre_search_decisions",
    "query": "forfait jours",
    "match": "all_words",
    "jurisdiction": "cc",
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
| `results` | Le nombre de décisions sur toutes les pages. |
| `page`, `next` | Cette page et le nombre de pages, et la page suivante (`{ "page": 2 }`, ou `null`). |
| `order` | `most_relevant_first`, `newest_first` ou `oldest_first`. |
| `relaxed` | `true` quand Judilibre n'a trouvé aucune correspondance exacte et a élargi la recherche : les résultats ne correspondent alors qu'à une partie des mots, et un avertissement le dit. |
| `items` | Les décisions de cette page. |

Une décision contient :

| Champ | Ce qu'il contient |
|---|---|
| `title` | Une ligne avec la juridiction, la chambre, la date de la décision, les numéros et l'ECLI, coupée à 300 caractères. |
| `id`, `ecli`, `link` | L'identifiant Judilibre, l'ECLI (`null` s'il n'y en a pas) et la page officielle, construite par Vigueur à partir de l'identifiant. |
| `jurisdiction`, `location`, `chamber` | La clé Judilibre de la juridiction (`cc`, `ca`, `tj`, `tcom`, `cph`), la juridiction précise à l'intérieur, et la chambre, telles que Judilibre les libelle ; `location` et `chamber` valent `null` s'ils ne sont pas donnés. |
| `decided`, `numbers` | La date de la décision et les numéros de la décision. |
| `formation`, `publication`, `solution` | La formation, la manière dont la Cour de cassation a publié la décision, et la solution. `publication` est une liste, vide quand la décision n'est pas publiée au Bulletin. |
| `summary` | Le sommaire de la Cour de cassation, coupé à 600 caractères ; `null` quand il n'y en a pas. |
| `excerpt` | Deux passages correspondants au plus, joints par ` … `, les mots trouvés placés entre `**`, coupés à 700 caractères ; `null` quand il n'y en a pas. |
| `read_with` | L'appel qui renvoie la décision complète, pour [`judilibre_get_decision`](judilibre_get_decision.md). |

Un rejet non spécialement motivé garde la formulation de la source dans `formation` et `solution` : `"formation": "Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)"`, `"solution": "Rejet"`.

Avertissements que vous pouvez rencontrer :

- `Judilibre found no exact match and loosened the search: these results match only some of the words.`
- `Only the first 10 000 are reachable by paging; narrow the search to see the others.` (au-dessus de 10 000 résultats)
- `(Only the first {n} of {m} hits of this page fit — use a smaller "page_size".)` (une page trop longue pour une seule réponse montre les premières décisions qui tiennent)

**Aucun résultat.** `items` est vide et `warnings` contient une seule phrase, qui nomme vos mots et vos critères : `No Judilibre decision matches "licenciement" with these criteria: all words, Cour de cassation.` Elle ne suggère pas d'autre recherche.

**Page au-delà de la dernière.** Le type de réponse est `no_results`, `items` est vide et `page` indique la page demandée et le nombre de pages :

```
{
  …
  "outcome": "no_results",
  "warnings": [],
  "results": 1,
  "page": {
    "number": 6,
    "of": 1
  },
  …
  "next": null,
  "relaxed": false,
  "items": [],
  …
}
```

**Erreurs de saisie.** Les saisies suivantes sont refusées avec une erreur, et aucune recherche n'est faite :

- `query` vide : `"query" is required: Judilibre finds nothing without search words. To look up a decision, use its pourvoi number or ECLI as the query.`
- Plus de 512 caractères : `"query" is limited to 512 characters.`
- `chamber`, `formation`, `publication` ou `solution` avec une autre juridiction que `cc` : `"chamber", "formation", "publication" and "solution" filter Cour de cassation decisions only (jurisdiction "cc"). For other courts, put the chamber or outcome words in "query".`
- `location` avec `cc` : `"location" applies to courts of appeal and first-instance courts (jurisdiction ca, tj, tcom or cph).`
- Pagination au-delà des 10 000 premiers résultats : `Judilibre returns at most the first 10 000 results; narrow the search (dates, chamber, more precise words).`
- `date_from` postérieur à `date_to`, une date non valide, ou un `page_size` supérieur à 20.

**Erreurs de la source.** Les identifiants, le quota, la disponibilité et la limite de 45 secondes donnent des réponses d'erreur (`outcome: "error"`, avec un `kind` et un `message` ; voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)).

## Limites

> **Les mots se combinent selon « tous les mots », sauf indication contraire**
> Sans consigne, Judilibre retient n'importe lequel des mots, ce qui renvoie des résultats très nombreux et peu pertinents (observé en novembre 2026 : des dizaines de milliers de décisions pour une requête de deux mots). Vigueur demande tous les mots par défaut. Utilisez `exact_phrase` pour une expression figée comme « forfait jours ».

- **Recherche par numéro.** Un numéro de *pourvoi* fonctionne quelle que soit sa graphie (observé en novembre 2026 : `24-16.924`, `2416924`, `24-16924`, `n° 24-16.924`). Les recherches par numéro et par ECLI portent sur la Cour de cassation, sauf si vous fixez `jurisdiction`.
- **Numéros de cour d'appel (RG).** Observé en novembre 2026 : avec `jurisdiction` à `ca`, un numéro tel que `22/10744` ramène aussi des décisions qui n'en partagent qu'une partie (le même numéro d'ordre une autre année, ou la même année avec un autre numéro). Vérifiez les numéros dans la réponse.
- **Filtres qui ne fonctionnent pas à la source.** Le filtre `type` écarte des décisions récentes de la Cour de cassation et le filtre `theme` n'a rien renvoyé, même pour le thème propre d'une décision (les deux observés en novembre 2026), donc Vigueur ne les propose pas. `search_in` `themes` est disponible. La source ignore un ordre de tri si on ne lui indique pas le sens ; Vigueur le lui indique toujours.
- **Juridictions du fond.** Judilibre ne présente pas les chambres, formations, publications ou solutions des cours d'appel et des juridictions du premier degré comme des listes : ce sont des textes libres, donc ces filtres ne valent que pour `cc`. Mettez les mots dans `query`. Les décisions de cours d'appel et de tribunaux judiciaires vues en novembre 2026 ne portaient pas d'ECLI.
- **Portée.** La pagination s'arrête aux 10 000 premiers résultats, et les pages contiennent au plus 20 décisions ici, alors que la source en accepte davantage.
- **Absent de Judilibre.** Le Conseil d'État, le Conseil constitutionnel, la CNIL et les juridictions financières sont dans [`legifrance_search_case_law`](legifrance_search_case_law.md).
- Les noms des personnes physiques sont pseudonymisés par la source.
- Vigueur rapporte ce que Judilibre détient. Il ne dit pas quelle décision est l'arrêt de principe.

Voir [Judilibre](../40-sources/02-judilibre.md) pour la couverture et le comportement de la source.

## Voir aussi

- [`judilibre_get_decision`](judilibre_get_decision.md) : lire une décision, entière ou en une partie.
- [`judilibre_list_taxonomy`](judilibre_list_taxonomy.md) : les clés que prennent les filtres.
- [`legifrance_search_case_law`](legifrance_search_case_law.md) : les autres fonds de jurisprudence.
- [Jurisprudence](../20-using/03-case-law.md)
- [Judilibre](../40-sources/02-judilibre.md)
