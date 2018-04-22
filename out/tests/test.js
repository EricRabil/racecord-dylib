"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const __1 = require("..");
const path = require("path");
const blacklistedGuilds = [];
const dylibLoader = new __1.DylibLoader({
    rawPluginValidator: ((raw) => typeof raw.isCrazy === "function"),
    shouldReceiveEvent: (plugin, event, data) => {
        return plugin.identifier === "plugin1" ? data.data.guild !== 420 : true;
    },
    strict: true
}, {
    taylorSwift: false
});
class Testing {
    constructor() {
        this.on = (property, handler) => {
            Object.defineProperty(this, property, { get: handler });
        };
    }
}
const tests = [
    {
        name: "420 event",
        notes: "Should not see '420' from plugin1",
        async func(dylibLoader) {
            await dylibLoader.dispatch("krazy", { data: { guild: 420 } });
        }
    },
    {
        name: "Disable",
        notes: "Should not see '421' from plugin1",
        async func(dylibLoader) {
            await dylibLoader.disable("plugin1");
            await dylibLoader.dispatch("krazy", { data: { guild: 421 } });
            await dylibLoader.enable("plugin1");
        }
    },
    /**
     * Only tests reload, but reload uses unload and load-cached
     */
    {
        name: "Reload, Unload, Load Cached",
        notes: "Should see '422' from plugin1",
        async func(dylibLoader) {
            await dylibLoader.reload("plugin1");
            await dylibLoader.dispatch("krazy", { data: { guild: 422 } });
        }
    },
    /**
     * It is an internal method, but very critical so we will test it regardless.
     */
    {
        name: "Internal Listening Override",
        notes: "Should see '423', '425' from plugin1, should not see '424' from plugin1",
        async func(dylibLoader) {
            const updateInternalListeningState = dylibLoader.updateInternalListeningState.bind(dylibLoader);
            const plugin1 = dylibLoader.plugin("plugin1");
            if (!plugin1) {
                throw new Error("No plugin1 provided");
            }
            dylibLoader.dispatch("krazy", { data: { guild: 423 } });
            updateInternalListeningState(plugin1, false);
            dylibLoader.dispatch("krazy", { data: { guild: 424 } });
            updateInternalListeningState(plugin1, true);
            dylibLoader.dispatch("krazy", { data: { guild: 425 } });
        }
    }
];
dylibLoader.loadDirectory(path.resolve(__dirname, "plugins")).then(async (plugins) => {
    const plugin1 = plugins.get("plugin1");
    if (plugin1) {
        console.log(plugin1.isCrazy());
    }
    const plugin2 = plugins.get("plugin2");
    if (plugin2) {
        console.log(plugin2.isCrazy());
    }
    for (let test of tests) {
        console.log(`--- Running test \`${test.name}\` ---`);
        if (test.notes) {
            console.log(`[[[ Note: ${test.notes} ]]]`);
        }
        await test.func(dylibLoader);
        console.log(`--- ${test.name} completed ---`);
    }
});
