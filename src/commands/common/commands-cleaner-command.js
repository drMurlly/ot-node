import Command from '../command.js';
// eslint-disable-next-line no-unused-vars
import {
    FINALIZED_COMMAND_CLEANUP_TIME_MILLS,
    ARCHIVE_COMMANDS_FOLDER,
} from '../../constants/constants.js';

/**
 * Increases approval for Bidding contract on blockchain
 */
class CommandsCleanerCommand extends Command {
    constructor(ctx) {
        super(ctx);
        this.logger = ctx.logger;
        this.repositoryModuleManager = ctx.repositoryModuleManager;
        this.fileService = ctx.fileService;
    }

    /**
     * Executes command and produces one or more events
     * @param command
     */
    async execute() {
        const nowTimestamp = Date.now();
        const commandsForRemoval = await this.repositoryModuleManager.findFinalizedCommands(
            nowTimestamp,
        );
        if (commandsForRemoval.length > 2) {
            // save in archive folder data/archive/database/commands/startTimestamp-endTimestamp.archive.json
            const archiveFolderPath =
                this.fileService.getArchiveFolderPath(ARCHIVE_COMMANDS_FOLDER);

            const archiveName = `${commandsForRemoval[0].startedAt}-${
                commandsForRemoval[commandsForRemoval.length - 1].startedAt
            }.json`;

            await this.fileService.writeContentsToFile(
                archiveFolderPath,
                archiveName,
                JSON.stringify(commandsForRemoval),
            );

            // remove from database;
            const ids = commandsForRemoval.map((command) => command.id);
            await this.repositoryModuleManager.removeCommands(ids);
        }

        return Command.repeat();
    }

    /**
     * Recover system from failure
     * @param command
     * @param error
     */
    async recover(command, error) {
        this.logger.warn(`Failed to clean finalized commands: error: ${error.message}`);
        return Command.repeat();
    }

    /**
     * Builds default command
     * @param map
     * @returns {{add, data: *, delay: *, deadline: *}}
     */
    default(map) {
        const command = {
            name: 'commandsCleanerCommand',
            data: {},
            period: FINALIZED_COMMAND_CLEANUP_TIME_MILLS,
            transactional: false,
        };
        Object.assign(command, map);
        return command;
    }
}

export default CommandsCleanerCommand;
