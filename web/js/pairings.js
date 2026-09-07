// Spijs-wijn regels. Werkt offline op de eigen collectie; de AI-sommelier (server) verfijnt dit met de hele kelder.
// Elk gerecht beschrijft welke wijntypes, druiven en stijlen goed passen. Score 0-100 per wijn.

export const DISHES = [
  { id: 'biefstuk', name: 'Biefstuk / rood vlees', group: 'Vlees', types: { rood: 1 }, body: ['medium', 'vol'], grapes: ['cabernet sauvignon', 'merlot', 'syrah', 'shiraz', 'malbec', 'tempranillo', 'sangiovese', 'nebbiolo', 'cabernet franc', 'carmenère', 'petit verdot'], keywords: ['biefstuk', 'rood vlees', 'steak', 'entrecote', 'rundvlees', 'ossenhaas'] },
  { id: 'lam', name: 'Lamsvlees', group: 'Vlees', types: { rood: 1 }, body: ['medium', 'vol'], grapes: ['cabernet sauvignon', 'syrah', 'shiraz', 'grenache', 'tempranillo', 'merlot', 'mourvèdre', 'sangiovese'], keywords: ['lam', 'lamsrack', 'lamsbout'] },
  { id: 'wild', name: 'Wild (hert, ree, wild zwijn)', group: 'Vlees', types: { rood: 1 }, body: ['medium', 'vol'], grapes: ['pinot noir', 'syrah', 'nebbiolo', 'sangiovese', 'grenache', 'mourvèdre', 'cabernet sauvignon', 'blaufränkisch'], keywords: ['wild', 'hert', 'ree', 'zwijn', 'fazant', 'eend'] },
  { id: 'varken', name: 'Varkensvlees / speenvarken', group: 'Vlees', types: { rood: 0.8, wit: 0.7, rose: 0.6 }, body: ['licht', 'medium'], grapes: ['pinot noir', 'gamay', 'grenache', 'riesling', 'chenin blanc', 'tempranillo', 'barbera'], keywords: ['varken', 'buikspek', 'procureur', 'spek'] },
  { id: 'kip', name: 'Kip & gevogelte', group: 'Vlees', types: { wit: 1, rood: 0.7, rose: 0.7, mousserend: 0.5 }, body: ['licht', 'medium'], grapes: ['chardonnay', 'pinot noir', 'viognier', 'chenin blanc', 'gamay', 'grenache', 'pinot blanc'], keywords: ['kip', 'gevogelte', 'kalkoen', 'parelhoen', 'poulet'] },
  { id: 'bbq', name: 'Barbecue & gegrild vlees', group: 'Vlees', types: { rood: 1, rose: 0.6 }, body: ['medium', 'vol'], grapes: ['zinfandel', 'primitivo', 'shiraz', 'syrah', 'malbec', 'grenache', 'merlot', 'monastrell', 'carmenère'], keywords: ['bbq', 'barbecue', 'gegrild', 'spareribs', 'burger'] },
  { id: 'stoof', name: 'Stoofpot / stamppot (Hollands)', group: 'Vlees', types: { rood: 1 }, body: ['medium', 'vol'], grapes: ['merlot', 'grenache', 'tempranillo', 'syrah', 'cabernet sauvignon', 'corvina', 'montepulciano'], keywords: ['stoof', 'stamppot', 'hachee', 'draadjesvlees', 'boerenkool', 'zuurkool', 'hutspot'] },
  { id: 'charcuterie', name: 'Charcuterie & borrelhapjes', group: 'Borrel', types: { rood: 0.8, rose: 0.9, mousserend: 0.9, wit: 0.7 }, body: ['licht', 'medium'], grapes: ['gamay', 'barbera', 'sangiovese', 'grenache', 'tempranillo', 'lambrusco', 'pinot noir', 'cinsault'], keywords: ['charcuterie', 'borrel', 'tapas', 'ham', 'salami', 'worst', 'antipasti'] },
  { id: 'aperitief', name: 'Aperitief', group: 'Borrel', types: { mousserend: 1, wit: 0.8, rose: 0.8, versterkt: 0.6 }, body: ['licht'], sweetness: ['droog', 'brut'], grapes: ['chardonnay', 'pinot noir', 'pinot meunier', 'glera', 'xarel·lo', 'macabeo', 'sauvignon blanc', 'albariño', 'picpoul'], keywords: ['aperitief', 'borrel', 'bubbels', 'toost', 'feest'] },
  { id: 'witvis', name: 'Witte vis (kabeljauw, zeebaars, tong)', group: 'Vis', types: { wit: 1, mousserend: 0.6 }, body: ['licht', 'medium'], grapes: ['sauvignon blanc', 'albariño', 'muscadet', 'melon de bourgogne', 'pinot grigio', 'pinot gris', 'verdejo', 'vermentino', 'chablis', 'chardonnay', 'grüner veltliner', 'picpoul'], keywords: ['vis', 'kabeljauw', 'zeebaars', 'tong', 'schol', 'witvis', 'wijting'] },
  { id: 'vettevis', name: 'Vette vis (zalm, tonijn, makreel)', group: 'Vis', types: { wit: 0.9, rose: 0.8, rood: 0.5 }, body: ['medium', 'vol'], grapes: ['chardonnay', 'pinot noir', 'viognier', 'pinot gris', 'riesling', 'gamay', 'rosé'], keywords: ['zalm', 'tonijn', 'makreel', 'forel', 'vette vis'] },
  { id: 'schaaldieren', name: 'Schaal- & schelpdieren, oesters', group: 'Vis', types: { wit: 1, mousserend: 0.9 }, body: ['licht'], sweetness: ['droog', 'brut'], grapes: ['muscadet', 'melon de bourgogne', 'chablis', 'chardonnay', 'albariño', 'sauvignon blanc', 'picpoul', 'riesling', 'assyrtiko', 'vermentino'], keywords: ['oester', 'garnaal', 'kreeft', 'mossel', 'schelpdier', 'coquille', 'krab', 'gamba'] },
  { id: 'sushi', name: 'Sushi & Japans', group: 'Wereldkeuken', types: { wit: 1, mousserend: 0.8, rose: 0.6 }, body: ['licht'], grapes: ['riesling', 'grüner veltliner', 'sauvignon blanc', 'chenin blanc', 'pinot blanc', 'albariño', 'champagne'], keywords: ['sushi', 'japans', 'sashimi', 'ramen'] },
  { id: 'aziatisch', name: 'Pittig Aziatisch (Thais, Indonesisch, Chinees)', group: 'Wereldkeuken', types: { wit: 1, rose: 0.7, mousserend: 0.6 }, body: ['licht', 'medium'], sweetness: ['halfdroog', 'halfzoet'], grapes: ['riesling', 'gewürztraminer', 'pinot gris', 'chenin blanc', 'torrontés', 'viognier', 'muscat'], keywords: ['thais', 'indonesisch', 'rijsttafel', 'chinees', 'wok', 'pittig', 'curry', 'nasi', 'bami', 'saté'] },
  { id: 'indiaas', name: 'Indiase curry', group: 'Wereldkeuken', types: { wit: 1, rose: 0.7, rood: 0.4 }, body: ['medium'], sweetness: ['halfdroog', 'halfzoet'], grapes: ['riesling', 'gewürztraminer', 'chenin blanc', 'viognier', 'grenache', 'zinfandel'], keywords: ['indiaas', 'curry', 'tikka', 'korma', 'masala'] },
  { id: 'mexicaans', name: 'Mexicaans / Tex-Mex', group: 'Wereldkeuken', types: { rood: 0.8, rose: 0.8, wit: 0.7 }, body: ['licht', 'medium'], grapes: ['zinfandel', 'malbec', 'tempranillo', 'sauvignon blanc', 'grüner veltliner', 'albariño', 'garnacha'], keywords: ['mexicaans', 'taco', 'burrito', 'chili', 'fajita'] },
  { id: 'pasta-tomaat', name: 'Pasta met tomatensaus / pizza', group: 'Italiaans', types: { rood: 1, rose: 0.6 }, body: ['licht', 'medium'], grapes: ['sangiovese', 'barbera', 'montepulciano', 'primitivo', 'nero d\'avola', 'chianti', 'negroamaro', 'aglianico'], keywords: ['pasta', 'tomaat', 'pizza', 'bolognese', 'lasagne', 'arrabbiata', 'italiaans'] },
  { id: 'pasta-room', name: 'Pasta met roomsaus / carbonara', group: 'Italiaans', types: { wit: 1, rood: 0.5 }, body: ['medium', 'vol'], grapes: ['chardonnay', 'pinot grigio', 'verdicchio', 'soave', 'garganega', 'fiano', 'viognier', 'pinot bianco'], keywords: ['roomsaus', 'carbonara', 'alfredo', 'kaassaus'] },
  { id: 'risotto', name: 'Risotto & paddenstoelen / truffel', group: 'Italiaans', types: { rood: 0.9, wit: 0.9 }, body: ['medium'], grapes: ['pinot noir', 'nebbiolo', 'barbera', 'chardonnay', 'dolcetto', 'sangiovese', 'arneis'], keywords: ['risotto', 'paddenstoel', 'champignon', 'truffel', 'porcini'] },
  { id: 'vega', name: 'Vegetarisch / groenten', group: 'Vegetarisch', types: { wit: 1, rose: 0.8, rood: 0.6, oranje: 0.8 }, body: ['licht', 'medium'], grapes: ['sauvignon blanc', 'grüner veltliner', 'pinot noir', 'gamay', 'vermentino', 'chenin blanc', 'cabernet franc', 'pinot blanc'], keywords: ['vegetarisch', 'groenten', 'vegan', 'salade', 'asperge', 'aubergine', 'courgette'] },
  { id: 'salade', name: 'Salade & lichte lunch', group: 'Vegetarisch', types: { wit: 1, rose: 1, mousserend: 0.6 }, body: ['licht'], grapes: ['sauvignon blanc', 'pinot grigio', 'vermentino', 'verdejo', 'grenache', 'cinsault', 'picpoul'], keywords: ['salade', 'lunch', 'licht', 'geitenkaas'] },
  { id: 'jongekaas', name: 'Jonge & zachte kazen (brie, camembert, jong belegen)', group: 'Kaas', types: { wit: 1, mousserend: 0.9, rood: 0.6 }, body: ['licht', 'medium'], grapes: ['chardonnay', 'chenin blanc', 'champagne', 'pinot noir', 'gamay', 'sauvignon blanc'], keywords: ['brie', 'camembert', 'jonge kaas', 'zachte kaas', 'mozzarella'] },
  { id: 'geitenkaas', name: 'Geitenkaas', group: 'Kaas', types: { wit: 1, rose: 0.6 }, body: ['licht'], grapes: ['sauvignon blanc', 'sancerre', 'pouilly-fumé', 'chenin blanc', 'vermentino'], keywords: ['geitenkaas', 'chèvre'] },
  { id: 'oudekaas', name: 'Gerijpte & harde kazen (oude kaas, comté, parmezaan)', group: 'Kaas', types: { rood: 1, versterkt: 0.8, wit: 0.6, port: 0.6 }, body: ['medium', 'vol'], grapes: ['cabernet sauvignon', 'tempranillo', 'nebbiolo', 'sangiovese', 'chardonnay', 'syrah', 'merlot', 'amarone', 'rioja'], keywords: ['oude kaas', 'comté', 'parmezaan', 'gruyère', 'manchego', 'harde kaas', 'gerijpt'] },
  { id: 'blauwekaas', name: 'Blauwe kaas (roquefort, stilton, gorgonzola)', group: 'Kaas', types: { port: 1, dessert: 1, versterkt: 0.7 }, body: ['vol'], sweetness: ['zoet'], grapes: ['sauternes', 'sémillon', 'touriga nacional', 'riesling', 'muscat', 'gewürztraminer'], keywords: ['blauwe kaas', 'roquefort', 'stilton', 'gorgonzola', 'blauwschimmel'] },
  { id: 'chocolade', name: 'Chocoladedessert', group: 'Dessert', types: { port: 1, dessert: 0.8, versterkt: 0.7, rood: 0.4 }, body: ['vol'], sweetness: ['zoet'], grapes: ['touriga nacional', 'banyuls', 'grenache', 'zinfandel', 'recioto', 'pedro ximénez', 'maury'], keywords: ['chocolade', 'brownie', 'mousse', 'dessert'] },
  { id: 'fruitdessert', name: 'Fruit- of roomdessert / taart', group: 'Dessert', types: { dessert: 1, mousserend: 0.7, port: 0.5 }, body: ['medium'], sweetness: ['zoet', 'halfzoet'], grapes: ['moscato', 'muscat', 'riesling', 'sémillon', 'sauternes', 'chenin blanc', 'tokaji', 'furmint', 'vin santo'], keywords: ['taart', 'fruit', 'appeltaart', 'crème brûlée', 'tiramisu', 'dessert', 'ijs'] },
  { id: 'kerst', name: 'Feestdiner (kalkoen, rollade, gourmet)', group: 'Vlees', types: { rood: 1, wit: 0.8, mousserend: 0.7 }, body: ['medium', 'vol'], grapes: ['pinot noir', 'chardonnay', 'merlot', 'syrah', 'cabernet sauvignon', 'champagne', 'grenache'], keywords: ['kerst', 'feest', 'kalkoen', 'rollade', 'gourmet', 'diner'] },
];

export const DISH_GROUPS = [...new Set(DISHES.map((d) => d.group))];

function norm(s) { return String(s || '').toLowerCase(); }

// Score hoe goed een wijn bij een gerecht past (0-100).
export function scoreWineForDish(wine, dish) {
  let score = 0;
  const typeWeight = dish.types[wine.type] || 0;
  if (!typeWeight) return 0;
  score += 45 * typeWeight;

  const grapes = (wine.grapes || []).map(norm);
  const grapeHit = grapes.some((g) => dish.grapes.some((dg) => g.includes(dg) || dg.includes(g)));
  const nameHit = dish.grapes.some((dg) => norm(wine.name).includes(dg) || norm(wine.region).includes(dg) || norm(wine.appellation).includes(dg));
  if (grapeHit) score += 30;
  else if (nameHit) score += 20;

  if (wine.body && dish.body.includes(norm(wine.body))) score += 10;
  if (dish.sweetness) {
    if (wine.sweetness && dish.sweetness.includes(norm(wine.sweetness))) score += 8;
    else if (wine.sweetness && dish.types.dessert && norm(wine.sweetness) === 'droog') score -= 20;
  } else if (wine.sweetness && ['zoet', 'halfzoet'].includes(norm(wine.sweetness)) && !dish.types.dessert && !dish.types.port) {
    score -= 15;
  }

  const pairings = (wine.food_pairings || []).map(norm);
  if (pairings.some((p) => dish.keywords.some((k) => p.includes(k)) || norm(dish.name).split(/[\s/&(),]+/).some((w) => w.length > 3 && p.includes(w)))) score += 15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function winesForDish(wines, dishId, { min = 45 } = {}) {
  const dish = DISHES.find((d) => d.id === dishId);
  if (!dish) return [];
  return wines
    .map((w) => ({ wine: w, score: scoreWineForDish(w, dish) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score);
}

export function dishesForWine(wine, { min = 45, limit = 8 } = {}) {
  return DISHES
    .map((d) => ({ dish: d, score: scoreWineForDish(wine, d) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Vrije tekst ("lamsrack met rozemarijn") → best passende gerechtcategorie.
export function matchDishText(text) {
  const t = norm(text);
  let best = null;
  for (const d of DISHES) {
    const hits = d.keywords.filter((k) => t.includes(k)).length;
    if (hits && (!best || hits > best.hits)) best = { dish: d, hits };
  }
  return best ? best.dish : null;
}
