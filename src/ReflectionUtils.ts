/**
 * Not as powerful as a proxy object but its the next best thing.
 * @param oldObject 
 * @param newObject 
 */
export async function reflect<T>(oldObject: any, newObject: T | (() => T)): Promise<T> {
    const obj: () => any = () => typeof newObject === "object" ? newObject : newObject();
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