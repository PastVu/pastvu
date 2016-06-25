/**
 * Extend
 *
 Object.defineProperty(Object.prototype, "extend", {
    enumerable: false,
    value: function (from) {
        'use strict';
        var props = Object.getOwnPropertyNames(from),
            dest = this;
        props.forEach(function (name) {
            Object.defineProperty(dest, name, Object.getOwnPropertyDescriptor(from, name));
        });
        return this;
    }
 });
 */