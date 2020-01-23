node-red-contrib-instagram
==========================

<a href="https://nodered.org" target="_blank">Node-RED</a> node to retrieve photos and metadata from Instagram.

Install
-------

Run the following command in your ~/.node-red directory

        npm install chuank/node-red-contrib-instagram


Usage
-----

A single node to retrieve photos from Instagram. Set a timed interval or send a message to it to trigger retrieval.

You can choose from 1-20 of the latest images to retrieve from the authenticated IG user.

Send the IG media's ID as input to retrieve information about the image (with the option to request the image sent as a Buffer).


### Note:

Videos are currently not supported and are ignored.
