import Command from '../../command.js';
import {
    COMMAND_RETRIES,
    ERROR_TYPE,
    OPERATION_ID_STATUS,
    OPERATION_STATUS,
    TRIPLE_STORE_REPOSITORIES,
    NAIVE_ASSET_SYNC_PARAMETERS,
} from '../../../constants/constants.js';

class NaiveSyncAssetCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.tripleStoreService = ctx.tripleStoreService;
        this.ualService = ctx.ualService;
        this.operationIdService = ctx.operationIdService;
        this.getService = ctx.getService;

        this.errorType = ERROR_TYPE.COMMIT_PROOF.NAIVE_ASSET_SYNC_ERROR;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute(command) {
        const {
            operationId,
            blockchain,
            contract,
            tokenId,
            keyword,
            hashFunctionId,
            epoch,
            assertionId,
            stateIndex,
        } = command.data;

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.COMMIT_PROOF.NAIVE_ASSET_SYNC_START,
        );

        this.logger.info(
            `[NAIVE_ASSET_SYNC] (${operationId}): Started command for the ` +
                `Blockchain: ${blockchain}, Contract: ${contract}, Token ID: ${tokenId}, ` +
                `Keyword: ${keyword}, Hash function ID: ${hashFunctionId}, Epoch: ${epoch}, ` +
                `State Index: ${stateIndex}, Operation ID: ${operationId}, ` +
                `Retry number: ${COMMAND_RETRIES.NAIVE_ASSET_SYNC - command.retries + 1}`,
        );

        this.logger.debug(
            `[NAIVE_ASSET_SYNC] (${operationId}): Checking if Knowledge Asset is synced for the ` +
                `Blockchain: ${blockchain}, Contract: ${contract}, Token ID: ${tokenId}, ` +
                `Keyword: ${keyword}, Hash function ID: ${hashFunctionId}, Epoch: ${epoch}, ` +
                `State Index: ${stateIndex}, Operation ID: ${operationId}`,
        );

        try {
            // Q: Potentially we can also add a boolean to the service_agreement in the operationaldb
            // to track synced KAs in order not to check the repository on every commit
            const isAssetSynced = await this.tripleStoreService.assertionExists(
                TRIPLE_STORE_REPOSITORIES.PUBLIC_CURRENT,
                assertionId,
            );

            if (isAssetSynced) {
                this.logger.info(
                    `[NAIVE_ASSET_SYNC] (${operationId}): Knowledge Asset is already synced, finishing command for the ` +
                        `Blockchain: ${blockchain}, Contract: ${contract}, Token ID: ${tokenId}, ` +
                        `Keyword: ${keyword}, Hash function ID: ${hashFunctionId}, Epoch: ${epoch}, ` +
                        `State Index: ${stateIndex}, Operation ID: ${operationId}`,
                );
            } else {
                this.logger.debug(
                    `[NAIVE_ASSET_SYNC] (${operationId}): Fetching Knowledge Asset from the network for the ` +
                        `Blockchain: ${blockchain}, Contract: ${contract}, Token ID: ${tokenId}, ` +
                        `Keyword: ${keyword}, Hash function ID: ${hashFunctionId}, Epoch: ${epoch}, ` +
                        `State Index: ${stateIndex}, Operation ID: ${operationId}`,
                );

                const ual = this.ualService.deriveUAL(blockchain, contract, tokenId);

                const getOperationId = await this.operationIdService.generateOperationId(
                    OPERATION_ID_STATUS.GET.GET_START,
                );

                await Promise.all([
                    this.operationIdService.updateOperationIdStatus(
                        getOperationId,
                        blockchain,
                        OPERATION_ID_STATUS.GET.GET_INIT_START,
                    ),
                    this.repositoryModuleManager.createOperationRecord(
                        this.getService.getOperationName(),
                        getOperationId,
                        OPERATION_STATUS.IN_PROGRESS,
                    ),
                ]);

                await this.commandExecutor.add({
                    name: 'networkGetCommand',
                    sequence: [],
                    delay: 0,
                    data: {
                        operationId,
                        id: ual,
                        blockchain,
                        contract,
                        tokenId,
                        state: assertionId,
                        hashFunctionId,
                        assertionId,
                        stateIndex,
                    },
                    transactional: false,
                });

                await this.operationIdService.updateOperationIdStatus(
                    getOperationId,
                    blockchain,
                    OPERATION_ID_STATUS.GET.GET_INIT_END,
                );

                let attempt = 0;
                let getResult;
                do {
                    // eslint-disable-next-line no-await-in-loop
                    await setTimeout(
                        NAIVE_ASSET_SYNC_PARAMETERS.GET_RESULT_POLLING_INFTERVAL_MILLIS,
                    );

                    // eslint-disable-next-line no-await-in-loop
                    getResult = await this.operationIdService.getOperationIdRecord(operationId);
                    attempt += 1;
                } while (
                    attempt < NAIVE_ASSET_SYNC_PARAMETERS.GET_RESULT_POLLING_MAX_ATTEMPTS &&
                    getResult?.status !== OPERATION_ID_STATUS.FAILED &&
                    getResult?.status !== OPERATION_ID_STATUS.COMPLETED
                );
            }
        } catch (error) {
            this.logger.warn(
                `[NAIVE_ASSET_SYNC] (${operationId}): Unable to sync Knowledge Asset for the ` +
                    `Blockchain: ${blockchain}, Contract: ${contract}, Token ID: ${tokenId}, ` +
                    `Keyword: ${keyword}, Hash function ID: ${hashFunctionId}, Epoch: ${epoch}, ` +
                    `State Index: ${stateIndex}, Operation ID: ${operationId}, `,
            );

            return Command.retry();
        }

        await this.operationIdService.updateOperationIdStatus(
            operationId,
            blockchain,
            OPERATION_ID_STATUS.COMMIT_PROOF.NAIVE_ASSET_SYNC_END,
        );

        this.logger.info(
            `[NAIVE_ASSET_SYNC] (${operationId}): Successfully executed command for the ` +
                `Blockchain: ${blockchain}, Contract: ${contract}, Token ID: ${tokenId}, ` +
                `Keyword: ${keyword}, Hash function ID: ${hashFunctionId}, Epoch: ${epoch}, ` +
                `State Index: ${stateIndex}, Operation ID: ${operationId}, `,
        );

        return this.continueSequence(command.data, command.sequence, {
            retries: COMMAND_RETRIES.SUBMIT_COMMIT,
        });
    }

    async retryFinished(command) {
        const { blockchain, contract, tokenId, operationId } = command.data;
        const ual = this.ualService.deriveUAL(blockchain, contract, tokenId);
        await this.handleError(
            operationId,
            blockchain,
            `Max retry count for the ${command.name} reached! ` +
                `Unable to sync Knowledge Asset on the ${blockchain} blockchain with the UAL: ${ual}`,
            this.errorType,
            true,
        );
    }

    /**
     * Builds default naiveAssetSyncCommand
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'naiveAssetSyncCommand',
            delay: 0,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default NaiveSyncAssetCommand;
