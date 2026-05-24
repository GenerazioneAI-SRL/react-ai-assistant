import type { WidgetTexts } from "../types";

const en: WidgetTexts = {
  openButtonLabel: "Open AI assistant",
  clearTitle: "Clear conversation",
  closeTitle: "Close",
  composerPlaceholder: "Ask me to do something...",
  composerAnswerPlaceholder: "Type your answer...",
  sendButton: "Send",
  stopButton: "Stop",
  handoffTitle: "Your turn",
  handoffDoneButton: "Done",
  handoffConfirmHint: (label) => `Tap "${label}" to confirm.`,
};

const it: WidgetTexts = {
  openButtonLabel: "Apri assistente AI",
  clearTitle: "Cancella conversazione",
  closeTitle: "Chiudi",
  composerPlaceholder: "Chiedimi qualcosa...",
  composerAnswerPlaceholder: "Scrivi la tua risposta...",
  sendButton: "Invia",
  stopButton: "Ferma",
  handoffTitle: "Tocca a te",
  handoffDoneButton: "Fatto",
  handoffConfirmHint: (label) => `Tocca “${label}” per confermare.`,
};

const fr: WidgetTexts = {
  openButtonLabel: "Ouvrir l'assistant IA",
  clearTitle: "Effacer la conversation",
  closeTitle: "Fermer",
  composerPlaceholder: "Demande-moi de faire quelque chose...",
  composerAnswerPlaceholder: "Écris ta réponse...",
  sendButton: "Envoyer",
  stopButton: "Arrêter",
  handoffTitle: "À toi",
  handoffDoneButton: "Terminé",
  handoffConfirmHint: (label) => `Touche « ${label} » pour confirmer.`,
};

const es: WidgetTexts = {
  openButtonLabel: "Abrir asistente IA",
  clearTitle: "Borrar conversación",
  closeTitle: "Cerrar",
  composerPlaceholder: "Pídeme que haga algo...",
  composerAnswerPlaceholder: "Escribe tu respuesta...",
  sendButton: "Enviar",
  stopButton: "Detener",
  handoffTitle: "Tu turno",
  handoffDoneButton: "Hecho",
  handoffConfirmHint: (label) => `Toca «${label}» para confirmar.`,
};

const de: WidgetTexts = {
  openButtonLabel: "KI-Assistenten öffnen",
  clearTitle: "Unterhaltung löschen",
  closeTitle: "Schließen",
  composerPlaceholder: "Bitte mich, etwas zu tun...",
  composerAnswerPlaceholder: "Antwort eingeben...",
  sendButton: "Senden",
  stopButton: "Stopp",
  handoffTitle: "Du bist dran",
  handoffDoneButton: "Fertig",
  handoffConfirmHint: (label) => `Tippe auf „${label}", um zu bestätigen.`,
};

const pt: WidgetTexts = {
  openButtonLabel: "Abrir assistente de IA",
  clearTitle: "Limpar conversa",
  closeTitle: "Fechar",
  composerPlaceholder: "Pede-me para fazer algo...",
  composerAnswerPlaceholder: "Escreve a tua resposta...",
  sendButton: "Enviar",
  stopButton: "Parar",
  handoffTitle: "É a tua vez",
  handoffDoneButton: "Concluído",
  handoffConfirmHint: (label) => `Toca em "${label}" para confirmar.`,
};

/** Built-in UI string packs shipped with the widget. Keyed by base ISO 639-1 language code. */
export const BUILT_IN_WIDGET_TEXTS: Record<string, WidgetTexts> = { en, it, fr, es, de, pt };

/**
 * Resolve the widget text pack for the given locale.
 * Accepts BCP-47 ("it-IT", "en-US"); falls back to English when the base language is unknown.
 */
export function resolveWidgetTexts(locale?: string): WidgetTexts {
  if (!locale) return BUILT_IN_WIDGET_TEXTS.en;
  const base = locale.toLowerCase().split(/[-_]/)[0];
  return BUILT_IN_WIDGET_TEXTS[base] ?? BUILT_IN_WIDGET_TEXTS.en;
}
