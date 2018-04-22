/**
 * Not as powerful as a proxy object but its the next best thing.
 * @param oldObject
 * @param newObject
 */
export declare function reflect<T>(oldObject: any, newObject: T | (() => T)): Promise<T>;
