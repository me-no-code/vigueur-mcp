---
title: "judilibre_list_taxonomy"
level: reference
tags: [tool, judilibre, taxonomy, filters]
summary: "Lister les valeurs que Judilibre utilise pour classer les décisions (chambres, formations, solutions, juridictions, thèmes) afin de filtrer une recherche avec la bonne clé."
updated: 2026-11-23
---

# judilibre_list_taxonomy

Liste les valeurs que Judilibre utilise pour classer les décisions, chacune avec sa clé et son libellé. Servez-vous-en pour trouver la clé d'une formation, d'une solution ou d'une juridiction avant de filtrer une recherche.

## Ce que vous pouvez demander

- « Quelles sont les formations de la Cour de cassation ? » / « What are the Cour de cassation's formations? »
- « Quels types de solutions Judilibre distingue-t-il ? » / « Which outcomes does Judilibre distinguish? »
- « Donne-moi la clé de la cour d'appel de Lyon pour filtrer. » / « Give me the key for the Lyon court of appeal so I can filter. »
- « Liste les thèmes qui contiennent “bail”. » / « List the themes that contain 'bail'. »

## Ce qu'il faut fournir

Seul `list` est obligatoire.

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `list` | Oui | La liste à afficher. | `jurisdiction`, `chamber`, `formation`, `publication`, `solution`, `location` (les cours et tribunaux des autres juridictions), `theme`, `field` | Aucun |
| `jurisdiction` | Non | La juridiction pour laquelle la liste est demandée. | `cc`, `ca`, `tj`, `tcom`, `cph` | `cc` |
| `contains` | Non | Ne garder que les valeurs dont le libellé contient ces mots. La casse, les accents et la ponctuation sont ignorés. Le filtre porte aussi sur l'intitulé de groupe d'une liste groupée, mais pas sur la clé. | Texte libre | Aucun |
| `page` | Non | La page de la liste. | Un nombre entier, 1 ou plus | 1 |

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés, et `…` marque les éléments omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `results`, ou `no_results` quand la liste n'a aucune valeur à montrer (voir plus bas).

**Une liste.**

```
{
  "source": "Judilibre",
  "outcome": "results",
  …
  "list": "chamber",
  "jurisdiction": "cc",
  "contains": null,
  "results": 12,
  "total": 12,
  "free_text": false,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "key": "pl",
      "label": "Assemblée plénière",
      "group": null
    },
    {
      "key": "mi",
      "label": "Chambre mixte",
      "group": null
    },
    {
      "key": "civ1",
      "label": "Première chambre civile",
      "group": null
    },
    …
  ],
  …
  "cached": [
    {
      "what": "Judilibre chamber list (cc)",
      "retrieved": "2026-11-16T10:42:07Z"
    }
  ],
  …
}
```

| Champ | Ce qu'il contient |
|---|---|
| `list`, `jurisdiction`, `contains` | La liste demandée, la juridiction pour laquelle elle est demandée, et les mots par lesquels vous avez filtré (`null` s'il n'y en a pas, et dans une réponse en texte libre). |
| `results`, `total` | Le nombre de valeurs après le filtre, et le nombre de valeurs de la liste entière. |
| `free_text` | `true` quand Judilibre enregistre cette liste en texte libre pour cette juridiction : il n'y a donc pas de liste. |
| `page`, `next` | Cette page et le nombre de pages, et la page suivante (`{ "page": 2 }`, ou `null`). Une longue liste est découpée en pages de 200 valeurs au plus. |
| `items` | Les valeurs de cette page. |

Chaque valeur contient `key` (ce que prennent les filtres de `judilibre_search_decisions` ; `null` pour une valeur sans clé, comme un thème), `label` (la valeur telle que Judilibre la libelle) et `group`. Une liste que Judilibre groupe, comme les thèmes des cours d'appel, donne l'intitulé du groupe dans `group` ; il vaut `null` quand il n'y en a pas. Avec `contains`, les libellés (et les intitulés de groupe) sont filtrés par vos mots. La liste vient de la mémoire de Vigueur, et `cached` indique quand elle a été récupérée.

**Texte libre.** Pour les autres juridictions, les chambres, formations, publications et solutions ne sont pas des listes. `free_text` vaut `true`, `items` est vide, `contains` vaut `null` même si vous avez donné des mots, le type de réponse est `no_results`, et un avertissement le dit :

```
{
  …
  "outcome": "no_results",
  "warnings": [
    "For Cour d'appel, Judilibre records chambers as free text, so there is no list to filter on: put the words in…"
  ],
  "list": "chamber",
  "jurisdiction": "ca",
  …
  "results": 0,
  "total": 0,
  "free_text": true,
  …
  "items": [],
  …
}
```

**Aucune valeur.** Quand une liste n'a aucune valeur, ou qu'aucune ne correspond à `contains`, le type de réponse est `no_results`, avec un avertissement de la forme `Judilibre has no {list} value{ matching "…"} for {court} ({total} values in the list).` Par exemple, la liste `location` était vide pour la Cour de cassation (observé en novembre 2026). Un `page` au-delà de la liste donne aussi `no_results`, et `page` indique la page demandée et le nombre de pages.

Les erreurs de la source (identifiants, quota, indisponibilité, pas de réponse en 45 secondes) sont des réponses d'erreur (`outcome: "error"`, avec un `kind` et un `message` ; voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)).

## Limites

> **Les clés des listes ne sont pas toujours les noms qu'accepte la recherche**
> `judilibre_search_decisions` accepte les noms propres à Vigueur pour `chamber` (`social`, `civ1`, `commercial`, `criminal`, `plenary`, `mixed`) et `publication` (`bulletin`, `report`, `chamber_letter`, `press_release`), pas les clés montrées ici (`soc`, `comm`, `cr`, `pl`, `mi` ; `b`, `r`, `l`, `c`). `formation`, `solution` et `location` acceptent les clés telles qu'elles sont listées.

- Les listes `chamber`, `formation`, `publication` et `solution` n'existent que pour la Cour de cassation. Les valeurs des cours d'appel et des juridictions du premier degré sont en texte libre.
- Les listes `theme` sont longues (observé en novembre 2026 : environ 780 entrées pour la Cour de cassation, environ 1 000 en neuf groupes pour les cours d'appel). Utilisez `contains`. La recherche de Vigueur n'a pas de filtre `theme`, parce que le filtre de la source ne renvoyait rien ; `search_in` `themes` cherche à la place dans le texte des thèmes.
- Vigueur garde chaque liste en mémoire pendant 24 heures, donc un changement à la source peut mettre ce temps à apparaître.
- Les listes sont celles de Judilibre. Vigueur n'ajoute, ne classe ni n'interprète aucune valeur.

## Voir aussi

- [`judilibre_search_decisions`](judilibre_search_decisions.md) : là où les clés sont utilisées.
- [`judilibre_get_decision`](judilibre_get_decision.md)
- [Judilibre](../40-sources/02-judilibre.md)
