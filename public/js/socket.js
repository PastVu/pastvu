/*global define*/
define(['socket.io'], function (io) {
    console.timeStamp('Socket define');
    return io.connect(location.host);
});