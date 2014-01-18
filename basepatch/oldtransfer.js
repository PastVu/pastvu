/*global, print: true, printjson: true*/
'use strict';

var log4js = require('log4js'),
	mongoose = require('mongoose'),
	logger;

module.exports.loadController = function (app, db) {
	logger = log4js.getLogger("systemjs.js");

	/**
	 * Функции импорта конвертации старой базы олдмос
	 */
	saveSystemJSFunc(function oldConvertUsers(sourceCollectionName, spbMode, byNumPerPackage, dropExisting) {
		sourceCollectionName = sourceCollectionName || 'users';
		byNumPerPackage = byNumPerPackage || 1000;

		if (dropExisting) {
			print('Clearing target collection...');
			db.users.remove({login: {$nin: ['init', 'neo']}});
		}

		var db_old = db.getSiblingDB('old'),
			startTime = Date.now(),
			insertBy = byNumPerPackage, // Вставляем по N документов
			insertArr = [],
			newUser,
			existsOnStart = db.users.count(),
			cidShift = 0,
			maxCid,
			okCounter = 0,
			noactiveCounter = 0,
			allCounter = 0,
			allCount = db_old[sourceCollectionName].count(),
			cursor = db_old[sourceCollectionName].find({}, {_id: 0}).sort({id: 1}),

		//Размазываем даты регистрации пользователей по периоду с 1 марта 2009 до текущей даты
			expectingUsersCount = db_old[sourceCollectionName].count({activated: 'yes'}),
			firstUserStamp = (spbMode ? new Date("Sat, 1 Aug 2009 12:00:00 GMT") : new Date("Sun, 1 Mar 2009 12:00:00 GMT")).getTime(),
			stepUserStamp = (startTime - firstUserStamp) / expectingUsersCount >> 0,

			usersArr,
			usersLogin = {},
			usersEmail = {},
			userValid,
			userMergeCounter = 0,
			userLoginChangedCounter = 0,
			usersSpbMapping,
			i;

		if (spbMode) {
			db.usersSpbMap.drop();
			cidShift = db.counters.findOne({_id: 'user'}).next;
			usersSpbMapping = [];
			print('Filling users hash...');
			usersArr = db.users.find({}, {_id: 1, login: 1, email: 1}).sort({cid: -1}).toArray();
			i = usersArr.length;
			while (i--) {
				usersEmail[usersArr[i].email] = usersArr[i]._id;
				usersLogin[usersArr[i].login] = usersArr[i]._id;
			}
			print('Filled users hash with ' + usersArr.length + ' values');
			usersArr = null;
		}

		print('Start to convert ' + allCount + ' docs with cid delta ' + cidShift + ' by ' + insertBy + ' in one package');
		cursor.forEach(function (user) {
			allCounter++;
			userValid = false;

			if (user.activated !== 'yes') {
				noactiveCounter++;
			} else if (user.id && user.username && user.email) {
				if (spbMode) {
					if (usersEmail[user.email]) {
						userMergeCounter++;
						usersSpbMapping.push({cidOld: Number(user.id), id: usersEmail[user.email]});
					} else {
						if (usersLogin[user.username]) {
							user.username += 'Spb';
							userLoginChangedCounter++;
						}
						userValid = true;
					}
				} else {
					userValid = true;
				}
			}
			if (userValid) {
				okCounter++;
				newUser = {
					_id: ObjectId(),
					cid: Number(user.id) + cidShift,
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

					regdate: new Date(firstUserStamp + (okCounter - 1) * stepUserStamp),
					active: true,
					activatedate: new Date(firstUserStamp + okCounter * stepUserStamp)
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
				if (user.role_id === 2) {
					newUser.role = 5; //Администраторы становятся модераторами
					if (newUser.cid === 1 || newUser.cid === 6 || newUser.cid === 75 || newUser.cid === 6023) {
						newUser.role = 11;
					} else if (newUser.cid === 5209) {
						newUser.role = 10;
					}
				}

				//printjson(newUser);
				insertArr.push(newUser);
				if (spbMode) {
					usersSpbMapping.push({cidOld: Number(user.id), cidNew: newUser.cid, id: newUser._id});
				}
			}

			if (allCounter % byNumPerPackage === 0 || allCounter >= allCount) {
				if (insertArr.length > 0) {
					db.users.insert(insertArr);
					if (spbMode) {
						db.usersSpbMap.insert(usersSpbMapping);
						usersSpbMapping = [];
					}
				}
				print('Inserted ' + insertArr.length + '/' + okCounter + '/' + allCounter + '/' + allCount + ' in ' + (Date.now() - startTime) / 1000 + 's');
				if (db.users.count() !== (okCounter + existsOnStart)) {
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

		return {message: 'FINISH in total ' + (Date.now() - startTime) / 1000 + 's', usersAllNow: db.users.count(), usersInserted: okCounter, noActive: noactiveCounter, merged: userMergeCounter, loginChanged: userLoginChangedCounter};
	});

	saveSystemJSFunc(function oldConvertPhotos(sourceCollectionName, spbMode, spbPhotoShift, byNumPerPackage, dropExisting) {
		sourceCollectionName = sourceCollectionName || 'photos';
		byNumPerPackage = byNumPerPackage || 2000;

		if (dropExisting) {
			print('Clearing target collection...');
			db.photos.remove();
		}

		var startTime = Date.now(),
			db_old = db.getSiblingDB('old'),
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
			cidShift = 0,
			okCounter = 0,
			allCounter = 0,
			allCount = db_old[sourceCollectionName].count(),
			cursor = db_old[sourceCollectionName].find({}, {_id: 0}),//.sort({id: 1}),
			usersArr,
			users = {},
			userOid,
			photosSpbMapping,
			i;

		if (spbMode) {
			db.photosSpbMap.drop();
			cidShift = db.counters.findOne({_id: 'photo'}).next;
			photosSpbMapping = [];
			usersArr = db.usersSpbMap.find({}, {_id: 0, id: 1, cidOld: 1}).toArray();
			for (i = usersArr.length; i--;) {
				users[usersArr[i].cidOld] = usersArr[i].id;
			}
		} else {
			usersArr = db.users.find({cid: {$exists: true}}, {_id: 1, cid: 1}).sort({cid: -1}).toArray();
			for (i = usersArr.length; i--;) {
				users[usersArr[i].cid] = usersArr[i]._id;
			}
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
					_id: ObjectId(),
					cid: Number(photo.id) + cidShift,
					user: userOid,
					album: photo.album_id || undefined,
					stack: photo.stack_id || undefined,
					stack_order: photo.stack_order || undefined,

					file: photo.file.replace(/((.)(.)(.))/, "$2/$3/$4/$1"),
					ldate: new Date((photo.date || 0) * 1000 + resultDateCorrection),
					adate: new Date((photo.date || 0) * 1000 + resultDateCorrection),
					w: photo.width,
					h: photo.height,

					dir: photo.direction || '',

					title: photo.title || '',
					year: Math.min(Math.max(Number(photo.year_from) || 2000, 1826), 2000),
					address: photo.address || undefined,
					desc: photo.description && typeof photo.description === 'string' ? inputIncomingParse(photo.description, spbPhotoShift) : undefined,
					source: photo.source && typeof photo.source === 'string' ? inputIncomingParse(photo.source) : undefined,
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
				if (spbMode) {
					photosSpbMapping.push({cidOld: Number(photo.id), cidNew: newPhoto.cid, id: newPhoto._id});
				}
			}
			if (allCounter % byNumPerPackage === 0 || allCounter >= allCount) {
				if (insertArr.length > 0) {
					db.photos.insert(insertArr);
				}
				if (spbMode) {
					db.photosSpbMap.insert(photosSpbMapping);
					photosSpbMapping = [];
				}
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

	saveSystemJSFunc(function oldConvertComments(sourceCollectionName, spbMode, spbPhotoShift, byNumPerPackage, dropExisting) {
		sourceCollectionName = sourceCollectionName || 'comments';
		byNumPerPackage = byNumPerPackage || 5000;

		if (dropExisting) {
			print('Clearing target collection...');
			db.comments.remove();
		}

		print('Ensuring old index...');
		var db_old = db.getSiblingDB('old');
		db_old[sourceCollectionName].ensureIndex({date: 1});

		var startTime = Date.now(),

			importedTimezoneOffset = -4, //В старой базе время хранилось в московской зоне (-4), поэтому надо скорректировать её на зону сервера
			serverTimezoneOffset = (new Date()).getTimezoneOffset() / 60,
			resultDateCorrection = (importedTimezoneOffset - serverTimezoneOffset) * 60 * 60 * 1000,

			insertBy = byNumPerPackage, // Вставляем по N документов
			insertArr = [],
			newComment,
			existsOnStart = db.comments.count(),
			maxCid,
			cidShift = 0,
			okCounter = 0,
			fragCounter = 0,
			fragCounterError = 0,
			flattenedCounter = 0,
			noUserCounter = 0,
			noPhotoCounter = 0,
			noParentCounter = 0,
			allCounter = 0,
			allCount = db_old[sourceCollectionName].count(),
			cursor = db_old[sourceCollectionName].find({}, {_id: 0}).sort({date: 1}),
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

		if (spbMode) {
			db.photosSpbMap.ensureIndex({cidOld: 1});
			cidShift = db.counters.findOne({_id: 'comment'}).next;
			usersArr = db.usersSpbMap.find({}, {_id: 0, id: 1, cidOld: 1}).toArray();
			for (i = usersArr.length; i--;) {
				users[usersArr[i].cidOld] = usersArr[i].id;
			}
		} else {
			usersArr = db.users.find({cid: {$exists: true}}, {_id: 1, cid: 1}).sort({cid: -1}).toArray();
			for (i = usersArr.length; i--;) {
				users[usersArr[i].cid] = usersArr[i]._id;
			}
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
					if (spbMode) {
						photoOid = db.photosSpbMap.findOne({cidOld: comment.photo_id}, {_id: 0, id: 1});
						photoOid = photoOid && photoOid.id;
					} else {
						photoOid = db.photos.findOne({cid: comment.photo_id}, {_id: 1});
						photoOid = photoOid && photoOid._id;
					}
					if (photoOid) {
						photos[comment.photo_id] = photoOid;
					}
				}

				if (photoOid) {
					relation = {level: 0, parent: 0};
					relationParent = undefined;
					relationParentBroken = false;
					if (typeof comment.sub === 'number' && comment.sub > 0) {
						relationParent = commentsRelationsHash[comment.sub + cidShift];
						if (relationParent !== undefined) {
							if (relationParent.level > relationFlattenLevel) {
								print('ERROR WITH RELATIONS FLATTEN LEVEL');
							} else if (relationParent.level === relationFlattenLevel) {
								//print('FLATTENED ' + comment.photo_id + ': ' + newComment.cid);
								relation = relationParent;
								flattenedCounter++;
							} else {
								relation.parent = comment.sub + cidShift;
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
							cid: Number(comment.id) + cidShift,
							obj: photoOid,
							user: userOid,
							stamp: new Date((comment.date || 0) * 1000 + resultDateCorrection),
							txt: inputIncomingParse(comment.text, spbPhotoShift)
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
				if (insertArr.length > 0) {
					db.comments.insert(insertArr);
				}
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
				db.photos.update({_id: photos[Number(i)]}, {$set: {frags: photosFragment[i]}}, {upsert: false});
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
		sourceCollectionName = sourceCollectionName || 'news';
		byNumPerPackage = byNumPerPackage || 10;

		if (dropExisting) {
			print('Clearing target collection...');
			db.news.remove();
		}

		var startTime = Date.now(),
			db_old = db.getSiblingDB('old'),


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
			allCount = db_old[sourceCollectionName].count(),
			cursor = db_old[sourceCollectionName].find({}, {_id: 0}).sort({date: 1}),
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
				if (insertArr.length > 0) {
					db.news.insert(insertArr);
				}
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

	saveSystemJSFunc(function oldConvertAll() {
		var start = Date.now(),
			spbPhotoShift;
		print('Removing exists data..');
		db.users.remove();
		db.photos.remove();
		db.comments.remove();
		db.news.remove();

		print('~~~~~~~');
		print('oldConvertUsers()');
		printjson(oldConvertUsers());
		print('~~~~~~~');
		print('oldConvertPhotos()');
		printjson(oldConvertPhotos());
		print('~~~~~~~');
		print('oldConvertComments()');
		printjson(oldConvertComments());
		print('~~~~~~~');
		print('oldConvertNews()');
		printjson(oldConvertNews());
		print('~~~~~~~');
		spbPhotoShift = db.counters.findOne({_id: 'photo'}).next;
		print("oldConvertUsers('usersSpb', true)");
		printjson(oldConvertUsers('usersSpb', true));
		print('~~~~~~~');
		print("oldConvertPhotos('photosSpb', true, " + spbPhotoShift + ")");
		printjson(oldConvertPhotos('photosSpb', true, spbPhotoShift));
		print('~~~~~~~');
		print("oldConvertComments('commentsSpb', true, " + spbPhotoShift + ")");
		printjson(oldConvertComments('commentsSpb', true, spbPhotoShift));
		print('~~~~~~~');
		print('fillPhotosSort()');
		printjson(fillPhotosSort());
		print('~~~~~~~');
		print('calcUserStats()');
		printjson(calcUserStats());
		print('~~~~~~~');
		print('calcPhotoStats()');
		printjson(calcPhotoStats());

		print('~~~~~~~');
		db.usersSpbMap.drop();
		db.photosSpbMap.drop();
		print('SPB photo shift: ' + spbPhotoShift);
		print('OK, FINISH in ' + ((Date.now() - start) / 1000) + 's');
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
