declare module "virtual:uno.css" {
  const css: string;
  export default css;
}

declare module "$lib/*" {
  const value: any;
  export default value;
  export * from value;
}
