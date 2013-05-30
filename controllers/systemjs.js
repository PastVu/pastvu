'use strict';

var step = require('step'),
	log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	saveSystemJSFunc(function clusterRecalcByPhoto(g, zParam, geoPhotos, yearPhotos) {
		var cluster = db.clusters.findOne({g: g, z: zParam.z}, {_id: 0, c: 1, geo: 1, y: 1, p: 1}),
			c = (cluster && cluster.c) || 0,
			yCluster = (cluster && cluster.y) || {},
			geoCluster = (cluster && cluster.geo) || [g[0] + zParam.wHalf, g[1] - zParam.hHalf],
			inc = 0,
			$update = {$set: {}};

		if (geoPhotos.o) {
			inc -= 1;
		}
		if (geoPhotos.n) {
			inc += 1;
		}

		if (cluster && c <= 1 && inc === -1) {
			// Если после удаления фото из кластера, кластер останется пустым - удаляем его
			db.clusters.remove({g: g, z: zParam.z});
			return;
		}
		if (inc !== 0) {
			$update.$inc = {c: inc};
		}

		if (yearPhotos.o !== yearPhotos.n) {
			if (yearPhotos.o && yCluster[yearPhotos.o] !== undefined && yCluster[yearPhotos.o] > 0) {
				yCluster[yearPhotos.o] -= 1;
				if (yCluster[yearPhotos.o] < 1) {
					delete yCluster[yearPhotos.o];
				}
			}
			if (yearPhotos.n) {
				yCluster[String(yearPhotos.n)] = 1 + (yCluster[String(yearPhotos.n)] | 0);
			}
			$update.$set.y = yCluster;
		}

		if (zParam.z > 11) {
			// Если находимся на масштабе, где должен считаться центр тяжести,
			// то при наличии старой координаты вычитаем её, а при наличии новой - прибавляем.
			// Если переданы обе, значит координата фотографии изменилась в пределах одной ячейки,
			// и тогда вычитаем старую и прибавляем новую.
			// Если координаты не переданы, заничит просто обновим постер кластера
			if (geoPhotos.o) {
				geoCluster = geoToPrecisionRound([(geoCluster[0] * (c + 1) - geoPhotos.o[0]) / c, (geoCluster[1] * (c + 1) - geoPhotos.o[1]) / c]);
			}
			if (geoPhotos.n) {
				geoCluster = geoToPrecisionRound([(geoCluster[0] * (c + 1) + geoPhotos.n[0]) / (c + 2), (geoCluster[1] * (c + 1) + geoPhotos.n[1]) / (c + 2)]);
			}
		}

		$update.$set.geo = geoCluster;
		$update.$set.p = db.photos.findOne({geo: {$near: geoCluster}}, {_id: 0, cid: 1, geo: 1, file: 1, dir: 1, title: 1, year: 1, year2: 1});

		db.clusters.update({g: g, z: zParam.z}, $update, {multi: false, upsert: true});
	});

	saveSystemJSFunc(function clusterPhoto(cid, geoPhotoOld, yearPhotoOld) {
		if (!cid || (geoPhotoOld && geoPhotoOld.length !== 2)) {
			return {message: 'Bad params to set photo cluster', error: true};
		}

		var photo = db.photos.findOne({cid: cid}, {_id: 0, geo: 1, year: 1}),
			clusterZooms,

			geoPhoto,
			geoPhotoCorrection,
			geoPhotoOldCorrection,

			g, // Координаты левого верхнего угла ячейки кластера для новой координаты
			gOld; // Координаты левого верхнего угла ячейки кластера для старой координаты (если она задана)

		if (!photo) {
			return {message: 'No such photo', error: true};
		}

		geoPhoto = photo.geo; // Новые координаты фото, которые уже сохранены в базе

		// Коррекция для кластера.
		// Так как кластеры высчитываются бинарным округлением (>>), то для отрицательного lng надо отнять единицу.
		// Так как отображение кластера идет от верхнего угла, то для положительного lat надо прибавить единицу
		if (geoPhoto) {
			geoPhotoCorrection = [geoPhoto[0] < 0 ? -1 : 0, geoPhoto[1] > 0 ? 1 : 0]; // Корекция для кластера текущих координат
		}
		if (geoPhotoOld) {
			geoPhotoOldCorrection = [geoPhotoOld[0] < 0 ? -1 : 0, geoPhotoOld[1] > 0 ? 1 : 0]; // Корекция для кластера старых координат
		}

		// Итерируемся по каждому масштабу, для которого заданы параметры серверной кластеризации
		clusterZooms = db.clusterparams.find({sgeo: {$exists: false}}, {_id: 0}).sort({z: 1}).toArray();
		clusterZooms.forEach(function (clusterZoom) {
			clusterZoom.wHalf = toPrecisionRound(clusterZoom.w / 2);
			clusterZoom.hHalf = toPrecisionRound(clusterZoom.h / 2);

			// Определяем ячейки для старой и новой координаты, если они есть
			if (geoPhotoOld) {
				gOld = geoToPrecisionRound([clusterZoom.w * ((geoPhotoOld[0] / clusterZoom.w >> 0) + geoPhotoOldCorrection[0]), clusterZoom.h * ((geoPhotoOld[1] / clusterZoom.h >> 0) + geoPhotoOldCorrection[1])]);
			}
			if (geoPhoto) {
				g = geoToPrecisionRound([clusterZoom.w * ((geoPhoto[0] / clusterZoom.w >> 0) + geoPhotoCorrection[0]), clusterZoom.h * ((geoPhoto[1] / clusterZoom.h >> 0) + geoPhotoCorrection[1])]);
			}

			if (gOld && g && gOld[0] === g[0] && gOld[1] === g[1]) {
				// Если старые и новые координаты заданы и для них ячейка кластера на этом масштабе одна,
				// то если координата не изменилась, пересчитываем только постер,
				// если изменилась - пересчитаем центр тяжести (отнимем старую, прибавим новую)
				if (geoPhotoOld[0] === geoPhoto[0] && geoPhotoOld[1] === geoPhoto[1]) {
					clusterRecalcByPhoto(g, clusterZoom, {}, {o: yearPhotoOld, n: photo.year});
				} else {
					clusterRecalcByPhoto(g, clusterZoom, {o: geoPhotoOld, n: geoPhoto}, {o: yearPhotoOld, n: photo.year});
				}
			} else {
				// Если ячейка для координат изменилась, или какой-либо координаты нет вовсе,
				// то пересчитываем старую и новую ячейку, если есть соответствующая координата
				if (gOld) {
					clusterRecalcByPhoto(gOld, clusterZoom, {o: geoPhotoOld}, {o: yearPhotoOld});
				}
				if (g) {
					clusterRecalcByPhoto(g, clusterZoom, {n: geoPhoto}, {n: photo.year});
				}
			}
		});

		return {message: 'Ok', error: false};
	});

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
			photos = db.photos.find({}, {_id: 0, cid: 1}).sort({adate: 1}).toArray(),
			photoCounter = photos.length,
			photosAllCount = photos.length;

		print('Start to fill new conveyer for ' + photosAllCount + ' photos');

		while (photoCounter) {
			conveyer.push(
				{
					cid: photos[--photoCounter].cid,
					added: addDate
				}
			);
		}
		if (Array.isArray(variants) && variants.length > 0) {
			photoCounter = conveyer.length;
			while (photoCounter) {
				conveyer[--photoCounter].variants = variants;
			}
		}

		db.photoconveyers.insert(conveyer);
		return {message: 'Added ' + photosAllCount + ' photos to conveyer in ' + (Date.now() - startTime) / 1000 + 's', photosAdded: photosAllCount};
	});

	saveSystemJSFunc(function calcUserStats() {
		var startTime = Date.now(),
			users = db.users.find({}, {_id: 1}).sort({cid: -1}).toArray(),
			user,
			userCounter = users.length,
			$set,
			$unset,
			pcount,
		//bcount,
			ccount;

		print('Start to calc for ' + userCounter + ' users');
		while (userCounter--) {
			user = users[userCounter];
			$set = {};
			$unset = {};
			pcount = db.photos.count({user: user._id});
			ccount = db.comments.count({user: user._id});
			if (pcount > 0) {
				$set.pcount = pcount;
			} else {
				$unset.pcount = 1;
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
			ccount = db.comments.count({photo: photo._id});
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


	/**
	 * Функции импорта конвертации старой базы олдмос
	 */
	saveSystemJSFunc(function oldConvertUsers(sourceCollectionName, byNumPerPackage, dropExisting) {
		sourceCollectionName = sourceCollectionName || 'old_users';
		byNumPerPackage = byNumPerPackage || 1000;

		if (dropExisting) {
			print('Clearing target collection...');
			db.users.remove({login: {$nin: ['init', 'neo']}});
		}

		var startTime = Date.now(),
			startDate = new Date(),
			regDate = new Date(),
			insertBy = byNumPerPackage, // Вставляем по N документов
			insertArr = [],
			newUser,
			existsOnStart = db.users.count(),
			maxCid,
			okCounter = 0,
			noactiveCounter = 0,
			allCounter = 0,
			allCount = db[sourceCollectionName].count(),
			cursor = db[sourceCollectionName].find({}, {_id: 0}).sort({id: 1});

		print('Start to convert ' + allCount + ' docs by ' + insertBy + ' in one package');

		cursor.forEach(function (user) {

			allCounter++;
			if (user.id && user.username && user.email) {
				okCounter++;
				newUser = {
					cid: user.id,
					login: user.username,
					email: user.email,
					pass: 'init',

					firstName: user.first_name || undefined,
					lastName: user.last_name || undefined,
					birthdate: user.birthday || undefined,
					sex: user.sex || undefined,
					country: user.country || undefined,
					city: user.city || undefined,
					work: user.work_field || undefined,
					www: user.website || undefined,
					icq: user.icq || undefined,
					skype: user.skype || undefined,
					aim: user.aim || undefined,
					lj: user.lj || undefined,
					flickr: user.flickr || undefined,
					blogger: user.blogger || undefined,
					aboutme: user.about || undefined,

					regdate: regDate
				};

				// Удаляем undefined значения
				for (var i in newUser) {
					if (newUser.hasOwnProperty(i) && newUser[i] === undefined) {
						delete newUser[i];
					}
				}
				if (user.ava && user.ava !== '0.png') {
					newUser.avatar = user.ava;
				}

				if (user.activated === 'yes') {
					newUser.active = true;
					newUser.activatedate = startDate;
				} else {
					noactiveCounter++;
				}
				//printjson(newUser);
				insertArr.push(newUser);
			}

			if (allCounter % byNumPerPackage === 0 || allCounter >= allCount) {
				db.users.insert(insertArr);
				print('Inserted ' + insertArr.length + '/' + okCounter + '/' + allCounter + '/' + allCount + ' in ' + (Date.now() - startTime) / 1000 + 's');
				if (db.users.count() !== okCounter + existsOnStart) {
					printjson(insertArr[0]);
					print('<...>');
					printjson(insertArr[insertArr.length - 1]);
					throw ('Total in target not equal inserted. Inserted: ' + okCounter + ' Exists: ' + db.users.count() + '. Some error inserting data packet. Stop imports');
				}
				insertArr = [];
			}
		});

		maxCid = db.users.find({}, {_id: 0, cid: 1}).sort({cid: -1}).limit(1).toArray();
		maxCid = maxCid && maxCid.length > 0 && maxCid[0].cid ? maxCid[0].cid : 1;
		print('Setting next user counter to ' + maxCid + ' + 1');
		db.counters.update({_id: 'user'}, {$set: {next: maxCid + 1}}, {upsert: true});

		return {message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's', commentsAll: db.users.count(), usersInserted: okCounter, noACtive: noactiveCounter};
	});

	saveSystemJSFunc(function oldConvertPhotos(sourceCollectionName, byNumPerPackage, dropExisting) {
		sourceCollectionName = sourceCollectionName || 'old_photos';
		byNumPerPackage = byNumPerPackage || 1000;

		if (dropExisting) {
			print('Clearing target collection...');
			db.photos.remove();
		}

		var startTime = Date.now(),

		//В старой базе время хранилось в московской зоне (-4), поэтому надо скорректировать её на зону сервера
			importedTimezoneOffset = -4,
			serverTimezoneOffset = (new Date()).getTimezoneOffset() / 60,
			resultDateCorrection = (importedTimezoneOffset - serverTimezoneOffset) * 60 * 60 * 1000,

			insertBy = byNumPerPackage, // Вставляем по N документов
			insertArr = [],
			newPhoto,
			lat,
			lng,
			noGeoCounter = 0,
			noUserCounter = 0,
			existsOnStart = db.photos.count(),
			maxCid,
			okCounter = 0,
			allCounter = 0,
			allCount = db[sourceCollectionName].count(),
			cursor = db[sourceCollectionName].find({}, {_id: 0}),//.sort({id: 1}),
			usersArr,
			users = {},
			userOid,
			i;

		print('Filling users hash...');
		usersArr = db.users.find({cid: {$exists: true}}, {_id: 1, cid: 1}).sort({cid: -1}).toArray();
		i = usersArr.length;
		while (i--) {
			users[usersArr[i].cid] = usersArr[i]._id;
		}
		print('Filled users hash with ' + usersArr.length + ' values');
		usersArr = null;

		print('Start to convert ' + allCount + ' docs by ' + insertBy + ' in one package');
		cursor.forEach(function (photo) {
			var i;

			allCounter++;
			userOid = users[photo.user_id];
			if (userOid === undefined) {
				noUserCounter++;
			}
			if (photo.id && (userOid !== undefined) && photo.file) {
				lng = Number(photo.long || 'Empty should be NaN');
				lat = Number(photo.lat || 'Empty should be NaN');
				okCounter++;

				newPhoto = {
					cid: photo.id,
					user: userOid,
					album: photo.album_id || undefined,
					stack: photo.stack_id || undefined,
					stack_order: photo.stack_order || undefined,

					file: photo.file,
					path: photo.file.substr(0, 3).split('').join('/') + '/' + photo.file,

					ldate: new Date((photo.date || 0) * 1000 + resultDateCorrection),
					adate: new Date((photo.date || 0) * 1000 + resultDateCorrection),
					w: photo.width,
					h: photo.height,

					dir: photo.direction || '',

					title: photo.title || '',
					year: Math.min(Math.max(Number(photo.year_from) || 2000, 1826), 2000),
					address: photo.address || undefined,
					desc: photo.description || undefined,
					source: photo.source || undefined,
					author: photo.author || undefined,

					vdcount: parseInt(photo.stats_day, 10) || 0,
					vwcount: parseInt(photo.stats_week, 10) || 0,
					vcount: parseInt(photo.stats_all, 10) || 0
				};
				if (!isNaN(lng) && !isNaN(lat)) {
					newPhoto.geo = [toPrecisionRound(lng), toPrecisionRound(lat)];
				} else {
					noGeoCounter++;
				}
				if (photo.year_to !== undefined && photo.year_to >= newPhoto.year) {
					newPhoto.year2 = photo.year_to;
				} else {
					newPhoto.year2 = newPhoto.year;
				}

				// Удаляем undefined значения
				for (i in newPhoto) {
					if (newPhoto.hasOwnProperty(i) && newPhoto[i] === undefined) {
						delete newPhoto[i];
					}
				}

				//printjson(newPhoto);
				insertArr.push(newPhoto);
			}
			if (allCounter % byNumPerPackage === 0 || allCounter >= allCount) {
				db.photos.insert(insertArr);
				print('Inserted ' + insertArr.length + '/' + okCounter + '/' + allCounter + '/' + allCount + ' in ' + (Date.now() - startTime) / 1000 + 's');
				if (db.photos.count() !== okCounter + existsOnStart) {
					//printjson(insertArr);
					throw ('Total in target not equal inserted. Inserted: ' + okCounter + ' Exists: ' + db.photos.count() + '. Some error inserting data packet. Stop imports');
				}
				insertArr = [];
			}
		});

		maxCid = db.photos.find({}, {_id: 0, cid: 1}).sort({cid: -1}).limit(1).toArray();
		maxCid = maxCid && maxCid.length > 0 && maxCid[0].cid ? maxCid[0].cid : 1;
		print('Setting next photo counter to ' + maxCid + ' + 1');
		db.counters.update({_id: 'photo'}, {$set: {next: maxCid + 1}}, {upsert: true});

		return {message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's', photosAll: db.photos.count(), photosInserted: okCounter, noUsers: noUserCounter, noGeo: noGeoCounter};
	});

	saveSystemJSFunc(function oldConvertComments(sourceCollectionName, byNumPerPackage, dropExisting) {
		sourceCollectionName = sourceCollectionName || 'old_comments';
		byNumPerPackage = byNumPerPackage || 5000;

		var commentIncomingProcess = (function () {
			function linkifyUrlString(inputText, target, className) {
				var replacedText, replacePattern1, replacePattern2;

				target = target ? ' target="' + target + '"' : '';
				className = className ? ' class="' + className + '"' : '';
				print(className);
				//URLs starting with http://, https://, or ftp://
				replacePattern1 = /(\b(https?|ftp):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gim;
				replacedText = inputText.replace(replacePattern1, '<a href="$1"' + target + className + '>$1</a>');

				//URLs starting with "www." (without // before it, or it'd re-link the ones done above).
				replacePattern2 = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
				replacedText = replacedText.replace(replacePattern2, '$1<a href="http://$2"' + target + className + '>$2</a>');

				return replacedText;
			}

			return function (txt) {
				var result = String(txt);

				result = result.trim(); //Обрезаем концы

				//www.oldmos.ru/photo/view/22382 ->> <a target="_blank" href="/p/22382">#22382</a>
				result = result.replace(/[\s\,\.]?(?:http\:\/\/)?(?:www\.)?oldmos\.ru\/photo\/view\/(\d{1,8})/gim, ' <a target="_blank" class="sharpPhoto" href="/p/$1">#$1</a>');

				result = linkifyUrlString(result, '_blank'); //Оборачиваем url в ahref
				result = result.replace(/\n{3,}/g, '<br><br>').replace(/\n/g, '<br>'); //Заменяем переносы на <br>
				result = result.replace(/\s+/g, ' '); //Очищаем лишние пробелы
				return result;
			};
		}());

		if (dropExisting) {
			print('Clearing target collection...');
			db.comments.remove();
		}

		print('Ensuring old index...');
		db[sourceCollectionName].ensureIndex({date: 1});

		var startTime = Date.now(),

		//В старой базе время хранилось в московской зоне (-4), поэтому надо скорректировать её на зону сервера
			importedTimezoneOffset = -4,
			serverTimezoneOffset = (new Date()).getTimezoneOffset() / 60,
			resultDateCorrection = (importedTimezoneOffset - serverTimezoneOffset) * 60 * 60 * 1000,

			insertBy = byNumPerPackage, // Вставляем по N документов
			insertArr = [],
			newComment,
			existsOnStart = db.comments.count(),
			maxCid,
			okCounter = 0,
			fragCounter = 0,
			fragCounterError = 0,
			flattenedCounter = 0,
			noUserCounter = 0,
			noPhotoCounter = 0,
			noParentCounter = 0,
			allCounter = 0,
			allCount = db[sourceCollectionName].count(),
			cursor = db[sourceCollectionName].find({}, {_id: 0}).sort({date: 1}),
			usersArr,
			users = {},
			userOid,
			photos = {},
			photoOid,
			photosFragment = {},
			fragmentArr,
			i,

			commentsRelationsHash = {},
			relationFlattenLevel = 9,
			relationParent,
			relation,
			relationParentBroken;

		print('Filling users hash...');
		usersArr = db.users.find({cid: {$exists: true}}, {_id: 1, cid: 1}).sort({cid: -1}).toArray();
		i = usersArr.length;
		while (i--) {
			users[usersArr[i].cid] = usersArr[i]._id;
		}
		print('Filled users hash with ' + usersArr.length + ' values');
		usersArr = null;

		print('Start to convert ' + allCount + ' docs by ' + insertBy + ' in one package');
		cursor.forEach(function (comment) {

			allCounter++;
			userOid = users[comment.user_id];
			if (userOid === undefined) {
				noUserCounter++;
			}
			if (comment.id && (userOid !== undefined) && (typeof comment.photo_id === 'number' && comment.photo_id > 0) && comment.date) {

				photoOid = photos[comment.photo_id];
				if (photoOid === undefined) {
					photoOid = db.photos.findOne({cid: comment.photo_id}, {_id: 1});
					if (photoOid && (photoOid._id !== undefined)) {
						photoOid = photoOid._id;
						photos[comment.photo_id] = photoOid;
					}
				}

				if (photoOid) {
					relation = {level: 0, parent: 0};
					relationParent = undefined;
					relationParentBroken = false;
					if (typeof comment.sub === 'number' && comment.sub > 0) {
						relationParent = commentsRelationsHash[comment.sub];
						if (relationParent !== undefined) {
							if (relationParent.level > relationFlattenLevel) {
								print('ERROR WITH RELATIONS FLATTEN LEVEL');
							} else if (relationParent.level === relationFlattenLevel) {
								//print('FLATTENED ' + comment.photo_id + ': ' + newComment.cid);
								relation = relationParent;
								flattenedCounter++;
							} else {
								relation.parent = comment.sub;
								relation.level = relationParent.level + 1;
							}
						} else {
							relationParentBroken = true;
							noParentCounter++;
							//print('!NON PARENT! ' + comment.photo_id + ': ' + newComment.cid);
						}
					}

					if (!relationParentBroken) {
						okCounter++;
						newComment = {
							cid: Number(comment.id),
							obj: photoOid,
							user: userOid,
							stamp: new Date((comment.date || 0) * 1000 + resultDateCorrection),
							txt: commentIncomingProcess(comment.text)
						};
						if (comment.fragment) {
							fragmentArr = comment.fragment.split(';').map(parseFloat);
							if (fragmentArr.length === 4) {
								if (photosFragment[comment.photo_id] === undefined) {
									photosFragment[comment.photo_id] = [];
								}
								photosFragment[comment.photo_id].push({
									_id: ObjectId(),
									cid: newComment.cid,
									l: fragmentArr[0],
									t: fragmentArr[1],
									w: toPrecisionRound(fragmentArr[2] - fragmentArr[0], 2),
									h: toPrecisionRound(fragmentArr[3] - fragmentArr[1], 2)
								});
								newComment.frag = true;
								fragCounter++;
							} else {
								fragCounterError++;
							}
						}
						if (relation.level > 0) {
							newComment.parent = relation.parent;
							newComment.level = relation.level;
						}
						commentsRelationsHash[newComment.cid] = relation;
						insertArr.push(newComment);
					}
				} else {
					noPhotoCounter++;
				}
			}
			if (allCounter % byNumPerPackage === 0 || allCounter >= allCount) {
				db.comments.insert(insertArr);
				print('Inserted ' + insertArr.length + '/' + okCounter + '/' + allCounter + '/' + allCount + ' in ' + (Date.now() - startTime) / 1000 + 's');
				if (db.comments.count() !== okCounter + existsOnStart) {
					printjson(insertArr[0]);
					print('<...>');
					printjson(insertArr[insertArr.length - 1]);
					throw ('Total in target not equal inserted. Inserted: ' + okCounter + ' Exists: ' + db.comments.count() + '. Some error inserting data packet. Stop imports');
				}
				insertArr = [];
			}
		});


		for (i in photosFragment) {
			if (photosFragment[i] !== undefined) {
				db.photos.update({cid: Number(i)}, {$set: {frags: photosFragment[i]}}, {upsert: false});
			}
		}
		print('Inserted ' + fragCounter + ' fragments to ' + Object.keys(photosFragment).length + ' photos');

		maxCid = db.comments.find({}, {_id: 0, cid: 1}).sort({cid: -1}).limit(1).toArray();
		maxCid = maxCid && maxCid.length > 0 && maxCid[0].cid ? maxCid[0].cid : 1;
		print('Setting next comment counter to ' + maxCid + ' + 1');
		db.counters.update({_id: 'comment'}, {$set: {next: maxCid + 1}}, {upsert: true});

		return {message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's', commentsAllNow: db.comments.count(), commentsInserted: okCounter, withFragment: fragCounter, fragErrors: fragCounterError, flattened: flattenedCounter, noUsers: noUserCounter, noPhoto: noPhotoCounter, noParent: noParentCounter};
	});


	saveSystemJSFunc(function oldConvertNews(sourceCollectionName, byNumPerPackage, dropExisting) {
		sourceCollectionName = sourceCollectionName || 'old_news';
		byNumPerPackage = byNumPerPackage || 10;

		if (dropExisting) {
			print('Clearing target collection...');
			db.news.remove();
		}

		print('Ensuring old index...');
		db[sourceCollectionName].ensureIndex({date: 1});

		var startTime = Date.now(),

		//В старой базе время хранилось в московской зоне (-4), поэтому надо скорректировать её на зону сервера
			importedTimezoneOffset = -4,
			serverTimezoneOffset = (new Date()).getTimezoneOffset() / 60,
			resultDateCorrection = (importedTimezoneOffset - serverTimezoneOffset) * 60 * 60 * 1000,

			insertBy = byNumPerPackage, // Вставляем по N документов
			insertArr = [],
			newNovel,
			existsOnStart = db.news.count(),
			maxCid,
			okCounter = 0,
			noUserCounter = 0,
			allCounter = 0,
			allCount = db[sourceCollectionName].count(),
			cursor = db[sourceCollectionName].find({}, {_id: 0}).sort({date: 1}),
			usersArr,
			users = {},
			userOid,
			i;

		print('Filling users hash...');
		usersArr = db.users.find({cid: {$exists: true}}, {_id: 1, cid: 1}).sort({cid: -1}).toArray();
		i = usersArr.length;
		while (i--) {
			users[usersArr[i].cid] = usersArr[i]._id;
		}
		print('Filled users hash with ' + usersArr.length + ' values');
		usersArr = null;

		print('Start to convert ' + allCount + ' docs by ' + insertBy + ' in one package');
		cursor.forEach(function (novel) {

			allCounter++;
			userOid = users[novel.user_id];
			if (userOid === undefined) {
				noUserCounter++;
			}
			if (novel.id && (userOid !== undefined) && novel.date) {
				okCounter++;
				newNovel = {
					cid: novel.id,
					user: userOid,
					cdate: new Date((novel.date || 0) * 1000 + resultDateCorrection),
					pdate: new Date((novel.date || 0) * 1000 + resultDateCorrection),
					tdate: new Date(((novel.date || 0) + 3 * 24 * 60 * 60) * 1000 + resultDateCorrection),
					title: novel.title,
					txt: novel.text || novel.pre_text
				};
				if (novel.text && (novel.text !== novel.pre_text)) {
					newNovel.notice = novel.pre_text;
				}
				insertArr.push(newNovel);
			}
			if (allCounter % byNumPerPackage === 0 || allCounter >= allCount) {
				db.news.insert(insertArr);
				print('Inserted ' + insertArr.length + '/' + okCounter + '/' + allCounter + '/' + allCount + ' in ' + (Date.now() - startTime) / 1000 + 's');
				if (db.news.count() !== okCounter + existsOnStart) {
					printjson(insertArr[0]);
					print('<...>');
					printjson(insertArr[insertArr.length - 1]);
					throw ('Total in target not equal inserted. Inserted: ' + okCounter + ' Exists: ' + db.news.count() + '. Some error inserting data packet. Stop imports');
				}
				insertArr = [];
			}
		});

		maxCid = db.news.find({}, {_id: 0, cid: 1}).sort({cid: -1}).limit(1).toArray();
		maxCid = maxCid && maxCid.length > 0 && maxCid[0].cid ? maxCid[0].cid : 1;
		print('Setting next news counter to ' + maxCid + ' + 1');
		db.counters.update({_id: 'news'}, {$set: {next: maxCid + 1}}, {upsert: true});

		return {message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's', newsInserted: okCounter, noUsers: noUserCounter};
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
