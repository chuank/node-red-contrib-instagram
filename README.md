node-red-contrib-instagram
==========================

Updated <a href="https://nodered.org" target="_blank">Node-RED</a> node to retrieve connected user's Instagram media (`IMAGE`, `VIDEO` and `CAROUSEL_ALBUM`).

With the adoption of Facebook Graph API for Instagram, stricter permissions and OAuth tokens are now a requirement. This node uses the Facebook Instagram Basic Display API, and provides login, authentication and the provisioning of a long-life access token which is automatically refreshed by the configuration node.
        

Install
-------

Run the following command in your ~/.node-red directory

        npm install node-red-contrib-instagram


Usage
-----

Follow instructions in node setup to configure Instagram Basic Display API support for your linked account.

Send any message to it to trigger retrieval. You can also set a timed interval (18 seconds shortest – FB platform rate limit).


### Note:

Up to 10K entries are retrieved.
Traversing into a `CAROUSEL_ALBUM` media for child elements is not supported
