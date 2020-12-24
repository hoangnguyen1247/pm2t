import { AnyObject } from "TypeUtils";

export {};

declare global {
    interface Object {
        size(o: AnyObject): number;
    }

    interface define {
        [key: string]: any
    }

    function define(val: any): void;
}
