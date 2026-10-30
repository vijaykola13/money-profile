// The shared engine, tax config and sample data are plain ES modules without type declarations.
declare module "*.mjs" {
  const value: any;
  export default value;
  export const profile: any;
  export const estimateTax: any;
  export const detectPanic: any;
}
