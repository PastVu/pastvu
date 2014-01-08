/*global define:true*/

/**
 * Модель региона
 */
define([
	'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'leaflet', 'model/storage',
	'text!tpl/admin/region.jade', 'css!style/admin/region', 'css!style/leaflet'
], function (_, $, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, L, storage, jade) {
	'use strict';

	var regionDef = {
		cid: 0,
		parents: [],
		geo: '',
		pointsnum: 0,
		center: null,
		centerAuto: true,
		title_en: '',
		title_local: ''
	};

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.destroy = _.wrap(this.destroy, this.localDestroy);
			this.auth = globalVM.repository['m/common/auth'];
			this.formatNum = Utils.format.numberByThousands; //Передаем функцию форматирования числа в шаблон
			this.createMode = ko.observable(true);
			this.exe = ko.observable(true); //Указывает, что сейчас идет обработка запроса на действие к серверу

			this.showGeo = ko.observable(false);

			this.region = ko_mapping.fromJS(regionDef);
			this.haveParent = ko.observable('0');
			this.parentCid = ko.observable(0);
			this.parentCidOrigin = 0;
			this.childLenArr = ko.observableArray();
			this.geoStringOrigin = null;
			this.geoObj = null;

			this.map = null;
			this.markerLayer = L.layerGroup();
			this.layerSaved = null;

			this.mh = ko.observable('300px'); //Высота карты

			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandler, this);
			this.routeHandler();
		},
		show: function (cb, ctx) {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
			this.subscriptions.sizes = P.window.square.subscribe(this.sizesCalc, this);
			this.sizesCalc();
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		localDestroy: function (destroy) {
			this.centerMarkerDestroy();
			this.map.remove();
			delete this.map;

			this.hide();
			destroy.call(this);
		},
		makeBinding: function () {
			if (!this.binded) {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
				this.binded = true;
			}
		},
		//Пересчитывает размер карты
		sizesCalc: function () {
			var height = P.window.h() - this.$dom.find('.map').offset().top - 37 >> 0;

			this.mh(height + 'px');
			if (this.map) {
				this.map.whenReady(this.map._onResize, this.map); //Самостоятельно обновляем размеры карты
			}
		},
		routeHandler: function () {
			this.exe(true);
			var cid = globalVM.router.params().cid;

			if (cid === 'create') {
				this.createMode(true);
				this.resetData();
				if (Number(globalVM.router.params().parent)) {
					this.parentCid(Number(globalVM.router.params().parent));
					this.haveParent('1');
				}
				this.createMap();
				this.exe(false);
			} else {
				cid = Number(cid);
				if (!cid) {
					return globalVM.router.navigateToUrl('/admin/region');
				}
				this.createMode(false);
				this.getOneRegion(cid, function () {
					this.exe(false);
				}, this);
			}
		},
		resetData: function () {
			this.centerMarkerDestroy();
			if (this.layerSaved) {
				this.map.removeLayer(this.layerSaved);
			}

			this.regionOrigin = regionDef;
			ko_mapping.fromJS(regionDef, this.region);

			this.haveParent('0');
			this.parentCid(0);
			this.childLenArr([]);
		},
		fillData: function (data) {
			var region = data.region;

			this.regionOrigin = region;
			ko_mapping.fromJS(region, this.region);

			this.childLenArr(data.childLenArr || []);
			if (data.region.parents && data.region.parents.length) {
				this.parentCidOrigin = data.region.parents[data.region.parents.length - 1].cid;
				this.haveParent('1');
			} else {
				this.haveParent('0');
				this.parentCidOrigin = 0;
			}
			this.parentCid(this.parentCidOrigin);

			if (region.geo) {
				this.geoStringOrigin = region.geo;
				try {
					this.geoObj = JSON.parse(region.geo);
				} catch (err) {
					window.noty({text: 'GeoJSON client parse error!', type: 'error', layout: 'center', timeout: 3000, force: true});
					this.geoStringOrigin = null;
					this.geoObj = null;
					return false;
				}
				this.drawData();
			}

			if (region.center) {
				if (this.centerMarker) {
					this.centerMarker.setLatLng(region.center);
				} else {
					this.centerMarkerCreate();
				}
			}

			return true;
		},
		drawData: function () {
			var mapInit = !this.map;

			if (this.layerSaved) {
				this.map.removeLayer(this.layerSaved);
			}
			this.layerSaved = L.geoJson(this.geoObj, {
				style: {
					color: "#F00",
					weight: 3,
					opacity: 0.6,
					clickable: false
				}
			});

			this.createMap();
			this.map.whenReady(function () {
				if (mapInit) {
					this.layerSaved.addTo(this.map);
				} else {
					this.map.fitBounds(this.layerSaved.getBounds());
					window.setTimeout(this.layerSaved.addTo.bind(this.layerSaved, this.map), 500); //Рисуем после анимации fitBounds
				}
			}, this);
		},
		createMap: function () {
			//Bind и show должны вызываться перед созданием карты для правильно расчета её высоты
			this.makeBinding();

			if (this.map) {
				return;
			}

			this.map = new L.map(this.$dom.find('.map')[0], {center: [36, -25], zoom: 2, minZoom: 2, maxZoom: 15, trackResize: false});
			if (this.layerSaved) {
				this.map.fitBounds(this.layerSaved.getBounds());
			}

			this.map
				.addLayer(this.markerLayer)
				.on('click', function (e) {
					var geo = Utils.geo.geoToPrecision([e.latlng.lat, e.latlng.lng]);

					this.region.center(geo);

					if (this.centerMarker) {
						this.centerMarker.setLatLng(geo);
					} else {
						this.centerMarkerCreate();
					}
					this.region.centerAuto(false);
				}, this);

			L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 15}).addTo(this.map);
		},
		//Создание маркера центра региона
		centerMarkerCreate: function () {
			var _this = this;
			this.centerMarker = L.marker(this.region.center(), {draggable: true, title: 'Центр региона', icon: L.icon({iconSize: [26, 43], iconAnchor: [13, 36], iconUrl: '/img/map/pinEdit.png', className: 'centerMarker'})})
				.on('drag', function () {
					_this.region.center(Utils.geo.geoToPrecision(Utils.geo.latlngToArr(this.getLatLng())));
				})
				.on('dragend', function () {
					_this.region.centerAuto(false);
				})
				.addTo(this.markerLayer);
			return this;
		},
		//Удаление маркера центра
		centerMarkerDestroy: function () {
			if (this.centerMarker) {
				this.centerMarker.off('dragend');
				this.markerLayer.removeLayer(this.centerMarker);
				delete this.centerMarker;
			}
			return this;
		},
		//Переключаем задание центра Авто/Вручную
		centerAutoToggle: function () {
			var newCenterAuto = !this.region.centerAuto();
			this.region.centerAuto(newCenterAuto);

			if (newCenterAuto) {
				//Если ставим Авто, то возвращаем оригинальное значение центра
				this.region.center(this.regionOrigin.center || null);

				if (this.regionOrigin.center) {
					//Если есть предрасчитанный центр, то ставим маркер в него
					this.centerMarker.setLatLng(this.regionOrigin.center);
				} else {
					//Если в оригинале центр еще не расчитан (регион новый), то удаляем маркер
					this.centerMarkerDestroy();
				}
			}
		},
		//Переключаем вид домашнего положения bbox
		bboxHomeToggle: function () {
		},

		getOneRegion: function (cid, cb, ctx) {
			socket.once('takeRegion', function (data) {
				var error = !data || !!data.error || !data.region;

				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 4000, force: true});
				} else {
					error = !this.fillData(data);
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data, error);
				}
			}.bind(this));
			socket.emit('giveRegion', {cid: cid});
		},
		save: function () {
			if (this.exe()) {
				return false;
			}

			var saveData = ko_mapping.toJS(this.region),
				parentIsChanged;

			if (!saveData.geo) {
				window.noty({text: 'GeoJSON обязателен!', type: 'error', layout: 'center', timeout: 2000, force: true});
				return false;
			}
			if (saveData.geo === this.geoStringOrigin) {
				delete saveData.geo;
			}

			if (!saveData.title_en) {
				window.noty({text: 'Нужно заполнить английское название', type: 'error', layout: 'center', timeout: 2000, force: true});
				return false;
			}

			if (this.haveParent() === '1') {
				saveData.parent = Number(this.parentCid());
				if (!saveData.parent) {
					window.noty({text: 'Если уровень региона ниже Страны, необходимо указать номер родительского региона!', type: 'error', layout: 'center', timeout: 5000, force: true});
					return false;
				}
			} else {
				saveData.parent = 0;
			}

			if (!this.createMode() && saveData.parent !== this.parentCidOrigin) {
				parentIsChanged = true;
				this.changeParentWarn(function (confirm) {
					if (confirm) {
						processSave(this);
					}
				}, this);
			} else {
				processSave(this);
			}

			function processSave(ctx) {
				ctx.exe(true);
				ctx.sendSave(saveData, function (data, error) {
					var resultStat = data && data.resultStat;

					if (!error) {
						var msg = 'Регион <b>' + this.region.title_local() + '</b> успешно ' + (parentIsChanged ? 'перенесён и ' : '') + 'сохранен<br>',
							geoChangePhotosCount;

						if (resultStat && Object.keys(resultStat).length) {
							if (typeof resultStat.photosCountBeforeGeo === 'number' && typeof resultStat.photosCountAfterGeo === 'number') {
								geoChangePhotosCount = resultStat.photosCountAfterGeo - resultStat.photosCountBeforeGeo;

								if (geoChangePhotosCount) {
									msg += '<br><b>' + Math.abs(geoChangePhotosCount) + '</b> фотографий ' + (geoChangePhotosCount > 0 ? 'добавлено в регион' : 'удалено из региона') + ' вследствии изменения коордиант поолигона.';
								}
							}
							if (resultStat.affectedPhotos) {
								msg += '<br><b>' + resultStat.affectedPhotos + '</b> фотографий переехали по дереву вслед за регионом.';
							}
							if (resultStat.affectedUsers) {
								msg += '<br>У <b>' + resultStat.affectedUsers + '</b> пользователей были сокрашены "Мои регионы".';
							}
							if (resultStat.affectedMods) {
								msg += '<br>У <b>' + resultStat.affectedMods + '</b> модераторов были сокрашены модерируемые регионы.';
							}
						}
						window.noty({text: msg, type: 'alert', layout: 'center', force: true,
							buttons: [
								{addClass: 'btn btn-primary', text: 'Ok', onClick: function ($noty) {
									$noty.close();
								}}
							]
						});
					}
					this.exe(false);
				}, ctx);
			}

			return false;
		},
		sendSave: function (saveData, cb, ctx) {
			socket.once('saveRegionResult', function (data) {
				var error = !data || !!data.error || !data.region;

				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 7000, force: true, closeWith: ['click']});
				} else {
					this.region.pointsnum(data.region.pointsnum);

					if (this.createMode()) {
						//Если регион успешно создан, но переходим на его cid, и через роутер он нарисуется
						globalVM.router.navigateToUrl('/admin/region/' + data.region.cid);
					} else {
						this.fillData(data);
					}
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data, error);
				}
			}.bind(this));
			socket.emit('saveRegion', saveData);
		},
		remove: function () {
			if (this.exe()) {
				return false;
			}
			this.exe(true);

			var cid = this.region.cid(),
				title = this.region.title_local(),
				regionParent,
				that = this,
				childLenArr = this.childLenArr(),
				msg = 'Регион <b>' + title + '</b> будет удален<br>';

			if (childLenArr.length) {
				msg += '<br>Также будут удалено <b>' + childLenArr.reduce(function (previousValue, currentValue) {
					return previousValue + currentValue;
				}) + '</b> дочерних регионов<br>';
			}
			msg += 'Все объекты, входящие в этот регион и в дочерние, ';
			if (!this.region.parents().length) {
				msg += 'будут присвоены <b>Открытому морю</b><br>';
			} else {
				regionParent = _.last(this.region.parents());
				msg += 'остануться в вышестоящем регионе <b>' + regionParent.title_local() + '</b><br>';
			}
			msg += '<br>Это может занять несколько минут. Подтверждаете?<br><small><i>Операция продолжит выполняться даже при закрытии браузера</i></small>';

			window.noty(
				{
					text: msg,
					type: 'confirm',
					layout: 'center',
					modal: true,
					force: true,
					animation: {
						open: {height: 'toggle'},
						close: {},
						easing: 'swing',
						speed: 500
					},
					buttons: [
						{addClass: 'btn btn-danger', text: 'Да', onClick: function ($noty) {
							$noty.close();

							window.noty(
								{
									text: 'Изменения будут необратимы.<br>Вы действительно хотите удалить регион <b>' + title + '</b>?',
									type: 'confirm',
									layout: 'center',
									modal: true,
									force: true,
									buttons: [
										{addClass: 'btn btn-danger', text: 'Да', onClick: function ($noty) {
											// this = button element
											// $noty = $noty element
											if ($noty.$buttons && $noty.$buttons.find) {
												$noty.$buttons.find('button').attr('disabled', true);
											}

											socket.once('removeRegionResult', function (data) {
												$noty.$buttons.find('.btn-danger').remove();
												var msg,
													okButton = $noty.$buttons.find('button')
														.attr('disabled', false)
														.off('click');

												if (data && !data.error) {
													msg = 'Регион <b>' + title + '</b> успешно удалён<br>';
													if (data.affectedPhotos) {
														msg += '<b>' + data.affectedPhotos + '</b> фотографий сменили региональную принадлежность.<br>';
													}
													if (data.affectedUsers) {
														msg += 'У <b>' + data.affectedUsers + '</b> пользователей были сокрашены "Мои регионы".<br>';
													}
													if (data.affectedMods) {
														msg += 'У <b>' + data.affectedMods + '</b> модераторов были сокрашены модерируемые регионы.';
														if (data.affectedModsLose) {
															msg += 'Из них <b>' + data.affectedModsLose + '</b> пользователей лишились роли модератора.';
														}
														msg += '<br>';
													}
													$noty.$message.children().html(msg);

													okButton.text('Ok').on('click', function () {
														var href = '/admin/region';
														if (regionParent) {
															href += '?hl=' + regionParent.cid();
														}
														document.location.href = href;
													});
												} else {
													$noty.$message.children().html(data.message || 'Error occurred');
													okButton.text('Close').on('click', function () {
														$noty.close();
														this.exe(false);
													}.bind(this));
												}
											}.bind(that));
											socket.emit('removeRegion', {cid: cid});

										}},
										{addClass: 'btn btn-success', text: 'Нет', onClick: function ($noty) {
											$noty.close();
											that.exe(false);
										}}
									]
								}
							);
						}},
						{addClass: 'btn btn-primary', text: 'Отмена', onClick: function ($noty) {
							$noty.close();
							that.exe(false);
						}}
					]
				}
			);
			return false;
		},
		changeParentWarn: function (cb, ctx) {
			var msg = 'Вы хотите поменять положение региона в иерархии.',
				childLenArr = this.childLenArr();

			if (childLenArr.length) {
				msg += '<br>При этом также будут перенесены <b>' + childLenArr.reduce(function (previousValue, currentValue) {
					return previousValue + currentValue;
				}) + '</b> дочерних регионов<br>';
			}
			msg += '<br>У пользователей, одновременно подписанных на переносимые регионы и их новые родительские, подписка на переносимые будет удалена, т.к. подписка родительских включает и дочерние регионы. То же касается региональных модераторских прав.';
			msg += '<br>Это может занять несколько минут. Подтверждаете?<br><small><i>Операция продолжит выполняться даже при закрытии браузера</i></small>';

			window.noty(
				{
					text: msg,
					type: 'confirm',
					layout: 'center',
					modal: true,
					force: true,
					buttons: [
						{addClass: 'btn btn-warning', text: 'Да', onClick: function ($noty) {
							cb.call(ctx, true);
							$noty.close();
						}},
						{addClass: 'btn btn-success', text: 'Нет', onClick: function ($noty) {
							cb.call(ctx, false);
							$noty.close();
						}}
					]
				}
			);
		}
	});
});