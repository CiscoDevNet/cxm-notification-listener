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
const notifySourceCache = new NodeCache( { stdTTL: serverConfig.options.notifyTtl, checkperiod: serverConfig.options.notifyCheckPeriod } );
const currentDeviceCache = new NodeCache( { stdTTL: serverConfig.options.currentDeviceTtl, checkperiod: serverConfig.options.currentDeviceCheckPeriod } );
const uniqueDevicesCache = new NodeCache( { stdTTL: serverConfig.options.uniqueDeviceTtl, checkperiod: serverConfig.options.uniqueDeviceCheckPeriod } );
var pkg;
var notifyCounter = 0;
var infoSummaryUpdateDate = new Date();
var infoDetailUpdateDate = new Date();
const LOG_SUMMARY_INFO_UPDATE_INTERVAL = serverConfig.options.logSummaryInfoStatsInterval * 1000;
const LOG_DETAIL_INFO_UPDATE_INTERVAL = serverConfig.options.logDetailInfoStatsInterval * 1000;

const OUTPUT_TOTAL_SUMMARY_INFO_JSON_FILE = "./output/totalSummaryInfo.json";
const OUTPUT_NOTIFY_SUMMARY_INFO_JSON_FILE = "./output/notifySummaryInfo.json";
const OUTPUT_FLOOR_INFO_JSON_FILE = "./output/floorInfo.json";
pkg = require('./package.json');
var eventListener = express();

eventListener.use(express.bodyParser());
eventListener.use(express.cookieParser());

//-----------------------------------------------------------------------
//Post Listener: /api/v1/notify
//
//Description: Listens for posts for the url /api/v1/notify.
//             The event notification will be processed
//-----------------------------------------------------------------------
eventListener.post('/api/v1/notify', function(req, res) {
    logger.debug("Post notification from: %s body: %s", req.ip, util.inspect(req.body, {depth: null}));
    var bodyData = req.body;
    var notificationData = bodyData.notifications[0];
    logger.debug("Device MAC: %s from IP: %s", notificationData.deviceId, req.ip);
    var notifySource = notifySourceCache.get(req.ip);
    if (notifySource != undefined && notifySource.sourceNotificationIp != undefined) {
        ++notifySource.notifyCounter;
    } else {
        notifySource = {};
        notifySource.sourceNotificationIp = req.ip;
        notifySource.notifyCounter = 1;
    }
    notifySourceCache.set(req.ip, notifySource, function( err, success ){
    });
	++notifyCounter;
	var currentDate = new Date();
	var infoSummaryUpdateDateDiff = currentDate - infoSummaryUpdateDate;
	if (infoSummaryUpdateDateDiff >= LOG_SUMMARY_INFO_UPDATE_INTERVAL) {
        refreshSummaryInfo(true);
    }

    var infoDetailUpdateDateDiff = currentDate - infoDetailUpdateDate;
    if (infoDetailUpdateDateDiff > LOG_DETAIL_INFO_UPDATE_INTERVAL) {
        refreshDetailInfo(true);
    }
	var obj = { sourceNotificationIp: req.ip, locationCoordinate: notificationData.locationCoordinate, floorId: notificationData.floorId, locationMapHierarchy: notificationData.locationMapHierarchy, notificationTime: currentDate.toString() };
    currentDeviceCache.set(notificationData.deviceId, obj, function( err, success ){
	});
    uniqueDevicesCache.set(notificationData.deviceId, obj, function( err, success ){
    });
    return res.send(200);
});

//-----------------------------------------------------------------------
// Get: /api/v1/device/{deviceId}
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
// Get: /api/v1/system
//
//Description: Returns system information from all the notification sources
//-----------------------------------------------------------------------
eventListener.get('/api/v1/system', function(req, res) {
    if (req.query.refresh !== undefined && req.query.refresh === "true") {
        refreshSummaryInfo(false);
    }
    fs.readFile(OUTPUT_TOTAL_SUMMARY_INFO_JSON_FILE, function (err, data) {
        if (err) throw err;
        return res.json(JSON.parse(data));
    });
});

//-----------------------------------------------------------------------
// Get: /api/v1/notifications
//
//Description: Returns information about all the notification sources
//-----------------------------------------------------------------------
eventListener.get('/api/v1/notifications', function(req, res) {
    if (req.query.refresh !== undefined && req.query.refresh === "true") {
        refreshDetailInfo(false);
    }
    fs.readFile(OUTPUT_NOTIFY_SUMMARY_INFO_JSON_FILE, function (err, data) {
        if (err) throw err;
        return res.json(JSON.parse(data));
    });
});

//-----------------------------------------------------------------------
// Get: /api/v1/notifications/{sourceIp}
//
//Description: Returns information about a specific notification source
//-----------------------------------------------------------------------
eventListener.get('/api/v1/notifications/:sourceIp', function(req, res) {
    logger.debug("Request to get notifications for a specific source params: " + util.inspect(req.params));
    if (req.query.refresh !== undefined && req.query.refresh === "true") {
        refreshDetailInfo(false);
    }
    fs.readFile(OUTPUT_NOTIFY_SUMMARY_INFO_JSON_FILE, function (err, data) {
        if (err) throw err;
        var jsonObject = JSON.parse(data);
        for (var i = 0; i < jsonObject.notifySources.length; ++i) {
            if (jsonObject.notifySources[i].sourceNotificationIp === req.params.sourceIp) {
                return res.json(jsonObject.notifySources[i]);
            }
        }
        return res.send(404);
    });
});

//-----------------------------------------------------------------------
// Get: /api/v1/floors
//
//Description: Returns floor information from all the notification sources
//-----------------------------------------------------------------------
eventListener.get('/api/v1/floors', function(req, res) {
    if (req.query.refresh !== undefined && req.query.refresh === "true") {
        refreshDetailInfo(false);
    }
    fs.readFile(OUTPUT_FLOOR_INFO_JSON_FILE, function (err, data) {
        if (err) throw err;
        return res.json(JSON.parse(data));
    });
});

//-----------------------------------------------------------------------
// Get: /api/v1/floors/{sourceIp}
//
//Description: Returns floor information about a specific notification source
//-----------------------------------------------------------------------
eventListener.get('/api/v1/floors/:sourceIp', function(req, res) {
    logger.debug("Request to get floor information for a specific source params: " + util.inspect(req.params));
    if (req.query.refresh !== undefined && req.query.refresh === "true") {
        refreshDetailInfo(false);
    }
    fs.readFile(OUTPUT_FLOOR_INFO_JSON_FILE, function (err, data) {
        if (err) throw err;
        var jsonObject = JSON.parse(data);
        if (jsonObject.floors[req.params.sourceIp] === undefined) {
            return res.send(404);
        } else {
            return res.json(jsonObject.floors[req.params.sourceIp]);
        }
    });
});

//-----------------------------------------------------------------------
//Function: refreshSummaryInfo
//
//Description: Refresh the summary notification information
//
//Parameters: doLogInfo - If set to true the information refreshed will be logged into log file
//
//Returns: None
//-----------------------------------------------------------------------
function refreshSummaryInfo(doLogInfo) {
    var currentRefreshDate = new Date();
    var updateDateDiff = currentRefreshDate - infoSummaryUpdateDate;

    var messagesInterval = (notifyCounter / updateDateDiff) * 1000;
    var totalInfoTable = new table();
    var currentDevCount = currentDeviceCache.getStats().keys;
    var uniqueDevCount = uniqueDevicesCache.getStats().keys;
    totalInfoTable.push(
        {'Current Device Count': currentDevCount},
        {'Unique Device Count': uniqueDevCount},
        {'Messages Per Second': messagesInterval.toFixed(2)}
    );
    if (doLogInfo) {
        logger.info("Total Information Stats\n" + totalInfoTable.toString());
    }
    var infoObj = {
        date: currentRefreshDate,
        currentDeviceCount: currentDevCount,
        uniqueDeviceCount: uniqueDevCount,
        messagesPerSecond: messagesInterval.toFixed(2)
    };
    fs.writeFile(OUTPUT_TOTAL_SUMMARY_INFO_JSON_FILE, JSON.stringify(infoObj), function (err) {
        if (err) return console.log(err);
    });
    if (doLogInfo) {
        infoSummaryUpdateDate = new Date();
        notifyCounter = 0;
    }
}

//-----------------------------------------------------------------------
//Function: refreshDetailInfo
//
//Description: Refresh the detailed notification information
//
//Parameters: doLogInfo - If set to true the information refreshed will be logged into log file
//
//Returns: None
//-----------------------------------------------------------------------
function refreshDetailInfo(doLogInfo) {
    var currentRefreshDate = new Date();
    var updateDateDiff = currentRefreshDate - infoDetailUpdateDate;
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
                    var mapHierarchy = arrayMapHierarchy[0] + ">" + arrayMapHierarchy[1] + ">" + arrayMapHierarchy[2];
                    if (floorIds[value.sourceNotificationIp] === undefined) {
                        floorIds[value.sourceNotificationIp] = {};
                    }
                    if (floorIds[value.sourceNotificationIp][mapHierarchy] === undefined) {
                        floorIds[value.sourceNotificationIp][mapHierarchy] = 1;
                    } else {
                        ++floorIds[value.sourceNotificationIp][mapHierarchy];
                    }
                }
            });
            var notifyInfoTable = new table({
                head: ['Notify Source', 'Device Count', 'Messages Per Second']
                , colWidths: [20, 20, 30]
            });
            var notifyInfoTableObj = [];
            for (var notifySource in notifySources) {
                var notifySourceObj = notifySourceCache.get(notifySource);
                var messagesInterval = (notifySourceObj.notifyCounter / updateDateDiff) * 1000;
                notifyInfoTable.push([notifySourceObj.sourceNotificationIp, notifySources[notifySource], messagesInterval.toFixed(2)]);
                notifyInfoTableObj.push({
                    sourceNotificationIp: notifySourceObj.sourceNotificationIp,
                    currentDeviceCount: notifySources[notifySource],
                    messagesPerSecond: messagesInterval.toFixed(2)
                });
                if (doLogInfo) {
                    notifySourceObj.notifyCounter = 0;
                    notifySourceCache.set(notifySourceObj.sourceNotificationIp, notifySourceObj, function (err, success) {
                    });
                }
            }
            var notifyObj = {date: currentRefreshDate, notifySources: notifyInfoTableObj};
            fs.writeFile(OUTPUT_NOTIFY_SUMMARY_INFO_JSON_FILE, JSON.stringify(notifyObj), function (err) {
                if (err) return console.log(err);
            });
            if (doLogInfo) {
                logger.info("Notify Information Stats\n" + notifyInfoTable.toString());
            }
            var floorCountTable = new table({
                head: ['Notify Source', 'Floor Name', 'Count']
                , colWidths: [20, 75, 10]
            });
            var floorTableObj = {};
            for (var sourceIp in floorIds) {
                for (var floorId in floorIds[sourceIp]) {
                    floorCountTable.push([sourceIp, floorId, floorIds[sourceIp][floorId]]);
                    if (floorTableObj[sourceIp] == undefined) {
                        floorTableObj[sourceIp] = [];
                        floorTableObj[sourceIp].push({floorName: floorId, currentDeviceCount: floorIds[sourceIp][floorId]});
                    }
                }
            }
            if (doLogInfo) {
                logger.info("Floor Stats\n" + floorCountTable.toString());
            }
            var floorObj = {date: currentRefreshDate, floors: floorTableObj};
            fs.writeFile(OUTPUT_FLOOR_INFO_JSON_FILE, JSON.stringify(floorObj), function (err) {
                if (err) return console.log(err);
            });
        } else {
            logger.error("Errors while getting keys");
        }
    });
    if (doLogInfo) {
        infoDetailUpdateDate = new Date();
    }
}

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
    eventListener.listen(serverConfig.options.eventListenerPort);
    logger.info("CMX Notification Listener: " + pkg.version + " listening on HTTP port " + serverConfig.options.eventListenerPort);
}

runMain();