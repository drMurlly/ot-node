export default (sequelize, DataTypes) => {
    const attemptedCommitCommands = sequelize.define(
        'attempted_commit_commands',
        {
            blockchain_id: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            asset_storage_contract_address: {
                type: DataTypes.STRING(42),
                primaryKey: true,
            },
            token_id: {
                type: DataTypes.INTEGER.UNSIGNED,
                primaryKey: true,
            },
            agreement_id: {
                type: DataTypes.STRING,
                primaryKey: true,
            },
            epoch: {
                type: DataTypes.SMALLINT.UNSIGNED,
                primaryKey: true,
            },
            status: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            tx_hash: {
                type: DataTypes.STRING,
            },
        },
        {},
    );
    attemptedCommitCommands.associate = () => {
        // associations can be defined here
    };
    return attemptedCommitCommands;
};
