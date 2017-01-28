var express = require('express');
var https = require('https');
var http = require('http');
var logger = require('./config/logging/logger');
var serverConfig = require('./config/default/defaultConfig');
var util = require('util');
var fs = require('fs');
var os=require('os');
var table = require('cli-table');
const NodeCache = require( "node-cache" );
const currentDeviceCache = new NodeCache( { stdTTL: 1200, checkperiod: 120 } );
const uniqueDevicesCache = new NodeCache( { stdTTL: 0, checkperiod: 0 } );
var optimist = require('optimist')
.usage('Usage: $0 -h')
.describe('h', 'Display the usage message')
.describe('eventListenerPort', 'Local port to listen for events');
var argv = optimist.argv;
var pkg;
var notifyCounter = 0;
var statsCounter = 0;
var fileUpdateCounter = 0;
var startDate = new Date();

var OUTPUT_INFO_JSON_FILE = "./output/info.json";
var OUTPUT_NOTIFY_JSON_FILE = "./output/notify.json";
var OUTPUT_FLOOR_JSON_FILE = "./output/floor.json";
var STATS_MAX_COUNT = 5;
var FILE_WRITE_MAX_COUNT = 30;
pkg = require('./package.json');
var eventListener = express();

eventListener.use(express.bodyParser());
eventListener.use(express.cookieParser());

if (argv.h) {
    optimist.showHelp();
    process.exit(0);
}

function parseOptions(argv) {
    for (var optionName in serverConfig.options) {
        if (argv[optionName]) {
            serverConfig.options[optionName] = argv[optionName];
        }
    }
}

//-----------------------------------------------------------------------
//Post Listener: /api/v1/notify
//
//Description: Listens for posts for the url /api/v1/notify.
//             The event notification will be processed
//-----------------------------------------------------------------------
eventListener.post('/api/v1/notify', function(req, res) {
    //logger.debug("Post notificiation from: " + req.ip + " body: " + util.inspect(req.body, {depth: null}));
    var bodyData = req.body;
    var notificationData = bodyData.notifications[0];
    //logger.debug("Device MAC: " + notificationData.deviceId + " from IP: " + req.ip);
	++notifyCounter;
	var currentDate = new Date();
	var currentDateDiff = currentDate - startDate;
	if (currentDateDiff >= 60000) {
		messagesInterval = (notifyCounter / currentDateDiff) * 1000;
        var infoTable = new table();
        var currentDevCount = currentDeviceCache.getStats().keys;
        var uniqueDevCount = uniqueDevicesCache.getStats().keys;
        infoTable.push(
            { 'Current Device Count': currentDevCount },
            { 'Unique Device Count': uniqueDevCount },
            { 'Messages Per Second': messagesInterval.toFixed(2) }
        );
        logger.info("Info Stats\n" + infoTable.toString());
		startDate = new Date();
		notifyCounter = 0;
		++statsCounter;
		++fileUpdateCounter;
		if (statsCounter > STATS_MAX_COUNT) {

            if (fileUpdateCounter > FILE_WRITE_MAX_COUNT) {
                var infoObj = {
                    date: startDate,
                    currentDeviceCount: currentDevCount,
                    uniqueDeviceCount: uniqueDevCount,
                    messagesPerSecond: messagesInterval.toFixed(2)
                };
                fs.appendFile(OUTPUT_INFO_JSON_FILE, JSON.stringify(infoObj) + ",\n", function (err) {
                    if (err) return console.log(err);
                });
            }
            currentDeviceCache.keys(function( err, mykeys ){
                if( !err ){
                    var notifySources = {};
                    var floorIds = {};
                    mykeys.forEach(function (mykey) {
                        value = currentDeviceCache.get(mykey);
                        if (value != undefined && value.sourceNotificationIp != undefined) {
                            if (notifySources[value.sourceNotificationIp] == undefined) {
                                notifySources[value.sourceNotificationIp] = 1;
                            } else {
                                ++notifySources[value.sourceNotificationIp];
                            }
                            var arrayMapHierarchy = value.locationMapHierarchy.split(">");
                            mapHierarchy = arrayMapHierarchy[0] + ">" + arrayMapHierarchy[1] + ">" + arrayMapHierarchy[2];
                            if (floorIds[mapHierarchy] == undefined) {
                                floorIds[mapHierarchy] = 1;
                            } else {
                                ++floorIds[mapHierarchy];
                            }
                        }
                    });
                    var notifyTable = new table({
                        head: ['Notify Source', 'Count']
                        , colWidths: [20, 10]
                    });
                    var notifyTableObj = [];
		            for (var notifySource in notifySources) {
                        notifyTable.push([notifySource, notifySources[notifySource]]);
                        notifyTableObj.push({source: notifySource, count: notifySources[notifySource]});
                    }
                    logger.info("Notification Stats\n" + notifyTable.toString());
                    if (fileUpdateCounter > FILE_WRITE_MAX_COUNT) {
                        var notifyObj = {date: startDate, noitfyTable: notifyTableObj};
                        fs.appendFile(OUTPUT_NOTIFY_JSON_FILE, JSON.stringify(notifyObj) + ",\n", function (err) {
                            if (err) return console.log(err);
                        });
                    }
                    var floorCountTable = new table({
                        head: ['Floor Name', 'Count']
                        , colWidths: [75, 10]
                    });
                    var floorTableObj = [];
                    for (var floorId in floorIds) {
                        floorCountTable.push([floorId, floorIds[floorId]]);
                        floorTableObj.push({name: floorId, count: floorIds[floorId]})
                    }
                    logger.info("Floor Stats\n" + floorCountTable.toString());
                    if (fileUpdateCounter > FILE_WRITE_MAX_COUNT) {
                        var floorObj = {date: startDate, floorTable: floorTableObj};
                        fs.appendFile(OUTPUT_FLOOR_JSON_FILE, JSON.stringify(floorObj) + ",\n", function (err) {
                            if (err) return console.log(err);
                        });
                        fileUpdateCounter = 0;
                    }
                } else {
                	logger.error("Errors while getting keys");
				}
            });
            statsCounter = 0;
		}
	}
	var obj = { sourceNotificationIp: req.ip, locationCoordinate: notificationData.locationCoordinate, floorId: notificationData.floorId, locationMapHierarchy: notificationData.locationMapHierarchy, notificationTime: currentDate.toString() };
    currentDeviceCache.set(notificationData.deviceId, obj, 1200, function( err, success ){
	});
    uniqueDevicesCache.set(notificationData.deviceId, obj, function( err, success ){
    });
    return res.send(200);
});

//-----------------------------------------------------------------------
//Get Listener: /api/v1/device/{deviceId}
//
//Description: Returns device information for the specified device ID
//-----------------------------------------------------------------------
eventListener.get('/api/v1/device/:deviceId', function(req, res) {
	value = currentDeviceCache.get(req.params.deviceId);
	if (value == undefined) {
		res.send(404);
	}
	return res.json(value);
});

//-----------------------------------------------------------------------
//Handler: SIGINT
//
//Description: Interrupt handler for Ctrl+C. This will start the delete of the
//             existing notification subscritpion
//-----------------------------------------------------------------------
process.on('SIGINT', function() {
    logger.info("\nGracefully shutting down from SIGINT (Ctrl+C)");
	process.exit(0);
});

//-----------------------------------------------------------------------
//Function: runMain
//
//Description: Main function to start script
//
//Parameters: None
//
//Returns: None
//-----------------------------------------------------------------------
function runMain() {
    parseOptions(argv);
    eventListener.listen(serverConfig.options.eventListenerPort);
    logger.info("CMX Notification Listener: " + pkg.version + " listening on HTTP port " + serverConfig.options.eventListenerPort);
}

runMain();