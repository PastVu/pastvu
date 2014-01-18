/*global gc:true*/
'use strict';

/**
 * Конвертирует osm-файл (в формате xml) в GeoJSON
 */
var fs = require('fs'),
	DOMParser = require('xmldom').DOMParser,
	osm_and_geojson = require('osm-and-geojson'),

	osmstring = fs.readFileSync('./singa2.osm', 'utf8'), //Строка с оригинальным osm
	osmxml, //Рапарсенный xml
	geojson; //Результирующий GeoJSON

console.log(typeof osmstring, osmstring.length);
osmxml = new DOMParser().parseFromString(osmstring, 'text/xml');
console.log(typeof osmxml, osmxml.length);

geojson = osm_and_geojson.osm2geojson(osmxml);

fs.writeFile('./osmgeo.json', JSON.stringify(geojson), function (err) {
  if (err) throw err;
  console.log('It\'s saved!');
});