---
title: "legifrance_get_article_history"
level: reference
tags: [tool, legifrance, article, history]
summary: "Lister toutes les versions d'un article de code, avec leurs dates et les textes qui l'ont créé, modifié ou abrogé."
updated: 2026-11-18
---

# legifrance_get_article_history

Liste toutes les versions d'un article de code français sur Légifrance, avec leurs dates de vigueur et leur état juridique, les textes qui l'ont créé, modifié ou abrogé, et l'endroit où Légifrance enregistre que son contenu a été déplacé lors d'une renumérotation.

## Ce que vous pouvez demander

- « Quelles sont les versions successives de l'article 1382 du Code civil ? » / « List the successive versions of article 1382 of the Code civil. »
- « Quels textes ont modifié l'article L1234-1 du Code du travail ? » / « Which texts amended article L1234-1 of the Code du travail? »
- « Que devient l'ancien article 1382 ? » / « Where did the old article 1382 go? »

## Ce qu'il faut fournir

Donnez soit un code et un numéro d'article, soit un identifiant Légifrance. Une valeur vide compte comme non fournie.

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `code` | Non | Le code dans lequel chercher. | Le titre du code, comme `Code civil` ou `Code du travail`. | Tous les codes |
| `number` | Oui, sauf si vous donnez `id` | Le numéro de l'article tel qu'on le cite. | `1240`, `L1234-1`, `L. 1234-1`. Pas en même temps que `id`. | Aucun |
| `id` | Oui, sauf si vous donnez `number` | L'identifiant Légifrance d'une version de l'article. | `LEGIARTI` (un article de code ou de loi) ou `KALIARTI` (un article de convention collective), suivi de 12 chiffres. Pas en même temps que `number`. | Aucun |
| `page` | Non | La page de la liste des événements à afficher. La réponse indique s'il y a une page suivante. | Un nombre entier, 1 ou plus | 1 |
| `response_format` | Non | Le niveau de détail. | `concise`, ou `detailed` (ajoute l'identifiant de chaque article modificatif) | `concise` |

L'historique est toujours établi à la date du jour : il n'y a pas de paramètre de date.

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; l'extrait ci-dessous est indenté, et `…` marque les éléments omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `found`, `no_results` (une page au-delà de la dernière), `several_matches` ou `not_found`.

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [],
  "code": "Code civil",
  "number": "1382",
  "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042379",
  "on": "2026-11-16",
  "current": {
    "id": "LEGIARTI000032042379",
    "version": "2.0",
    "from": "2016-10-01",
    "until": null,
    "until_undetermined": false
  },
  "versions": [
    {
      "id": "LEGIARTI000006438819",
      "version": "1.0",
      "legifrance_status": "MODIFIE",
      "from": "1804-03-21",
      "until": "2016-10-01",
      "until_undetermined": false
    },
    {
      "id": "LEGIARTI000032042379",
      "version": "2.0",
      "legifrance_status": "VIGUEUR",
      "from": "2016-10-01",
      "until": null,
      "until_undetermined": false
    }
  ],
  "results": 3,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "date": "1804-03-21",
      "date_undetermined": false,
      "action": "created",
      "by": "Un texte d’une portée générale",
      "by_article_id": null,
      "scheduled": false
    },
    {
      "date": "2016-10-01",
      "date_undetermined": false,
      "action": "amended",
      "by": "Ordonnance n°2016-131 du 10 février 2016 - art. 4",
      "by_article_id": null,
      "scheduled": false
    },
    …
  ],
  "concordance": {
    "moved": [
      {
        "version": "1.0",
        "from": "1804-03-21",
        "until": "2016-10-01",
        "to": [
          "Code civil - art. 1240 (V)"
        ]
      }
    ],
    "came_from": [
      "Code civil - art. 1353 (M)"
    ]
  },
  …
}
```

| Champ | Ce qu'il contient |
|---|---|
| `code`, `number` | Le titre du code et le numéro de l'article. |
| `link` | La page officielle de la version en vigueur aujourd'hui, sinon de la dernière version ; `null` quand il n'y a aucune version. |
| `on` | Aujourd'hui : la date pour laquelle `current` et `scheduled` sont calculés. |
| `current` | La version dont les dates de vigueur couvrent `on`, calculée à partir des dates. `null` quand aucune version n'est en vigueur aujourd'hui. |
| `versions` | Toutes les versions de l'article, par date de début croissante (les versions sans début connu en dernier). Chacune a le numéro de version de Légifrance, son propre libellé, et `from`, `until` et `until_undetermined` comme dans [`legifrance_get_article`](legifrance_get_article.md). |
| `results`, `page`, `next` | Le nombre d'événements sur toutes les pages, cette page et le nombre de pages, et la page suivante (`{ "page": 2 }`, ou `null`). |
| `items` | Les événements de cette page, par ordre de date : les textes qui ont créé, modifié ou abrogé l'article. |
| `concordance` | Les enregistrements de Légifrance sur les contenus déplacés. |

Précisions :

- **Événements.** `date` est le jour où la modification a pris effet. `action` vaut `created`, `amended`, `repealed`, `codified`, `transferred` ou `linked`. `by` est le titre du texte modificatif. `scheduled` vaut `true` pour un événement postérieur à aujourd'hui. Quand Légifrance n'a pas fixé de date, `date` vaut `null` et `date_undetermined` vaut `true`. `by_article_id` est l'identifiant de l'article modificatif dans une réponse `detailed`, et `null` dans une réponse `concise`.
- **Concordance.** `moved` dit où est allé le contenu d'une version (`to`) ; `came_from` liste les articles dont le contenu se trouve maintenant à ce numéro. Les libellés entre parenthèses, comme `(V)`, sont ceux de Légifrance. La concordance est lue pour la première version et pour la version actuelle (ou la dernière) seulement : les liens des versions intermédiaires ne sont pas affichés.
- **Longs historiques.** Une page contient au plus 100 événements, moins si les lignes sont longues. Chaque page répète les champs d'identité, `versions` et `concordance`. Quand il y a une suite, `next` vaut `{ "page": 2 }`. Une page au-delà de la dernière répond `no_results` sans `items`, et `page` indique la page demandée et le nombre de pages.
- **Avertissements.** Si la concordance ne peut pas être lue, l'historique est tout de même donné, avec l'avertissement `Could not read Légifrance's concordance of <id> (<reason>).`

### Introuvable, plusieurs codes, code inconnu

Ces réponses sont identiques à celles de [`legifrance_get_article`](legifrance_get_article.md) : `several_matches` liste les codes qui contiennent le numéro, et `not_found` porte le même `reason` (`unknown_id`, `no_article`, `unknown_code`) et les mêmes suggestions `did_you_mean`.

### Un article abrogé

Un article qui n'est pas en vigueur aujourd'hui a tout de même un historique : la réponse est construite à partir de sa dernière période, et `current` vaut `null`. Si les périodes du numéro se répartissent sur plusieurs codes et que vous n'avez pas donné de code, vous obtenez à la place la liste des candidats.

### Erreurs

Les mêmes erreurs de saisie que pour `legifrance_get_article` s'appliquent : ni numéro ni identifiant, les deux à la fois, un identifiant de mauvaise forme. Les autres erreurs sont les mêmes pour tous les outils ; voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).

## Limites

> **Les dates sont des dates d'entrée en vigueur.** La date d'un événement est celle où une modification a pris effet, non celle où le texte modificatif a été publié.

- L'outil montre les versions et les textes modificatifs, non la rédaction de chaque ancienne version. Pour lire une ancienne version, utilisez [`legifrance_get_article`](legifrance_get_article.md) avec `at_date`.
- L'historique ne peut pas être établi à une autre date que celle du jour.
- Pour toutes les modifications d'un code ou d'un texte entier sur une période, utilisez [`legifrance_list_changes`](legifrance_list_changes.md).

## Voir aussi

- [`legifrance_get_article`](legifrance_get_article.md) : lire une version.
- [`legifrance_list_changes`](legifrance_list_changes.md) : les modifications d'un code ou d'un texte.
- [Codes, lois et décrets](../20-using/02-legislation.md)
- [Le Journal officiel et le suivi des modifications](../20-using/04-journal-officiel.md)
