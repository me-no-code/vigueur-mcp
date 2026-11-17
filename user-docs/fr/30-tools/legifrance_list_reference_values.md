---
title: "legifrance_list_reference_values"
level: reference
tags: [tool, legifrance, reference, codes, natures, emitters]
summary: "Lister les codes, les natures de textes et les émetteurs que vous pouvez utiliser comme filtres dans les autres outils Légifrance."
updated: 2026-11-17
---

# legifrance_list_reference_values

Liste les valeurs que les autres outils Légifrance acceptent comme filtres : chaque code français avec son identifiant, les natures des textes publiés au *Journal officiel*, ou les ministères et autorités qui y ont publié. Vérifiez ici avant de filtrer, car les noms changent avec les gouvernements.

## Ce que vous pouvez demander

- « Quels codes sont disponibles ? » / « Which codes are available? »
- « Quelles natures de textes paraissent au Journal officiel ? » / « Which kinds of texts does the Journal officiel publish? »
- « Quels ministères ont publié au Journal officiel depuis le 1er janvier 2026 ? » / « Which ministries have published in the Journal officiel since 2026-01-01? »

## Ce qu'il faut fournir

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `kind` | Oui | La liste à obtenir. | `codes` (chaque code avec son statut et son identifiant, pour le paramètre `code`), `jorf_natures` (natures des textes publiés au Journal officiel, pour les filtres de nature), `jorf_emitters` (ministères et autorités qui ont publié au Journal officiel) | Aucun |
| `since` | Non | Pour `jorf_natures` et `jorf_emitters` : début de la fenêtre de publication. Il ne peut pas être postérieur à aujourd'hui. | Une date valide au format `YYYY-MM-DD` (date de publication) | Un an avant aujourd'hui |

`since` n'a aucun effet sur `codes`.

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés, et `…` marque les éléments omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md). Le type de réponse (`outcome`) vaut toujours `results`.

| Champ | Ce qu'il contient |
|---|---|
| `kind` | La liste obtenue : `codes`, `jorf_natures` ou `jorf_emitters`. |
| `since` | Le début de la fenêtre de publication des comptages ; `null` pour les codes. |
| `results` | Le nombre de valeurs dans la liste. |
| `omitted` | Le nombre de valeurs omises parce que la réponse serait trop longue (0 s'il n'y en a aucune). |
| `items` | Les valeurs. Les codes sont triés par titre, les valeurs du Journal officiel par nombre, les plus fréquentes d'abord. |

Chaque élément contient `value` (écrite comme Légifrance l'écrit), `id` et `status` (pour un code ; `null` pour une valeur du Journal officiel) et `count` (pour une valeur du Journal officiel ; `null` pour un code).

Les codes, avec le mot de statut de Vigueur et l'identifiant Légifrance. La liste des codes est servie depuis la mémoire de Vigueur, et `cached` indique quand elle a été récupérée. Les codes abrogés sont listés avec leur statut (`repealed`) :

```
{
  "source": "Légifrance",
  "outcome": "results",
  …
  "kind": "codes",
  "since": null,
  "results": 108,
  "omitted": 0,
  "items": [
    {
      "value": "Code civil",
      "id": "LEGITEXT000006070721",
      "status": "in_force",
      "count": null
    },
    {
      "value": "Code de commerce",
      "id": "LEGITEXT000005634379",
      "status": "in_force",
      "count": null
    },
    {
      "value": "Code de commerce (ancien)",
      "id": "LEGITEXT000006069441",
      "status": "repealed",
      "count": null
    },
    …
  ],
  …
  "cached": [
    {
      "what": "Légifrance code list",
      "retrieved": "2026-11-16T10:42:07Z"
    }
  ],
  …
}
```

Les natures, chacune avec le nombre de textes publiés dans la fenêtre. Les émetteurs ont la même forme (`"value": "Ministère de la justice"` et son `count`). Les comptages portent sur les textes du Journal officiel depuis `since`, par date de publication :

```
{
  …
  "outcome": "results",
  …
  "kind": "jorf_natures",
  "since": "2025-11-16",
  "results": 24,
  "omitted": 0,
  "items": [
    {
      "value": "ARRETE",
      "id": null,
      "status": null,
      "count": 44158
    },
    {
      "value": "DECRET",
      "id": null,
      "status": null,
      "count": 10413
    },
    {
      "value": "AVIS",
      "id": null,
      "status": null,
      "count": 9653
    },
    …
  ],
  …
}
```

### Erreurs

Une réponse d'erreur est un objet JSON avec `outcome: "error"` et un champ `error` qui contient un `kind` et un `message` (voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)). Celles qui sont propres à cet outil :

- `"since" (<date>) is after today (<today>).`
- Un `since` qui n'est pas une date valide, ou un `kind` autre que les trois valeurs, est refusé.

Les autres erreurs sont les mêmes pour tous les outils ; voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).

## Limites

- Les valeurs sont celles que montrent Légifrance et le Journal officiel : l'orthographe, les majuscules et la formulation sont les leurs. Les noms d'émetteurs diffèrent d'un gouvernement à l'autre, donc un ancien nom de ministère peut apparaître à côté du nom actuel.
- Les natures et les émetteurs sont ceux que Légifrance signale pour les textes publiés depuis `since`.
- Seules les listes `jorf_*` sont liées à une fenêtre de dates. La liste des codes comprend les codes abrogés.

## Voir aussi

- [`legifrance_latest_jo`](legifrance_latest_jo.md) : utilise les natures et les émetteurs.
- [`legifrance_get_article`](legifrance_get_article.md), [`legifrance_browse_code`](legifrance_browse_code.md) : utilisent les titres de codes.
- [`legifrance_search_legislation`](legifrance_search_legislation.md) : utilise les titres de codes et les natures.
- [Codes, lois et décrets](../20-using/02-legislation.md)
