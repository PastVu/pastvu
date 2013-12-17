/*global module:true, ObjectId:true, print:true, printjson:true, linkifyUrlString: true, inputIncomingParse: true, toPrecision: true, toPrecisionRound:true, geoToPrecisionRound:true*/
'use strict';

var log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	saveSystemJSFunc(function clusterPhotosAll(withGravity, logByNPhotos) {
		var startFullTime = Date.now(),
			clusterZooms = db.clusterparams.find({sgeo: {$exists: false}}, {_id: 0}).sort({z: 1}).toArray(),
			clusterZoomsCounter = -1,
			photosAllCount = db.photos.count({geo: {$exists: true}});

		logByNPhotos = logByNPhotos || ((photosAllCount / 20) >> 0);
		print('Start to clusterize ' + photosAllCount + ' photos with log for every ' + logByNPhotos + '. Gravity: ' + withGravity);

		while (++clusterZoomsCounter < clusterZooms.length) {
			clusterizeZoom(clusterZooms[clusterZoomsCounter]);
		}

		function clusterizeZoom(clusterZoom) {
			var startTime = Date.now(),

				photos = db.photos.find({geo: {$exists: true}}, {_id: 0, geo: 1, year: 1, year2: 1 }),
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
				clustersCounter,
				clustersCounterInner;

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
					if (clustersArr[clustersArrLastIndex].push(cluster) > 499) {
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
				clustersCounterInner = clustersArrInner.length;
				if (clustersCounterInner > 0) {
					while (clustersCounterInner) {
						cluster = clustersArrInner[--clustersCounterInner];
						if (useGravity) {
							cluster.geo[0] = Math.round(divider * (cluster.geo[0] / (cluster.c + 1))) / divider;
							cluster.geo[1] = Math.round(divider * (cluster.geo[1] / (cluster.c + 1))) / divider;
						}
						cluster.p = db.photos.findOne({geo: {$near: cluster.geo}}, {_id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1});
					}

					db.clusters.insert(clustersArrInner);
					print(clusterZoom.z + ': Inserted ' + clustersArrInner.length + '/' + clustersCount + ' clusters ok. ' + (Date.now() - startTime) / 1000 + 's');
				}
			}

			clusters = clustersArr = clustersArrInner = null;
			print('~~~~~~~~~~~~~~~~~~~~~~~~~');
		}


		return {message: 'Ok in ' + (Date.now() - startFullTime) / 1000 + 's', photos: photosAllCount, clusters: db.clusters.count()};
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

	//Расчет количества вершин полигонов
	saveSystemJSFunc(function regionsCalcPointsNum(cidArr) {
		var startTime = Date.now(),
			query = {};

		if (Array.isArray(cidArr) && cidArr.length) {
			query.cid = cidArr.length === 1 ? cidArr[0] : {$in: cidArr};
		}

		function calcGeoJSONPointsNumReduce (previousValue, currentValue) {
			return previousValue + (Array.isArray(currentValue[0]) ? currentValue.reduce(calcGeoJSONPointsNumReduce, 0) : 1);
		}

		print('Start to calculate points number for ' + db.regions.count(query) + ' regions..\n');
		db.regions.find(query, {cid: 1, geo: 1, title_en: 1}).sort({cid: 1}).forEach(function (region) {
			var startTime = Date.now(),
				count;

			count = region.geo.type === 'Point' ? 1 : region.geo.coordinates.reduce(calcGeoJSONPointsNumReduce, 0);
			db.regions.update({cid: region.cid}, {$set: {pointsnum: count}});
			print(count + ': ' + region.cid + ' '+ region.title_en + ' in ' + (Date.now() - startTime) / 1000 + 's');
		});

		print('\n');
		return {message: 'All calculated in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	//Для фотографий с координатой заново расчитываем регионы
	saveSystemJSFunc(function assignToRegions() {
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
			print('Assigning ' + count + ' photos for [r' + region.parents.length + '] ' + region.cid + ' '+ region.title_en + ' region');
			if (count) {
				db.photos.update(queryObject, setObject, {multi: true});
			}

			print('Finished in ' + (Date.now() - startTime) / 1000 + 's\n');
		});

		return {message: 'All assigning finished in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	saveSystemJSFunc(function calcUserStats() {
		var startTime = Date.now(),
			users = db.users.find({}, {_id: 1}).sort({cid: -1}).toArray(),
			user,
			userCounter = users.length,
			$set,
			$unset,
			pcount,
			pfcount,
		//bcount,
			ccount;

		print('Start to calc for ' + userCounter + ' users');
		while (userCounter--) {
			user = users[userCounter];
			$set = {};
			$unset = {};
			pcount = db.photos.count({user: user._id, s: 5});
			pfcount = db.photos.count({user: user._id, s: {$in: [0, 1]}});
			ccount = db.comments.count({user: user._id}) + db.commentsn.count({user: user._id});
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
			db.users.update({_id: user._id}, {$set: $set, $unset: $unset}, {upsert: false});
		}

		return {message: 'User statistics were calculated in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	saveSystemJSFunc(function calcPhotoStats() {
		var startTime = Date.now(),
			photos = db.photos.find({}, {_id: 1}).sort({cid: -1}).toArray(),
			photo,
			counter = photos.length,
			$set,
			$unset,
			ccount;

		print('Start to calc for ' + counter + ' photos');
		while (counter--) {
			photo = photos[counter];
			$set = {};
			$unset = {};
			ccount = db.comments.count({obj: photo._id});
			if (ccount > 0) {
				$set.ccount = ccount;
			} else {
				$unset.ccount = 1;
			}
			db.photos.update({_id: photo._id}, {$set: $set, $unset: $unset}, {upsert: false});
		}

		return {message: 'Photos statistics were calculated in ' + (Date.now() - startTime) / 1000 + 's'};
	});

	saveSystemJSFunc(function toPrecision(number, precision) {
		var divider = Math.pow(10, precision || 6);
		return ~~(number * divider) / divider;
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

	saveSystemJSFunc(function geoToPrecisionRound(geo, precision) {
		geo.forEach(function (item, index, array) {
			array[index] = toPrecisionRound(item, precision || 6);
		});
		return geo;
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
