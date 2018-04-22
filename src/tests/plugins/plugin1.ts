import { TestPlugin, MainType, EventType } from "../test";

export class Plugin1 implements TestPlugin {
    constructor(private main: MainType) {
    }
    isCrazy(): boolean {
        return true;
    }
    identifier: string = "plugin1";
    version: string = "1.0.0";
    takesEvents: boolean = true;
    public async event(name: string, event: EventType) {
        console.log(`${this.identifier} ${name} ${event.data.guild}`);
    }
}

export class Plugin2 implements TestPlugin {
    isCrazy(): boolean {
        return false;
    }
    identifier: string = "plugin2";
    version: string = "1.0.0";
    takesEvents: boolean = true;
    public async event(name: string, event: EventType) {
        console.log(`${this.identifier} ${name} ${event.data.guild}`);
    }
}

export class Plugin3 implements TestPlugin {
    isCrazy(): boolean {
        return false;
    }
    identifier: string = "plugin3";
    version: string = "1.0.0";
    takesEvents: boolean = false;
    public async event(name: string, event: EventType) {
        console.log(`${this.identifier} ${name} ${event.data.guild}`);
    }
}