// Vista Genomics bio species values (base reward in credits)
// Source: Canonn Research codex prices
const BIO_VALUES: Record<string, number> = {
  "Fonticulua Fluctus": 20000000,
  "Tussock Stigmasis": 19010800,
  "Stratum Tectonicas": 19010800,
  "Fonticulua Segmentatus": 19010800,
  "Concha Biconcavis": 19010800,
  "Stratum Cucumisis": 16202800,
  "Recepta Deltahedronix": 16202800,
  "Fumerola Extremus": 16202800,
  "Clypeus Speculumi": 16202800,
  "Cactoida Vermis": 16202800,
  "Tussock Virgam": 14313700,
  "Recepta Conditivus": 14313700,
  "Recepta Umbrux": 12934900,
  "Osseus Discus": 12934900,
  "Aleoida Gravis": 12934900,
  "Tubus Cavas": 11873200,
  "Clypeus Margaritus": 11873200,
  "Frutexa Flammasis": 10326000,
  "Osseus Pellebantus": 9739000,
  "Clypeus Lacrimam": 8418000,
  "Bacterium Informem": 8418000,
  "Tussock Triticum": 7774700,
  "Tubus Compagibus": 7774700,
  "Frutexa Acus": 7774700,
  "Concha Aureolas": 7774700,
  "Bacterium Volu": 7774700,
  "Fumerola Nitris": 7500900,
  "Aleoida Arcus": 7252500,
  "Tussock Capillum": 7025800,
  "Fungoida Stabitis": 5024700,
  "Cactoida Pullulanta": 3667600,
  "Osseus Spiralis": 3200600,
  "Fungoida Gelata": 3330300,
  "Tubus Rosarium": 2637500,
  "Tussock Pennata": 5853800,
  "Tussock Pennatis": 5853800,
  "Cactoida Cortexum": 3667600,
  "Cactoida Lapis": 3667600,
  "Concha Renibus": 4572400,
  "Concha Labiata": 2352500,
  "Osseus Fractus": 4027800,
  "Osseus Cornibus": 1483000,
  "Osseus Pumice": 3156300,
  "Frutexa Flabellum": 1808900,
  "Frutexa Metallicum": 1632500,
  "Frutexa Collum": 1632500,
  "Frutexa Fera": 1632500,
  "Frutexa Sponsae": 1808900,
  "Stratum Paleas": 1362000,
  "Stratum Laminamus": 2788300,
  "Stratum Araneamus": 2788300,
  "Stratum Limaxus": 1362000,
  "Stratum Frigus": 2788300,
  "Stratum Excutitus": 2788300,
  "Fungoida Setisis": 1670100,
  "Fungoida Bullarum": 3330300,
  "Tubus Sororibus": 5727600,
  "Tubus Conifer": 2415500,
  "Tussock Albata": 3252500,
  "Tussock Catena": 1766600,
  "Tussock Cultro": 1766600,
  "Tussock Divisa": 1766600,
  "Tussock Ignis": 1766600,
  "Tussock Propagito": 1000000,
  "Tussock Serrati": 4447100,
  "Tussock Ventusa": 3227700,
  "Bacterium Acies": 1000000,
  "Bacterium Alcyoneum": 1658500,
  "Bacterium Aurasus": 1000000,
  "Bacterium Bullaris": 1152500,
  "Bacterium Cerbrus": 1689800,
  "Bacterium Nebulus": 5289900,
  "Bacterium Omentum": 4638400,
  "Bacterium Scopulum": 4934500,
  "Bacterium Tela": 1949000,
  "Bacterium Verrata": 3897000,
  "Electricae Pluma": 6284600,
  "Electricae Radialem": 6284600,
  "Aleoida Coronamus": 6284600,
  "Aleoida Laminiae": 3385200,
  "Aleoida Spica": 3385200,
  "Cactoida Peperatis": 2483600,
  "Clypeus Margaritus": 11873200,
  "Fonticulua Campestris": 1000000,
  "Fonticulua Digitos": 1804100,
  "Fonticulua Lapida": 3111000,
  "Fonticulua Upupam": 5988700,
  "Fumerola Aquatis": 6284600,
  "Fumerola Carbosis": 6284600,
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

  return 0;
}

/**
 * Get the first-logged bonus value (5x base)
 */
export function getSpeciesBonusValue(speciesLocalised: string): number {
  return getSpeciesValue(speciesLocalised) * 5;
}
