# Chromecast for Homey
Cast a YouTube video, a regular video/audio url or a webpage to your Chromecast device via flows.

## What's new
Flow triggers when casting started or stopped.

Homey will display the current running media information if possible.
Cast a image from Homey to your Chromecast. This uses the new Homey image support.

Due to capability changes you unfortunately have to re-add you Chromecast devices. The old devices won't work anymore due to this changes.

## Note
Due to different implementations for play/pause in external apps, playback related flow cards may not function as expected.
Unfortunately, this is not something we can change.

## Changelog

### v5.0.28
Change YouTube URL for casting videos.

### v5.0.27
Fix bug where protobufjs was not found.

### v5.0.26
Connection improvements.

### v5.0.25
Improved YouTube URL parsing.

### v5.0.24
Changed reconnection logic to be more reliable.

### v5.0.22/23
Changed internal protocol timings to improve connection stability.

### v5.0.21
Switch to ManagerDiscovery to find Chromecasts on the network.

### v5.0.20
Added started and stopped Flow triggers.

### v5.0.19
Fixed speakergroups. Multiroom Audio is only supported for the Flow Cards 'Cast an Audio URL' and 'Cast a Video'.

### v5.0.18
Fix YouTube playlist. The YouTube flow card can play YouTube playlists again.
Filter some flowcard availability on device type.

### v5.0.17
Fix connection error.

### v5.0.16
Fixed 'is playing' condition flowcard.
Small bug fixes.

### v5.0.14
Re-addded radio station flow. Stream TuneIn stations on ChromeCast with our new interface!

### v5.0.12
Resolved a bug where the stop flow only worked once.
Change the player state to pause when the Chromecast is idle.

### v5.0.11
Re-added stop command from a flow. This will halt the currently playing media on the Chromecast, no matter who started it. Restarting this session is not possible, you will have to initiate a new session.

### v5.0.10
Added default albumart and media info.
Bug fixes.

### v5.0.9
Added possibility  to cast a image from Homey. For example, you can cast a snapshot from a IP camera or a image from the gallery app.

Added mediacontrols. You can control various media applications on Chromecast through Homey.

Fixed a bug where the same albumart is rendered more then once.
Added default albumart when something is casting.
Various small fixes and improvements.

### v5.0.7
Fixed setting device unavailable when the connection is closed.
Enabled automatic reconnection based on old IP address should the connection drop.
Set current Chromecast volume information into Homey device to keep the level synced.
Load application information into media info.
Various small fixes

### v5.0.6
Fixed automatic re-connection after connection drop or IP address change.
Fixed flows per added device.
Added flows for casting pictures and audio.
Removed YouTube autocomplete due to Google API limits.

### v5.0.3
Searching for Chromecasts automatically every 10 minutes.
Searching for new Chromecasts when the pairing wizards opens.
Fixed a bug where the webcaster would only work once.