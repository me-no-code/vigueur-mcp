---
title: "PISTE"
level: reference
tags: [sources, piste, quota, sandbox, production]
summary: "Comprenez ce qu'est PISTE, en quoi le bac à sable et la production diffèrent, pourquoi une seule application sert les deux sources, comment se comporte le quota partagé, et comment Vigueur gère les nouvelles tentatives et les délais."
updated: 2026-11-17
---

# PISTE

PISTE est la passerelle d'API du gouvernement français, à l'adresse piste.gouv.fr. Légifrance et
Judilibre sont tous deux publiés par son intermédiaire. Vigueur envoie chaque requête à PISTE et nulle
part ailleurs, avec votre propre compte PISTE gratuit. Voir [Créer votre compte PISTE](../10-setup/01-piste-account.md)
pour en obtenir un.

## Comment fonctionne l'accès

1. Vous créez une **application** sur PISTE. Elle a un **identifiant client** (*client ID*) et un
   **secret client** (*client secret*).
2. Vous abonnez l'application aux deux API, **Légifrance** et **JUDILIBRE** : vous acceptez leurs
   conditions sur la page de consentement, puis vous appliquez la modification à l'application.
3. Vigueur échange l'identifiant client et le secret client contre un jeton d'accès temporaire (l'échange
   standard « client credentials ») et l'envoie avec chaque requête. Le jeton n'est conservé qu'en mémoire.
   Vigueur le renouvelle une minute avant son expiration, et une fois de plus si PISTE le rejette en
   cours d'utilisation.

**Une seule application sert les deux sources.** Les deux API passent par la même application PISTE et
le même jeton. Si l'application n'est abonnée qu'à une seule API, l'autre répond « accès refusé » et
[`vigueur_status`](../30-tools/vigueur_status.md) l'indique comme `not_enabled`.

## Bac à sable et production

PISTE a deux environnements, chacun avec ses propres adresses et ses propres applications.

| | Bac à sable (*sandbox*) | Production |
|---|---|---|
| Application | PISTE en crée une pour vous automatiquement (nommée SANDBOX) | Toute application que vous créez vous-même |
| Réglage de Vigueur | Environnement PISTE `sandbox` | Environnement PISTE `production` (valeur par défaut) |

> **L'environnement doit correspondre aux identifiants**
> Les identifiants du bac à sable ne fonctionnent qu'avec le réglage `sandbox`, ceux de production
> qu'avec `production`. Une discordance est signalée comme un rejet des identifiants, exactement comme
> un secret erroné, et `vigueur_status` ne peut pas distinguer les deux. La ligne de démarrage de Vigueur,
> dans ses journaux, indique l'environnement utilisé.

## Le quota partagé

PISTE limite le nombre de requêtes qu'une application peut envoyer. Observé en novembre 2026 : le
compteur de quota baissait aussi bien avec les appels à Légifrance qu'avec ceux à Judilibre, ce qui
suggère un quota unique pour l'application, et non un par API. Vigueur ne connaît pas les limites
exactes.

- Une requête au-delà de la limite reçoit la réponse HTTP 429. Vigueur nomme ce cas `quota_exceeded` et
  vous dit combien de temps attendre quand PISTE le précise.
- Pendant une centaine d'appels à environ deux requêtes par seconde (novembre 2026), aucun 429 n'a été
  observé. Un usage ordinaire a peu de chances d'atteindre la limite ; une longue série de lectures, comme
  la pagination dans de nombreuses décisions, consomme le quota plus vite.
- `vigueur_status` affiche `quota_exceeded` et le délai pour une source dont le débit est limité.

## Ce que fait Vigueur quand PISTE échoue

| Situation | Comportement de Vigueur |
|---|---|
| HTTP 429 (quota) | Attend et réessaie une fois. L'attente est le délai que donne PISTE, jusqu'à 10 secondes ; sans délai donné, une demi-seconde. Si cela échoue de nouveau, vous recevez la réponse de quota. |
| HTTP 5xx, erreur réseau ou délai dépassé | Réessaie une fois après une demi-seconde. Si cela échoue de nouveau, vous recevez `PISTE is unavailable or timed out`. |
| La connexion à PISTE (obtenir un jeton) échoue | Pas de nouvel essai. Une connexion refusée est signalée comme des identifiants rejetés ; une connexion qui dépasse le délai ou échoue autrement, comme `PISTE is unavailable or timed out`. |
| HTTP 401 (jeton rejeté) | Écarte le jeton, en obtient un nouveau et réessaie une fois. S'il est rejeté de nouveau, vous recevez la réponse d'identifiants rejetés. |
| HTTP 403 | Pas de nouvel essai. Signalé comme un accès refusé : vérifiez que l'application est abonnée à l'API. |
| HTTP 404 | Pas de nouvel essai. Signalé comme introuvable. |
| Autres erreurs client | Pas de nouvel essai. Signalé comme une requête rejetée. |
| Réponse qui n'est pas du JSON valide, ou de forme inattendue | Pas de nouvel essai. Signalé comme une réponse que Vigueur ne comprend pas. |

**Délais.** Une requête à PISTE attend jusqu'à 10 secondes. Un appel d'outil entier, nouvelle tentative
comprise, abandonne au bout de 45 secondes et dit que la source « did not answer within 45 s ».
L'obtention d'un jeton attend aussi jusqu'à 10 secondes. Les vérifications de `vigueur_status` attendent
jusqu'à 8 secondes chacune et ne sont pas relancées.

**Rapidité.** Observé en novembre 2026 : Judilibre répondait en général en un dixième de seconde environ
et Légifrance en moins d'une seconde ; lire la table des matières d'un grand code prenait quelques
secondes.

Vous pouvez annuler un appel depuis Claude à tout moment ; Vigueur arrête d'attendre et ne réessaie pas.

## Ce qui est envoyé où

Vigueur envoie votre identifiant client et votre secret client au service de jetons de PISTE, et vos mots de
recherche, identifiants et dates aux API de Légifrance et de Judilibre. Rien ne part vers un autre
service. Vigueur n'écrit rien sur le disque. Voir [Confidentialité et données](../00-intro/04-privacy-and-your-data.md).

## Voir aussi

- [`vigueur_status`](../30-tools/vigueur_status.md) : vérifier les identifiants et les sources qui répondent.
- [Créer votre compte PISTE](../10-setup/01-piste-account.md)
- [Dépannage et FAQ](../00-intro/05-troubleshooting.md)
- [Légifrance](01-legifrance.md)
- [Judilibre](02-judilibre.md)
