'use strict';

const ANNOTATION_EXECUTOR_TYPE = 'executor'; // Key in annotations object that maps to an executor NPM module
const Executor = require('screwdriver-executor-base');
const logger = require('screwdriver-logger');

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
        const { executor, defaultPlugin } = config;

        if (!executor || !Array.isArray(executor) || executor.length === 0) {
            throw new Error('No executor config passed in.');
        }
        super();

        let ExecutorPlugin;

        this._executors = [];

        executor.forEach(plugin => {
            try {
                // eslint-disable-next-line global-require, import/no-dynamic-require
                ExecutorPlugin = require(`screwdriver-executor-${plugin.name}`);
                this._executors.push(plugin);
            } catch (err) {
                logger.error(err.message);

                return;
            }
            // Add ecosystem to executor options
            const options = Object.assign({ ecosystem }, plugin.options);

            this[plugin.name] = new ExecutorPlugin(options);
        });

        // executor rules chain
        // order-> annotated > weighted > default
        this._executorRules = [
            {
                name: 'annotated',
                check: buildConfig => {
                    const annotations = this.parseAnnotations(buildConfig.annotations || {});

                    return annotations[ANNOTATION_EXECUTOR_TYPE];
                }
            },
            {
                name: 'weighted',
                check: buildConfig => {
                    const allowedExecutors = this.checkExclusions(this._executors, buildConfig.container);

                    return this.getWeightedExecutor(allowedExecutors);
                }
            },
            {
                name: 'default',
                check: () => defaultPlugin || (this._executors[0] && this._executors[0].name)
            }
        ];

        if (!this._executorRules.find(a => a.name === 'default').check()) {
            throw new Error('No default executor set.');
        }
    }

    /**
     * Returns the executor based on a random selection optimized on weightage
     * @param {Array} executors
     * @return {String} executor name
     */
    getWeightedExecutor(executors) {
        const totalWeight = executors.reduce((prev, curr) => prev + (+curr.weightage || 0), 0);

        if (totalWeight === 0) {
            return undefined;
        }
        const number = Math.floor(Math.random() * totalWeight);

        let sum = 0;

        for (let i = 0; i < executors.length; i += 1) {
            sum += parseInt(executors[i].weightage, 10) || 0;

            if (number < sum) return executors[i].name;
        }

        return executors[0].name;
    }

    /**
     * Checks if executor is excluded for a container.
     * @method checkExclusions
     * @param {Array} executors
     * @param {String} container
     */
    checkExclusions(executors, container) {
        return executors.filter(executor => {
            const { exclusions } = executor;

            if (!exclusions) return true;

            return !exclusions.some(item => {
                const regEx = new RegExp(item, 'gi');

                return container.match(regEx);
            });
        });
    }

    /**
     * Evaluates the executor rules by priority and returns the first matching executor
     * @method getExecutor
     * @param  {Object} config               Configuration
     * @param  {Object} [config.annotations] Optional key/value object
     * @param  {String} config.apiUri        Screwdriver's API
     * @param  {Object} [config.build]       Build object
     * @param  {String} config.buildId       Unique ID for a build
     * @param  {String} config.container     Container for the build to run in
     * @param  {String} config.token         JWT to act on behalf of the build
     * @return {Object} executor object
     */
    getExecutor(config) {
        let executorName;

        for (const rule of this._executorRules) {
            try {
                executorName = rule.check(config);
                if (executorName && this[executorName]) {
                    break;
                }
            } catch (err) {
                logger.error(`Failed to validate executor rule ${rule.name}`, err);
            }
        }

        return this[executorName];
    }

    /**
     * Starts a new build in an executor
     * @method _start
     * @param  {Object} config               Configuration
     * @param  {Object} [config.annotations] Optional key/value object
     * @param  {String} config.apiUri        Screwdriver's API
     * @param  {Object} [config.build]       Build object
     * @param  {String} config.buildId       Unique ID for a build
     * @param  {String} config.container     Container for the build to run in
     * @param  {String} config.token         JWT to act on behalf of the build
     * @return {Promise}
     */
    _start(config) {
        const executor = this.getExecutor(config);

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
        const executor = this.getExecutor(config);

        return executor.stop(config);
    }
}

module.exports = ExecutorRouter;
