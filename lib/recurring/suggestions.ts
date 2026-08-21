/**
 * Common recurring expense suggestions by category.
 * Used for quick setup and suggestions in both web and bot interfaces.
 */

export interface RecurringSuggestion {
  name: string;
  category: string;
  emoji: string;
  suggestedAmount: number | null;
}

export interface SuggestionCategory {
  label: string;
  emoji: string;
  items: RecurringSuggestion[];
}

export const RECURRING_SUGGESTIONS: Record<string, SuggestionCategory> = {
  streaming: {
    label: "Streaming",
    emoji: "🎬",
    items: [
      { name: "Netflix", category: "entretenimiento", emoji: "🎬", suggestedAmount: 5000 },
      { name: "Spotify", category: "entretenimiento", emoji: "🎵", suggestedAmount: 2500 },
      { name: "Disney+", category: "entretenimiento", emoji: "✨", suggestedAmount: 4000 },
      { name: "HBO Max", category: "entretenimiento", emoji: "🎭", suggestedAmount: 4500 },
      { name: "Amazon Prime", category: "entretenimiento", emoji: "📦", suggestedAmount: 3000 },
      { name: "YouTube Premium", category: "entretenimiento", emoji: "▶️", suggestedAmount: 2000 },
      { name: "Apple TV+", category: "entretenimiento", emoji: "🍎", suggestedAmount: 2500 },
      { name: "Paramount+", category: "entretenimiento", emoji: "⭐", suggestedAmount: 3000 },
      { name: "Star+", category: "entretenimiento", emoji: "🌟", suggestedAmount: 4000 },
      { name: "Crunchyroll", category: "entretenimiento", emoji: "🎌", suggestedAmount: 2000 },
    ],
  },
  servicios: {
    label: "Servicios del Hogar",
    emoji: "🏠",
    items: [
      { name: "Electricidad", category: "servicios", emoji: "💡", suggestedAmount: null },
      { name: "Gas", category: "servicios", emoji: "🔥", suggestedAmount: null },
      { name: "Agua", category: "servicios", emoji: "💧", suggestedAmount: null },
      { name: "Internet", category: "servicios", emoji: "📶", suggestedAmount: 15000 },
      { name: "Celular", category: "servicios", emoji: "📱", suggestedAmount: 8000 },
      { name: "Cable/TV", category: "servicios", emoji: "📺", suggestedAmount: 10000 },
    ],
  },
  vivienda: {
    label: "Vivienda",
    emoji: "🏡",
    items: [
      { name: "Alquiler", category: "vivienda", emoji: "🏠", suggestedAmount: null },
      { name: "Expensas", category: "vivienda", emoji: "🏢", suggestedAmount: null },
      { name: "ABL", category: "impuestos", emoji: "🏛️", suggestedAmount: null },
      { name: "Impuesto Inmobiliario", category: "impuestos", emoji: "📋", suggestedAmount: null },
    ],
  },
  finanzas: {
    label: "Finanzas y Seguros",
    emoji: "💳",
    items: [
      { name: "Tarjeta de Crédito", category: "tarjeta", emoji: "💳", suggestedAmount: null },
      { name: "Seguro Auto", category: "transporte", emoji: "🚗", suggestedAmount: null },
      { name: "Seguro Hogar", category: "servicios", emoji: "🏡", suggestedAmount: null },
      { name: "Seguro de Vida", category: "servicios", emoji: "❤️", suggestedAmount: null },
    ],
  },
  salud: {
    label: "Salud y Bienestar",
    emoji: "💪",
    items: [
      { name: "Prepaga", category: "salud", emoji: "🏥", suggestedAmount: null },
      { name: "Obra Social", category: "salud", emoji: "🩺", suggestedAmount: null },
      { name: "Gimnasio", category: "salud", emoji: "💪", suggestedAmount: 15000 },
      { name: "Pilates/Yoga", category: "salud", emoji: "🧘", suggestedAmount: 20000 },
      { name: "Natación", category: "salud", emoji: "🏊", suggestedAmount: 18000 },
    ],
  },
  transporte: {
    label: "Transporte",
    emoji: "🚗",
    items: [
      { name: "Patente", category: "transporte", emoji: "🚗", suggestedAmount: null },
      { name: "VTV", category: "transporte", emoji: "✅", suggestedAmount: null },
      { name: "Estacionamiento", category: "transporte", emoji: "🅿️", suggestedAmount: null },
      { name: "Peaje (tag)", category: "transporte", emoji: "🛣️", suggestedAmount: null },
    ],
  },
  educacion: {
    label: "Educación",
    emoji: "📚",
    items: [
      { name: "Cuota Colegio", category: "educacion", emoji: "🏫", suggestedAmount: null },
      { name: "Universidad", category: "educacion", emoji: "🎓", suggestedAmount: null },
      { name: "Curso Online", category: "educacion", emoji: "💻", suggestedAmount: null },
      { name: "Idiomas", category: "educacion", emoji: "🌍", suggestedAmount: null },
    ],
  },
  otros: {
    label: "Otros",
    emoji: "📦",
    items: [
      { name: "iCloud", category: "servicios", emoji: "☁️", suggestedAmount: 1500 },
      { name: "Google One", category: "servicios", emoji: "📁", suggestedAmount: 1200 },
      { name: "Dropbox", category: "servicios", emoji: "📦", suggestedAmount: 2000 },
      { name: "Microsoft 365", category: "servicios", emoji: "📊", suggestedAmount: 3000 },
      { name: "PlayStation Plus", category: "entretenimiento", emoji: "🎮", suggestedAmount: 4000 },
      { name: "Xbox Game Pass", category: "entretenimiento", emoji: "🎮", suggestedAmount: 4500 },
    ],
  },
};

/**
 * Get all suggestions as a flat array
 */
export function getAllSuggestions(): RecurringSuggestion[] {
  return Object.values(RECURRING_SUGGESTIONS).flatMap((cat) => cat.items);
}

/**
 * Find a suggestion by name (case-insensitive, partial match)
 */
export function findSuggestionByName(name: string): RecurringSuggestion | undefined {
  const normalizedName = name.toLowerCase().trim();
  return getAllSuggestions().find(
    (s) =>
      s.name.toLowerCase() === normalizedName ||
      s.name.toLowerCase().includes(normalizedName) ||
      normalizedName.includes(s.name.toLowerCase())
  );
}

/**
 * Get suggestions for a specific category
 */
export function getSuggestionsByCategory(categoryKey: string): RecurringSuggestion[] {
  return RECURRING_SUGGESTIONS[categoryKey]?.items ?? [];
}

/**
 * Get all category keys
 */
export function getSuggestionCategories(): string[] {
  return Object.keys(RECURRING_SUGGESTIONS);
}

/**
 * Format suggestion for display in Telegram
 */
export function formatSuggestionForTelegram(suggestion: RecurringSuggestion): string {
  const amount = suggestion.suggestedAmount
    ? ` (~$${suggestion.suggestedAmount.toLocaleString("es-AR")})`
    : "";
  return `${suggestion.emoji} ${suggestion.name}${amount}`;
}

/**
 * Get suggestions grouped by category for keyboard display
 */
export function getSuggestionsForKeyboard(): { category: string; emoji: string; items: string[] }[] {
  return Object.entries(RECURRING_SUGGESTIONS).map(([key, cat]) => ({
    category: cat.label,
    emoji: cat.emoji,
    items: cat.items.map((item) => item.name),
  }));
}
