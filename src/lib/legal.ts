/** Dati del titolare mostrati nelle pagine legali. Configurabili per ogni installazione. */
export function legalInfo() {
  return {
    appName: process.env.APP_NAME || "FBMeter",
    owner: process.env.APP_OWNER_NAME || "il titolare indicato dall'organizzatore dell'evento",
    contact: process.env.APP_CONTACT_EMAIL || "",
    updated: process.env.APP_LEGAL_UPDATED || "3 novembre 2026",
  };
}
