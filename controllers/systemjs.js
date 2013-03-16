'use strict';

var step = require('step'),
	log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	saveSystemJSFunc(function clusterPhoto(cid, geoPhotoNew) {
		if (!cid || !geoPhotoNew || geoPhotoNew.length !== 2) {
			return {message: 'Bad params to set photo cluster', error: true};
		}

		var clusters = db.clusterparams.find({sgeo: {$exists: false}}, {_id: 0}).sort({z: 1}).toArray(),
			photos = db.photos.find({'cid': cid}, {geo: 1, file: 1}).toArray();

		photos.forEach(function (photo, index, arr) {
			var geoPhoto = photo.geo, // Текущие координаты фото
			// Коррекция для кластера.
			// Так как кластеры высчитываются бинарным округлением (>>), то для отрицательного lng надо отнять единицу.
			// Так как отображение кластера идет от верхнего угла, то для положительного lat надо прибавить единицу
				geoPhotoCorrection = [geoPhoto[0] < 0 ? -1 : 0, geoPhoto[1] > 0 ? 1 : 0], // Корекция для кластера текущих координат
				geoPhotoNewCorrection = [geoPhotoNew[0] < 0 ? -1 : 0, geoPhotoNew[1] > 0 ? 1 : 0], // Корекция для кластера новых координат
				cluster,
				c,
				geo,
				geoNew,
				gravity,
				gravityNew;

			clusters.forEach(function (item) {

				geo = geoToPrecisionRound([item.w * ((geoPhoto[0] / item.w >> 0) + geoPhotoCorrection[0]), item.h * ((geoPhoto[1] / item.h >> 0) + geoPhotoCorrection[1])]);
				geoNew = geoToPrecisionRound([item.w * ((geoPhotoNew[0] / item.w >> 0) + geoPhotoNewCorrection[0]), item.h * ((geoPhotoNew[1] / item.h >> 0) + geoPhotoNewCorrection[1])]);
				cluster = db.clusters.findOne({p: photo._id, z: item.z, geo: geo}, {_id: 0, c: 1, gravity: 1, file: 1, p: {$slice: -2}});

				if (!cluster || (cluster && (geo[0] !== geoNew[0] || geo[1] !== geoNew[1]))) {
					item.wHalf = toPrecisionRound(item.w / 2);
					item.hHalf = toPrecisionRound(item.h / 2);

					// Если фотография в старых координатах уже лежит в кластере, удаляем фото из него
					if (cluster) {
						c = cluster.c || 0;
						gravity = cluster.gravity || [geo[0] + item.wHalf, geo[1] - item.hHalf];
						gravityNew = geoToPrecisionRound([(gravity[0] * (c + 1) - geoPhoto[0]) / c, (gravity[1] * (c + 1) - geoPhoto[1]) / c]);

						if (c > 1) {
							// Если после удаления фото из кластера, в этом кластере еще остаются другие фото, берем у одного из них file
							var photoFile,
								$set = {gravity: gravityNew},
								$unset = {};

							if (cluster.p && cluster.p.length > 0) {
								photoFile = db.photos.find({_id: {$in: cluster.p}}, {_id: 0, file: 1}) || undefined;
								if (photoFile[0] && photoFile[0].file && photoFile[0].file !== cluster.file) {
									photoFile = photoFile[0].file;
								} else if (photoFile[1] && photoFile[1].file && photoFile[1].file !== cluster.file) {
									photoFile = photoFile[1].file;
								}
							}

							if (photoFile) {
								$set.file = photoFile;
							} else {
								$unset.file = true;
							}

							db.clusters.update({z: item.z, geo: geo}, { $inc: {c: -1}, $pull: { p: photo._id }, $set: $set, $unset: $unset }, {multi: false, upsert: false});

						} else {
							// Если после удаления фото из кластера, кластер становится пустым - удаляем его
							db.clusters.remove({z: item.z, geo: geo});
						}
					}

					// Вставляем фото в новый кластер
					cluster = db.clusters.findOne({z: item.z, geo: geoNew}, {_id: 0, c: 1, gravity: 1});
					c = (cluster && cluster.c) || 0;
					gravity = (cluster && cluster.gravity) || [geoNew[0] + item.wHalf, geoNew[1] - item.hHalf];
					gravityNew = geoToPrecisionRound([(gravity[0] * (c + 1) + geoPhotoNew[0]) / (c + 2), (gravity[1] * (c + 1) + geoPhotoNew[1]) / (c + 2)]);

					db.clusters.update({z: item.z, geo: geoNew}, { $inc: {c: 1}, $push: { p: photo._id }, $set: {gravity: gravityNew, file: photo.file} }, {multi: false, upsert: true});
				}
			});
			return {message: 'Ok', error: false};
		});
	});

	saveSystemJSFunc(function clusterAll() {
		var startTime = Date.now(),
			controlBy = 1000,
			clusters = db.clusterparams.find({sgeo: {$exists: false}}, {_id: 0}).sort({z: 1}).toArray(),
			photoCounter = 0,
			photoCursor = db.photos.find({geo: {$exists: true}}, {geo: 1, file: 1}),
			photosAllCount = photoCursor.count();

		db.clusters.remove();

		print('Start to clusterize ' + photosAllCount + ' photos');

		// forEach в данном случае - это честный while по курсору: function (func) {while (this.hasNext()) {func(this.next());}}
		photoCursor.forEach(function (photo) {
			var geoPhoto = photo.geo,
				geoPhotoCorrection = [geoPhoto[0] < 0 ? -1 : 0, geoPhoto[1] > 0 ? 1 : 0],
				geo,
				cluster,
				c,
				gravity,
				gravityNew;

			photoCounter++;

			clusters.forEach(function (item) {
				item.wHalf = toPrecisionRound(item.w / 2);
				item.hHalf = toPrecisionRound(item.h / 2);

				geo = geoToPrecisionRound([item.w * ((geoPhoto[0] / item.w >> 0) + geoPhotoCorrection[0]), item.h * ((geoPhoto[1] / item.h >> 0) + geoPhotoCorrection[1])]);
				cluster = db.clusters.findOne({geo: geo, z: item.z}, {_id: 0, c: 1, gravity: 1});
				c = (cluster && cluster.c) || 0;
				gravity = (cluster && cluster.gravity) || [geo[0] + item.wHalf, geo[1] - item.hHalf];
				gravityNew = geoToPrecisionRound([(gravity[0] * (c + 1) + geoPhoto[0]) / (c + 2), (gravity[1] * (c + 1) + geoPhoto[1]) / (c + 2)]);

				db.clusters.update({geo: geo, z: item.z}, { $inc: {c: 1}, $push: { p: photo._id }, $set: {gravity: gravityNew, file: photo.file} }, {multi: false, upsert: true});
			});

			if (photoCounter % controlBy === 0) {
				print('Clusterized allready ' + photoCounter + '/' + photosAllCount + ' photos in ' + db.clusters.count() + ' clusters in ' + (Date.now() - startTime) / 1000 + 's');
			}
		});

		return {message: 'Ok in ' + (Date.now() - startTime) / 1000 + 's', photos: photoCounter, clusters: db.clusters.count()};
	});

	saveSystemJSFunc(function clusterAll2(logByNPhotos, withGravity) {
		var startFullTime = Date.now(),
			startTime,

			clusterZoom,
			clusterZooms = db.clusterparams.find({sgeo: {$exists: false}}, {_id: 0}).sort({z: 1}).toArray(),
			clusterZoomsCounter = -1,

			photo,
			photos = db.photos.find({geo: {$exists: true}}, {_id: 1, geo: 1, file: 1}).toArray(),
			photoCounter = 0,
			photosAllCount = photos.length,
			geoPhoto,
			geoPhotoCorrection,

			geo,
			gravity,
			cluster,
			clusters,
			clustCoordId,
			clustCoordIdS,
			custersCounter,
			clustersResultArr;

		logByNPhotos = logByNPhotos || ((photos.length / 20) >> 0);
		print('Start to clusterize ' + photosAllCount + ' photos with log for every ' + logByNPhotos + '. Gravity: ' + withGravity);

		while (++clusterZoomsCounter < clusterZooms.length) {
			clusterZoom = clusterZooms[clusterZoomsCounter];
			clusterZoom.wHalf = toPrecisionRound(clusterZoom.w / 2);
			clusterZoom.hHalf = toPrecisionRound(clusterZoom.h / 2);

			clusters = {};
			clustCoordIdS = [];

			startTime = Date.now();

			photoCounter = -1;
			while (++photoCounter < photosAllCount) {
				photo = photos[photoCounter];
				geoPhoto = photo.geo;
				geoPhotoCorrection = [geoPhoto[0] < 0 ? -1 : 0, geoPhoto[1] > 0 ? 1 : 0];

				geo = geoToPrecisionRound([clusterZoom.w * ((geoPhoto[0] / clusterZoom.w >> 0) + geoPhotoCorrection[0]), clusterZoom.h * ((geoPhoto[1] / clusterZoom.h >> 0) + geoPhotoCorrection[1])]);
				clustCoordId = geo[0] + '@' + geo[1];
				if (clusters[clustCoordId] === undefined) {
					clusters[clustCoordId] = {geo: geo, lngs: geo[0] + clusterZoom.wHalf, lats: geo[1] - clusterZoom.hHalf, c: 1, p: []};
					clustCoordIdS.push(clustCoordId);
				}
				cluster = clusters[clustCoordId];
				cluster.c += 1;
				if (withGravity) {
					cluster.lngs += photo.geo[0];
					cluster.lats += photo.geo[1];
				}
				cluster.file = photo.file;
				cluster.p.push(photo._id);

				if (photoCounter % logByNPhotos === 0) {
					print(clusterZoom.z + ': Clusterized allready ' + photoCounter + '/' + photosAllCount + ' photos in ' + clustCoordIdS.length + ' clusters in ' + (Date.now() - startTime) / 1000 + 's');
				}
			}

			print(clusterZoom.z + ': Final calc fo clusters before insert. ' + (Date.now() - startTime) / 1000 + 's');
			clustersResultArr = [];
			custersCounter = clustCoordIdS.length;
			while (custersCounter) {
				cluster = clusters[clustCoordIdS[--custersCounter]];
				if (withGravity) {
					gravity = [
						//Math.min(Math.max(cluster.geo[0] + (clusterZoom.wHalf / 2), toPrecisionRound(cluster.lngs / cluster.c)), cluster.geo[0] + clusterZoom.wHalf + (clusterZoom.wHalf / 2)),
						//Math.min(Math.max(cluster.geo[1] - (clusterZoom.hHalf / 2), toPrecisionRound(cluster.lats / cluster.c)), cluster.geo[1] - clusterZoom.hHalf - (clusterZoom.hHalf / 2))
						toPrecisionRound(cluster.lngs / cluster.c),
						toPrecisionRound(cluster.lats / cluster.c)
					];
				} else {
					gravity = [cluster.lngs, cluster.lats];
				}
				clustersResultArr.push({
					geo: cluster.geo,
					z: clusterZoom.z,
					c: cluster.c - 1,
					gravity: gravity,
					file: cluster.file,
					p: cluster.p
				});
			}

			db.clusters.remove({z: clusterZoom.z});
			print(clusterZoom.z + ': Inserting ' + clustersResultArr.length + ' clusters. ' + (Date.now() - startTime) / 1000 + 's');
			db.clusters.insert(clustersResultArr);
			print(clusterZoom.z + ': Inserted ok. ' + (Date.now() - startTime) / 1000 + 's');
			print('~~~~~~~~~~~~~~~~~~~~~~~~~');
		}

		return {message: 'Ok in ' + (Date.now() - startFullTime) / 1000 + 's', photos: photoCounter, clusters: db.clusters.count()};
	});

	saveSystemJSFunc(function convertPhotosAll(variants) {
		var startTime = Date.now(),
			addDate = new Date(),
			conveyer = [],
			photos = db.photos.find({}, {_id: 0, file: 1}).sort({loaded: 1}).toArray(),
			photoCounter = photos.length,
			photosAllCount = photos.length;

		print('Start to fill new conveyer for ' + photosAllCount + ' photos');

		while (photoCounter) {
			conveyer.push(
				{
					file: photos[--photoCounter].file,
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
			pcount,
		//bcount,
			ccount;

		print('Start to calc for ' + userCounter + ' users');
		while (userCounter--) {
			user = users[userCounter];
			pcount = db.photos.count({user: user._id});
			ccount = db.comments.count({user: user._id});
			db.users.update({_id: user._id}, {$set: {pcount: pcount, ccount: ccount}}, {upsert: false});
		}

		return {message: 'User statistics were calculated in ' + (Date.now() - startTime) / 1000 + 's'};
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

					file: photo.file || '',
					loaded: new Date((photo.date || 0) * 1000),
					w: photo.width,
					h: photo.height,

					dir: photo.direction || undefined,

					title: photo.title || undefined,
					year: photo.year_from || 1900,
					year2: Math.min(photo.year_from || 1900, photo.year_to || 1900),
					address: photo.address || undefined,
					desc: photo.description || undefined,
					source: photo.source || undefined,
					author: photo.author || undefined,

					stats_day: parseInt(photo.stats_day, 10) || 0,
					stats_week: parseInt(photo.stats_week, 10) || 0,
					stats_all: parseInt(photo.stats_all, 10) || 0
				};
				if (!isNaN(lng) && !isNaN(lat)) {
					newPhoto.geo = [toPrecisionRound(lng), toPrecisionRound(lat)];
				} else {
					noGeoCounter++;
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
					printjson(insertArr);
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
		byNumPerPackage = byNumPerPackage || 1000;

		if (dropExisting) {
			print('Clearing target collection...');
			db.comments.remove();
		}

		var startTime = Date.now(),
			insertBy = byNumPerPackage, // Вставляем по N документов
			insertArr = [],
			newComment,
			existsOnStart = db.comments.count(),
			maxCid,
			okCounter = 0,
			fragCounter = 0,
			noUserCounter = 0,
			noPhotoCounter = 0,
			allCounter = 0,
			allCount = db[sourceCollectionName].count(),
			cursor = db[sourceCollectionName].find({}, {_id: 0}),//.sort({photo_id: 1, id: 1}),
			usersArr,
			users = {},
			userOid,
			photos = {},
			photoOid,
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
		cursor.forEach(function (comment) {

			allCounter++;
			userOid = users[comment.user_id];
			if (userOid === undefined) {
				noUserCounter++;
			}
			if (comment.id && (userOid !== undefined) && comment.photo_id && comment.date) {

				photoOid = photos[comment.photo_id];
				if (photoOid === undefined) {
					photoOid = db.photos.findOne({cid: comment.photo_id}, {_id: 1});
					if (photoOid && (photoOid._id !== undefined)) {
						photoOid = photoOid._id;
						photos[comment.photo_id] = photoOid;
					}
				}

				if (photoOid) {
					okCounter++;
					newComment = {
						cid: comment.id,
						photo: photoOid,
						user: userOid,
						stamp: new Date((comment.date || 0) * 1000),
						txt: comment.text
					};
					if (comment.sub) {
						newComment.parent = comment.fragment;
					}
					if (comment.fragment) {
						newComment.frag = comment.fragment;
						fragCounter++;
					}
					//printjson(newComment);
					insertArr.push(newComment);
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

		maxCid = db.comments.find({}, {_id: 0, cid: 1}).sort({cid: -1}).limit(1).toArray();
		maxCid = maxCid && maxCid.length > 0 && maxCid[0].cid ? maxCid[0].cid : 1;
		print('Setting next comment counter to ' + maxCid + ' + 1');
		db.counters.update({_id: 'comment'}, {$set: {next: maxCid + 1}}, {upsert: true});

		return {message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's', commentsAllNow: db.comments.count(), commentsInserted: okCounter, withFragment: fragCounter, noUsers: noUserCounter, noPhoto: noPhotoCounter};
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
