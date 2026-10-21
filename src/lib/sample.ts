// Beispiel-Unit: Au début (Seite 158)
import type { Row } from './types';
const S: [string, string, string, string][] = [
  ['1', 'Bienvenue!', 'bjɛ̃vny', 'Willkommen!'], ['1', 'Bonjour.', 'bɔ̃ʒuʀ', 'Guten Tag!'], ['1', "je m'appelle", 'ʒəmapɛl', 'ich heiße'],
  ['1', 'moi', 'mwa', 'ich (betont)'], ['1', "c'est", 'sɛ', 'das ist'], ['1', 'Salut! (fam.)', 'saly', 'Hallo! (ugs.); Grüß dich! (ugs.); Tschüs! (ugs.)'],
  ['1', 'et', 'e', 'und'], ['1', 'toi', 'twa', 'du (betont)'], ['1', 'comment', 'kɔmɑ̃', 'wie (Frage)'], ['1', "Tu t'appelles comment?", 'tytapɛlkɔmɑ̃', 'Wie heißt du?'],
  ['2', 'Ça va?', 'sava', "Wie geht's?"], ['2', 'un bisou', 'ɛ̃bizu', 'ein Küsschen'], ['2', 'merci', 'mɛʀsi', 'danke'],
  ['5', 'À bientôt!', 'abjɛ̃to', 'Bis bald!'], ['5', 'oui', 'wi', 'ja'], ['5', 'à plus (fam.)', 'aplys', 'Bis später!'], ['5', 'bien (adv.)', 'bjɛ̃', 'gut (Adv.)'],
  ['5', 'Ça va bien.', 'savabjɛ̃', 'Es geht (mir) gut.'], ['5', 'Au revoir!', 'ɔʀvwaʀ', 'Auf Wiedersehen!'], ['5', 'voilà', 'vwala', 'da ist / das ist; da sind / das sind'],
  ['5', 'Bonjour les amis!', 'bɔ̃ʒuʀlezami', 'Guten Tag, Freunde!'],
];
export const SAMPLE_FR = { title: 'Au début', subtitle: 'Seite 158', rows: S.map(([section, term, ipa, translation], i): Row => ({ key: 's' + i, section, term, ipa, translation })) };
