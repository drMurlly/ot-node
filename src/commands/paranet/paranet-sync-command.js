/* eslint-disable no-unused-vars */
/* eslint-disable no-await-in-loop */
import { setTimeout } from 'timers/promises';
import Command from '../command.js';
import {
    ERROR_TYPE,
    PARANET_SYNC_FREQUENCY_MILLS,
    OPERATION_ID_STATUS,
    CONTENT_ASSET_HASH_FUNCTION_ID,
    SIMPLE_ASSET_SYNC_PARAMETERS,
    TRIPLE_STORE_REPOSITORIES,
    PARANET_SYNC_KA_COUNT,
} from '../../constants/constants.js';

class ParanetSyncCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.commandExecutor = ctx.commandExecutor;
        this.blockchainModuleManager = ctx.blockchainModuleManager;
        this.tripleStoreService = ctx.tripleStoreService;
        this.ualService = ctx.ualService;
        this.paranetService = ctx.paranetService;
        this.repositoryModuleManager = ctx.repositoryModuleManager;

        this.errorType = ERROR_TYPE.PARANET.PARANET_SYNC_ERROR;
    }

    async execute(command) {
        const { operationId, paranetUAL } = command.data;

        const { blockchain, contract, tokenId } = this.ualService.resolveUAL(paranetUAL);
        const paranetId = this.paranetService.constructParanetId(blockchain, contract, tokenId);

        this.logger.info(
            `Paranet sync: Starting paranet sync for paranetId: ${paranetId}, operation ID: ${operationId}`,
        );

        let contractKaCount = await this.blockchainModuleManager.getParanetKnowledgeAssetsCount(
            blockchain,
            paranetId,
        );
        contractKaCount = contractKaCount.toNumber();

        const cachedKaCount = (
            await this.repositoryModuleManager.getParanetKnowledgeAssetsCount(paranetId, blockchain)
        )[0].dataValues.ka_count;

        if (cachedKaCount === contractKaCount) {
            this.logger.info(
                `Paranet sync: KA count from contract and in DB is the same, nothing to sync, for paranetId: ${paranetId}, operation ID: ${operationId}!`,
            );
            return Command.empty();
        }

        this.logger.info(
            `Paranet sync: Syncing ${
                contractKaCount - cachedKaCount
            } assets for paranetId: ${paranetId}, operation ID: ${operationId}`,
        );
        // TODO: Rename i, should it be cachedKaCount + 1 as cachedKaCount is already in, but count is index
        const kaToUpdate = [];
        for (let i = cachedKaCount; i <= contractKaCount; i += PARANET_SYNC_KA_COUNT) {
            const nextKaArray =
                await this.blockchainModuleManager.getParanetKnowledgeAssetsWithPagination(
                    blockchain,
                    paranetId,
                    i,
                    PARANET_SYNC_KA_COUNT,
                );
            if (!nextKaArray.length) break;
            kaToUpdate.push(...nextKaArray);
        }

        const promises = [];
        // It's array of keywords not tokenId
        // .map((ka) => ka.tokenId)
        kaToUpdate.forEach((knowledgeAssetId) => {
            promises.push(async () => {
                this.logger.info(
                    `Paranet sync: Syncing token id: ${knowledgeAssetId} for ${paranetId} with operation id: ${operationId}`,
                );

                const { knowledgeAssetStorageContract, tokenId: kaTokenId } =
                    this.blockchainModuleManager.getParanetKnowledgeAssetLocator(
                        blockchain,
                        knowledgeAssetId,
                    );

                const assertionIds = await this.blockchainModuleManager.getAssertionIds(
                    blockchain,
                    knowledgeAssetStorageContract,
                    kaTokenId,
                );

                for (let stateIndex = assertionIds.length - 2; stateIndex >= 0; stateIndex -= 1) {
                    await this.syncAsset(
                        blockchain,
                        knowledgeAssetStorageContract,
                        kaTokenId,
                        assertionIds,
                        stateIndex,
                        paranetId,
                        TRIPLE_STORE_REPOSITORIES.PUBLIC_HISTORY,
                        false,
                        // It should never delete as it never was in storage
                        // But maybe will becouse this is unfainalized
                        stateIndex === assertionIds.length - 2,
                    );
                }

                // Then sync the last one, but put it in the current repo
                await this.syncAsset(
                    blockchain,
                    knowledgeAssetStorageContract,
                    kaTokenId,
                    assertionIds,
                    assertionIds.length - 1,
                    paranetId,
                    TRIPLE_STORE_REPOSITORIES.PUBLIC_CURRENT,
                    true,
                    false,
                );
            });
        });

        await Promise.all(promises);

        // TODO: Save only successful ones
        // Here is the problem if one missed count will be false and we will always try to get it again
        await this.repositoryModuleManager.updateParanetKaCount(
            paranetId,
            blockchain,
            contractKaCount,
        );
        return Command.repeat();
    }

    async syncAsset(
        blockchain,
        contract,
        tokenId,
        assertionIds,
        stateIndex,
        paranetId,
        paranetRepository,
        latestAsset,
        deleteFromEarlier,
    ) {
        try {
            const statePresentInParanetRepository =
                await this.tripleStoreService.paranetAssetExists(
                    paranetId,
                    blockchain,
                    contract,
                    tokenId,
                );

            if (statePresentInParanetRepository) {
                this.logger.trace(
                    `PARANET_SYNC: StateIndex: ${stateIndex} for tokenId: ${tokenId} found in triple store blockchain: ${blockchain}`,
                );
                // await this.repositoryModuleManager.createAssetSyncRecord(
                //     blockchain,
                //     contract,
                //     tokenId,
                //     stateIndex,
                //     SIMPLE_ASSET_SYNC_PARAMETERS.STATUS.COMPLETED,
                //     true,
                // );
                return;
            }

            const ual = this.ualService.deriveUAL(blockchain, contract, tokenId);
            this.logger.debug(
                `Paranet sync: Fetching state index: ${stateIndex + 1} of ${
                    assertionIds.length
                } for asset with ual: ${ual}. blockchain: ${blockchain}`,
            );
            const assertionId = assertionIds[stateIndex];

            const operationId = await this.operationIdService.generateOperationId(
                OPERATION_ID_STATUS.GET.GET_START,
            );

            await Promise.all([
                this.operationIdService.updateOperationIdStatus(
                    operationId,
                    blockchain,
                    OPERATION_ID_STATUS.GET.GET_INIT_START,
                ),

                // this.repositoryModuleManager.createAssetSyncRecord(
                //     blockchain,
                //     contract,
                //     tokenId,
                //     stateIndex,
                //     SIMPLE_ASSET_SYNC_PARAMETERS.STATUS.IN_PROGRESS,
                // ),

                this.repositoryModuleManager.createOperationRecord(
                    this.getService.getOperationName(),
                    operationId,
                    OPERATION_ID_STATUS.PENDING,
                ),
            ]);

            const hashFunctionId = CONTENT_ASSET_HASH_FUNCTION_ID;

            this.logger.debug(
                `Paranet sync: Get for ${ual} with operation id ${operationId} initiated. blockchain: ${blockchain}`,
            );

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
                    assetSync: true,
                    stateIndex,
                    assetSyncInsertedByCommand: true,
                    paranetSync: true,
                    paranetId,
                    paranetRepoId: paranetRepository,
                    paranetLatestAsset: latestAsset,
                    paranetDeleteFromEarlier: deleteFromEarlier,
                },
                transactional: false,
            });

            await this.operationIdService.updateOperationIdStatus(
                operationId,
                blockchain,
                OPERATION_ID_STATUS.GET.GET_INIT_END,
            );

            let attempt = 0;
            let getResult;
            do {
                await setTimeout(SIMPLE_ASSET_SYNC_PARAMETERS.GET_RESULT_POLLING_INTERVAL_MILLIS);
                getResult = await this.operationIdService.getOperationIdRecord(operationId);
                attempt += 1;
            } while (
                attempt < SIMPLE_ASSET_SYNC_PARAMETERS.GET_RESULT_POLLING_MAX_ATTEMPTS &&
                getResult?.status !== OPERATION_ID_STATUS.FAILED &&
                getResult?.status !== OPERATION_ID_STATUS.COMPLETED
            );
        } catch (error) {
            this.logger.warn(
                `Paranet sync: Unable to sync tokenId: ${tokenId}, for contract: ${contract} state index: ${stateIndex} blockchain: ${blockchain}, error: ${error}`,
            );
            // await this.repositoryModuleManager.updateAssetSyncRecord(
            //     blockchain,
            //     contract,
            //     tokenId,
            //     stateIndex,
            //     SIMPLE_ASSET_SYNC_PARAMETERS.STATUS.FAILED,
            //     true,
            // );
        }
    }

    /**
     * Recover system from failure
     * @param command
     * @param error
     */
    async recover(command) {
        this.logger.warn(`Failed to execute ${command.name}. Error: ${command.message}`);

        return Command.repeat();
    }

    /**
     * Builds default paranetSyncCommands
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'paranetSyncCommands',
            data: {},
            transactional: false,
            period: PARANET_SYNC_FREQUENCY_MILLS,
        };
        Object.assign(command, map);
        return command;
    }
}

export default ParanetSyncCommand;
