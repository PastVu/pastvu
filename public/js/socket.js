/*global define*/
define(['socket.io', 'Utils'], function (io, Utils) {
	'use strict';
	console.timeStamp('Socket defining');

	var connectionType = '',
		s = io.connect(location.host);

	s.on('connect', function () {
		console.log('Connected with ' + connectionType);
	});
	s.on('connecting', function (type) {
		connectionType = type;
	});
	s.on('disconnect', function () {
		console.log('Disconnected');
	});

	s.on('newCookie', function (obj) {
		Utils.cookie.setItem(obj.name, obj.key, obj['max-age'], '/', null);
	});

	return s;
});