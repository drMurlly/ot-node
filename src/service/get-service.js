const OperationService = require('./operation-service');
const {
    GET_REQUEST_STATUS,
    OPERATION_ID_STATUS,
    GET_STATUS,
    NETWORK_PROTOCOLS,
    ERROR_TYPE,
} = require('../constants/constants');

class GetService extends OperationService {
    constructor(ctx) {
        super(ctx);

        this.dataService = ctx.dataService;
        this.tripleStoreModuleManager = ctx.tripleStoreModuleManager;

        this.operationName = 'get';
        this.networkProtocol = NETWORK_PROTOCOLS.GET;
        this.operationRequestStatus = GET_REQUEST_STATUS;
        this.operationStatus = GET_STATUS;
        this.errorType = ERROR_TYPE.GET.GET_ERROR;
        this.completedStatuses = [
            OPERATION_ID_STATUS.GET.GET_FETCH_FROM_NODES_END,
            OPERATION_ID_STATUS.GET.GET_END,
            OPERATION_ID_STATUS.COMPLETED,
        ];
    }

    async processResponse(command, responseStatus, responseData, errorMessage = null) {
        const { operationId, numberOfFoundNodes, numberOfNodesInBatch, leftoverNodes, keyword } =
            command.data;

        const keywordsStatuses = await this.getResponsesStatuses(
            responseStatus,
            errorMessage,
            operationId,
            keyword,
        );

        const { completedNumber, failedNumber } = keywordsStatuses[keyword];
        const numberOfResponses = completedNumber + failedNumber;
        this.logger.debug(
            `Processing ${this.networkProtocol} response for operationId: ${operationId}, keyword: ${keyword}. Total number of nodes: ${numberOfFoundNodes}, number of nodes in batch: ${numberOfNodesInBatch} number of leftover nodes: ${leftoverNodes.length}, number of responses: ${numberOfResponses}`,
        );

        if (completedNumber === 1) {
            await this.markOperationAsCompleted(
                operationId,
                responseData.nquads,
                this.completedStatuses,
            );
            this.logResponsesSummary(completedNumber, failedNumber);
        } else if (numberOfFoundNodes === failedNumber || numberOfNodesInBatch === failedNumber) {
            if (leftoverNodes.length === 0) {
                await this.markOperationAsFailed(
                    operationId,
                    'Unable to find assertion on the network!',
                );
                this.logResponsesSummary(completedNumber, failedNumber);
            } else {
                await this.scheduleOperationForLeftoverNodes(command.data, leftoverNodes);
            }
        }
    }

    async localGet(assertionId, operationId) {
        const assertionGraphName = `assertion:${assertionId}`;

        this.logger.debug(`Getting assertion: ${assertionId} for operationId: ${operationId}`);

        let nquads = await this.tripleStoreModuleManager.get(assertionGraphName);
        nquads = await this.dataService.toNQuads(nquads, 'application/n-quads');

        this.logger.debug(
            `Assertion: ${assertionGraphName} for operationId: ${operationId} ${
                nquads ? '' : 'not'
            } found in local database.`,
        );

        if (nquads) {
            this.logger.debug(
                `Number of n-quads retrieved from the database : ${nquads.length ?? 0}`,
            );
        }

        return nquads;
    }
}

module.exports = GetService;
