/* SVG symbol libraries for both diagram domains.
 * Odum ESL symbols migrated from gssk-dia.
 * Bond Graph symbols follow standard BG notation conventions. */

export const SYMBOLS = {
  odum: `
    <symbol id="odum-source" viewBox="0 0 100 100">
      <path d="M25,60 Q15,60 15,50 Q15,35 30,35 Q35,20 50,20 Q65,20 70,35 Q85,35 85,50 Q85,60 75,60 L25,60" fill="none" stroke="currentColor" stroke-width="2"/>
    </symbol>
    <symbol id="odum-storage" viewBox="0 0 100 100">
      <path d="M30,20 L70,20 Q80,20 80,30 L80,70 Q80,80 70,80 L30,80 Q20,80 20,70 L20,30 Q20,20 30,20 Z" fill="none" stroke="currentColor" stroke-width="2"/>
    </symbol>
    <symbol id="odum-sink" viewBox="0 0 100 100">
      <line x1="50" y1="20" x2="50" y2="60" stroke="currentColor" stroke-width="2"/>
      <path d="M40,50 L50,60 L60,50" fill="none" stroke="currentColor" stroke-width="2"/>
      <line x1="30" y1="65" x2="70" y2="65" stroke="currentColor" stroke-width="2"/>
      <line x1="35" y1="72" x2="65" y2="72" stroke="currentColor" stroke-width="2"/>
      <line x1="40" y1="79" x2="60" y2="79" stroke="currentColor" stroke-width="2"/>
    </symbol>
    <symbol id="odum-constant" viewBox="0 0 100 100">
      <rect x="25" y="25" width="50" height="50" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(45 50 50)"/>
    </symbol>
    <symbol id="gate" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="10" fill="var(--bg-color)" stroke="currentColor" stroke-width="2"/>
      <line x1="15" y1="15" x2="25" y2="25" stroke="currentColor" stroke-width="2"/>
      <line x1="25" y1="15" x2="15" y2="25" stroke="currentColor" stroke-width="2"/>
    </symbol>
  `,
  generic: `
    <symbol id="generic-source" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="50" cy="50" r="5" fill="currentColor"/>
    </symbol>
    <symbol id="generic-storage" viewBox="0 0 100 100">
      <rect x="25" y="25" width="50" height="50" fill="none" stroke="currentColor" stroke-width="2"/>
    </symbol>
    <symbol id="generic-sink" viewBox="0 0 100 100">
      <path d="M20,50 L80,50 M80,50 L70,40 M80,50 L70,60" fill="none" stroke="currentColor" stroke-width="2"/>
      <line x1="85" y1="30" x2="85" y2="70" stroke="currentColor" stroke-width="2"/>
    </symbol>
    <symbol id="generic-constant" viewBox="0 0 100 100">
      <rect x="25" y="25" width="50" height="50" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(45 50 50)"/>
    </symbol>
  `,
  /* Bond Graph symbols — standard BG notation.
   * Sources: circle with type label.
   * Passive elements (R/C/I): square with type label.
   * Two-ports (TF/GY): rectangle with type label.
   * Junctions (J0/J1): circle with number. */
  bondgraph: `
    <!-- Se: Effort Source — circle -->
    <symbol id="bg-Se" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="28" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="40" y="46" text-anchor="middle" font-size="18" font-weight="bold" fill="currentColor">Se</text>
    </symbol>
    <!-- Sf: Flow Source — double circle -->
    <symbol id="bg-Sf" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="28" fill="none" stroke="currentColor" stroke-width="2"/>
      <circle cx="40" cy="40" r="20" fill="none" stroke="currentColor" stroke-width="1.5"/>
      <text x="40" y="46" text-anchor="middle" font-size="16" font-weight="bold" fill="currentColor">Sf</text>
    </symbol>
    <!-- R: Resistor — rectangle -->
    <symbol id="bg-R" viewBox="0 0 80 80">
      <rect x="12" y="22" width="56" height="36" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="40" y="46" text-anchor="middle" font-size="22" font-weight="bold" fill="currentColor">R</text>
    </symbol>
    <!-- C: Capacitor — rectangle with double bottom line -->
    <symbol id="bg-C" viewBox="0 0 80 80">
      <rect x="12" y="22" width="56" height="36" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="40" y="46" text-anchor="middle" font-size="22" font-weight="bold" fill="currentColor">C</text>
    </symbol>
    <!-- I: Inertia — rectangle -->
    <symbol id="bg-I" viewBox="0 0 80 80">
      <rect x="12" y="22" width="56" height="36" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="40" y="46" text-anchor="middle" font-size="22" font-weight="bold" fill="currentColor">I</text>
    </symbol>
    <!-- TF: Transformer — tall rectangle -->
    <symbol id="bg-TF" viewBox="0 0 80 80">
      <rect x="20" y="10" width="40" height="60" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
      <text x="40" y="46" text-anchor="middle" font-size="16" font-weight="bold" fill="currentColor">TF</text>
    </symbol>
    <!-- GY: Gyrator — tall rectangle with accent line -->
    <symbol id="bg-GY" viewBox="0 0 80 80">
      <rect x="20" y="10" width="40" height="60" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
      <line x1="20" y1="40" x2="60" y2="40" stroke="currentColor" stroke-width="1" stroke-dasharray="3,2"/>
      <text x="40" y="35" text-anchor="middle" font-size="14" font-weight="bold" fill="currentColor">GY</text>
    </symbol>
    <!-- J0: 0-Junction — large circle with 0 -->
    <symbol id="bg-J0" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" stroke-width="2.5"/>
      <text x="40" y="50" text-anchor="middle" font-size="28" font-weight="bold" fill="currentColor">0</text>
    </symbol>
    <!-- J1: 1-Junction — large circle with 1 -->
    <symbol id="bg-J1" viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" stroke-width="2.5"/>
      <text x="40" y="50" text-anchor="middle" font-size="28" font-weight="bold" fill="currentColor">1</text>
    </symbol>
  `,
};
