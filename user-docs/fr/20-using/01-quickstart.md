---
title: "Prise en main : vos premières questions"
level: start
tags: [quickstart, legislation, case-law]
summary: "Menez une première session de bout en bout : vérifier que Vigueur a accès aux sources, lire un article, voir ce qui s'appliquait à une date passée et trouver une décision."
updated: 2026-11-17
---

# Prise en main : vos premières questions

Cette page vous guide dans une première session. Vous écrivez vos demandes à Claude en langage
courant, en français ou en anglais. Claude appelle les outils de Vigueur et vous montre ce que disent
les sources officielles. Vigueur doit être [installé](../10-setup/02-install-claude-code.md), avec vos
identifiants PISTE renseignés.

## 1. Vérifier que Vigueur accède aux sources

Demandez :

> Vérifie que Vigueur est bien configuré. / Check that Vigueur is set up.

Claude lance `vigueur_status`. Les réponses de Vigueur sont en JSON, transmis sur une seule ligne ;
ici, la réponse est indentée pour être lisible. Quand tout fonctionne, la réponse ressemble à ceci :

```
{
  "source": "PISTE",
  "outcome": "results",
  "warnings": [],
  "environment": "sandbox",
  "config_problems": [],
  "checks": [
    {
      "source": "Légifrance",
      "state": "ok",
      "detail": null,
      "retry_after_seconds": null
    },
    {
      "source": "Judilibre",
      "state": "ok",
      "detail": null,
      "retry_after_seconds": null
    }
  ],
  "request": {
    "tool": "vigueur_status"
  },
  "retrieved": "2026-11-16T10:42:07Z",
  "cached": [],
  "vigueur_version": "0.1.0"
}
```

Une source dont le `state` n'est pas `ok` pose problème (par exemple `not_enabled` ou
`credentials_invalid`), et la réponse ajoute les étapes pour le corriger. Sans aucun identifiant, la
réponse contient `"outcome": "not_configured"` et un `setup_guide` avec les étapes de configuration.
Voir [`vigueur_status`](../30-tools/vigueur_status.md).

## 2. Lire un article

Demandez :

> Que dit l'article 1240 du Code civil ? / What does article 1240 of the Code civil say?

Claude lance `legifrance_get_article`. La réponse montre ces champs (`…` signale les champs et le texte
omis dans l'extrait) :

```
{
  …
  "outcome": "found",
  …
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
  "text": "Tout fait quelconque de l'homme, qui cause à autrui un dommage, oblige celui par la faute duque…",
  …
  "retrieved": "2026-11-16T10:42:07Z",
  …
}
```

- `code` et `number` : le code et le numéro de l'article ;
- `status` : si l'article s'appliquait à la date demandée (`on`), avec ses dates `from` et `until` ;
  `until` vaut `null` quand aucune fin n'est enregistrée ;
- `section` : l'endroit où l'article se trouve dans le code ;
- `text` : le texte de l'article ;
- `link` et `id` : le lien vers legifrance.gouv.fr et l'identifiant Légifrance.

Si vous donnez un numéro sans code et qu'il existe dans plusieurs codes (c'est le cas de L1234-1), la
réponse liste les codes et n'en choisit aucun. Précisez le code et reposez la question. Voir
[Codes, lois et décrets](02-legislation.md).

## 3. Demander ce qui s'appliquait à une date passée

Demandez :

> Que disait l'article 1382 du Code civil au 1er janvier 2015 ? / What did article 1382 of the Code civil say on 1 January 2015?

Claude lance `legifrance_get_article` avec cette date. La réponse montre le texte tel qu'il était rédigé à
cette date, et un `status` avec les deux bornes : `"state": "in_force"`, `"from": "1804-03-21"`,
`"until": "2016-10-01"`, ainsi que le libellé propre à Légifrance, `"legifrance_status": "MODIFIE"`.
L'article 1382 a été renuméroté : la réponse indique donc aussi, dans `relocation`, l'endroit où,
selon Légifrance, le contenu a été déplacé :

```
"relocation": "Content moved — per Légifrance concordance, the text of art. 1382 as of 2015-01-01 is now at Code civil - art. 1240 (V) (since 2016-10-01)."
```

Demandez « et qui l'a modifié ? » pour obtenir la liste des versions et des textes modificatifs
(`legifrance_get_article_history`).

## 4. Trouver une décision

Demandez :

> Trouve l'arrêt de la Cour de cassation sur le pourvoi 23-20.348. / Find the Cour de cassation decision with pourvoi number 23-20.348.

Claude cherche dans Judilibre (`judilibre_search_decisions`). Cette décision est un rejet non
spécialement motivé, que Légifrance ne détient pas. Chaque résultat indique la juridiction et la
chambre, la date de la décision, les numéros, l'ECLI, puis la formation, la publication et la solution,
puis un sommaire et un extrait s'il y en a, le `link` officiel et `read_with`, l'appel qui permet de
lire la décision en entier :

```
{
  …
  "outcome": "results",
  …
  "results": 1,
  …
  "items": [
    {
      "title": "Cour de cassation, Deuxième chambre civile — decision of 2026-05-21 — n° 23-20.348 — ECLI:FR:CCASS:2…",
      "id": "6a0e9ff1cdc6046d47668703",
      "ecli": "ECLI:FR:CCASS:2026:C210500",
      "link": "https://www.courdecassation.fr/decision/6a0e9ff1cdc6046d47668703",
      "jurisdiction": "cc",
      "location": null,
      "chamber": "Deuxième chambre civile",
      "decided": "2026-05-21",
      "numbers": [
        "23-20.348"
      ],
      "formation": "Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission)",
      "publication": [],
      "solution": "Rejet",
      "summary": null,
      "excerpt": null,
      "read_with": {
        "tool": "judilibre_get_decision",
        "id": "6a0e9ff1cdc6046d47668703"
      }
    }
  ],
  …
}
```

Demandez à Claude de lire la décision, ou seulement sa motivation (la
[zone motivations](../00-intro/03-glossary.md#zone)). Voir [Jurisprudence](03-case-law.md).

## 5. Vérifier ce que la réponse vous apprend

Chaque réponse sur le droit indique sa `source` et un `link` officiel. Lisez le `status` avant de vous
appuyer sur un texte, et ouvrez le lien si vous avez besoin de la page officielle. Les parties communes
à toutes les réponses sont expliquées dans [Lire les réponses de Vigueur](05-reading-answers.md).

> **Vigueur rapporte, il ne conseille pas**
> Vigueur lit ce que disent Légifrance et Judilibre. Il ne tire aucune conclusion et ne donne aucun conseil juridique.

## Pour aller plus loin

- [Codes, lois et décrets](02-legislation.md)
- [Jurisprudence](03-case-law.md)
- [Le Journal officiel et le suivi des modifications](04-journal-officiel.md)
