/**
 *
 * node-red-contrib-instagram
 * 2019-2021 Chuan Khoo.
 * www.chuank.com
 *
 * Rewritten from deprecated source from node-red-node-instagram
 * Copyright 2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
module.exports = function(RED) {
	"use strict";
	var crypto = require("crypto");
	var Url = require("url");
	var request = require("request");

	function InstagramCredentialsNode(n) {
		RED.nodes.createNode(this,n);

		var node = this;

		// IG's implementation of long-lived tokens (60 days) – credential node will check and refresh automatically after (60 days - 1min)
		refreshLongLivedAccessToken(node);

		node.refreshTokenIntervalID = setInterval(function() {
			node.log('checking if token has expired...');
			refreshLongLivedAccessToken(node);
		}, 900*1000);		// check for expired token every 15 minutes
	}

	function InstagramNode(n) {
		RED.nodes.createNode(this,n);

		var node = this;
		node.pollInterval = n.pollinterval;

		node.instagramConfig = RED.nodes.getNode(n.instagram);
		if (!node.instagramConfig) {
			node.warn(RED._("instagram.warn.missing-credentials"));
			return;
		}

		initializeNode(node);

		node.on("input", function(msg) {
			// allow any input into node to trigger the GET request
			msg = {};
			retrieveIGMedia(node);
		});

		node.on("close", function() {		// tidy up!
			clearInterval(node.refreshTokenIntervalID);			//long-lived token refresh (15min)
			delete node.refreshTokenIntervalID;

			clearInterval(node.pollIntervalID);							//media feed poll interval
			delete node.pollIntervalID;
		});
	}

	function refreshLongLivedAccessToken(node) {
		var now = Math.floor(Date.now()/1000);

		let numDays = (node.credentials.expires_on-now)/60/60/24;
		node.log("refreshLongLivedAccessToken time left: " + numDays.toFixed(2) +" days");

		if(numDays <= 0) {
			node.warn("token expired, refreshing...");
			var refreshUrl = "https://graph.instagram.com/refresh_access_token/" +
							"?grant_type=ig_refresh_token" +
							"&access_token=" + node.credentials.access_token;

			request.get(refreshUrl, function(err, res, data){
				if (err) {
					return res.send(RED._("instagram.error.request-error", {err: err}));
				}
				if (data.error) {
					return res.send(RED._("instagram.error.oauth-error", {error: data.error}));
				}

				console.log("refreshLongLivedAccessToken/res is:", res);

				if(res.statusCode !== 200) {
					node.error("refreshLongLivedAccessToken error:", res.body);
					// node.warn("statusCode is:", res.statusCode);
					// return;
					return res.send(RED._("instagram.error.unexpected-statuscode", {statusCode: res.statusCode, data: data}));
				} else {
					let pData;
					try {
						pData = JSON.parse(data);
					} catch(e) {
						return res.send(RED._("instagram.error.unexpected-JSON", {statusCode: res.statusCode, data: data}));
					}

					node.credentials.access_token = pData.access_token;
					node.credentials.expires_on = Math.floor(Date.now()/1000) + pData.expires_in - 60;		// give extra 60 seconds just in case expiry clock is somehow askew

					let numDays = (pData.expires_in - 60)/60/60/24;
					node.log("refreshLongLivedAccessToken success, new token expires in: " + numDays.toFixed(2) + " days");
					RED.nodes.addCredentials(node.id, node.credentials);
				}
			});
		}
	}

	// initialize the node: retrieve saved access token + obtain media from Instagram
	function initializeNode(node) {
		if(node.instagramConfig && node.instagramConfig.credentials) {
			if(!node.instagramConfig.credentials.access_token) {
				node.warn(RED._("instagram.warn.missing-accesstoken"));
				return;
			}
		} else {
			node.warn(RED._("instagram.warn.missing-configuration"));
			return;
		}

		// setup an interval to call retrieveIGMedia if requested
		// note FB/IG rate limits at 200/hr i.e. one call per 18 seconds
		if(node.pollInterval!=0) {			// if user specified 0, don't start pollInterval

			if(node.pollInterval<18) node.pollInterval = 18;	// force to 18 secs if any other value < 18 (and not 0) is entered

			node.pollIntervalID = setInterval(function() { // self trigger
				retrieveIGMedia(node);
			}, node.pollInterval*1000);
		}
	}

	function retrieveIGMedia(node) {
		var mediaUrl = "https://graph.instagram.com/" + node.instagramConfig.credentials.user_id + "/media/";
		mediaUrl += "?fields=id,media_type,caption,media_url,thumbnail_url,timestamp";
		mediaUrl += "&access_token=" + node.instagramConfig.credentials.access_token;

		request.get(mediaUrl, function(err, res, data){
			if (err) {
				return res.send(RED._("instagram.error.request-error", {err: err}));
			}
			if (data.error) {
				return res.send(RED._("instagram.error.request-error", {error: data.error}));
			}
			if(res.statusCode !== 200) {
				return res.send(RED._("instagram.error.unexpected-statuscode", {statusCode: res.statusCode, data: data}));
			}

			var media = JSON.parse(data).data;

			// current Basic Display API retrieves ALL of a user's media up to a 10k count limit
			// and includes IMAGE, VIDEO and CAROUSEL_ALBUM

			var msg = {};
			msg.payload = media;
			node.send(msg);
		});
	}

	RED.nodes.registerType("instagram-credentials", InstagramCredentialsNode, {
		credentials: {
			user_id: {type:"text"},
			username: {type:"text"},
			account_type: {type:"text"},
			client_id: {type:"text"},
			client_secret: {type:"password"},
			redirect_uri: { type:"text"},
			access_token: {type: "password"},
			expires_on: {type:"number"}	       // expiry date (in seconds) of long-lived access token
		}
	});

	RED.nodes.registerType("instagram", InstagramNode);

	// setup the IG Authorization Window trigger (called by #node-config-start-auth mousedown event)
	RED.httpAdmin.get("/instagram-credentials/auth", function(req, res) {
		var node_id = req.query.node_id;

		var credentials = RED.nodes.getCredentials(node_id) || {};

		credentials.app_id = req.query.app_id;
		credentials.app_secret = req.query.app_secret;
		credentials.redirect_uri = req.query.redirect_uri;

		if (!credentials.app_id || !credentials.app_secret || ! credentials.redirect_uri) {
			return res.send(RED._("instagram.error.no-ui-credentials"));
		}

		var csrfToken = crypto.randomBytes(18).toString("base64").replace(/\//g, "-").replace(/\+/g, "_");
		credentials.csrfToken = csrfToken;										// csrfToken not registered as type above, so never gets written to disk

		var url = Url.format({
			protocol: "https",
			hostname: "api.instagram.com",
			pathname: "/oauth/authorize/",
			query: {
				client_id: credentials.app_id,
				redirect_uri: credentials.redirect_uri,
				response_type: "code",
				scope: "user_profile,user_media",
				state: node_id + ":" + credentials.csrfToken
			}
		});

		res.redirect(url);
		RED.nodes.addCredentials(node_id, credentials);
	});

	// IG Authorization Window will call this url on successful permissioning
	RED.httpAdmin.get("/instagram-credentials/auth/callback", function(req, res) {
		var state = req.query.state.split(":");
		var node_id = state[0];
		var csrfToken = state[1];

		var credentials = RED.nodes.getCredentials(node_id) || {};

		if (!credentials || !credentials.app_id || !credentials.app_secret || ! credentials.redirect_uri) {
			return res.send(RED._("instagram.error.no-credentials"));
		}

		if (csrfToken !== credentials.csrfToken) {
			return res.status(401).send(RED._("instagram.error.csrf-token-mismatch"));
		}

		RED.nodes.deleteCredentials(node_id); // we don't need to keep the csrfToken in credentials
		delete credentials.csrfToken;

		if(!req.query.code) {
			return res.status(400).send(RED._("instagram.error.no-required-code"));
		}

		// this captured 'code' from IG's Auth is then used to exchange for a short-lived access token
		credentials.code = req.query.code;

		// send out for a short-lived access token (valid for 1hr)
		request.post({
			url: "https://api.instagram.com/oauth/access_token",
			json: true,
			form: {
				client_id: credentials.app_id,
				client_secret: credentials.app_secret,
				grant_type: "authorization_code",
				redirect_uri: credentials.redirect_uri,
				code: credentials.code
			},
		}, function(err, result, data) {
			if (err) {
				return res.send(RED._("instagram.error.request-error", {err: err}));
			}
			if (data.error) {
				return res.send(RED._("instagram.error.oauth-error", {error: data.error}));
			}
			if(result.statusCode !== 200) {
				return res.send(RED._("instagram.error.unexpected-statuscode", {statusCode: result.statusCode, data: data}));
			}

			if(!data.access_token) {
				return res.send(RED._("instagram.error.accesstoken-fetch-fail"));
			} else {
				// now that we have the short-lived token, send another request out to exchange for a long-lived one!
				var llurl = "https://graph.instagram.com/access_token/" +
									"?grant_type=ig_exchange_token" +
									"&client_secret=" + credentials.app_secret +
									"&access_token=" + data.access_token;

				request.get(llurl, function(err2, res2, data2){
					if (err2) {
						return res2.send(RED._("instagram.error.request-error", {err: err2}));
					}
					if (data2.error) {
						return res2.send(RED._("instagram.error.oauth-error", {error: data2.error}));
					}
					if(res2.statusCode !== 200) {
						return res2.send(RED._("instagram.error.unexpected-statuscode", {statusCode: res2.statusCode, data: data2}));
					}

					var pData2;
					try {
						pData2 = JSON.parse(data2);	
					} catch (e) {
						return res2.send(RED._("instagram.error.unexpected-JSON", {statusCode: res2.statusCode, data: data2}));
					}

					// NOTE: previous user_id might be offset by +/- 1 (thanks FB?!?); making an API call to /me retrieves the correct value
					// also, take this opportunity to grab the username string
					var userUrl = "https://graph.instagram.com/me/?access_token=" + data.access_token;
					userUrl += "&fields=username,account_type";

					request.get(userUrl, function(err3, res3, data3){
						if (err3) {
							return res3.send(RED._("instagram.error.request-error", {err: err3}));
						}
						if (data3.error) {
							return res3.send(RED._("instagram.error.oauth-error", {error: data3.error}));
						}
						if(res3.statusCode !== 200) {
							return res3.send(RED._("instagram.error.unexpected-statuscode", {statusCode: res3.statusCode, data: data3}));
						}

						var pData3;
						try {
							pData3 = JSON.parse(data3);	
						} catch (e) {
							return res3.send(RED._("instagram.error.unexpected-JSON", {statusCode: res3.statusCode, data: data3}));
						}

						if(pData3.id) {
							credentials.user_id = pData3.id;
						} else {
							return res3.send(RED._("instagram.error.user_id-fetch-fail"));
						}
						if(pData3.username) {
							credentials.username = pData3.username;
						} else {
							return res3.send(RED._("instagram.error.username-fetch-fail"));
						}
						if(pData3.account_type) {
							credentials.account_type = pData3.account_type;
						} else {
							return res3.send(RED._("instagram.error.account_type-fetch-fail"));
						}

						// now we have all of the correct data, set it into the credentials object
						delete credentials.code;
						credentials.access_token = pData2.access_token;
						credentials.expires_on = Math.floor(Date.now()/1000) + pData2.expires_in - 60;		// give extra 60 seconds just in case expiry clock is somehow askew

						RED.nodes.addCredentials(node_id, credentials);
						res.send(RED._("instagram.message.authorized"));
					});
				});
			}
		});
	});
};
