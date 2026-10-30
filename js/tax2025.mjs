// 2025 US federal parameters used by the tax estimate. Checked on 2026-10-30 against published sources:
//  - Standard deduction ($15,750 single, $31,500 married filing jointly, after the 2025 law change): IRS bulletin.
//  - Brackets (single: 10% to $11,925 ... 35% to $626,350, 37% above): several tax publishers.
//    Rev. Proc. 2024-40 itself was not read, so the married-filing-jointly thresholds are unconfirmed.
//  - Social Security wage base $176,100: payroll and accounting publishers reporting the SSA figure.
// Re-check every tax year, and confirm the amounts with a CPA.
const TAX2025 = {
  year: 2025,
  checkedOn: "2026-10-30",
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

export default TAX2025;
