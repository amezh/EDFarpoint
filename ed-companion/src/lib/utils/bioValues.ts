// Vista Genomics bio species values (base reward in credits)
// Source: BioScan curated rules, cross-referenced with Canonn codex prices
const BIO_VALUES: Record<string, number> = {
  "Fonticulua Fluctus": 20000000,
  "Fonticulua Segmentatus": 19010800,
  "Stratum Tectonicas": 19010800,
  "Tussock Stigmasis": 19010800,
  "Concha Biconcavis": 19010800,
  "Cactoida Vermis": 16202800,
  "Clypeus Speculumi": 16202800,
  "Fumerola Extremus": 16202800,
  "Recepta Deltahedronix": 16202800,
  "Stratum Cucumisis": 16202800,
  "Recepta Conditivus": 14313700,
  "Tussock Virgam": 14313700,
  "Aleoida Gravis": 12934900,
  "Osseus Discus": 12934900,
  "Recepta Umbrux": 12934900,
  "Clypeus Margaritus": 11873200,
  "Tubus Cavas": 11873200,
  "Frutexa Flammasis": 10326000,
  "Osseus Pellebantus": 9739000,
  "Bacterium Informem": 8418000,
  "Clypeus Lacrimam": 8418000,
  "Bacterium Volu": 7774700,
  "Concha Aureolas": 7774700,
  "Frutexa Acus": 7774700,
  "Tubus Compagibus": 7774700,
  "Tussock Triticum": 7774700,
  "Fumerola Nitris": 7500900,
  "Aleoida Arcus": 7252500,
  "Tussock Capillum": 7025800,
  "Aleoida Coronamus": 6284600,
  "Electricae Pluma": 6284600,
  "Electricae Radialem": 6284600,
  "Fumerola Aquatis": 6284600,
  "Fumerola Carbosis": 6284600,
  "Frutexa Sponsae": 5988000,
  "Tussock Pennata": 5853800,
  "Fonticulua Upupam": 5727600,
  "Tubus Sororibus": 5727600,
  "Bacterium Nebulus": 5289900,
  "Bacterium Scopulum": 4934500,
  "Bacterium Omentum": 4638900,
  "Concha Renibus": 4572400,
  "Tussock Serrati": 4447100,
  "Osseus Fractus": 4027800,
  "Bacterium Verrata": 3897000,
  "Fungoida Bullarum": 3703200,
  "Cactoida Cortexum": 3667600,
  "Cactoida Pullulanta": 3667600,
  "Tussock Caputus": 3472400,
  "Aleoida Laminiae": 3385200,
  "Aleoida Spica": 3385200,
  "Fungoida Gelata": 3330300,
  "Tussock Albata": 3252500,
  "Tussock Ventusa": 3227700,
  "Osseus Pumice": 3156300,
  "Fonticulua Lapida": 3111000,
  "Stratum Laminamus": 2788300,
  "Fungoida Stabitis": 2680300,
  "Stratum Frigus": 2637500,
  "Tubus Rosarium": 2637500,
  "Cactoida Lapis": 2483600,
  "Cactoida Peperatis": 2483600,
  "Stratum Araneamus": 2448900,
  "Stratum Excutitus": 2448900,
  "Tubus Conifer": 2415500,
  "Osseus Spiralis": 2404700,
  "Concha Labiata": 2352400,
  "Bacterium Tela": 1949000,
  "Tussock Ignis": 1849000,
  "Frutexa Flabellum": 1808900,
  "Fonticulua Digitos": 1804100,
  "Tussock Catena": 1766600,
  "Tussock Cultro": 1766600,
  "Tussock Divisa": 1766600,
  "Bacterium Cerbrus": 1689800,
  "Fungoida Setisis": 1670100,
  "Bacterium Alcyoneum": 1658500,
  "Frutexa Collum": 1639800,
  "Frutexa Fera": 1632500,
  "Frutexa Metallicum": 1632500,
  "Osseus Cornibus": 1483000,
  "Stratum Limaxus": 1362000,
  "Stratum Paleas": 1362000,
  "Bacterium Bullaris": 1152500,
  "Bacterium Acies": 1000000,
  "Bacterium Aurasus": 1000000,
  "Bacterium Vesicula": 1000000,
  "Fonticulua Campestris": 1000000,
  "Tussock Pennatis": 1000000,
  "Tussock Propagito": 1000000,
  // Non-landable / rare species
  "Amphora Plant": 1628800,
  "Bark Mound": 1471900,
  "Brain Tree": 1593700,
  "Sinuous Tuber": 1514500,
  "Anemone": 1499900,
};

/**
 * Look up the Vista Genomics base value for a species.
 * Accepts either the localised name ("Stratum Tectonicas")
 * or partial matches.
 */
export function getSpeciesValue(speciesLocalised: string): number {
  // Direct match
  if (BIO_VALUES[speciesLocalised]) return BIO_VALUES[speciesLocalised];

  // Try matching without variant suffix (e.g. "Stratum Tectonicas - Green" → "Stratum Tectonicas")
  const dashIdx = speciesLocalised.indexOf(" - ");
  if (dashIdx > 0) {
    const base = speciesLocalised.substring(0, dashIdx);
    if (BIO_VALUES[base]) return BIO_VALUES[base];
  }

  console.warn(`[bioValues] Unknown species: "${speciesLocalised}" — value defaulting to 0`);
  return 0;
}

/**
 * Get the first-logged bonus value (5x base)
 */
export function getSpeciesBonusValue(speciesLocalised: string): number {
  return getSpeciesValue(speciesLocalised) * 5;
}
