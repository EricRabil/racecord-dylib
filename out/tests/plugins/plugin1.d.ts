import { TestPlugin, MainType, EventType } from "../test";
export declare class Plugin1 implements TestPlugin {
    private main;
    constructor(main: MainType);
    isCrazy(): boolean;
    identifier: string;
    version: string;
    takesEvents: boolean;
    event(name: string, event: EventType): Promise<void>;
}
export declare class Plugin2 implements TestPlugin {
    isCrazy(): boolean;
    identifier: string;
    version: string;
    takesEvents: boolean;
    event(name: string, event: EventType): Promise<void>;
}
export declare class Plugin3 implements TestPlugin {
    isCrazy(): boolean;
    identifier: string;
    version: string;
    takesEvents: boolean;
    event(name: string, event: EventType): Promise<void>;
}
