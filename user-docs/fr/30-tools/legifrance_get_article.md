---
title: "legifrance_get_article"
level: reference
tags: [tool, legifrance, article, code]
summary: "Lire un article d'un code français à une date donnée, et voir s'il était en vigueur à cette date et où son contenu a été déplacé."
updated: 2026-11-18
---

# legifrance_get_article

Lit sur Légifrance un article d'un code français (Code civil, Code du travail…), tel qu'il était à la date de votre choix. La réponse indique si l'article était en vigueur à cette date, où il se trouve dans le code, et renvoie vers la page officielle.

## Ce que vous pouvez demander

- « Donne-moi l'article L1234-1 du Code du travail. » / « Show me article 1240 of the Code civil. »
- « Quel était le texte de l'article 1382 du Code civil au 1er janvier 2015 ? » / « What did article 1382 of the Code civil say on 2015-01-01? »
- « L'article 1240 était-il en vigueur à la date de signature du contrat, le 12 mars 2012 ? » / « Was article 1240 in force when the contract was signed on 2012-03-12? »
- « Montre-moi l'article 1240 et les articles qui l'entourent. » / « Show me article 1240 and its neighbours. »

## Ce qu'il faut fournir

Donnez soit un code et un numéro d'article, soit un identifiant Légifrance. Tout le reste est facultatif. Une valeur vide compte comme non fournie.

| Nom | Obligatoire | Signification | Valeurs acceptées | Défaut |
|---|---|---|---|---|
| `code` | Non | Le code dans lequel chercher. Ignoré si vous donnez un `id`. | Le titre du code, comme `Code civil` ou `Code du travail`. Les abréviations courantes fonctionnent, par exemple `C. trav.`, `C. civ.`, `CGI`, `CPC`. | Tous les codes |
| `number` | Oui, sauf si vous donnez `id` | Le numéro de l'article tel qu'on le cite. | `1240`, `L1234-1`, `L. 1234-1`, `199 undecies B`. Un « article » ou « art. » en tête est ignoré. Pas en même temps que `id`. | Aucun |
| `id` | Oui, sauf si vous donnez `number` | L'identifiant Légifrance d'une version d'un article. | `LEGIARTI` (un article de code ou de loi) ou `KALIARTI` (un article de convention collective), suivi de 12 chiffres. Pas en même temps que `number`. | Aucun |
| `at_date` | Non | La date à laquelle lire l'article. Elle peut être passée ou future. | Une date valide au format `YYYY-MM-DD` | Aujourd'hui (heure de Paris) |
| `response_format` | Non | Le niveau de détail. | `concise` ou `detailed` (ajoute toutes les versions, les textes modificatifs et le nombre de textes qui citent l'article) | `concise` |
| `offset` | Non | Poursuit le texte d'un long article à partir d'une position en caractères. La réponse donne la valeur à utiliser. | Un nombre entier, 0 ou plus | 0 |
| `include_neighbours` | Non | Affiche aussi l'article précédent et l'article suivant de la même section. | `true` ou `false` | `false` |

Si vous donnez un code qui n'est pas un titre connu, rien n'est recherché : voir « Introuvable » plus bas.

## Ce que montre la réponse

La réponse est un objet JSON. Elle est transmise sur une seule ligne ; les extraits ci-dessous sont indentés pour la lecture, et `…` marque les champs ou le texte omis. Chaque champ prévu pour un type de réponse est toujours présent : un champ pour lequel la source ne donne aucune valeur vaut `null` (ou `[]` pour une liste), de sorte qu'une valeur manquante n'est jamais cachée. Les champs communs à toutes les réponses (`source`, `outcome`, `warnings`, `request`, `retrieved`, `cached`, `vigueur_version`) sont expliqués dans [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Le champ `outcome` indique le type de réponse obtenu : `found`, `not_in_force`, `several_matches` ou `not_found`.

### Un article trouvé (`found`)

```
{
  "source": "Légifrance",
  "outcome": "found",
  "warnings": [],
  "id": "LEGIARTI000032041571",
  "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041571",
  "status": {
    "state": "in_force",
    "on": "2026-11-16",
    "from": "2016-10-01",
    "until": null,
    "until_undetermined": false
  },
  "legifrance_status": "VIGUEUR",
  "code": "Code civil",
  …
  "number": "1240",
  "section": [
    "Livre III : Des différentes manières dont on acquiert la propriété",
    "Titre III : Des sources d'obligations",
    …
  ],
  …
  "relocation": null,
  …
  "part": null,
  "next": null,
  "text": "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige…",
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
| `id`, `link` | L'identifiant Légifrance de cette version de l'article, et la page officielle. Vigueur construit le lien à partir de l'identifiant. |
| `status` | Indique si cette version s'appliquait à la date `status.on` (voir plus bas). |
| `legifrance_status` | Le libellé propre à Légifrance (`VIGUEUR`, `MODIFIE`, `ABROGE`…), ou `null`. |
| `code`, `code_id`, `number` | Le titre et l'identifiant du code, et le numéro de l'article. |
| `section`, `section_id` | Les intitulés, de la partie la plus large du code jusqu'à la section qui contient l'article, et l'identifiant de cette section. |
| `note` | La note de Légifrance sur l'article, ou `null`. |
| `relocation` | Où le contenu de cette version est allé selon la concordance de Légifrance, ou si la version suivante a la même rédaction (voir plus bas) ; `null` quand rien de cela n'est enregistré. |
| `neighbours` | `null` sauf si vous les avez demandés : voir plus bas. |
| `versions`, `modifications`, `cited_by` | `null` dans une réponse `concise` ; remplis dans une réponse `detailed` : voir plus bas. |
| `part`, `next` | `null` quand le texte est entier. Voir « Un long article, découpé en pages » plus bas. |
| `text` | Le texte officiel de la version. Vide quand Légifrance n'en a pas. |

`status` est calculé à partir des dates de vigueur de la version, non à partir du libellé de Légifrance :

| `status.state` | Signification |
|---|---|
| `in_force` | Les dates couvrent le jour `on`. |
| `not_in_force` | La version a pris fin avant `on`. |
| `not_yet_in_force` | La version commence après `on`. |
| `never_applied` | La version n'a jamais été en vigueur. |

`from` est le premier jour de la version et `until` le jour où elle prend fin, non compris (le premier jour où elle ne s'applique plus), chacun `null` quand Légifrance n'en donne pas. `until_undetermined` vaut `true` quand Légifrance enregistre une fin (une abrogation) dont il n'a pas fixé la date. `on` est la date que vous avez demandée, aujourd'hui par défaut.

`relocation` dit ce qui a suivi la version affichée. Quand Légifrance enregistre que son contenu a été déplacé (une concordance), la réponse le signale :

```
"relocation": "Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V) (since 2016-10-01)."
```

Quand le déplacement est à venir, la phrase est `Content will move — per Légifrance concordance, … will be at … from <date>.` Quand Légifrance n'enregistre aucun déplacement et qu'une version suivante existe, la phrase dit seulement si cette version a la même rédaction : `The next version (in force from 2020-01-01, id LEGIARTI000000000002) has a different wording.` ou `… has the same wording.` Vigueur compare les deux textes tels quels, en ne laissant de côté que la typographie (forme des apostrophes et des tirets, espaces) : un changement de majuscule, d'accent ou de ponctuation est une rédaction différente. Sinon, `relocation` vaut `null`.

Avec `include_neighbours`, `neighbours` donne l'article précédent et l'article suivant de la section. Un voisin qui n'existe pas, ou qui n'a pas pu être lu, vaut `null` (un avertissement en donne alors la raison) :

```
{
  "source": "Légifrance",
  "outcome": "found",
  …
  "number": "1240",
  …
  "neighbours": {
    "previous": null,
    "next": {
      "number": "1241",
      "id": "LEGIARTI000032041565",
      "excerpt": "Chacun est responsable du dommage qu'il a causé non seulement par son fait, mais encore pa…",
      "excerpt_cut": false,
      "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032041565"
    }
  },
  …
  "text": "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute…",
  …
}
```

Chaque voisin affiche les 200 premiers caractères de son texte ; `excerpt_cut` vaut `true` quand le texte est plus long.

Avec `detailed`, `versions` liste toutes les versions de l'article (`shown` marque celle de cette réponse), `modifications` liste les textes qui l'ont créé, modifié ou abrogé, et `cited_by` compte les textes qui le citent :

```
{
  "source": "Légifrance",
  "outcome": "found",
  …
  "status": {
    "state": "in_force",
    "on": "2015-01-01",
    "from": "1804-03-21",
    "until": "2016-10-01",
    "until_undetermined": false
  },
  …
  "relocation": "Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V)…",
  …
  "versions": [
    {
      "id": "LEGIARTI000006438819",
      "version": "1.0",
      "legifrance_status": "MODIFIE",
      "from": "1804-03-21",
      "until": "2016-10-01",
      "until_undetermined": false,
      "shown": true
    },
    {
      "id": "LEGIARTI000032042379",
      "version": "2.0",
      "legifrance_status": "VIGUEUR",
      "from": "2016-10-01",
      "until": null,
      "until_undetermined": false,
      "shown": false
    }
  ],
  "modifications": [
    {
      "action": "codified",
      "by": "Loi 1804-02-09",
      "effective": null
    },
    {
      "action": "created",
      "by": "Loi 1804-02-09 promulguée le 19 février 1804",
      "effective": null
    }
  ],
  "cited_by": 65,
  …
}
```

Avertissements que vous pouvez rencontrer, chacun étant une entrée de `warnings` :

- `Légifrance marks this version in force, but also records its abrogation by <text> (effective <date>).` Le libellé de Légifrance et l'abrogation qu'il enregistre se contredisent ; la réponse montre les deux et ne tranche pas.
- `Repeal scheduled; Légifrance has not set its date.`
- `Could not check where this content moved (<reason>).` L'article est affiché sans la vérification du déplacement.
- `Could not read the neighbouring articles (<reason>).`

### Un long article, découpé en pages

Une réponse contient au plus 40 000 caractères. Seul le texte de l'article est coupé : chaque page répète l'identité de l'article, `status`, la note, les avertissements et le lien. Quand le texte est coupé, `part` donne les caractères affichés (`from`, `to`, et `of`, la longueur du texte entier) et `next` donne `{ "offset": <number> }`, la position où reprend la suite. Quand il ne reste rien, `next` vaut `null`. Demandez à Claude de continuer et il passera cet `offset`. Un `offset` situé à la fin du texte ou au-delà (égal ou supérieur à sa longueur) est une erreur : `"offset" <n> is past the end of the article text (<length> characters). Call again without "offset".`

Pour un texte d'environ 64 000 caractères, la première page et la dernière page ressemblent à ceci (les autres champs sont les mêmes ; l'extrait ne garde que ceux qui changent) :

```
{
  …
  "status": {
    "state": "in_force",
    …
  },
  …
  "part": {
    "from": 0,
    "to": 38456,
    "of": 64201
  },
  "next": {
    "offset": 38456
  },
  "text": "I. – Les contribuables domiciliés en France au sens de l'article 4 B p…",
  "request": {
    …
    "offset": 0,
    …
  },
  …
}
```

```
{
  …
  "part": {
    "from": 38456,
    "to": 64201,
    "of": 64201
  },
  "next": null,
  "text": "'équipement portant sur des installations de production d'électricité…",
  "request": {
    …
    "offset": 38456,
    …
  },
  …
}
```

Un article qui tient sur une page a `part: null` et `next: null`, comme dans le premier extrait ci-dessus.

### Le numéro existe dans plusieurs codes (`several_matches`)

Rien n'est choisi à votre place. `candidates` liste les versions qui correspondent, chacune avec l'appel qui la lit dans `read_with` :

```
{
  "source": "Légifrance",
  "outcome": "several_matches",
  "warnings": [
    "Article L1234-1 exists in several codes — call again with \"code\"."
  ],
  "number": "L1234-1",
  "code": null,
  "candidates": [
    {
      "id": "LEGIARTI000006901112",
      "code": "Code du travail",
      "code_id": "LEGITEXT000006072050",
      "from": "2008-05-01",
      "legifrance_status": "VIGUEUR",
      "read_with": {
        "tool": "legifrance_get_article",
        "id": "LEGIARTI000006901112"
      }
    },
    {
      "id": "LEGIARTI000006686176",
      "code": "Code de la santé publique",
      "code_id": "LEGITEXT000006072665",
      "from": "2004-08-07",
      "legifrance_status": "VIGUEUR",
      "read_with": {
        "tool": "legifrance_get_article",
        "id": "LEGIARTI000006686176"
      }
    }
  ],
  "incomplete": false,
  "request": {
    "tool": "legifrance_get_article",
    "number": "L1234-1",
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

`code` vaut `null` quand les candidats se répartissent sur plusieurs codes. Si un même code contient plusieurs versions en vigueur, l'avertissement est `Article <n> has several versions in force in <code> — call again with "id".` et `code` le nomme. `incomplete` vaut `true` quand la liste peut être plus longue que ce qui a été lu ; l'avertissement ajoute alors `(Only the first matches are listed — give the code to narrow it down.)`

### Pas en vigueur à cette date (`not_in_force`)

L'article existe, mais rien ne s'appliquait ce jour-là. `periods` liste les versions enregistrées, de la plus ancienne à la plus récente, avec leurs dates et leurs liens :

```
{
  "source": "Légifrance",
  "outcome": "not_in_force",
  "warnings": [
    "Art. R4217-2 of Code du travail exists but was not in force on 2026-11-16.",
    "Call again with an \"at_date\" inside one of these periods to read that version."
  ],
  "number": "R4217-2",
  "code": "Code du travail",
  "on": "2026-11-16",
  "periods": [
    {
      "id": "LEGIARTI000018532352",
      "code": "Code du travail",
      "legifrance_status": "ABROGE",
      "from": "2008-05-01",
      "until": "2026-10-01",
      "until_undetermined": false,
      "link": "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000018532352"
    }
  ],
  "relocation": null,
  "incomplete": false,
  "request": {
    "tool": "legifrance_get_article",
    "code": "Code du travail",
    "number": "R4217-2",
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

`relocation` peut donner le déplacement du contenu (`Content moved — per Légifrance concordance, the text of art. R4217-2 (version 2008-05-01 → 2026-10-01) is now at …`). Quand les dates d'une période listée couvrent le jour alors que la recherche datée de Légifrance n'a rien trouvé, la réponse ne dit pas « was not in force ». Elle dit `Légifrance's dated search found no version in force on <date>. Versions on record.` et ajoute un avertissement qui nomme la période.

`incomplete` vaut `true` quand Légifrance a renvoyé une page complète de versions : d'autres versions peuvent donc exister. Les avertissements comprennent alors `Légifrance returned a full page of versions: more versions may exist.`, et `relocation` vaut `null`.

### Introuvable (`not_found`)

`reason` dit pourquoi :

| `reason` | Signification | Texte de l'avertissement |
|---|---|---|
| `unknown_id` | L'identifiant ne correspond à aucun article. | `No Légifrance article with id <id>.` |
| `no_article` | Le numéro n'a jamais été enregistré. | `No article <number> in <code> on Légifrance.` (ou `in any code`) |
| `unknown_code` | Le code n'est pas un titre connu : rien n'a été recherché. | `Unknown code "<code>": no Légifrance code has this title. Use the full title (e.g. "Code de la route") or omit the code.` |

Pour un code inconnu, `did_you_mean` propose jusqu'à cinq titres qui contiennent ce que vous avez saisi. Ce ne sont que des suggestions : Vigueur ne remplace jamais votre saisie par l'une d'elles. L'avertissement ajoute alors `Did you mean: Code civil? (suggestions only — call again with the exact code title)`.

### Erreurs

Une réponse d'erreur est un objet JSON avec `outcome: "error"` et un champ `error` qui contient un `kind` et un `message` (voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md#quand-quelque-chose-ne-va-pas)). Celles qui sont propres à cet outil :

- `Give an article number with its code (e.g. code "Code civil", number "1240") or a Légifrance article id (LEGIARTI…).` Ni numéro ni identifiant n'ont été donnés.
- `Give either an article number or an article id, not both.`
- `"<id>" is not a supported article id. …` L'identifiant n'a pas la forme `LEGIARTI` ou `KALIARTI`.
- Une date non valide est refusée, avec un message qui demande une date valide au format `YYYY-MM-DD`.

Les autres erreurs (identifiants manquants, quota, source indisponible, aucune réponse en 45 secondes) sont les mêmes pour tous les outils ; voir [Dépannage et FAQ](../00-intro/05-troubleshooting.md).

## Limites

> **Le verdict vient des dates.** « En vigueur » est calculé à partir des dates de vigueur que Légifrance donne pour la version. Vigueur le rapporte, ainsi que tout désaccord avec le libellé de Légifrance ; il ne dit pas ce que l'article signifie pour votre cas.

- Une seule version d'article par réponse. Pour voir toutes les versions et les textes qui les ont modifiées, utilisez [`legifrance_get_article_history`](legifrance_get_article_history.md).
- L'outil lit les articles de codes par leur numéro, et les articles de codes, de lois et de conventions collectives par leur identifiant. Il ne lit pas les lois ou décrets entiers : utilisez [`legifrance_get_text`](legifrance_get_text.md).
- Il trouve un article par son numéro, non par ses mots : pour trouver des articles sur un sujet, utilisez [`legifrance_search_legislation`](legifrance_search_legislation.md).
- Quand un contenu a été déplacé, la réponse s'appuie sur les concordances que Légifrance a lui-même enregistrées. Sans concordance, elle dit seulement si la version suivante a la même rédaction, et non où le contenu est allé.

## Voir aussi

- [`legifrance_get_article_history`](legifrance_get_article_history.md) : toutes les versions d'un article et ce qui les a modifiées.
- [`legifrance_browse_code`](legifrance_browse_code.md) : situer un article dans un code.
- [`legifrance_search_legislation`](legifrance_search_legislation.md) : chercher par mots.
- [Codes, lois et décrets](../20-using/02-legislation.md)
- [Lire les réponses de Vigueur](../20-using/05-reading-answers.md)
