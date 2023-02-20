"use strict";

function ownKeys(object, enumerableOnly) {
  var keys = Object.keys(object);
  if (Object.getOwnPropertySymbols) {
    var symbols = Object.getOwnPropertySymbols(object);
    if (enumerableOnly) {
      symbols = symbols.filter(function (sym) {
        return Object.getOwnPropertyDescriptor(object, sym).enumerable;
      });
    }
    keys.push.apply(keys, symbols);
  }
  return keys;
}
function _objectSpread(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};
    if (i % 2) {
      ownKeys(Object(source), true).forEach(function (key) {
        _defineProperty(target, key, source[key]);
      });
    } else if (Object.getOwnPropertyDescriptors) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    } else {
      ownKeys(Object(source)).forEach(function (key) {
        Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
      });
    }
  }
  return target;
}
function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}
function _toConsumableArray(arr) {
  return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread();
}
function _nonIterableSpread() {
  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
}
function _iterableToArray(iter) {
  if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) return Array.from(iter);
}
function _arrayWithoutHoles(arr) {
  if (Array.isArray(arr)) return _arrayLikeToArray(arr);
}
function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;
  for (var i = 0, arr2 = new Array(len); i < len; i++) {
    arr2[i] = arr[i];
  }
  return arr2;
}
function _typeof(obj) {
  "@babel/helpers - typeof";

  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    _typeof = function _typeof(obj) {
      return typeof obj;
    };
  } else {
    _typeof = function _typeof(obj) {
      return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
    };
  }
  return _typeof(obj);
}
(function (f) {
  if ((typeof exports === "undefined" ? "undefined" : _typeof(exports)) === "object" && typeof module !== "undefined") {
    module.exports = f();
  } else if (typeof define === "function" && define.amd) {
    define([], f);
  } else {
    var g;
    if (typeof window !== "undefined") {
      g = window;
    } else if (typeof global !== "undefined") {
      g = global;
    } else if (typeof self !== "undefined") {
      g = self;
    } else {
      g = this;
    }
    g.convert = f();
  }
})(function () {
  var define, module, exports;
  return function () {
    function r(e, n, t) {
      function o(i, f) {
        if (!n[i]) {
          if (!e[i]) {
            var c = "function" == typeof require && require;
            if (!f && c) return c(i, !0);
            if (u) return u(i, !0);
            var a = new Error("Cannot find module '" + i + "'");
            throw a.code = "MODULE_NOT_FOUND", a;
          }
          var p = n[i] = {
            exports: {}
          };
          e[i][0].call(p.exports, function (r) {
            var n = e[i][1][r];
            return o(n || r);
          }, p, p.exports, r, e, n, t);
        }
        return n[i].exports;
      }
      for (var u = "function" == typeof require && require, i = 0; i < t.length; i++) {
        o(t[i]);
      }
      return o;
    }
    return r;
  }()({
    1: [function (require, module, exports) {
      //function for converting coordinates from a string to decimal and verbatim
      //this is just a comment
      var _require = require('./regex.js'),
        dd_re = _require.dd_re,
        dms_periods = _require.dms_periods,
        dms_abbr = _require.dms_abbr,
        coords_other = _require.coords_other;
      var toCoordinateFormat = require('./toCoordinateFormat.js');
      /**
       * Function for converting coordinates in a variety of formats to decimal coordinates
       * @param {string} coordsString The coordinates string to convert
       * @param {number} decimalPlaces The number of decimal places for converted coordinates; default is 5
       * @returns {object} { verbatimCoordinates, decimalCoordinates, decimalLatitude, decimalLongitude }
       */

      function converter(coordsString, decimalPlaces) {
        //TODO add exact match to entered string, so that it can be used to filter out superflous text around it
        if (!decimalPlaces) {
          decimalPlaces = 5;
        }
        coordsString = coordsString.replace(/\s+/g, ' ').trim(); //just to tidy up whitespaces

        var ddLat = null;
        var ddLng = null;
        var latdir = "";
        var lngdir = "";
        var match = [];
        var matchSuccess = false;
        if (dd_re.test(coordsString)) {
          match = dd_re.exec(coordsString);
          matchSuccess = checkMatch(match);
          if (matchSuccess) {
            ddLat = match[2];
            ddLng = match[6]; //need to fix if there are ','s instead of '.'

            if (ddLat.includes(',')) {
              ddLat = ddLat.replace(',', '.');
            }
            if (ddLng.includes(',')) {
              ddLng = ddLng.replace(',', '.');
            } //validation, we don't want things like 23.00000
            //some more validation: no zero coords or degrees only

            if (Number(Math.round(ddLat)) == Number(ddLat)) {
              throw new Error('integer only coordinate provided');
            }
            if (Number(Math.round(ddLng)) == Number(ddLng)) {
              throw new Error('integer only coordinate provided');
            } //get directions

            if (match[1]) {
              latdir = match[1];
              lngdir = match[5];
            } else if (match[4]) {
              latdir = match[4];
              lngdir = match[8];
            }
          } else {
            throw new Error("invalid decimal coordinate format");
          }
        } else if (dms_periods.test(coordsString)) {
          match = dms_periods.exec(coordsString);
          matchSuccess = checkMatch(match);
          if (matchSuccess) {
            ddLat = Math.abs(parseInt(match[2]));
            if (match[4]) {
              ddLat += match[4] / 60;
            }
            if (match[6]) {
              ddLat += match[6].replace(',', '.') / 3600;
            }
            if (parseInt(match[2]) < 0) {
              ddLat = -1 * ddLat;
            }
            ddLng = Math.abs(parseInt(match[9]));
            if (match[11]) {
              ddLng += match[11] / 60;
            }
            if (match[13]) {
              ddLng += match[13].replace(',', '.') / 3600;
            }
            if (parseInt(match[9]) < 0) {
              ddLng = -1 * ddLng;
            } //the compass directions

            if (match[1]) {
              latdir = match[1];
              lngdir = match[8];
            } else if (match[7]) {
              latdir = match[7];
              lngdir = match[14];
            }
          } else {
            throw new Error("invalid DMS coordinates format");
          }
        } else if (dms_abbr.test(coordsString)) {
          match = dms_abbr.exec(coordsString);
          matchSuccess = checkMatch(match);
          if (matchSuccess) {
            ddLat = Math.abs(parseInt(match[2]));
            if (match[4]) {
              ddLat += match[4] / 60;
            }
            if (match[6]) {
              ddLat += match[6] / 3600;
            }
            if (parseInt(match[2]) < 0) {
              ddLat = -1 * ddLat;
            }
            ddLng = Math.abs(parseInt(match[10]));
            if (match[12]) {
              ddLng += match[12] / 60;
            }
            if (match[14]) {
              ddLng += match[14] / 3600;
            }
            if (parseInt(match[10]) < 0) {
              ddLng = -1 * ddLng;
            }
            if (match[1]) {
              latdir = match[1];
              lngdir = match[9];
            } else if (match[8]) {
              latdir = match[8];
              lngdir = match[16];
            }
          } else {
            throw new Error("invalid DMS coordinates format");
          }
        } else if (coords_other.test(coordsString)) {
          match = coords_other.exec(coordsString);
          matchSuccess = checkMatch(match);
          if (matchSuccess) {
            ddLat = Math.abs(parseInt(match[2]));
            if (match[4]) {
              ddLat += match[4] / 60;
            }
            if (match[6]) {
              ddLat += match[6] / 3600;
            }
            if (parseInt(match[2]) < 0) {
              ddLat = -1 * ddLat;
            }
            ddLng = Math.abs(parseInt(match[10]));
            if (match[12]) {
              ddLng += match[12] / 60;
            }
            if (match[14]) {
              ddLng += match[14] / 3600;
            }
            if (parseInt(match[10]) < 0) {
              ddLng = -1 * ddLng;
            }
            if (match[1]) {
              latdir = match[1];
              lngdir = match[9];
            } else if (match[8]) {
              latdir = match[8];
              lngdir = match[16];
            }
          } else {
            throw new Error("invalid coordinates format");
          }
        }
        if (matchSuccess) {
          //more validation....
          //check longitude value - it can be wrong!
          if (Math.abs(ddLng) >= 180) {
            throw new Error("invalid longitude value");
          } //just to be safe check latitude also...

          if (Math.abs(ddLat) >= 90) {
            throw new Error("invalid latitude value");
          } //if we have one direction we must have the other

          if ((latdir || lngdir) && (!latdir || !lngdir)) {
            throw new Error("invalid coordinates format");
          } //the directions can't be the same

          if (latdir && latdir == lngdir) {
            throw new Error("invalid coordinates format");
          } //make sure the signs and cardinal directions match

          var patt = /S|SOUTH/i;
          if (patt.test(latdir)) {
            if (ddLat > 0) {
              ddLat = -1 * ddLat;
            }
          }
          patt = /W|WEST/i;
          if (patt.test(lngdir)) {
            if (ddLng > 0) {
              ddLng = -1 * ddLng;
            }
          } //we need to get the verbatim coords from the string
          //we can't split down the middle because if there are decimals they may have different numbers on each side
          //so we need to find the separating character, or if none, use the match values to split down the middle

          var verbatimCoordinates = match[0].trim();
          var verbatimLat;
          var verbatimLng;
          var sepChars = /[,/;\u0020]/g; //comma, forward slash and spacebar

          var seps = verbatimCoordinates.match(sepChars);
          if (seps == null) {
            //split down the middle
            var middle = Math.floor(coordsString.length / 2);
            verbatimLat = verbatimCoordinates.substring(0, middle).trim();
            verbatimLng = verbatimCoordinates.substring(middle).trim();
          } else {
            //if length is odd then find the index of the middle value
            //get the middle index
            var middle; //easy for odd numbers

            if (seps.length % 2 == 1) {
              middle = Math.floor(seps.length / 2);
            } else {
              middle = seps.length / 2 - 1;
            } //walk through seps until we get to the middle

            var splitIndex = 0; //it might be only one value

            if (middle == 0) {
              splitIndex = verbatimCoordinates.indexOf(seps[0]);
              verbatimLat = verbatimCoordinates.substring(0, splitIndex).trim();
              verbatimLng = verbatimCoordinates.substring(splitIndex + 1).trim();
            } else {
              var currSepIndex = 0;
              var startSearchIndex = 0;
              while (currSepIndex <= middle) {
                splitIndex = verbatimCoordinates.indexOf(seps[currSepIndex], startSearchIndex);
                startSearchIndex = splitIndex + 1;
                currSepIndex++;
              }
              verbatimLat = verbatimCoordinates.substring(0, splitIndex).trim();
              verbatimLng = verbatimCoordinates.substring(splitIndex + 1).trim();
            }
          } //validation again...
          //we only allow zeros after the period if its DM

          var splitLat = verbatimLat.split('.');
          if (splitLat.length == 2) {
            if (splitLat[1] == 0 && splitLat[1].length != 2) {
              throw new Error('invalid coordinates format');
            }
          }
          var splitLon = verbatimLng.split('.');
          if (splitLon.length == 2) {
            if (splitLon[1] == 0 && splitLon[1].length != 2) {
              throw new Error('invalid coordinates format');
            }
          } //no integer coords allowed
          //validation -- no integer coords

          if (/^\d+$/.test(verbatimLat) || /^\d+$/.test(verbatimLng)) {
            throw new Error('degree only coordinate/s provided');
          } //some tidying up...

          if (isNaN(ddLat) && ddLat.includes(',')) {
            ddLat = ddLat.replace(',', '.');
          } //all done!!
          //just truncate the decimals appropriately

          ddLat = Number(Number(ddLat).toFixed(decimalPlaces));
          if (isNaN(ddLng) && ddLng.includes(',')) {
            ddLng = ddLng.replace(',', '.');
          }
          ddLng = Number(Number(ddLng).toFixed(decimalPlaces));
          return Object.freeze({
            verbatimCoordinates: verbatimCoordinates,
            verbatimLatitude: verbatimLat,
            verbatimLongitude: verbatimLng,
            decimalLatitude: ddLat,
            decimalLongitude: ddLng,
            decimalCoordinates: "".concat(ddLat, ",").concat(ddLng),
            closeEnough: coordsCloseEnough,
            toCoordinateFormat: toCoordinateFormat
          });
        } else {
          throw new Error("coordinates pattern match failed");
        }
      }
      function checkMatch(match) {
        //test if the matched groups arrays are 'balanced'. match is the resulting array
        if (!isNaN(match[0])) {
          //we've matched a number, not what we want....
          return false;
        } //first remove the empty values from the array
        //var filteredMatch = match.filter(x=>x);

        var filteredMatch = _toConsumableArray(match); //we need to shift the array because it contains the whole coordinates string in the first item

        filteredMatch.shift(); //check the array length is an even number else exit

        if (filteredMatch.length % 2 > 0) {
          return false;
        } //regex for testing corresponding values match

        var numerictest = /^[-+]?\d+([\.,]\d+)?$/; //for testing numeric values

        var stringtest = /[eastsouthnorthwest]+/i; //for testing string values (north, south, etc)

        var halflen = filteredMatch.length / 2;
        for (var i = 0; i < halflen; i++) {
          var leftside = filteredMatch[i];
          var rightside = filteredMatch[i + halflen];
          var bothAreNumbers = numerictest.test(leftside) && numerictest.test(rightside);
          var bothAreStrings = stringtest.test(leftside) && stringtest.test(rightside);
          var valuesAreEqual = leftside == rightside;
          if (leftside == undefined && rightside == undefined) {
            //we have to handle undefined because regex converts it to string 'undefined'!!
            continue;
          } else if (leftside == undefined || rightside == undefined) {
            //no we need to handle the case where one is and the other not...
            return false;
          } else if (bothAreNumbers || bothAreStrings || valuesAreEqual) {
            continue;
          } else {
            return false;
          }
        }
        return true;
      } //functions for coordinate validation
      //as decimal arithmetic is not straightforward, we approximate

      function decimalsCloseEnough(dec1, dec2) {
        var originaldiff = Math.abs(dec1 - dec2);
        diff = Number(originaldiff.toFixed(6));
        if (diff <= 0.00001) {
          return true;
        } else {
          return false;
        }
      }
      function coordsCloseEnough(coordsToTest) {
        if (coordsToTest.includes(',')) {
          var coords = coordsToTest.split(',');
          if (Number(coords[0]) == NaN || Number(coords[1]) == NaN) {
            throw new Error("coords are not valid decimals");
          } else {
            return decimalsCloseEnough(this.decimalLatitude, Number(coords[0])) && decimalsCloseEnough(this.decimalLongitude, coords[1]); //this here will be the converted coordinates object
          }
        } else {
          throw new Error("coords being tested must be separated by a comma");
        }
      }
      var to = Object.freeze({
        DMS: 'DMS',
        DM: 'DM'
      });
      converter.to = to;
      module.exports = converter;
    }, {
      "./regex.js": 3,
      "./toCoordinateFormat.js": 5
    }],
    2: [function (require, module, exports) {
      //adds the formats to the convert object
      //we need to use this as the source for the npm package so that the formats are not included in the bundle
      var convert = require('./converter.js');
      var formats = require('./testformats').map(function (format) {
        return format.verbatimCoordinates;
      });
      convert.formats = formats;
      module.exports = convert;
    }, {
      "./converter.js": 1,
      "./testformats": 4
    }],
    3: [function (require, module, exports) {
      //Coordinates pattern matching regex
      //decimal degrees
      var dd_re = /(NORTH|SOUTH|[NS])?[\s]*([+-]?[0-8]?[0-9](?:[\.,]\d{3,}))[\s]*([•º°]?)[\s]*(NORTH|SOUTH|[NS])?[\s]*[,/;]?[\s]*(EAST|WEST|[EW])?[\s]*([+-]?[0-1]?[0-9]?[0-9](?:[\.,]\d{3,}))[\s]*([•º°]?)[\s]*(EAST|WEST|[EW])?/i; //degrees minutes seconds with '.' as separator - gives array with 15 values

      var dms_periods = /(NORTH|SOUTH|[NS])?\s*([+-]?[0-8]?[0-9])\s*(\.)\s*([0-5]?[0-9])\s*(\.)\s*((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(NORTH|SOUTH|[NS])?(?:\s*[,/;]\s*|\s*)(EAST|WEST|[EW])?\s*([+-]?[0-1]?[0-9]?[0-9])\s*(\.)\s*([0-5]?[0-9])\s*(\.)\s*((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(EAST|WEST|[EW])?/i; //degrees minutes seconds with words 'degrees, minutes, seconds' as separators (needed because the s of seconds messes with the S of SOUTH) - gives array of 17 values

      var dms_abbr = /(NORTH|SOUTH|[NS])?\s*([+-]?[0-8]?[0-9])\s*(D(?:EG)?(?:REES)?)\s*([0-5]?[0-9])\s*(M(?:IN)?(?:UTES)?)\s*((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(S(?:EC)?(?:ONDS)?)?\s*(NORTH|SOUTH|[NS])?(?:\s*[,/;]\s*|\s*)(EAST|WEST|[EW])?\s*([+-]?[0-1]?[0-9]?[0-9])\s*(D(?:EG)?(?:REES)?)\s*([0-5]?[0-9])\s*(M(?:IN)?(?:UTES)?)\s*((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(S(?:EC)?(?:ONDS)?)\s*(EAST|WEST|[EW])?/i; //everything else - gives array of 17 values 

      var coords_other = /(NORTH|SOUTH|[NS])?\s*([+-]?[0-8]?[0-9])\s*([•º°\.:]|D(?:EG)?(?:REES)?)?\s*,?([0-5]?[0-9](?:[\.,]\d{1,})?)?\s*(['′´’\.:]|M(?:IN)?(?:UTES)?)?\s*,?((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(''|′′|’’|´´|["″”\.])?\s*(NORTH|SOUTH|[NS])?(?:\s*[,/;]\s*|\s*)(EAST|WEST|[EW])?\s*([+-]?[0-1]?[0-9]?[0-9])\s*([•º°\.:]|D(?:EG)?(?:REES)?)?\s*,?([0-5]?[0-9](?:[\.,]\d{1,})?)?\s*(['′´’\.:]|M(?:IN)?(?:UTES)?)?\s*,?((?:[0-5]?[0-9])(?:[\.,]\d{1,3})?)?\s*(''|′′|´´|’’|["″”\.])?\s*(EAST|WEST|[EW])?/i;
      module.exports = {
        dd_re: dd_re,
        dms_periods: dms_periods,
        dms_abbr: dms_abbr,
        coords_other: coords_other
      };
    }, {}],
    4: [function (require, module, exports) {
      //return an array of coordinate strings for testing
      //coordinations-parser formats
      //https://www.npmjs.com/package/coordinate-parser
      var coordsParserFormats = [{
        verbatimCoordinates: '40.123, -74.123',
        verbatimLatitude: '40.123',
        verbatimLongitude: '-74.123'
      }, {
        verbatimCoordinates: '40.123° N 74.123° W',
        verbatimLatitude: '40.123° N',
        verbatimLongitude: '74.123° W'
      }, {
        verbatimCoordinates: '40.123° N 74.123° W',
        verbatimLatitude: '40.123° N',
        verbatimLongitude: '74.123° W'
      }, {
        verbatimCoordinates: '40° 7´ 22.8" N 74° 7´ 22.8" W',
        verbatimLatitude: '40° 7´ 22.8" N',
        verbatimLongitude: '74° 7´ 22.8" W'
      }, {
        verbatimCoordinates: '40° 7.38’ , -74° 7.38’',
        verbatimLatitude: '40° 7.38’',
        verbatimLongitude: '-74° 7.38’'
      }, {
        verbatimCoordinates: 'N40°7’22.8’’, W74°7’22.8’’',
        verbatimLatitude: 'N40°7’22.8’’',
        verbatimLongitude: 'W74°7’22.8’’'
      }, {
        verbatimCoordinates: '40°7’22.8"N, 74°7’22.8"W',
        verbatimLatitude: '40°7’22.8"N',
        verbatimLongitude: '74°7’22.8"W'
      }, {
        verbatimCoordinates: '40°7\'22.8"N, 74°7\'22.8"W',
        verbatimLatitude: '40°7\'22.8"N',
        verbatimLongitude: '74°7\'22.8"W'
      }, {
        verbatimCoordinates: '40 7 22.8, -74 7 22.8',
        verbatimLatitude: '40 7 22.8',
        verbatimLongitude: '-74 7 22.8'
      }, {
        verbatimCoordinates: '40.123 -74.123',
        verbatimLatitude: '40.123',
        verbatimLongitude: '-74.123'
      }, {
        verbatimCoordinates: '40.123°,-74.123°',
        verbatimLatitude: '40.123°',
        verbatimLongitude: '-74.123°'
      }, {
        verbatimCoordinates: '40.123N74.123W',
        verbatimLatitude: '40.123N',
        verbatimLongitude: '74.123W'
      }, {
        verbatimCoordinates: '4007.38N7407.38W',
        verbatimLatitude: '4007.38N',
        verbatimLongitude: '7407.38W'
      }, {
        verbatimCoordinates: '40°7’22.8"N, 74°7’22.8"W',
        verbatimLatitude: '40°7’22.8"N',
        verbatimLongitude: '74°7’22.8"W'
      }, {
        verbatimCoordinates: '400722.8N740722.8W',
        verbatimLatitude: '400722.8N',
        verbatimLongitude: '740722.8W'
      }, {
        verbatimCoordinates: 'N 40 7.38 W 74 7.38',
        verbatimLatitude: 'N 40 7.38',
        verbatimLongitude: 'W 74 7.38'
      }, {
        verbatimCoordinates: '40:7:22.8N 74:7:22.8W',
        verbatimLatitude: '40:7:22.8N',
        verbatimLongitude: '74:7:22.8W'
      }, {
        verbatimCoordinates: '40:7:23N,74:7:23W',
        verbatimLatitude: '40:7:23N',
        verbatimLongitude: '74:7:23W',
        decimalLatitude: 40.1230555555,
        decimalLongitude: -74.1230555555
      }, {
        verbatimCoordinates: '40°7’23"N 74°7’23"W',
        verbatimLatitude: '40°7’23"N',
        verbatimLongitude: '74°7’23"W',
        decimalLatitude: 40.1230555555,
        decimalLongitude: -74.12305555555555
      }, {
        verbatimCoordinates: '40°7’23"S 74°7’23"E',
        verbatimLatitude: '40°7’23"S',
        verbatimLongitude: '74°7’23"E',
        decimalLatitude: -40.1230555555,
        decimalLongitude: 74.12305555555555
      }, {
        verbatimCoordinates: '40°7’23" -74°7’23"',
        verbatimLatitude: '40°7’23"',
        verbatimLongitude: '-74°7’23"',
        decimalLatitude: 40.1230555555,
        decimalLongitude: -74.123055555
      }, {
        verbatimCoordinates: '40d 7’ 23" N 74d 7’ 23" W',
        verbatimLatitude: '40d 7’ 23" N',
        verbatimLongitude: '74d 7’ 23" W',
        decimalLatitude: 40.1230555555,
        decimalLongitude: -74.123055555
      }, {
        verbatimCoordinates: '40.123N 74.123W',
        verbatimLatitude: '40.123N',
        verbatimLongitude: '74.123W'
      }, {
        verbatimCoordinates: '40° 7.38, -74° 7.38',
        verbatimLatitude: '40° 7.38',
        verbatimLongitude: '-74° 7.38'
      }, {
        verbatimCoordinates: '40° 7.38, -74° 7.38',
        verbatimLatitude: '40° 7.38',
        verbatimLongitude: '-74° 7.38'
      }, {
        verbatimCoordinates: '40 7 22.8; -74 7 22.8',
        //semicolon separator
        verbatimLatitude: '40 7 22.8',
        verbatimLongitude: '-74 7 22.8'
      }];
      var coordsParserDecimals = {
        decimalLatitude: 40.123,
        decimalLongitude: -74.123
      }; //formats from https://gist.github.com/moole/3707127/337bd31d813a10abcf55084381803e5bbb0b20dc 

      var coordsRegexFormats = [{
        verbatimCoordinates: '50°4\'17.698"south, 14°24\'2.826"east',
        verbatimLatitude: '50°4\'17.698"south',
        verbatimLongitude: '14°24\'2.826"east',
        decimalLatitude: -50.0715827777777778,
        decimalLongitude: 14.400785
      }, {
        verbatimCoordinates: '50d4m17.698S 14d24m2.826E',
        verbatimLatitude: '50d4m17.698S',
        verbatimLongitude: '14d24m2.826E',
        decimalLatitude: -50.0715827777777778,
        decimalLongitude: 14.400785
      }, {
        verbatimCoordinates: '40:26:46N,79:56:55W',
        verbatimLatitude: '40:26:46N',
        verbatimLongitude: '79:56:55W',
        decimalLatitude: 40.4461111111111111,
        decimalLongitude: -79.9486111111111111
      }, {
        verbatimCoordinates: '40:26:46.302N 79:56:55.903W',
        verbatimLatitude: '40:26:46.302N',
        verbatimLongitude: '79:56:55.903W',
        decimalLatitude: 40.446195,
        decimalLongitude: -79.9488619444444444
      }, {
        verbatimCoordinates: '40°26′47″N 79°58′36″W',
        verbatimLatitude: '40°26′47″N',
        verbatimLongitude: '79°58′36″W',
        decimalLatitude: 40.4463888888888889,
        decimalLongitude: -79.9766666666666667
      }, {
        verbatimCoordinates: '40d 26′ 47″ N 79d 58′ 36″ W',
        verbatimLatitude: '40d 26′ 47″ N',
        verbatimLongitude: '79d 58′ 36″ W',
        decimalLatitude: 40.4463888888888889,
        decimalLongitude: -79.9766666666666667
      }, {
        verbatimCoordinates: '40.446195N 79.948862W',
        verbatimLatitude: '40.446195N',
        verbatimLongitude: '79.948862W',
        decimalLatitude: 40.446195,
        decimalLongitude: -79.948862
      }, {
        verbatimCoordinates: '40,446195° 79,948862°',
        verbatimLatitude: '40,446195°',
        verbatimLongitude: '79,948862°',
        decimalLatitude: 40.446195,
        decimalLongitude: 79.948862
      }, {
        verbatimCoordinates: '40° 26.7717, -79° 56.93172',
        verbatimLatitude: '40° 26.7717',
        verbatimLongitude: '-79° 56.93172',
        decimalLatitude: 40.446195,
        decimalLongitude: -79.948862
      }, {
        verbatimCoordinates: '40.446195, -79.948862',
        verbatimLatitude: '40.446195',
        verbatimLongitude: '-79.948862',
        decimalLatitude: 40.446195,
        decimalLongitude: -79.948862
      }, {
        verbatimCoordinates: '40.123256; -74.123256',
        //testing semicolon
        verbatimLatitude: '40.123256',
        verbatimLongitude: '-74.123256',
        decimalLatitude: 40.123256,
        decimalLongitude: -74.123256
      }, {
        verbatimCoordinates: '18°24S 22°45E',
        //this is read as degrees and minutes
        verbatimLatitude: '18°24S',
        verbatimLongitude: '22°45E',
        decimalLatitude: -18.4,
        decimalLongitude: 22.75
      }];
      var otherFormats = [
      // additional formats we've encountered
      {
        verbatimCoordinates: '10.432342S 10.6345345E',
        //this is read as degrees and minutes
        verbatimLatitude: '10.432342S',
        verbatimLongitude: '10.6345345E',
        decimalLatitude: -10.432342,
        decimalLongitude: 10.6345345
      }, {
        verbatimCoordinates: '10.00S 10.00E',
        //this is read as degrees and minutes
        verbatimLatitude: '10.00S',
        verbatimLongitude: '10.00E',
        decimalLatitude: -10.00000,
        decimalLongitude: 10.00000
      }, {
        verbatimCoordinates: '00.00S 01.00E',
        //this is read as degrees and minutes
        verbatimLatitude: '00.00S',
        verbatimLongitude: '01.00E',
        decimalLatitude: 0.00000,
        decimalLongitude: 1.00000
      }, {
        verbatimCoordinates: '18.24S 22.45E',
        //this is read as degrees and minutes
        verbatimLatitude: '18.24S',
        verbatimLongitude: '22.45E',
        decimalLatitude: -18.4,
        decimalLongitude: 22.75
      }, {
        verbatimCoordinates: '27deg 15min 45.2sec S 18deg 32min 53.7sec E',
        verbatimLatitude: '27deg 15min 45.2sec S',
        verbatimLongitude: '18deg 32min 53.7sec E',
        decimalLatitude: -27.2625555555555556,
        decimalLongitude: 18.54825
      }, {
        verbatimCoordinates: '-23.3245° S / 28.2344° E',
        verbatimLatitude: '-23.3245° S',
        verbatimLongitude: '28.2344° E',
        decimalLatitude: -23.3245,
        decimalLongitude: 28.2344
      }, {
        verbatimCoordinates: '40° 26.7717 -79° 56.93172',
        verbatimLatitude: '40° 26.7717',
        verbatimLongitude: '-79° 56.93172',
        decimalLatitude: 40.446195,
        decimalLongitude: -79.948862
      }, {
        verbatimCoordinates: '27.15.45S 18.32.53E',
        verbatimLatitude: '27.15.45S',
        verbatimLongitude: '18.32.53E',
        decimalLatitude: -27.2625,
        decimalLongitude: 18.548055
      }, {
        verbatimCoordinates: '-27.15.45 18.32.53',
        verbatimLatitude: '-27.15.45',
        verbatimLongitude: '18.32.53',
        decimalLatitude: -27.2625,
        decimalLongitude: 18.548055
      }, {
        verbatimCoordinates: '27.15.45.2S 18.32.53.4E',
        verbatimLatitude: '27.15.45.2S',
        verbatimLongitude: '18.32.53.4E',
        decimalLatitude: -27.262556,
        decimalLongitude: 18.548167
      }, {
        verbatimCoordinates: '27.15.45,2S 18.32.53,4E',
        verbatimLatitude: '27.15.45,2S',
        verbatimLongitude: '18.32.53,4E',
        decimalLatitude: -27.262556,
        decimalLongitude: 18.548167
      }, {
        verbatimCoordinates: 'S23.43563 °  E22.45634 °',
        //decimals with spaces before the symbol!!
        verbatimLatitude: 'S23.43563 °',
        verbatimLongitude: 'E22.45634 °',
        decimalLatitude: -23.43563,
        decimalLongitude: 22.45634
      }, {
        verbatimCoordinates: '27,71372° S 23,07771° E',
        //decimals with commas
        verbatimLatitude: '27,71372° S',
        verbatimLongitude: '23,07771° E',
        decimalLatitude: -27.71372,
        decimalLongitude: 23.07771
      }, {
        verbatimCoordinates: '27.45.34 S 23.23.23 E',
        verbatimLatitude: '27.45.34 S',
        verbatimLongitude: '23.23.23 E',
        decimalLatitude: -27.759444,
        decimalLongitude: 23.38972222
      }, {
        verbatimCoordinates: 'S 27.45.34 E 23.23.23',
        verbatimLatitude: 'S 27.45.34',
        verbatimLongitude: 'E 23.23.23',
        decimalLatitude: -27.759444,
        decimalLongitude: 23.38972222
      }];
      function getAllTestFormats() {
        var arr1 = [];
        coordsParserFormats.forEach(function (item) {
          if (item.decimalLatitude) {
            arr1.push(item);
          } else {
            arr1.push(_objectSpread(_objectSpread({}, item), coordsParserDecimals));
          }
        });
        return [].concat(arr1, coordsRegexFormats, otherFormats);
      }
      module.exports = getAllTestFormats();
    }, {}],
    5: [function (require, module, exports) {
      //borrowed from https://www.codegrepper.com/code-examples/javascript/javascript+converting+latitude+longitude+to+gps+coordinates

      /**
       * Converts decimalCoordinates to other formats commonly used
       * @param {*} format Either DMS or DM
       */
      function toCoordinateFormat(format) {
        if (!['DMS', 'DM'].includes(format)) throw new Error('invalid format specified');
        if (this.decimalCoordinates && this.decimalCoordinates.trim()) {
          var parts = this.decimalCoordinates.split(',').map(function (x) {
            return x.trim();
          });
          var convertedLat = convert(parts[0], format, true);
          var convertedLong = convert(parts[1], format, false);
          return "".concat(convertedLat, ", ").concat(convertedLong);
        } else {
          throw new Error('no decimal coordinates to convert');
        }
      } //assumes everything is valid...

      function convert(coordString, format, isLatitude) {
        var coord = Number(coordString);
        var direction;
        if (isLatitude) {
          direction = coord >= 0 ? "N" : "S";
        } else {
          direction = coord >= 0 ? "E" : "W";
        }
        var absolute = Math.abs(coord);
        var degrees = Math.floor(absolute);
        var minutesNotTruncated = (absolute - degrees) * 60;
        if (format == 'DM') {
          return "".concat(degrees, "\xB0 ").concat(minutesNotTruncated.toFixed(3).replace(/\.0+$/, ''), "' ").concat(direction);
        } //else

        var minutes = Math.floor(minutesNotTruncated);
        var seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1).replace(/\.0$/, '');
        return "".concat(degrees, "\xB0 ").concat(minutes, "' ").concat(seconds, "\" ").concat(direction);
      }
      module.exports = toCoordinateFormat;
    }, {}]
  }, {}, [2])(2);
});
