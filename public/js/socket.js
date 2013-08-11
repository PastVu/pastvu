/*global define*/
define(function () {
	'use strict';

	return {
		load: function (name, req, onLoad, config) {
			if (config.isBuild) {
				onLoad(null); //avoid errors on the optimizer
			} else {
				req(['underscore', 'socket.io', 'Utils', 'Params', 'knockout', 'knockout.mapping'], function (_, io, Utils, P, ko, ko_mapping) {
					var connectionType = '',
						s = io.connect(document.location.host);

					s.on('connect', function () {
						console.log('Connected with ' + connectionType);

						s.on('newCookie', function (obj) {
							Utils.cookie.setItem(obj.name, obj.key, obj['max-age'], '/', null);
						});
					});

					s.on('connecting', function (type) {
						connectionType = type;
					});

					s.on('disconnect', function () {
						console.log('Disconnected');
					});
					onLoad(s);
				});
			}
		}
	};
});