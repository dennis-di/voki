export interface OcrWord { t: string; x0: number; y0: number; x1: number; y1: number; c: number }
export interface OcrSection { name: string; items: { fr: string; ipa: string; de: string }[] }
export function parseOcrWords(words: OcrWord[]): OcrSection[];
