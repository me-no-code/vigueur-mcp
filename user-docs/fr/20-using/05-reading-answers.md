---
title: "Lire les réponses de Vigueur"
level: guide
tags: [answers, envelope, status, links, pagination, errors]
summary: "Comprenez les parties communes à toutes les réponses de Vigueur : les champs de l'enveloppe, le type de réponse, le statut de vigueur, les avertissements, la pagination, le contenu en cache et les erreurs."
updated: 2026-11-17
---

# Lire les réponses de Vigueur

Claude résume en général ce que Vigueur renvoie, mais les réponses de Vigueur ont une forme fixe, et
vous pouvez demander à Claude de vous en montrer une telle quelle. Chaque réponse est un objet
JSON : une liste de champs nommés, chacun contenant un fait. Elle est transmise sur une seule ligne de
JSON.
Les extraits de cette page sont indentés pour être lisibles, et `…` marque les champs ou le texte omis.
Cette page explique les parties que partagent tous les types de réponses.

## Ce que contient toute réponse

Quel que soit l'outil, une réponse commence et se termine par les mêmes champs. Entre les deux se
trouvent les champs propres à l'outil, que sa page sous [Outils](../30-tools/legifrance_get_article.md)
explique :

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [],
  …
  "request": {
    "tool": "legifrance_get_article",
    "code": "Code civil",
    "number": "1240",
    "at_date": "2026-11-16",
    "response_format": "concise",
    "offset": 0,
    "include_neighbours": false
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

| Champ | Ce qu'il contient |
|---|---|
| `source` | D'où viennent les faits : `Légifrance`, `Judilibre`, ou `PISTE` pour `vigueur_status`. |
| `outcome` | Le type de réponse : voir la section suivante. |
| `warnings` | Des phrases sur la réponse qu'aucun autre champ ne donne. Vide (`[]`) quand il n'y a rien à dire. Voir [Avertissements](#avertissements). |
| les champs propres à l'outil | Le texte, les dates, le statut, les identifiants, le lien, ou la liste des résultats. |
| `request` | L'appel qui a été fait : le nom de l'outil, puis chaque paramètre avec la valeur utilisée. Une valeur par défaut apparaît telle qu'elle a été appliquée : une date que vous n'avez pas donnée apparaît donc comme la date du jour. |
| `retrieved` | Le moment où Vigueur a constitué la réponse à partir de ce que la source a renvoyé, en UTC, à la seconde. |
| `cached` | Le contenu venu de la mémoire de Vigueur plutôt que d'une nouvelle requête, chaque élément avec ce qu'il est et le moment où il a été récupéré. Vide (`[]`) quand tout a été récupéré pour cet appel. Voir [Contenu en cache](#contenu-en-cache). |
| `vigueur_version` | La version de Vigueur qui a répondu. |

Chaque champ qu'un outil liste est toujours présent. Quand la source ne donne aucune valeur, le champ
vaut `null` (ou `[]` pour une liste), jamais omis : `null` signifie que la source n'a rien donné. Les
noms de champs sont en anglais, en minuscules, avec des tirets bas ; les valeurs gardent l'orthographe de la
source, accents compris. Les dates sont au format `YYYY-MM-DD`.

## Le type de réponse dit à quoi vous avez affaire

| `outcome` | Signification | Où |
|---|---|---|
| `found` | L'article, le texte ou la décision demandés, en entier ou en partie. | Outils de lecture |
| `results` | Une liste : résultats, modifications, sections, valeurs. | Outils de recherche, de liste et de parcours ; `vigueur_status` quand il a vérifié les sources |
| `no_results` | La recherche ou la liste a bien eu lieu mais n'a rien donné, ou vous avez demandé une page au-delà de la dernière. | Outils de recherche, de liste et de parcours ; `legifrance_get_text` et `legifrance_get_article_history` pour une page au-delà de la dernière |
| `not_found` | Ce que vous avez demandé n'existe pas dans la source. C'est une réponse, non une erreur. | Outils de lecture |
| `several_matches` | Votre citation correspond à plusieurs éléments ; la réponse les liste et n'en choisit aucune. | `legifrance_get_article`, `legifrance_get_article_history`, `legifrance_get_text` |
| `not_in_force` | L'article ou le texte existe, mais rien ne s'appliquait à la date. La réponse liste les versions enregistrées. | `legifrance_get_article`, `legifrance_get_text` |
| `not_configured` | L'accès à PISTE n'est pas configuré ; la réponse contient les étapes de configuration. | `vigueur_status` |
| `error` | L'appel a échoué : voir [Quand quelque chose ne va pas](#quand-quelque-chose-ne-va-pas). | N'importe quel outil |

## « En vigueur à une date » se calcule à partir de dates

Quand vous lisez un article, un texte ou une section d'un code, la réponse contient un `status` qui dit si
l'élément s'appliquait à la date demandée (aujourd'hui par défaut). Vigueur le calcule à partir des
dates de validité de la version, et non à partir du libellé de statut de Légifrance :

```
"status": {
  "state": "in_force",
  "on": "2026-11-16",
  "from": "2016-10-01",
  "until": null,
  "until_undetermined": false
}
```

| Champ | Ce qu'il contient |
|---|---|
| `state` | L'une des quatre valeurs ci-dessous. |
| `on` | La date à laquelle l'état s'applique. |
| `from` | Le premier jour de la version ; `null` quand la source n'en donne aucun. |
| `until` | Le dernier jour de la version ; `null` quand la source n'en donne aucun. |
| `until_undetermined` | `true` quand Légifrance enregistre une fin (une abrogation) mais n'en a pas fixé la date. |

| `state` | Signification |
|---|---|
| `in_force` | Les dates couvrent le jour `on`. `until` peut contenir une fin programmée, ou valoir `null`. |
| `not_in_force` | La version a pris fin avant `on`. `from` et `until` donnent la période où elle s'appliquait. |
| `not_yet_in_force` | La version commence après `on`. `from` est son début ; `until` sa fin, s'il y en a une. |
| `never_applied` | Une version qui n'a jamais été appliquée (une version mort-née). |

Une version s'applique de son premier jour jusqu'à sa date de fin, celle-ci non comprise. Le libellé
propre à Légifrance est donné à côté du statut, dans `legifrance_status` (par exemple `VIGUEUR` ou
`MODIFIE` ; voir le [glossaire](../00-intro/03-glossary.md#statut-le-mot-de-légifrance)). Un libellé et
les dates peuvent se contredire : la réponse ajoute alors un avertissement plutôt que de choisir.
Exemples :

- `Légifrance marks this version in force, but also records its abrogation by … (effective 2026-03-01).`
  La même phrase dit `as entering into force` pour une version que Légifrance marque comme différée.
- `Repeal scheduled; Légifrance has not set its date.`
- `Légifrance's dated search found no version for D, but this period covers it: …`

Vigueur signale la contradiction et vous laisse l'interpréter.

Quand la date ne tombe dans aucune période, le type de réponse est `not_in_force` : l'article existe mais
n'était pas en vigueur ce jour-là, et `periods` liste les versions enregistrées, pour que vous puissiez
reposer la question avec une date comprise dans l'une d'elles.

## Avertissements

`warnings` est une liste de phrases. Chacune est un fait sur la réponse qu'aucun champ ne donne : une
contradiction dans les données de la source (voir ci-dessus), une vérification supplémentaire que
Vigueur n'a pas pu mener à bien (un article voisin qui n'a pas pu être lu, une recherche de
concordance qui a échoué), une note sur ce que la source ne détient pas, ou les phrases d'une réponse
`not_found` ou `no_results` qui disent ce qui a été cherché. Le reste de la réponse reste valable. La
liste est vide quand il n'y a rien à dire.

Les énoncés qui viennent de la concordance de Légifrance le disent : `per Légifrance concordance`. Un
énoncé que Vigueur a déduit lui-même le dit aussi : `inferred from text comparison`. Voir
[Codes, lois et décrets](02-legislation.md).

## Chaque résultat dit comment le lire en entier

Un résultat de recherche porte un champ `read_with` qui nomme l'appel qui permet de le lire :

```
"read_with": { "tool": "judilibre_get_decision", "id": "6abcc10bc27382d099087409" }
```

Une recherche ne montre qu'un extrait ; le texte entier demande une seconde requête, que Claude fait
pour vous quand vous demandez à le lire. Un résultat qu'aucun outil ne lit, tel qu'un article publié au
Journal officiel, a `"read_with": null` et seulement son `link`. Une décision qui existe dans l'autre
source le dit dans `other_source`.

Les liens (`link`) pointent vers la page officielle. Vigueur les construit à partir des identifiants de
la source.

## « Introuvable » ne veut pas dire « vouliez-vous dire »

Vigueur ne substitue jamais une correspondance proche à ce que vous avez demandé. Quand rien n'est
trouvé, le type de réponse est `not_found` et les avertissements disent ce qui a été cherché.

- **Code inconnu.** `reason` vaut `unknown_code`, et l'avertissement dit `Unknown code "C. route": no
  Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.`
  `did_you_mean` peut lister des titres qui contiennent ce que vous avez saisi (`Did you mean: …? (suggestions only —
  call again with the exact code title)`).
- **Aucun article.** `No article 99999 in Code civil on Légifrance.` ou `No Légifrance article with id …`
  signifie que Légifrance n'en détient aucun ; Vigueur ne devine pas.
- **Un texte qui n'est pas en vigueur.** Le type de réponse est `not_in_force`, et chaque candidat dit pourquoi il n'est
  pas en vigueur à cette date.
- **Une décision.** `No Légifrance decision with id "…".` ou `No Judilibre decision with id "…".`

Une suggestion n'est qu'une suggestion. Reposez la question avec le nom exact.

## Les citations ambiguës listent les candidats et n'en choisissent aucun

Quand une citation correspond à plusieurs éléments, le type de réponse est `several_matches` : la réponse liste
les candidats et s'arrête.

```
"outcome": "several_matches",
"warnings": [
  "Article L1234-1 exists in several codes — call again with \"code\"."
],
"candidates": [
  { "id": "LEGIARTI000006901112", "code": "Code du travail", "from": "2008-05-01", … },
  { "id": "LEGIARTI000006686176", "code": "Code de la santé publique", "from": "2004-08-07", … }
],
```

Précisez celui que vous visez. Il en va de même quand un code contient plusieurs versions d'un article en
vigueur en même temps (les candidats portent leurs identifiants), et quand plusieurs lois ou décrets
partagent un numéro.

## Les longues réponses sont coupées et paginées

Une réponse contient jusqu'à 40 000 caractères. Ce qui ne rentre pas n'est pas perdu ; la réponse dit
comment obtenir la suite, avec les champs `page`, `part` et `next`.

| Où | Ce que vous voyez | Comment continuer |
|---|---|---|
| Listes (résultats de recherche, modifications, historique, plan, Journal officiel) | `page` donne `number` et `of` (la page où vous êtes et le nombre de pages) ; `next` vaut `{ "page": 2 }` | Demandez la page suivante |
| Texte long (article, décision) | `part` donne `from`, `to` et `of` (les caractères affichés et la longueur du texte entier) ; `next` vaut `{ "offset": <number> }` | Demandez à Claude de continuer ; il répète la requête avec ce décalage |
| Il ne reste rien | `next` vaut `null` | |
| Une page trop longue | Un avertissement : `(Only the first 7 of 10 hits of this page fit — use a smaller "page_size".)` | Demandez moins de résultats par page |

À titre d'illustration de la forme (ce n'est pas une réponse enregistrée), la première page d'une liste
de trois pages :

```
"page": { "number": 1, "of": 3 },
"next": { "page": 2 },
```

Chaque page d'un article répète son identité, son `status` et son `link`, si bien que le verdict « en
vigueur » accompagne chaque partie. Demander une page au-delà de la fin donne `no_results`, et `page`
dit quelle page vous avez demandée et combien il y en a. Sur une page de décision, le sommaire et les
listes qui précèdent le texte sont raccourcis quand ils laisseraient trop peu de place au texte ; le
texte lui-même est paginé, jamais raccourci.

## Contenu en cache

Certains contenus sont gardés en mémoire par Vigueur pendant un court moment, comme la liste des codes,
la table des matières d'un code ou les listes de chambres de Judilibre. Quand une réponse montre un
contenu venu de cette mémoire, `cached` dit ce que c'est et quand il a été récupéré :

```
"cached": [
  { "what": "Code du travail table of contents on 2026-11-16", "retrieved": "2026-11-16T10:42:07Z" }
]
```

Quand chaque partie de la réponse a été récupérée pour cet appel, `cached` vaut `[]`. Voir
[Confidentialité et données](../00-intro/04-privacy-and-your-data.md) pour ce que Vigueur conserve.

## Le délai

Chaque requête que Claude fait à Vigueur dispose de 45 secondes en tout, nouvelles tentatives
comprises. Si ce délai est dépassé, la réponse est une erreur avec `kind` `deadline` : `Légifrance did not answer within 45 s. Try again in a
moment.` (ou Judilibre). Reposez la question.

## Quand quelque chose ne va pas

Un appel qui échoue donne un objet JSON dont l'`outcome` vaut `error`. Il est marqué comme une erreur,
si bien que Claude le traite comme un échec :

```
{
  "source": "Légifrance",
  "outcome": "error",
  "error": {
    "kind": "forbidden",
    "message": "Légifrance: access refused (HTTP 403) PISTE refused this request (HTTP 403). Call vigueur_status to check that the API is enabled on your PISTE application."
  },
  "request": {
    "tool": "legifrance_get_article",
    "code": "Code civil",
    "number": "1240",
    "at_date": "2026-11-16",
    "response_format": "concise",
    "offset": 0,
    "include_neighbours": false
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "vigueur_version": "0.1.0"
}
```

| Champ | Ce qu'il contient |
|---|---|
| `source` | La source qui a échoué (`PISTE` pour `vigueur_status`). |
| `outcome` | `error`. |
| `error.kind` | La famille d'échec. Voir le tableau ci-dessous. |
| `error.message` | Ce qui s'est passé, puis ce qu'il faut faire. |
| `request` | L'appel qui a échoué. |
| `retrieved` | Présent seulement quand une source a répondu (par exemple par un refus HTTP). |
| `vigueur_version` | La version de Vigueur qui a répondu. |

Une erreur n'a ni `warnings` ni `cached`. Les valeurs de `kind` :

| `kind` | Situation | Ce que dit le message |
|---|---|---|
| `credentials_invalid` | Identifiants rejetés | `PISTE rejected the credentials. Check PISTE_CLIENT_ID and PISTE_CLIENT_SECRET, and PISTE_ENV (sandbox credentials only work with PISTE_ENV=sandbox). In Claude Code with the Vigueur plugin, they are the plugin settings: change them with /plugin configure vigueur@vigueur, then reconnect with /mcp. In another MCP client, they are environment variables in its configuration. Call vigueur_status to diagnose.` |
| `forbidden` | Accès refusé (HTTP 403) | `PISTE refused this request (HTTP 403). Call vigueur_status to check that the API is enabled on your PISTE application.` |
| `quota_exceeded` | Quota atteint | `PISTE quota reached. Retry in about N s.` (ou `Wait a moment and try again.`) |
| `upstream_unavailable` | PISTE en panne ou lent | `PISTE is unavailable or timed out. Wait a moment and try again…` |
| `unexpected_response` | Réponse inattendue | La source a renvoyé quelque chose que Vigueur ne comprend pas, peut-être un changement d'API |
| `not_found` | La source a répondu que ce qui est demandé n'existe pas (HTTP 404) | Le message seul : `<source>: not found (HTTP 404)` |
| `deadline` | Pas de réponse en 45 secondes | `Légifrance did not answer within 45 s. Try again in a moment.` |
| `invalid_input` | Une requête que l'outil refuse | Le message seul, par exemple `"date_from" must not be after "date_to".` |
| `cancelled` | L'appel a été arrêté | Il n'y a pas de problème |
| `unexpected` | Tout le reste | `Unexpected error: … Call vigueur_status to check the setup.` |

Demandez d'abord à Claude de lancer `vigueur_status` : il vérifie les deux sources et indique
comment corriger. Voir [`vigueur_status`](../30-tools/vigueur_status.md).

## Voir aussi

- [Prise en main : vos premières questions](01-quickstart.md)
- [Codes, lois et décrets](02-legislation.md)
- [Jurisprudence](03-case-law.md)
