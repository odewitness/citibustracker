// Les seules lignes qu'on veut voir dans l'app.
export const LIGNES_AUTORISEES = ["1", "2", "3", "4", "CIT1", "CIT2"];

// Comparaison insensible à la casse et aux espaces/tirets :
// "CIT 1", "cit1", "Cit-1" matchent tous "CIT1".
export function normaliser(s) {
  return (s || "").toString().toUpperCase().replace(/[\s-]/g, "");
}
export const LIGNES_AUTORISEES_NORM = LIGNES_AUTORISEES.map(normaliser);

export function trierParOrdreAutorise(routeIds, lignesInfo) {
  return [...routeIds].sort(
    (a, b) =>
      LIGNES_AUTORISEES_NORM.indexOf(normaliser(lignesInfo[a]?.nom)) -
      LIGNES_AUTORISEES_NORM.indexOf(normaliser(lignesInfo[b]?.nom))
  );
}

// --- Petits utilitaires de stockage local, tolérants aux erreurs ---
export function lireStockage(cle) {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? JSON.parse(brut) : null;
  } catch (e) {
    return null;
  }
}
export function ecrireStockage(cle, valeur) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch (e) {
    /* stockage indisponible, tant pis */
  }
}

export function jouerSon() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  } catch (e) {
    /* Web Audio indisponible, tant pis */
  }
}
