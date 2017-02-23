# CMX Notification Listener #

The sample code will receive location updates from multiple CMX servers. The listener will
then store and track the devices and location information based upon the CMX server sending
the notifications. The information will be logged periodically into console. The listener
also has REST APIs to query for information.

# Configuration #

Configuration needs to be done in CMX to send the notifications. Then on the listener the
configuration can be changed by modifying the default configuration file.

## CMX ##

In CMX a new notification needs to be created to send location updates to the running
listener. Create a notification with the following settings.

  * **Name** Enter a describing the notifications
  * **Type** Select _Location Update_
  * **Device Type** Select the device type. Preferred option is _All_ or _Client_
  * **Hierarchy** Select the hierarchy. Preferred option is _All Locations_
  * **Mac Address** Enter a MAC Address to filter upon. Preferred option is to leave the field blank
  * **Receiver** Use _http_ option with the server IP and default port is _9094_. The URI is _/api/v1/notify_
  * **MAC Hashing** MAC hashing should be _OFF_
  * **Message Format** Select _JSON_

## Listener ##

The default configuration settings can be modified in the file location in **config/default/defaultConfig.js**
file. The settings in the file are the following.

  * **eventListenerPort** [9094] Port to listen for events on
  * **currentDeviceTtl** [1200] Number of seconds before removing device from current cache if not updated
  * **currentDeviceCheckPeriod** [120] Number of seconds before checking for current devices to be removed
  * **uniqueDeviceTtl** [86400] Number of seconds before removing device from unique cache if not updated
  * **uniqueDeviceCheckPeriod** [1800] Number of seconds before checking for unique devices to be removed
  * **notifyTtl** [1200] Number of seconds before removing notify sources if not updated
  * **notifyCheckPeriod** [120] Number of seconds before checking for notify sources to be removed
  * **logSummaryInfoStatsInterval** [60] Number of seconds between logging summary information stats
  * **logDetailInfoStatsInterval** [300] Number of seconds between logging detail information stats
  
# REST APIs #

The listener has REST APIs to query for information while receiving CMX notifications. The
following are the REST APIs.

   * **/api/v1/device/{deviceId}** Return the latest location update for **deviceId**

The following take an optional parameter: **refresh=true**. If this parameter is used in the
REST API then the data will be refreshed. Otherwise the cached data will be used and will
be updated based upon the configuration settings.

   * **/api/v1/system** Returns system information from all the notification sources
   * **/api/v1/notifications** Returns information about all the notification sources
   * **/api/v1/notifications/{sourceIp}** Returns information about a specific notification source
   * **/api/v1/floors** Returns floor information from all the notification sources
   * **/api/v1/floors/{sourceIp}** Returns floor information about a specific notification source