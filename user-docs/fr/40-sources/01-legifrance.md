---
title: "Légifrance"
level: reference
tags: [sources, legifrance, codes, case-law, journal-officiel]
summary: "Sachez ce que détient Légifrance, quel fonds répond à quel outil de Vigueur, comment fonctionnent les statuts et les dates de validité, et où la source a des lacunes ou des retards."
updated: 2026-11-17
---

# Légifrance

Légifrance est le service public de la diffusion du droit du gouvernement français. Vigueur le lit par la
passerelle PISTE ([PISTE](03-piste.md)). Cette page indique ce que détient Légifrance, comment Vigueur
utilise chaque partie, et ce qui a été observé à son sujet. Les observations sont datées : elles
décrivent la source en novembre 2026 et peuvent changer.

## Les fonds en un coup d'œil

| Fonds | Ce qu'il détient | Outils de Vigueur |
|---|---|---|
| Codes | Les codes consolidés (Code civil, Code du travail…) : toutes les versions de tous les articles, avec leurs dates de validité | [`legifrance_get_article`](../30-tools/legifrance_get_article.md), [`legifrance_get_article_history`](../30-tools/legifrance_get_article_history.md), [`legifrance_browse_code`](../30-tools/legifrance_browse_code.md), [`legifrance_list_changes`](../30-tools/legifrance_list_changes.md), [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md) (`codes`) |
| LODA | Lois, ordonnances, décrets et arrêtés consolidés | [`legifrance_get_text`](../30-tools/legifrance_get_text.md), [`legifrance_list_changes`](../30-tools/legifrance_list_changes.md), [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md) (`loda`) |
| JORF | Le [Journal officiel](../00-intro/03-glossary.md) dans sa version publiée : chaque texte sous sa forme initiale | [`legifrance_latest_jo`](../30-tools/legifrance_latest_jo.md), [`legifrance_get_text`](../30-tools/legifrance_get_text.md), [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md) (`jorf`) |
| KALI | Conventions collectives nationales, recherchées par IDCC | [`legifrance_search_legislation`](../30-tools/legifrance_search_legislation.md) (`kali`) |
| JURI | Jurisprudence judiciaire : Cour de cassation et certaines cours d'appel | [`legifrance_search_case_law`](../30-tools/legifrance_search_case_law.md) (`judicial`), [`legifrance_get_decision`](../30-tools/legifrance_get_decision.md) |
| CETAT | Jurisprudence administrative : Conseil d'État, cours administratives d'appel, tribunaux administratifs | mêmes outils (`administrative`) |
| CONSTIT | Décisions du Conseil constitutionnel | mêmes outils (`constitutional`) |
| CNIL | Délibérations et décisions de la CNIL | mêmes outils (`cnil`) |
| JUFI | Juridictions financières : Cour des comptes et chambres régionales et territoriales des comptes | mêmes outils (`financial`) |

[`legifrance_list_reference_values`](../30-tools/legifrance_list_reference_values.md) liste les noms que
Légifrance accepte comme filtres (codes, natures de textes du Journal officiel, ministères émetteurs).

Vigueur n'utilise pas les autres fonds que propose Légifrance (les circulaires, par exemple).

Volumes, observés en novembre 2026 : la liste des codes comptait 108 codes, dont 76 en vigueur et 32
abrogés ; le fonds judiciaire contenait environ 600 000 décisions, le fonds administratif environ
570 000, le fonds financier environ 3 500, la CNIL environ 27 000 et le Conseil constitutionnel environ
7 400.

## Codes : versions, statuts et dates de validité

**Chaque article a des versions.** Chaque version a une date de début et une date de fin. Vigueur détermine
si une version s'applique à une date donnée à partir de ces deux dates seulement : elle s'applique de
sa date de début jusqu'à sa date de fin, celle-ci non comprise. Le libellé de statut propre à
Légifrance est affiché à côté du résultat, tel que la source l'écrit (`VIGUEUR`, `MODIFIE`,
`ABROGE`…), mais ce sont les dates qui tranchent.

**Dates sentinelles.** Légifrance écrit « pas de fin » sous la forme de l'année 2999 et « date non
déterminée » (une abrogation différée sans date pour l'instant) sous la forme d'une date en 2222.
Vigueur ne les montre jamais comme de vraies dates : l'absence de fin se lit `"until": null`, et une
abrogation sans date pour l'instant se lit `"until_undetermined": true`. Un `status` se lit, par
exemple, comme suit (la réponse à une lecture de l'article 1240 du Code civil, puis de l'article 1382 à
une date postérieure à 2016, puis, pour une section du Code du travail lue au 1er janvier 2005, une version
qui commence plus tard) :

```
"status": {
  "state": "in_force",
  "on": "2026-11-16",
  "from": "2016-10-01",
  "until": null,
  "until_undetermined": false
}
```

```
"status": {
  "state": "not_in_force",
  "on": "2026-11-16",
  "from": "1804-03-21",
  "until": "2016-10-01",
  "until_undetermined": false
}
```

```
"status": {
  "state": "not_yet_in_force",
  "on": "2005-01-01",
  "from": "2008-05-01",
  "until": null,
  "until_undetermined": false
}
```

Le `state` est `in_force`, `not_in_force`, `not_yet_in_force` ou `never_applied`. (Le libellé de `state`
est celui de Vigueur ; le libellé propre à Légifrance est donné à côté, dans `legifrance_status`.)

**Versions programmées.** Légifrance liste des versions qui entrent en vigueur plus tard,
parfois dans plusieurs années (observé : des modifications programmées du Code civil et du Code du
travail). Une version programmée est présentée comme pas encore en vigueur à la date du jour, et une
abrogation différée n'est jamais cachée derrière « en vigueur ».

**Un statut peut contredire les liens d'abrogation.** Observé en novembre 2026 : certains articles de
l'ancienne partie législative du Code du travail portent encore le libellé « en vigueur » sans date de
fin alors que la source enregistre aussi leur abrogation. Quand Vigueur voit les deux, un avertissement
le dit :

```
"Légifrance marks this version in force, but also records its abrogation by {text} (effective {date})."
```

**Renumérotation.** Quand un article a été renuméroté, Légifrance enregistre un lien de l'ancien
numéro vers le nouveau (par exemple l'ancien article 1382 du Code civil, devenu 1240). Vigueur montre
ce lien quand la source le donne.

**Abrogé ou inexistant.** Pour la date du jour, un article abrogé et un numéro qui n'a jamais existé
se présentent de la même façon dans l'une des consultations de Légifrance. Vigueur cherche alors toutes
les versions enregistrées, pour pouvoir vous dire qu'un article a été abrogé plutôt que de le déclarer
introuvable.

**Listes de modifications.** `legifrance_list_changes` date les modifications par leur date d'entrée
en vigueur, non par leur date de publication.

**Tables des matières.** La table des matières complète d'un grand code est très volumineuse (observé :
environ 19 Mo pour le Code du travail) ; `legifrance_browse_code` montre donc un niveau à la fois. Les
articles d'une table des matières ne portent que le libellé actuel de Légifrance : pour savoir ce qui
s'appliquait à une autre date, lisez l'article avec `at_date`.

## LODA et le Journal officiel

- **Version consolidée ou version publiée.** LODA détient le texte actuel, consolidé, d'une loi ou d'un décret. JORF
  détient le texte tel qu'il a paru au Journal officiel. JORF n'a pas de filtre « en vigueur » : une
  recherche par mots, NOR ou numéro de texte peut être restreinte par date de publication à la place.
- **Les lois organiques sont classées comme des lois.** Observé en novembre 2026 : LODA classe une loi
  organique sous la nature `LOI`, alors que le Journal officiel la liste comme loi organique. Vigueur
  accepte `loi_organique`, cherche dans LODA comme pour une loi et garde les textes dont le titre
  commence par « Loi organique ».
- **Les émetteurs changent.** Les noms des ministères et des autorités dans le Journal officiel
  changent avec les gouvernements, et la source ne liste que ceux présents dans les résultats
  correspondants. Un filtre sur un nom obsolète ne renvoie rien. Demandez la liste des émetteurs avant de
  filtrer.
- **Numéros de texte et NOR.** Un texte peut être trouvé par nature et numéro (« loi 78-17 »), par NOR,
  ou par identifiant.

## Conventions collectives (KALI)

Les conventions se recherchent par IDCC ou par mots, et seulement avec `legifrance_search_legislation`.
Une recherche renvoie les conventions actuellement en vigueur, étendues ou non ; le critère de date ne
s'applique pas. Lire une convention en entier avec `legifrance_get_text` n'est pas pris en charge.

## Jurisprudence

**La plupart des détails viennent des titres.** Un résultat de recherche porte un titre en texte
brut, un extrait et, dans certains fonds, une solution, mais ni date, ni numéro, ni chambre
structurés. Vigueur lit la date, les numéros, la juridiction et la publication dans le titre. Un titre
qu'il ne sait pas lire est montré tel que Légifrance l'a écrit.

**Lacunes de couverture et retards**, observés en novembre 2026 :

- **Cour de cassation.** Le fonds judiciaire détient une partie des décisions de la Cour de cassation.
  Sa décision de la Cour de cassation la plus récente était antérieure d'environ huit semaines à la plus
  récente de Judilibre. Les rejets non spécialement motivés et les non-admissions (formation
  restreinte RNSM/NA) n'y figurent pas. Vigueur ajoute une note à ce sujet (dans `warnings`) à
  chaque recherche dans le fonds judiciaire et à la réponse « introuvable » pour un identifiant de la Cour de
  cassation.
- **Cours d'appel.** Le fonds judiciaire ne détient les décisions de cour d'appel que jusqu'au début de
  2023. Les décisions récentes des cours d'appel et des juridictions du premier degré sont dans Judilibre
  ([Judilibre](02-judilibre.md)).
- **La même décision dans les deux sources.** Une décision de la Cour de cassation détenue par les deux
  porte le même ECLI et le même texte, à l'exception d'une courte ligne d'ouverture et de clôture
  ajoutée par Légifrance et de quelques défauts d'encodage (un caractère parasite à la place d'un
  tiret, par exemple).
- **Numéros de cour d'appel.** Dans le seul cas essayé, un numéro de cour d'appel (RG) cherché dans le
  fonds judiciaire n'a rien donné.

**Numéros.**

- Un numéro de pourvoi fonctionne quelle que soit sa graphie (`24-16.924` ou `2416924`).
- Les décisions du Conseil constitutionnel exigent le numéro exact sous lequel elles sont classées. **Une
  décision rendue sur des affaires jointes est classée sous le numéro combiné complet**, tel que
  `2026-1217/1218`. La recherche par l'un des deux numéros (`2026-1217`) ne donne rien. Vigueur retire la nature placée en fin
  de numéro (`QPC`, `DC`). Quand une recherche par un numéro sans `/` ne trouve rien, Vigueur le dit et renvoie vers la
  forme combinée.
- Les numéros de la CNIL se présentent sous la forme `2026-023` ; ceux de la Cour des comptes sous la
  forme `S-2026-1111`.

**Filtres.**

- **Fonds administratif.** La source échoue (erreur serveur) quand on lui demande de séparer le Conseil
  d'État, les cours administratives d'appel et les tribunaux administratifs ; Vigueur n'a donc pas de
  tel filtre.
- **Tri.** « Du plus récent au plus ancien » fonctionne sur tous les fonds. Le fonds CNIL exige son propre
  nom de tri, que Vigueur utilise ; avec le nom habituel, la source répond sans trier et sans
  avertissement.
- **Dates.** Elles filtrent sur la date de la décision (la date de la délibération pour la CNIL).

**Publication.** Le marqueur de publication de la source pour la Cour de cassation est le Bulletin. Une
décision qui n'en a pas est montrée comme `Inédit` quand le titre le dit, et Vigueur n'écrit jamais
« non publiée » pour une décision sans marqueur (`publication` vaut `null`).

**Textes.** Le texte d'une décision arrive avec les noms pseudonymisés par la source. Son sommaire
n'existe que pour certaines décisions. Les décisions du Conseil constitutionnel donnent aussi la page
du Conseil lui-même et le lien du Journal officiel (`constitutional_council_link` et `jo_link`). Une
délibération de la CNIL montre son statut tel que Légifrance le libelle.

## Liens

Les réponses de Légifrance ne contiennent aucune adresse de page officielle (sauf celle du Conseil
constitutionnel). Vigueur construit chaque lien à partir de l'identifiant (les champs `link` de ses
réponses). Il ne peut pas ouvrir les pages pour les vérifier : le site de Légifrance a refusé les
requêtes automatisées (observé en novembre 2026).

## Voir aussi

- [Codes, lois et décrets](../20-using/02-legislation.md)
- [Jurisprudence](../20-using/03-case-law.md)
- [Le Journal officiel et le suivi des modifications](../20-using/04-journal-officiel.md)
- [Judilibre](02-judilibre.md)
- [PISTE](03-piste.md)
