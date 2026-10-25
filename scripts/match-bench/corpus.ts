/**
 * Synthetic but realistic test data for the box → order matchers.
 *
 * - An order list shaped like a Vine history: long keyword-stuffed Amazon titles,
 *   with look-alike clusters (same brand / different product, same product /
 *   different brand, colour and size variants) plus unnamed "Unknown item" rows.
 * - Sticker cases: what the X00 label prints (start of the title, often "…" and
 *   its end), run through an OCR-noise model built from real misreads
 *   ("clot", "protegtio", "protectjy", stray words off a patterned box), then
 *   through the app's own stickerWords().
 * - Lookup cases: the product name a UPC lookup returns (UPCitemdb style:
 *   brand + a few words, singular/plural and unit spellings that differ).
 * - Negatives: boxes that aren't on the list (often same brand or same kind of
 *   product) — a confident guess on one of these is the worst outcome.
 *
 * Everything is seeded, so runs are repeatable.
 */
import { stickerWords } from '@/lib/stickerOcr';

export interface Order {
  id: string;
  title: string | null;
}

export interface Case {
  kind: 'sticker' | 'lookup';
  /** What the matcher gets: sticker words, or the looked-up product name */
  input: string | null;
  /** The order this box really is; null for a box that isn't on the list */
  expectedId: string | null;
  /** The full title the box was made from (for reports) */
  source: string;
  /** Which look-alike cluster it's from, or 'filler' */
  group: string;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const chance = (r: Rand, p: number) => r() < p;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** Hand-written look-alike clusters, in Amazon's style. */
const CLUSTERS: Record<string, string[]> = {
  heater: [
    'Tankless Water Heater Electric 18kW 240V, On Demand Instant Hot Water Heater for Whole House, Self-Modulating with Digital Display and Overheat Protection (Gray)',
    'Tankless Water Heater Electric 11kW 240V, Point of Use On Demand Hot Water Heater Under Sink with Leakage Protection (White)',
    'Electric Tankless Water Heater 27kW 240V Whole House On Demand Instant Water Heater with LED Display, Energy Saving, Overheat Protection',
    'Water Heater Expansion Tank 2 Gallon for Tankless and Tank Water Heaters, Thermal Expansion Tank 3/4" NPT',
  ],
  brizled: [
    'Brizled Solar Pathway Lights Outdoor 4 Pack, Waterproof LED Path Lights for Walkway Yard Garden Landscape Lighting, Warm White',
    'Brizled House Numbers Sign Solar Powered, LED Lighted Address Plaque for Yard and Wall, Illuminated Modern Address Sign',
    'Brizled Christmas String Lights 66ft 200 LED, Plug in Fairy Lights with 8 Modes for Tree Wedding Party Decor, Warm White',
    'Brizled Outdoor String Lights 48ft, Shatterproof LED Patio Lights with 15 Edison Bulbs, Waterproof Hanging Lights for Backyard',
    'Brizled Solar Spot Lights Outdoor 2 Pack, Waterproof Landscape Spotlights for Yard Garden Driveway, Cool White',
  ],
  golf: [
    'Golf Target Cloth Hitting Practice Net Replacement Target for Driving Range, Indoor Outdoor Golf Training Aid',
    'Golf Hitting Net 10x7ft Practice Net with Target and Carry Bag, Backyard Driving Range for Indoor Outdoor Use',
    'Golf Putting Mat Indoor 10ft Putting Green with Auto Ball Return, Golf Training Aid for Home Office',
    'Golf Balls Practice Foam 24 Pack, Soft Indoor Training Golf Balls for Kids and Adults, Multicolor',
    'Golf Chipping Net Pop Up Target, Collapsible Golf Practice Net for Backyard Accuracy Training',
  ],
  phonecase: [
    'Spigen Tough Armor Designed for iPhone 15 Pro Max Case, Military Grade Drop Protection with Kickstand - Black',
    'Spigen Tough Armor Designed for iPhone 15 Pro Max Case, Military Grade Drop Protection with Kickstand - Gunmetal',
    'Spigen Liquid Air Armor Designed for iPhone 15 Pro Case, Slim Matte Black Shockproof Cover',
    'OtterBox Commuter Series Case for iPhone 15 Pro Max, Slim Drop Protection with Port Covers - Black',
    'ESR Classic Hybrid Case for iPhone 15 Pro Max, Compatible with MagSafe, Clear Shockproof Back Cover',
  ],
  cable: [
    'Anker USB C to USB C Cable 6ft 2 Pack, 100W Fast Charging Braided Cord for MacBook iPad Samsung Galaxy',
    'Anker USB C to USB C Cable 3ft 2 Pack, 60W Fast Charging Type C Cable for Samsung Galaxy Pixel',
    'Anker USB C to Lightning Cable 6ft MFi Certified, Powerline III Fast Charging Cord for iPhone 14 13 12',
    'Amazon Basics USB C to USB C Cable 10ft, 60W Fast Charging Nylon Braided Cord, Dark Gray',
    'Amazon Basics USB C to USB A Cable 6ft 2 Pack, USB 2.0 Fast Charging Cord for Android, Black',
  ],
  ledstrip: [
    'Govee LED Strip Lights 32.8ft, Smart WiFi RGB Light Strip Works with Alexa Google Assistant, Music Sync Color Changing',
    'Govee LED Strip Lights 65.6ft, Smart WiFi RGB Light Strip Works with Alexa Google Assistant, Music Sync Color Changing',
    'Govee LED Strip Lights 16.4ft, Bluetooth RGB Color Changing Strip with App Control and Music Sync for Bedroom',
    'Govee Outdoor String Lights 48ft, Smart RGBIC Patio Lights with 15 Dimmable Bulbs, WiFi App Control',
    'Govee Smart Light Bulbs, WiFi Bluetooth Color Changing Light Bulbs, Music Sync A19 RGBWW LED Bulbs 4 Pack',
  ],
  dog: [
    'rabbitgoo Dog Harness No Pull, Adjustable Reflective Pet Vest with Front Clip and Easy Control Handle, Large, Black',
    'rabbitgoo Dog Harness No Pull, Adjustable Reflective Pet Vest with Front Clip and Easy Control Handle, Medium, Blue',
    'rabbitgoo Retractable Dog Leash 16ft, Tangle Free Heavy Duty Walking Leash with Anti Slip Handle',
    'Bedsure Orthopedic Dog Bed for Large Dogs, Waterproof Egg Crate Foam Pet Bed with Removable Washable Cover, Grey',
    'Bedsure Calming Dog Bed for Small Dogs, Donut Washable Anti Anxiety Round Fluffy Plush Faux Fur Cat Bed, Taupe',
  ],
  kitchen: [
    'Silicone Spatula Set of 6, Heat Resistant Non Stick Rubber Spatulas for Cooking Baking and Mixing, Dishwasher Safe',
    'Silicone Baking Mat Set of 3, Non Stick Reusable Half Sheet Liners for Cookie Sheet Macaron Pastry',
    'Silicone Ice Cube Trays 4 Pack, Easy Release 14 Cube Trays with Lids for Freezer, Stackable BPA Free',
    'Silicone Stretch Lids 14 Pack, Reusable Durable Food Storage Covers for Bowls Cups Cans, Assorted Sizes',
    'Stainless Steel Mixing Bowls Set of 5 with Lids, Nesting Metal Bowls for Baking Prepping Serving',
  ],
  bottle: [
    'Owala FreeSip Insulated Stainless Steel Water Bottle with Straw, BPA-Free Sports Water Bottle, 24 oz, Denim',
    'Owala FreeSip Insulated Stainless Steel Water Bottle with Straw, BPA-Free Sports Water Bottle, 32 oz, Shy Marshmallow',
    'Stanley Quencher H2.0 FlowState Stainless Steel Vacuum Insulated Tumbler with Lid and Straw 40 oz, Cream',
    'Hydro Flask Wide Mouth Water Bottle with Flex Cap 32 oz, Stainless Steel Insulated, Pacific',
  ],
  storage: [
    'Fabric Storage Bins with Lids 3 Pack, Foldable Closet Organizer Boxes with Handles for Shelves, Large, Beige',
    'Fabric Storage Cubes 11 Inch 6 Pack, Collapsible Cube Storage Bins with Dual Handles for Cubby Shelf, Grey',
    'Clear Plastic Storage Bins with Lids 4 Pack, Stackable Pantry Organizer Containers for Kitchen Fridge',
    'Under Bed Storage Containers 2 Pack, Foldable Under Bed Organizer Bags with Clear Window and Zipper, 105L',
  ],
  bulbs: [
    'LED Light Bulbs 60 Watt Equivalent A19 Daylight 5000K, E26 Standard Base Non Dimmable, 16 Pack',
    'LED Light Bulbs 100 Watt Equivalent A19 Soft White 2700K, E26 Base Dimmable, 6 Pack',
    'LED Candelabra Bulbs 40 Watt Equivalent E12 Base, Warm White 2700K Chandelier Light Bulbs, 10 Pack',
  ],
  cleaner: [
    'BISSELL Little Green Multi-Purpose Portable Carpet and Upholstery Cleaner, Car and Auto Detailer, 3400F',
    'BISSELL CleanView Swivel Pet Upright Bagless Vacuum Cleaner with Tangle Free Brush Roll, 2252',
    'BISSELL Pet Stain and Odor Formula for Portable Carpet Cleaners, 32 oz, 2 Pack',
  ],
};

/** Boxes that aren't on the order list — mostly near-misses of the clusters. */
const STRAYS = [
  'Brizled Solar Fence Lights 6 Pack, Waterproof Outdoor Deck Lights for Railing Step Wall, Warm White',
  'Tankless Water Heater Descaling Kit with Pump and Hose, Flush Kit for Electric and Gas Heaters',
  'Golf Club Cleaning Brush with Retractable Clip, Groove Cleaner Tool for Irons Wedges',
  'Spigen Glass Screen Protector for iPhone 15 Pro Max, Tempered Glass 2 Pack',
  'Anker Power Bank 10000mAh Portable Charger, PowerCore Slim USB C Battery Pack for iPhone Samsung',
  'Govee Floor Lamp RGBIC Corner Lamp, Smart Standing LED Lamp with Music Sync and 16 Million Colors',
  'rabbitgoo Cat Harness and Leash Set for Walking, Escape Proof Adjustable Kitten Vest, Small',
  'Silicone Utensil Rest with Drip Pad, Heat Resistant Spoon Rest for Stove Top, Black',
  'Owala FreeSip Replacement Lid, Push Button Straw Lid Compatible with 24 oz and 32 oz Bottles',
  'Bamboo Drawer Organizer Expandable Utensil Tray for Kitchen Cutlery, 7 Slots',
  'Wireless Earbuds Bluetooth 5.3 Headphones with Charging Case, IPX7 Waterproof Sport Earphones, Black',
  'Electric Milk Frother Handheld Rechargeable Foam Maker for Lattes Cappuccino Hot Chocolate',
  'BISSELL Febreze Freshness Carpet Shampoo Formula 60 oz',
  'Fabric Drawer Organizer Set of 8, Foldable Closet Dresser Divider Bins for Underwear Socks, Grey',
];

// Filler: what the rest of a Vine history looks like
const BRANDS = [
  'Amazon Basics', 'AstroAI', 'Lenovo', 'Utopia Kitchen', 'Mighty Patch', 'Gorilla Grip', 'Bedsure', 'Hanes', 'Lasko',
  'Zulay', 'COSORI', 'TOZO', 'JBL', 'Etekcity', 'Vtopmart', 'mDesign', 'Simple Houseware', 'KOVOT', 'Upstreman', 'SAMEWAY',
  'HOMWE', 'Ninja', 'OXO', 'Pyrex', 'Rubbermaid', 'Scotch', 'Sharpie', 'BIC', 'Crayola', 'LEGO', 'Melissa & Doug',
  'Hamilton Beach', 'Mueller', 'Chefman', 'Kasa', 'TP-Link', 'Wyze', 'Ring', 'Blink', 'Eufy', 'Roku', 'SanDisk', 'Samsung',
  'Logitech', 'Razer', 'Corsair', 'UGREEN', 'Baseus', 'INIU', 'Miady', 'Belkin', 'Cable Matters', 'Syntech', 'JSAUX',
  'Trtl', 'Fitbit', 'Gaiam', 'BalanceFrom', 'Amazfit', 'CAP Barbell', 'Fit Simplify', 'Renpho', 'Theraband', 'Coleman',
  'Hydracy', 'Contigo', 'YETI', 'Thermos', 'Zojirushi', 'Brita', 'PUR', 'Waterdrop', 'Frigidaire', 'Honeywell', 'Levoit',
  'Dreo', 'Vornado', 'Shark', 'Eureka', 'iRobot', 'Swiffer', 'Clorox', 'Lysol', 'Mrs. Meyers', 'Method', 'Seventh Generation',
];
const PRODUCTS: { name: string; features: string[]; variants: string[] }[] = [
  { name: 'Wireless Mouse', features: ['2.4G USB Receiver', 'Silent Click', 'Ergonomic', 'Rechargeable', '1600 DPI', 'for Laptop PC Mac'], variants: ['Black', 'Grey', 'Pink', 'White'] },
  { name: 'Mechanical Keyboard', features: ['RGB Backlit', 'Blue Switches', 'Anti-Ghosting', 'Wired USB', '87 Keys Compact', 'for Gaming'], variants: ['Black', 'White'] },
  { name: 'Air Fryer', features: ['5.8 Quart', 'Nonstick Basket', 'Digital Touchscreen', '13 Presets', 'Dishwasher Safe', 'Oil Free'], variants: ['Black', 'Grey', 'White'] },
  { name: 'Electric Kettle', features: ['1.7 Liter', 'Stainless Steel', 'Auto Shut Off', 'Boil Dry Protection', 'Cordless', 'BPA Free'], variants: ['Silver', 'Black'] },
  { name: 'Yoga Mat', features: ['Non Slip', 'Extra Thick 1/2 Inch', 'Eco Friendly TPE', 'with Carrying Strap', 'for Home Workout Pilates'], variants: ['Purple', 'Blue', 'Black', 'Teal'] },
  { name: 'Resistance Bands Set', features: ['5 Levels', 'Exercise Bands', 'with Handles Door Anchor', 'for Strength Training', 'Physical Therapy'], variants: ['Multicolor'] },
  { name: 'Bluetooth Speaker', features: ['Portable Wireless', 'IPX7 Waterproof', '24H Playtime', 'Stereo Sound', 'Built in Mic'], variants: ['Black', 'Blue', 'Red'] },
  { name: 'Wireless Earbuds', features: ['Bluetooth 5.3', 'Noise Cancelling', 'Charging Case', '40H Playtime', 'IPX5 Waterproof'], variants: ['Black', 'White'] },
  { name: 'Phone Charger Block', features: ['20W USB C', 'Fast Charging', 'Wall Plug Adapter', '2 Pack', 'for iPhone 15 14'], variants: ['White'] },
  { name: 'Portable Charger', features: ['10000mAh', 'USB C Power Bank', 'Slim Battery Pack', 'LED Display', 'for iPhone Samsung'], variants: ['Black', 'Blue'] },
  { name: 'HDMI Cable', features: ['8K 48Gbps', 'High Speed', '6.6ft', 'Braided', 'for PS5 Xbox TV'], variants: ['Black'] },
  { name: 'Shower Curtain', features: ['Waterproof Fabric', 'Hotel Style', '72x72 Inch', 'with 12 Hooks', 'Machine Washable'], variants: ['White', 'Grey', 'Beige'] },
  { name: 'Bed Sheets Set', features: ['Queen Size', '4 Piece', 'Microfiber', 'Deep Pocket', 'Soft Breathable', 'Wrinkle Free'], variants: ['White', 'Grey', 'Navy', 'Sage Green'] },
  { name: 'Throw Pillow Covers', features: ['18x18 Inch', 'Set of 4', 'Soft Velvet', 'Decorative Square', 'for Couch Sofa Bed'], variants: ['Cream', 'Green', 'Rust', 'Navy'] },
  { name: 'Blackout Curtains', features: ['84 Inch Long', '2 Panels', 'Thermal Insulated', 'Grommet Top', 'Room Darkening'], variants: ['Black', 'Grey', 'Navy'] },
  { name: 'Desk Lamp', features: ['LED', 'Dimmable', 'Eye Caring', 'USB Charging Port', '5 Color Modes', 'Touch Control'], variants: ['Black', 'White'] },
  { name: 'Security Camera', features: ['Indoor 2K', 'WiFi', 'Pan Tilt', 'Night Vision', 'Two Way Audio', 'Motion Detection'], variants: ['White'] },
  { name: 'Smart Plug', features: ['WiFi Outlet', 'Works with Alexa Google Home', 'No Hub Required', '4 Pack', 'Timer'], variants: ['White'] },
  { name: 'Car Phone Mount', features: ['Dashboard Windshield Vent', 'Magnetic', '360 Rotation', 'Strong Suction', 'for All Phones'], variants: ['Black'] },
  { name: 'Tire Inflator', features: ['Portable Air Compressor', '150 PSI', 'Digital Pressure Gauge', '12V DC', 'LED Light'], variants: ['Black'] },
  { name: 'Humidifier', features: ['Cool Mist', '4L', 'Quiet Ultrasonic', 'for Bedroom', 'Auto Shut Off', 'Essential Oil Tray'], variants: ['White'] },
  { name: 'Tower Fan', features: ['42 Inch', 'Oscillating', 'Remote Control', '3 Speeds', '12H Timer', 'Quiet'], variants: ['Black', 'White'] },
  { name: 'Water Filter Pitcher', features: ['10 Cup', 'with 1 Filter', 'BPA Free', 'Reduces Chlorine', 'Fridge Fit'], variants: ['White', 'Blue'] },
  { name: 'Cutting Board Set', features: ['Bamboo', '3 Piece', 'with Juice Groove', 'Heavy Duty', 'Kitchen Chopping Boards'], variants: ['Natural'] },
  { name: 'Knife Set', features: ['15 Piece', 'German Stainless Steel', 'with Block', 'Built in Sharpener', 'Ultra Sharp'], variants: ['Black', 'Silver'] },
  { name: 'Food Storage Containers', features: ['Glass', '18 Piece', 'with Snap Lids', 'Airtight', 'Meal Prep', 'Microwave Safe'], variants: ['Clear'] },
  { name: 'Toilet Paper Holder', features: ['Free Standing', 'with Storage Shelf', 'Stainless Steel', 'for Bathroom'], variants: ['Black', 'Chrome', 'Gold'] },
  { name: 'Shoe Rack', features: ['10 Tier', 'Tall Narrow', 'Stackable', 'Metal', 'for Entryway Closet'], variants: ['Black', 'White'] },
  { name: 'Laundry Basket', features: ['Collapsible', '75L', 'with Handles', 'Large Hamper', 'Waterproof'], variants: ['Grey', 'Beige'] },
  { name: 'Hangers', features: ['Velvet', '50 Pack', 'Non Slip', 'Space Saving', 'Heavy Duty', 'Ultra Thin'], variants: ['Black', 'Grey', 'Pink'] },
  { name: 'Kids Building Blocks', features: ['1000 Pieces', 'Classic Bricks', 'Creative Set', 'STEM Toy', 'for Ages 4+'], variants: ['Multicolor'] },
  { name: 'Coloring Markers', features: ['Washable', '40 Count', 'Fine Tip', 'for Kids', 'Non Toxic'], variants: ['Assorted'] },
  { name: 'Backpack', features: ['Travel Laptop', 'Water Resistant', 'USB Charging Port', 'Fits 15.6 Inch', 'Anti Theft'], variants: ['Black', 'Grey', 'Navy'] },
  { name: 'Hiking Socks', features: ['Merino Wool', '3 Pairs', 'Cushioned', 'Moisture Wicking', 'Crew'], variants: ['Grey', 'Black'] },
  { name: 'Rain Jacket', features: ['Waterproof', 'Lightweight', 'Hooded', 'Packable', 'Windbreaker'], variants: ['Black', 'Navy', 'Olive'] },
  { name: 'Massage Gun', features: ['Deep Tissue', 'Percussion Muscle Massager', '30 Speeds', '10 Heads', 'Quiet'], variants: ['Black', 'Grey'] },
  { name: 'Digital Bathroom Scale', features: ['Smart Body Fat', 'Bluetooth', 'BMI', '13 Body Composition', 'App'], variants: ['Black', 'White'] },
  { name: 'Electric Toothbrush', features: ['Rechargeable', 'Sonic', '5 Modes', '8 Brush Heads', '2 Min Timer'], variants: ['Black', 'White', 'Pink'] },
  { name: 'Hair Dryer', features: ['Ionic', '1875W', 'with Diffuser', 'Fast Drying', 'Lightweight'], variants: ['Black', 'Rose Gold'] },
  { name: 'Makeup Brush Set', features: ['16 Pcs', 'Premium Synthetic', 'Foundation Powder Blush', 'with Case'], variants: ['Black', 'Pink'] },
  { name: 'Pimple Patches', features: ['Hydrocolloid', '72 Count', 'Acne Spot Treatment', 'Invisible'], variants: ['Clear'] },
  { name: 'Mop', features: ['Microfiber Spray', 'with 3 Reusable Pads', 'Floor Cleaning', '360 Rotating'], variants: ['Blue', 'Grey'] },
  { name: 'Trash Can', features: ['13 Gallon', 'Stainless Steel', 'Motion Sensor', 'Touchless', 'with Lid'], variants: ['Silver', 'Black'] },
  { name: 'Garden Hose', features: ['50ft', 'Expandable', 'Leak Proof', 'with 10 Function Nozzle', 'Lightweight'], variants: ['Green', 'Blue'] },
  { name: 'Camping Lantern', features: ['LED', 'Rechargeable', 'Portable', 'Waterproof', 'for Hurricane Power Outage'], variants: ['Black', 'Green'] },
  { name: 'Ring Light', features: ['10 Inch', 'with Tripod Stand', 'Phone Holder', 'Dimmable', 'for Video Selfie'], variants: ['Black'] },
  { name: 'Microphone', features: ['USB Condenser', 'for PC Gaming Streaming', 'Podcast', 'Plug and Play', 'with Stand'], variants: ['Black'] },
  { name: 'Monitor Stand Riser', features: ['Metal', 'with Drawer', 'Desk Organizer', 'Ventilated', 'for Laptop Computer'], variants: ['Black', 'White'] },
  { name: 'Label Maker', features: ['Bluetooth', 'Portable', 'Thermal', 'with Tape', 'for Home Office Organization'], variants: ['White', 'Blue'] },
  { name: 'Packing Tape', features: ['6 Rolls', '1.88 Inch x 60 Yards', 'Heavy Duty', 'Clear', 'for Moving Shipping'], variants: ['Clear'] },
];

const SYNONYMS: Record<string, string[]> = {
  lights: ['light'], light: ['lights', 'lamp'], pack: ['pk', 'count', 'pcs'], inch: ['in', '"'], waterproof: ['water resistant'],
  bottle: ['bottles'], bins: ['bin'], containers: ['container'], trays: ['tray'], case: ['cover'], cable: ['cord'],
  cord: ['cable'], bulbs: ['bulb'], stainless: ['ss'], set: ['kit'], outdoor: ['outdoors'], heater: ['heaters'], mat: ['mats'],
};

const BOX_WORDS = [
  'this', 'side', 'up', 'fragile', 'keep', 'dry', 'handle', 'care', 'premium', 'quality', 'warning', 'choking', 'hazard',
  'small', 'parts', 'designed', 'california', 'assembled', 'model', 'serial', 'batch', 'contents', 'instructions', 'inside',
  'recycle', 'please', 'thank', 'you', 'easy', 'install', 'upgraded', 'version', 'gift', 'ideal', 'home', 'office', 'black',
  'white', 'garden', 'outdoor', 'light', 'pack', 'kitchen', 'water',
];

/** OCR misreads seen on photographed stickers */
const CONFUSE: Record<string, string[]> = {
  c: ['e', 'g', 'o'], e: ['c', 'o'], o: ['a', 'e', '0'], a: ['o', 'e'], l: ['i', '1', 't'], i: ['l', 'j', '1'], t: ['f', 'l'],
  n: ['h', 'r', 'm'], m: ['rn', 'n'], h: ['b', 'n'], u: ['v', 'o'], r: ['n', 'f'], g: ['q', 'c', '9'], s: ['5', 'e'], b: ['h', '6'],
  y: ['v'], d: ['a', 'cl'], f: ['t'], p: ['o'], w: ['vv'], k: ['h'],
};

function ocrNoise(r: Rand, text: string, level: number): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const lower = ch.toLowerCase();
    if (CONFUSE[lower] && chance(r, 0.035 * level)) out += pick(r, CONFUSE[lower]);
    else if (/[a-z]/i.test(ch) && chance(r, 0.008 * level)) continue; // dropped letter
    else if (ch === ' ' && chance(r, 0.05 * level)) continue; // two words run together
    else out += ch;
  }
  return out;
}

/** What Amazon prints on the X00 label: the title's start, often "…" and its end. */
function labelText(r: Rand, title: string): string {
  const roll = r();
  if (roll < 0.5 && title.length > 50) {
    const head = title.slice(0, int(r, 20, 30));
    const tail = title.slice(title.length - int(r, 14, 24));
    return `${head}...${tail}`;
  }
  if (roll < 0.85) return title.slice(0, int(r, 14, 38));
  // Only the second line came out
  return title.slice(title.length - int(r, 16, 30));
}

function stickerCode(r: Rand): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  return 'X00' + Array.from({ length: 7 }, () => pick(r, chars)).join('');
}

/** Simulated OCR output for one sticker scan → the words the app would pass to the matcher. */
export function simulateSticker(r: Rand, title: string): string | null {
  const code = stickerCode(r);
  const level = pick(r, [0.5, 1, 1, 1.5, 2.5]);
  const parts = [ocrNoise(r, labelText(r, title), level)];
  if (chance(r, 0.5)) parts.unshift(ocrNoise(r, code, level));
  if (chance(r, 0.4)) parts.push('New');
  if (chance(r, 0.3)) parts.push('MADE IN CHINA');
  if (chance(r, 0.4)) parts.push(pick(r, ['lll', 'tgg', 'IIIl', 'tsh', 'wnm', 'iii']));
  // The whole-frame read picks up print on the box around the sticker
  const strays = chance(r, 0.45) ? int(r, 1, chance(r, 0.3) ? 6 : 3) : 0;
  for (let i = 0; i < strays; i++) parts.push(pick(r, BOX_WORDS));
  const words = stickerWords(parts.join('\n'), code);
  return words.length >= 2 ? words.join(' ') : null;
}

const STOP = new Set(['for', 'and', 'with', 'the', 'of', 'to', 'in', 'a', 'on', 'by']);

/** The product name a UPC lookup (UPCitemdb / Open Food Facts) would return. */
export function simulateLookup(r: Rand, title: string, brand: string | null): string {
  const words = title
    .replace(/[(),]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()) && w !== '-');
  const brandWords = brand ? brand.split(' ').length : 0;
  const body = words.slice(brandWords);
  // UPC databases keep the start of the name, plus the odd spec from further on
  const keep = body.slice(0, int(r, 3, 7));
  const later = body.slice(keep.length);
  for (let i = int(r, 0, 2); i > 0 && later.length; i--) keep.push(later.splice(Math.floor(r() * later.length), 1)[0]);
  let out = keep.map((w) => {
    const syn = SYNONYMS[w.toLowerCase()];
    return syn && chance(r, 0.3) ? pick(r, syn) : w;
  });
  if (chance(r, 0.25)) out = out.map((w) => w.replace(/-/g, ' '));
  if (chance(r, 0.2)) out.push(pick(r, ['New', 'Model', `${pick(r, ['BZ', 'HX', 'TS', 'A'])}-${int(r, 100, 9999)}`]));
  if (brand && chance(r, 0.85)) out.unshift(chance(r, 0.2) ? brand.toUpperCase() : brand);
  const name = out.join(' ');
  return chance(r, 0.15) ? name.toUpperCase() : name;
}

function brandOf(title: string): string | null {
  return BRANDS.find((b) => title.startsWith(b + ' ')) ?? ['Brizled', 'Spigen', 'OtterBox', 'ESR', 'Anker', 'Amazon Basics', 'Govee', 'rabbitgoo', 'Bedsure', 'Owala', 'Stanley', 'Hydro Flask', 'BISSELL'].find((b) => title.startsWith(b + ' ')) ?? null;
}

/** Brand + product, e.g. "Lasko|Tower Fan" — two orders with the same one are the same thing to a reader */
const fillerKey = (t: string) => {
  const p = PRODUCTS.find((x) => t.includes(` ${x.name} `));
  return p ? `${t.slice(0, t.indexOf(` ${p.name} `))}|${p.name}` : t;
};

function fillerTitle(r: Rand): string {
  const p = pick(r, PRODUCTS);
  const feats = [...p.features].sort(() => r() - 0.5).slice(0, int(r, 2, Math.min(5, p.features.length)));
  const head = `${pick(r, BRANDS)} ${p.name}`;
  const mid = feats.slice(0, 2).join(' ');
  const rest = feats.slice(2).join(', ');
  return `${head} ${mid}${rest ? `, ${rest}` : ''}, ${pick(r, p.variants)}`;
}

export interface Corpus {
  orders: Order[];
  cases: Case[];
}

export function buildCorpus(seed = 1, size = 1500): Corpus {
  const r = rng(seed);
  const orders: Order[] = [];
  const groupOf = new Map<string, string>();
  let n = 0;
  const add = (title: string | null, group: string) => {
    const id = `o${++n}`;
    orders.push({ id, title });
    groupOf.set(id, group);
    return id;
  };
  for (const [group, titles] of Object.entries(CLUSTERS)) for (const t of titles) add(t, group);
  const seen = new Set(orders.map((o) => o.title));
  while (orders.length < size) {
    const t = fillerTitle(r);
    if (seen.has(t)) continue;
    seen.add(t);
    add(t, 'filler');
  }
  // Lattice rows that came without a name
  for (let i = 0; i < size * 0.2; i++) add(`Unknown item (B0${Math.floor(r() * 1e8).toString(36).toUpperCase()})`, 'unknown');

  const cases: Case[] = [];
  const named = orders.filter((o) => o.title && !o.title.startsWith('Unknown item ('));
  const clustered = named.filter((o) => groupOf.get(o.id) !== 'filler');
  const filler = named.filter((o) => groupOf.get(o.id) === 'filler');
  const keys = new Set(named.map((o) => fillerKey(o.title!)));
  const strays = [...STRAYS, ...Array.from({ length: 80 }, () => fillerTitle(r)).filter((t) => !keys.has(fillerKey(t))).slice(0, 40)];

  const makeCases = (kind: Case['kind'], perCluster: number, fillerCount: number, strayCount: number) => {
    const make = (title: string, expectedId: string | null, group: string) =>
      cases.push({
        kind,
        input: kind === 'sticker' ? simulateSticker(r, title) : simulateLookup(r, title, brandOf(title)),
        expectedId,
        source: title,
        group,
      });
    for (const o of clustered) for (let i = 0; i < perCluster; i++) make(o.title!, o.id, groupOf.get(o.id)!);
    for (let i = 0; i < fillerCount; i++) {
      const o = pick(r, filler);
      make(o.title!, o.id, 'filler');
    }
    for (let i = 0; i < strayCount; i++) make(pick(r, strays), null, 'stray');
  };
  makeCases('sticker', 6, 300, 120);
  makeCases('lookup', 4, 300, 120);
  return { orders, cases };
}
