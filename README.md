# 📊 Google Ads Smart tCPA (version simple)

Script **Google Ads** minimaliste pour ajuster automatiquement les **CPA cibles (tCPA)** de **3 campagnes Search** selon :
- la **part d’impressions en haut de page (Top Impression Share)**,
- des **bornes min/max** par campagne,
- un **biais global** basé sur le **volume de leads (Objectifs du compte) sur 7 jours**.

> 🎯 Objectif : rester dans une bande de visibilité (48–52%) tout en gardant un CPA maîtrisé.  
> 🧩 Pas de logique PRO ni de PMax ici — version volontairement basique et réutilisable.

---

## ⚙️ Fonctionnalités
- **Ciblage de bande Top IS** : 48–52% par défaut (modifiable).
- **Ajustements tCPA graduels** :
  - **±6%** (mouvement “doux”),
  - **±8%** si l’écart à la bande est **> 2 pts** et **≥ 5 conversions** sur 7 jours.
- **Clamp automatique** : chaque campagne reste dans ses **bornes min/max**.
- **Biais global (7 jours, basé Objectifs compte)** :
  - `< 250 leads` ⇒ **+8%** (ouvre),
  - `> 350 leads` ⇒ **–6%** (resserre).

---

## 🛠️ Installation (3 étapes)
1) **Ajouter le script** dans *Google Ads → Outils → Scripts*.  
2) **Personnaliser** les sections :
   - `campaigns` (IDs de tes 3 campagnes Search),
   - `OBJECTIVE_NAMES` et `CAMPAIGN_OBJECTIVE` (noms EXACTS de vos Actions de conversion → Google Ads > Outils > Conversions > Objectifs > Récapitulatif, colonne Action de conversion),
   - `CPA_BOUNDS` (bornes min/max par campagne),
   - `EMAIL_RECIPIENT` (email pour le rapport).
3) **Programmer** le script **1×/jour** (ou 2×/jour si volume élevé).

---

## 🔧 Exemple de configuration

```js
// 1) Campagnes (remplace XXX par tes IDs Google Ads)
const campaigns = {
  'campaignSearch1': { campaignId: XXX }, // ex. Marque / Générique
  'campaignSearch2': { campaignId: XXX },
  'campaignSearch3': { campaignId: XXX }
};

// 2) Objectifs (noms EXACTS de tes conversions dans La colonne "Action de conversion" Google Ads -> voir onglet "Objectifs → Récapitulatif" )
const OBJECTIVE_NAMES = ['conv_Search1','conv_Search2','conv_Search3'];
const CAMPAIGN_OBJECTIVE = {
  campaignSearch1: 'conv_Search1',
  campaignSearch2: 'conv_Search2',
  campaignSearch3: 'conv_Search3'
};

// 3) Bornes CPA (à adapter à ton business)
const CPA_BOUNDS = {
  campaignSearch1: { min: 5.00, max: 12.00 },
  campaignSearch2: { min: 4.00, max: 10.00 },
  campaignSearch3: { min: 6.00, max: 14.00 }
};
const DEFAULT_BOUNDS = { min: 4.00, max: 15.00 };

// 4) Email de rapport
const EMAIL_RECIPIENT = 'ton.email@domaine.com';

