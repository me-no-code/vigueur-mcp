---
title: "Créer votre compte PISTE"
level: start
tags: [setup, piste, credentials]
summary: "Créez un compte et une application PISTE gratuits, abonnez l'application aux API Légifrance et Judilibre, et obtenez l'identifiant client et le secret client dont Vigueur a besoin."
updated: 2026-11-18
---

# Créer votre compte PISTE

Vigueur lit Légifrance et Judilibre en passant par [PISTE](../00-intro/03-glossary.md#piste), le portail d'API
du gouvernement français. L'accès est gratuit. Il vous faut votre propre compte et une application.
Cela prend quelques minutes et se fait une seule fois, quelle que soit l'application dans laquelle
vous utilisez Vigueur.

## Étapes

1. Allez sur <https://piste.gouv.fr>, créez un compte gratuit et confirmez votre adresse e-mail.
2. Ouvrez l'onglet **Applications**. Une application **SANDBOX** existe déjà. Les applications que
   vous créez vous-même (**Créer une application**) sont des applications de **production**.
   Choisissez celle que vous utiliserez ; voir [Bac à sable ou production](#bac-à-sable-ou-production).
3. Ouvrez la page de consentement (« Cliquez ici pour accéder à la page de consentement »), cochez
   **Légifrance** et **JUDILIBRE**, puis cliquez sur **Validate my ToS choices**.
4. Modifiez l'application, cochez **Légifrance** et **JUDILIBRE**, puis cliquez sur **Apply
   changes** (« Appliquer les modifications »). Les cases deviennent grises une fois l'abonnement
   effectif ; vérifiez le tableau **Subscribed APIs**.
5. Copiez l'identifiant client (**client ID**) et le secret client (**client secret**) OAuth de
   l'application.

Vous avez maintenant deux valeurs et un choix d'environnement. Vous les saisirez quand vous
installerez Vigueur [dans Claude Desktop](03-install-claude-desktop.md) ou
[dans Claude Code](02-install-claude-code.md).

> **Gardez le secret client pour vous**
> Le secret client est un mot de passe de votre application. Ne le collez pas dans une conversation
> avec Claude, un e-mail ou un document. Saisissez-le uniquement dans les réglages de Vigueur :
> Claude Desktop le stocke chiffré, et Claude Code le conserve dans le coffre sécurisé
> d'identifiants de votre système.

## Bac à sable ou production

PISTE a deux environnements, et chaque application appartient à l'un d'eux.

| | Bac à sable (*sandbox*) | Production |
|---|---|---|
| Quelle application | Celle que PISTE crée automatiquement pour vous | Une application que vous créez vous-même |
| Dans Claude Desktop | **Production application** désactivé | **Production application** activé (valeur par défaut) |
| Dans Claude Code | **PISTE environment** `sandbox` | **PISTE environment** `production` (valeur par défaut) |

Le réglage doit correspondre à l'application à laquelle appartiennent les identifiants : les
identifiants du bac à sable ne fonctionnent qu'en bac à sable, et ceux de production qu'en
production. En cas de discordance, les identifiants sont rejetés ; voir
[Dépannage et FAQ](../00-intro/05-troubleshooting.md#piste-a-rejeté-mes-identifiants).

Voir [Bac à sable](../00-intro/03-glossary.md#bac-à-sable) et
[Production](../00-intro/03-glossary.md#production) dans le glossaire.

## Vérifier que tout fonctionne

Après avoir installé Vigueur et saisi les identifiants, demandez à Claude de lancer
`vigueur_status`. Chaque source doit afficher `ok`. Si l'une affiche `not_enabled`, recommencez les
étapes 3 et 4 ci-dessus.

## Voir aussi

- [Installer dans Claude Desktop](03-install-claude-desktop.md)
- [Installer dans Claude Code](02-install-claude-code.md)
- [PISTE](../40-sources/03-piste.md)
- [Dépannage et FAQ](../00-intro/05-troubleshooting.md)
