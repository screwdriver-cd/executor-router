'use strict';

const ANNOTATION_EXECUTOR_TYPE = 'beta.screwdriver.cd/executor'; // Key in annotations object that maps to an executor NPM module
const Executor = require('screwdriver-executor-base');

class ExecutorRouter extends Executor {
    /**
     * Constructs a router for different Executor strategies.
     * @method constructor
     * @param  {Object}         config                      Object with executor and ecosystem
     * @param  {String}         [config.defaultPlugin]      Optional default executor
     * @param  {Object}         [config.ecosystem]          Optional object with ecosystem values
     * @param  {Array}          config.executor             Array of executors to load
     * @param  {String}         config.executor[x].name     Name of the executor NPM module to load
     * @param  {String}         config.executor[x].options  Configuration to construct the module with
     */
    constructor(config = {}) {
        const ecosystem = config.ecosystem || {};
        const executorConfig = config.executor;
        const defaultPlugin = config.defaultPlugin;

        if (!executorConfig || !(Array.isArray(executorConfig)) || executorConfig.length === 0) {
            throw new Error('No executor config passed in.');
        }

        super();

        executorConfig.forEach((plugin) => {
            let ExecutorPlugin;

            try {
                // eslint-disable-next-line global-require, import/no-dynamic-require
                ExecutorPlugin = require(`screwdriver-executor-${plugin.name}`);
            } catch (err) {
                console.error(err);

                return;
            }

            const options = Object.assign({ ecosystem }, plugin.options); // Add ecosystem to executor options
            const executorPlugin = new ExecutorPlugin(options);

            if (defaultPlugin && defaultPlugin === plugin.name) {
                // set the default plugin to the desired one
                this.defaultExecutor = executorPlugin;
            } else if (!defaultPlugin && !this.defaultExecutor) {
                // When given no default plugin, use the first module we instantiated
                this.defaultExecutor = executorPlugin;
            }

            this[plugin.name] = executorPlugin;
        });

        if (!this.defaultExecutor) {
            throw new Error('No default executor set.');
        }
    }

    /**
     * Starts a new build in an executor
     * @method _start
     * @param  {Object} config               Configuration
     * @param  {Object} [config.annotations] Optional key/value object
     * @param  {String} config.apiUri        Screwdriver's API
     * @param  {String} config.buildId       Unique ID for a build
     * @param  {String} config.container     Container for the build to run in
     * @param  {String} config.token         JWT to act on behalf of the build
     * @return {Promise}
     */
    _start(config) {
        const annotations = config.annotations || {};
        const executorType = annotations[ANNOTATION_EXECUTOR_TYPE];
        const executor = this[executorType] || this.defaultExecutor; // Route to executor (based on annotations) or use default executor

        return executor.start(config);
    }

    /**
     * Stop a running or finished build
     * @method _stop
     * @param  {Object} config               Configuration
     * @param  {Object} [config.annotations] Optional key/value object
     * @param  {String} config.buildId       Unique ID for a build
     * @return {Promise}
     */
    _stop(config) {
        const annotations = config.annotations || {};
        const executorType = annotations[ANNOTATION_EXECUTOR_TYPE];
        const executor = this[executorType] || this.defaultExecutor; // Route to executor (based on annotations) or use default executor

        return executor.stop(config);
    }
}

module.exports = ExecutorRouter;
