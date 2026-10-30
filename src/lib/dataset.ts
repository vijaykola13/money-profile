import * as core from "../../js/dataset.mjs";

export interface Tx {
  date: string;
  name: string;
  amount: number;
}

interface Api {
  toCanonicalCsv(txns: Tx[]): string;
  fromCanonicalCsv(text: string): Tx[];
  describe(txns: Tx[]): { count: number; first: string | null; last: string | null; months: number };
}

export const dataset = core as unknown as Api;
