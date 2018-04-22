"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Plugin1 {
    constructor(main) {
        this.main = main;
        this.identifier = "plugin1";
        this.version = "1.0.0";
        this.takesEvents = true;
    }
    isCrazy() {
        return true;
    }
    async event(name, event) {
        console.log(`${this.identifier} ${name} ${event.data.guild}`);
    }
}
exports.Plugin1 = Plugin1;
class Plugin2 {
    constructor() {
        this.identifier = "plugin2";
        this.version = "1.0.0";
        this.takesEvents = true;
    }
    isCrazy() {
        return false;
    }
    async event(name, event) {
        console.log(`${this.identifier} ${name} ${event.data.guild}`);
    }
}
exports.Plugin2 = Plugin2;
class Plugin3 {
    constructor() {
        this.identifier = "plugin3";
        this.version = "1.0.0";
        this.takesEvents = false;
    }
    isCrazy() {
        return false;
    }
    async event(name, event) {
        console.log(`${this.identifier} ${name} ${event.data.guild}`);
    }
}
exports.Plugin3 = Plugin3;
