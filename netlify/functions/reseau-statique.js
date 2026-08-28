const { chargerBase, chargerReseau } = require("./_lib/gtfs-statique.js");

// Données quasi-statiques (changent seulement quand Citibus republie ses
// horaires, en général par trimestre) : le tracé complet de chaque ligne et
// la liste de ses arrêts. Séparé de bus-data.js pour ne pas re-télécharger
// ni renvoyer ces données à chaque rafraîchissement de 15 secondes.
exports.handler = async function () {
  try {
    const { lignes, directionsParLigne, arretsPosition } = await chargerBase();
    const { tracesParLigne, arretsParLigne, arretsParLigneDirection } = await chargerReseau();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Peut être mis en cache un moment côté navigateur/CDN, ces données bougent rarement.
        "Cache-Control": "public, max-age=1800",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        lignes: lignes,
        traces: tracesParLigne,
        arrets: arretsParLigne,
        arrets_infos: arretsPosition,
        directions: directionsParLigne,
        arrets_par_direction: arretsParLigneDirection,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ erreur: String(e && e.message ? e.message : e) }),
    };
  }
};
