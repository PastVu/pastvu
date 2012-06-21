define (['async!/socket.io/socket.io.js'], function(){
	console.timeStamp('Socket define');
	return io.connect(location+'');
});