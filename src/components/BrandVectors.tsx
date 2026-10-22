import React from 'react';

/**
 * CalQuest Brand Logo Mark (Warm Terracotta, Sunlit Peach, Honey Gold & Espresso Cream)
 */
export function CalQuestLogoMark({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="120" height="120" rx="34" fill="#241C18" />
      <rect
        x="3"
        y="3"
        width="114"
        height="114"
        rx="31"
        stroke="#F4845F"
        strokeOpacity="0.35"
        strokeWidth="2.5"
      />
      {/* Viewfinder Corner Brackets */}
      <path
        d="M26 38V31C26 28.2386 28.2386 26 31 26H38"
        stroke="#FAF3EE"
        strokeOpacity="0.6"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M94 38V31C94 28.2386 91.7614 26 89 26H82"
        stroke="#FAF3EE"
        strokeOpacity="0.6"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M26 82V89C26 91.7614 28.2386 94 31 94H38"
        stroke="#FAF3EE"
        strokeOpacity="0.6"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M94 82V89C94 91.7614 91.7614 94 89 94H82"
        stroke="#FAF3EE"
        strokeOpacity="0.6"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Rising Metabolic Flame */}
      <path
        d="M60 22C60 22 77 37 77 52.5C77 61.8888 69.3888 69.5 60 69.5C50.6112 69.5 43 61.8888 43 52.5C43 44.5 48 38 52.5 33.5C52 40 56 44 60 44C64.5 44 66 37 60 22Z"
        fill="url(#cqFlame)"
      />
      {/* Botanical Clay Leaf */}
      <path
        d="M61 56C61 45 71 38 82 39C81 49 73 58 61 56Z"
        fill="#84A59D"
      />
      {/* Warm Terracotta Bowl */}
      <path
        d="M30 65H90C90 81.5685 76.5685 95 60 95C43.4315 95 30 81.5685 30 65Z"
        fill="url(#cqBowl)"
      />
      <path
        d="M36 65H84"
        stroke="#FAF3EE"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient
          id="cqFlame"
          x1="60"
          y1="22"
          x2="60"
          y2="69.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F6BD60" />
          <stop offset="1" stopColor="#F4845F" />
        </linearGradient>
        <linearGradient
          id="cqBowl"
          x1="30"
          y1="65"
          x2="90"
          y2="95"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F4845F" />
          <stop offset="1" stopColor="#C85A38" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Editorial Onboarding Hero Vector Illustration (Anthropometrics + Nutrition Balance)
 */
export function OnboardingHeroVector({ className = 'w-full h-36' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="360" height="130" rx="28" fill="#1C1613" />
      <circle cx="65" cy="65" r="44" fill="#3D2219" />
      <circle
        cx="65"
        cy="65"
        r="36"
        stroke="#F4845F"
        strokeWidth="6"
        strokeDasharray="165 220"
        strokeLinecap="round"
      />
      <circle cx="65" cy="65" r="24" fill="#241C18" />
      <path
        d="M58 65L63 70L73 59"
        stroke="#F6BD60"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Metabolic Energy Trajectory Curve */}
      <path
        d="M130 92C155 92 168 48 198 48C228 48 242 78 272 60C294 46 312 32 332 32"
        stroke="url(#onboardCurve)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M130 92C155 92 168 48 198 48C228 48 242 78 272 60C294 46 312 32 332 32V106H130V92Z"
        fill="url(#onboardArea)"
        fillOpacity="0.22"
      />

      {/* Data Milestone Nodes */}
      <circle cx="198" cy="48" r="6" fill="#F6BD60" stroke="#14100E" strokeWidth="2.5" />
      <circle cx="272" cy="60" r="6" fill="#84A59D" stroke="#14100E" strokeWidth="2.5" />
      <circle cx="332" cy="32" r="7" fill="#F4845F" stroke="#FAF3EE" strokeWidth="2.5" />

      {/* Subtle Ruler Marks */}
      <line x1="130" y1="106" x2="334" y2="106" stroke="#FAF3EE" strokeOpacity="0.12" strokeWidth="2" />
      <defs>
        <linearGradient id="onboardCurve" x1="130" y1="32" x2="332" y2="92" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F6BD60" />
          <stop offset="0.5" stopColor="#F4845F" />
          <stop offset="1" stopColor="#84A59D" />
        </linearGradient>
        <linearGradient id="onboardArea" x1="231" y1="32" x2="231" y2="106" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4845F" />
          <stop offset="1" stopColor="#1C1613" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Biomathematical Curve Vector (Forbes Partitioning + Hall Dynamic Adaptation)
 */
export function MetabolicEquationVector({ className = 'w-full h-28' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 104"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="360" height="104" rx="24" fill="#1C1613" />
      {/* Grid Hairlines */}
      <line x1="24" y1="26" x2="336" y2="26" stroke="#FAF3EE" strokeOpacity="0.06" strokeDasharray="4 4" />
      <line x1="24" y1="54" x2="336" y2="54" stroke="#FAF3EE" strokeOpacity="0.06" strokeDasharray="4 4" />
      <line x1="24" y1="82" x2="336" y2="82" stroke="#FAF3EE" strokeOpacity="0.08" />

      {/* Linear 3500-kcal Naive Rule (Dashed Reference) */}
      <path
        d="M32 24L328 84"
        stroke="#9E8C7E"
        strokeOpacity="0.45"
        strokeWidth="2.5"
        strokeDasharray="6 6"
        strokeLinecap="round"
      />

      {/* Hall et al. (2011) Dynamic Adaptation Trajectory */}
      <path
        d="M32 24C98 54 176 68 328 74"
        stroke="#F4845F"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Forbes Lean Mass Preservation Curve */}
      <path
        d="M32 76C110 74 205 64 328 42"
        stroke="#84A59D"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      <circle cx="32" cy="24" r="5" fill="#F6BD60" />
      <circle cx="180" cy="63" r="5" fill="#F4845F" />
      <circle cx="328" cy="74" r="6" fill="#FAF3EE" stroke="#F4845F" strokeWidth="3" />
    </svg>
  );
}

/**
 * Empty Plate Editorial Vector Illustration
 */
export function EmptyPlateVector({ className = 'w-28 h-24' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <ellipse cx="70" cy="86" rx="52" ry="10" fill="#1C1613" />
      {/* Warm Steam Waves */}
      <path
        d="M52 34C52 27 58 25 58 18"
        stroke="#F6BD60"
        strokeOpacity="0.65"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M70 30C70 22 77 19 77 11"
        stroke="#F4845F"
        strokeOpacity="0.8"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M88 34C88 27 94 25 94 18"
        stroke="#84A59D"
        strokeOpacity="0.65"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Ceramic Bowl */}
      <path
        d="M26 50H114C114 73.196 94.3005 92 70 92C45.6995 92 26 73.196 26 50Z"
        fill="#3D2219"
        stroke="#F4845F"
        strokeWidth="3"
      />
      <path
        d="M20 50H120"
        stroke="#FAF3EE"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Decorative Botanical Sprout inside Bowl */}
      <path
        d="M70 50C70 40 80 34 90 36C88 45 80 51 70 50Z"
        fill="#84A59D"
      />
      <path
        d="M68 50C68 42 60 36 51 38C53 46 60 51 68 50Z"
        fill="#F6BD60"
      />
    </svg>
  );
}

/**
 * Scanner Viewfinder Vector Illustration
 */
export function ScannerViewfinderVector({ className = 'w-28 h-24' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 110"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect x="18" y="12" width="104" height="86" rx="24" fill="#241C18" stroke="#F4845F" strokeOpacity="0.35" strokeWidth="2.5" />
      <path d="M34 36V28C34 25.7909 35.7909 24 38 24H46" stroke="#F4845F" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M106 36V28C106 25.7909 104.209 24 102 24H94" stroke="#F4845F" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M34 74V82C34 84.2091 35.7909 86 38 86H46" stroke="#F4845F" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M106 74V82C106 84.2091 104.209 86 102 86H94" stroke="#F4845F" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="70" cy="55" r="20" fill="#3D2219" stroke="#F6BD60" strokeWidth="3" />
      <circle cx="70" cy="55" r="8" fill="#F4845F" />
      <circle cx="96" cy="36" r="4" fill="#84A59D" />
    </svg>
  );
}
