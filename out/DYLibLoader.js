"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
}
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs-extra");
const path = require("path");
const ReflectionUtils_1 = require("./ReflectionUtils");
/**
 * Basic map-merge function
 * @param maps the maps to merge
 */
const merge = async (maps) => {
    const masterMap = new Map();
    for (const map of maps) {
        for (const [key, value] of map) {
            masterMap.set(key, value);
        }
    }
    return masterMap;
};
/**
 * A lean and efficient plug-in manager
 */
class DylibLoader {
    /**
     *
     * @param options the options and functions for this loader
     * @param mainInstance the main instance to pass to plugins
     */
    constructor(options, mainInstance) {
        this.options = options;
        this.mainInstance = mainInstance;
        /**
         * A map of identifiers to plugins
         */
        this.pluginsMap = new Map();
        /**
         * A map of identifiers to DISABLED plugins
         */
        this.disabledPlugins = new Map();
        /**
         * A map of identifiers to load-locations
         */
        this.pluginPathCache = new Map();
    }
    /**
     * An array of plugins
     */
    get plugins() {
        return Array.from(this.pluginsMap.values());
    }
    /**
     * Recursively loads all .js files within a directory and all of those sub-directories.
     * @param directory the entry directory
     * @throws if it cannot access the directory or any subdirectories or files AND we are in strict mode
     * @throws if a loaded file is invalid AND we are in strict mode
     * @returns A map of identifiers to plugins
     */
    async loadDirectory(directory) {
        // Ensure we have access to this directory
        await fs.access(directory);
        const maps = [];
        const contents = (await fs.readdir(directory)).map(file => path.join(directory, file));
        const folders = [];
        const files = [];
        // Parse all files/folders within this directory and sort them between the `folders` and `files` array
        for (const content of contents) {
            const stat = await fs.lstat(content);
            if (stat.isDirectory()) {
                folders.push(content);
            }
            else {
                // Only use `.js` files
                if (!content.endsWith(".js")) {
                    continue;
                }
                files.push(content);
            }
        }
        // Load all directories (this is where the recrusion happens)
        for (const subdir of folders) {
            maps.push(await this.loadDirectory(subdir));
        }
        const thisMap = new Map();
        for (const file of files) {
            try {
                // Files *can* and *should* export multiple plugins, allowing for one dylib to offer multiple smaller plugins with the specific, isolated features.
                // This allows finer-grain control over which features can be enabled on what services, and what services should get what events.
                const plugins = await this.loadFile(file);
                if (plugins) {
                    for (const plugin of plugins) {
                        thisMap.set(plugin.identifier, plugin);
                    }
                }
            }
            catch (e) {
                if (this.options.strict) {
                    throw e;
                }
                continue;
            }
        }
        maps.push(thisMap);
        const merged = await merge(maps);
        await this.intake(merged);
        return merged;
    }
    /**
     * Loads plugin(s) from a given file
     * @param path the file path
     * @returns an array of plugins, or null if the file was invalid/empty
     */
    async loadFile(path) {
        // Ensure we have access
        await fs.access(path);
        let plugin = require(path);
        if (typeof plugin === "undefined") {
            return null;
        }
        plugin = await this.parseRequiredFile(plugin);
        const plugins = [];
        for (let key in plugin) {
            let loaded;
            try {
                loaded = await this.loadRaw(plugin[key]);
            }
            catch (e) {
                if (this.options.strict) {
                    throw e;
                }
                continue;
            }
            if (loaded) {
                this.pluginPathCache.set(loaded.identifier, path);
                plugins.push(loaded);
            }
        }
        return plugins.length === 0 ? null : plugins;
    }
    async parseRequiredFile(plugin) {
        if (typeof plugin === "function") {
            plugin = { plugin };
        }
        return plugin;
    }
    /**
     * Loads a single, raw plugin (presumably from a class object)
     * @param raw the raw plugin
     * @returns the plugin or null
     */
    async loadRaw(raw) {
        const plugin = new raw(this.mainInstance);
        if (this.options.rawPluginValidator(plugin)) {
            this.DoNotLoadLoadedPlugins(plugin.identifier);
            plugin.init && await plugin.init();
            return plugin;
        }
        return null;
    }
    /**
     * Get a plugin with the given name
     * @param name the name
     */
    plugin(name) {
        return this.pluginsMap.get(name) || null;
    }
    /**
     * Unloads all plugins currently in the DylibLoader
     */
    async unloadAll() {
        const reloads = [];
        for (const [, plugin] of this.pluginsMap) {
            reloads.push(this.unload(plugin));
        }
        await Promise.all(reloads);
    }
    /**
     * Reloads all plugins currently in the DylibLoader
     */
    async reloadAll() {
        const reloads = [];
        for (const [, plugin] of this.pluginsMap) {
            reloads.push(this.reload(plugin));
        }
        await Promise.all(reloads);
        return this.pluginsMap;
    }
    /**
     * Reloads a given plugin
     * @param plugin the plugin to reload
     */
    async reload(plugin) {
        plugin = typeof plugin === "string" ? this.pluginsMap.get(plugin) : plugin;
        if (!plugin) {
            return null;
        }
        const { identifier } = plugin;
        await this.unload(plugin);
        const newPlugin = await this.loadCached(identifier);
        return newPlugin;
    }
    /**
     * Load a plugin that was previously unloaded.
     * @param plugin the plugin identifier
     */
    async loadCached(plugin) {
        if (!this.pluginPathCache.has(plugin)) {
            throw new ReferenceError("No plugin with the given ID is in the cache.");
        }
        this.DoNotLoadLoadedPlugins(plugin);
        const cachedPath = this.pluginPathCache.get(plugin);
        delete require.cache[require.resolve(cachedPath)];
        const pluginSet = await this.parseRequiredFile(await Promise.resolve().then(() => __importStar(require(cachedPath))));
        // This procedure is a lot more relaxed as any plugins that are taken in by this have already been validated
        for (let key in pluginSet) {
            try {
                const possiblePlugin = new pluginSet[key](this.mainInstance);
                if (possiblePlugin.identifier === plugin && this.pluginPathCache.has(possiblePlugin.identifier)) {
                    possiblePlugin.init && await possiblePlugin.init();
                    this.pluginsMap.set(possiblePlugin.identifier, possiblePlugin);
                    return possiblePlugin;
                }
            }
            catch (e) {
                if (this.options.strict) {
                    throw e;
                }
                continue;
            }
        }
        return null;
    }
    /**
     * Unload a plugin that is currently loaded
     * @param plugin the plugin identifier or plugin object
     */
    async unload(plugin) {
        plugin = typeof plugin === "string" ? this.pluginsMap.get(plugin) : plugin;
        if (!plugin) {
            return;
        }
        this.pluginsMap.delete(plugin.identifier);
        await this.reflect(plugin);
        // Stop dispatching events.
        Object.defineProperty(plugin, "takesEvents", { value: false, writable: false, configurable: false });
        Object.defineProperty(plugin, "__unloaded", { configurable: false, get() { return true; }, set() { throw new Error("Attempted to change the unloaded state of a plugin."); } });
        plugin.deinit && await plugin.deinit();
    }
    /**
     * Disables a plugin (stops sending events and moves it to a separate container)
     * @param plugin the plugin to disable
     */
    async disable(plugin) {
        plugin = this.resolveFuzzy(plugin);
        if (!plugin) {
            if (this.options.strict) {
                throw new Error("Plugin does not exist.");
            }
            return;
        }
        plugin.deinit && await plugin.deinit();
        this.updateInternalListeningState(plugin, false);
        this.disabledPlugins.set(plugin.identifier, plugin);
        this.pluginsMap.delete(plugin.identifier);
    }
    /**
     * Enables a plugin (begin sending events again and moves it to the main container)
     * @param plugin the plugin to enable
     */
    async enable(plugin) {
        plugin = this.resolveFuzzy(plugin, this.disabledPlugins);
        if (!plugin) {
            if (this.options.strict) {
                throw new Error("Plugin is not disabled.");
            }
            return;
        }
        plugin.init && await plugin.init();
        this.updateInternalListeningState(plugin, true);
        this.disabledPlugins.delete(plugin.identifier);
        this.pluginsMap.set(plugin.identifier, plugin);
    }
    /**
     * Dispatches an event to all plugins (given they pass checkpoints)
     * @param name the event name
     * @param event the event data
     */
    async dispatch(name, event) {
        const events = [];
        for (const plugin of this.plugins) {
            if (!this.shouldReceiveEvent(plugin, name, event)) {
                continue;
            }
            events.push(plugin.event(name, event));
        }
        await Promise.all(events);
    }
    /**
     * Iterate over a plugin map and add them to the main ledger
     * @param plugins the plugin map
     */
    async intake(plugins) {
        for (const [key, value] of plugins) {
            this.pluginsMap.set(key, value);
        }
    }
    /**
     * Returns whether a plugin should receive a given event
     * @param plugin the plugin to check for
     * @param eventName the event name
     * @param event the event
     * @returns whether the plugin can receive the event
     */
    shouldReceiveEvent(plugin, eventName, event) {
        return !this.isInternalEventBlocked(plugin) && !!plugin.takesEvents && !!plugin.event && (this.options.shouldReceiveEvent ? this.options.shouldReceiveEvent(plugin, eventName, event) : true);
    }
    /**
     * Set a plugin object to be a mirror of the always up-to-date plugin
     * @param plugin the plugin to mirror
     */
    async reflect(plugin) {
        const { identifier } = plugin;
        await ReflectionUtils_1.reflect(plugin, () => this.pluginsMap.get(identifier));
    }
    /**
     * Sets the internal event-listening state
     * @param plugin the plugin
     * @param value the state
     */
    updateInternalListeningState(plugin, value) {
        Object.defineProperty(plugin, "__listening", { value, writable: false, configurable: true });
    }
    /**
     * Determines whether a plugin is internally blocked from events
     * @param plugin the plugin
     */
    isInternalEventBlocked(plugin) {
        const listening = plugin.__listening;
        return typeof listening === "undefined" ? false : typeof listening === "boolean" ? !listening : false;
    }
    /**
     * Resolves a fuzzy plugin to a plugin or null
     * @param plugin the fuzzy plugin
     */
    resolveFuzzy(plugin, mapOverride = this.pluginsMap) {
        return typeof plugin === "string" ? (mapOverride.get(plugin) || null) : plugin;
    }
    /**
     * Throws if the plugin is already loaded
     * @param plugin the plugin ID
     */
    DoNotLoadLoadedPlugins(plugin) {
        if (this.pluginsMap.has(plugin)) {
            throw new Error("Will not load a plugin that is already loaded.");
        }
    }
}
exports.DylibLoader = DylibLoader;
