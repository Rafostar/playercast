# Playercast
[![License](https://img.shields.io/github/license/Rafostar/playercast.svg)](https://github.com/Rafostar/playercast/blob/master/LICENSE)
[![Downloads](https://img.shields.io/npm/dt/playercast.svg)](https://www.npmjs.com/package/playercast)
[![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TFVDFD88KQ322)
[![Donate](https://img.shields.io/badge/Donate-PayPal.Me-lightgrey.svg)](https://www.paypal.me/Rafostar)
[![Twitter](https://img.shields.io/twitter/url/https/github.com/Rafostar/playercast.svg?style=social)](https://twitter.com/intent/tweet?text=Wow:&url=https%3A%2F%2Fgithub.com%2FRafostar%2Fplayercast)

Turn your media player into receiver for GNOME Shell Extension Cast to TV

A simple app meant to be run in background. Automates the process of streaming files over the local network. Install it on device with any Linux DE to turn it into your own cast receiver that plays files casted from your host PC with [Cast to TV](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv) installed.

To receive media set `Playercast app` as your receiver type in Cast to TV settings.

**Only compatible with latest Cast to TV git master that will become future v10.**

## Features
* Receives casted media files from [Cast to TV](https://github.com/Rafostar/gnome-shell-extension-cast-to-tv)
* Can be installed on any Linux distro with any DE
* Automatically starts media player upon cast
* Control playback from host GNOME top bar remote

## Installation
```
sudo npm install -g playercast
```
Requires one of the supported media players to work.<br>
Currently only MPV player is supported. VLC support is planned for the future.

## Usage
The application can be used from terminal with:
```
playercast IP:PORT
```
IP is the address of server PC with Cast to TV extension.<br>
PORT is the listening port set in Cast to TV extension settings (default: 4000).

### Install as systemd service
After testing in command line, app can be installed as systemd service with:
```
playercast IP:PORT --create-service
```
Above command can be always run again to update service configuration with new IP/PORT.

Remember to enable and start newly added service with:
```
systemctl --user enable playercast
systemctl --user start playercast
```
App will be running on each system boot as background service idling and waiting to receive casted files.

It is recommended to assign your server PC a static IP address, otherwise app will not be able to connect when IP changes.

### Uninstall service
If you want to completely remove systemd service run:
```
systemctl --user disable playercast
systemctl --user stop playercast
playercast --remove-service
```

## Donation
If you like my work please support it by buying me a cup of coffee :grin:

[![PayPal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TFVDFD88KQ322)
