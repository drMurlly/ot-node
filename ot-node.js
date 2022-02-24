const { execSync } = require('child_process');
const DeepExtend = require('deep-extend');
const AutoGitUpdate = require('auto-git-update');
const rc = require('rc');
const fs = require('fs');
const DependencyInjection = require('./modules/service/dependency-injection');
const Logger = require('./modules/logger/logger');
const constants = require('./modules/constants');
const db = require('./models');
const pjson = require('./package.json');
const configjson = require('./config/config.json');
const queue = require('fastq')


class OTNode {
    constructor(config) {
        this.initializeConfiguration(config);
        this.logger = new Logger(this.config.logLevel, this.config.telemetryHub.enabled);
    }

    async start() {
        this.logger.info(' ██████╗ ████████╗███╗   ██╗ ██████╗ ██████╗ ███████╗');
        this.logger.info('██╔═══██╗╚══██╔══╝████╗  ██║██╔═══██╗██╔══██╗██╔════╝');
        this.logger.info('██║   ██║   ██║   ██╔██╗ ██║██║   ██║██║  ██║█████╗');
        this.logger.info('██║   ██║   ██║   ██║╚██╗██║██║   ██║██║  ██║██╔══╝');
        this.logger.info('╚██████╔╝   ██║   ██║ ╚████║╚██████╔╝██████╔╝███████╗');
        this.logger.info(' ╚═════╝    ╚═╝   ╚═╝  ╚═══╝ ╚═════╝ ╚═════╝ ╚══════╝');

        this.logger.info('======================================================');
        this.logger.info(`             OriginTrail Node v${pjson.version}`);
        this.logger.info('======================================================');
        this.logger.info(`Node is running in ${process.env.NODE_ENV} environment`);

        this.initializeDependencyContainer();
        await this.initializeAutoUpdate();
        await this.initializeDataModule();
        await this.initializeValidationModule();
        await this.initializeBlockchainModule();
        await this.initializeNetworkModule();
        await this.initializeCommandExecutor();
        await this.initializeTelemetryHubModule();
        await this.initializeRpcModule();
        // await this.initializeWatchdog();
    }

    initializeConfiguration(userConfig) {
        const defaultConfig = JSON.parse(JSON.stringify(configjson[process.env.NODE_ENV]));

        if (process.env.NODE_ENV === 'development' && process.argv.length === 3) {
            // eslint-disable-next-line prefer-destructuring
            userConfig = JSON.parse(fs.readFileSync(process.argv[2]));
        }

        if (userConfig) {
            this.config = DeepExtend(defaultConfig, userConfig);
        } else {
            this.config = rc(pjson.name, defaultConfig);
        }
        if (!this.config.blockchain[0].hubContractAddress && this.config.blockchain[0].networkId === defaultConfig.blockchain[0].networkId) {
            this.config.blockchain[0].hubContractAddress = configjson[process.env.NODE_ENV].blockchain[0].hubContractAddress;
        }
    }

    initializeDependencyContainer() {
        this.container = DependencyInjection.initialize();
        DependencyInjection.registerValue(this.container, 'config', this.config);
        DependencyInjection.registerValue(this.container, 'logger', this.logger);
        DependencyInjection.registerValue(this.container, 'constants', constants);
        DependencyInjection.registerValue(this.container, 'blockchainQueue', queue);

        this.logger.info('Dependency injection module is initialized');
    }

    async initializeAutoUpdate() {
        try {
            if (!this.config.autoUpdate.enabled) {
                return;
            }

            const autoUpdateConfig = {
                repository: 'https://github.com/OriginTrail/ot-node',
                branch: this.config.autoUpdate.branch,
                tempLocation: this.config.autoUpdate.backupDirectory,
                executeOnComplete: 'npx sequelize --config=./config/sequelizeConfig.js db:migrate',
                exitOnComplete: true,
            };

            execSync(`mkdir -p ${this.config.autoUpdate.backupDirectory}`);

            this.updater = new AutoGitUpdate(autoUpdateConfig);
            this.updater.setLogConfig({
                logGeneral: false,
            });
            DependencyInjection.registerValue(this.container, 'updater', this.updater);

            this.logger.info('Auto update mechanism initialized');
        } catch (e) {
            this.logger.error({
                msg: `Auto update initialization failed. Error message: ${e.message}`,
                Event_name: constants.ERROR_TYPE.UPDATE_INITIALIZATION_ERROR,
            });
        }
    }

    async initializeDataModule() {
        try {
            const dataService = this.container.resolve('dataService');
            await dataService.initialize();
            this.logger.info(`Data module: ${dataService.getName()} implementation`);
            db.sequelize.sync();
        } catch (e) {
            this.logger.error({
                msg: `Data module initialization failed. Error message: ${e.message}`,
                Event_name: constants.ERROR_TYPE.DATA_MODULE_INITIALIZATION_ERROR,
            });
        }
    }

    async initializeNetworkModule() {
        try {
            const networkService = this.container.resolve('networkService');
            await networkService.initialize();
            const rankingService = this.container.resolve('rankingService');
            await rankingService.initialize();
            this.logger.info(`Network module: ${networkService.getName()} implementation`);
        } catch (e) {
            this.logger.error({
                msg: `Network module initialization failed. Error message: ${e.message}`,
                Event_name: constants.ERROR_TYPE.NETWORK_INITIALIZATION_ERROR,
            });
        }
    }

    async initializeValidationModule() {
        try {
            const validationService = this.container.resolve('validationService');

            await validationService.initialize();
            this.logger.info(`Validation module: ${validationService.getName()} implementation`);
        } catch (e) {
            this.logger.error({
                msg: `Validation module initialization failed. Error message: ${e.message}`,
                Event_name: constants.ERROR_TYPE.VALIDATION_INITIALIZATION_ERROR,
            });
        }
    }

    async initializeBlockchainModule() {
        try {
            const blockchainService = this.container.resolve('blockchainService');

            await blockchainService.initialize();
            this.logger.info(`Blockchain module: ${blockchainService.getName()} implementation`);
        } catch (e) {
            this.logger.error({
                msg: `Blockchain module initialization failed. Error message: ${e.message}`,
                Event_name: constants.ERROR_TYPE.BLOCKCHAIN_INITIALIZATION_ERROR,
            });
        }
    }

    async initializeCommandExecutor() {
        try {
            const commandExecutor = this.container.resolve('commandExecutor');
            await commandExecutor.init();
            commandExecutor.replay();
            await commandExecutor.start();
        } catch (e) {
            this.logger.error({
                msg: `Command executor initialization failed. Error message: ${e.message}`,
                Event_name: constants.ERROR_TYPE.COMMAND_EXECUTOR_INITIALIZATION_ERROR,
            });
        }
    }

    async initializeRpcModule() {
        try {
            const rpcController = this.container.resolve('rpcController');
            await rpcController.initialize();
        } catch (e) {
            this.logger.error({
                msg: `RPC service initialization failed. Error message: ${e.message}`,
                Event_name: constants.ERROR_TYPE.RPC_INITIALIZATION_ERROR,
            });
        }
    }

    async initializeTelemetryHubModule() {
        try {
            const telemetryHubModuleManager = this.container.resolve('telemetryHubModuleManager');
            if (telemetryHubModuleManager.initialize(this.config.telemetryHub, this.logger)) {
                this.logger.info(`Telemetry hub module initialized successfully, using ${telemetryHubModuleManager.config.telemetryHub.packages} package(s)`);
            }
        } catch (e) {
            this.logger.error(`Telemetry hub module initialization failed. Error message: ${e.message}`);
        }
    }

    async initializeWatchdog() {
        try {
            const watchdogService = this.container.resolve('watchdogService');
            await watchdogService.initialize();
            this.logger.info('Watchdog service initialized');
        } catch (e) {
            this.logger.warn(`Watchdog service initialization failed. Error message: ${e.message}`);
        }
    }

    stop() {
        this.logger.info('Stopping node...');
        process.exit(0);
    }
}

module.exports = OTNode;
