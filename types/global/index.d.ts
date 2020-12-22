export {};

declare global {

  interface Object {
    size(o: Object): number;
  }

  interface define {
    [key: string]: any
  }

  function define(val: any): void;
}
