const axios = require('axios');
const graph = require('./graph')();
const testing = require('./testing')();
const holding = require('./holding')();
const utilities = require('./utilities')();
const log = utilities.getLogger();
const config = utilities.getConfig();


class DataReplication {

	/**
	* Sends data to DH for replication
	*
	* @param data object {VERTICES, EDGES, IMPORT_ID} This is the payload to be sent
	* @return object response
	*/
	sendPayload(data, callback) {
		log.info('Entering sendPayload');
		graph.encryptVertices(config.DH_NODE_IP, config.DH_NODE_PORT, data.vertices, encryptedVertices => {
			let currentUnixTime = Math.floor(new Date() / 1000);
			let min10 = currentUnixTime + (60); // for hum much time do we want testing

			testing.generateTests(data.import_id, config.DH_NODE_IP, config.DH_NODE_PORT, config.blockchain.settings.ethereum.wallet_address, encryptedVertices.vertices, 10, currentUnixTime, min10, (res, err) => {
				log.info('[DC] Tests generated');
			});
			const payload = JSON.stringify({
				vertices: encryptedVertices.vertices,
				public_key: encryptedVertices.public_key,
				edges: data.edges,
				import_id: data.import_id
			});
			const options = {
				method: 'POST',
				url: 'http://' + config.DH_NODE_IP + ':' + config.DH_NODE_PORT + '/api/replication',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': payload.length
				},
				data: payload
			};
			try {
				axios(options).then(result => {
					log.info('Payload sent');
					holding.addHoldingData(config.DH_WALLET, data.import_id, payload.public_key, () => {
						log.info('[DH] Holding data saved into database');
					});
					utilities.executeCallback(callback, result.data);
				});

			} catch(e) {
				log.error('Payload not sent');
				console.log(e);
			}
		});



	}

}

module.exports = new DataReplication;