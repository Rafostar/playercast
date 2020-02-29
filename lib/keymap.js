module.exports =
{
	gnomeRemote: (msg, player) =>
	{
		switch(msg.action)
		{
			case 'PLAY':
			case 'PAUSE':
				player.action(msg.action.toLowerCase());
				break;
			case 'CYCLEPAUSE':
				player.action('cyclePause');
				break;
			case 'CYCLEVIDEO':
				player.action('cycleVideo');
				break;
			case 'SEEK':
				player.seekPercent(msg.value);
				break;
			case 'SEEK+':
				player.seekForward(msg.value);
				break;
			case 'SEEK-':
				player.seekBackward(msg.value);
				break;
			case 'VOLUME':
				player.setVolume(msg.value);
				break;
			case 'VOLUME+':
				player.increaseVolume(msg.value);
				break;
			case 'VOLUME-':
				player.decreaseVolume(msg.value);
				break;
			case 'STOP':
				player.action('quit');
				break;
			default:
				break;
		}
	},

	cecRemote: (keyName, player) =>
	{
		var seekTime = 10;

		switch(keyName)
		{
			case 'select':
				player.action('cycleFullscreen');
				break;
			case 'up':
				player.action('cycleVideo');
				break;
			case 'down':
				player.action('cycleAudio');
				break;
			case 'left':
				player.previousTrack();
				break;
			case 'right':
				player.nextTrack();
				break;
			case 'play':
			case 'pause':
				player.action(keyName);
				break;
			case 'rewind':
				player.seekBackward(seekTime);
				break;
			case 'fast-forward':
				player.seekForward(seekTime);
				break;
			case 'subtitle':
				player.action('cycleSubs');
				break;
			case 'stop':
			case 'exit':
				player.action('quit');
				break;
			default:
				break;
		}
	},

	cecRemoteAlt: (keyName, player) =>
	{
		var seekTime = 10;

		switch(keyName)
		{
			case 'select':
				player.action('cyclePause');
				break;
			case 'up':
				player.nextTrack();
				break;
			case 'down':
				player.previousTrack();
				break;
			case 'left':
			case 'rewind':
				player.seekBackward(seekTime);
				break;
			case 'right':
			case 'fast-forward':
				player.seekForward(seekTime);
				break;
			case 'play':
			case 'pause':
				player.action(keyName);
				break;
			case 'red':
				player.action('cycleVideo');
				break;
			case 'green':
				player.action('cycleAudio');
				break;
			case 'yellow':
			case 'subtitle':
				player.action('cycleSubs');
				break;
			case 'blue':
				player.action('cycleFullscreen');
				break;
			case 'stop':
			case 'exit':
				player.action('quit');
				break;
			default:
				break;
		}
	}
}