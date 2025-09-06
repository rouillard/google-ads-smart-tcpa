/***** Google Ads Smart tCPA Script — Version simple (3 campagnes Search)
     Licence: MIT
     ---------------------------------
     Ajuste automatiquement les CPA cibles (tCPA) de 3 campagnes Search en fonction :
       - de la part d’impressions en haut de page (Top Impression Share),
       - de bornes min/max par campagne (clamp),
       - d’un biais global basé sur le volume de leads (Objectifs du compte) sur 7 jours.

     👉 À personnaliser :
       - IDs des campagnes dans `campaigns` (remplacer XXX),
       - Noms EXACTS d’actions de conversion dans `OBJECTIVE_NAMES` + `CAMPAIGN_OBJECTIVE`,
       - Bornes CPA dans `CPA_BOUNDS`,
       - Email de rapport dans `EMAIL_RECIPIENT`.
*****/

// ===== CAMPAGNES (à personnaliser) =====
const campaigns = {
  'campaignSearch1': { campaignId: XXX }, // ex. Marque / Générique
  'campaignSearch2': { campaignId: XXX },
  'campaignSearch3': { campaignId: XXX }
};

// ===== OBJECTIFS (noms EXACTS d’actions de conversion) =====
// Google Ads → Outils → Conversions → Objectifs → Récapitulatif, colonne "Action de conversion"
const OBJECTIVE_NAMES = ['conv_Search1','conv_Search2','conv_Search3'];
const CAMPAIGN_OBJECTIVE = {
  campaignSearch1: 'conv_Search1',
  campaignSearch2: 'conv_Search2',
  campaignSearch3: 'conv_Search3'
};

// ===== BORNES CPA (à adapter) =====
const CPA_BOUNDS = {
  campaignSearch1: { min: 5.00, max: 12.00 },
  campaignSearch2: { min: 4.00, max: 10.00 },
  campaignSearch3: { min: 6.00, max: 14.00 }
};
const DEFAULT_BOUNDS = { min: 4.00, max: 15.00 };

// ===== Email de rapport =====
const EMAIL_RECIPIENT = 'ton.email@domaine.com';

// ===== Paramètres de pilotage =====
const SHARE_LOW  = 0.48;  // 48%
const SHARE_HIGH = 0.52;  // 52%

const STEP_SOFT_PCT   = 0.06; // ±6% (mouvement “doux”)
const STEP_STRONG_PCT = 0.08; // ±8% si gros écart
const STRONG_GAP      = 0.02; // >2 pts hors bande

const MIN_CONV_7D_FOR_STRONG = 5; // seuil pour autoriser le pas “fort”

// Biais global basé sur Objectifs COMPTE (7 jours) — B2C “générique”
const WEEKLY_LEADS_LOW_7D  = 250; // < 250 → +8%
const WEEKLY_LEADS_HIGH_7D = 350; // > 350 → -6%
const GLOBAL_UP_PCT   = 0.08;
const GLOBAL_DOWN_PCT = 0.06;

/***** UTILS ********************************************************/
function tz(){ return AdsApp.currentAccount().getTimeZone(); }
function formatDate(d, fmt){ return Utilities.formatDate(d, tz(), fmt || 'yyyyMMdd'); }
function humanDate(d){ return Utilities.formatDate(d, tz(), 'yyyy-MM-dd'); }
function money(v){ return (v == null || isNaN(v)) ? '—' : v.toFixed(2); }
function pct(v){ return (v*100).toFixed(0) + '%'; }

function boundsFor(name){ return CPA_BOUNDS[name] || DEFAULT_BOUNDS; }
function clampCpaFor(name, v){ const b=boundsFor(name); return Math.max(b.min, Math.min(b.max, v)); }
function stepCpa(name, current, dir, strong){ const pct= strong?STEP_STRONG_PCT:STEP_SOFT_PCT; return clampCpaFor(name, current*(1+dir*pct)); }

function parseShare(v){
  if (v == null) return 0;
  const s = String(v).replace('%','').replace(/\u00A0/g,'').replace(/\s+/g,'').replace(',', '.').trim();
  let x = parseFloat(s); if (isNaN(x)) return 0;
  if (x > 1) x/=100; if (x<0) x=0; if (x>1) x=1; return x;
}
function num(x){
  if (x == null) return 0;
  let s = String(x).replace(/\u00A0/g,'').replace(/[^\d,.\-]/g,'').trim();
  const c=s.lastIndexOf(','), d=s.lastIndexOf('.'), k=Math.max(c,d);
  if (k!==-1){ const h=s.slice(0,k).replace(/[.,]/g,''), t=s.slice(k+1).replace(/[.,]/g,''); s=h+'.'+t; }
  const v=parseFloat(s); return isNaN(v)?0:v;
}
function sendEmailReport(text){
  try{ MailApp.sendEmail(EMAIL_RECIPIENT, "Rapport Google Ads — Smart tCPA (simple)", text); }catch(e){ Logger.log("Email error: "+e); }
}

/***** STATS COMPTE (affichage) ************************************/
function statsForAccount(rangeToken){
  const st=AdsApp.currentAccount().getStatsFor(rangeToken);
  const conv=st.getConversions(); const cost=st.getCost();
  const cpa = conv>0? (cost/conv): null;
  return { conv, cost, cpa };
}

/***** REPORTS GROUPÉS **********************************************/
// Top IS (3j effectifs, exclut J)
function fetchTopIS(days, excludeDays){
  const now=new Date(), end=new Date(now); if(excludeDays>0) end.setDate(end.getDate()-excludeDays);
  const start=new Date(end); start.setDate(end.getDate()-(days-1));
  const from=formatDate(start), to=formatDate(end);
  const rep=AdsApp.report(`
    SELECT CampaignId, Impressions, SearchTopImpressionShare
    FROM   CAMPAIGN_PERFORMANCE_REPORT
    DURING ${from},${to}
  `);
  const agg={}, it=rep.rows();
  while(it.hasNext()){
    const r=it.next();
    const id=parseInt(r['CampaignId'],10);
    const imp=num(r['Impressions'])||0, share=parseShare(r['SearchTopImpressionShare']);
    if(!agg[id]) agg[id]={imp:0,w:0};
    agg[id].imp+=imp; agg[id].w+=share*imp;
  }
  const out={}; for(const id in agg) out[id]=agg[id].imp>0?(agg[id].w/agg[id].imp):0; return out;
}

// Coûts
function fetchCosts(rangeToken){
  const rep=AdsApp.report(`
    SELECT CampaignId, Cost
    FROM   CAMPAIGN_PERFORMANCE_REPORT
    DURING ${rangeToken}
  `);
  const map={}, it=rep.rows();
  while(it.hasNext()){
    const r=it.next(); const id=parseInt(r['CampaignId'],10);
    map[id]={ cost: num(r['Cost'])||0 };
  }
  return map;
}

// Objectifs PAR CAMPAGNE (pour “leads reçus” par campagne)
function fetchObjectivesByCampaign(rangeToken){
  const rep=AdsApp.report(`
    SELECT CampaignId, ConversionTypeName, Conversions
    FROM   CAMPAIGN_PERFORMANCE_REPORT
    DURING ${rangeToken}
  `);
  const out={}, it=rep.rows();
  while(it.hasNext()){
    const r=it.next();
    const id=parseInt(r['CampaignId'],10);
    const obj=String(r['ConversionTypeName']||'').trim();
    const c=num(r['Conversions'])||0;
    if(!id||!obj) continue;
    if(!out[id]) out[id]={};
    out[id][obj]=(out[id][obj]||0)+c;
  }
  return out;
}

// Objectifs NIVEAU COMPTE (pour le biais 7j)
function fetchObjectivesAccount(rangeToken){
  const rep=AdsApp.report(`
    SELECT ConversionTypeName, Conversions
    FROM   ACCOUNT_PERFORMANCE_REPORT
    DURING ${rangeToken}
  `);
  const out={}, it=rep.rows();
  while(it.hasNext()){
    const r=it.next();
    const name=String(r['ConversionTypeName']||'').trim();
    const conv=num(r['Conversions'])||0;
    if(!name) continue;
    out[name]=(out[name]||0)+conv;
  }
  return out;
}

/***** MAIN *********************************************************/
function main(){
  const today = humanDate(new Date());
  let report = `📊 Smart tCPA (simple) — Bande Top IS ${Math.round(SHARE_LOW*100)}–${Math.round(SHARE_HIGH*100)}%\n`;
  report += `Aujourd'hui: ${today}\n\n`;

  // Chargement campagnes
  const cmap={};
  for (const alias in campaigns){
    const id = campaigns[alias].campaignId;
    const it = AdsApp.campaigns().withIds([id]).get();
    if(!it.hasNext()){
      report += `⚠️ Campagne ${alias} (${id}) introuvable/désactivée.\n`;
      continue;
    }
    cmap[alias] = { campaign: it.next() };
  }
  if(Object.keys(cmap).length===0){
    Logger.log(report+"\n(aucune campagne valide)"); return;
  }

  // Groupés
  const topIS  = fetchTopIS(3, 1);
  const cost7  = fetchCosts('LAST_7_DAYS');
  const cost30 = fetchCosts('LAST_30_DAYS');
  const obj7   = fetchObjectivesByCampaign('LAST_7_DAYS');
  const obj30  = fetchObjectivesByCampaign('LAST_30_DAYS');

  // Biais 7j (somme des objectifs au niveau compte)
  const accObj7 = fetchObjectivesAccount('LAST_7_DAYS');
  let totalLeads7 = 0;
  for (const name of OBJECTIVE_NAMES){ totalLeads7 += (accObj7[name]||0); }
  let globalBias = 0;
  if      (totalLeads7 < WEEKLY_LEADS_LOW_7D)  globalBias = +1;
  else if (totalLeads7 > WEEKLY_LEADS_HIGH_7D) globalBias = -1;

  report += `📈 Biais (Objectifs 7j) : Leads=${totalLeads7.toFixed(2)} → `;
  report += globalBias===0?`neutre\n\n`:(globalBias>0?`+${(GLOBAL_UP_PCT*100).toFixed(0)}% (up)\n\n`:`-${(GLOBAL_DOWN_PCT*100).toFixed(0)}% (down)\n\n`);

  // Ajustements par campagne
  const summary=[];
  for (const alias in cmap){
    const camp = cmap[alias].campaign;
    const id   = camp.getId();

    const objKey = CAMPAIGN_OBJECTIVE[alias] || null;
    const leads7  = objKey && obj7[id]  && obj7[id][objKey]  ? obj7[id][objKey]  : 0;
    const leads30 = objKey && obj30[id] && obj30[id][objKey] ? obj30[id][objKey] : 0;

    const c7  = (cost7[id] ? cost7[id].cost  : 0);
    const c30 = (cost30[id]? cost30[id].cost : 0);
    const cpa7  = leads7>0  ? (c7/leads7)  : null;
    const cpa30 = leads30>0 ? (c30/leads30): null;

    const b = boundsFor(alias);
    const bidding = camp.bidding();
    if(!bidding.getTargetCpa || !bidding.setTargetCpa){
      report += `Campagne ${alias}\n  ℹ️ Stratégie sans tCPA → aucun ajustement.\n\n`;
      continue;
    }
    let tCPA = bidding.getTargetCpa();
    if(!tCPA || tCPA<=0){
      report += `Campagne ${alias}\n  🟡 tCPA invalide → aucun ajustement.\n\n`;
      continue;
    }

    // Clamp immédiat
    if (tCPA > b.max){ bidding.setTargetCpa(b.max); summary.push(`- ${alias}: clamp ${money(tCPA)} → ${money(b.max)} €`); report += `Campagne ${alias}\n  ⛑️ Clamp: ${money(tCPA)} → ${money(b.max)} €\n\n`; continue; }
    if (tCPA < b.min){ bidding.setTargetCpa(b.min); summary.push(`- ${alias}: clamp ${money(tCPA)} → ${money(b.min)} €`); report += `Campagne ${alias}\n  ⛑️ Clamp: ${money(tCPA)} → ${money(b.min)} €\n\n`; continue; }

    const top3 = (topIS[id]!=null)? topIS[id] : 0;
    const strongEligible = (leads7 >= MIN_CONV_7D_FOR_STRONG);
    const strongLow  = ((SHARE_LOW  - top3) >= STRONG_GAP) && strongEligible;
    const strongHigh = ((top3       - SHARE_HIGH) >= STRONG_GAP) && strongEligible;

    let newCPA = tCPA, changed=false;

    // Report bloc
    report += `Campagne ${alias}\n`;
    report += `  Leads (Objectifs) 7j / 30j : ${leads7.toFixed(2)} / ${leads30.toFixed(2)}\n`;
    report += `  Coûts 7j / 30j             : ${money(c7)} € / ${money(c30)} €\n`;
    report += `  CPA(obj) 7j / 30j          : ${money(cpa7)} € / ${money(cpa30)} €\n`;
    report += `  Top IS 3j (pondéré)        : ${pct(top3)} (bande ${Math.round(SHARE_LOW*100)}–${Math.round(SHARE_HIGH*100)}%)\n`;
    report += `  tCPA actuel (bornes)        : ${money(tCPA)} € ( ${money(b.min)}–${money(b.max)} )\n`;

    // Décision position
    if (top3 < SHARE_LOW){
      const next = stepCpa(alias, newCPA, +1, strongLow);
      if(next!==newCPA){ report += `  📈 Top IS < bande → +tCPA (${Math.round((strongLow?STEP_STRONG_PCT:STEP_SOFT_PCT)*100)}%).\n`; newCPA=next; changed=true; }
      else report += `  🚧 Borne max atteinte.\n`;
    } else if (top3 > SHARE_HIGH){
      const next = stepCpa(alias, newCPA, -1, strongHigh);
      if(next!==newCPA){ report += `  📉 Top IS > bande → -tCPA (${Math.round((strongHigh?STEP_STRONG_PCT:STEP_SOFT_PCT)*100)}%).\n`; newCPA=next; changed=true; }
      else report += `  🚧 Borne min atteinte.\n`;
    } else {
      report += `  ✅ Top IS dans la bande → neutre.\n`;
    }

    // Biais global (7j)
    if (globalBias!==0){
      const bias = (globalBias>0)? GLOBAL_UP_PCT : -GLOBAL_DOWN_PCT;
      const adj  = clampCpaFor(alias, newCPA*(1+bias));
      if(adj!==newCPA){ report += `  🌐 Biais global 7j: ${(bias*100).toFixed(0)}%.\n`; newCPA=adj; changed=true; }
    }

    if (changed && newCPA!==tCPA){
      bidding.setTargetCpa(newCPA);
      summary.push(`- ${alias}: ${money(tCPA)} → ${money(newCPA)} €`);
      report += `  ✅ Nouveau tCPA : ${money(newCPA)} €\n\n`;
    } else {
      summary.push(`- ${alias}: inchangé (${money(tCPA)} €)`);
      report += `  ❌ Aucun changement.\n\n`;
    }
  }

  if(summary.length){ report = `📝 Résumé\n${summary.join('\n')}\n\n` + report; }
  Logger.log(report);
  sendEmailReport(report);
}
