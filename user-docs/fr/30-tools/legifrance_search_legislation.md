---
title: "legifrance_search_legislation"
level: reference
tags: [tool, legifrance, search, codes, loda, jorf, kali]
summary: "Rechercher dans les codes, les lois et décrets consolidés, le Journal officiel et les conventions collectives nationales, et obtenir une liste de résultats avec leurs liens."
updated: 2026-11-17
---

# legifrance_search_legislation

Recherche la législation française sur Légifrance dans l'un des quatre fonds et liste les résultats, chacun avec son lien officiel. Servez-vous-en pour trouver un texte ou un article quand vous ne connaissez pas sa référence exacte.

## Ce que vous pouvez demander

- « Cherche les articles du Code du travail qui parlent du télétravail. » / « Search the Code du travail for articles about remote work. »
- « Trouve l'ordonnance n° 2016-131. » / « Find ordonnance 2016-131. »
- « Retrouve le texte publié au Journal officiel sous le NOR JUSC1522466R. » / « Find the text published in the Journal officiel under NOR JUSC1522466R. »
- « Quelle est la convention collective IDCC 1486 ? » / « Which collective agreement is IDCC 1486? »

## Ce qu'il faut fournir

`collection` est le seul paramètre toujours obligatoire. Vous devez aussi donner au moins l'un des paramètres `query`, `article_number`, `text_number`, `nor` ou `idcc` : `code`, `nature` et les dates de publication ne font que restreindre une recherche et ne suffisent pas seuls. Les valeurs vides comptent comme non fournies.

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `collection` | Oui | Où chercher. | `codes` (codes consolidés), `loda` (lois, ordonnances, décrets et arrêtés consolidés), `jorf` (le Journal officiel, dans sa version publiée), `kali` (conventions collectives nationales) | Aucun |
| `query` | L'un des cinq critères de recherche | Les mots à rechercher. | Texte libre | Aucun |
| `code` | Non | Restreint une recherche `codes` à un seul code. | Un titre de code comme `Code civil` | Tous les codes |
| `article_number` | L'un des cinq | Un numéro d'article tel qu'on le cite. | `1240`, `L. 1234-1` | Aucun |
| `text_number` | L'un des cinq | Le numéro d'un texte. | `2016-131` pour l'ordonnance n°2016-131 | Aucun |
| `nor` | L'un des cinq | L'identifiant NOR d'un texte publié au Journal officiel. | Un NOR comme `JUSC1522466R` | Aucun |
| `nature` | Non | Restreint par nature de texte. | `LOI`, `ORDONNANCE`, `DECRET`… | Toutes |
| `idcc` | L'un des cinq | Le numéro IDCC d'une convention collective. | Un numéro comme `1486` | Aucun |
| `at_date` | Non | La date à laquelle les textes doivent être en vigueur. Seulement pour `codes` et `loda`. | Une date valide au format `YYYY-MM-DD` | Aujourd'hui (heure de Paris) |
| `include_historical` | Non | `true` renvoie toutes les versions, quelles que soient leurs dates ; `at_date` est alors ignoré. | `true` ou `false` | `false` |
| `published_from` | Non | Date de publication la plus ancienne. Seulement pour `jorf`. | `YYYY-MM-DD` | Aucun |
| `published_to` | Non | Date de publication la plus récente. Seulement pour `jorf`. | `YYYY-MM-DD`, pas avant `published_from` | Aucun |
| `page` | Non | La page de résultats. | Un nombre entier, 1 ou plus | 1 |
| `page_size` | Non | Le nombre de résultats par page. | Un nombre entier de 1 à 50 | 10 |
| `response_format` | Non | La part de chaque extrait à afficher. | `concise` (extraits coupés à 200 caractères) ou `detailed` (extraits complets) | `concise` |

### Quels paramètres vont avec quel fonds

Un paramètre qui n'appartient pas au fonds est refusé avec `"<parameter>" does not apply to the <collection> collection.`

| Fonds | Critères de recherche acceptés | Restrictions acceptées |
|---|---|---|
| `codes` | `query`, `article_number` | `code` |
| `loda` | `query`, `article_number`, `text_number`, `nor` | `nature` |
| `jorf` | `query`, `article_number`, `text_number`, `nor` | `nature`, `published_from`, `published_to` |
| `kali` | `query`, `idcc` | aucune |

### Ce que « en vigueur » veut dire dans chaque fonds

| Fonds | Versions obtenues |
|---|---|
| `codes`, `loda` | Les versions en vigueur à la date `at_date` (aujourd'hui par défaut), ou toutes les versions avec `include_historical`. |
| `jorf` | Les textes dans leur version publiée au Journal officiel. Il n'y a pas de filtre « en vigueur » : utilisez `published_from` et `published_to`. Les résultats sont listés de la publication la plus récente à la plus ancienne. |
| `kali` | Les conventions actuellement en vigueur, étendues ou non. `at_date` ne s'applique pas et est refusé. Avec `include_historical`, toutes les versions. |

Pour les autres fonds, les résultats suivent l'ordre de pertinence de Légifrance.

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; l'extrait ci-dessous est indenté. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le type de réponse (`outcome`) vaut `results`, ou `no_results` quand rien ne correspond (`items` est alors vide ; l'avertissement sur les numéros d'article ci-dessous peut tout de même apparaître).

```
{
  "source": "Légifrance",
  "outcome": "results",
  "warnings": [
    "(Counts include texts filtered out by the article number; showing matches only.)"
  ],
  "collection": "codes",
  "scope": "in_force_on",
  "results": 1,
  "page": {
    "number": 1,
    "of": 1
  },
  "next": null,
  "items": [
    {
      "kind": "article",
      "title": "Code civil",
      "number": "1240",
      "id": "LEGIARTI000032041571",
      "text_id": "LEGITEXT000006070721",
      "nature": "code",
      "nor": null,
      "published": null,
      "legifrance_status": "VIGUEUR",
      "from": "2016-10-01",
      "until": null,
      "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571",
      "excerpt": "[...]Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duque…",
      "read_with": {
        "tool": "legifrance_get_article",
        "id": "LEGIARTI000032041571"
      }
    }
  ],
  …
}
```

| Champ | Ce qu'il contient |
|---|---|
| `collection` | Le fonds interrogé : `codes`, `loda`, `jorf` ou `kali`. |
| `scope` | La portée des dates, voir plus bas. |
| `results` | Le nombre de résultats sur toutes les pages. |
| `page`, `next` | Cette page et le nombre de pages, et la page suivante (`{ "page": 2 }`, ou `null`). |
| `items` | Un objet par résultat. |

Les valeurs de `scope` :

| `scope` | Signification |
|---|---|
| `in_force_on` | Les versions en vigueur à la date `request.at_date` (`codes` et `loda`). Pour `kali` : les conventions actuellement en vigueur, étendues ou non, sans date. |
| `all_versions` | Toutes les versions, quelles que soient leurs dates (`include_historical`). |
| `as_published` | Les textes dans leur version publiée au Journal officiel (`jorf`) : il n'y a pas de filtre « en vigueur ». |

Un résultat contient :

| Champ | Ce qu'il contient |
|---|---|
| `kind` | `article` ou `text`. |
| `title`, `number` | Le titre du texte auquel appartient le résultat (ou du texte lui-même), et le numéro de l'article (`null` pour un texte). |
| `id`, `text_id` | L'identifiant Légifrance de la version de l'article ou du texte, et celui du texte auquel il appartient. |
| `nature`, `nor`, `published` | La nature du texte, son NOR et sa date de publication, chacun `null` quand il n'est pas donné. |
| `legifrance_status`, `from`, `until` | Le libellé propre à Légifrance et les dates de vigueur, chacun `null` quand il n'est pas donné. |
| `link` | La page officielle, construite par Vigueur à partir de l'identifiant. |
| `excerpt` | Le passage qui correspond, coupé à 200 caractères dans une réponse `concise` (`detailed` le donne en entier) ; `null` quand il n'y en a pas. Les marqueurs `[...]` montrent où le passage est coupé. |
| `read_with` | L'appel qui lit l'article ou le texte en entier, par exemple `{ "tool": "legifrance_get_article", "id": "…" }`. `null` quand aucun outil ne le lit : un article issu du Journal officiel n'est pas proposé à `legifrance_get_article`, il n'a que son `link`. Quand `include_historical` vaut `true` (`scope` vaut `all_versions`), le `read_with` d'un résultat de type texte porte un `at_date` égal à la date `from` de la version listée, de sorte que la lecture donne cette version (pas d'`at_date` quand Légifrance ne donne pas de date de début). |

Quand vous avez donné un `article_number`, le total de Légifrance compte des textes que le filtre sur l'article retire ensuite ; `warnings` dit donc : `(Counts include texts filtered out by the article number; showing matches only.)`

Une page est plafonnée à environ 40 000 caractères. Si des résultats longs ne tiennent pas tous, un avertissement dit `(Only the first <n> of <total> hits of this page fit — use a smaller "page_size".)` Une page au-delà de la dernière répond `no_results`, et `page` indique la page demandée et le nombre de pages.

### Erreurs

Une réponse d'erreur est un objet JSON avec `outcome: "error"` et un champ `error` qui contient un `kind` et un `message` (voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)). Celles qui sont propres à cet outil :

- `Give at least one of "query", "article_number", "text_number", "nor" or "idcc": "code", "nature" and the publication dates only narrow a search.`
- `"at_date" does not apply to the jorf collection: the Journal officiel is searched as published. Filter by publication date with "published_from" / "published_to".` Pour `kali`, le message renvoie plutôt aux conventions actuellement en vigueur, ou à toutes les versions avec `include_historical`.
- `"published_to" (<date>) is before "published_from" (<date>).`
- `Unknown code "<code>". Did you mean: <titles>?` ou, sans suggestion, `Unknown code "<code>". Use the exact title of a code, e.g. "Code civil".` Vigueur ne remplace jamais votre saisie par une suggestion.
- Un `page_size` qui n'est pas compris entre 1 et 50, un `page` inférieur à 1, ou une date `YYYY-MM-DD` non valide est refusé avant toute recherche.

Les autres erreurs (identifiants manquants, quota, source indisponible, aucune réponse en 45 secondes) sont les mêmes pour tous les outils ; voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).

## Limites

> **Une recherche liste des résultats ; elle ne les lit pas.** Un résultat montre un extrait. Pour lire un article en entier, utilisez [`legifrance_get_article`](legifrance_get_article.md) ; pour lire un texte en entier, utilisez [`legifrance_get_text`](legifrance_get_text.md).

- La jurisprudence n'est pas recherchée ici : voir [`legifrance_search_case_law`](legifrance_search_case_law.md) et [`judilibre_search_decisions`](judilibre_search_decisions.md).
- `jorf` et `kali` n'ont pas de filtre « en vigueur à une date », comme le dit le tableau ci-dessus.
- La valeur de `nature` est transmise à Légifrance telle que vous la donnez. [`legifrance_list_reference_values`](legifrance_list_reference_values.md) liste les natures qui apparaissent au Journal officiel.
- Les résultats sont ce que Légifrance renvoie pour les mots que vous avez donnés ; l'ordre et les extraits sont ceux de Légifrance.

## Voir aussi

- [`legifrance_get_article`](legifrance_get_article.md)
- [`legifrance_get_text`](legifrance_get_text.md)
- [`legifrance_list_reference_values`](legifrance_list_reference_values.md)
- [Codes, lois et décrets](../20-using/02-legislation.md)
