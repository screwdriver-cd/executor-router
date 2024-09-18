'use strict';

/* eslint-disable no-underscore-dangle */

const chai = require('chai');
const assert = chai.assert;
const mockery = require('mockery');
const sinon = require('sinon');
const testExecutor = require('./data/testExecutor');

sinon.assert.expose(chai.assert, { prefix: '' });

describe('index test', () => {
    let Executor;
    let executor;
    let fsMock;
    let k8sExecutorMock;
    let exampleExecutorMock;
    let testExecutorMock;
    const ecosystem = {
        api: 'http://api.com',
        store: 'http://store.com'
    };
    const examplePluginOptions = {
        example: {
            host: 'somehost',
            token: 'sometoken',
            jobsNamespace: 'somenamespace'
        },
        launchVersion: 'someversion',
        prefix: 'someprefix'
    };
    const k8sPluginOptions = {
        kubernetes: {
            host: 'K8S_HOST',
            token: 'K8S_TOKEN',
            jobsNamespace: 'K8S_JOBS_NAMESPACE'
        },
        launchVersion: 'LAUNCH_VERSION',
        prefix: 'EXECUTOR_PREFIX'
    };

    const testPluginOptions = {
        kubernetes: {
            host: 'testhost',
            token: 'testtoken',
            jobsNamespace: 'testnamespace'
        },
        launchVersion: 'testversion',
        prefix: 'testprefix'
    };

    before(() => {
        mockery.enable({
            useCleanCache: true,
            warnOnUnregistered: false
        });
    });

    beforeEach(() => {
        fsMock = {
            readFileSync: sinon.stub()
        };

        fsMock.readFileSync.withArgs('/var/run/secrets/kubernetes.io/serviceaccount/token').returns('api_key');

        k8sExecutorMock = {
            _start: sinon.stub(),
            _stop: sinon.stub(),
            _verify: sinon.stub()
        };
        exampleExecutorMock = {
            _start: sinon.stub(),
            _stop: sinon.stub(),
            _verify: sinon.stub()
        };
        testExecutorMock = {
            _start: sinon.stub(),
            _stop: sinon.stub(),
            _verify: sinon.stub()
        };
        mockery.registerMock('fs', fsMock);
        mockery.registerMock('screwdriver-executor-k8s', testExecutor(k8sExecutorMock));
        mockery.registerMock('screwdriver-executor-example', testExecutor(exampleExecutorMock));
        mockery.registerMock('screwdriver-executor-test', testExecutor(testExecutorMock));

        // eslint-disable-next-line global-require
        Executor = require('../index');

        executor = new Executor({
            ecosystem,
            executor: [
                {
                    name: 'k8s',
                    options: k8sPluginOptions
                },
                {
                    name: 'test-sandbox',
                    pluginName: 'test',
                    options: testPluginOptions
                },
                {
                    name: 'example',
                    options: examplePluginOptions
                },
                {
                    name: 'test',
                    options: testPluginOptions
                }
            ]
        });
    });

    afterEach(() => {
        mockery.deregisterAll();
    });

    after(() => {
        mockery.disable();
    });

    describe('construction', () => {
        let exampleOptions;
        let k8sOptions;

        beforeEach(() => {
            exampleOptions = {
                ecosystem,
                example: {
                    host: 'somehost',
                    token: 'sometoken',
                    jobsNamespace: 'somenamespace'
                },
                launchVersion: 'someversion',
                prefix: 'someprefix'
            };
            k8sOptions = {
                ecosystem,
                kubernetes: {
                    host: 'K8S_HOST',
                    token: 'K8S_TOKEN',
                    jobsNamespace: 'K8S_JOBS_NAMESPACE'
                },
                launchVersion: 'LAUNCH_VERSION',
                prefix: 'EXECUTOR_PREFIX'
            };
        });

        it('defaults to an empty object when the ecosystem does not exist', () => {
            executor = new Executor({
                executor: [
                    {
                        name: 'k8s',
                        options: k8sPluginOptions
                    }
                ]
            });

            const executorKubernetes = executor.k8s;

            k8sOptions.ecosystem = {};

            assert.deepEqual(executorKubernetes.constructorParams, k8sOptions);
        });

        it('defaults to an empty object when config does not exist', () => {
            assert.throws(
                () => {
                    executor = new Executor();
                },
                Error,
                'No executor config passed in.'
            );
        });

        it('throws an error when the executor config does not exist', () => {
            assert.throws(
                () => {
                    executor = new Executor({ ecosystem });
                },
                Error,
                'No executor config passed in.'
            );
        });

        it('throws an error when the executor config is not an array', () => {
            assert.throws(
                () => {
                    executor = new Executor({
                        ecosystem,
                        executor: {
                            name: 'k8s',
                            options: k8sPluginOptions
                        }
                    });
                },
                Error,
                'No executor config passed in.'
            );
        });

        it('throws an error when the executor config is an empty array', () => {
            assert.throws(
                () => {
                    executor = new Executor({
                        ecosystem,
                        executor: []
                    });
                },
                Error,
                'No executor config passed in.'
            );
        });

        it('throws an error when no default executor is set', () => {
            assert.throws(
                () => {
                    executor = new Executor({
                        ecosystem,
                        executor: [
                            {
                                name: 'DNE'
                            },
                            {
                                name: 'DNE2',
                                options: k8sPluginOptions
                            }
                        ]
                    });
                },
                Error,
                'No default executor set.'
            );
        });

        it('does not throw an error when a npm module cannot be registered', () => {
            assert.doesNotThrow(() => {
                executor = new Executor({
                    ecosystem,
                    executor: [
                        {
                            name: 'DNE'
                        },
                        {
                            name: 'k8s',
                            options: k8sPluginOptions
                        }
                    ]
                });
            });
        });

        it('registers multiple plugins', () => {
            const executorKubernetes = executor.k8s;
            const exampleExecutor = executor.example;

            assert.deepEqual(executorKubernetes.constructorParams, k8sOptions);
            assert.deepEqual(exampleExecutor.constructorParams, exampleOptions);
        });

        it('registers a single plugin', () => {
            executor = new Executor({
                ecosystem: {
                    api: 'http://api.com',
                    store: 'http://store.com'
                },
                executor: [
                    {
                        name: 'k8s',
                        options: k8sPluginOptions
                    }
                ]
            });

            const executorKubernetes = executor.k8s;

            assert.deepEqual(executorKubernetes.constructorParams, k8sOptions);
        });
    });

    describe('_start', () => {
        it('default executor when no annotation is given', () => {
            executor = new Executor({
                defaultPlugin: 'example',
                ecosystem,
                executor: [
                    {
                        name: 'k8s',
                        options: k8sPluginOptions
                    },
                    {
                        name: 'example',
                        options: examplePluginOptions
                    }
                ]
            });
            exampleExecutorMock._start.resolves('exampleExecutorMockResult');

            return executor
                .start({
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'asdf'
                })
                .then(result => {
                    assert.strictEqual(result, 'exampleExecutorMockResult');
                });
        });

        it('default executor is the first one when given no executor annotation', () => {
            k8sExecutorMock._start.resolves('k8sExecutorResult');

            return executor
                .start({
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'qwer'
                })
                .then(result => {
                    assert.strictEqual(result, 'k8sExecutorResult');
                    assert.calledOnce(k8sExecutorMock._start);
                    assert.notCalled(exampleExecutorMock._start);
                });
        });

        it('default executor is the first one when given an invalid executor annotation', () => {
            k8sExecutorMock._start.resolves('k8sExecutorResult');
            exampleExecutorMock._start.rejects();

            return executor
                .start({
                    annotations: {
                        'beta.screwdriver.cd/executor': 'test-executor'
                    },
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'qwer'
                })
                .then(result => {
                    assert.strictEqual(result, 'k8sExecutorResult');
                    assert.calledOnce(k8sExecutorMock._start);
                    assert.notCalled(exampleExecutorMock._start);
                });
        });

        it('uses an annotation to determine which executor to call', () => {
            k8sExecutorMock._start.rejects();
            exampleExecutorMock._start.resolves('exampleExecutorResult');

            return executor
                .start({
                    annotations: {
                        'beta.screwdriver.cd/executor': 'example'
                    },
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'qwer'
                })
                .then(result => {
                    assert.strictEqual(result, 'exampleExecutorResult');
                    assert.calledOnce(exampleExecutorMock._start);
                    assert.notCalled(k8sExecutorMock._start);
                });
        });

        it('uses proper executor when called with a different name', () => {
            k8sExecutorMock._start.rejects();
            testExecutorMock._start.resolves('testExecutorResult');

            return executor
                .start({
                    annotations: {
                        'screwdriver.cd/executor': 'test-sandbox'
                    },
                    buildId: 920,
                    container: 'node:12',
                    apiUri: 'http://api.com',
                    token: 'qwer'
                })
                .then(result => {
                    assert.notCalled(k8sExecutorMock._start);
                    assert.strictEqual(result, 'testExecutorResult');
                    assert.calledOnce(testExecutorMock._start);
                });
        });

        it('propogates the failure from initiating a start', () => {
            const testError = new Error('triggeredError');

            k8sExecutorMock._start.rejects(testError);

            return executor
                .start({
                    annotations: {
                        'beta.screwdriver.cd/executor': 'k8s'
                    },
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'qwer'
                })
                .then(assert.fail, err => {
                    assert.deepEqual(err, testError);
                });
        });
    });

    describe('_stop', () => {
        const apiUri = 'https://api.sd.cd';

        it('default executor when no annotation is given', () => {
            executor = new Executor({
                defaultPlugin: 'example',
                ecosystem,
                executor: [
                    {
                        name: 'k8s',
                        options: k8sPluginOptions
                    },
                    {
                        name: 'example',
                        options: examplePluginOptions
                    }
                ]
            });
            exampleExecutorMock._stop.resolves('exampleExecutorMockResult');

            return executor
                .stop({
                    apiUri,
                    buildId: 920
                })
                .then(result => {
                    assert.strictEqual(result, 'exampleExecutorMockResult');
                });
        });

        it('default executor is the first one when given no executor annotation', () => {
            k8sExecutorMock._stop.resolves('k8sExecutorResult');

            return executor
                .stop({
                    apiUri,
                    buildId: 920
                })
                .then(result => {
                    assert.strictEqual(result, 'k8sExecutorResult');
                    assert.calledOnce(k8sExecutorMock._stop);
                    assert.notCalled(exampleExecutorMock._stop);
                });
        });

        it('default executor is the first one when given an invalid executor annotation', () => {
            k8sExecutorMock._stop.resolves('k8sExecutorResult');
            exampleExecutorMock._stop.rejects();

            return executor
                .stop({
                    apiUri,
                    annotations: {
                        'beta.screwdriver.cd/executor': 'darrenIsSometimesRight'
                    },
                    buildId: 920
                })
                .then(result => {
                    assert.strictEqual(result, 'k8sExecutorResult');
                    assert.calledOnce(k8sExecutorMock._stop);
                    assert.notCalled(exampleExecutorMock._stop);
                });
        });

        it('uses an annotation to determine which executor to call', () => {
            k8sExecutorMock._stop.rejects();
            exampleExecutorMock._stop.resolves('exampleExecutorResult');

            return executor
                .stop({
                    apiUri,
                    annotations: {
                        'beta.screwdriver.cd/executor': 'example'
                    },
                    buildId: 920
                })
                .then(result => {
                    assert.strictEqual(result, 'exampleExecutorResult');
                    assert.calledOnce(exampleExecutorMock._stop);
                    assert.notCalled(k8sExecutorMock._stop);
                });
        });

        it('propogates the failure from initiating a start', () => {
            const testError = new Error('triggeredError');

            k8sExecutorMock._stop.rejects(testError);

            return executor
                .stop({
                    apiUri,
                    annotations: {
                        'beta.screwdriver.cd/executor': 'k8s'
                    },
                    buildId: 920
                })
                .then(assert.fail, err => {
                    assert.deepEqual(err, testError);
                });
        });
    });

    describe('_verify', () => {
        it('default executor when no annotation is given', () => {
            executor = new Executor({
                defaultPlugin: 'example',
                ecosystem,
                executor: [
                    {
                        name: 'k8s',
                        options: k8sPluginOptions
                    },
                    {
                        name: 'example',
                        options: examplePluginOptions
                    }
                ]
            });
            exampleExecutorMock._verify.resolves('exampleExecutorMockResult');

            return executor
                .verify({
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'asdf'
                })
                .then(result => {
                    assert.strictEqual(result, 'exampleExecutorMockResult');
                });
        });

        it('default executor is the first one when given no executor annotation', () => {
            k8sExecutorMock._verify.resolves('k8sExecutorResult');

            return executor
                .verify({
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'asdf'
                })
                .then(result => {
                    assert.strictEqual(result, 'k8sExecutorResult');
                    assert.calledOnce(k8sExecutorMock._verify);
                    assert.notCalled(exampleExecutorMock._verify);
                });
        });

        it('default executor is the first one when given an invalid executor annotation', () => {
            k8sExecutorMock._verify.resolves('k8sExecutorResult');
            exampleExecutorMock._verify.rejects();

            return executor
                .verify({
                    annotations: {
                        'beta.screwdriver.cd/executor': 'darrenIsSometimesRight'
                    },
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'asdf'
                })
                .then(result => {
                    assert.strictEqual(result, 'k8sExecutorResult');
                    assert.calledOnce(k8sExecutorMock._verify);
                    assert.notCalled(exampleExecutorMock._verify);
                });
        });

        it('uses an annotation to determine which executor to call', () => {
            k8sExecutorMock._verify.rejects();
            exampleExecutorMock._verify.resolves('exampleExecutorResult');

            return executor
                .verify({
                    annotations: {
                        'beta.screwdriver.cd/executor': 'example'
                    },
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'asdf'
                })
                .then(result => {
                    assert.strictEqual(result, 'exampleExecutorResult');
                    assert.calledOnce(exampleExecutorMock._verify);
                    assert.notCalled(k8sExecutorMock._verify);
                });
        });

        it('propogates the failure from initiating a start', () => {
            const testError = new Error('triggeredError');

            k8sExecutorMock._verify.rejects(testError);

            return executor
                .verify({
                    annotations: {
                        'beta.screwdriver.cd/executor': 'k8s'
                    },
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'asdf'
                })
                .then(assert.fail, err => {
                    assert.deepEqual(err, testError);
                });
        });
    });

    describe('Executor config with weightage', () => {
        const apiUri = 'https://api.sd.cd';

        beforeEach(() => {
            executor = new Executor({
                ecosystem,
                defaultPlugin: 'example',
                executor: [
                    {
                        name: 'k8s',
                        weightage: 20,
                        options: k8sPluginOptions
                    },
                    {
                        name: 'example',
                        weightage: 0,
                        options: examplePluginOptions
                    },
                    {
                        name: 'test',
                        weightage: 10,
                        options: testPluginOptions
                    }
                ]
            });
        });

        it('calls _start with randomly weighted executor and not default when no annotation', () => {
            k8sExecutorMock._start.resolves('k8sExecutorResult');
            testExecutorMock._start.resolves('testExecutorResult');

            return executor
                .start({
                    buildId: 920,
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'qwer'
                })
                .then(result => {
                    if (result === 'k8sExecutorResult') {
                        assert.strictEqual(result, 'k8sExecutorResult');
                        assert.calledOnce(k8sExecutorMock._start);
                        assert.notCalled(exampleExecutorMock._start);
                        assert.notCalled(testExecutorMock._start);
                    } else {
                        assert.strictEqual(result, 'testExecutorResult');
                        assert.calledOnce(testExecutorMock._start);
                        assert.notCalled(exampleExecutorMock._start);
                        assert.notCalled(k8sExecutorMock._start);
                    }
                });
        });

        it('calls _stop with randomly weighted executor and not default when no annotation', () => {
            k8sExecutorMock._stop.resolves('k8sExecutorResult');
            testExecutorMock._stop.resolves('testExecutorResult');

            return executor
                .stop({
                    apiUri,
                    buildId: 920
                })
                .then(result => {
                    if (result === 'k8sExecutorResult') {
                        assert.strictEqual(result, 'k8sExecutorResult');
                        assert.calledOnce(k8sExecutorMock._stop);
                        assert.notCalled(exampleExecutorMock._stop);
                        assert.notCalled(testExecutorMock._stop);
                    } else {
                        assert.strictEqual(result, 'testExecutorResult');
                        assert.calledOnce(testExecutorMock._stop);
                        assert.notCalled(exampleExecutorMock._stop);
                        assert.notCalled(k8sExecutorMock._stop);
                    }
                });
        });

        it('calls _stop with default executor on executor selection errors', () => {
            executor = new Executor({
                ecosystem,
                defaultPlugin: 'example',
                executor: [
                    {
                        name: 'k8s',
                        weightage: 20,
                        options: k8sPluginOptions,
                        exclusions: ['rhel6']
                    },
                    {
                        name: 'example',
                        weightage: 0,
                        options: examplePluginOptions
                    },
                    {
                        name: 'test',
                        weightage: 10,
                        options: testPluginOptions
                    }
                ]
            });

            return executor
                .stop({
                    apiUri,
                    buildId: 920
                })
                .then(() => {
                    assert.called(exampleExecutorMock._stop);
                    assert.notCalled(testExecutorMock._stop);
                    assert.notCalled(k8sExecutorMock._stop);
                });
        });

        it('calls _start with executor from annotation', () => {
            testExecutorMock._start.resolves('testExecutorResult');

            return executor
                .start({
                    buildId: 920,
                    annotations: {
                        'beta.screwdriver.cd/executor': 'test'
                    },
                    container: 'node:4',
                    apiUri: 'http://api.com',
                    token: 'qwer'
                })
                .then(result => {
                    assert.strictEqual(result, 'testExecutorResult');
                    assert.calledOnce(testExecutorMock._start);
                    assert.notCalled(exampleExecutorMock._start);
                    assert.notCalled(k8sExecutorMock._start);
                });
        });

        it('calls default when no annotation and zero weightage defined', () => {
            executor = new Executor({
                ecosystem,
                defaultPlugin: 'example',
                executor: [
                    {
                        name: 'k8s',
                        weightage: 0,
                        options: k8sPluginOptions
                    },
                    {
                        name: 'example',
                        weightage: 0,
                        options: examplePluginOptions
                    },
                    {
                        name: 'test',
                        weightage: 0,
                        options: testPluginOptions
                    }
                ]
            });
            exampleExecutorMock._stop.resolves('exampleExecutorResult');

            return executor
                ._stop({
                    apiUri,
                    buildId: 920
                })
                .then(result => {
                    assert.strictEqual(result, 'exampleExecutorResult');
                    assert.calledOnce(exampleExecutorMock._stop);
                    assert.notCalled(testExecutorMock._stop);
                    assert.notCalled(k8sExecutorMock._stop);
                });
        });

        it('propogates the failure from initiating a start when config has weightage', () => {
            const testError = new Error('triggeredError');

            testExecutorMock._stop.rejects(testError);

            return executor
                .stop({
                    apiUri,
                    annotations: {
                        'beta.screwdriver.cd/executor': 'test'
                    },
                    buildId: 920
                })
                .then(assert.fail, err => {
                    assert.deepEqual(err, testError);
                });
        });

        it('selects correct executor when weightage is type string', () => {
            executor = new Executor({
                ecosystem,
                defaultPlugin: 'example',
                executor: [
                    {
                        name: 'k8s',
                        weightage: '0',
                        options: k8sPluginOptions
                    },
                    {
                        name: 'example',
                        weightage: '0',
                        options: examplePluginOptions
                    },
                    {
                        name: 'test',
                        weightage: '5',
                        options: testPluginOptions
                    }
                ]
            });
            testExecutorMock._stop.resolves('testExecutorResult');

            return executor
                ._stop({
                    apiUri,
                    buildId: 920
                })
                .then(result => {
                    assert.strictEqual(result, 'testExecutorResult');
                    assert.calledOnce(testExecutorMock._stop);
                    assert.notCalled(exampleExecutorMock._stop);
                    assert.notCalled(k8sExecutorMock._stop);
                });
        });

        it('does not use the weighted executor which has the container in exclusion', () => {
            executor = new Executor({
                ecosystem,
                defaultPlugin: 'example',
                executor: [
                    {
                        name: 'k8s',
                        exclusions: ['rhel6', 'ylinux6'],
                        weightage: '10',
                        options: k8sPluginOptions
                    },
                    {
                        name: 'example',
                        weightage: '0',
                        options: examplePluginOptions
                    },
                    {
                        name: 'test',
                        weightage: '2',
                        options: testPluginOptions
                    }
                ]
            });

            testExecutorMock._start.resolves('testExecutorResult');
            exampleExecutorMock._start.resolves('exampleExecutorResult');
            k8sExecutorMock._start.resolves('k8sExecutorResult');

            return executor
                .start({
                    buildId: 920,
                    container: 'docker-registry.example.com:4443/sd/arya-rhel6:latest',
                    apiUri: 'http://api.com',
                    token: 'qwer'
                })
                .then(result => {
                    assert.strictEqual(result, 'testExecutorResult');
                    assert.calledOnce(testExecutorMock._start);
                    assert.notCalled(exampleExecutorMock._start);
                    assert.notCalled(k8sExecutorMock._start);
                });
        });

        it('uses the correct weighted executor when container not matched in execlusion', () => {
            executor = new Executor({
                ecosystem,
                defaultPlugin: 'example',
                executor: [
                    {
                        name: 'k8s',
                        exclusions: ['rhel6', 'ylinux6'],
                        weightage: '20',
                        options: k8sPluginOptions
                    },
                    {
                        name: 'example',
                        weightage: '0',
                        options: examplePluginOptions
                    },
                    {
                        name: 'test',
                        weightage: '2',
                        options: testPluginOptions
                    }
                ]
            });

            testExecutorMock._start.resolves('testExecutorResult');
            exampleExecutorMock._start.resolves('exampleExecutorResult');
            k8sExecutorMock._start.resolves('k8sExecutorResult');

            return executor
                .start({
                    buildId: 920,
                    container: 'docker-registry.example.com:4443/sd/arya-rhel7:latest',
                    apiUri: 'http://api.com',
                    token: 'qwer'
                })
                .then(result => {
                    assert.strictEqual(result, 'k8sExecutorResult');
                    assert.calledOnce(k8sExecutorMock._start);
                    assert.notCalled(exampleExecutorMock._start);
                    assert.notCalled(testExecutorMock._start);
                });
        });
    });
});
