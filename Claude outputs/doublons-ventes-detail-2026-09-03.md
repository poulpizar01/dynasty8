# Rapport détaillé — ventes potentiellement dupliquées (analyse en lecture seule)

*Généré le 2026-09-03 à partir de la réplique locale `dynasty8_qa`, identique aux données réellement migrées (vérifié précédemment). Aucune écriture, aucune suppression, aucune modification n'a été effectuée. 478 lignes couvertes, chacune apparaissant dans exactement un groupe ci-dessous.*

## Algorithme de détection

1. **Périmètre** : toutes les lignes de `stats_logs_ventes` dont le `numero_vente` n'est pas vide et apparaît plus d'une fois — le même critère que le détecteur d'anomalies déjà intégré au site (`doublon_numero_vente` dans `stats-calc.js`).
2. **`EXACT`** : au sein d'un même `numero_vente`, les lignes dont les 16 colonnes suivantes sont **toutes** strictement identiques : numero_vente, date_vente, identite, formateur, identite_client, numero_tel, interieur, garage, garage_indispo, garage_refus, entreprise_identite, id_entreprise, type, loc, achat, semaine.
3. **`PROBABLE`** : parmi les lignes restantes d'un même `numero_vente`, celles qui partagent les mêmes champs « cœur » (identite, identite_client, achat, type, semaine, date_vente) mais diffèrent sur des champs secondaires (téléphone, formateur, intérieur/garage, entreprise...).
4. **`À VÉRIFIER`** : lignes qui ne partagent que le `numero_vente`, sans concordance des champs cœur — rien ne prouve qu'il s'agit d'un doublon.

**Le même montant ou le même agent, seuls, ne suffisent jamais à classer un groupe** — c'est toujours la combinaison des champs ci-dessus qui décide.

## Détail par groupe

### Groupe 1 — n° de vente « 106 » — **EXACT**

- Lignes (id) : 101, 109
- Semaine : S18-26 · Agent : xbrazza · Client : Tayler Moods · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 101 | 2026-09-02 14:26:51 | 27/04/2026 | 52500 | Originale (à conserver) |
| 109 | 2026-09-02 14:26:51 | 27/04/2026 | 52500 | Doublon proposé |

**Montant potentiellement compté en double : 52 500 $**

### Groupe 2 — n° de vente « 108 » — **EXACT**

- Lignes (id) : 103, 108
- Semaine : S18-26 · Agent : xbrazza · Client : Tayler Moods · Type : Vente
- Garage : Garage 10 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 103 | 2026-09-02 14:26:51 | 27/04/2026 | 131250 | Originale (à conserver) |
| 108 | 2026-09-02 14:26:51 | 27/04/2026 | 131250 | Doublon proposé |

**Montant potentiellement compté en double : 131 250 $**

### Groupe 3 — n° de vente « 123 » — **À VÉRIFIER**

- Lignes (id) : 121, 124
- Semaine : S18-26 · Agent : hisoka0069 · Client : Amine Delarusa · Type : Vente
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 121 | 2026-09-02 14:26:51 | 27/04/2026 | 0 | Originale (à conserver) |
| 124 | 2026-09-02 14:26:51 | 27/04/2026 | 2835 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 4 — n° de vente « 132 » — **PROBABLE**

- Lignes (id) : 131, 132
- Semaine : S18-26 · Agent : xbrazza · Client : Matheo Pichet · Type : Vente
- Intérieur : Grand Entrepôt
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (interieur).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 131 | 2026-09-02 14:26:51 | 28/04/2026 | 262500 | Originale (à conserver) |
| 132 | 2026-09-02 14:26:51 | 28/04/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 262 500 $**

### Groupe 5 — n° de vente « 154 » — **À VÉRIFIER**

- Lignes (id) : 154, 155
- Semaine : S18-26 · Agent : antoine.cplt · Client : Bloom Ivy · Type : Vente
- Garage : Garage 10 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 154 | 2026-09-02 14:26:51 | 28/04/2026 | 131250 | Originale (à conserver) |
| 155 | 2026-09-02 14:26:51 | 28/04/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 6 — n° de vente « 1810 » — **EXACT**

- Lignes (id) : 2063, 2148
- Semaine : S20-26 · Agent : nayar_lvs · Client : Figarland Shamr · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2063 | 2026-09-02 14:26:51 | 13/05/2026 | 2835 | Originale (à conserver) |
| 2148 | 2026-09-02 14:26:51 | 13/05/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 7 — n° de vente « 1810 » — **À VÉRIFIER**

- Lignes (id) : 1902
- Semaine : S20-26 · Agent : nayar_lvs · Client : Figerland Shamr · Type : Location
- Intérieur : Motel
- Justification : Ligne isolée : partage le même numéro de vente qu'un doublon détecté ci-dessus (EXACT ou PROBABLE), mais ses propres données ne correspondent à aucune autre ligne — aucune ligne comparable en double à lui associer.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1902 | 2026-09-02 14:26:51 | 13/05/2026 | 2835 | Ligne isolée (aucun doublon associé) |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 8 — n° de vente « 185 » — **À VÉRIFIER**

- Lignes (id) : 186, 192
- Semaine : S18-26 · Agent : capitainebalou · Client : Torez Illyes · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 186 | 2026-09-02 14:26:51 | 28/04/2026 | 8750 | Originale (à conserver) |
| 192 | 2026-09-02 14:26:51 | 28/04/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 9 — n° de vente « 186 » — **À VÉRIFIER**

- Lignes (id) : 187, 190
- Semaine : S18-26 · Agent : capitainebalou · Client : Torez Illyes · Type : Location
- Intérieur : Flat 2
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 187 | 2026-09-02 14:26:51 | 28/04/2026 | 4725 | Originale (à conserver) |
| 190 | 2026-09-02 14:26:51 | 28/04/2026 | 4725 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 10 — n° de vente « 1863 » — **À VÉRIFIER**

- Lignes (id) : 993, 2592
- Semaine : S20-26 · Agent : djezzzzyy · Client : Peacher Alpha · Type : Location
- Intérieur : Low-end unfurnished apartement
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 993 | 2026-09-02 14:26:51 | 13/05/2026 | 10500 | Originale (à conserver) |
| 2592 | 2026-09-02 14:26:51 | 13/05/2026 | 10500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 11 — n° de vente « 188 » — **EXACT**

- Lignes (id) : 189, 191
- Semaine : S18-26 · Agent : vlvde · Client : Mason Kael · Type : Vente
- Intérieur : Plantation
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 189 | 2026-09-02 14:26:51 | 28/04/2026 | 50000 | Originale (à conserver) |
| 191 | 2026-09-02 14:26:51 | 28/04/2026 | 50000 | Doublon proposé |

**Montant potentiellement compté en double : 50 000 $**

### Groupe 12 — n° de vente « 1918 » — **À VÉRIFIER**

- Lignes (id) : 1930, 1932
- Semaine : S20-26 · Agent : xbrazza · Client : Silvin Kiket · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1930 | 2026-09-02 14:26:51 | 14/05/2026 | 262500 | Originale (à conserver) |
| 1932 | 2026-09-02 14:26:51 | 14/05/2026 | 249375 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 13 — n° de vente « 1922 » — **EXACT**

- Lignes (id) : 1935, 2045
- Semaine : S20-26 · Agent : xbrazza · Client : Curtis Shiva · Type : Vente
- Garage : Garage 6 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1935 | 2026-09-02 14:26:51 | 14/05/2026 | 78750 | Originale (à conserver) |
| 2045 | 2026-09-02 14:26:51 | 14/05/2026 | 78750 | Doublon proposé |

**Montant potentiellement compté en double : 78 750 $**

### Groupe 14 — n° de vente « 1923 » — **EXACT**

- Lignes (id) : 1936, 2048
- Semaine : S20-26 · Agent : k9nda · Client : Vescalie Sergio · Type : Vente
- Intérieur : House 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1936 | 2026-09-02 14:26:51 | 14/05/2026 | 47250 | Originale (à conserver) |
| 2048 | 2026-09-02 14:26:51 | 14/05/2026 | 47250 | Doublon proposé |

**Montant potentiellement compté en double : 47 250 $**

### Groupe 15 — n° de vente « 1925 » — **EXACT**

- Lignes (id) : 1938, 2049
- Semaine : S20-26 · Agent : k9nda · Client : Hee Marion · Type : Location
- Intérieur : Flat 3
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1938 | 2026-09-02 14:26:51 | 14/05/2026 | 7560 | Originale (à conserver) |
| 2049 | 2026-09-02 14:26:51 | 14/05/2026 | 7560 | Doublon proposé |

**Montant potentiellement compté en double : 7 560 $**

### Groupe 16 — n° de vente « 1926 » — **EXACT**

- Lignes (id) : 1939, 2050
- Semaine : S20-26 · Agent : k9nda · Client : Nat Jake · Type : Vente
- Intérieur : Small Flat Unfurnished 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1939 | 2026-09-02 14:26:51 | 14/05/2026 | 61250 | Originale (à conserver) |
| 2050 | 2026-09-02 14:26:51 | 14/05/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 17 — n° de vente « 1943 » — **À VÉRIFIER**

- Lignes (id) : 1956, 1957
- Semaine : S20-26 · Agent : zirnox · Client : Brooks Tyler · Type : Vente
- Intérieur : Small House Unfurnished
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1956 | 2026-09-02 14:26:51 | 14/05/2026 | 140000 | Originale (à conserver) |
| 1957 | 2026-09-02 14:26:51 | 14/05/2026 | 87500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 18 — n° de vente « 1951 » — **À VÉRIFIER**

- Lignes (id) : 1965, 2066
- Semaine : S20-26 · Agent : _aytee · Client : Syra Kyros · Type : Location
- Garage : Garage 20 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1965 | 2026-09-02 14:26:51 | 14/05/2026 | 16625 | Originale (à conserver) |
| 2066 | 2026-09-02 14:26:51 | 14/05/2026 | 16625 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 19 — n° de vente « 1954 » — **EXACT**

- Lignes (id) : 1968, 2189
- Semaine : S20-26 · Agent : k9nda · Client : Gashi Volk · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1968 | 2026-09-02 14:26:51 | 14/05/2026 | 17500 | Originale (à conserver) |
| 2189 | 2026-09-02 14:26:51 | 14/05/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 20 — n° de vente « 1955 » — **EXACT**

- Lignes (id) : 1969, 2190
- Semaine : S20-26 · Agent : k9nda · Client : Gashi Volk · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1969 | 2026-09-02 14:26:51 | 14/05/2026 | 17500 | Originale (à conserver) |
| 2190 | 2026-09-02 14:26:51 | 14/05/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 21 — n° de vente « 1958 » — **EXACT**

- Lignes (id) : 1972, 2036
- Semaine : S20-26 · Agent : capitainebalou · Client : Hoon Ji · Type : Location
- Intérieur : Low-end unfurnished apartement
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1972 | 2026-09-02 14:26:51 | 14/05/2026 | 5250 | Originale (à conserver) |
| 2036 | 2026-09-02 14:26:51 | 14/05/2026 | 5250 | Doublon proposé |

**Montant potentiellement compté en double : 5 250 $**

### Groupe 22 — n° de vente « 1959 » — **À VÉRIFIER**

- Lignes (id) : 1973, 1977
- Semaine : S20-26 · Agent : capitainebalou · Client : Xinxazizio Shin · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1973 | 2026-09-02 14:26:51 | 14/05/2026 | 17500 | Originale (à conserver) |
| 1977 | 2026-09-02 14:26:51 | 14/05/2026 | 35000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 23 — n° de vente « 1962 » — **À VÉRIFIER**

- Lignes (id) : 1976, 2037
- Semaine : S20-26 · Agent : capitainebalou · Client : Xinxazizio Shi · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1976 | 2026-09-02 14:26:51 | 14/05/2026 | 35000 | Originale (à conserver) |
| 2037 | 2026-09-02 14:26:51 | 14/05/2026 | 35000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 24 — n° de vente « 1972 » — **À VÉRIFIER**

- Lignes (id) : 1987, 2065
- Semaine : S20-26 · Agent : _aytee · Client : Jairo Calderon · Type : Vente
- Intérieur : Small Flat Unfurnished 4
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1987 | 2026-09-02 14:26:51 | 14/05/2026 | 346250 | Originale (à conserver) |
| 2065 | 2026-09-02 14:26:51 | 14/05/2026 | 346250 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 25 — n° de vente « 1979 » — **À VÉRIFIER**

- Lignes (id) : 1994, 2064
- Semaine : S20-26 · Agent : _aytee · Client : Alby Cross · Type : Vente
- Intérieur : House 2
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 1994 | 2026-09-02 14:26:51 | 14/05/2026 | 87500 | Originale (à conserver) |
| 2064 | 2026-09-02 14:26:51 | 14/05/2026 | 87500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 26 — n° de vente « 1986 » — **À VÉRIFIER**

- Lignes (id) : 2001, 2038
- Semaine : S20-26 · Agent : capitainebalou · Client : Jenkins Malaika · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2001 | 2026-09-02 14:26:51 | 14/05/2026 | 17500 | Originale (à conserver) |
| 2038 | 2026-09-02 14:26:51 | 14/05/2026 | 17500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 27 — n° de vente « 201 » — **EXACT**

- Lignes (id) : 205, 218
- Semaine : S18-26 · Agent : hisoka0069 · Client : Diego Herrera · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 205 | 2026-09-02 14:26:51 | 28/04/2026 | 8750 | Originale (à conserver) |
| 218 | 2026-09-02 14:26:51 | 28/04/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 28 — n° de vente « 2013 » — **EXACT**

- Lignes (id) : 2028, 2128
- Semaine : S20-26 · Agent : wapawapawapawapa · Client : Dario Alvarez · Type : Location
- Intérieur : Small Flat Unfurnished 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2028 | 2026-09-02 14:26:51 | 14/05/2026 | 7000 | Originale (à conserver) |
| 2128 | 2026-09-02 14:26:51 | 14/05/2026 | 7000 | Doublon proposé |

**Montant potentiellement compté en double : 7 000 $**

### Groupe 29 — n° de vente « 202 » — **EXACT**

- Lignes (id) : 206, 241
- Semaine : S18-26 · Agent : hisoka0069 · Client : Diego Herrera · Type : Vente
- Garage : Garage 6 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 206 | 2026-09-02 14:26:51 | 28/04/2026 | 78750 | Originale (à conserver) |
| 241 | 2026-09-02 14:26:51 | 28/04/2026 | 78750 | Doublon proposé |

**Montant potentiellement compté en double : 78 750 $**

### Groupe 30 — n° de vente « 2047 » — **EXACT**

- Lignes (id) : 2073, 2084
- Semaine : S20-26 · Agent : k9nda · Client : Wallace Marcus · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2073 | 2026-09-02 14:26:51 | 15/05/2026 | 2835 | Originale (à conserver) |
| 2084 | 2026-09-02 14:26:51 | 15/05/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 31 — n° de vente « 209 » — **EXACT**

- Lignes (id) : 219, 220, 351, 352
- Semaine : S18-26 · Agent : hisoka0069 · Client : Kayden Kane · Type : Vente
- Intérieur : Small Flat Unfurnished 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 219 | 2026-09-02 14:26:51 | 29/04/2026 | 133001 | Originale (à conserver) |
| 220 | 2026-09-02 14:26:51 | 29/04/2026 | 133001 | Doublon proposé |
| 351 | 2026-09-02 14:26:51 | 29/04/2026 | 133001 | Doublon proposé |
| 352 | 2026-09-02 14:26:51 | 29/04/2026 | 133001 | Doublon proposé |

**Montant potentiellement compté en double : 399 003 $**

### Groupe 32 — n° de vente « 209 » — **À VÉRIFIER**

- Lignes (id) : 213
- Semaine : S18-26 · Agent : hisoka0069 · Client : Kayden Kane · Type : Vente
- Intérieur : Flat 1
- Justification : Ligne isolée : partage le même numéro de vente qu'un doublon détecté ci-dessus (EXACT ou PROBABLE), mais ses propres données ne correspondent à aucune autre ligne — aucune ligne comparable en double à lui associer.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 213 | 2026-09-02 14:26:51 | 29/04/2026 | 128678 | Ligne isolée (aucun doublon associé) |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 33 — n° de vente « 211 » — **À VÉRIFIER**

- Lignes (id) : 215, 217
- Semaine : S18-26 · Agent : hisoka0069 · Client : Connor · Type : Location
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 215 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Originale (à conserver) |
| 217 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 34 — n° de vente « 2142 » — **EXACT**

- Lignes (id) : 2170, 2228
- Semaine : S20-26 · Agent : kaddara · Client : Curtis Jackson · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2170 | 2026-09-02 14:26:51 | 16/05/2026 | 262500 | Originale (à conserver) |
| 2228 | 2026-09-02 14:26:51 | 16/05/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 262 500 $**

### Groupe 35 — n° de vente « 2160 » — **EXACT**

- Lignes (id) : 2188, 2712
- Semaine : S20-26 · Agent : k9nda · Client : Krasniqi Zoran · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2188 | 2026-09-02 14:26:51 | 16/05/2026 | 35000 | Originale (à conserver) |
| 2712 | 2026-09-02 14:26:51 | 16/05/2026 | 35000 | Doublon proposé |

**Montant potentiellement compté en double : 35 000 $**

### Groupe 36 — n° de vente « 2257 » — **EXACT**

- Lignes (id) : 2288, 2305
- Semaine : S20-26 · Agent : k9nda · Client : Ryo Zenjiro · Type : Vente
- Intérieur : Office 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2288 | 2026-09-02 14:26:51 | 17/05/2026 | 35000 | Originale (à conserver) |
| 2305 | 2026-09-02 14:26:51 | 17/05/2026 | 35000 | Doublon proposé |

**Montant potentiellement compté en double : 35 000 $**

### Groupe 37 — n° de vente « 2285 » — **À VÉRIFIER**

- Lignes (id) : 2317, 2318
- Semaine : S20-26 · Agent : welozbee · Client : Cruzz Ophélie · Type : Vente
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2317 | 2026-09-02 14:26:51 | 17/05/2026 | 0 | Originale (à conserver) |
| 2318 | 2026-09-02 14:26:51 | 17/05/2026 | 17500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 38 — n° de vente « 2304 » — **EXACT**

- Lignes (id) : 2337, 2758, 2759
- Semaine : S20-26 · Agent : capitainebalou · Client : Straduis Shame · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2337 | 2026-09-02 14:26:51 | 17/05/2026 | 262500 | Originale (à conserver) |
| 2758 | 2026-09-02 14:26:51 | 17/05/2026 | 262500 | Doublon proposé |
| 2759 | 2026-09-02 14:26:51 | 17/05/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 525 000 $**

### Groupe 39 — n° de vente « 2305 » — **EXACT**

- Lignes (id) : 2338, 2760
- Semaine : S20-26 · Agent : capitainebalou · Client : Straduis Shame · Type : Vente
- Intérieur : Small Flat Unfurnished 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2338 | 2026-09-02 14:26:51 | 17/05/2026 | 61250 | Originale (à conserver) |
| 2760 | 2026-09-02 14:26:51 | 17/05/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 40 — n° de vente « 2384 » — **À VÉRIFIER**

- Lignes (id) : 2417, 2419
- Semaine : S21-26 · Agent : breeprime · Client : Collins Carter · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2417 | 2026-09-02 14:26:51 | 18/05/2026 | 262500 | Originale (à conserver) |
| 2419 | 2026-09-02 14:26:51 | 18/05/2026 | 249375 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 41 — n° de vente « 242 » — **À VÉRIFIER**

- Lignes (id) : 253, 336
- Semaine : S18-26 · Agent : kaddara · Client : Zac Hernandez · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 253 | 2026-09-02 14:26:51 | 29/04/2026 | 35000 | Originale (à conserver) |
| 336 | 2026-09-02 14:26:51 | 29/04/2026 | 35000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 42 — n° de vente « 2463 » — **À VÉRIFIER**

- Lignes (id) : 2497, 2500
- Semaine : S21-26 · Agent : kisay · Client : Parker Nora · Type : Vente
- Intérieur : Low-end unfurnished apartement
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2497 | 2026-09-02 14:26:51 | 18/05/2026 | 43750 | Originale (à conserver) |
| 2500 | 2026-09-02 14:26:51 | 18/05/2026 | 41563 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 43 — n° de vente « 2464 » — **À VÉRIFIER**

- Lignes (id) : 2498, 2499
- Semaine : S21-26 · Agent : wapawapawapawapa · Client : Jericho Kain · Type : Vente
- Intérieur : Flat 3
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2498 | 2026-09-02 14:26:51 | 18/05/2026 | 144900 | Originale (à conserver) |
| 2499 | 2026-09-02 14:26:51 | 18/05/2026 | 140000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 44 — n° de vente « 2557 » — **À VÉRIFIER**

- Lignes (id) : 2594, 2595
- Semaine : S21-26 · Agent : liamena · Client : Legrand Milo · Type : Vente
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2594 | 2026-09-02 14:26:51 | 19/05/2026 | 0 | Originale (à conserver) |
| 2595 | 2026-09-02 14:26:51 | 19/05/2026 | 17500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 45 — n° de vente « 2607 » — **À VÉRIFIER**

- Lignes (id) : 2645, 2646
- Semaine : S21-26 · Agent : k9nda · Client : Payet Abdel · Type : Vente
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2645 | 2026-09-02 14:26:51 | 19/05/2026 | 0 | Originale (à conserver) |
| 2646 | 2026-09-02 14:26:51 | 19/05/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 46 — n° de vente « 2628 » — **À VÉRIFIER**

- Lignes (id) : 2667, 2668
- Semaine : S21-26 · Agent : kisay · Client : Duval Sam · Type : Vente
- Intérieur : Lester
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2667 | 2026-09-02 14:26:51 | 19/05/2026 | 73500 | Originale (à conserver) |
| 2668 | 2026-09-02 14:26:51 | 19/05/2026 | 69826 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 47 — n° de vente « 2679 » — **À VÉRIFIER**

- Lignes (id) : 2720, 2722
- Semaine : S21-26 · Agent : capitainebalou · Client : Cohen Nalan · Type : Vente
- Intérieur : Small Flat Unfurnished 3
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2720 | 2026-09-02 14:26:51 | 20/05/2026 | 226250 | Originale (à conserver) |
| 2722 | 2026-09-02 14:26:51 | 20/05/2026 | 226250 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 48 — n° de vente « 2686 » — **EXACT**

- Lignes (id) : 2728, 2735
- Semaine : S21-26 · Agent : totolafrappe · Client : naska beerus · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2728 | 2026-09-02 14:26:51 | 20/05/2026 | 8750 | Originale (à conserver) |
| 2735 | 2026-09-02 14:26:51 | 20/05/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 49 — n° de vente « 273 » — **EXACT**

- Lignes (id) : 285, 340
- Semaine : S18-26 · Agent : capitainebalou · Client : Lannez Liam · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 285 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Originale (à conserver) |
| 340 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 50 — n° de vente « 274 » — **EXACT**

- Lignes (id) : 286, 341
- Semaine : S18-26 · Agent : capitainebalou · Client : Liam Lannez · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 286 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Originale (à conserver) |
| 341 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 51 — n° de vente « 2746 » — **EXACT**

- Lignes (id) : 2790, 2806
- Semaine : S21-26 · Agent : k9nda · Client : Fliers Maxime · Type : Location
- Intérieur : Flat 3
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2790 | 2026-09-02 14:26:51 | 21/05/2026 | 7560 | Originale (à conserver) |
| 2806 | 2026-09-02 14:26:51 | 21/05/2026 | 7560 | Doublon proposé |

**Montant potentiellement compté en double : 7 560 $**

### Groupe 52 — n° de vente « 275 » — **EXACT**

- Lignes (id) : 287, 339
- Semaine : S18-26 · Agent : capitainebalou · Client : Liam Lannez · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 287 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Originale (à conserver) |
| 339 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 53 — n° de vente « 276 » — **EXACT**

- Lignes (id) : 288, 338
- Semaine : S18-26 · Agent : capitainebalou · Client : Liam Lannez · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 288 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Originale (à conserver) |
| 338 | 2026-09-02 14:26:51 | 29/04/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 54 — n° de vente « 2792 » — **EXACT**

- Lignes (id) : 2837, 2842
- Semaine : S21-26 · Agent : djezzzzyy · Client : Kefifi Mehdi · Type : Vente
- Garage : Garage 6 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2837 | 2026-09-02 14:26:51 | 22/05/2026 | 78750 | Originale (à conserver) |
| 2842 | 2026-09-02 14:26:51 | 22/05/2026 | 78750 | Doublon proposé |

**Montant potentiellement compté en double : 78 750 $**

### Groupe 55 — n° de vente « 2807 » — **EXACT**

- Lignes (id) : 2853, 2861
- Semaine : S21-26 · Agent : nayar_lvs · Client : Sanches Juan · Type : Vente
- Intérieur : Low-end unfurnished apartement
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2853 | 2026-09-02 14:26:51 | 22/05/2026 | 43750 | Originale (à conserver) |
| 2861 | 2026-09-02 14:26:51 | 22/05/2026 | 43750 | Doublon proposé |

**Montant potentiellement compté en double : 43 750 $**

### Groupe 56 — n° de vente « 2808 » — **EXACT**

- Lignes (id) : 2854, 2855
- Semaine : S21-26 · Agent : djezzzzyy · Client : Carter Léon · Type : Vente
- Intérieur : House 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2854 | 2026-09-02 14:26:51 | 22/05/2026 | 61250 | Originale (à conserver) |
| 2855 | 2026-09-02 14:26:51 | 22/05/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 57 — n° de vente « 2814 » — **PROBABLE**

- Lignes (id) : 2862, 2876
- Semaine : S21-26 · Agent : capitainebalou · Client : Gibbs Gabirel · Type : Vente
- Intérieur : House 2
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (interieur).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2862 | 2026-09-02 14:26:51 | 22/05/2026 | 140000 | Originale (à conserver) |
| 2876 | 2026-09-02 14:26:51 | 22/05/2026 | 140000 | Doublon proposé |

**Montant potentiellement compté en double : 140 000 $**

### Groupe 58 — n° de vente « 2881 » — **EXACT**

- Lignes (id) : 2928, 2929
- Semaine : S21-26 · Agent : wapawapawapawapa · Client : Tayler Moods · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2928 | 2026-09-02 14:26:51 | 23/05/2026 | 35000 | Originale (à conserver) |
| 2929 | 2026-09-02 14:26:51 | 23/05/2026 | 35000 | Doublon proposé |

**Montant potentiellement compté en double : 35 000 $**

### Groupe 59 — n° de vente « 2889 » — **EXACT**

- Lignes (id) : 2937, 2940
- Semaine : S21-26 · Agent : mathiascastelan · Client : harper louisa · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2937 | 2026-09-02 14:26:51 | 23/05/2026 | 17500 | Originale (à conserver) |
| 2940 | 2026-09-02 14:26:51 | 23/05/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 60 — n° de vente « 2890 » — **EXACT**

- Lignes (id) : 2938, 2939
- Semaine : S21-26 · Agent : mathiascastelan · Client : harper Louisa · Type : Location
- Garage : Garage 10 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2938 | 2026-09-02 14:26:51 | 23/05/2026 | 8750 | Originale (à conserver) |
| 2939 | 2026-09-02 14:26:51 | 23/05/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 61 — n° de vente « 2900 » — **EXACT**

- Lignes (id) : 2950, 2952
- Semaine : S21-26 · Agent : nayar_lvs · Client : Reies Thiago · Type : Vente
- Intérieur : Small Flat Unfurnished 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2950 | 2026-09-02 14:26:51 | 23/05/2026 | 61250 | Originale (à conserver) |
| 2952 | 2026-09-02 14:26:51 | 23/05/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 62 — n° de vente « 2906 » — **À VÉRIFIER**

- Lignes (id) : 2957, 2958
- Semaine : S21-26 · Agent : breeprime · Client : Smith Kyle · Type : Vente
- Intérieur : Flat 3
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2957 | 2026-09-02 14:26:51 | 23/05/2026 | 66150 | Originale (à conserver) |
| 2958 | 2026-09-02 14:26:51 | 23/05/2026 | 7560 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 63 — n° de vente « 293 » — **EXACT**

- Lignes (id) : 305, 307
- Semaine : S18-26 · Agent : hisoka0069 · Client : Rico Mariani · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 305 | 2026-09-02 14:26:51 | 29/04/2026 | 35000 | Originale (à conserver) |
| 307 | 2026-09-02 14:26:51 | 29/04/2026 | 35000 | Doublon proposé |

**Montant potentiellement compté en double : 35 000 $**

### Groupe 64 — n° de vente « 2943 » — **À VÉRIFIER**

- Lignes (id) : 2995, 2999
- Semaine : S21-26 · Agent : capitainebalou · Client : Bourk Anthony · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2995 | 2026-09-02 14:26:51 | 24/05/2026 | 8750 | Originale (à conserver) |
| 2999 | 2026-09-02 14:26:51 | 24/05/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 65 — n° de vente « 2945 » — **À VÉRIFIER**

- Lignes (id) : 2997, 2998
- Semaine : S21-26 · Agent : capitainebalou · Client : Bourk Anthony · Type : Location
- Garage : Garage 6 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 2997 | 2026-09-02 14:26:51 | 24/05/2026 | 5250 | Originale (à conserver) |
| 2998 | 2026-09-02 14:26:51 | 24/05/2026 | 5250 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 66 — n° de vente « 2953 » — **EXACT**

- Lignes (id) : 3007, 3012
- Semaine : S21-26 · Agent : mathiascastelan · Client : Santos Lenny · Type : Location
- Garage : Garage 10 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3007 | 2026-09-02 14:26:51 | 24/05/2026 | 8750 | Originale (à conserver) |
| 3012 | 2026-09-02 14:26:51 | 24/05/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 67 — n° de vente « 2954 » — **EXACT**

- Lignes (id) : 3008, 3011
- Semaine : S21-26 · Agent : mathiascastelan · Client : Santos Lenny · Type : Location
- Garage : Garage 10 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3008 | 2026-09-02 14:26:51 | 24/05/2026 | 8750 | Originale (à conserver) |
| 3011 | 2026-09-02 14:26:51 | 24/05/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 68 — n° de vente « 2955 » — **À VÉRIFIER**

- Lignes (id) : 3009, 3076
- Semaine : S21-26 · Agent : capitainebalou · Client : Calderon Jairo · Type : Vente
- Garage : Garage 6 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3009 | 2026-09-02 14:26:51 | 24/05/2026 | 78750 | Originale (à conserver) |
| 3076 | 2026-09-02 14:26:51 | 24/05/2026 | 78750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 69 — n° de vente « 296 » — **EXACT**

- Lignes (id) : 309, 344
- Semaine : S18-26 · Agent : capitainebalou · Client : San Goku · Type : Location
- Garage : Garage 6 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 309 | 2026-09-02 14:26:51 | 29/04/2026 | 5250 | Originale (à conserver) |
| 344 | 2026-09-02 14:26:51 | 29/04/2026 | 5250 | Doublon proposé |

**Montant potentiellement compté en double : 5 250 $**

### Groupe 70 — n° de vente « 2960 » — **EXACT**

- Lignes (id) : 3016, 3017
- Semaine : S21-26 · Agent : mathiascastelan · Client : Jackson Leon · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3016 | 2026-09-02 14:26:51 | 24/05/2026 | 17500 | Originale (à conserver) |
| 3017 | 2026-09-02 14:26:51 | 24/05/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 71 — n° de vente « 2966 » — **PROBABLE**

- Lignes (id) : 3023, 3027
- Semaine : S21-26 · Agent : mathiascastelan · Client : Osama Ilyes · Type : Vente
- Intérieur : House 2
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (interieur).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3023 | 2026-09-02 14:26:51 | 24/05/2026 | 140000 | Originale (à conserver) |
| 3027 | 2026-09-02 14:26:51 | 24/05/2026 | 140000 | Doublon proposé |

**Montant potentiellement compté en double : 140 000 $**

### Groupe 72 — n° de vente « 2979 » — **EXACT**

- Lignes (id) : 3037, 3042
- Semaine : S21-26 · Agent : breeprime · Client : Kasdi Marwen · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3037 | 2026-09-02 14:26:51 | 24/05/2026 | 8750 | Originale (à conserver) |
| 3042 | 2026-09-02 14:26:51 | 24/05/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 73 — n° de vente « 2980 » — **EXACT**

- Lignes (id) : 3038, 3040, 3041
- Semaine : S21-26 · Agent : breeprime · Client : Kasdi Marwen · Type : Vente
- Intérieur : Plantation
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3038 | 2026-09-02 14:26:51 | 24/05/2026 | 50000 | Originale (à conserver) |
| 3040 | 2026-09-02 14:26:51 | 24/05/2026 | 50000 | Doublon proposé |
| 3041 | 2026-09-02 14:26:51 | 24/05/2026 | 50000 | Doublon proposé |

**Montant potentiellement compté en double : 100 000 $**

### Groupe 74 — n° de vente « 2986 » — **À VÉRIFIER**

- Lignes (id) : 3047, 3048
- Semaine : S21-26 · Agent : breeprime · Client : Baltazar Yanis · Type : Vente
- Garage : Garage 10 places V
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3047 | 2026-09-02 14:26:51 | 24/05/2026 | 131250 | Originale (à conserver) |
| 3048 | 2026-09-02 14:26:51 | 24/05/2026 | 124688 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 75 — n° de vente « 3065 » — **EXACT**

- Lignes (id) : 3125, 3127
- Semaine : S22-26 · Agent : uonnay · Client : Hsm Haitam · Type : Vente
- Intérieur : Small Flat Unfurnished 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3125 | 2026-09-02 14:26:51 | 25/05/2026 | 61250 | Originale (à conserver) |
| 3127 | 2026-09-02 14:26:51 | 25/05/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 76 — n° de vente « 3071 » — **PROBABLE**

- Lignes (id) : 3131, 3144
- Semaine : S22-26 · Agent : k9nda · Client : Elijah Walker · Type : Vente
- Intérieur : Small Flat Unfurnished 2
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (interieur).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3131 | 2026-09-02 14:26:51 | 25/05/2026 | 61250 | Originale (à conserver) |
| 3144 | 2026-09-02 14:26:51 | 25/05/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 77 — n° de vente « 3072 » — **À VÉRIFIER**

- Lignes (id) : 3132, 3140
- Semaine : S22-26 · Agent : mathiascastelan · Client : Gregor Conor · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3132 | 2026-09-02 14:26:51 | 25/05/2026 | 35000 | Originale (à conserver) |
| 3140 | 2026-09-02 14:26:51 | 25/05/2026 | 17500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 78 — n° de vente « 3080 » — **À VÉRIFIER**

- Lignes (id) : 3141, 3142
- Semaine : S22-26 · Agent : uonnay · Client : Wlaz Lakpo · Type : Vente
- Intérieur : Unfurnished Flat 3
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3141 | 2026-09-02 14:26:51 | 25/05/2026 | 411250 | Originale (à conserver) |
| 3142 | 2026-09-02 14:26:51 | 25/05/2026 | 87500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 79 — n° de vente « 3099 » — **À VÉRIFIER**

- Lignes (id) : 3162, 3164
- Semaine : S22-26 · Agent : k9nda · Client : Reivo Karlev · Type : Vente
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3162 | 2026-09-02 14:26:51 | 25/05/2026 | 0 | Originale (à conserver) |
| 3164 | 2026-09-02 14:26:51 | 25/05/2026 | 17500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 80 — n° de vente « 3104 » — **À VÉRIFIER**

- Lignes (id) : 3168, 3181
- Semaine : S22-26 · Agent : kisay · Client : Lovay Kaïna · Type : Vente
- Intérieur : Small Flat Unfurnished 1
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3168 | 2026-09-02 14:26:51 | 25/05/2026 | 87500 | Originale (à conserver) |
| 3181 | 2026-09-02 14:26:51 | 25/05/2026 | 87500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 81 — n° de vente « 3110 » — **À VÉRIFIER**

- Lignes (id) : 3174, 3176
- Semaine : S22-26 · Agent : kisay · Client : Ley Yam · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3174 | 2026-09-02 14:26:51 | 25/05/2026 | 17500 | Originale (à conserver) |
| 3176 | 2026-09-02 14:26:51 | 25/05/2026 | 16625 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 82 — n° de vente « 3120 » — **EXACT**

- Lignes (id) : 3186, 3189
- Semaine : S22-26 · Agent : kisay · Client : Carter Alexandre · Type : Location
- Intérieur : Trailer Unfurnished
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3186 | 2026-09-02 14:26:51 | 25/05/2026 | 11340 | Originale (à conserver) |
| 3189 | 2026-09-02 14:26:51 | 25/05/2026 | 11340 | Doublon proposé |

**Montant potentiellement compté en double : 11 340 $**

### Groupe 83 — n° de vente « 3121 » — **EXACT**

- Lignes (id) : 3187, 3829
- Semaine : S22-26 · Agent : breeprime · Client : Boulkif Zak · Type : Vente
- Garage : Garage 6 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3187 | 2026-09-02 14:26:51 | 25/05/2026 | 78750 | Originale (à conserver) |
| 3829 | 2026-09-02 14:26:51 | 25/05/2026 | 78750 | Doublon proposé |

**Montant potentiellement compté en double : 78 750 $**

### Groupe 84 — n° de vente « 3129 » — **EXACT**

- Lignes (id) : 3196, 3199
- Semaine : S22-26 · Agent : djezzzzyy · Client : Birdy Choinkake · Type : Location
- Intérieur : Office 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3196 | 2026-09-02 14:26:51 | 25/05/2026 | 3500 | Originale (à conserver) |
| 3199 | 2026-09-02 14:26:51 | 25/05/2026 | 3500 | Doublon proposé |

**Montant potentiellement compté en double : 3 500 $**

### Groupe 85 — n° de vente « 3130 » — **EXACT**

- Lignes (id) : 3197, 3198
- Semaine : S22-26 · Agent : djezzzzyy · Client : Intair-bryan Love · Type : Location
- Intérieur : Office 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3197 | 2026-09-02 14:26:51 | 25/05/2026 | 70000 | Originale (à conserver) |
| 3198 | 2026-09-02 14:26:51 | 25/05/2026 | 70000 | Doublon proposé |

**Montant potentiellement compté en double : 70 000 $**

### Groupe 86 — n° de vente « 3174 » — **À VÉRIFIER**

- Lignes (id) : 3243, 3251
- Semaine : S22-26 · Agent : preda974 · Client : Jeqn Njuts · Type : Vente
- Intérieur : Plantation
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3243 | 2026-09-02 14:26:51 | 26/05/2026 | 50000 | Originale (à conserver) |
| 3251 | 2026-09-02 14:26:51 | 26/05/2026 | 50000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 87 — n° de vente « 3187 » — **EXACT**

- Lignes (id) : 3257, 3260
- Semaine : S22-26 · Agent : preda974 · Client : Jonathan Cortès · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3257 | 2026-09-02 14:26:51 | 26/05/2026 | 17500 | Originale (à conserver) |
| 3260 | 2026-09-02 14:26:51 | 26/05/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 88 — n° de vente « 3209 » — **EXACT**

- Lignes (id) : 3280, 3281, 3282
- Semaine : S22-26 · Agent : kaddara · Client : Paige Earle · Type : Location
- Intérieur : Office 6
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3280 | 2026-09-02 14:26:51 | 26/05/2026 | 3500 | Originale (à conserver) |
| 3281 | 2026-09-02 14:26:51 | 26/05/2026 | 3500 | Doublon proposé |
| 3282 | 2026-09-02 14:26:51 | 26/05/2026 | 3500 | Doublon proposé |

**Montant potentiellement compté en double : 7 000 $**

### Groupe 89 — n° de vente « 3212 » — **À VÉRIFIER**

- Lignes (id) : 3285, 3287
- Semaine : S22-26 · Agent : k9nda · Client : Breivel Daris · Type : Location
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3285 | 2026-09-02 14:26:51 | 26/05/2026 | 2835 | Originale (à conserver) |
| 3287 | 2026-09-02 14:26:51 | 26/05/2026 | 5670 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 90 — n° de vente « 3217 » — **À VÉRIFIER**

- Lignes (id) : 3291, 3370
- Semaine : S22-26 · Agent : preda974 · Client : Basil Voland · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3291 | 2026-09-02 14:26:51 | 26/05/2026 | 17500 | Originale (à conserver) |
| 3370 | 2026-09-02 14:26:51 | 26/05/2026 | 17500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 91 — n° de vente « 3223 » — **PROBABLE**

- Lignes (id) : 3297, 3371
- Semaine : S22-26 · Agent : preda974 · Client : James Mendoza · Type : Vente
- Intérieur : Grand Entrepôt
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (interieur).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3297 | 2026-09-02 14:26:51 | 26/05/2026 | 262500 | Originale (à conserver) |
| 3371 | 2026-09-02 14:26:51 | 26/05/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 262 500 $**

### Groupe 92 — n° de vente « 3229 » — **EXACT**

- Lignes (id) : 3305, 3306
- Semaine : S22-26 · Agent : mathiascastelan · Client : Paixao Miguel · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3305 | 2026-09-02 14:26:51 | 26/05/2026 | 18340 | Originale (à conserver) |
| 3306 | 2026-09-02 14:26:51 | 26/05/2026 | 18340 | Doublon proposé |

**Montant potentiellement compté en double : 18 340 $**

### Groupe 93 — n° de vente « 3229 » — **À VÉRIFIER**

- Lignes (id) : 3303
- Semaine : S22-26 · Agent : mathiascastelan · Client : Paixao Miguel · Type : Location
- Intérieur : Motel
- Justification : Ligne isolée : partage le même numéro de vente qu'un doublon détecté ci-dessus (EXACT ou PROBABLE), mais ses propres données ne correspondent à aucune autre ligne — aucune ligne comparable en double à lui associer.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3303 | 2026-09-02 14:26:51 | 26/05/2026 | 11340 | Ligne isolée (aucun doublon associé) |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 94 — n° de vente « 3238 » — **À VÉRIFIER**

- Lignes (id) : 3314, 3338
- Semaine : S22-26 · Agent : wapawapawapawapa · Client : Gaston Ordonez · Type : Vente
- Intérieur : Flat 3
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3314 | 2026-09-02 14:26:51 | 26/05/2026 | 144900 | Originale (à conserver) |
| 3338 | 2026-09-02 14:26:51 | 26/05/2026 | 140000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 95 — n° de vente « 3244 » — **EXACT**

- Lignes (id) : 3320, 3327
- Semaine : S22-26 · Agent : mathiascastelan · Client : Waze Snow · Type : Vente
- Intérieur : Small Flat Unfurnished 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3320 | 2026-09-02 14:26:51 | 26/05/2026 | 61250 | Originale (à conserver) |
| 3327 | 2026-09-02 14:26:51 | 26/05/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 96 — n° de vente « 3258 » — **EXACT**

- Lignes (id) : 3335, 3336
- Semaine : S22-26 · Agent : djezzzzyy · Client : Calavera Ortega · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3335 | 2026-09-02 14:26:51 | 26/05/2026 | 17500 | Originale (à conserver) |
| 3336 | 2026-09-02 14:26:51 | 26/05/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 97 — n° de vente « 3274 » — **À VÉRIFIER**

- Lignes (id) : 3353, 3354
- Semaine : S22-26 · Agent : breeprime · Client : Dumont Stephan · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3353 | 2026-09-02 14:26:51 | 27/05/2026 | 262500 | Originale (à conserver) |
| 3354 | 2026-09-02 14:26:51 | 27/05/2026 | 249375 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 98 — n° de vente « 3287 » — **PROBABLE**

- Lignes (id) : 3368, 3369
- Semaine : S22-26 · Agent : mathiascastelan · Client : Voskovitch Bryan · Type : Vente
- Intérieur : Grand Entrepôt
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (interieur).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3368 | 2026-09-02 14:26:51 | 27/05/2026 | 249375 | Originale (à conserver) |
| 3369 | 2026-09-02 14:26:51 | 27/05/2026 | 249375 | Doublon proposé |

**Montant potentiellement compté en double : 249 375 $**

### Groupe 99 — n° de vente « 3287 » — **À VÉRIFIER**

- Lignes (id) : 3367
- Semaine : S22-26 · Agent : mathiascastelan · Client : Voskovitch Bryan · Type : Vente
- Intérieur : Grand Entrepôt
- Justification : Ligne isolée : partage le même numéro de vente qu'un doublon détecté ci-dessus (EXACT ou PROBABLE), mais ses propres données ne correspondent à aucune autre ligne — aucune ligne comparable en double à lui associer.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3367 | 2026-09-02 14:26:51 | 27/05/2026 | 262500 | Ligne isolée (aucun doublon associé) |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 100 — n° de vente « 3305 » — **À VÉRIFIER**

- Lignes (id) : 3389, 3391
- Semaine : S22-26 · Agent : uonnay · Client : Mendoza Katelya · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3389 | 2026-09-02 14:26:51 | 27/05/2026 | 262500 | Originale (à conserver) |
| 3391 | 2026-09-02 14:26:51 | 27/05/2026 | 262500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 101 — n° de vente « 3308 » — **EXACT**

- Lignes (id) : 3393, 3396
- Semaine : S22-26 · Agent : uonnay · Client : Simnons Andre · Type : Vente
- Garage : Garage 10 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3393 | 2026-09-02 14:26:51 | 27/05/2026 | 131250 | Originale (à conserver) |
| 3396 | 2026-09-02 14:26:51 | 27/05/2026 | 131250 | Doublon proposé |

**Montant potentiellement compté en double : 131 250 $**

### Groupe 102 — n° de vente « 3310 » — **EXACT**

- Lignes (id) : 3395, 3407
- Semaine : S22-26 · Agent : uonnay · Client : Reivo Karlev · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3395 | 2026-09-02 14:26:51 | 27/05/2026 | 52500 | Originale (à conserver) |
| 3407 | 2026-09-02 14:26:51 | 27/05/2026 | 52500 | Doublon proposé |

**Montant potentiellement compté en double : 52 500 $**

### Groupe 103 — n° de vente « 3342 » — **À VÉRIFIER**

- Lignes (id) : 3428, 3429
- Semaine : S22-26 · Agent : mathiascastelan · Client : Durden Tayler · Type : Vente
- Garage : Garage 6 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3428 | 2026-09-02 14:26:51 | 27/05/2026 | 78750 | Originale (à conserver) |
| 3429 | 2026-09-02 14:26:51 | 27/05/2026 | 78750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 104 — n° de vente « 3346 » — **À VÉRIFIER**

- Lignes (id) : 3433, 3434
- Semaine : S22-26 · Agent : mathiascastelan · Client : Pichet Matheo · Type : Vente
- Intérieur : Flat 3
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3433 | 2026-09-02 14:26:51 | 27/05/2026 | 197400 | Originale (à conserver) |
| 3434 | 2026-09-02 14:26:51 | 27/05/2026 | 192500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 105 — n° de vente « 3355 » — **PROBABLE**

- Lignes (id) : 3443, 3444
- Semaine : S22-26 · Agent : wapawapawapawapa · Client : Miranda Priestly · Type : Vente
- Intérieur : Unfurnished Flat 12
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (interieur).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3443 | 2026-09-02 14:26:51 | 27/05/2026 | 1006250 | Originale (à conserver) |
| 3444 | 2026-09-02 14:26:51 | 27/05/2026 | 1006250 | Doublon proposé |

**Montant potentiellement compté en double : 1 006 250 $**

### Groupe 106 — n° de vente « 3356 » — **À VÉRIFIER**

- Lignes (id) : 3445, 3446
- Semaine : S22-26 · Agent : breeprime · Client : Frost Hayley · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3445 | 2026-09-02 14:26:51 | 27/05/2026 | 262500 | Originale (à conserver) |
| 3446 | 2026-09-02 14:26:51 | 27/05/2026 | 249375 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 107 — n° de vente « 3362 » — **À VÉRIFIER**

- Lignes (id) : 3452, 3546
- Semaine : S22-26 · Agent : breeprime · Client : Fratelli Safy · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3452 | 2026-09-02 14:26:51 | 27/05/2026 | 17500 | Originale (à conserver) |
| 3546 | 2026-09-02 14:26:51 | 27/05/2026 | 35000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 108 — n° de vente « 3392 » — **EXACT**

- Lignes (id) : 3482, 3489, 3497
- Semaine : S22-26 · Agent : uonnay · Client : Shin Hyun · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3482 | 2026-09-02 14:26:51 | 28/05/2026 | 262500 | Originale (à conserver) |
| 3489 | 2026-09-02 14:26:51 | 28/05/2026 | 262500 | Doublon proposé |
| 3497 | 2026-09-02 14:26:51 | 28/05/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 525 000 $**

### Groupe 109 — n° de vente « 3403 » — **À VÉRIFIER**

- Lignes (id) : 3494, 3676
- Semaine : S22-26 · Agent : mrnamikaze02 · Client : Jenkin Malaika · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3494 | 2026-09-02 14:26:51 | 28/05/2026 | 17500 | Originale (à conserver) |
| 3676 | 2026-09-02 14:26:51 | 28/05/2026 | 17500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 110 — n° de vente « 3427 » — **À VÉRIFIER**

- Lignes (id) : 3515, 3528
- Semaine : S22-26 · Agent : capitainebalou · Client : Rodríguez Àzraz · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3515 | 2026-09-02 14:26:51 | 28/05/2026 | 17500 | Originale (à conserver) |
| 3528 | 2026-09-02 14:26:51 | 28/05/2026 | 17500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 111 — n° de vente « 3435 » — **À VÉRIFIER**

- Lignes (id) : 3523, 3524
- Semaine : S22-26 · Agent : kisay · Client : Myers Rory · Type : Vente
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3523 | 2026-09-02 14:26:51 | 28/05/2026 | 26250 | Originale (à conserver) |
| 3524 | 2026-09-02 14:26:51 | 28/05/2026 | 4585 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 112 — n° de vente « 3436 » — **À VÉRIFIER**

- Lignes (id) : 3525, 3529
- Semaine : S22-26 · Agent : kisay · Client : Fracesco Robert · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3525 | 2026-09-02 14:26:51 | 28/05/2026 | 8750 | Originale (à conserver) |
| 3529 | 2026-09-02 14:26:51 | 28/05/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 113 — n° de vente « 3445 » — **À VÉRIFIER**

- Lignes (id) : 3536, 3537
- Semaine : S22-26 · Agent : breeprime · Client : Moretti Léa · Type : Vente
- Garage : Garage 6 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3536 | 2026-09-02 14:26:51 | 28/05/2026 | 78750 | Originale (à conserver) |
| 3537 | 2026-09-02 14:26:51 | 28/05/2026 | 74813 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 114 — n° de vente « 3449 » — **EXACT**

- Lignes (id) : 3541, 3543
- Semaine : S22-26 · Agent : shadows57. · Client : Catarino Shiper · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3541 | 2026-09-02 14:26:51 | 28/05/2026 | 262500 | Originale (à conserver) |
| 3543 | 2026-09-02 14:26:51 | 28/05/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 262 500 $**

### Groupe 115 — n° de vente « 3452 » — **EXACT**

- Lignes (id) : 3545, 3548
- Semaine : S22-26 · Agent : shadows57. · Client : Cooper Ezekiel · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3545 | 2026-09-02 14:26:51 | 28/05/2026 | 17500 | Originale (à conserver) |
| 3548 | 2026-09-02 14:26:51 | 28/05/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 116 — n° de vente « 3453 » — **EXACT**

- Lignes (id) : 3547, 3549
- Semaine : S22-26 · Agent : shadows57. · Client : Nerz Naska · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3547 | 2026-09-02 14:26:51 | 28/05/2026 | 8750 | Originale (à conserver) |
| 3549 | 2026-09-02 14:26:51 | 28/05/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 117 — n° de vente « 3466 » — **EXACT**

- Lignes (id) : 3562, 3569
- Semaine : S22-26 · Agent : shadows57. · Client : Lito Waldo · Type : Vente
- Intérieur : Maison 1 Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3562 | 2026-09-02 14:26:51 | 29/05/2026 | 43750 | Originale (à conserver) |
| 3569 | 2026-09-02 14:26:51 | 29/05/2026 | 43750 | Doublon proposé |

**Montant potentiellement compté en double : 43 750 $**

### Groupe 118 — n° de vente « 3489 » — **À VÉRIFIER**

- Lignes (id) : 3586, 3604
- Semaine : S22-26 · Agent : mathiascastelan · Client : Ferreira Mae · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3586 | 2026-09-02 14:26:51 | 29/05/2026 | 262500 | Originale (à conserver) |
| 3604 | 2026-09-02 14:26:51 | 29/05/2026 | 262500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 119 — n° de vente « 3490 » — **À VÉRIFIER**

- Lignes (id) : 3587, 3603
- Semaine : S22-26 · Agent : mathiascastelan · Client : Ferreira Mae · Type : Vente
- Garage : Garage 25 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3587 | 2026-09-02 14:26:51 | 29/05/2026 | 306250 | Originale (à conserver) |
| 3603 | 2026-09-02 14:26:51 | 29/05/2026 | 306250 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 120 — n° de vente « 3492 » — **PROBABLE**

- Lignes (id) : 3589, 3605
- Semaine : S22-26 · Agent : mathiascastelan · Client : Mbaye Lucas · Type : Vente
- Intérieur : Grand Entrepôt
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (interieur).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3589 | 2026-09-02 14:26:51 | 29/05/2026 | 262500 | Originale (à conserver) |
| 3605 | 2026-09-02 14:26:51 | 29/05/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 262 500 $**

### Groupe 121 — n° de vente « 3494 » — **À VÉRIFIER**

- Lignes (id) : 3591, 3602
- Semaine : S22-26 · Agent : mathiascastelan · Client : Samaza Ezio · Type : Vente
- Intérieur : Plantation
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3591 | 2026-09-02 14:26:51 | 29/05/2026 | 50000 | Originale (à conserver) |
| 3602 | 2026-09-02 14:26:51 | 29/05/2026 | 50000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 122 — n° de vente « 3497 » — **EXACT**

- Lignes (id) : 3594, 3596
- Semaine : S22-26 · Agent : totolafrappe · Client : delamaniana fab · Type : Location
- Intérieur : Flat 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3594 | 2026-09-02 14:26:51 | 29/05/2026 | 4725 | Originale (à conserver) |
| 3596 | 2026-09-02 14:26:51 | 29/05/2026 | 4725 | Doublon proposé |

**Montant potentiellement compté en double : 4 725 $**

### Groupe 123 — n° de vente « 3550 » — **EXACT**

- Lignes (id) : 3652, 3654
- Semaine : S22-26 · Agent : breeprime · Client : Coleman Carl · Type : Location
- Intérieur : Flat 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3652 | 2026-09-02 14:26:51 | 29/05/2026 | 6152 | Originale (à conserver) |
| 3654 | 2026-09-02 14:26:51 | 29/05/2026 | 6152 | Doublon proposé |

**Montant potentiellement compté en double : 6 152 $**

### Groupe 124 — n° de vente « 3561 » — **À VÉRIFIER**

- Lignes (id) : 3664, 3668
- Semaine : S22-26 · Agent : preda974 · Client : Yuri Saint · Type : Location
- Intérieur : Maison 1 Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3664 | 2026-09-02 14:26:51 | 29/05/2026 | 7000 | Originale (à conserver) |
| 3668 | 2026-09-02 14:26:51 | 29/05/2026 | 7420 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 125 — n° de vente « 3596 » — **EXACT**

- Lignes (id) : 3701, 3705
- Semaine : S22-26 · Agent : kisay · Client : Saito Ryo · Type : Vente
- Intérieur : Maison 2 Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3701 | 2026-09-02 14:26:51 | 30/05/2026 | 61250 | Originale (à conserver) |
| 3705 | 2026-09-02 14:26:51 | 30/05/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 126 — n° de vente « 3597 » — **À VÉRIFIER**

- Lignes (id) : 3702, 3703, 3708
- Semaine : S22-26 · Agent : kisay · Client : Parker Jason · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3702 | 2026-09-02 14:26:51 | 30/05/2026 | 8750 | Originale (à conserver) |
| 3703 | 2026-09-02 14:26:51 | 30/05/2026 | 17500 | Doublon proposé |
| 3708 | 2026-09-02 14:26:51 | 30/05/2026 | 16625 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 127 — n° de vente « 3598 » — **À VÉRIFIER**

- Lignes (id) : 3704, 3707
- Semaine : S22-26 · Agent : kisay · Client : Parker Jason · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3704 | 2026-09-02 14:26:51 | 30/05/2026 | 17500 | Originale (à conserver) |
| 3707 | 2026-09-02 14:26:51 | 30/05/2026 | 16625 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 128 — n° de vente « 3601 » — **À VÉRIFIER**

- Lignes (id) : 3710, 3711
- Semaine : S22-26 · Agent : kisay · Client : Dosantos Mike · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3710 | 2026-09-02 14:26:51 | 30/05/2026 | 262500 | Originale (à conserver) |
| 3711 | 2026-09-02 14:26:51 | 30/05/2026 | 249375 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 129 — n° de vente « 3607 » — **PROBABLE**

- Lignes (id) : 3717, 3718
- Semaine : S22-26 · Agent : kisay · Client : Volkov Nina · Type : Vente
- Garage : Garage 10 places
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (entreprise_identite, garage_refus, id_entreprise).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3717 | 2026-09-02 14:26:51 | 30/05/2026 | 131250 | Originale (à conserver) |
| 3718 | 2026-09-02 14:26:51 | 30/05/2026 | 131250 | Doublon proposé |

**Montant potentiellement compté en double : 131 250 $**

### Groupe 130 — n° de vente « 3627 » — **EXACT**

- Lignes (id) : 3738, 3745
- Semaine : S22-26 · Agent : breeprime · Client : Fast Gokan · Type : Location
- Intérieur : Lester
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3738 | 2026-09-02 14:26:51 | 30/05/2026 | 7420 | Originale (à conserver) |
| 3745 | 2026-09-02 14:26:51 | 30/05/2026 | 7420 | Doublon proposé |

**Montant potentiellement compté en double : 7 420 $**

### Groupe 131 — n° de vente « 3658 » — **EXACT**

- Lignes (id) : 3770, 3783
- Semaine : S22-26 · Agent : kisay · Client : Rodriguez Javier · Type : Vente
- Intérieur : Bureau 6
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3770 | 2026-09-02 14:26:51 | 31/05/2026 | 35000 | Originale (à conserver) |
| 3783 | 2026-09-02 14:26:51 | 31/05/2026 | 35000 | Doublon proposé |

**Montant potentiellement compté en double : 35 000 $**

### Groupe 132 — n° de vente « 3659 » — **EXACT**

- Lignes (id) : 3771, 3782
- Semaine : S22-26 · Agent : kisay · Client : Rodriguez Javier · Type : Vente
- Intérieur : Bureau 6
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3771 | 2026-09-02 14:26:51 | 31/05/2026 | 35000 | Originale (à conserver) |
| 3782 | 2026-09-02 14:26:51 | 31/05/2026 | 35000 | Doublon proposé |

**Montant potentiellement compté en double : 35 000 $**

### Groupe 133 — n° de vente « 3686 » — **EXACT**

- Lignes (id) : 3800, 4068
- Semaine : S22-26 · Agent : kaddara · Client : Okha Kader · Type : Location
- Garage : Garage 2 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3800 | 2026-09-02 14:26:51 | 31/05/2026 | 1750 | Originale (à conserver) |
| 4068 | 2026-09-02 14:26:51 | 31/05/2026 | 1750 | Doublon proposé |

**Montant potentiellement compté en double : 1 750 $**

### Groupe 134 — n° de vente « 3702 » — **À VÉRIFIER**

- Lignes (id) : 3816, 3817
- Semaine : S22-26 · Agent : zirnox · Client : Branger Gautier · Type : Vente
- Garage : Garage 6 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3816 | 2026-09-02 14:26:51 | 31/05/2026 | 78750 | Originale (à conserver) |
| 3817 | 2026-09-02 14:26:51 | 31/05/2026 | 5250 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 135 — n° de vente « 371 » — **EXACT**

- Lignes (id) : 392, 393
- Semaine : S18-26 · Agent : hisoka0069 · Client : Jayson Cortez · Type : Vente
- Intérieur : Flat 3
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 392 | 2026-09-02 14:26:51 | 30/04/2026 | 66150 | Originale (à conserver) |
| 393 | 2026-09-02 14:26:51 | 30/04/2026 | 66150 | Doublon proposé |

**Montant potentiellement compté en double : 66 150 $**

### Groupe 136 — n° de vente « 372 » — **EXACT**

- Lignes (id) : 394, 888
- Semaine : S18-26 · Agent : xbrazza · Client : Gabin Quillere · Type : Vente
- Intérieur : Flat 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 394 | 2026-09-02 14:26:51 | 30/04/2026 | 37800 | Originale (à conserver) |
| 888 | 2026-09-02 14:26:51 | 30/04/2026 | 37800 | Doublon proposé |

**Montant potentiellement compté en double : 37 800 $**

### Groupe 137 — n° de vente « 3727 » — **EXACT**

- Lignes (id) : 3843, 3847
- Semaine : S23-26 · Agent : breeprime · Client : Lyckma Kénan · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3843 | 2026-09-02 14:26:51 | 01/06/2026 | 8750 | Originale (à conserver) |
| 3847 | 2026-09-02 14:26:51 | 01/06/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 138 — n° de vente « 3728 » — **EXACT**

- Lignes (id) : 3844, 3848
- Semaine : S23-26 · Agent : breeprime · Client : Lyckma Kénan · Type : Location
- Garage : Garage 6 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3844 | 2026-09-02 14:26:51 | 01/06/2026 | 5250 | Originale (à conserver) |
| 3848 | 2026-09-02 14:26:51 | 01/06/2026 | 5250 | Doublon proposé |

**Montant potentiellement compté en double : 5 250 $**

### Groupe 139 — n° de vente « 3739 » — **À VÉRIFIER**

- Lignes (id) : 3857, 3858
- Semaine : S23-26 · Agent : djezzzzyy · Client : Carter Chase · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3857 | 2026-09-02 14:26:51 | 01/06/2026 | 262500 | Originale (à conserver) |
| 3858 | 2026-09-02 14:26:51 | 01/06/2026 | 249375 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 140 — n° de vente « 3763 » — **À VÉRIFIER**

- Lignes (id) : 3882, 3884
- Semaine : S23-26 · Agent : kaddara · Client : Clark Jimmy · Type : Location
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3882 | 2026-09-02 14:26:51 | 01/06/2026 | 2835 | Originale (à conserver) |
| 3884 | 2026-09-02 14:26:51 | 01/06/2026 | 2835 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 141 — n° de vente « 3780 » — **EXACT**

- Lignes (id) : 3900, 3996
- Semaine : S23-26 · Agent : kaddara · Client : Shadid Sevda · Type : Vente
- Intérieur : Duplex Non Meublé 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3900 | 2026-09-02 14:26:51 | 01/06/2026 | 831250 | Originale (à conserver) |
| 3996 | 2026-09-02 14:26:51 | 01/06/2026 | 831250 | Doublon proposé |

**Montant potentiellement compté en double : 831 250 $**

### Groupe 142 — n° de vente « 3789 » — **EXACT**

- Lignes (id) : 3909, 3910
- Semaine : S23-26 · Agent : kisay · Client : Gotti Massimo · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3909 | 2026-09-02 14:26:51 | 01/06/2026 | 249375 | Originale (à conserver) |
| 3910 | 2026-09-02 14:26:51 | 01/06/2026 | 249375 | Doublon proposé |

**Montant potentiellement compté en double : 249 375 $**

### Groupe 143 — n° de vente « 3806 » — **À VÉRIFIER**

- Lignes (id) : 3927, 3944
- Semaine : S23-26 · Agent : schooltzy · Client : Gonzalez Carlos · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3927 | 2026-09-02 14:26:51 | 02/06/2026 | 8750 | Originale (à conserver) |
| 3944 | 2026-09-02 14:26:51 | 02/06/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 144 — n° de vente « 3818 » — **À VÉRIFIER**

- Lignes (id) : 3939, 3945
- Semaine : S23-26 · Agent : el_babynoni · Client : Satnos Julio · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3939 | 2026-09-02 14:26:51 | 02/06/2026 | 262500 | Originale (à conserver) |
| 3945 | 2026-09-02 14:26:51 | 02/06/2026 | 262500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 145 — n° de vente « 3839 » — **EXACT**

- Lignes (id) : 3960, 3961
- Semaine : S23-26 · Agent : kisay · Client : Tavares Fernand · Type : Vente
- Intérieur : Flat 3 Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3960 | 2026-09-02 14:26:51 | 02/06/2026 | 61250 | Originale (à conserver) |
| 3961 | 2026-09-02 14:26:51 | 02/06/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 146 — n° de vente « 3846 » — **EXACT**

- Lignes (id) : 3968, 3981
- Semaine : S23-26 · Agent : breeprime · Client : Alejandro Juan · Type : Location
- Intérieur : Maison 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3968 | 2026-09-02 14:26:51 | 02/06/2026 | 5670 | Originale (à conserver) |
| 3981 | 2026-09-02 14:26:51 | 02/06/2026 | 5670 | Doublon proposé |

**Montant potentiellement compté en double : 5 670 $**

### Groupe 147 — n° de vente « 3848 » — **À VÉRIFIER**

- Lignes (id) : 3970, 3983
- Semaine : S23-26 · Agent : breeprime · Client : Lopes Àlvaro · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3970 | 2026-09-02 14:26:51 | 02/06/2026 | 8750 | Originale (à conserver) |
| 3983 | 2026-09-02 14:26:51 | 02/06/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 148 — n° de vente « 3856 » — **À VÉRIFIER**

- Lignes (id) : 3978, 3979
- Semaine : S23-26 · Agent : kisay · Client : Right Zéphir · Type : Location
- Intérieur : Flat 3 Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3978 | 2026-09-02 14:26:51 | 02/06/2026 | 49000 | Originale (à conserver) |
| 3979 | 2026-09-02 14:26:51 | 02/06/2026 | 140000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 149 — n° de vente « 3858 » — **À VÉRIFIER**

- Lignes (id) : 3982, 3984
- Semaine : S23-26 · Agent : kisay · Client : Ortega Neyla · Type : Vente
- Intérieur : Flat 3 Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3982 | 2026-09-02 14:26:51 | 02/06/2026 | 61250 | Originale (à conserver) |
| 3984 | 2026-09-02 14:26:51 | 02/06/2026 | 58188 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 150 — n° de vente « 3861 » — **À VÉRIFIER**

- Lignes (id) : 3987, 3989
- Semaine : S23-26 · Agent : breeprime · Client : Voskovitch Bryan · Type : Location
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 3987 | 2026-09-02 14:26:51 | 02/06/2026 | 11340 | Originale (à conserver) |
| 3989 | 2026-09-02 14:26:51 | 02/06/2026 | 10772 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 151 — n° de vente « 3887 » — **EXACT**

- Lignes (id) : 4006, 4011
- Semaine : S23-26 · Agent : el_babynoni · Client : Nolan Jackson · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4006 | 2026-09-02 14:26:51 | 03/06/2026 | 2835 | Originale (à conserver) |
| 4011 | 2026-09-02 14:26:51 | 03/06/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 152 — n° de vente « 3895 » — **EXACT**

- Lignes (id) : 4015, 4016
- Semaine : S23-26 · Agent : yhwni · Client : Bedaoui Kais · Type : Vente
- Intérieur : Flat 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4015 | 2026-09-02 14:26:51 | 03/06/2026 | 37800 | Originale (à conserver) |
| 4016 | 2026-09-02 14:26:51 | 03/06/2026 | 37800 | Doublon proposé |

**Montant potentiellement compté en double : 37 800 $**

### Groupe 153 — n° de vente « 3976 » — **À VÉRIFIER**

- Lignes (id) : 4092, 4093
- Semaine : S23-26 · Agent : lao4532 · Client : kaelen zeta · Type : Location
- Intérieur : Flat 2
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4092 | 2026-09-02 14:26:51 | 04/06/2026 | 4725 | Originale (à conserver) |
| 4093 | 2026-09-02 14:26:51 | 04/06/2026 | 5670 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 154 — n° de vente « 3977 » — **PROBABLE**

- Lignes (id) : 4094, 4095
- Semaine : S23-26 · Agent : yhwni · Client : Lapraline Cricri · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (entreprise_identite, garage_refus, id_entreprise).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4094 | 2026-09-02 14:26:51 | 04/06/2026 | 262500 | Originale (à conserver) |
| 4095 | 2026-09-02 14:26:51 | 04/06/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 262 500 $**

### Groupe 155 — n° de vente « 3979 » — **À VÉRIFIER**

- Lignes (id) : 4097, 4098
- Semaine : S23-26 · Agent : lao4532 · Client : Pablo Las · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4097 | 2026-09-02 14:26:51 | 04/06/2026 | 249375 | Originale (à conserver) |
| 4098 | 2026-09-02 14:26:51 | 04/06/2026 | 262500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 156 — n° de vente « 3990 » — **EXACT**

- Lignes (id) : 4109, 4112, 4116
- Semaine : S23-26 · Agent : mathiascastelan · Client : McKnight Antonio · Type : Vente
- Intérieur : Flat 1 Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4109 | 2026-09-02 14:26:51 | 04/06/2026 | 61250 | Originale (à conserver) |
| 4112 | 2026-09-02 14:26:51 | 04/06/2026 | 61250 | Doublon proposé |
| 4116 | 2026-09-02 14:26:51 | 04/06/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 122 500 $**

### Groupe 157 — n° de vente « 3991 » — **EXACT**

- Lignes (id) : 4110, 4111, 4115
- Semaine : S23-26 · Agent : mathiascastelan · Client : McKnight Antonio · Type : Vente
- Intérieur : Flat 1 Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4110 | 2026-09-02 14:26:51 | 04/06/2026 | 61250 | Originale (à conserver) |
| 4111 | 2026-09-02 14:26:51 | 04/06/2026 | 61250 | Doublon proposé |
| 4115 | 2026-09-02 14:26:51 | 04/06/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 122 500 $**

### Groupe 158 — n° de vente « 3997 » — **À VÉRIFIER**

- Lignes (id) : 4120, 4121
- Semaine : S23-26 · Agent : mathiascastelan · Client : Yoshido Saiko · Type : Vente
- Intérieur : Petit Appartement 1/ SFU 3
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4120 | 2026-09-02 14:26:51 | 05/06/2026 | 331250 | Originale (à conserver) |
| 4121 | 2026-09-02 14:26:51 | 05/06/2026 | 331250 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 159 — n° de vente « 4006 » — **À VÉRIFIER**

- Lignes (id) : 4130, 4135
- Semaine : S23-26 · Agent : wapawapawapawapa · Client : Alexendro Mladin · Type : Vente
- Intérieur : Plantation
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4130 | 2026-09-02 14:26:51 | 05/06/2026 | 50000 | Originale (à conserver) |
| 4135 | 2026-09-02 14:26:51 | 05/06/2026 | 50000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 160 — n° de vente « 4024 » — **EXACT**

- Lignes (id) : 4149, 4150
- Semaine : S23-26 · Agent : .majins. · Client : Chlefuglistin Carl · Type : Vente
- Garage : Garage 10 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4149 | 2026-09-02 14:26:51 | 05/06/2026 | 131250 | Originale (à conserver) |
| 4150 | 2026-09-02 14:26:51 | 05/06/2026 | 131250 | Doublon proposé |

**Montant potentiellement compté en double : 131 250 $**

### Groupe 161 — n° de vente « 4025 » — **EXACT**

- Lignes (id) : 4151, 4152
- Semaine : S23-26 · Agent : mathiascastelan · Client : Praker Aylan · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4151 | 2026-09-02 14:26:51 | 05/06/2026 | 17500 | Originale (à conserver) |
| 4152 | 2026-09-02 14:26:51 | 05/06/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 162 — n° de vente « 4048 » — **À VÉRIFIER**

- Lignes (id) : 4175, 4176
- Semaine : S23-26 · Agent : .matlow. · Client : Miuzyck Atohm · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4175 | 2026-09-02 14:26:51 | 05/06/2026 | 35000 | Originale (à conserver) |
| 4176 | 2026-09-02 14:26:51 | 05/06/2026 | 17500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 163 — n° de vente « 4088 » — **À VÉRIFIER**

- Lignes (id) : 4216, 4221
- Semaine : S23-26 · Agent : mrnamikaze02 · Client : Miyazakii Nagiss · Type : Location
- Intérieur : Flat 3 Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4216 | 2026-09-02 14:26:51 | 06/06/2026 | 12250 | Originale (à conserver) |
| 4221 | 2026-09-02 14:26:51 | 06/06/2026 | 12250 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 164 — n° de vente « 4091 » — **À VÉRIFIER**

- Lignes (id) : 4219, 4220
- Semaine : S23-26 · Agent : mrnamikaze02 · Client : Ashford Jimmy · Type : Vente
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4219 | 2026-09-02 14:26:51 | 06/06/2026 | 0 | Originale (à conserver) |
| 4220 | 2026-09-02 14:26:51 | 06/06/2026 | 2835 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 165 — n° de vente « 4128 » — **EXACT**

- Lignes (id) : 4258, 4263
- Semaine : S23-26 · Agent : breeprime · Client : Dialo Yoro · Type : Location
- Intérieur : Flat 3 Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4258 | 2026-09-02 14:26:51 | 06/06/2026 | 7000 | Originale (à conserver) |
| 4263 | 2026-09-02 14:26:51 | 06/06/2026 | 7000 | Doublon proposé |

**Montant potentiellement compté en double : 7 000 $**

### Groupe 166 — n° de vente « 4132 » — **EXACT**

- Lignes (id) : 4262, 4270
- Semaine : S23-26 · Agent : wapawapawapawapa · Client : Marwen Kasdi · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4262 | 2026-09-02 14:26:51 | 06/06/2026 | 2835 | Originale (à conserver) |
| 4270 | 2026-09-02 14:26:51 | 06/06/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 167 — n° de vente « 4142 » — **À VÉRIFIER**

- Lignes (id) : 4274, 4286, 4287
- Semaine : S23-26 · Agent : lao4532 · Client : Jairo calderon · Type : Vente
- Intérieur : Cave
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4274 | 2026-09-02 14:26:51 | 06/06/2026 | 60000 | Originale (à conserver) |
| 4286 | 2026-09-02 14:26:51 | 06/06/2026 | 60000 | Doublon proposé |
| 4287 | 2026-09-02 14:26:51 | 06/06/2026 | 60000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 168 — n° de vente « 4149 » — **À VÉRIFIER**

- Lignes (id) : 4281, 4284
- Semaine : S23-26 · Agent : yhwni · Client : Johnson Mani · Type : Vente
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4281 | 2026-09-02 14:26:51 | 06/06/2026 | 0 | Originale (à conserver) |
| 4284 | 2026-09-02 14:26:51 | 06/06/2026 | 190000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 169 — n° de vente « 416 » — **À VÉRIFIER**

- Lignes (id) : 438, 441, 445
- Semaine : S18-26 · Agent : xbrazza · Client : Maya Steep · Type : Location
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 438 | 2026-09-02 14:26:51 | 01/05/2026 | 2835 | Originale (à conserver) |
| 441 | 2026-09-02 14:26:51 | 01/05/2026 | 2835 | Doublon proposé |
| 445 | 2026-09-02 14:26:51 | 01/05/2026 | 2835 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 170 — n° de vente « 4184 » — **EXACT**

- Lignes (id) : 4319, 4354
- Semaine : S23-26 · Agent : lao4532 · Client : Mehdi Levatti · Type : Vente
- Intérieur : Bureau 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4319 | 2026-09-02 14:26:51 | 06/06/2026 | 35000 | Originale (à conserver) |
| 4354 | 2026-09-02 14:26:51 | 06/06/2026 | 35000 | Doublon proposé |

**Montant potentiellement compté en double : 35 000 $**

### Groupe 171 — n° de vente « 4191 » — **EXACT**

- Lignes (id) : 4326, 4331
- Semaine : S23-26 · Agent : lao4532 · Client : Mohsin Boulouh · Type : Vente
- Intérieur : Plantation
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4326 | 2026-09-02 14:26:51 | 06/06/2026 | 50000 | Originale (à conserver) |
| 4331 | 2026-09-02 14:26:51 | 06/06/2026 | 50000 | Doublon proposé |

**Montant potentiellement compté en double : 50 000 $**

### Groupe 172 — n° de vente « 4191 » — **À VÉRIFIER**

- Lignes (id) : 4330
- Semaine : S23-26 · Agent : lao4532 · Client : Mohsin Boulouh · Type : Vente
- Intérieur : Plantation
- Justification : Ligne isolée : partage le même numéro de vente qu'un doublon détecté ci-dessus (EXACT ou PROBABLE), mais ses propres données ne correspondent à aucune autre ligne — aucune ligne comparable en double à lui associer.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4330 | 2026-09-02 14:26:51 | 06/06/2026 | 47500 | Ligne isolée (aucun doublon associé) |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 173 — n° de vente « 4192 » — **EXACT**

- Lignes (id) : 4327, 4332
- Semaine : S23-26 · Agent : lao4532 · Client : Mohsin Moul · Type : Vente
- Intérieur : Plantation
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4327 | 2026-09-02 14:26:51 | 06/06/2026 | 50000 | Originale (à conserver) |
| 4332 | 2026-09-02 14:26:51 | 06/06/2026 | 50000 | Doublon proposé |

**Montant potentiellement compté en double : 50 000 $**

### Groupe 174 — n° de vente « 4192 » — **EXACT**

- Lignes (id) : 4328, 4329
- Semaine : S23-26 · Agent : lao4532 · Client : Mohsin Moul · Type : Vente
- Intérieur : Plantation
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4328 | 2026-09-02 14:26:51 | 06/06/2026 | 47500 | Originale (à conserver) |
| 4329 | 2026-09-02 14:26:51 | 06/06/2026 | 47500 | Doublon proposé |

**Montant potentiellement compté en double : 47 500 $**

### Groupe 175 — n° de vente « 4214 » — **À VÉRIFIER**

- Lignes (id) : 4355, 4362
- Semaine : S23-26 · Agent : lao4532 · Client : Curtis Shiva · Type : Vente
- Intérieur : Petit Appartement 2/ SFU 4
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4355 | 2026-09-02 14:26:51 | 07/06/2026 | 293750 | Originale (à conserver) |
| 4362 | 2026-09-02 14:26:51 | 07/06/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 176 — n° de vente « 4215 » — **À VÉRIFIER**

- Lignes (id) : 4356, 4363
- Semaine : S23-26 · Agent : lao4532 · Client : Angel Buch · Type : Vente
- Intérieur : Maison 2 Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4356 | 2026-09-02 14:26:51 | 07/06/2026 | 61250 | Originale (à conserver) |
| 4363 | 2026-09-02 14:26:51 | 07/06/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 177 — n° de vente « 4216 » — **À VÉRIFIER**

- Lignes (id) : 4357, 4364
- Semaine : S23-26 · Agent : lao4532 · Client : Angel Buch · Type : Vente
- Garage : Garage 6 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4357 | 2026-09-02 14:26:51 | 07/06/2026 | 78750 | Originale (à conserver) |
| 4364 | 2026-09-02 14:26:51 | 07/06/2026 | 124688 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 178 — n° de vente « 4217 » — **À VÉRIFIER**

- Lignes (id) : 4358, 4365
- Semaine : S23-26 · Agent : lao4532 · Client : Marcello Milano · Type : Vente
- Intérieur : Grand Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4358 | 2026-09-02 14:26:51 | 07/06/2026 | 262500 | Originale (à conserver) |
| 4365 | 2026-09-02 14:26:51 | 07/06/2026 | 13755 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 179 — n° de vente « 4218 » — **À VÉRIFIER**

- Lignes (id) : 4359, 4366
- Semaine : S23-26 · Agent : yhwni · Client : Ríos Antonio · Type : Vente
- Garage : Garage 10 places V
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4359 | 2026-09-02 14:26:51 | 07/06/2026 | 131250 | Originale (à conserver) |
| 4366 | 2026-09-02 14:26:51 | 07/06/2026 | 60000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 180 — n° de vente « 4219 » — **À VÉRIFIER**

- Lignes (id) : 4360, 4367
- Semaine : S23-26 · Agent : yhwni · Client : Duboit Angelo · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4360 | 2026-09-02 14:26:51 | 07/06/2026 | 262500 | Originale (à conserver) |
| 4367 | 2026-09-02 14:26:51 | 07/06/2026 | 131250 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 181 — n° de vente « 4220 » — **À VÉRIFIER**

- Lignes (id) : 4361, 4368
- Semaine : S23-26 · Agent : yhwni · Client : Wilson Liam · Type : Location
- Intérieur : Studio
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4361 | 2026-09-02 14:26:51 | 07/06/2026 | 8000 | Originale (à conserver) |
| 4368 | 2026-09-02 14:26:51 | 07/06/2026 | 262500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 182 — n° de vente « 4228 » — **À VÉRIFIER**

- Lignes (id) : 4376, 4377
- Semaine : S23-26 · Agent : wapawapawapawapa · Client : Alejandro Puche · Type : Location
- Intérieur : Entrepot moyen non meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4376 | 2026-09-02 14:26:51 | 07/06/2026 | 54000 | Originale (à conserver) |
| 4377 | 2026-09-02 14:26:51 | 07/06/2026 | 51300 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 183 — n° de vente « 4233 » — **À VÉRIFIER**

- Lignes (id) : 4380, 4381
- Semaine : S23-26 · Agent : wapawapawapawapa · Client : Darren Lewis · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4380 | 2026-09-02 14:26:51 | 07/06/2026 | 262500 | Originale (à conserver) |
| 4381 | 2026-09-02 14:26:51 | 07/06/2026 | 249375 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 184 — n° de vente « 4238 » — **EXACT**

- Lignes (id) : 4385, 4442
- Semaine : S23-26 · Agent : kisay · Client : Santiez Alvaro · Type : Vente
- Intérieur : Flat 3 Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4385 | 2026-09-02 14:26:51 | 07/06/2026 | 61250 | Originale (à conserver) |
| 4442 | 2026-09-02 14:26:51 | 07/06/2026 | 61250 | Doublon proposé |

**Montant potentiellement compté en double : 61 250 $**

### Groupe 185 — n° de vente « 4245 » — **À VÉRIFIER**

- Lignes (id) : 4392, 4394
- Semaine : S23-26 · Agent : fntsk · Client : Johnny Winchest · Type : Vente
- Intérieur : Entrepot moyen non meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4392 | 2026-09-02 14:26:51 | 07/06/2026 | 180500 | Originale (à conserver) |
| 4394 | 2026-09-02 14:26:51 | 07/06/2026 | 190000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 186 — n° de vente « 4275 » — **EXACT**

- Lignes (id) : 4423, 4424
- Semaine : S23-26 · Agent : lhxpnotic_. · Client : Adeubé Kevin · Type : Vente
- Intérieur : Flat 3
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4423 | 2026-09-02 14:26:51 | 07/06/2026 | 62843 | Originale (à conserver) |
| 4424 | 2026-09-02 14:26:51 | 07/06/2026 | 62843 | Doublon proposé |

**Montant potentiellement compté en double : 62 843 $**

### Groupe 187 — n° de vente « 4275 » — **À VÉRIFIER**

- Lignes (id) : 4437
- Semaine : S23-26 · Agent : lhxpnotic_. · Client : Adeubé Kevin · Type : Vente
- Intérieur : Flat 3 Non Meublé
- Justification : Ligne isolée : partage le même numéro de vente qu'un doublon détecté ci-dessus (EXACT ou PROBABLE), mais ses propres données ne correspondent à aucune autre ligne — aucune ligne comparable en double à lui associer.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4437 | 2026-09-02 14:26:51 | 07/06/2026 | 58188 | Ligne isolée (aucun doublon associé) |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 188 — n° de vente « 4331 » — **À VÉRIFIER**

- Lignes (id) : 4482, 4483
- Semaine : S24-26 · Agent : lhxpnotic_. · Client : Mushashi Miyam · Type : Location
- Intérieur : Petit appartement non meublé 7
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4482 | 2026-09-02 14:26:51 | 08/06/2026 | 8500 | Originale (à conserver) |
| 4483 | 2026-09-02 14:26:51 | 08/06/2026 | 8076 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 189 — n° de vente « 4351 » — **EXACT**

- Lignes (id) : 4507, 4717
- Semaine : S24-26 · Agent : lao4532 · Client : Loco White · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4507 | 2026-09-02 14:26:51 | 08/06/2026 | 17500 | Originale (à conserver) |
| 4717 | 2026-09-02 14:26:51 | 08/06/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 190 — n° de vente « 4351 » — **À VÉRIFIER**

- Lignes (id) : 4500
- Semaine : S24-26 · Agent : lao4532 · Client : Loco White · Type : Location
- Intérieur : Entrepot moyen non meublé
- Justification : Ligne isolée : partage le même numéro de vente qu'un doublon détecté ci-dessus (EXACT ou PROBABLE), mais ses propres données ne correspondent à aucune autre ligne — aucune ligne comparable en double à lui associer.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4500 | 2026-09-02 14:26:51 | 08/06/2026 | 18000 | Ligne isolée (aucun doublon associé) |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 191 — n° de vente « 4430 » — **EXACT**

- Lignes (id) : 4580, 4732, 4734
- Semaine : S24-26 · Agent : lhxpnotic_. · Client : Serrano Douglas · Type : Location
- Garage : Garage 10 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4580 | 2026-09-02 14:26:51 | 08/06/2026 | 8750 | Originale (à conserver) |
| 4732 | 2026-09-02 14:26:51 | 08/06/2026 | 8750 | Doublon proposé |
| 4734 | 2026-09-02 14:26:51 | 08/06/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 192 — n° de vente « 4435 » — **EXACT**

- Lignes (id) : 4585, 4605
- Semaine : S24-26 · Agent : lhxpnotic_. · Client : Mancini Vincenz · Type : Vente
- Garage : Garage 25 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4585 | 2026-09-02 14:26:51 | 08/06/2026 | 306250 | Originale (à conserver) |
| 4605 | 2026-09-02 14:26:51 | 08/06/2026 | 306250 | Doublon proposé |

**Montant potentiellement compté en double : 306 250 $**

### Groupe 193 — n° de vente « 4457 » — **EXACT**

- Lignes (id) : 4608, 4612
- Semaine : S24-26 · Agent : breeprime · Client : Tonado Marco · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4608 | 2026-09-02 14:26:51 | 08/06/2026 | 2835 | Originale (à conserver) |
| 4612 | 2026-09-02 14:26:51 | 08/06/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 194 — n° de vente « 4458 » — **EXACT**

- Lignes (id) : 4609, 4611
- Semaine : S24-26 · Agent : breeprime · Client : Tonado Marco · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4609 | 2026-09-02 14:26:51 | 08/06/2026 | 2835 | Originale (à conserver) |
| 4611 | 2026-09-02 14:26:51 | 08/06/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 195 — n° de vente « 4471 » — **À VÉRIFIER**

- Lignes (id) : 4624, 4625
- Semaine : S24-26 · Agent : breeprime · Client : Guara Alonso · Type : Vente
- Intérieur : Plantation
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4624 | 2026-09-02 14:26:51 | 08/06/2026 | 50000 | Originale (à conserver) |
| 4625 | 2026-09-02 14:26:51 | 08/06/2026 | 47500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 196 — n° de vente « 4489 » — **À VÉRIFIER**

- Lignes (id) : 4642, 4643
- Semaine : S24-26 · Agent : kaddara · Client : Velázquez Myran · Type : Location
- Intérieur : Entrepot moyen non meublé
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4642 | 2026-09-02 14:26:51 | 09/06/2026 | 18000 | Originale (à conserver) |
| 4643 | 2026-09-02 14:26:51 | 09/06/2026 | 36000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 197 — n° de vente « 45 » — **PROBABLE**

- Lignes (id) : 37, 39
- Semaine : S18-26 · Agent : totolafrappe · Client : sergio vendetta · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (numero_tel).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 37 | 2026-09-02 14:26:51 | 27/04/2026 | 17500 | Originale (à conserver) |
| 39 | 2026-09-02 14:26:51 | 27/04/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 198 — n° de vente « 4500 » — **EXACT**

- Lignes (id) : 4655, 4659
- Semaine : S24-26 · Agent : lao4532 · Client : Elijah Graves · Type : Location
- Garage : Garage 6 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4655 | 2026-09-02 14:26:51 | 09/06/2026 | 4988 | Originale (à conserver) |
| 4659 | 2026-09-02 14:26:51 | 09/06/2026 | 4988 | Doublon proposé |

**Montant potentiellement compté en double : 4 988 $**

### Groupe 199 — n° de vente « 4501 » — **À VÉRIFIER**

- Lignes (id) : 4656, 4658
- Semaine : S24-26 · Agent : lao4532 · Client : Elijah Graves · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4656 | 2026-09-02 14:26:51 | 09/06/2026 | 8750 | Originale (à conserver) |
| 4658 | 2026-09-02 14:26:51 | 09/06/2026 | 8313 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 200 — n° de vente « 4516 » — **À VÉRIFIER**

- Lignes (id) : 4673, 4675
- Semaine : S24-26 · Agent : lao4532 · Client : Ruby Saavedra · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4673 | 2026-09-02 14:26:51 | 09/06/2026 | 17500 | Originale (à conserver) |
| 4675 | 2026-09-02 14:26:51 | 09/06/2026 | 16625 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 201 — n° de vente « 4570 » — **EXACT**

- Lignes (id) : 4729, 4780
- Semaine : S24-26 · Agent : .matlow. · Client : Guzman Alvaro · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4729 | 2026-09-02 14:26:51 | 09/06/2026 | 35000 | Originale (à conserver) |
| 4780 | 2026-09-02 14:26:51 | 09/06/2026 | 35000 | Doublon proposé |

**Montant potentiellement compté en double : 35 000 $**

### Groupe 202 — n° de vente « 4621 » — **EXACT**

- Lignes (id) : 4783, 4808
- Semaine : S24-26 · Agent : lao4532 · Client : Nesta Ferreira · Type : Vente
- Intérieur : Appartement Non meublé 2 / UF 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4783 | 2026-09-02 14:26:51 | 09/06/2026 | 385000 | Originale (à conserver) |
| 4808 | 2026-09-02 14:26:51 | 09/06/2026 | 385000 | Doublon proposé |

**Montant potentiellement compté en double : 385 000 $**

### Groupe 203 — n° de vente « 465 » — **À VÉRIFIER**

- Lignes (id) : 477, 529
- Semaine : S18-26 · Agent : yopboygaming_5 · Client : DAVIES Malcom · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 477 | 2026-09-02 14:26:51 | 01/05/2026 | 8750 | Originale (à conserver) |
| 529 | 2026-09-02 14:26:51 | 01/05/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 204 — n° de vente « 4661 » — **EXACT**

- Lignes (id) : 4824, 4907
- Semaine : S24-26 · Agent : .matlow. · Client : Paul Jean · Type : Vente
- Intérieur : Grand Entrepôt Non Meublé
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 4824 | 2026-09-02 14:26:51 | 10/06/2026 | 249375 | Originale (à conserver) |
| 4907 | 2026-09-02 14:26:51 | 10/06/2026 | 249375 | Doublon proposé |

**Montant potentiellement compté en double : 249 375 $**

### Groupe 205 — n° de vente « 489 » — **À VÉRIFIER**

- Lignes (id) : 501, 536
- Semaine : S18-26 · Agent : capitainebalou · Client : West-Wrd-Malod · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 501 | 2026-09-02 14:26:51 | 01/05/2026 | 262500 | Originale (à conserver) |
| 536 | 2026-09-02 14:26:51 | 01/05/2026 | 262500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 206 — n° de vente « 492 » — **À VÉRIFIER**

- Lignes (id) : 504, 537
- Semaine : S18-26 · Agent : capitainebalou · Client : Milkovich Radon · Type : Location
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 504 | 2026-09-02 14:26:51 | 01/05/2026 | 4585 | Originale (à conserver) |
| 537 | 2026-09-02 14:26:51 | 01/05/2026 | 4585 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 207 — n° de vente « 496 » — **EXACT**

- Lignes (id) : 508, 511
- Semaine : S18-26 · Agent : alpha_o1 · Client : Doué Malik · Type : Vente
- Garage : Garage 6 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 508 | 2026-09-02 14:26:51 | 01/05/2026 | 78750 | Originale (à conserver) |
| 511 | 2026-09-02 14:26:51 | 01/05/2026 | 78750 | Doublon proposé |

**Montant potentiellement compté en double : 78 750 $**

### Groupe 208 — n° de vente « 530 » — **EXACT**

- Lignes (id) : 546, 547
- Semaine : S18-26 · Agent : k9nda · Client : Devis Lamar · Type : Vente
- Garage : Garage 2 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 546 | 2026-09-02 14:26:51 | 02/05/2026 | 26250 | Originale (à conserver) |
| 547 | 2026-09-02 14:26:51 | 02/05/2026 | 26250 | Doublon proposé |

**Montant potentiellement compté en double : 26 250 $**

### Groupe 209 — n° de vente « 553 » — **EXACT**

- Lignes (id) : 561, 563
- Semaine : S18-26 · Agent : yopboygaming_5 · Client : Jack MARTINS · Type : Vente
- Garage : Garage 10 places V
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 561 | 2026-09-02 14:26:51 | 02/05/2026 | 131250 | Originale (à conserver) |
| 563 | 2026-09-02 14:26:51 | 02/05/2026 | 131250 | Doublon proposé |

**Montant potentiellement compté en double : 131 250 $**

### Groupe 210 — n° de vente « 560 » — **EXACT**

- Lignes (id) : 569, 571
- Semaine : S18-26 · Agent : _aytee · Client : Davis Walker · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 569 | 2026-09-02 14:26:51 | 02/05/2026 | 2835 | Originale (à conserver) |
| 571 | 2026-09-02 14:26:51 | 02/05/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 211 — n° de vente « 576 » — **EXACT**

- Lignes (id) : 586, 677
- Semaine : S18-26 · Agent : vlvde · Client : Moni Andrea · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 586 | 2026-09-02 14:26:51 | 02/05/2026 | 8750 | Originale (à conserver) |
| 677 | 2026-09-02 14:26:51 | 02/05/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 212 — n° de vente « 598 » — **À VÉRIFIER**

- Lignes (id) : 608, 610
- Semaine : S18-26 · Agent : djezzzzyy · Client : Saint Andre · Type : Vente
- Intérieur : Motel
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 608 | 2026-09-02 14:26:51 | 02/05/2026 | 0 | Originale (à conserver) |
| 610 | 2026-09-02 14:26:51 | 02/05/2026 | 2835 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 213 — n° de vente « 60 » — **EXACT**

- Lignes (id) : 53, 232, 252, 254
- Semaine : S18-26 · Agent : antoine.cplt · Client : Dopeu Marcel · Type : Location
- Intérieur : Trailer
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 53 | 2026-09-02 14:26:51 | 27/04/2026 | 4585 | Originale (à conserver) |
| 232 | 2026-09-02 14:26:51 | 27/04/2026 | 4585 | Doublon proposé |
| 252 | 2026-09-02 14:26:51 | 27/04/2026 | 4585 | Doublon proposé |
| 254 | 2026-09-02 14:26:51 | 27/04/2026 | 4585 | Doublon proposé |

**Montant potentiellement compté en double : 13 755 $**

### Groupe 214 — n° de vente « 603 » — **EXACT**

- Lignes (id) : 614, 617
- Semaine : S18-26 · Agent : yopboygaming_5 · Client : Kayden KANE · Type : Vente
- Intérieur : Flat 1
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 614 | 2026-09-02 14:26:51 | 02/05/2026 | 82950 | Originale (à conserver) |
| 617 | 2026-09-02 14:26:51 | 02/05/2026 | 82950 | Doublon proposé |

**Montant potentiellement compté en double : 82 950 $**

### Groupe 215 — n° de vente « 603 » — **À VÉRIFIER**

- Lignes (id) : 631
- Semaine : S18-26 · Agent : yopboygaming_5 · Client : Kayden KANE · Type : Vente
- Intérieur : Small Flat Unfurnished 2
- Justification : Ligne isolée : partage le même numéro de vente qu'un doublon détecté ci-dessus (EXACT ou PROBABLE), mais ses propres données ne correspondent à aucune autre ligne — aucune ligne comparable en double à lui associer.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 631 | 2026-09-02 14:26:51 | 02/05/2026 | 87500 | Ligne isolée (aucun doublon associé) |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 216 — n° de vente « 64 » — **EXACT**

- Lignes (id) : 57, 60
- Semaine : S18-26 · Agent : xbrazza · Client : Dylan Miller · Type : Vente
- Intérieur : Small Flat Unfurnished 8
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 57 | 2026-09-02 14:26:51 | 27/04/2026 | 312313 | Originale (à conserver) |
| 60 | 2026-09-02 14:26:51 | 27/04/2026 | 312313 | Doublon proposé |

**Montant potentiellement compté en double : 312 313 $**

### Groupe 217 — n° de vente « 703 » — **EXACT**

- Lignes (id) : 701, 704
- Semaine : S18-26 · Agent : agent213934 · Client : Snow Ayden · Type : Vente
- Garage : Garage 10 places V
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 701 | 2026-09-02 14:26:51 | 03/05/2026 | 131250 | Originale (à conserver) |
| 704 | 2026-09-02 14:26:51 | 03/05/2026 | 131250 | Doublon proposé |

**Montant potentiellement compté en double : 131 250 $**

### Groupe 218 — n° de vente « 710 » — **EXACT**

- Lignes (id) : 709, 710
- Semaine : S19-26 · Agent : agent213934 · Client : Komen Julio · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 709 | 2026-09-02 14:26:51 | 04/05/2026 | 35000 | Originale (à conserver) |
| 710 | 2026-09-02 14:26:51 | 04/05/2026 | 35000 | Doublon proposé |

**Montant potentiellement compté en double : 35 000 $**

### Groupe 219 — n° de vente « 712 » — **À VÉRIFIER**

- Lignes (id) : 712, 713
- Semaine : S18-26 · Agent : hisoka0069 · Client : Radovan Milkovi · Type : Vente
- Garage : Garage 2 places
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 712 | 2026-09-02 14:26:51 | 04/05/2026 | 26250 | Originale (à conserver) |
| 713 | 2026-09-02 14:26:51 | 04/05/2026 | 1750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 220 — n° de vente « 719 » — **À VÉRIFIER**

- Lignes (id) : 720, 721
- Semaine : S19-26 · Agent : agent213934 · Client : Kayn Jericho · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 720 | 2026-09-02 14:26:51 | 04/05/2026 | 249375 | Originale (à conserver) |
| 721 | 2026-09-02 14:26:51 | 04/05/2026 | 249375 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 221 — n° de vente « 732 » — **À VÉRIFIER**

- Lignes (id) : 734, 904
- Semaine : S19-26 · Agent : totolafrappe · Client : syeerl william · Type : Vente
- Intérieur : Small House Unfurnished
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 734 | 2026-09-02 14:26:51 | 04/05/2026 | 140000 | Originale (à conserver) |
| 904 | 2026-09-02 14:26:51 | 04/05/2026 | 140000 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 222 — n° de vente « 777 » — **EXACT**

- Lignes (id) : 775, 788
- Semaine : S19-26 · Agent : _aytee · Client : Biggy Kill · Type : Location
- Intérieur : Small Flat Unfurnished 4
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 775 | 2026-09-02 14:26:51 | 04/05/2026 | 12250 | Originale (à conserver) |
| 788 | 2026-09-02 14:26:51 | 04/05/2026 | 12250 | Doublon proposé |

**Montant potentiellement compté en double : 12 250 $**

### Groupe 223 — n° de vente « 778 » — **EXACT**

- Lignes (id) : 776, 784
- Semaine : S19-26 · Agent : _aytee · Client : Zé Pequenio · Type : Vente
- Intérieur : Low-end unfurnished apartement
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 776 | 2026-09-02 14:26:51 | 04/05/2026 | 43750 | Originale (à conserver) |
| 784 | 2026-09-02 14:26:51 | 04/05/2026 | 43750 | Doublon proposé |

**Montant potentiellement compté en double : 43 750 $**

### Groupe 224 — n° de vente « 781 » — **EXACT**

- Lignes (id) : 779, 785
- Semaine : S19-26 · Agent : _aytee · Client : Zé Pequenio · Type : Vente
- Intérieur : Low-end unfurnished apartement
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 779 | 2026-09-02 14:26:51 | 04/05/2026 | 43750 | Originale (à conserver) |
| 785 | 2026-09-02 14:26:51 | 04/05/2026 | 43750 | Doublon proposé |

**Montant potentiellement compté en double : 43 750 $**

### Groupe 225 — n° de vente « 808 » — **EXACT**

- Lignes (id) : 809, 810
- Semaine : S19-26 · Agent : rekta68100 · Client : Tailers Exton · Type : Location
- Intérieur : Entrepôt Moyen
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 809 | 2026-09-02 14:26:51 | 04/05/2026 | 17500 | Originale (à conserver) |
| 810 | 2026-09-02 14:26:51 | 04/05/2026 | 17500 | Doublon proposé |

**Montant potentiellement compté en double : 17 500 $**

### Groupe 226 — n° de vente « 811 » — **PROBABLE**

- Lignes (id) : 813, 817
- Semaine : S19-26 · Agent : capitainebalou · Client : Forelli Emilio · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Même agent, client, montant, type, semaine et date de vente ; champs secondaires différents (numero_tel).

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 813 | 2026-09-02 14:26:51 | 04/05/2026 | 262500 | Originale (à conserver) |
| 817 | 2026-09-02 14:26:51 | 04/05/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 262 500 $**

### Groupe 227 — n° de vente « 828 » — **EXACT**

- Lignes (id) : 830, 832
- Semaine : S19-26 · Agent : rekta68100 · Client : Curtis Ice · Type : Location
- Intérieur : Petit Entrepôt 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 830 | 2026-09-02 14:26:51 | 04/05/2026 | 8750 | Originale (à conserver) |
| 832 | 2026-09-02 14:26:51 | 04/05/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 228 — n° de vente « 829 » — **EXACT**

- Lignes (id) : 831, 834
- Semaine : S19-26 · Agent : breeprime · Client : Bameyang Matté · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 831 | 2026-09-02 14:26:51 | 04/05/2026 | 8750 | Originale (à conserver) |
| 834 | 2026-09-02 14:26:51 | 04/05/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 229 — n° de vente « 836 » — **EXACT**

- Lignes (id) : 840, 841
- Semaine : S19-26 · Agent : breeprime · Client : Brook Jayvon · Type : Vente
- Intérieur : Warehouse Unfurnished
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 840 | 2026-09-02 14:26:51 | 04/05/2026 | 262500 | Originale (à conserver) |
| 841 | 2026-09-02 14:26:51 | 04/05/2026 | 262500 | Doublon proposé |

**Montant potentiellement compté en double : 262 500 $**

### Groupe 230 — n° de vente « 842 » — **EXACT**

- Lignes (id) : 847, 848
- Semaine : S19-26 · Agent : breeprime · Client : lyckma Kénan · Type : Location
- Intérieur : Motel
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 847 | 2026-09-02 14:26:51 | 04/05/2026 | 2835 | Originale (à conserver) |
| 848 | 2026-09-02 14:26:51 | 04/05/2026 | 2835 | Doublon proposé |

**Montant potentiellement compté en double : 2 835 $**

### Groupe 231 — n° de vente « 886 » — **EXACT**

- Lignes (id) : 893, 894
- Semaine : S19-26 · Agent : nayar_lvs · Client : Ortega Esteban · Type : Vente
- Intérieur : Flat 3
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 893 | 2026-09-02 14:26:51 | 05/05/2026 | 92400 | Originale (à conserver) |
| 894 | 2026-09-02 14:26:51 | 05/05/2026 | 92400 | Doublon proposé |

**Montant potentiellement compté en double : 92 400 $**

### Groupe 232 — n° de vente « 887 » — **EXACT**

- Lignes (id) : 895, 896
- Semaine : S19-26 · Agent : nayar_lvs · Client : Coldwell Charlie · Type : Location
- Garage : Garage 6 places
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 895 | 2026-09-02 14:26:51 | 05/05/2026 | 15750 | Originale (à conserver) |
| 896 | 2026-09-02 14:26:51 | 05/05/2026 | 15750 | Doublon proposé |

**Montant potentiellement compté en double : 15 750 $**

### Groupe 233 — n° de vente « 895 » — **EXACT**

- Lignes (id) : 905, 907
- Semaine : S19-26 · Agent : agent213934 · Client : Maxwell Exton · Type : Vente
- Intérieur : Flat 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 905 | 2026-09-02 14:26:51 | 05/05/2026 | 37800 | Originale (à conserver) |
| 907 | 2026-09-02 14:26:51 | 05/05/2026 | 37800 | Doublon proposé |

**Montant potentiellement compté en double : 37 800 $**

### Groupe 234 — n° de vente « 902 » — **À VÉRIFIER**

- Lignes (id) : 913, 917
- Semaine : S19-26 · Agent : nayar_lvs · Client : Elovak Idriss · Type : Vente
- Intérieur : Grand Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 913 | 2026-09-02 14:26:51 | 05/05/2026 | 262500 | Originale (à conserver) |
| 917 | 2026-09-02 14:26:51 | 05/05/2026 | 262500 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

### Groupe 235 — n° de vente « 93 » — **EXACT**

- Lignes (id) : 87, 111
- Semaine : S18-26 · Agent : xbrazza · Client : Karim Boufal · Type : Location
- Intérieur : Petit Entrepôt 2
- Justification : Toutes les colonnes comparées sont strictement identiques.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 87 | 2026-09-02 14:26:51 | 27/04/2026 | 8750 | Originale (à conserver) |
| 111 | 2026-09-02 14:26:51 | 27/04/2026 | 8750 | Doublon proposé |

**Montant potentiellement compté en double : 8 750 $**

### Groupe 236 — n° de vente « 99 » — **À VÉRIFIER**

- Lignes (id) : 93, 95
- Semaine : S18-26 · Agent : vlvde · Client : Wesley John · Type : Location
- Intérieur : Petit Entrepôt
- Justification : Même numéro de vente uniquement ; montant, agent, client, type ou semaine diffèrent — pourrait être une réutilisation légitime du numéro.

| id | Enregistrée le | Date de vente | Montant | Rôle proposé |
|---|---|---|---|---|
| 93 | 2026-09-02 14:26:51 | 27/04/2026 | 8750 | Originale (à conserver) |
| 95 | 2026-09-02 14:26:51 | 27/04/2026 | 8750 | Doublon proposé |

**Montant non additionné aux totaux** (pas de doublon confirmé dans ce groupe).

## Totaux

| Certitude | Groupes | Lignes concernées | Montant potentiellement compté en double |
|---|---|---|---|
| EXACT | 118 | 247 | 8 359 089 $ |
| PROBABLE | 12 | 24 | 3 058 125 $ |
| À VÉRIFIER | 106 | 207 | non applicable (non confirmé) |
| **Total** | **236** | **478** | **11 417 214 $ (EXACT + PROBABLE)** |