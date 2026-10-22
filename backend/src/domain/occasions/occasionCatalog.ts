import type { Motif, Theme } from '../../contracts';

/** Colour / font / pattern presets shared by related occasions. */
export const THEME_PRESETS = {
  festive: {
    primary: '#8B1E2D', onPrimary: '#FFF8E7', secondary: '#F2B705', accent: '#E8590C',
    background: '#FFF7EA', surface: '#FFFFFF', text: '#2B1710', mutedText: '#6E5646',
    headingFont: 'playfair', pattern: 'rangoli', corners: 'soft', motif: 'auto',
  },
  romance: {
    primary: '#C2185B', onPrimary: '#FFFFFF', secondary: '#FF8FB1', accent: '#E53935',
    background: '#FFF1F5', surface: '#FFFFFF', text: '#3A0D1E', mutedText: '#7A4A5C',
    headingFont: 'playfair', pattern: 'hearts', corners: 'round', motif: 'auto',
  },
  holi: {
    primary: '#B5179E', onPrimary: '#FFFFFF', secondary: '#FFD60A', accent: '#06D6A0',
    background: '#FFF9F0', surface: '#FFFFFF', text: '#231942', mutedText: '#5E548E',
    headingFont: 'kalam', pattern: 'dots', corners: 'round', motif: 'auto',
  },
  winter: {
    primary: '#B71C1C', onPrimary: '#FFFFFF', secondary: '#1B5E20', accent: '#FBC02D',
    background: '#F7FAF8', surface: '#FFFFFF', text: '#1C2826', mutedText: '#55625F',
    headingFont: 'playfair', pattern: 'snow', corners: 'soft', motif: 'auto',
  },
  celebration: {
    primary: '#5B2A86', onPrimary: '#FFFFFF', secondary: '#FFB703', accent: '#FB5607',
    background: '#FBF7FF', surface: '#FFFFFF', text: '#21123A', mutedText: '#61537A',
    headingFont: 'poppins', pattern: 'sparkle', corners: 'round', motif: 'auto',
  },
  elegant: {
    primary: '#5C2A47', onPrimary: '#FFF9F2', secondary: '#C9A227', accent: '#A4508B',
    background: '#FCF8F3', surface: '#FFFFFF', text: '#2A1622', mutedText: '#6F5966',
    headingFont: 'playfair', pattern: 'none', corners: 'soft', motif: 'auto',
  },
  family: {
    primary: '#1E5F74', onPrimary: '#FFFFFF', secondary: '#F6AE2D', accent: '#F26419',
    background: '#F6FAFB', surface: '#FFFFFF', text: '#13293D', mutedText: '#4F6272',
    headingFont: 'poppins', pattern: 'dots', corners: 'soft', motif: 'auto',
  },
  harvest: {
    primary: '#B45309', onPrimary: '#FFFFFF', secondary: '#65A30D', accent: '#EAB308',
    background: '#FFFBEB', surface: '#FFFFFF', text: '#2D1B05', mutedText: '#6B5537',
    headingFont: 'kalam', pattern: 'rangoli', corners: 'soft', motif: 'auto',
  },
  patriotic: {
    primary: '#0B3D91', onPrimary: '#FFFFFF', secondary: '#FF9933', accent: '#138808',
    background: '#F8FAFF', surface: '#FFFFFF', text: '#0F1A33', mutedText: '#4B5671',
    headingFont: 'poppins', pattern: 'none', corners: 'soft', motif: 'auto',
  },
  brand: {
    primary: '#1F2937', onPrimary: '#FFFFFF', secondary: '#8CC63F', accent: '#F59E0B',
    background: '#F7F7F5', surface: '#FFFFFF', text: '#111827', mutedText: '#4B5563',
    headingFont: 'poppins', pattern: 'none', corners: 'soft', motif: 'auto',
  },
} as const satisfies Record<string, Omit<Theme, 'backgroundImage' | 'backgroundFit'>>;

export type ThemePreset = keyof typeof THEME_PRESETS;

export interface OccasionSeed {
  slug: string;
  name: string;
  /** Short name used inside generated copy: "This {Diwali}, ..." */
  shortName: string;
  preset: ThemePreset;
  /** Who people typically gift for this occasion — used in template copy. */
  recipients: string;
  emoji: string;
  /** Illustration set for the page's built-in artwork. */
  motif: Motif;
}

const seed = (
  slug: string,
  name: string,
  shortName: string,
  preset: ThemePreset,
  recipients: string,
  emoji: string,
  motif: Motif,
): OccasionSeed => ({ slug, name, shortName, preset, recipients, emoji, motif });

/** Every occasion listed on gyftr.com/occasion/*, in menu order. */
export const OCCASIONS: readonly OccasionSeed[] = [
  seed('birthday-gift-cards', 'Birthday Gift Cards', 'birthday', 'celebration', 'friends and family', '🎂', 'cake'),
  seed('gift-vouchers', 'Gift Vouchers', 'every occasion', 'brand', 'everyone you care about', '🎁', 'gift'),
  seed('womens-day-gift-cards', "Women's Day Gift Cards", "Women's Day", 'elegant', 'the women who inspire you', '💐', 'flowers'),
  seed('gift-cards', 'Gift Cards', 'every occasion', 'brand', 'everyone you care about', '🎁', 'gift'),
  seed('holi-gift-ideas', 'Holi Gift Cards', 'Holi', 'holi', 'friends and family', '🎨', 'colors'),
  seed('wedding-gift-cards', 'Wedding Gift Cards', 'the wedding', 'elegant', 'the happy couple', '💍', 'rings'),
  seed('anniversary-gift-cards', 'Anniversary Gift Cards', 'your anniversary', 'elegant', 'your partner', '💞', 'rings'),
  seed('valentines-day-gifts', "Valentine's Day Gift Cards", "Valentine's Day", 'romance', 'your valentine', '❤️', 'hearts'),
  seed('diwali-gift-cards', 'Diwali Gift Cards', 'Diwali', 'festive', 'family, friends and colleagues', '🪔', 'diya'),
  seed('thank-you-gift-cards', 'Thank You Gift Cards', 'every thank-you', 'family', 'the people who helped you', '🙏', 'flowers'),
  seed('rakshabandhan-gift-cards', 'Rakshabandhan Gift Cards', 'Rakshabandhan', 'festive', 'your siblings', '🧵', 'rakhi'),
  seed('new-year-gift-cards', 'New Year Gift Cards', 'the New Year', 'celebration', 'friends, family and colleagues', '🎆', 'fireworks'),
  seed('mothers-day-gift-cards', "Mother's Day Gift Cards", "Mother's Day", 'romance', 'your mother', '🌷', 'flowers'),
  seed('fathers-day-gift-cards', "Father's Day Gift Cards", "Father's Day", 'family', 'your father', '👔', 'gift'),
  seed('christmas-gift-cards', 'Christmas Gift Cards', 'Christmas', 'winter', 'friends and family', '🎄', 'tree'),
  seed('gift-for-her', 'Gifts for Her', 'her special day', 'romance', 'the women in your life', '👗', 'rose'),
  seed('gift-for-him', 'Gifts for Him', 'his special day', 'family', 'the men in your life', '⌚', 'gift'),
  seed('friendship-day-gift-cards', 'Friendship Day Gift Cards', 'Friendship Day', 'celebration', 'your friends', '🤝', 'balloons'),
  seed('dussehra-gift-cards', 'Dussehra Gift Cards', 'Dussehra', 'festive', 'family and friends', '🏹', 'fireworks'),
  seed('baisakhi-gift-cards', 'Baisakhi Gift Cards', 'Baisakhi', 'harvest', 'family and friends', '🌾', 'sun'),
  seed('bhai-dooj-gift-cards', 'Bhai Dooj Gift Cards', 'Bhai Dooj', 'festive', 'your siblings', '🪔', 'diya'),
  seed('dhanteras-gift-cards', 'Dhanteras Gift Cards', 'Dhanteras', 'festive', 'family and loved ones', '🪙', 'diya'),
  seed('easter-gift-cards', 'Easter Gift Cards', 'Easter', 'holi', 'friends and family', '🐣', 'flowers'),
  seed('eid-gift-cards', 'Eid Gift Cards', 'Eid', 'elegant', 'family and friends', '🌙', 'moon'),
  seed('karwa-chauth-gift-cards', 'Karwa Chauth Gift Cards', 'Karwa Chauth', 'romance', 'your spouse', '🌕', 'moon'),
  seed('makar-sankranti-gift-cards', 'Makar Sankranti Gift Cards', 'Makar Sankranti', 'harvest', 'family and friends', '🪁', 'kite'),
  seed('navratri-gift-cards', 'Navratri Gift Cards', 'Navratri', 'festive', 'family and friends', '💃', 'diya'),
  seed('pongal-gift-cards', 'Pongal Gift Cards', 'Pongal', 'harvest', 'family and friends', '🍚', 'sun'),
  seed('kiss-day-gifts', 'Kiss Day Gift Cards', 'Kiss Day', 'romance', 'your partner', '💋', 'hearts'),
  seed('rose-day-gifts', 'Rose Day Gift Cards', 'Rose Day', 'romance', 'your partner', '🌹', 'rose'),
  seed('propose-day-gifts', 'Propose Day Gift Cards', 'Propose Day', 'romance', 'the one you love', '💍', 'rings'),
  seed('chocolate-day-gifts', 'Chocolate Day Gift Cards', 'Chocolate Day', 'romance', 'your sweetheart', '🍫', 'chocolate'),
  seed('teddy-day-gifts', 'Teddy Day Gift Cards', 'Teddy Day', 'romance', 'your partner', '🧸', 'teddy'),
  seed('promise-day-gifts', 'Promise Day Gift Cards', 'Promise Day', 'romance', 'your partner', '🤞', 'hearts'),
  seed('hug-day-gifts', 'Hug Day Gift Cards', 'Hug Day', 'romance', 'your partner', '🤗', 'hearts'),
  seed('republic-day-gifts', 'Republic Day Gift Cards', 'Republic Day', 'patriotic', 'friends, family and colleagues', '🇮🇳', 'tricolor'),
  seed('teachers-day-gift-card', "Teachers' Day Gift Cards", "Teachers' Day", 'family', 'your teachers', '📚', 'books'),
];

export function findOccasionSeed(slug: string): OccasionSeed | undefined {
  return OCCASIONS.find((o) => o.slug === slug);
}
