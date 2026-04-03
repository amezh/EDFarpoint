<script lang="ts">
  import { systemStore, type Body, type RingInfo } from "$lib/stores/system.svelte";
  import { estimateCartoValue } from "$lib/utils/valueCalc";

  let svgEl: SVGSVGElement | undefined = $state();
  let cW = $state(800);
  let cH = $state(500);

  const system = $derived(systemStore.current);

  $effect(() => {
    if (!svgEl?.parentElement) return;
    const ro = new ResizeObserver(([e]) => { cW = e.contentRect.width; cH = e.contentRect.height; });
    ro.observe(svgEl.parentElement);
    return () => ro.disconnect();
  });

  const isBelt = (b: Body) => b.name.toLowerCase().includes("belt cluster");

  // Build: star(s), planets (not belts), moons
  interface PGroup { planet: Body; moons: Body[]; }
  interface SGroup { star: Body; planets: PGroup[]; belts: RingInfo[]; }

  const groups = $derived(buildGroups());

  function buildGroups(): SGroup[] {
    if (!system) return [];
    const bodies = system.bodies;
    const byId = new Map<number, Body>();
    for (const b of bodies) byId.set(b.bodyId, b);

    const childMap = new Map<number, Body[]>();
    const roots: Body[] = [];
    for (const b of bodies) {
      if (isBelt(b)) continue; // skip belt clusters entirely
      if (b.parents.length === 0) { roots.push(b); continue; }
      const pType = Object.keys(b.parents[0])[0];
      const pId = Object.values(b.parents[0])[0];
      if (pType === "Null" || pType === "Ring" || !byId.has(pId)) { roots.push(b); continue; }
      if (!childMap.has(pId)) childMap.set(pId, []);
      childMap.get(pId)!.push(b);
    }

    const dist = (b: Body) => b.distanceLs ?? 0;

    // Find star IDs referenced by planets' Parents arrays
    const starIds = new Set<number>();
    for (const b of bodies) {
      for (const p of b.parents) {
        if ("Star" in p) starIds.add(p.Star);
      }
    }

    // If a referenced star isn't in our bodies list, create a synthetic one
    // (star scan may not be in trip history)
    for (const sid of starIds) {
      if (!byId.has(sid)) {
        const starClass = system!.stars.get(sid) ?? "?";
        const synth: Body = {
          bodyId: sid, name: system!.name, shortName: system!.name,
          type: "Star", planetClass: "", starType: starClass,
          starSubclass: null, stellarMass: null, luminosity: null,
          distanceLs: 0, radius: null, gravity: null,
          atmosphere: "", atmosphereType: "", surfacePressure: null,
          temperature: null, volcanism: "", landable: false, terraformable: false,
          mapped: false, mappedByUs: false, bioSignals: 0, geoSignals: 0,
          bioSpeciesPredicted: [], bioValueMin: null, bioValueMax: null,
          massEM: null, estimatedValue: null, wasDiscovered: false, wasMapped: false, wasFootfalled: false,
          personalStatus: "unvisited", parents: [], rings: [], confirmedGenuses: [],
          semiMajorAxis: null, eccentricity: null, orbitalInclination: null, orbitalPeriod: null,
          edsmDiscoverer: null, edsmDiscoveryDate: null,
        };
        byId.set(sid, synth);
        roots.push(synth);
        // Re-parent: bodies that were orphaned because this star was missing
        // Move children from childMap entries or orphaned roots
      }
    }

    const isStarBody = (b: Body) => b.starType != null || starIds.has(b.bodyId) || b.type === "Star";

    // Re-do child mapping now that synthetic stars exist
    // Bodies whose parent star is now in byId should be children, not roots
    const finalRoots: Body[] = [];
    for (const b of roots) {
      if (isBelt(b)) continue;
      if (b.parents.length > 0) {
        const pId = Object.values(b.parents[0])[0];
        if (byId.has(pId) && pId !== b.bodyId) {
          if (!childMap.has(pId)) childMap.set(pId, []);
          if (!childMap.get(pId)!.includes(b)) childMap.get(pId)!.push(b);
          continue;
        }
      }
      finalRoots.push(b);
    }

    const stars = finalRoots.filter(b => isStarBody(b)).sort((a, b) => dist(a) - dist(b));
    const orphans = finalRoots.filter(b => !isStarBody(b) && !isBelt(b));

    const result: SGroup[] = [];
    for (const star of stars) {
      // Star's own rings = asteroid belts
      const belts = star.rings;
      const children = (childMap.get(star.bodyId) ?? [])
        .filter(b => !isBelt(b))
        .sort((a, b) => dist(a) - dist(b));
      const planets: PGroup[] = children.map(p => {
        const moons = (childMap.get(p.bodyId) ?? []).filter(b => !isBelt(b)).sort((a, b) => dist(a) - dist(b));
        for (const m of [...moons]) moons.push(...(childMap.get(m.bodyId) ?? []).filter(b => !isBelt(b)));
        return { planet: p, moons };
      });
      result.push({ star, planets, belts });
    }
    if (orphans.length > 0 && result.length > 0) {
      for (const o of orphans) result[0].planets.push({ planet: o, moons: childMap.get(o.bodyId) ?? [] });
    }
    return result;
  }

  // Layout
  interface Pos { x: number; y: number; r: number; body: Body; }
  interface Ln { x1: number; y1: number; x2: number; y2: number; dim?: boolean; }
  interface Belt { cx: number; cy: number; rx: number; ry: number; color: string; }

  const layout = $derived(computeLayout());

  function computeLayout(): { bodies: Pos[]; lines: Ln[]; belts: Belt[]; w: number; h: number } {
    if (groups.length === 0) return { bodies: [], lines: [], belts: [], w: 100, h: 100 };

    const g = groups[0];
    const nPlanets = g.planets.length;
    const maxMoons = Math.max(0, ...g.planets.map(p => p.moons.length));

    // Layout: star at top, planets row below, moons below planets
    // Allocate vertical space: 15% star zone, 15% planet row, 70% moons
    const starZone = cH * 0.12;
    const planetZoneY = cH * 0.22;
    const moonZoneTop = cH * 0.32;
    const moonZoneH = cH - moonZoneTop - 10;
    const moonStep = maxMoons > 0 ? Math.min(moonZoneH / maxMoons, cW / nPlanets * 0.9) : 40;

    const planetGapW = cW / (Math.max(nPlanets, 1) + 0.5);
    const bodyScale = 0.75;
    const starR = Math.min(starZone * 0.7, planetGapW * 0.6) * bodyScale;
    const planetR = Math.min(planetGapW * 0.35, starR * 0.7);
    const moonR = Math.min(moonStep * 0.35, planetR * 0.8);

    const bodies: Pos[] = [];
    const lines: Ln[] = [];
    const beltShapes: Belt[] = [];

    const starX = cW / 2;
    const starY = starZone * 0.6;
    bodies.push({ x: starX, y: starY, r: starR, body: g.star });

    // Additional stars to the left/right
    for (let si = 1; si < groups.length; si++) {
      const sx = starX + (si % 2 === 1 ? 1 : -1) * Math.ceil(si / 2) * starR * 3;
      bodies.push({ x: sx, y: starY, r: starR * 0.65, body: groups[si].star });
      lines.push({ x1: starX, y1: starY, x2: sx, y2: starY, dim: true });
      // Their planets too
      const sg = groups[si];
      const sgStartX = sx - (sg.planets.length - 1) * planetGapW * 0.5 / 2;
      for (let pi = 0; pi < sg.planets.length; pi++) {
        const px = sgStartX + pi * planetGapW * 0.5;
        const py = planetZoneY;
        bodies.push({ x: px, y: py, r: planetR * 0.7, body: sg.planets[pi].planet });
        lines.push({ x1: sx, y1: starY, x2: px, y2: py });
      }
    }

    // Belts as ellipses below star
    for (let bi = 0; bi < g.belts.length; bi++) {
      const belt = g.belts[bi];
      const beltY = starY + starR + 8 + bi * 6;
      const beltRx = starR * 1.5 + bi * 8;
      beltShapes.push({
        cx: starX, cy: beltY, rx: beltRx, ry: 4,
        color: rColor(belt),
      });
    }

    // Planets row
    const planetY = planetZoneY;
    const pad = planetR + 5;
    const planetRowWidth = cW - pad * 2;
    const planetGap = nPlanets > 1 ? planetRowWidth / (nPlanets - 1) : 0;
    const planetStartX = nPlanets > 1 ? pad : cW / 2;

    for (let pi = 0; pi < nPlanets; pi++) {
      const pg = g.planets[pi];
      const px = planetStartX + pi * planetGap;
      const py = planetY;
      const pr = pg.planet.starType ? starR * 0.5 : planetR;

      bodies.push({ x: px, y: py, r: pr, body: pg.planet });
      lines.push({ x1: starX, y1: starY, x2: px, y2: py });

      // Planet's own rings
      // (drawn inline in SVG below)

      // Moons below — use moonStep so they fit vertically
      for (let mi = 0; mi < pg.moons.length; mi++) {
        const mx = px;
        const my = py + moonStep * (mi + 1);
        bodies.push({ x: mx, y: my, r: moonR, body: pg.moons[mi] });
        lines.push({ x1: px, y1: py, x2: mx, y2: my, dim: true });
      }
    }

    return { bodies, lines, belts: beltShapes, w: cW, h: cH };
  }

  function bColor(b: Body): string {
    if (b.starType) return { O: "#9bb0ff", B: "#aabfff", A: "#cad7ff", F: "#f8f7ff", G: "#fff4ea", K: "#ffd2a1", M: "#ffcc6f", L: "#ff8b8b", T: "#ff6b9d", Y: "#cc66cc", D: "#fff", N: "#00ccff", H: "#444" }[b.starType.charAt(0)] ?? "#fff4ea";
    if (b.terraformable) return "#44cc88";
    return { "Earthlike body": "#4a9eff", "Earth-like world": "#4a9eff", "Water world": "#2277cc", "Ammonia world": "#aa8844", "High metal content world": "#aa7744", "High metal content body": "#aa7744", "Metal rich body": "#ccaa66", "Rocky body": "#887766", "Rocky Ice world": "#99aabb", "Rocky ice body": "#99aabb", "Icy body": "#ccddee" }[b.planetClass] ?? "#777";
  }

  function rColor(r: RingInfo): string {
    const c = r.ringClass.toLowerCase();
    if (c.includes("metal")) return "rgba(204,170,100,0.4)";
    if (c.includes("rock")) return "rgba(150,130,110,0.4)";
    return "rgba(180,200,220,0.4)";
  }

  // Map bodyId → star letter for labeling
  const starLetters = $derived(buildStarLetters());

  function buildStarLetters(): Map<number, string> {
    const map = new Map<number, string>();
    if (!groups.length) return map;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const sn = g.star.shortName.trim();
      // Star letter: "A", "B", etc. For primary star with no letter, use "A" if multi-star, "" if solo
      const letter = sn.length <= 2 ? sn : (groups.length > 1 ? String.fromCharCode(65 + i) : "");
      map.set(g.star.bodyId, letter);
    }
    return map;
  }

  function bodyLabel(b: Body): string {
    if (b.starType || b.type === "Star") {
      const sn = b.shortName.trim();
      if (sn.length <= 2) return `Star ${sn}`;
      return groups.length > 1 ? "Star A" : "Star";
    }
    // For planets/moons: if shortName already has the star letter (e.g. "A 1"), use it
    // If it's just a number (e.g. "1") and parent is a known star, prefix the star letter
    const sn = b.shortName.trim();
    if (b.parents.length > 0) {
      const parentKey = Object.keys(b.parents[b.parents.length - 1])[0]; // deepest parent = star
      const parentId = Object.values(b.parents[b.parents.length - 1])[0];
      if (parentKey === "Star") {
        const letter = starLetters.get(parentId) ?? "";
        // Only prefix if shortName doesn't already start with a letter
        if (letter && !/^[A-Z]/.test(sn)) {
          return `${letter} ${sn}`;
        }
      }
    }
    return sn;
  }

  function typeLabel(b: Body): string {
    if (b.starType) return b.starType + (b.starSubclass ?? "");
    return { "Earthlike body": "ELW", "Earth-like world": "ELW", "Water world": "WW", "Ammonia world": "AW", "High metal content world": "HMC", "High metal content body": "HMC", "Rocky body": "Rk", "Rocky ice body": "RI", "Rocky Ice world": "RI", "Icy body": "Icy" }[b.planetClass] ?? "";
  }

  function statusTag(b: Body): string {
    if (b.starType) return "";
    const s = b.personalStatus;
    if (s === "bio_complete") return "Bio \u2713";
    if (s === "dss" || b.mapped) return b.bioSignals > 0 ? "DSS" : "DSS \u2713";
    if (s === "landed" || s === "visited") return "FSS";
    if (s === "fss") return "FSS";
    return "";
  }

  function statusColor(b: Body): string {
    const s = b.personalStatus;
    if (s === "bio_complete") return "#22cc66";
    if (s === "dss" || b.mapped) return "#4a9eff";
    if (s === "fss" || s === "visited" || s === "landed") return "#e88c00";
    return "rgba(255,255,255,0.3)";
  }

  function formatCr(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
    return n.toString();
  }

  function bodyCrValue(b: Body): string {
    if (b.starType) return "";
    if (!b.planetClass) return "";
    const val = estimateCartoValue({
      bodyType: b.planetClass,
      terraformable: b.terraformable,
      wasDiscovered: b.wasDiscovered,
      wasMapped: b.wasMapped,
      massEM: b.massEM ?? undefined,
      withDSS: b.mapped,
      efficiencyBonus: false,
    });
    return formatCr(val) + " Cr";
  }
</script>

<div class="w-full h-full overflow-hidden">
  {#if system && layout.bodies.length > 0}
    <svg bind:this={svgEl} viewBox="0 0 {layout.w} {layout.h}" class="w-full h-full">
      <!-- Connection lines -->
      {#each layout.lines as l}
        <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={l.dim ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)"} stroke-width="1" />
      {/each}

      <!-- Belt ellipses -->
      {#each layout.belts as b}
        <ellipse cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry}
          fill="none" stroke={b.color} stroke-width="2" />
      {/each}

      <!-- Bodies -->
      {#each layout.bodies as p}
        <g>
          {#if p.body.starType}
            <circle cx={p.x} cy={p.y} r={p.r * 2} fill={bColor(p.body)} opacity="0.06" />
            <circle cx={p.x} cy={p.y} r={p.r * 1.4} fill={bColor(p.body)} opacity="0.15" />
          {/if}

          <circle cx={p.x} cy={p.y} r={p.r} fill={bColor(p.body)}
            stroke={p.body.bioSignals > 0 ? "#22cc66" : p.body.landable ? "rgba(255,255,255,0.1)" : "none"}
            stroke-width={p.body.bioSignals > 0 ? Math.max(1, p.r * 0.08) : 0.5} />

          <!-- Planet rings -->
          {#if p.body.rings.length > 0 && !p.body.starType}
            {#each p.body.rings as ring, i}
              <ellipse cx={p.x} cy={p.y}
                rx={p.r * (1.6 + i * 0.3)} ry={p.r * (0.3 + i * 0.05)}
                fill="none" stroke={rColor(ring)} stroke-width={Math.max(1, p.r * 0.12)} />
            {/each}
          {/if}

          <!-- Bio -->
          {#if p.body.bioSignals > 0}
            {@const br = Math.max(4, p.r * 0.28)}
            <circle cx={p.x + p.r * 0.65} cy={p.y - p.r * 0.65} r={br} fill="#22cc66" />
            <text x={p.x + p.r * 0.65} y={p.y - p.r * 0.65 + br * 0.38}
              text-anchor="middle" fill="black" font-size={br * 0.85} font-weight="bold" font-family="monospace">{p.body.bioSignals}</text>
          {/if}

          <!-- 1st -->
          {#if !p.body.wasDiscovered}
            <circle cx={p.x - p.r * 0.65} cy={p.y - p.r * 0.65} r={Math.max(3, p.r * 0.18)} fill="#e88c00" />
          {/if}

          <!-- Labels -->
          <text x={p.x} y={p.y + p.r + Math.max(7, p.r * 0.35) + 2}
            text-anchor="middle" fill="rgba(255,255,255,0.6)"
            font-size={Math.max(7, p.r * 0.35)} font-family="monospace">{bodyLabel(p.body)}</text>
          <text x={p.x} y={p.y + p.r + Math.max(7, p.r * 0.35) * 2 + 2}
            text-anchor="middle" fill="rgba(255,255,255,0.25)"
            font-size={Math.max(5, p.r * 0.26)} font-family="monospace">{typeLabel(p.body)}{p.body.terraformable ? " T" : ""}</text>

          <!-- Status tag (FSS / DSS / Bio) -->
          {#if statusTag(p.body)}
            <text x={p.x} y={p.y + p.r + Math.max(7, p.r * 0.35) * 3 + 2}
              text-anchor="middle" fill={statusColor(p.body)}
              font-size={Math.max(5, p.r * 0.24)} font-family="monospace" font-weight="bold">{statusTag(p.body)}</text>
          {/if}

          <!-- CR value -->
          {#if bodyCrValue(p.body)}
            <text x={p.x} y={p.y + p.r + Math.max(7, p.r * 0.35) * (statusTag(p.body) ? 4 : 3) + 2}
              text-anchor="middle" fill="rgba(255,255,255,0.35)"
              font-size={Math.max(5, p.r * 0.22)} font-family="monospace">{bodyCrValue(p.body)}</text>
          {/if}
        </g>
      {/each}
    </svg>
  {:else}
    <svg bind:this={svgEl} class="w-full h-full">
      <text x="50%" y="50%" text-anchor="middle" fill="rgba(255,255,255,0.3)" font-size="14">No bodies scanned yet</text>
    </svg>
  {/if}
</div>
