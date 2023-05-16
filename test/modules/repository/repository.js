import { utils } from 'ethers';
import { describe, it, before, beforeEach, afterEach, after } from 'mocha';
import { expect, assert } from 'chai';
import { readFile } from 'fs/promises';
import Logger from '../../../src/logger/logger.js';
import RepositoryModuleManager from '../../../src/modules/repository/repository-module-manager.js';

let logger;
let repositoryModuleManager;
const config = JSON.parse(await readFile('./test/modules/repository/config.json'));

const blockchain = 'hardhat';
const createAgreement = ({
    blockchain_id = blockchain,
    asset_storage_contract_address = '0xB0D4afd8879eD9F52b28595d31B441D079B2Ca07',
    token_id,
    agreement_id = null,
    start_time,
    epochs_number = 2,
    epoch_length = 100,
    score_function_id = 1,
    proof_window_offset_perc = 66,
    hash_function_id = 1,
    keyword = '0xB0D4afd8879eD9F52b28595d31B441D079B2Ca0768e44dc71bf509adfccbea9df949f253afa56796a3a926203f90a1e4914247d3',
    assertion_id = '0x68e44dc71bf509adfccbea9df949f253afa56796a3a926203f90a1e4914247d3',
    state_index = 1,
    last_commit_epoch = null,
    last_proof_epoch = null,
}) => {
    const agreementId =
        agreement_id ??
        utils.sha256(
            utils.toUtf8Bytes(
                utils.solidityPack(
                    ['address', 'uint256', 'bytes'],
                    [asset_storage_contract_address, token_id, keyword],
                ),
            ),
        );

    return {
        blockchain_id,
        asset_storage_contract_address,
        token_id,
        agreement_id: agreementId,
        start_time,
        epochs_number,
        epoch_length,
        score_function_id,
        proof_window_offset_perc,
        hash_function_id,
        keyword,
        assertion_id,
        state_index,
        last_commit_epoch,
        last_proof_epoch,
    };
};

describe('Repository module', () => {
    before('Initialize repository module manager', async function initializeRepository() {
        this.timeout(30_000);
        logger = new Logger('trace');
        logger.info = () => {};
        repositoryModuleManager = new RepositoryModuleManager({ config, logger });
        await repositoryModuleManager.initialize();
        await repositoryModuleManager.destroyAllRecords('service_agreement');
    });

    afterEach('Destroy all records', async function destroyAllRecords() {
        this.timeout(30_000);
        await repositoryModuleManager.destroyAllRecords('service_agreement');
    });

    after(async function dropDatabase() {
        this.timeout(30_000);
        await repositoryModuleManager.dropDatabase();
    });

    describe('Empty repository', () => {
        it('returns empty list if no service agreements', async () => {
            const eligibleAgreements =
                await repositoryModuleManager.getEligibleAgreementsForSubmitCommit(
                    Date.now(),
                    blockchain,
                    25,
                );

            assert(expect(eligibleAgreements).to.exist);
            expect(eligibleAgreements).to.be.instanceOf(Array);
            expect(eligibleAgreements).to.have.length(0);
        });
    });
    describe('Insert and update service agreement', () => {
        const agreement = {
            blockchain_id: blockchain,
            asset_storage_contract_address: '0xB0D4afd8879eD9F52b28595d31B441D079B2Ca07',
            token_id: 0,
            agreement_id: '0x44cf660357e2d7462c25fd8e50b68abe332d7a70b07a76e92f628846ea585881',
            start_time: 1683032289,
            epochs_number: 2,
            epoch_length: 360,
            score_function_id: 1,
            proof_window_offset_perc: 66,
            hash_function_id: 1,
            keyword:
                '0xB0D4afd8879eD9F52b28595d31B441D079B2Ca0768e44dc71bf509adfccbea9df949f253afa56796a3a926203f90a1e4914247d3',
            assertion_id: '0x68e44dc71bf509adfccbea9df949f253afa56796a3a926203f90a1e4914247d3',
            state_index: 1,
        };

        it('inserts service agreement', async () => {
            const inserted = await repositoryModuleManager.updateServiceAgreementRecord(
                agreement.blockchain_id,
                agreement.asset_storage_contract_address,
                agreement.token_id,
                agreement.agreement_id,
                agreement.start_time,
                agreement.epochs_number,
                agreement.epoch_length,
                agreement.score_function_id,
                agreement.proof_window_offset_perc,
                agreement.hash_function_id,
                agreement.keyword,
                agreement.assertion_id,
                agreement.state_index,
                agreement.last_commit_epoch,
                agreement.last_proof_epoch,
            );
            const row = inserted[0]?.dataValues;

            assert(expect(row).to.exist);
            expect(row.blockchain_id).to.equal(agreement.blockchain_id);
            expect(row.asset_storage_contract_address).to.equal(
                agreement.asset_storage_contract_address,
            );
            expect(row.token_id).to.equal(agreement.token_id);
            expect(row.agreement_id).to.equal(agreement.agreement_id);
            expect(row.start_time).to.equal(agreement.start_time);
            expect(row.epochs_number).to.equal(agreement.epochs_number);
            expect(row.epoch_length).to.equal(agreement.epoch_length);
            expect(row.score_function_id).to.equal(agreement.score_function_id);
            expect(row.proof_window_offset_perc).to.equal(agreement.proof_window_offset_perc);
            expect(row.hash_function_id).to.equal(agreement.hash_function_id);
            expect(row.keyword).to.equal(agreement.keyword);
            expect(row.assertion_id).to.equal(agreement.assertion_id);
            expect(row.state_index).to.equal(agreement.state_index);
            assert(expect(row.last_commit_epoch).to.not.exist);
            assert(expect(row.last_proof_epoch).to.not.exist);
        });
    });

    describe('Eligible service agreements', () => {
        const agreements = [
            createAgreement({ token_id: 0, start_time: 0 }),
            createAgreement({
                token_id: 1,
                start_time: 15,
                last_commit_epoch: 0,
            }),
            createAgreement({ token_id: 2, start_time: 25 }),
            createAgreement({
                token_id: 3,
                start_time: 25,
                last_commit_epoch: 0,
                last_proof_epoch: 0,
            }),
            createAgreement({ token_id: 4, start_time: 49 }),
        ];

        beforeEach(async () => {
            await Promise.all(
                agreements.map((agreement) =>
                    repositoryModuleManager.updateServiceAgreementRecord(
                        agreement.blockchain_id,
                        agreement.asset_storage_contract_address,
                        agreement.token_id,
                        agreement.agreement_id,
                        agreement.start_time,
                        agreement.epochs_number,
                        agreement.epoch_length,
                        agreement.score_function_id,
                        agreement.proof_window_offset_perc,
                        agreement.hash_function_id,
                        agreement.keyword,
                        agreement.assertion_id,
                        agreement.state_index,
                        agreement.last_commit_epoch,
                        agreement.last_proof_epoch,
                    ),
                ),
            );
        });

        describe('getEligibleAgreementsForSubmitCommit returns correct agreements', () => {
            const testEligibleAgreementsForSubmitCommit =
                (currentTimestamp, commitWindowDurationPerc, expectedAgreements) => async () => {
                    const eligibleAgreements =
                        await repositoryModuleManager.getEligibleAgreementsForSubmitCommit(
                            currentTimestamp,
                            blockchain,
                            commitWindowDurationPerc,
                        );

                    assert(expect(eligibleAgreements).to.exist);
                    expect(eligibleAgreements).to.be.instanceOf(Array);
                    expect(eligibleAgreements).to.have.length(expectedAgreements.length);
                    expect(eligibleAgreements).to.have.deep.members(expectedAgreements);

                    // ensure order is correct
                    for (let i = 0; i < eligibleAgreements.length; i += 1) {
                        assert.strictEqual(
                            eligibleAgreements[i].time_left_in_submit_commit_window,
                            expectedAgreements[i].time_left_in_submit_commit_window,
                        );
                    }
                };

            it(
                'returns two eligible service agreements at timestamp 49',
                testEligibleAgreementsForSubmitCommit(49, 25, [
                    { ...agreements[2], current_epoch: 0, time_left_in_submit_commit_window: 1 },
                    { ...agreements[4], current_epoch: 0, time_left_in_submit_commit_window: 25 },
                ]),
            );
            it(
                'returns one eligible service agreement at timestamp 51',
                testEligibleAgreementsForSubmitCommit(51, 25, [
                    { ...agreements[4], current_epoch: 0, time_left_in_submit_commit_window: 23 },
                ]),
            );
            it(
                'returns no eligible service agreement at timestamp 74',
                testEligibleAgreementsForSubmitCommit(74, 25, []),
            );
            it(
                'returns no eligible service agreements at timestamp 75',
                testEligibleAgreementsForSubmitCommit(75, 25, []),
            );
            it(
                'returns one eligible service agreements at timestamp 100',
                testEligibleAgreementsForSubmitCommit(100, 25, [
                    { ...agreements[0], current_epoch: 1, time_left_in_submit_commit_window: 25 },
                ]),
            );
            it(
                'returns two eligible service agreements at timestamp 124',
                testEligibleAgreementsForSubmitCommit(124, 25, [
                    { ...agreements[0], current_epoch: 1, time_left_in_submit_commit_window: 1 },
                    { ...agreements[1], current_epoch: 1, time_left_in_submit_commit_window: 16 },
                ]),
            );
            it(
                'returns three eligible service agreements at timestamp 125',
                testEligibleAgreementsForSubmitCommit(125, 25, [
                    { ...agreements[1], current_epoch: 1, time_left_in_submit_commit_window: 15 },
                    { ...agreements[2], current_epoch: 1, time_left_in_submit_commit_window: 25 },
                    { ...agreements[3], current_epoch: 1, time_left_in_submit_commit_window: 25 },
                ]),
            );
            it(
                'returns three eligible service agreements at timestamp 126',
                testEligibleAgreementsForSubmitCommit(126, 25, [
                    { ...agreements[1], current_epoch: 1, time_left_in_submit_commit_window: 14 },
                    { ...agreements[2], current_epoch: 1, time_left_in_submit_commit_window: 24 },
                    { ...agreements[3], current_epoch: 1, time_left_in_submit_commit_window: 24 },
                ]),
            );
            it(
                'returns three eligible service agreements at timestamp 149',
                testEligibleAgreementsForSubmitCommit(149, 25, [
                    { ...agreements[2], current_epoch: 1, time_left_in_submit_commit_window: 1 },
                    { ...agreements[3], current_epoch: 1, time_left_in_submit_commit_window: 1 },
                    { ...agreements[4], current_epoch: 1, time_left_in_submit_commit_window: 25 },
                ]),
            );
            it(
                'returns one eligible service agreements at timestamp 151',
                testEligibleAgreementsForSubmitCommit(151, 25, [
                    { ...agreements[4], current_epoch: 1, time_left_in_submit_commit_window: 23 },
                ]),
            );
            it(
                'returns no eligible service agreements at timestamp 175',
                testEligibleAgreementsForSubmitCommit(175, 25, []),
            );
            it(
                'returns no eligible service agreements at timestamp 225',
                testEligibleAgreementsForSubmitCommit(225, 25, []),
            );
        });

        describe('getEligibleAgreementsForSubmitProof returns correct agreements', () => {
            const testEligibleAgreementsForSubmitProof =
                (currentTimestamp, proofWindowDurationPerc, expectedAgreements) => async () => {
                    const eligibleAgreements =
                        await repositoryModuleManager.getEligibleAgreementsForSubmitProof(
                            currentTimestamp,
                            blockchain,
                            proofWindowDurationPerc,
                        );

                    assert(expect(eligibleAgreements).to.exist);
                    expect(eligibleAgreements).to.be.instanceOf(Array);
                    expect(eligibleAgreements).to.have.length(expectedAgreements.length);
                    expect(eligibleAgreements).to.have.deep.members(expectedAgreements);

                    // ensure order is correct
                    for (let i = 0; i < eligibleAgreements.length; i += 1) {
                        assert.strictEqual(
                            eligibleAgreements[i].time_left_in_submit_proof_window,
                            expectedAgreements[i].time_left_in_submit_proof_window,
                        );
                    }
                };

            it(
                'returns no eligible service agreement at timestamp 49',
                testEligibleAgreementsForSubmitProof(49, 33, []),
            );
            it(
                'returns no eligible service agreement at timestamp 67',
                testEligibleAgreementsForSubmitProof(67, 33, []),
            );
            it(
                'returns no eligible service agreement at timestamp 80',
                testEligibleAgreementsForSubmitProof(80, 33, []),
            );
            it(
                'returns one eligible service agreements at timestamp 81',
                testEligibleAgreementsForSubmitProof(81, 33, [
                    { ...agreements[1], current_epoch: 0, time_left_in_submit_proof_window: 33 },
                ]),
            );
            it(
                'returns one eligible service agreements at timestamp 92',
                testEligibleAgreementsForSubmitProof(92, 33, [
                    { ...agreements[1], current_epoch: 0, time_left_in_submit_proof_window: 22 },
                ]),
            );
            it(
                'returns one eligible service agreements at timestamp 113',
                testEligibleAgreementsForSubmitProof(113, 33, [
                    { ...agreements[1], current_epoch: 0, time_left_in_submit_proof_window: 1 },
                ]),
            );
            it(
                'returns no eligible service agreements at timestamp 114',
                testEligibleAgreementsForSubmitProof(114, 33, []),
            );
            it(
                'returns no eligible service agreements at timestamp 167',
                testEligibleAgreementsForSubmitProof(167, 33, []),
            );
            it(
                'returns no eligible service agreements at timestamp 181',
                testEligibleAgreementsForSubmitProof(181, 33, []),
            );
            it(
                'returns no eligible service agreements at timestamp 192',
                testEligibleAgreementsForSubmitProof(192, 33, []),
            );
            it(
                'returns no eligible service agreements at timestamp 199',
                testEligibleAgreementsForSubmitProof(199, 33, []),
            );
            it(
                'returns no eligible service agreements at timestamp 200',
                testEligibleAgreementsForSubmitProof(200, 33, []),
            );
        });
    });

    async function insertLoadTestAgreements(numAgreements) {
        let agreements = [];
        for (let tokenId = 0; tokenId < numAgreements; tokenId += 1) {
            agreements.push(
                createAgreement({
                    token_id: tokenId,
                    start_time: Math.floor(Math.random() * 101),
                    last_commit_epoch: [null, 0][Math.floor(Math.random() * 3)],
                    last_proof_epoch: [null, 0][Math.floor(Math.random() * 3)],
                }),
            );

            if (agreements.length % 100_000 === 0) {
                // eslint-disable-next-line no-await-in-loop
                await repositoryModuleManager.bulkCreateServiceAgreementRecords(agreements);
                agreements = [];
            }
        }
        if (agreements.length) {
            await repositoryModuleManager.bulkCreateServiceAgreementRecords(agreements);
        }
    }

    describe('test load', () => {
        describe('100_000 rows', () => {
            beforeEach(async function t() {
                this.timeout(0);
                await insertLoadTestAgreements(100_000);
            });

            it('getEligibleAgreementsForSubmitCommit returns agreements in less than 100 ms', async () => {
                const start = performance.now();
                await repositoryModuleManager.getEligibleAgreementsForSubmitCommit(
                    100,
                    blockchain,
                    25,
                );
                const end = performance.now();
                const duration = end - start;
                expect(duration).to.be.lessThan(100);
            });

            it('getEligibleAgreementsForSubmitProof returns agreements in less than 100 ms', async () => {
                const start = performance.now();
                await repositoryModuleManager.getEligibleAgreementsForSubmitProof(
                    100,
                    blockchain,
                    33,
                );
                const end = performance.now();
                const duration = end - start;
                expect(duration).to.be.lessThan(100);
            });
        });

        describe('1_000_000 rows', () => {
            beforeEach(async function t() {
                this.timeout(0);
                await insertLoadTestAgreements(1_000_000);
            });

            it('getEligibleAgreementsForSubmitCommit returns agreements in less than 1000 ms', async () => {
                const start = performance.now();
                await repositoryModuleManager.getEligibleAgreementsForSubmitCommit(
                    100,
                    blockchain,
                    25,
                );
                const end = performance.now();
                const duration = end - start;
                expect(duration).to.be.lessThan(1000);
            });

            it('getEligibleAgreementsForSubmitProof returns agreements in less than 1000 ms', async () => {
                const start = performance.now();
                await repositoryModuleManager.getEligibleAgreementsForSubmitProof(
                    100,
                    blockchain,
                    33,
                );
                const end = performance.now();
                const duration = end - start;
                expect(duration).to.be.lessThan(1000);
            });
        });
    });
});