---
title: "Glossaire"
level: reference
tags: [glossary, terms]
summary: "Retrouvez les termes juridiques et techniques français que les réponses de Vigueur utilisent."
updated: 2026-11-17
---

# Glossaire

Les termes ci-dessous sont ceux que les réponses de Vigueur et les pages d'installation utilisent,
dans l'ordre alphabétique. Les termes français restent en français. Chaque entrée est une courte
explication du mot, pas un conseil juridique.

### Arrêt

Une décision d'une juridiction supérieure, comme la Cour de cassation ou une cour d'appel.

### Avertissements

Le champ `warnings` d'une réponse : une liste de phrases sur la réponse qu'aucun autre champ ne
donne, comme un désaccord dans les données de la source ou une vérification qui n'a pas pu aboutir.
Elle est vide quand il n'y a rien à dire. Voir
[Lire les réponses de Vigueur](../20-using/05-reading-answers.md#avertissements).

### Bac à sable

L'un des deux environnements de PISTE, destiné aux tests. PISTE crée pour vous une application en
bac à sable (*sandbox*) quand vous ouvrez un compte ; ses identifiants ne fonctionnent qu'avec le
réglage *sandbox*. À comparer avec [Production](#production).

### Bulletin

Voir [Niveau de publication](#niveau-de-publication).

### CETAT

Le nom que Légifrance donne à son fonds de jurisprudence administrative : les décisions du Conseil
d'État, des cours administratives d'appel et des tribunaux administratifs. Demandez-le sous le nom
de fonds « administrative ». Voir [Fonds](#fonds).

### Chambre

Une division de la Cour de cassation (par exemple la chambre sociale ou la première chambre
civile). Une décision indique sa chambre, et une recherche peut être limitée à l'une d'elles.

### CNIL

La Commission nationale de l'informatique et des libertés. Légifrance détient ses délibérations
dans un fonds de jurisprudence appelé « cnil ». Voir [Fonds](#fonds).

### Code

Un code consolidé comme le Code civil ou le Code du travail. Les articles sont cités par code et
numéro d'article, par exemple « Code du travail, L1234-1 ». Donnez l'intitulé complet du code ;
Vigueur connaît aussi les abréviations courantes des principaux codes, comme « C. trav. » ou
« CGI ».

### Concordance

La trace que garde Légifrance de l'endroit où est passé le contenu d'un article quand des articles
ont été renumérotés, déplacés ou remplacés. Quand elle existe, une réponse sur un article abrogé ou
déplacé dit « per Légifrance concordance » et nomme le nouvel emplacement. Vigueur rapporte la
concordance ; il n'en déduit aucune.

### CONSTIT

Le nom que Légifrance donne à son fonds de jurisprudence du Conseil constitutionnel. Demandez-le
sous le nom de fonds « constitutional ». Voir [Fonds](#fonds).

### Dates de validité

Pour chaque version d'un article ou d'un texte, la date où elle commence et la date où elle se
termine. Pour une version sans date de fin, aucune n'est enregistrée (`until` vaut `null`) ; une
version dont la fin est enregistrée mais pas encore datée a `until_undetermined` à `true`. Voir
[En vigueur](#en-vigueur) et [Version](#version).

### Décision attaquée

La décision que conteste un pourvoi. Les décisions de Judilibre et de Légifrance l'indiquent dans
le champ `attacked` quand la source la mentionne. Quand Judilibre détient aussi la décision
attaquée, la réponse donne l'appel qui permet de la lire, pour que Claude puisse la lire ensuite.

### ECLI

*European Case Law Identifier* : un code normalisé qui désigne une décision, comme
`ECLI:FR:CCASS:2025:SO01200`. Les décisions des deux sources l'affichent quand elles en ont un.
Vous pouvez donner un ECLI à une recherche pour trouver cette décision.

### En cache

Le champ `cached` d'une réponse. Il liste le contenu venu de la mémoire de Vigueur plutôt que d'une
nouvelle requête, chaque entrée avec ce qu'elle est (`what`) et le moment où elle a été récupérée
(`retrieved`). La liste est vide quand tout a été récupéré pour cet appel. Voir
[Lire les réponses de Vigueur](../20-using/05-reading-answers.md#ce-que-contient-toute-réponse).

### Enveloppe

Les champs que toute réponse de Vigueur possède, autour des faits de l'outil : `source`, `outcome`,
`warnings` d'abord, puis les champs propres à l'outil, puis `request`, `retrieved`, `cached` et
`vigueur_version`. Voir
[Lire les réponses de Vigueur](../20-using/05-reading-answers.md#ce-que-contient-toute-réponse).

### En vigueur

Vigueur calcule si un article ou un texte s'applique à une date donnée à partir de ses dates de
validité, et indique les deux bornes de la période dans le champ `status`. Voir
[Dates de validité](#dates-de-validité) et [État du statut](#état-du-statut).

```
"status": {
  "state": "in_force",
  "on": "2015-01-01",
  "from": "1804-03-21",
  "until": "2016-10-01",
  "until_undetermined": false
}
```

Le libellé propre à Légifrance pour la version est donné à côté, dans `legifrance_status`. Voir
[Statut (le mot de Légifrance)](#statut-le-mot-de-légifrance).

### État du statut

Le `state` à l'intérieur du champ `status` d'un article, d'un texte ou d'une section : si cette
version s'applique à la date `on`, calculé par Vigueur à partir de ses dates de validité. L'une des
valeurs `in_force`, `not_in_force`, `not_yet_in_force` et `never_applied`. Voir
[Lire les réponses de Vigueur](../20-using/05-reading-answers.md#-en-vigueur-à-une-date--se-calcule-à-partir-de-dates).

### Fonds

Un ensemble de documents sur lequel porte une recherche. Les recherches Légifrance portent sur un
fonds à la fois.

| Recherche | Fonds |
|---|---|
| Législation | `codes`, `loda`, `jorf`, `kali` |
| Jurisprudence | `judicial` (JURI), `administrative` (CETAT), `constitutional` (CONSTIT), `cnil` (CNIL), `financial` (JUFI) |

### Formation

La formation d'une chambre de la Cour de cassation qui a rendu la décision. Judilibre utilise ces
libellés.

| Libellé affiché | Sens |
|---|---|
| Formation plénière de chambre | La chambre au complet |
| Formation mixte | Une formation mixte |
| Formation de section | Une section de la chambre |
| Formation restreinte | Une formation réduite |
| Formation restreinte hors RNSM/NA | Une formation réduite, en dehors de la procédure [RNSM/NA](#rnsmna) |
| Formation restreinte RNSM/NA (rejet non spécialement motivé ou non-admission) | Une formation réduite, statuant par [RNSM/NA](#rnsmna) |

### IDCC

Le numéro qui identifie une convention collective nationale. Vous pouvez rechercher les conventions
collectives par IDCC. Voir [KALI](#kali).

### Identifiant Légifrance

Un identifiant que Légifrance donne à chaque document. Le préfixe indique le type.

| Préfixe | Ce qu'il identifie |
|---|---|
| `LEGIARTI` | Une version d'un article de code |
| `LEGITEXT` | Un texte consolidé ou un code |
| `JORFTEXT` | Un texte dans sa version publiée au Journal officiel |
| `KALIARTI` | Une version d'un article de convention collective |
| `JURITEXT`, `CETATEXT`, `CONSTEXT`, `CNILTEXT`, `JUFITEXT` | Une décision du fonds judiciaire, administratif, constitutionnel, CNIL ou financier |

Les réponses affichent ces identifiants pour que Claude puisse relire le même document, et pour que
vous puissiez le citer.

### JORF (Journal officiel)

Le Journal officiel de la République française, où sont publiés les lois, décrets et arrêtés.
« JORF » est le fonds de Légifrance qui détient les textes dans leur version publiée, sans les
modifications ultérieures. Un identifiant de texte commençant par `JORFTEXT` est un texte dans sa
version publiée. À comparer avec [Texte consolidé](#texte-consolidé).

### Judilibre

La base de décisions de justice que la Cour de cassation diffuse en données ouvertes : celles de la
Cour de cassation elle-même et des cours d'appel, tribunaux judiciaires, tribunaux de commerce et
conseils de prud'hommes. Les noms des personnes physiques sont pseudonymisés par la source. Voir
[Judilibre](../40-sources/02-judilibre.md).

### JUFI

Le nom que Légifrance donne à son fonds de jurisprudence financière : la Cour des comptes et les
chambres régionales et territoriales des comptes. Demandez-le sous le nom de fonds « financial ». Voir
[Fonds](#fonds).

### JURI

Le nom que Légifrance donne à son fonds de jurisprudence judiciaire : les décisions de la Cour de
cassation et de certaines cours d'appel. Demandez-le sous le nom de fonds « judicial ». Légifrance ne
détient pas toutes les décisions de la Cour de cassation ; voir [RNSM/NA](#rnsmna) et
[Légifrance](../40-sources/01-legifrance.md).

### KALI

Le fonds de Légifrance des conventions collectives nationales, recherchées par [IDCC](#idcc). Une
recherche renvoie les conventions actuellement en vigueur, étendues ou non. Les conventions se
trouvent par une recherche de législation et leurs articles se lisent comme des articles ; elles ne
se lisent pas comme des textes.

### Légifrance

Le service public officiel de publication du droit du gouvernement français : codes, lois et
décrets consolidés, Journal officiel, conventions collectives et une partie de la jurisprudence.
Voir [Légifrance](../40-sources/01-legifrance.md).

### LODA

Lois et décrets : le fonds de Légifrance des lois, ordonnances, décrets et arrêtés consolidés. Les
recherches qui y sont faites renvoient les versions en vigueur à une date (aujourd'hui par défaut).
À comparer avec [JORF](#jorf-journal-officiel).

### Niveau de publication

Le degré de diffusion que la Cour de cassation a donné à une décision. Judilibre utilise ces libellés.

| Libellé affiché | Sens |
|---|---|
| Publié au Bulletin | Publié au Bulletin de la Cour de cassation |
| Publié au Rapport | Publié au Rapport de la Cour de cassation |
| Publié aux Lettres de chambre | Publié dans les lettres de la chambre |
| Communiqué | Accompagné d'un communiqué de presse |
| Non publié | Non publié |

Une décision de la Cour de cassation qui ne porte aucun de ces libellés a une liste `publication`
vide : elle n'est pas publiée au Bulletin.

### NOR

L'identifiant d'un texte publié au Journal officiel. Vous pouvez lire un texte par son NOR, et
rechercher dans le Journal officiel par NOR.

### Nota

Une note que Légifrance rattache à un article, souvent sur le moment ou la manière dont il
s'applique. Les réponses l'affichent dans le champ `note`.

### PISTE

La passerelle d'API du gouvernement français, à l'adresse piste.gouv.fr. Vigueur n'accède à
Légifrance et à Judilibre que par PISTE, avec les identifiants de votre propre application. Voir
[Créer votre compte PISTE](../10-setup/01-piste-account.md) et [PISTE](../40-sources/03-piste.md).

### Pourvoi

Un recours devant la Cour de cassation. Son numéro ressemble à `23-20.348`. Un numéro de pourvoi
peut être donné sous n'importe quelle graphie, comme `23-20.348` ou `2320348`, pour trouver une
décision.

### Production

L'un des deux environnements de PISTE. Une application PISTE que vous créez vous-même est une
application de production ; ses identifiants ne fonctionnent qu'avec le réglage de production. À
comparer avec [Bac à sable](#bac-à-sable).

### Rapprochements

Une liste d'éléments liés que Judilibre donne pour certaines décisions de la Cour de cassation.
Vigueur la donne dans le champ `rapprochements` quand la source en fournit une.

### Récupération

Le champ `retrieved` d'une réponse : le moment où Vigueur a constitué la réponse à partir de ce que
la source a renvoyé, sous forme de date et heure en UTC (`2026-11-16T10:42:07Z`).

### Requête

Le champ `request` d'une réponse : l'appel qui a été fait, avec le nom de l'outil et chaque
paramètre avec la valeur utilisée, valeurs par défaut comprises. Voir
[Lire les réponses de Vigueur](../20-using/05-reading-answers.md#ce-que-contient-toute-réponse).

### RNSM/NA

Rejet non spécialement motivé ou non-admission : une décision de la Cour de cassation qui rejette un
pourvoi sans motifs détaillés. Judilibre étiquette « RNSM/NA » la formation restreinte qui statue
ainsi. Légifrance ne détient pas ces décisions : utilisez Judilibre pour les trouver.

### Solution

La solution d'une décision de la Cour de cassation telle que Judilibre l'étiquette, par exemple
*Cassation*, *Rejet*, *Irrecevabilité* ou *Avis*. Une recherche peut être limitée à une solution.

### Sommaire

Le résumé du point de droit d'une décision, rédigé par la juridiction pour certaines décisions. Les
réponses le donnent dans le champ `summary` quand la source en a un.

### Statut (le mot de Légifrance)

Légifrance enregistre un statut juridique pour chaque version d'un article ou d'un texte, sous la
forme d'un mot français en majuscules. Une réponse le donne dans le champ `legifrance_status`, à côté
du `status` qui dit si la version est en vigueur. Les plus courants :

| Mot | Sens |
|---|---|
| `VIGUEUR` | En vigueur |
| `VIGUEUR_ETEN`, `VIGUEUR_NON_ETEN` | En vigueur, étendu ou non étendu (conventions collectives) |
| `VIGUEUR_DIFF` | Entrée en vigueur différée à une date ultérieure |
| `MODIFIE` | Modifié : une version ultérieure a remplacé celle-ci |
| `MODIFIE_MORT_NE` | Version mort-née : remplacée avant d'avoir jamais été appliquée |
| `ABROGE` | Abrogé |
| `ABROGE_DIFF` | Abrogation programmée à une date ultérieure |
| `ANNULE` | Annulé |
| `PERIME` | Périmé |
| `TRANSFERE`, `DEPLACE` | Déplacé ailleurs |
| `SUBSTITUE`, `REMPLACE` | Remplacé |

Vigueur détermine « en vigueur à cette date » à partir des dates de validité, pas à partir de ce
mot. Quand Légifrance étiquette une version en vigueur mais enregistre aussi son abrogation, la
réponse vous avertit.

### Suite et partie

Les champs de pagination. `next` dit où commence le reste : `{ "page": 2 }` pour une liste,
`{ "offset": 38000 }` pour un texte long, ou `null` quand il ne reste rien. `part` dit quels
caractères d'un texte long la réponse montre : `from`, `to` et `of` (la longueur du texte entier).
Voir
[Lire les réponses de Vigueur](../20-using/05-reading-answers.md#les-longues-réponses-sont-coupées-et-paginées).

### Texte consolidé

Une loi, un décret ou un code tel qu'il se lit à une date donnée, toutes modifications ultérieures
intégrées, par opposition au texte tel qu'il a été publié à l'origine. Voir
[JORF](#jorf-journal-officiel) et [Version](#version).

### Type de réponse

Le champ `outcome` d'une réponse : le type de réponse dont il s'agit, comme `found`, `not_found`,
`several_matches`, `not_in_force`, `results`, `no_results`, `not_configured` ou `error`. Voir
[Lire les réponses de Vigueur](../20-using/05-reading-answers.md#le-type-de-réponse-dit-à-quoi-vous-avez-affaire).

### Version

Chaque fois qu'un article ou un texte est modifié, Légifrance enregistre une nouvelle version avec
ses propres dates de validité. L'historique d'un article liste chaque version, et les textes qui
l'ont créé, modifié ou abrogé. Demandez une date passée pour lire la version qui s'appliquait alors.

### Visa

Les références qui ouvrent une décision (les textes sur lesquels elle s'appuie). Judilibre affiche
le visa d'une décision de la Cour de cassation quand elle en a un.

### Zone

Une partie nommée d'une décision sur Judilibre. Demandez à Claude une zone pour ne lire que cette
partie.

| Zone | Partie de la décision |
|---|---|
| `introduction` | L'ouverture : juridiction, parties, le pourvoi |
| `expose` | Les faits et la procédure (exposé du litige) |
| `moyens` | Les griefs qu'une partie soutient (moyens) |
| `motivations` | Le raisonnement de la juridiction (motivations) |
| `dispositif` | La partie où la juridiction statue (dispositif) |
| `annexes` | Les annexes, quand il y en a |

Les décisions de la Cour de cassation portent des zones quand la source les marque ; les décisions
de cour d'appel observées en novembre 2026 en avaient aussi, sans `moyens`. Certaines décisions ne
portent aucun balisage en zones ; Vigueur affiche alors le texte intégral et le dit.
