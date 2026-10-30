// 2025 US federal parameters used by the POC tax estimate.
// NOTE: entered from memory of IRS Rev. Proc. 2024-40 and the 2025 law changes — verify
// against irs.gov before relying on them. Educational estimate only.
const TAX2025 = {
  year: 2025,
  verified: false,
  standardDeduction: { single: 15750, mfj: 31500 },
  brackets: {
    single: [
      [11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24],
      [250525, 0.32], [626350, 0.35], [Infinity, 0.37]
    ],
    mfj: [
      [23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24],
      [501050, 0.32], [751600, 0.35], [Infinity, 0.37]
    ]
  },
  socialSecurityWageBase: 176100,
  socialSecurityRate: 0.062,
  medicareRate: 0.0145,
  seNetFactor: 0.9235
};

if (typeof module !== 'undefined') module.exports = TAX2025;
else window.TAX2025 = TAX2025;
