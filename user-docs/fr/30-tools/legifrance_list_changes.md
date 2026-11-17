---
title: "legifrance_list_changes"
level: reference
tags: [tool, legifrance, changes, amendments]
summary: "Lister ce qui a changé dans un code, ou dans une loi ou un décret, entre deux dates, regroupé par texte modificatif."
updated: 2026-11-17
---

# legifrance_list_changes

Liste ce qui a changé dans un code français, ou dans une loi ou un décret, entre deux dates sur Légifrance : articles créés, modifiés, abrogés, codifiés ou transférés, regroupés par texte à l'origine de la modification.

## Ce que vous pouvez demander

- « Qu'est-ce qui a changé dans le Code du travail depuis le 1er janvier 2026 ? » / « What changed in the Code du travail since 2026-01-01? »
- « Quelles modifications la loi 78-17 a-t-elle connues en 2025 ? » / « What changes did loi 78-17 go through in 2025? »
- « Quels articles du Code civil vont changer prochainement ? » / « Which Code civil articles are due to change soon? » (les entrées postérieures à aujourd'hui sont marquées comme programmées)

## Ce qu'il faut fournir

Donnez exactement l'un des deux paramètres `code` ou `text`, et une date de début.

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `code` | L'un des deux, `code` ou `text` | Le code à suivre. Pas en même temps que `text`. | Un titre de code comme `Code du travail` ou `Code civil` | Aucun |
| `text` | L'un des deux, `code` ou `text` | La loi, l'ordonnance, le décret ou l'arrêté à suivre. Pas en même temps que `code`. | `loi 78-17`, `décret 2019-1088`, un NOR comme `JUSX1234567A`, ou un identifiant `LEGITEXT…` ou `JORFTEXT…`. Natures : loi, loi organique, ordonnance, décret, arrêté. | Aucun |
| `since` | Oui | Début de la période. C'est une date d'entrée en vigueur. | Une date valide au format `YYYY-MM-DD` | Aucun |
| `until` | Non | Fin de la période. | Une date valide au format `YYYY-MM-DD`, pas avant `since` | Aujourd'hui (heure de Paris) |
| `page` | Non | La page de la liste. Au plus 100 entrées par page, moins quand les entrées sont longues ; la réponse donne la page suivante. | Un nombre entier, 1 ou plus | 1 |

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; l'extrait ci-dessous est indenté, et `…` marque les éléments omis. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `results`, ou `no_results` quand rien n'a été enregistré sur la période, ou quand vous demandez une page au-delà de la dernière.

```
{
  "source": "Légifrance",
  "outcome": "results",
  "warnings": [],
  "target": "code",
  "title": "Code civil",
  "id": "LEGITEXT000006070721",
  "link": "https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006070721",
  "since": "2025-01-01",
  "until": "2026-12-31",
  "results": 33,
  "amending_texts": 24,
  "scheduled": 1,
  "undetermined_versions": 0,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "amended_by": "LOI n°2025-391 du 30 avril 2025 - art. 16 (V)",
      "entries": [
        {
          "date": "2025-05-03",
          "action": "created",
          "article": "1254",
          "section": "Chapitre V : Sanction civile en cas de faute dolosive ayant causé des dommages sériels",
          "article_id": "LEGIARTI000051541660",
          "amending_article_id": "LEGIARTI000051540827",
          "scheduled": false
        }
      ]
    },
    {
      "amended_by": "LOI n°2025-412 du 12 mai 2025 - art. unique",
      "entries": [
        {
          "date": "2025-05-14",
          "action": "amended",
          "article": "2493",
          "section": "Titre Ier : Dispositions relatives au livre Ier",
          "article_id": "LEGIARTI000051583944",
          "amending_article_id": "LEGIARTI000051583822",
          "scheduled": false
        },
        {
          "date": "2025-05-14",
          "action": "amended",
          "article": "2495",
          "section": "Titre Ier : Dispositions relatives au livre Ier",
          "article_id": "LEGIARTI000051583934",
          "amending_article_id": "LEGIARTI000051583822",
          "scheduled": false
        }
      ]
    },
    …
  ],
  …
}
```

| Champ | Ce qu'il contient |
|---|---|
| `target`, `title`, `id`, `link` | Ce qui a changé : `code` ou `text`, son titre, son identifiant Légifrance et sa page officielle. |
| `since`, `until` | La période, en dates d'entrée en vigueur. |
| `results`, `amending_texts`, `scheduled` | Le nombre d'entrées sur toutes les pages, le nombre de textes modificatifs, et le nombre d'entrées postérieures à aujourd'hui (pas encore en vigueur). |
| `undetermined_versions` | Le nombre de versions de la période dont Légifrance laisse la date d'entrée en vigueur indéterminée. Elles ne sont pas listées. |
| `page`, `next` | Cette page et le nombre de pages, et la page suivante (`{ "page": 2 }`, ou `null`). |
| `items` | Un groupe par texte modificatif. |

Chaque groupe de `items` contient `amended_by` (le titre du texte modificatif) et `entries`, les modifications que ce texte a apportées. Une entrée contient :

| Champ | Ce qu'il contient |
|---|---|
| `date` | La date d'entrée en vigueur, non la date de publication. |
| `action` | `created`, `amended`, `repealed`, `codified`, `transferred` ou `linked`. |
| `article`, `section` | Le numéro de l'article et le titre de sa section, chacun `null` quand il n'est pas donné. |
| `article_id`, `amending_article_id` | Les identifiants Légifrance de l'article et de l'article modificatif, chacun `null` quand il n'est pas donné. |
| `scheduled` | `true` quand la date est postérieure à aujourd'hui. |

Précisions :

- **Groupes.** Les groupes sont classés selon la date de leur première entrée. Un même texte modificatif peut apparaître sur plusieurs pages quand ses entrées sont réparties.
- **Période vide.** `results` vaut `0` et `items` est vide.
- **Notes.** Quand certaines versions ont une date d'entrée en vigueur que Légifrance laisse indéterminée, `undetermined_versions` les compte et un avertissement le signale (`<n> versions in this range have an entry-into-force date Légifrance leaves undetermined and are not listed.`). Quand Légifrance n'a pas chargé le détail des versions de certaines années, un avertissement dit `Légifrance has not loaded the version detail for <years>: changes of those years may be missing.`
- **Pagination.** Une page contient au plus 100 entrées, moins si les entrées sont longues, et `next` vaut `{ "page": 2 }` quand il y a une suite. Une page au-delà de la dernière répond `no_results`, et `page` indique la page demandée et le nombre de pages.

### Erreurs

Une réponse d'erreur est un objet JSON avec `outcome: "error"` et un champ `error` qui contient un `kind` et un `message` (voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)). Celles qui sont propres à cet outil :

- `Give exactly one of "code" (a code title) or "text" (a law or decree).`
- `"until" (<date>) is before "since" (<date>).`
- `Unknown code "<code>". Did you mean: <titles>?` ou `Unknown code "<code>". Use the exact title of a code, e.g. "Code du travail". For a law or decree, use "text".`
- `Cannot read "<text>" as a text. Accepted: …` suivi des formes acceptées.
- `No text found for "<text>". Check the number, nature or id.`
- Quand le texte n'est pas unique, l'erreur liste les candidats avec leurs identifiants et demande l'identifiant `LEGITEXT` ou le NOR. Le même type de liste revient pour un numéro porté seulement par des textes d'une autre nature (donnez l'identifiant `LEGITEXT` de celui que vous voulez), et pour des textes qui ne sont pas en vigueur aujourd'hui et qu'on ne peut pas distinguer (donnez l'identifiant `JORFTEXT` ou le NOR).

Les autres erreurs sont les mêmes pour tous les outils ; voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).

## Limites

> **Les dates sont des dates d'entrée en vigueur, non des dates de publication.** Pour lister ce que le Journal officiel a publié à une date, utilisez [`legifrance_latest_jo`](legifrance_latest_jo.md).

- L'outil liste les modifications ; il ne montre pas la rédaction avant ou après. Pour les versions d'un article, utilisez [`legifrance_get_article_history`](legifrance_get_article_history.md), et pour lire un article à une date, utilisez [`legifrance_get_article`](legifrance_get_article.md).
- Les versions dont Légifrance laisse la date d'entrée en vigueur indéterminée ne sont pas listées, et la réponse dit combien il y en a.
- Les années pour lesquelles Légifrance n'a pas chargé le détail des versions peuvent manquer, et la réponse les nomme.
- Les conventions collectives ne sont pas prises en charge.

## Voir aussi

- [`legifrance_get_article_history`](legifrance_get_article_history.md)
- [`legifrance_get_text`](legifrance_get_text.md)
- [`legifrance_latest_jo`](legifrance_latest_jo.md)
- [Le Journal officiel et le suivi des modifications](../20-using/04-journal-officiel.md)
