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
export declare type FuzzyPlugin<Event, Plugin extends DylibBase<Event>> = Plugin | string | null;
/**
 * A lean and efficient plug-in manager
 */
export declare class DylibLoader<Event, Main, Plugin extends DylibBase<Event>> {
    readonly options: DylibLoaderOptions<Event, Plugin>;
    private mainInstance;
    /**
     * A map of identifiers to plugins
     */
    private pluginsMap;
    /**
     * A map of identifiers to DISABLED plugins
     */
    private disabledPlugins;
    /**
     * A map of identifiers to load-locations
     */
    private pluginPathCache;
    /**
     * An array of plugins
     */
    private readonly plugins;
    /**
     *
     * @param options the options and functions for this loader
     * @param mainInstance the main instance to pass to plugins
     */
    constructor(options: DylibLoaderOptions<Event, Plugin>, mainInstance: Main);
    /**
     * Recursively loads all .js files within a directory and all of those sub-directories.
     * @param directory the entry directory
     * @throws if it cannot access the directory or any subdirectories or files AND we are in strict mode
     * @throws if a loaded file is invalid AND we are in strict mode
     * @returns A map of identifiers to plugins
     */
    loadDirectory(directory: string): Promise<Map<string, Plugin>>;
    /**
     * Loads plugin(s) from a given file
     * @param path the file path
     * @returns an array of plugins, or null if the file was invalid/empty
     */
    loadFile(path: string): Promise<Plugin[] | null>;
    private parseRequiredFile(plugin);
    /**
     * Loads a single, raw plugin (presumably from a class object)
     * @param raw the raw plugin
     * @returns the plugin or null
     */
    loadRaw(raw: any): Promise<Plugin | null>;
    /**
     * Get a plugin with the given name
     * @param name the name
     */
    plugin(name: string): Plugin | null;
    /**
     * Unloads all plugins currently in the DylibLoader
     */
    unloadAll(): Promise<void>;
    /**
     * Reloads all plugins currently in the DylibLoader
     */
    reloadAll(): Promise<Map<string, Plugin>>;
    /**
     * Reloads a given plugin
     * @param plugin the plugin to reload
     */
    reload(plugin: Plugin | string): Promise<Plugin | null>;
    /**
     * Load a plugin that was previously unloaded.
     * @param plugin the plugin identifier
     */
    loadCached(plugin: string): Promise<Plugin | null>;
    /**
     * Unload a plugin that is currently loaded
     * @param plugin the plugin identifier or plugin object
     */
    unload(plugin: Plugin | string): Promise<void>;
    /**
     * Disables a plugin (stops sending events and moves it to a separate container)
     * @param plugin the plugin to disable
     */
    disable(plugin: FuzzyPlugin<Event, Plugin>): Promise<void>;
    /**
     * Enables a plugin (begin sending events again and moves it to the main container)
     * @param plugin the plugin to enable
     */
    enable(plugin: FuzzyPlugin<Event, Plugin>): Promise<void>;
    /**
     * Dispatches an event to all plugins (given they pass checkpoints)
     * @param name the event name
     * @param event the event data
     */
    dispatch(name: string, event: Event): Promise<void>;
    /**
     * Iterate over a plugin map and add them to the main ledger
     * @param plugins the plugin map
     */
    private intake(plugins);
    /**
     * Returns whether a plugin should receive a given event
     * @param plugin the plugin to check for
     * @param eventName the event name
     * @param event the event
     * @returns whether the plugin can receive the event
     */
    protected shouldReceiveEvent(plugin: Plugin, eventName: string, event: Event): plugin is Plugin & {
        event: (name: string, data: Event) => any;
    };
    /**
     * Set a plugin object to be a mirror of the always up-to-date plugin
     * @param plugin the plugin to mirror
     */
    protected reflect(plugin: Plugin): Promise<void>;
    /**
     * Sets the internal event-listening state
     * @param plugin the plugin
     * @param value the state
     */
    protected updateInternalListeningState(plugin: Plugin, value: boolean): void;
    /**
     * Determines whether a plugin is internally blocked from events
     * @param plugin the plugin
     */
    protected isInternalEventBlocked(plugin: Plugin): boolean;
    /**
     * Resolves a fuzzy plugin to a plugin or null
     * @param plugin the fuzzy plugin
     */
    protected resolveFuzzy(plugin: FuzzyPlugin<Event, Plugin>, mapOverride?: Map<string, Plugin>): Plugin | null;
    /**
     * Throws if the plugin is already loaded
     * @param plugin the plugin ID
     */
    private DoNotLoadLoadedPlugins(plugin);
}
