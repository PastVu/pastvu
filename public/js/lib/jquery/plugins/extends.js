/*global define*/
define(['jquery'], function (jQuery) {
	'use strict';

    jQuery.extend({
        urlParam: function (name) {
            var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
            return (results && results[1] ? decodeURIComponent(results[1]) : 0);
        }
    });

    /**
     * Serialize Form to JSON
     */
    jQuery.fn.serializeObject = function () {
        var o = {},
            a = this.serializeArray();
        $.each(a, function () {
            if (o[this.name]) {
                if (!o[this.name].push) {
                    o[this.name] = [o[this.name]];
                }
                o[this.name].push(this.value || '');
            } else {
                o[this.name] = this.value || '';
            }
        });
        return o;
    };

});