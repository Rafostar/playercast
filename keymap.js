module.exports =
{
	gnomeRemote: (msg, player) =>
	{
		var keyName = msg.action.toLowerCase();

		switch(keyName)
		{
			case 'play':
			case 'pause':
				player.action(keyName);
				break;
			case 'seek':
				player.seekPercent(msg.value);
				break;
			case 'seek+':
				player.seekForward(msg.value);
				break;
			case 'seek-':
				player.seekBackward(msg.value);
				break;
			case 'volume':
				player.setVolume(msg.value);
				break;
			case 'stop':
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
