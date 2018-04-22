"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Not as powerful as a proxy object but its the next best thing.
 * @param oldObject
 * @param newObject
 */
async function reflect(oldObject, newObject) {
    const obj = () => typeof newObject === "object" ? newObject : newObject();
    for (let key in oldObject) {
        Object.defineProperty(oldObject, key, {
            get() {
                return obj()[key];
            },
            set(value) {
                obj()[key] = value;
            }
        });
    }
    return oldObject;
}
exports.reflect = reflect;
