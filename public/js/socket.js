/*global define*/
define(['socket.io'], function (io) {
    console.timeStamp('Socket define');
    return window.io.connect(location.host);
});