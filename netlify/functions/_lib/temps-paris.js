// Helpers de date/heure ancrés sur le fuseau Europe/Paris, indépendamment du
// fuseau du serveur Netlify. Partagés par les fonctions qui lisent le calendrier
// GTFS (horaires-arret, horaires-ligne).

// Date (YYYYMMDD), seconde du jour et jour de la semaine (0 = dimanche) à Paris.
function maintenantParis(base = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(base)
    .reduce((o, p) => ((o[p.type] = p.value), o), {});

  const heure = Number(parts.hour) % 24; // certains moteurs renvoient "24" à minuit
  const dateYYYYMMDD = `${parts.year}${parts.month}${parts.day}`;
  const secondeDuJour = heure * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  const jourSemaine = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  ).getUTCDay();

  return { dateYYYYMMDD, secondeDuJour, jourSemaine };
}

// Décale une date YYYYMMDD de N jours et renvoie { date, jour }.
function dateDecalee(dateYYYYMMDD, deltaJours) {
  const y = Number(dateYYYYMMDD.slice(0, 4));
  const m = Number(dateYYYYMMDD.slice(4, 6));
  const d = Number(dateYYYYMMDD.slice(6, 8));
  const t = new Date(Date.UTC(y, m - 1, d + deltaJours));
  const p = (n) => String(n).padStart(2, "0");
  return {
    date: `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}`,
    jour: t.getUTCDay(),
  };
}

// Seconde du jour (parfois > 24h pour les courses après minuit) → "HH:MM".
function formaterHM(secondeDuJour) {
  const total = ((secondeDuJour % 86400) + 86400) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

module.exports = { maintenantParis, dateDecalee, formaterHM };
