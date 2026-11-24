---
title: "Bienvenue dans Vigueur"
level: intro
tags: [intro, overview]
summary: "Découvrez ce que Vigueur vous permet de faire avec le droit français depuis un assistant IA, ce qu'il ne fait pas, et quelle page lire ensuite."
updated: 2026-11-24
---

# Bienvenue dans Vigueur

Vigueur vous permet de lire le droit français dans les sources officielles, depuis un assistant
IA. Vous posez une question en langage courant, en français ou en anglais.
L'assistant cherche le texte ou la décision sur Légifrance ou Judilibre, et reçoit ce que dit la
source : le texte, s'il est en vigueur, les dates, et un lien vers la page officielle.

Vigueur fonctionne sur votre ordinateur et utilise votre propre compte gratuit sur le portail d'API
du gouvernement français. Rien ne passe par un serveur de Vigueur : il n'y en a pas.

## Ce que vous pouvez demander à l'assistant

- « Que dit l'article 1240 du Code civil ? » L'assistant lit l'article, et la réponse indique
  s'il est en vigueur aujourd'hui.
- « Que disait l'article L1234-1 du Code du travail au 1er janvier 2015 ? » L'assistant lit la
  version qui s'appliquait à cette date.
- « Qu'est-ce qui a changé dans le Code de la consommation depuis le 1er janvier 2026 ? » La
  réponse liste les modifications.
- « Trouve les décisions de la Cour de cassation sur le pourvoi 23-20.348. » L'assistant trouve
  la décision et peut la lire en entier, ou une partie seulement.
- « Qu'est-ce qui a été publié au dernier Journal officiel ? » La réponse liste les derniers numéros.

Les réponses indiquent leur source, l'état juridique quand la source en donne un, les dates utiles
et les liens officiels. Voir [Lire les réponses de Vigueur](../20-using/05-reading-answers.md).

## Ce que Vigueur ne fait pas

> **Des faits, pas des conseils**
> Vigueur rapporte ce que disent les sources officielles. Il ne donne aucun conseil juridique, ne
> dit pas quelle règle s'applique à votre situation et ne classe pas les décisions selon leur
> utilité pour vous. Vérifiez le lien officiel avant de vous appuyer sur un texte, et consultez un
> professionnel du droit pour votre propre cas.

- Il se contente de lire. Il ne modifie jamais rien dans les sources.
- Il ne conserve aucune copie du droit. Chaque réponse est récupérée à la source au moment où vous
  la demandez.
- Il couvre uniquement Légifrance et Judilibre. Les autres sources, comme le droit européen, ne
  sont pas couvertes.
- Il ne peut pas lire ce que les sources ne détiennent pas. Par exemple, Légifrance ne détient pas
  toutes les décisions de la Cour de cassation ; voir [Légifrance](../40-sources/01-legifrance.md).

## Sources couvertes

| Source | Ce qu'elle détient | Page |
|---|---|---|
| [Légifrance](03-glossary.md#légifrance) | Codes, lois et décrets, Journal officiel, conventions collectives, et jurisprudence : juridictions judiciaires, administratives et financières, Conseil constitutionnel et CNIL | [Légifrance](../40-sources/01-legifrance.md) |
| [Judilibre](03-glossary.md#judilibre) | Décisions de la Cour de cassation et des juridictions du fond | [Judilibre](../40-sources/02-judilibre.md) |

Les deux sont accessibles par [PISTE](03-glossary.md#piste), la passerelle d'API du gouvernement.
Voir [PISTE](../40-sources/03-piste.md).

## Où aller ensuite

1. [Comment fonctionne Vigueur](02-how-it-works.md) : un aperçu de ce qui se passe quand vous
   posez une question.
2. [Créer votre compte PISTE](../10-setup/01-piste-account.md) : gratuit, quelques minutes.
3. [Installer Vigueur](../10-setup/02-install.md) : les étapes d'installation pour toute
   application, avec le [plugin Claude Code](../10-setup/03-install-claude-code.md) et le
   [fichier groupé pour Claude Desktop](../10-setup/04-install-claude-desktop.md), des paquets tout
   prêts pour ces deux applications.
4. [Prise en main : vos premières questions](../20-using/01-quickstart.md) : ce qu'il faut saisir en premier.

Les mots que vous ne connaissez pas sont dans le [glossaire](03-glossary.md). En cas de problème,
consultez [Dépannage et FAQ](05-troubleshooting.md).
