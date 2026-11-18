---
title: "Comment fonctionne Vigueur"
level: intro
tags: [intro, architecture, privacy]
summary: "Comprenez ce qui s'exécute, et où, quand vous posez une question à Claude, et ce que les réponses contiennent ou non."
updated: 2026-11-18
---

# Comment fonctionne Vigueur

Vigueur est un petit programme qui fonctionne sur votre ordinateur, à côté de Claude Desktop ou de
Claude Code. Claude s'en sert pour lire les sources officielles du droit français. Cette page montre
ce qui se passe entre votre question et la réponse.

## Votre question va de Claude à la source, puis en revient

```
You  <->  Claude  <->  Vigueur (on your computer)  <->  PISTE  <->  Légifrance / Judilibre
```

1. Vous posez une question à Claude.
2. Claude décide lequel des outils de Vigueur utiliser, et avec quels mots, nombres ou dates. Vous
   ne choisissez pas l'outil vous-même, mais vous pouvez en nommer un si vous voulez que Claude
   l'utilise. Les [pages des outils](../README.md#outils) les listent tous.
3. Vigueur envoie la requête à [PISTE](03-glossary.md#piste), la passerelle d'API du gouvernement
   français, avec vos propres identifiants.
4. PISTE la transmet à [Légifrance](03-glossary.md#légifrance) ou à
   [Judilibre](03-glossary.md#judilibre) et renvoie les données officielles.
5. Vigueur range les données dans une réponse structurée, un objet JSON aux champs nommés, et la
   remet à Claude, qui vous répond. La réponse de Vigueur est conçue pour être lue par Claude :
   ses champs séparent les faits (le texte, les dates, le statut, le lien). Vous pouvez demander à
   Claude de vous l'afficher telle quelle. Voir
   [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

Claude peut utiliser plusieurs outils pour une même question, par exemple une recherche, puis la
lecture de l'article trouvé, puis son historique.

## Votre propre application PISTE

Vigueur n'a ni compte partagé ni serveur propre. Vous créez un compte PISTE gratuit et une
application, et Vigueur utilise l'identifiant client (*client ID*) et le secret client (*client
secret*) de cette application pour demander à PISTE un jeton d'accès de courte durée. Vos questions
sont décomptées sur votre propre application, pas sur celle de quelqu'un d'autre. Voir
[Créer votre compte PISTE](../10-setup/01-piste-account.md).

## Ce que contient une réponse

Vigueur est conçu pour rapporter, pas pour interpréter. Une réponse donne, quand la source les
fournit :

- le texte ou la décision, tels que la source les détient (dans les décisions, la source
  pseudonymise les noms des personnes concernées) ;
- l'état juridique et, pour un article ou un texte, s'il est en vigueur à la date demandée,
  calculé à partir de ses dates de vigueur ;
- les dates utiles : début d'une version, fin d'une version, date d'une décision ;
- des identifiants comme l'identifiant Légifrance, le NOR, le numéro de pourvoi ou l'ECLI ;
- un lien vers la page officielle, dans le champ `link` de la réponse ou, dans une liste, de chaque
  élément.

Quand une source est muette ou incomplète, la réponse le dit au lieu de combler le vide : un champ
pour lequel la source ne donne aucune valeur vaut `null`, et une phrase dans `warnings` dit ce qui
manque. Une liste trop longue est découpée en pages, et la réponse indique comment demander la
suivante.

> **Pas de conseil juridique**
> Vigueur et les réponses qu'il produit énoncent des faits tirés des sources. Ils ne disent pas ce
> que vous devez faire, quelle règle l'emporte, ni ce qu'une décision signifie pour votre cas.
> Claude peut ajouter sa propre explication autour des faits ; cette explication est celle de
> Claude, pas celle de la source. Vérifiez le lien officiel.

## Ce qui reste sur votre ordinateur

Vigueur n'écrit rien sur le disque : ni fichiers ni copie du droit. Le jeton d'accès que PISTE lui
donne, et les quelques listes qu'il réutilise pendant un jour au plus, restent uniquement en mémoire.
Vigueur n'envoie de requêtes qu'à PISTE. Pour le détail, voir
[Confidentialité et données](04-privacy-and-your-data.md).

## Quand quelque chose ne fonctionne pas

Demandez à Claude de lancer `vigueur_status`. Il vérifie vos identifiants et indique si Légifrance
et Judilibre répondent. Voir [Dépannage et FAQ](05-troubleshooting.md).
