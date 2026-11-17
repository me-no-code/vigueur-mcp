---
title: "legifrance_latest_jo"
level: reference
tags: [tool, legifrance, journal-officiel, jorf]
summary: "Lire les derniers numéros du Journal officiel, ou ceux d'une date de publication, avec la table des matières de chacun."
updated: 2026-11-17
---

# legifrance_latest_jo

Lit les derniers numéros du *Journal officiel* ([glossaire](../00-intro/03-glossary.md)) sur Légifrance, ou les numéros publiés à une date donnée. Chaque numéro est accompagné de sa table des matières : chaque texte publié, avec sa nature (loi, décret, arrêté…), son ministère ou son autorité et un lien. Vous pouvez ne garder qu'une nature ou qu'un émetteur.

## Ce que vous pouvez demander

- « Qu'a publié le Journal officiel aujourd'hui ? » / « What did the Journal officiel publish today? »
- « Montre-moi les décrets du dernier Journal officiel. » / « Show me the décrets of the latest Journal officiel. »
- « Quels arrêtés du ministère du travail ont paru le 11 novembre 2026 ? » / « Which arrêtés of the ministry of labour were published on 2026-11-11? »
- « Liste les trois derniers numéros du Journal officiel. » / « List the last three issues of the Journal officiel. »

## Ce qu'il faut fournir

Tous les paramètres sont facultatifs. Une valeur vide compte comme non fournie.

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `count` | Non | Le nombre de derniers numéros à lire. Ignoré si vous donnez `date`. | Un nombre entier de 1 à 10 | 1 |
| `date` | Non | Lit le ou les numéros publiés à cette date. Au plus 3 numéros de cette date sont lus. | Une date valide au format `YYYY-MM-DD` (date de publication) | Les derniers numéros |
| `nature` | Non | Ne garde que les textes de cette nature. La casse et les accents sont sans effet, mais la valeur doit être la nature entière. | `decret`, `arrete`, `loi`… Les natures qui existent sont listées par [`legifrance_list_reference_values`](legifrance_list_reference_values.md). | Toutes les natures |
| `emitter` | Non | Ne garde que les textes de ce ministère ou de cette autorité. Un nom partiel suffit, comparé sans tenir compte de la casse ni des accents, à la fois au ministère et à l'émetteur. | Par exemple `travail` | Tous les émetteurs |
| `page` | Non | La page de la table des matières. | Un nombre entier, 1 ou plus | 1 |

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés, et `…` marque les champs, éléments ou textes omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `results`, ou `no_results` quand rien ne correspond à vos filtres, quand le numéro ne liste aucun texte, ou quand vous demandez une page au-delà de la dernière.

```
{
  "source": "Légifrance",
  "outcome": "results",
  "warnings": [],
  "issue_count": 3,
  "results": 208,
  "page": {
    "number": 1,
    "of": 3
  },
  "next": {
    "page": 2
  },
  "filter": {
    "nature": null,
    "emitter": null,
    "matched_emitters": []
  },
  "items": [
    {
      "id": "JORFCONT000055078255",
      "number": "0264",
      "title": "JORF n°0264 du 11 novembre 2026",
      "published": "2026-11-11",
      "link": "https://www.legifrance.gouv.fr/eli/jo/2026/11/11/0264",
      "toc_available": true,
      "groups": [
        {
          "path": [
            "Journal officiel \"Lois et Décrets\"",
            "Présidence de la République",
            "Promotion des militaires n'appartenant pas à l'armée active",
            "Ordre national de la Légion d’honneur"
          ],
          "texts": [
            {
              "id": "JORFTEXT000055078260",
              "title": "Décret du 10 novembre 2026 portant élévation dans l'ordre national de…",
              "nature": "DECRET",
              "emitter": "Présidence de la République",
              "link": "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000055078260"
            },
            …
          ]
        },
        …
      ]
    },
    …
  ],
  …
}
```

| Champ | Ce qu'il contient |
|---|---|
| `issue_count` | Le nombre de numéros sélectionnés. |
| `results` | Le nombre de textes restants après filtrage, sur toutes les pages et tous les numéros. |
| `page`, `next` | Cette page et le nombre de pages, et la page suivante (`{ "page": 2 }`, ou `null`). |
| `filter` | Les filtres appliqués : `nature` et `emitter` (`null` s'ils ne sont pas utilisés), et `matched_emitters`, les graphies que le filtre `emitter` a trouvées (les noms de ministères changent avec les gouvernements, donc plusieurs graphies peuvent correspondre). |
| `items` | Les numéros de cette page, dans l'ordre où Légifrance les donne. |

Un numéro contient son `id`, son `number`, son `title`, `published` (sa date de publication, pas une date d'entrée en vigueur), son `link` officiel, et `toc_available`, qui vaut `false` quand Légifrance ne donne aucune table des matières pour lui (`groups` est alors vide). `groups` liste ses textes regroupés selon leur place dans la table des matières : le `path` des titres, du plus englobant au plus précis, et les `texts`. Un texte contient son `id` (`JORFTEXT…`), son `title`, sa `nature`, son `emitter` (le ministère, sinon l'émetteur ; chacun vaut `null` s'il n'est pas donné) et son `link`.

### Quand rien ne correspond (`no_results`)

Les numéros restent listés, sans aucun texte dessous, et la réponse ajoute ce qui est disponible pour que vous puissiez corriger le filtre. `available` liste les natures et les émetteurs des numéros sélectionnés avant filtrage, les plus fréquents d'abord, 10 au plus de chaque. Les deux mêmes listes sont données sous forme de phrases dans `warnings`, qui se terminent par `; … (<n> more)` quand la liste a été coupée :

```
{
  …
  "outcome": "no_results",
  "warnings": [
    "No text matches these filters in the selected issue(s).",
    "Natures available in these issues: ARRETE; DECRET; AVIS; INF…",
    "Emitters available in these issues: Ministère de l'agricultu…"
  ],
  "issue_count": 3,
  "results": 0,
  …
  "filter": {
    "nature": "zzz",
    "emitter": null,
    "matched_emitters": []
  },
  "items": [
    {
      "id": "JORFCONT000055078255",
      "number": "0264",
      "title": "JORF n°0264 du 11 novembre 2026",
      "published": "2026-11-11",
      "link": "https://www.legifrance.gouv.fr/eli/jo/2026/11/11/0264",
      "toc_available": true,
      "groups": []
    },
    …
  ],
  "available": {
    "natures": [
      "ARRETE",
      "DECRET",
      "AVIS",
      …
    ],
    "emitters": [
      "Ministère de l'agriculture, de l'agro-alimentaire et de la s…",
      "Ministère de la santé, des familles, de l'autonomie et des p…",
      "Ministère de la justice",
      …
    ]
  },
  …
}
```

Autres cas : `No text is listed in the selected issue(s).` (aucun filtre, numéro vide) et `No Journal officiel issue found.` (aucun numéro à cette date).

### Numéros longs

Une page contient au plus 1 000 lignes et environ 40 000 caractères. Une page qui commence au milieu d'un numéro répète l'en-tête du numéro et le chemin du groupe. Quand il y a une suite, `next` vaut `{ "page": 2 }`. Une page au-delà de la dernière répond `no_results`, et `page` indique la page demandée et le nombre de pages (par exemple `"page": { "number": 99, "of": 3 }`).

### Erreurs

Une réponse d'erreur est un objet JSON avec `outcome: "error"` et un champ `error` qui contient un `kind` et un `message` (voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)). Celles qui sont propres à cet outil :

- Un `count` qui n'est pas compris entre 1 et 10 est refusé.
- `"emitter" has no letters or digits: "<emitter>".`
- Une `date` non valide est refusée.

Les autres erreurs sont les mêmes pour tous les outils ; voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).

## Limites

> **Les dates sont ici des dates de publication.** Ce ne sont pas les dates d'entrée en vigueur des textes. Pour les dates d'entrée en vigueur, utilisez [`legifrance_list_changes`](legifrance_list_changes.md).

- L'outil liste ce qui a été publié, avec des liens. Pour lire un texte, utilisez [`legifrance_get_text`](legifrance_get_text.md) avec son identifiant `JORFTEXT` (lu dans sa version publiée au Journal officiel).
- Avec `date`, au plus 3 numéros de cette date sont lus.
- Les noms des émetteurs changent d'un gouvernement à l'autre. Vérifiez l'orthographe avec [`legifrance_list_reference_values`](legifrance_list_reference_values.md) (`jorf_emitters`) ou servez-vous d'un nom partiel.

## Voir aussi

- [`legifrance_list_reference_values`](legifrance_list_reference_values.md) : les natures et les émetteurs sur lesquels filtrer.
- [`legifrance_get_text`](legifrance_get_text.md)
- [`legifrance_search_legislation`](legifrance_search_legislation.md) : chercher dans le Journal officiel par mots, NOR ou numéro de texte, en restreignant par dates de publication.
- [Le Journal officiel et le suivi des modifications](../20-using/04-journal-officiel.md)
