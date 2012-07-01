define (['socket.io'], function(){
	console.timeStamp('Socket define');
	return io.connect(location.host);
});