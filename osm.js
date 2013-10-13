/*global gc:true*/
'use strict';

var fs = require('fs'),
	DOMParser = require('xmldom').DOMParser,
	osm_and_geojson = require('osm-and-geojson'),
	osmstring = fs.readFileSync('./RU-IN.osm', 'utf8'),
	osmxml,
	geojson;

console.log(typeof osmstring, osmstring.length);
osmxml = new DOMParser().parseFromString(osmstring, 'text/xml');
console.log(typeof osmxml, osmxml.length);

geojson = osm_and_geojson.osm2geojson(osmxml);

fs.writeFile('./RU-IN.json', JSON.stringify(geojson), function (err) {
  if (err) throw err;
  console.log('It\'s saved!');
});