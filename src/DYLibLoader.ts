import fs = require("fs-extra");
import path = require("path");
import { reflect } from "./ReflectionUtils";

/**
 * A base for all dynamic libraries
 */
export interface DylibBase<Event> {
    identifier: string;
    version: string;
    init?: () => Promise<void>;
    deinit?: () => Promise<void>;
    takesEvents?: boolean;
    event?: (name: string, data: Event) => Promise<void>;
}

/**
 * Options for the dylib-loader
 */
export interface DylibLoaderOptions<Event, Plugin extends DylibBase<Event>> {
    readonly rawPluginValidator: (rawPlugin: any) => rawPlugin is Plugin;
    readonly shouldReceiveEvent?: (plugin: Plugin, eventName: string, event: Event) => boolean;
    readonly strict?: boolean;
}

export type FuzzyPlugin<Event, Plugin extends DylibBase<Event>> = Plugin | string | null;

/**
 * Basic map-merge function
 * @param maps the maps to merge
 */
const merge = async <K, V>(maps: Array<Map<K,V>>) => {
    const masterMap: Map<K, V> = new Map();
    for (const map of maps) {
        for (const [key, value] of map) {
            masterMap.set(key, value);
        }
    }
    return masterMap;
}

/**
 * A lean and efficient plug-in manager
 */
export class DylibLoader<Event, Main, Plugin extends DylibBase<Event>> {

    /**
     * A map of identifiers to plugins
     */
    private pluginsMap: Map<string, Plugin> = new Map();
    /**
     * A map of identifiers to DISABLED plugins
     */
    private disabledPlugins: Map<string, Plugin> = new Map();
    /**
     * A map of identifiers to load-locations
     */
    private pluginPathCache: Map<string, string> = new Map();
    /**
     * An array of plugins
     */
    private get plugins(): Plugin[] {
        return Array.from(this.pluginsMap.values());
    }

    /**
     * 
     * @param options the options and functions for this loader
     * @param mainInstance the main instance to pass to plugins
     */
    public constructor(public readonly options: DylibLoaderOptions<Event, Plugin>, private mainInstance: Main) {
    }
    
    /**
     * Recursively loads all .js files within a directory and all of those sub-directories.
     * @param directory the entry directory
     * @throws if it cannot access the directory or any subdirectories or files AND we are in strict mode
     * @throws if a loaded file is invalid AND we are in strict mode
     * @returns A map of identifiers to plugins
     */
    public async loadDirectory(directory: string): Promise<Map<string, Plugin>> {
        // Ensure we have access to this directory
        await fs.access(directory);
        const maps: Array<Map<string, Plugin>> = [];
        const contents = (await fs.readdir(directory)).map(file => path.join(directory, file));
        const folders: string[] = [];
        const files: string[] = [];
        // Parse all files/folders within this directory and sort them between the `folders` and `files` array
        for (const content of contents) {
            const stat = await fs.lstat(content);
            if (stat.isDirectory()) {
                folders.push(content);
            } else {
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
        const thisMap: Map<string, Plugin> = new Map();
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
            } catch (e) {
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
    public async loadFile(path: string): Promise<Plugin[] | null> {
        // Ensure we have access
        await fs.access(path);
        let plugin = require(path);
        if (typeof plugin === "undefined") {
            return null;
        }
        plugin = await this.parseRequiredFile(plugin);
        const plugins: Plugin[] = [];
        for (let key in plugin) {
            let loaded: Plugin | null;
            try {
                loaded = await this.loadRaw(plugin[key]);
            } catch (e) {
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

    private async parseRequiredFile(plugin: any): Promise<{[key: string]: {new(main: Main): Plugin}}> {
        if (typeof plugin === "function") {
            plugin = {plugin}
        }
        return plugin;
    }

    /**
     * Loads a single, raw plugin (presumably from a class object)
     * @param raw the raw plugin
     * @returns the plugin or null
     */
    public async loadRaw(raw: any): Promise<Plugin | null> {
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
    public plugin(name: string): Plugin | null {
        return this.pluginsMap.get(name) || null;
    }

    /**
     * Unloads all plugins currently in the DylibLoader
     */
    public async unloadAll(): Promise<void> {
        const reloads: Array<Promise<void>> = [];
        for (const [,plugin] of this.pluginsMap) {
            reloads.push(this.unload(plugin));
        }
        await Promise.all(reloads);
    }

    /**
     * Reloads all plugins currently in the DylibLoader
     */
    public async reloadAll(): Promise<Map<string, Plugin>> {
        const reloads: Array<Promise<Plugin | null>> = [];
        for (const [,plugin] of this.pluginsMap) {
            reloads.push(this.reload(plugin));
        }
        await Promise.all(reloads);
        return this.pluginsMap;
    }

    /**
     * Reloads a given plugin
     * @param plugin the plugin to reload
     */
    public async reload(plugin: Plugin | string): Promise<Plugin | null> {
        plugin = typeof plugin === "string" ? (this.pluginsMap.get(plugin) as Plugin) : plugin;
        if (!plugin) {
            return null;
        }
        const {identifier} = plugin;
        await this.unload(plugin);
        const newPlugin = await this.loadCached(identifier);
        return newPlugin;
    }

    /**
     * Load a plugin that was previously unloaded.
     * @param plugin the plugin identifier
     */
    public async loadCached(plugin: string): Promise<Plugin | null> {
        if (!this.pluginPathCache.has(plugin)) {
            throw new ReferenceError("No plugin with the given ID is in the cache.");
        }
        this.DoNotLoadLoadedPlugins(plugin);
        const cachedPath = this.pluginPathCache.get(plugin) as string;
        delete require.cache[require.resolve(cachedPath)];
        const pluginSet = await this.parseRequiredFile(await import(cachedPath));
        // This procedure is a lot more relaxed as any plugins that are taken in by this have already been validated
        for (let key in pluginSet) {
            try {
                const possiblePlugin = new pluginSet[key](this.mainInstance);
                if (possiblePlugin.identifier === plugin && this.pluginPathCache.has(possiblePlugin.identifier)) {
                    possiblePlugin.init && await possiblePlugin.init();
                    this.pluginsMap.set(possiblePlugin.identifier, possiblePlugin);
                    return possiblePlugin;
                }
            } catch (e) {
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
    public async unload(plugin: Plugin | string): Promise<void> {
        plugin = typeof plugin === "string" ? (this.pluginsMap.get(plugin) as Plugin): plugin;
        if (!plugin) {
            return;
        }
        this.pluginsMap.delete(plugin.identifier);
        await this.reflect(plugin);
        // Stop dispatching events.
        Object.defineProperty(plugin, "takesEvents", {value: false, writable: false, configurable: false});
        Object.defineProperty(plugin, "__unloaded", {configurable: false, get(){return true}, set(){throw new Error("Attempted to change the unloaded state of a plugin.")}})
        plugin.deinit && await plugin.deinit();
    }

    /**
     * Disables a plugin (stops sending events and moves it to a separate container)
     * @param plugin the plugin to disable
     */
    public async disable(plugin: FuzzyPlugin<Event, Plugin>): Promise<void> {
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
    public async enable(plugin: FuzzyPlugin<Event, Plugin>): Promise<void> {
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
    public async dispatch(name: string, event: Event): Promise<void> {
        const events: any[] = [];
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
    private async intake(plugins: Map<string, Plugin>): Promise<void> {
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
    protected shouldReceiveEvent(plugin: Plugin, eventName: string, event: Event): plugin is Plugin & {event: (name: string, data: Event) => any} {
        return !this.isInternalEventBlocked(plugin) && !!plugin.takesEvents && !!plugin.event && (this.options.shouldReceiveEvent ? this.options.shouldReceiveEvent(plugin, eventName, event) : true);
    }

    /**
     * Set a plugin object to be a mirror of the always up-to-date plugin
     * @param plugin the plugin to mirror
     */
    protected async reflect(plugin: Plugin): Promise<void> {
        const {identifier} = plugin;
        await reflect(plugin, () => this.pluginsMap.get(identifier));
    }

    /**
     * Sets the internal event-listening state
     * @param plugin the plugin
     * @param value the state
     */
    protected updateInternalListeningState(plugin: Plugin, value: boolean): void {
        Object.defineProperty(plugin, "__listening", {value, writable: false, configurable: true});
    }

    /**
     * Determines whether a plugin is internally blocked from events
     * @param plugin the plugin
     */
    protected isInternalEventBlocked(plugin: Plugin): boolean {
        const listening = (plugin as any).__listening;
        return typeof listening === "undefined" ? false : typeof listening === "boolean" ? !listening : false;
    }

    /**
     * Resolves a fuzzy plugin to a plugin or null
     * @param plugin the fuzzy plugin
     */
    protected resolveFuzzy(plugin: FuzzyPlugin<Event, Plugin>, mapOverride: Map<string, Plugin> = this.pluginsMap): Plugin | null {
        return typeof plugin === "string" ? (mapOverride.get(plugin) || null) : plugin;
    }

    /**
     * Throws if the plugin is already loaded
     * @param plugin the plugin ID
     */
    private DoNotLoadLoadedPlugins(plugin: string) {
        if (this.pluginsMap.has(plugin)) {
            throw new Error("Will not load a plugin that is already loaded.");
        }
    }
    
}