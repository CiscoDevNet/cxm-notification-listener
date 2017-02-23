"use strict";

var options = {
    eventListenerPort: 9094,             // Port to listen for events on
    currentDeviceTtl: 1200,              // Number of seconds before removing device from current cache if not updated
    currentDeviceCheckPeriod: 120,       // Number of seconds before checking for current devices to be removed
    uniqueDeviceTtl: 86400,              // Number of seconds before removing device from unique cache if not updated
    uniqueDeviceCheckPeriod: 1800,       // Number of seconds before checking for unique devices to be removed
    notifyTtl: 1200,                     // Number of seconds before removing notify sources if not updated
    notifyCheckPeriod: 120,              // Number of seconds before checking for notify sources to be removed
    logSummaryInfoStatsInterval: 60,     // Number of seconds between logging summary information stats
    logDetailInfoStatsInterval: 300      // Number of seconds between logging detail information stats
};

module.exports.options = options;