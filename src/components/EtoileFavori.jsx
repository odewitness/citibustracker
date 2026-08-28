// Bouton étoile pour ajouter/retirer un favori (arrêt ou ligne).
export default function EtoileFavori({ actif, onToggle, label, sombre = false }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={actif}
      aria-label={actif ? `Retirer ${label} des favoris` : `Ajouter ${label} aux favoris`}
      className={
        "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[15px] leading-none transition-transform active:scale-90 " +
        (actif
          ? "text-[var(--amber-500)]"
          : sombre
            ? "text-white/35"
            : "text-[var(--ink-muted)]/45")
      }
    >
      {actif ? "★" : "☆"}
    </button>
  );
}
