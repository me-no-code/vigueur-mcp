---
title: "Codes, lois et décrets"
level: guide
tags: [legislation, codes, articles, history, collective-agreements]
summary: "Lisez un article, un texte entier ou la table des matières d'un code, à n'importe quelle date, et trouvez les textes qui l'ont modifié."
updated: 2026-11-23
---

# Codes, lois et décrets

Depuis un assistant IA, vous pouvez lire la législation sur Légifrance : articles des codes, lois,
ordonnances, décrets, arrêtés et conventions collectives nationales. Ce guide présente ce que vous
pouvez demander et ce que vous obtenez en retour. Les paramètres de chaque outil se trouvent sur sa propre page, sous
[Outils](../30-tools/legifrance_get_article.md).

## Lire un article à partir de sa citation

Donnez un code et un numéro d'article, sous leur forme de citation habituelle :

> L'article 1240 du Code civil. / Article L. 1234-1 of the Code du travail.

L'assistant lance [`legifrance_get_article`](../30-tools/legifrance_get_article.md). Le code peut être une
abréviation courante comme « C. trav. ». Le numéro d'article peut s'écrire `L1234-1`, `L. 1234-1` ou
`199 undecies B`. Un identifiant Légifrance (`LEGIARTI` suivi de 12 chiffres) convient aussi.

La réponse donne le `text` de l'article, indique s'il est en vigueur à la date demandée (`status`,
calculé à partir de ses dates de vigueur), précise où il se trouve dans le code (`section`), donne sa
note ([nota](../00-intro/03-glossary.md#nota)) s'il y en a une, et le `link` officiel. Demandez la
forme détaillée pour obtenir en plus toutes les versions, les textes modificatifs et le nombre de
textes qui le citent.

Si le numéro existe dans plusieurs codes et que vous n'en avez nommé aucun, la réponse liste les
candidats et n'en choisit aucun (`"outcome": "several_matches"`) : nommez le code. Si un code contient
plusieurs versions en vigueur en même temps, la réponse liste leurs identifiants : reposez la
question avec l'identifiant voulu. Pour un article de convention collective, donnez son identifiant `KALIARTI`.

## Lire la version qui s'appliquait à une date

Ajoutez une date :

> Que disait cet article au 1er juin 2019 ? / What did article L1234-1 say on 2019-06-01?

La date peut être passée ou future (une version à venir), par exemple le jour de la signature d'un
contrat ou de la naissance d'un litige. Par défaut, c'est la date du jour.

Quand aucune version n'est en vigueur à cette date, la réponse ne dit pas « introuvable ». Son
`outcome` vaut `not_in_force` : l'article existe, mais il n'était pas en vigueur ce jour-là, et
`periods` liste les versions que Légifrance enregistre, chacune avec son état juridique, ses dates,
son identifiant et son lien. Reposez la question avec une date comprise dans l'une de ces périodes.

## Voir les articles voisins

> Montre-moi l'article précédent et le suivant. / Show me the articles before and after it.

La réponse remplit `neighbours` avec l'article précédent et l'article suivant de la même section,
chacun avec son numéro, ses premiers mots et un lien. Si un voisin ne peut pas être lu, il vaut `null`
et un avertissement le signale.

## Suivre l'historique d'un article et ses textes modificatifs

> Historique de l'article 1240. / Who amended article L1234-1, and when?

L'assistant lance [`legifrance_get_article_history`](../30-tools/legifrance_get_article_history.md). La
réponse donne :

- la version en vigueur aujourd'hui (`current`), calculée à partir des dates de vigueur ;
- la liste des `versions`, avec leur état juridique et leurs dates de début et de fin ;
- les événements (`items`), par date d'entrée en vigueur : création, modification, abrogation,
  codification ou transfert, et par quel texte. Une date future porte `"scheduled": true` ;
- la concordance (voir ci-dessous).

Les longs historiques sont découpés en pages de 100 événements au plus ; `next` vaut `{ "page": 2 }`
quand il y en a d'autres.

## Vérifier si un article a été renuméroté

Légifrance enregistre une concordance quand le contenu d'un article est passé à un autre numéro,
comme pour l'ancien article 1382 du Code civil, devenu 1240. Quand vous lisez l'ancien article, la
réponse le dit dans `relocation`, par une phrase qui l'attribue à la source :

```
"relocation": "Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V) (since 2016-10-01)."
```

Pour un déplacement qui n'a pas encore eu lieu, la phrase commence par `Content will move`.
L'historique d'un article donne les mêmes liens dans `concordance` : `moved` indique où est allé le
contenu d'une version, et `came_from` liste les articles dont le contenu se trouve maintenant à ce
numéro, par exemple `"came_from": ["Code civil - art. 1353 (M)"]` dans l'historique de l'article 1382.

> **Quand il n'y a pas de concordance**
> Sans concordance, Vigueur compare les mots de la version lue à ceux de la version suivante, et dit
> seulement s'ils sont identiques :
> `The next version (in force from 2020-01-01, id LEGIARTI000000000002) has a different wording.`
> ou `… has the same wording.` La comparaison ne tient compte ni de la casse, ni des accents, ni de la
> ponctuation. Elle ne dit rien de l'endroit où le contenu est allé. Sans version suivante à comparer,
> `relocation` vaut `null`.

## Lire une loi, une ordonnance, un décret ou un arrêté en entier

> Lis le décret 2005-1309. / Read the loi 78-17. / Outline of ordonnance 2016-131.

L'assistant lance [`legifrance_get_text`](../30-tools/legifrance_get_text.md). Vous identifiez un texte par
son identifiant Légifrance (`LEGITEXT…` pour la version consolidée, `JORFTEXT…` pour la version
publiée), son NOR, ou sa nature et son numéro. Les natures sont loi, loi organique, ordonnance,
décret et arrêté.

Il y a deux parties :

- **outline** (le plan, par défaut) : titre, état juridique, publication, et les sections avec leur
  nombre d'articles et leur `section_id` ;
- **articles** : les textes des articles, page par page. Demandez une seule section par son
  `section_id` pour éviter de lire le texte entier.

La version consolidée est celle en vigueur à la date que vous donnez (par défaut aujourd'hui). Un texte
lu par identifiant `JORFTEXT` ou par NOR est présenté dans sa version publiée au Journal officiel : sa
version initiale, sans les modifications ultérieures, et la réponse le dit.

Dans les articles, chaque article porte son propre `status`. Un article qui n'est pas en vigueur à la
date n'est pas présenté comme le droit de cette date : son `text` vaut `null` et la réponse dit
`Text not shown: not in force on …`.

Si plusieurs textes correspondent à une nature et à un numéro, la réponse (`several_matches`) les liste
et demande l'identifiant. Si Légifrance ne répertorie aucun texte de cette nature avec ce numéro, mais que
d'autres textes portent ce numéro, la réponse (`not_found`, avec `reason` `other_nature`) liste ces
autres textes.

Les conventions collectives ne se lisent pas ainsi. Trouvez-les avec la recherche (ci-dessous), puis
lisez un article avec son identifiant `KALIARTI`.

## Parcourir la table des matières d'un code

> Quels sont les titres du Livre I du Code du travail ? / Show me the structure of the Code de la route.

L'assistant lance [`legifrance_browse_code`](../30-tools/legifrance_browse_code.md). La première réponse
donne le niveau supérieur (livres, titres…). Chaque ligne porte un `section_id` ; demandez à l'assistant
d'ouvrir une section pour descendre d'un niveau, jusqu'aux articles.

Les sections qui ne sont pas en vigueur à la date (et, aujourd'hui, les articles abrogés) sont
masquées, avec un décompte : `(3 items not in force on … hidden — include_repealed: true to show them)`.
Si vous demandez à les inclure, le `status` de chaque section indique quand elle a pris fin ou quand
elle commence. À une date autre qu'aujourd'hui, les libellés des articles sont les libellés actuels de
Légifrance, et non leur état juridique à cette date : lisez l'article avec cette date pour vérifier.

## Rechercher

> Cherche la convention collective IDCC 1486. / Find texts about "télétravail" in force today.

L'assistant lance [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md), dans l'un
des quatre fonds :

| Fonds | Ce qu'il recherche | Dates |
|---|---|---|
| `codes` | Codes consolidés, aussi par numéro d'article | Versions en vigueur à une date (par défaut aujourd'hui) |
| `loda` | Lois, ordonnances, décrets et arrêtés consolidés | Versions en vigueur à une date (par défaut aujourd'hui) |
| `jorf` | Le Journal officiel dans sa version publiée, par mots, NOR ou numéro de texte | Version publiée ; pas de filtre « en vigueur », mais vous pouvez restreindre par dates de publication |
| `kali` | Conventions collectives nationales, par mots ou par numéro IDCC | Conventions actuellement en vigueur, étendues ou non |

Donnez au moins l'un de ces critères : des mots, un numéro d'article, un numéro de texte, un NOR ou un
IDCC. Un code, une nature ou des dates de publication ne font que restreindre une recherche ; ils ne
peuvent pas être le seul critère. Vous pouvez demander toutes les versions plutôt que celles en vigueur
à une date. Chaque résultat indique son titre, l'état juridique indiqué par Légifrance, ses dates de
vigueur, son identifiant et son lien officiel. Un résultat qui est un article de code ou de convention
collective peut être lu en entier avec son identifiant.

> **Rechercher n'est pas lire**
> Un résultat de recherche montre un extrait. Demandez à l'assistant de lire l'article ou le texte avant de le citer.

## Voir aussi

- [Lire les réponses de Vigueur](05-reading-answers.md)
- [Le Journal officiel et le suivi des modifications](04-journal-officiel.md)
- [Légifrance](../40-sources/01-legifrance.md)
