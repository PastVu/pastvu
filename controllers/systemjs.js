/*global module:true, ObjectId:true, print:true, printjson:true, linkifyUrlString: true, inputIncomingParse: true, toPrecision: true, toPrecision6: true, toPrecisionRound:true, geoToPrecision:true, geoToPrecisionRound:true, spinLng:true*/
'use strict';

var log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	saveSystemJSFunc(function clusterPhotosAll(withGravity, logByNPhotos, zooms) {
		var startFullTime = Date.now(),
			clusterparamsQuery = {sgeo: {$exists: false}},
			clusterZooms,
			clusterZoomsCounter = -1,
			photosAllCount = db.photos.count({s: 5, geo: {$exists: true}});

		if (zooms) {
			clusterparamsQuery.z = {$in: zooms};
		}
		clusterZooms = db.clusterparams.find(clusterparamsQuery, {_id: 0}).sort({z: 1}).toArray();

		logByNPhotos = logByNPhotos || ((photosAllCount / 20) >> 0);
		print('Start to clusterize ' + photosAllCount + ' photos with log for every ' + logByNPhotos + '. Gravity: ' + withGravity);

		while (++clusterZoomsCounter < clusterZooms.length) {
			clusterizeZoom(clusterZooms[clusterZoomsCounter]);
		}

		function clusterizeZoom(clusterZoom) {
			var startTime = Date.now(),

				photos = db.photos.find({s: 5, geo: {$exists: true}}, {_id: 0, geo: 1, year: 1, year2: 1 }),
				photoCounter = 0,
				geoPhoto,
				geoPhotoCorrection = [0, 0],

				useGravity,
				divider = Math.pow(10, 6),

				g,
				cluster,
				clusters = {},
				clustersCount = 0,
				clustersArr = [],
				clustersArrInner,
				clustersArrLastIndex = 0,
				clustCoordId,
				clustersInserted = 0,
				clustersCounter,
				clustersCounterInner,

				sorterByCount = function (a, b) {
					return a.c === b.c ? 0 : (a.c < b.c ? 1: -1);
				};

			clusterZoom.wHalf = toPrecisionRound(clusterZoom.w / 2);
			clusterZoom.hHalf = toPrecisionRound(clusterZoom.h / 2);

			useGravity = withGravity && clusterZoom.z > 11;
			clustersArr.push([]);

			photos.forEach(function (photo) {
				photoCounter++;
				geoPhoto = photo.geo;
				geoPhotoCorrection[0] = geoPhoto[0] < 0 ? -1 : 0;
				geoPhotoCorrection[1] = geoPhoto[1] > 0 ? 1 : 0;

				g = [ Math.round(divider * (clusterZoom.w * ((geoPhoto[0] / clusterZoom.w >> 0) + geoPhotoCorrection[0]))) / divider, Math.round(divider * (clusterZoom.h * ((geoPhoto[1] / clusterZoom.h >> 0) + geoPhotoCorrection[1]))) / divider ];
				clustCoordId = g[0] + '@' + g[1];
				cluster = clusters[clustCoordId];
				if (cluster === undefined) {
					clustersCount++;
					clusters[clustCoordId] = cluster = {g: g, z: clusterZoom.z, geo: [g[0] + clusterZoom.wHalf, g[1] - clusterZoom.hHalf], c: 0, y: {}, p: null};
					if (clustersArr[clustersArrLastIndex].push(cluster) > 249) {
						clustersArr.push([]);
						clustersArrLastIndex++;
					}
				}
				cluster.c += 1;
				cluster.y[photo.year] = 1 + (cluster.y[photo.year] | 0);
				if (useGravity) {
					cluster.geo[0] += geoPhoto[0];
					cluster.geo[1] += geoPhoto[1];
				}

				if (photoCounter % logByNPhotos === 0) {
					print(clusterZoom.z + ': Clusterized allready ' + photoCounter + '/' + photosAllCount + ' photos in ' + clustersCount + ' clusters in ' + (Date.now() - startTime) / 1000 + 's');
				}
			});

			print(clusterZoom.z + ': ' + clustersCount + ' clusters ready for inserting ' + (Date.now() - startTime) / 1000 + 's');
			db.clusters.remove({z: clusterZoom.z});

			clustersCounter = clustersArr.length;
			while (clustersCounter) {
				clustersArrInner = clustersArr[--clustersCounter];
				clustersArrInner.sort(sorterByCount);

				clustersCounterInner = clustersArrInner.length;
				if (clustersCounterInner > 0) {
					while (clustersCounterInner) {
						cluster = clustersArrInner[--clustersCounterInner];
						if (useGravity) {
							cluster.geo[0] = Math.round(divider * (cluster.geo[0] / (cluster.c + 1))) / divider;
							cluster.geo[1] = Math.round(divider * (cluster.geo[1] / (cluster.c + 1))) / divider;
						}
						if (cluster.geo[0] < -180 || cluster.geo[0] > 180) {
							spinLng(cluster.geo);
						}
						if (cluster.g[0] < -180 || cluster.g[0] > 180) {
							spinLng(cluster.g);
						}
						cluster.p = db.photos.findOne({s: 5, geo: {$near: cluster.geo}}, {_id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1});
					}
				}
				db.clusters.insert(clustersArrInner);
				clustersInserted += clustersArrInner.length;
				print(clusterZoom.z + ': Inserted ' + clustersInserted + '/' + clustersCount + ' clusters ok. ' + (Date.now() - startTime) / 1000 + 's');
			}

			clusters = clustersArr = clustersArrInner = null;
			print('~~~~~~~~~~~~~~~~~~~~~~~~~');
		}


		return {message: 'Ok in ' + (Date.now() - startFullTime) / 1000 + 's', photos: photosAllCount, clusters: db.clusters.count()};
	});

	saveSystemJSFunc(function photosToMapAll() {
		var startTime = Date.now();

		print('Clearing photos map collection');
		db.photos_map.remove();

		print('Start to fill conveyer for ' + db.photos.count({s: 5, geo: {$exists: true}}) + ' photos');
		db.photos.find({s: 5, geo: {$exists: true}}, {_id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1}).sort({cid: 1}).forEach(function (photo) {
			db.photos_map.insert({
				cid: photo.cid,
				geo: photo.geo,
				file: photo.file,
				dir: photo.dir || '',
				title: photo.title || '',
				year: photo.year || 2000,
				year2: photo.year2 || photo.year || 2000
			});
		});

		return {message: db.photos_map.count() + ' photos to map added in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	saveSystemJSFunc(function convertPhotosAll(variants) {
		var startTime = Date.now(),
			addDate = new Date(),
			conveyer = [],
			selectFields = {_id: 0, cid: 1},
			photoCounter,
			iterator = function (photo) {
				conveyer.push(
					{
						cid: photo.cid,
						added: addDate
					}
				);
			};

		print('Start to fill conveyer for ' + db.photos.count() + ' photos');
		db.photos.find({}, selectFields).sort({sdate: 1}).forEach(iterator);

		if (Array.isArray(variants) && variants.length > 0) {
			photoCounter = conveyer.length;
			while (photoCounter--) {
				conveyer[photoCounter].variants = variants;
			}
		}

		db.photos_conveyer.insert(conveyer);
		return {message: 'Added ' + conveyer.length + ' photos to conveyer in ' + (Date.now() - startTime) / 1000 + 's', photosAdded: conveyer.length};
	});

	//Для фотографий с координатой заново расчитываем регионы
	saveSystemJSFunc(function regionsAssignObjects() {
		var startTime = Date.now();

		//Очищаем принадлежность к регионам у всех фотографий с проставленной точкой
		print('Clearing current regions assignment\n');
		db.photos.update({geo: {$exists: true}}, {$unset: {r0: 1, r1: 1, r2: 1, r3: 1, r4: 1, r5: 1}}, {multi: true});
		//Для каждого региона находим фотографии
		print('Start to assign for ' + db.regions.count() + ' regions..\n');
		db.regions.find({cid: {$ne: 1000000}}, {cid: 1, parents: 1, geo: 1, title_en: 1}).forEach(function (region) {
			var startTime = Date.now(),
				count,
				queryObject = {},
				setObject = {$set: {}};

			queryObject.geo = {$geoWithin: {$geometry: region.geo}};
			setObject.$set['r' + region.parents.length] = region.cid;

			count = db.photos.count(queryObject);
			print('Assigning ' + count + ' photos for [r' + region.parents.length + '] ' + region.cid + ' ' + region.title_en + ' region');
			if (count) {
				db.photos.update(queryObject, setObject, {multi: true});
			}

			print('Finished in ' + (Date.now() - startTime) / 1000 + 's\n');
		});

		return {message: 'All assigning finished in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	//Присваиваем регионы комментариям фотографий
	saveSystemJSFunc(function regionsAssignComments() {
		var startTime = Date.now(),
			photoCounter = 0,
			maxRegionLevel = 5;

		//Присваиваем регионы комментариям фотографий
		print('Assign regions to comments for ' + db.photos.count({s: {$gte: 5}}) + ' published photos');
		db.photos.find({s: {$gte: 5}}, {_id: 1, r0: 1, r1: 1, r2: 1, r3: 1, r4: 1, r5: 1}).forEach(function (photo) {
			var r,
				$set = {},
				$unset = {},
				$update = {};

			for (var i = 0; i <= maxRegionLevel; i++) {
				r = 'r' + i;
				if (photo[r]) {
					$set[r] = photo[r];
				} else {
					$unset[r] = 1;
				}
			}
			if (Object.keys($set).length) {
				$update.$set = $set;
			}
			if (Object.keys($unset).length) {
				$update.$unset = $unset;
			}

			if (Object.keys($update).length) {
				db.comments.update({obj: photo._id}, $update, {multi: true});
			}
			photoCounter++;
			if (photoCounter % 1000 === 0) {
				print('Assigned comments for ' + photoCounter + ' published photos. Cumulative time: ' + ((Date.now() - startTime) / 1000) + 'ms');
			}
		});

		return {message: 'All assigning finished in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	//Расчет центров регионов
	//withManual - Всех регионов, включая тех, у кого центр установлен вручную
	saveSystemJSFunc(function regionsCalcCenter(withManual) {
		var startTime = Date.now(),
			query = {cid: {$ne: 1000000}};

		if (!withManual) {
			query.$or = [{centerAuto: true}, {centerAuto: null}];
		}

		print('Start to calc center for ' + db.regions.count(query) + ' regions..\n');
		db.regions.find(query, {_id: 0, cid: 1, geo: 1, bbox: 1}).forEach(function (region) {
			if (region.geo && (region.geo.type === 'MultiPolygon' || region.geo.type === 'Polygon')) {
				db.regions.update({cid: region.cid}, {$set: {center: geoToPrecision(region.geo.type === 'MultiPolygon' ? [(region.bbox[0] + region.bbox[2]) / 2, (region.bbox[1] + region.bbox[3]) / 2] : polyCentroid(region.geo.coordinates[0])), centerAuto: true}});
			} else {
				print('Error with ' + region.cid + ' region');
			}
		});

		function polyCentroid(points) {
			var pointsLen = points.length,
				i = 0, j = pointsLen - 1,
				f,
				x = 0, y = 0,
				area = 0,
				p1, p2;

			for (i; i < pointsLen; j = i++) {
				p1 = points[i];
				p2 = points[j];
				f = p1[1] * p2[0] - p2[1] * p1[0];
				y += (p1[1] + p2[1]) * f;
				x += (p1[0] + p2[0]) * f;

				area += p1[1] * p2[0];
				area -= p1[0] * p2[1];
			}
			area /= 2;
			f = area * 6;
			return [x / f, y / f];
		}

		return {message: 'All finished in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	//Расчет bbox регионов
	saveSystemJSFunc(function regionsCalcBBOX() {
		var startTime = Date.now(),
			query = {cid: {$ne: 1000000}};

		print('Start to calc bbox for ' + db.regions.count(query) + ' regions..\n');
		db.regions.find(query, {_id: 0, cid: 1, geo: 1}).forEach(function (region) {
			if (region.geo && (region.geo.type === 'MultiPolygon' || region.geo.type === 'Polygon')) {
				db.regions.update({cid: region.cid}, {$set: {bbox: polyBBOX(region.geo).map(toPrecision6)}});
			} else {
				print('Error with ' + region.cid + ' region');
			}
		});

		function polyBBOX(geometry) {
			var i, resultbbox, polybbox, multipolycoords;

			if (geometry.type === 'Polygon') {
				resultbbox = getbbox(geometry.coordinates[0]);
			} else if (geometry.type === 'MultiPolygon') {
				i = geometry.coordinates.length;
				multipolycoords = [];

				while (i--) {
					polybbox = getbbox(geometry.coordinates[i][0]);

					multipolycoords.push([polybbox[0], polybbox[1]]); //SouthWest
					multipolycoords.push([polybbox[2], polybbox[1]]); //NorthWest
					multipolycoords.push([polybbox[2], polybbox[3]]); //NorthEast
					multipolycoords.push([polybbox[0], polybbox[3]]); //SouthEast
				}
				multipolycoords.sort(function (a, b) {
					return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0);
				});
				multipolycoords.push(multipolycoords[0]);
				resultbbox = getbbox(multipolycoords);
			}

			function getbbox(points) {
				var pointsLen = points.length,
					i = 0, j = pointsLen - 1,
					x1 = points[j][0], x2,
					y1 = points[j][1], y2,
					p1, p2,
					bbox;

				if (x1 === -180) {
					x1 = 180;
				}
				bbox = [x1, y1, x1, y1];

				for (i; i < pointsLen - 1; j = i++) {
					p1 = points[j]; //prev
					x1 = p1[0];
					p2 = points[i]; //current
					x2 = p2[0];
					y2 = p2[1];

					if (x1 === -180) {
						x1 = 180;
					}
					if (x2 === -180) {
						x2 = 180;
					}

					if (Math.abs(x2 - x1) <= 180) {
						if (x2 > x1 && x2 > bbox[2] && Math.abs(x2 - bbox[2]) <= 180) {
							bbox[2] = x2;
						} else if (x2 < x1 && x2 < bbox[0] && Math.abs(x2 - bbox[0]) <= 180) {
							bbox[0] = x2;
						}
					} else {
						if (x2 < 0 && x1 > 0 && (x2 > bbox[2] || bbox[2] > 0)) {
							bbox[2] = x2;
						} else if (x2 > 0 && x1 < 0 && (x2 < bbox[0] || bbox[0] < 0)) {
							bbox[0] = x2;
						}
					}

					if (y2 < bbox[1]) {
						bbox[1] = y2;
					} else if (y2 > bbox[3]) {
						bbox[3] = y2;
					}
				}
				return bbox;
			}

			return resultbbox;
		}

		return {message: 'All bbox finished in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	//Расчет количества вершин полигонов
	saveSystemJSFunc(function regionsCalcPointsNum(cidArr) {
		var startTime = Date.now(),
			query = {};

		if (Array.isArray(cidArr) && cidArr.length) {
			query.cid = cidArr.length === 1 ? cidArr[0] : {$in: cidArr};
		}

		function calcGeoJSONPointsNumReduce(previousValue, currentValue) {
			return previousValue + (Array.isArray(currentValue[0]) ? currentValue.reduce(calcGeoJSONPointsNumReduce, 0) : 1);
		}

		print('Start to calculate points number for ' + db.regions.count(query) + ' regions..\n');
		db.regions.find(query, {cid: 1, geo: 1, title_en: 1}).sort({cid: 1}).forEach(function (region) {
			var startTime = Date.now(),
				count;

			count = region.geo.type === 'Point' ? 1 : region.geo.coordinates.reduce(calcGeoJSONPointsNumReduce, 0);
			db.regions.update({cid: region.cid}, {$set: {pointsnum: count}});
			print(count + ': ' + region.cid + ' ' + region.title_en + ' in ' + (Date.now() - startTime) / 1000 + 's');
		});

		print('\n');
		return {message: 'All calculated in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	//Расчет количества полигонов в регионе {exterior: 0, interior: 0}
	saveSystemJSFunc(function regionsCalcPolygonsNum(cidArr) {
		var startTime = Date.now(),
			query = {};

		if (Array.isArray(cidArr) && cidArr.length) {
			query.cid = cidArr.length === 1 ? cidArr[0] : {$in: cidArr};
		}

		print('Start to calculate polynum for ' + db.regions.count(query) + ' regions..\n');
		db.regions.find(query, {cid: 1, geo: 1, title_en: 1}).sort({cid: 1}).forEach(function (region) {
			var polynum;

			if (region.geo.type === 'Polygon' || region.geo.type === 'MultiPolygon') {
				polynum = calcGeoJSONPolygonsNum(region.geo);
			} else {
				polynum = {exterior: 0, interior: 0};
			}

			db.regions.update({cid: region.cid}, {$set: {polynum: polynum}});
		});

		function calcGeoJSONPolygonsNum(geometry) {
			var result,
				res,
				i;

			if (geometry.type === 'MultiPolygon') {
				result = {exterior: 0, interior: 0};
				for (i = geometry.coordinates.length; i--;) {
					res = polyNum(geometry.coordinates[i]);
					result.exterior += res.exterior;
					result.interior += res.interior;
				}
			} else if (geometry.type === 'Polygon') {
				result = polyNum(geometry.coordinates);
			}

			function polyNum (polygons) {
				return {exterior: 1, interior: polygons.length - 1};
			}
			return result;
		}

		print('\n');
		return {message: 'All calculated in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	saveSystemJSFunc(function calcUserStats() {
		var startTime = Date.now(),
			users = db.users.find({}, {_id: 1}).sort({cid: -1}).toArray(),
			user,
			userCounter = users.length,
			$set,
			$unset,
			$update,
			pcount,
			pfcount,
			ccount;

		print('Start to calc for ' + userCounter + ' users');
		while (userCounter--) {
			user = users[userCounter];
			$set = {};
			$unset = {};
			$update = {};
			pcount = db.photos.count({user: user._id, s: 5});
			pfcount = db.photos.count({user: user._id, s: {$in: [0, 1]}});
			ccount = db.comments.count({user: user._id, del: null, hidden: null}) + db.commentsn.count({user: user._id, del: null, hidden: null});

			if (pcount > 0) {
				$set.pcount = pcount;
			} else {
				$unset.pcount = 1;
			}
			if (pfcount > 0) {
				$set.pfcount = pfcount;
			} else {
				$unset.pfcount = 1;
			}
			if (ccount > 0) {
				$set.ccount = ccount;
			} else {
				$unset.ccount = 1;
			}

			//Нельзя присваивать пустой объект $set или $unset - обновления не будет, поэтому проверяем на кол-во ключей
			if (Object.keys($set).length) {
				$update.$set = $set;
			}
			if (Object.keys($unset).length) {
				$update.$unset = $unset;
			}

			db.users.update({_id: user._id}, $update, {upsert: false});
		}

		return {message: 'User statistics were calculated in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	saveSystemJSFunc(function calcPhotoStats() {
		var startTime = Date.now(),
			photos = db.photos.find({}, {_id: 1}).sort({cid: -1}).toArray(),
			photo,
			counter = photos.length,
			photoCounter = 0,
			$set,
			$unset,
			$update,
			ccount;

		print('Start to calc for ' + counter + ' photos');
		while (counter--) {
			photo = photos[counter];
			$set = {};
			$unset = {};
			$update = {};
			ccount = db.comments.count({obj: photo._id, del: null});

			if (ccount > 0) {
				$set.ccount = ccount;
			} else {
				$unset.ccount = 1;
			}

			if (Object.keys($set).length) {
				$update.$set = $set;
			}
			if (Object.keys($unset).length) {
				$update.$unset = $unset;
			}

			db.photos.update({_id: photo._id}, $update, {upsert: false});

			photoCounter++;
			if (photoCounter % 1000 === 0) {
				print('Calculated stats for ' + photoCounter + ' photos. Cumulative time: ' + ((Date.now() - startTime) / 1000) + 'ms');
			}
		}

		return {message: 'Photos statistics were calculated in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	saveSystemJSFunc(function toPrecision(number, precision) {
		var divider = Math.pow(10, precision || 6);
		return ~~(number * divider) / divider;
	});
	saveSystemJSFunc(function toPrecision6(number) {
		return toPrecision(number, 6);
	});

	saveSystemJSFunc(function toPrecisionRound(number, precision) {
		var divider = Math.pow(10, precision || 6);
		return Math.round(number * divider) / divider;
	});

	saveSystemJSFunc(function geoToPrecision(geo, precision) {
		geo.forEach(function (item, index, array) {
			array[index] = toPrecision(item, precision || 6);
		});
		return geo;
	});

	saveSystemJSFunc(function geoToPrecisionRound(geo, precision) {
		geo.forEach(function (item, index, array) {
			array[index] = toPrecisionRound(item, precision || 6);
		});
		return geo;
	});

	saveSystemJSFunc(function spinLng(geo) {
		if (geo[0] < -180) {
			geo[0] += 360;
		} else if (geo[0] > 180) {
			geo[0] -= 360;
		}
	});

	saveSystemJSFunc(function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
		var R = 6371, // Mean radius of the earth in km
			toRad = Math.PI / 180, // deg2rad below
			dLat = (lat2 - lat1) * toRad,
			dLon = (lon2 - lon1) * toRad,
			a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
				Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2),
			c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
			d = R * c; // Distance in km
		return d;
	});


	saveSystemJSFunc(function linkifyUrlString(inputText, target, className) {
		var replacedText, replacePattern1, replacePattern2;

		target = target ? ' target="' + target + '"' : '';
		className = className ? ' class="' + className + '"' : '';

		//URLs starting with http://, https://, or ftp://
		replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
		replacedText = inputText.replace(replacePattern1, '<a href="$1"' + target + className + '>$1</a>');

		//URLs starting with "www." (without // before it, or it'd re-link the ones done above).
		replacePattern2 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
		replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2"' + target + className + '>$2</a>');

		return replacedText;
	});

	saveSystemJSFunc(function inputIncomingParse(txt, spbPhotoShift) {
		var result = String(txt);

		result = result.trim(); //Обрезаем концы

		//www.oldmos.ru/photo/view/22382 ->> <a target="_blank" href="/p/22382">#22382</a>
		result = result.replace(new RegExp('(\\b)(?:https?://)?(?:www.)?oldmos.ru/photo/view/(\\d{1,8})/?(?=[\\s\\)\\.,;>]|$)', 'gi'), '$1<a target="_blank" class="sharpPhoto" href="/p/$2">#$2</a>');

		if (spbPhotoShift) {
			//www.oldsp.ru/photo/view/22382 ->> <a target="_blank" href="/p/22382 + spbPhotoShift">#22382 + spbPhotoShift</a>
			result = spbReplace(result);
		}

		result = linkifyUrlString(result, '_blank'); //Оборачиваем url в ahref
		result = result.replace(/\n{3,}/g, '<br><br>').replace(/\n/g, '<br>'); //Заменяем переносы на <br>
		result = result.replace(/\s+/g, ' '); //Очищаем лишние пробелы
		return result;

		function spbReplace(inputText) {
			var matches = inputText.match(/[\s\,\.]?(?:http\:\/\/)?(?:www\.)?oldsp\.ru\/photo\/view\/(\d{1,8})/gim),
				shifted,
				i;

			if (matches && matches.length > 0) {
				for (i = matches.length; i--;) {
					shifted = parseInt(matches[i].substr(matches[0].lastIndexOf('/') + 1), 10) + spbPhotoShift;
					if (!isNaN(shifted)) {
						inputText = inputText.replace(matches[i], ' <a target="_blank" class="sharpPhoto" href="/p/' + shifted + '">#' + shifted + '</a> ');
					}
				}
			}

			return inputText;
		}
	});


	/**
	 * Save function to db.system.js
	 * @param func
	 */
	function saveSystemJSFunc(func) {
		if (!func || !func.name) {
			logger.error('saveSystemJSFunc: function name is not defined');
		}
		db.db.collection('system.js').save(
			{
				_id: func.name,
				value: new mongoose.mongo.Code(func.toString())
			},
			function saveCallback(err) {
				if (err) {
					logger.error(err);
				}
			}
		);
	}
};
