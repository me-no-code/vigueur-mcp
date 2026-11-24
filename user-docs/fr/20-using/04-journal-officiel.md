---
title: "Le Journal officiel et le suivi des modifications"
level: guide
tags: [journal-officiel, changes, tracking]
summary: "Lisez le dernier Journal officiel, filtrez-le, voyez ce qui a changé dans un code ou une loi depuis une date et suivez les nouveaux textes."
updated: 2026-11-23
---

# Le Journal officiel et le suivi des modifications

Ce guide vous permet de voir ce que la France vient de publier, et ce qui a changé dans un code ou une
loi sur une période. Le [Journal officiel](../00-intro/03-glossary.md#jorf-journal-officiel) (JO) est
la publication officielle ; Légifrance le publie sous le nom de JORF.

## Lire le dernier Journal officiel

> Montre-moi les derniers JO. / What is in today's Journal officiel?

L'assistant lance [`legifrance_latest_jo`](../30-tools/legifrance_latest_jo.md). Par défaut, vous obtenez le
dernier numéro ; vous pouvez demander jusqu'à 10 numéros, ou le numéro publié à une date. Les dates
sont des dates de publication. Pour une date, Vigueur lit au plus trois numéros publiés ce jour-là.

Pour chaque numéro, la réponse donne le titre, la date de publication et un lien, puis la table des
matières : chaque texte avec son titre, sa nature (loi, décret, arrêté…), son ministère ou son
émetteur et un lien. Les textes sont regroupés sous les intitulés de la table des matières du numéro
(`groups`). Quand un numéro n'a pas de table des matières, `toc_available` vaut `false` et ses `groups`
sont vides.

Les numéros longs sont découpés en pages ; la réponse donne alors `"next": { "page": 2 }`.

## Filtrer par nature ou par ministère

> Seulement les arrêtés du ministère de la Santé. / Only the décrets. / Only texts from the ministry of labour.

Vous pouvez filtrer par nature, par émetteur (un ministère ou une autorité) ou par les deux. Un nom
d'émetteur partiel suffit, et la réponse liste dans `filter` les émetteurs retenus. À titre
d'illustration de la forme (ce n'est pas une réponse enregistrée) :

```
"filter": {
  "nature": "decret",
  "emitter": "travail",
  "matched_emitters": [ … ]
}
```

Les noms des ministères changent avec les gouvernements. Si vous n'êtes pas sûr d'un nom, demandez à
l'assistant de lister les natures et les émetteurs qui ont publié depuis une date
([`legifrance_list_reference_values`](../30-tools/legifrance_list_reference_values.md)). Quand un
filtre ne correspond à rien, la réponse contient `"outcome": "no_results"`, dit `No text matches these filters in the selected issue(s).` et liste
les natures et les émetteurs disponibles dans ces numéros (`available`).

## Voir ce qui a changé dans un code depuis une date

> Qu'est-ce qui a changé dans le Code civil depuis le 1er septembre ? / What changed in the Code du travail since 2026-01-01?

L'assistant lance [`legifrance_list_changes`](../30-tools/legifrance_list_changes.md) avec une date de début
et, si vous en donnez une, une date de fin (par défaut aujourd'hui). La réponse liste les articles
créés, modifiés, abrogés, codifiés, transférés ou liés, regroupés par texte modificatif, chacun avec sa
date, son numéro, sa section et son identifiant (`items`, un groupe par texte modificatif).

Les dates sont des **dates d'entrée en vigueur, non des dates de publication**. Un changement qui
entre en vigueur dans le futur porte `"scheduled": true`, et le champ `scheduled` les compte.

Les listes sont découpées en pages de 100 entrées au plus ; `next` donne la page suivante, que
l'assistant peut demander.

> **Les lacunes que la réponse signale**
> Certaines versions ont une date d'entrée en vigueur que Légifrance laisse indéterminée ; elles ne
> sont pas listées, et la réponse en donne le nombre (`undetermined_versions`). Quand Légifrance n'a
> pas chargé le détail des versions pour une année, la réponse nomme l'année : les changements de cette
> année peuvent manquer.

## Voir le journal des modifications d'une loi

> Les modifications du décret 2019-1088. / What changed in the loi 78-17 since 2024?

Donnez une loi, une ordonnance, un décret ou un arrêté (« loi 78-17 », « décret 2019-1088 »), un NOR ou
un identifiant Légifrance, au lieu d'un code. La réponse a la même forme, avec le lien vers le texte.

## Suivre les nouveaux textes

Vigueur répond quand vous demandez ; il ne surveille rien et n'envoie aucune notification. Pour
rester à jour, reposez la question au rythme de votre choix. Voici quelques demandes qui fonctionnent :

- « Qu'est-ce qui a été publié au Journal officiel depuis lundi ? » (les derniers numéros, jusqu'à 10, ou les
  numéros d'une date, avec `legifrance_latest_jo`).
- « Qu'est-ce qui a changé dans le Code du travail depuis le 1er octobre 2026 ? » Utilisez la date de votre
  dernière vérification.
- « Cherche dans le Journal officiel les textes publiés entre le 1er et le 15 novembre 2026 sur… »
  ([`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md), fonds `jorf`, avec
  `published_from` et `published_to`). La recherche exige des mots, un NOR, un numéro de texte ou un
  numéro d'article : les dates de publication seules sont refusées.

## Voir aussi

- [Codes, lois et décrets](02-legislation.md)
- [Lire les réponses de Vigueur](05-reading-answers.md)
