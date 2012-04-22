function MarkerManager(map, opt_opts) {
	this.layer = opt_opts.layer;
	this.objects = {};
	this.NewObjects = {};
	this.CurrZoom = map.getZoom();
	this.refreshTimeout = null;

	//Events
	map.on('viewreset', this.repos, this);
	//map.on('zoomstart', function(){window.clearTimeout(this.refreshTimeout);}, this);
	//map.on('moveend', this.onMapMoveEnd, this);
};
MarkerManager.prototype.addMarker = function(object){
	this.NewObjects[object.id] = object;
};
MarkerManager.prototype.refresh = function(pos){
	this.updateObjects();
	this.repos();
};
MarkerManager.prototype.repos = function(pos){
	for (m in this.objects){
		if (!this.objects.hasOwnProperty(m)) continue;
		
		this.objects[m]._repos();
	}
};
MarkerManager.prototype.MarkerAddEvents = function(marker){
	Utils.Event.add(marker.marker, 'touchstart', marker.TouchStart.neoBind(marker));
	Utils.Event.add(marker.marker, 'touchend', marker.TouchEnd.neoBind(marker));
	Utils.Event.add(marker.marker, 'click', marker.MarkerClick.neoBind(marker));
	Utils.Event.add(marker.marker, 'mouseover', marker.MarkerOver.neoBind(marker));
	Utils.Event.add(marker.marker, 'mousemove', marker.MarkerMove.neoBind(marker));
	Utils.Event.add(marker.marker, 'mouseout', marker.MarkerOut.neoBind(marker));
}
MarkerManager.prototype.updateObjects = function(searchRespectHash){
	var m,	markersAlreadyAdded = {};
	
	if (searchRespectHash){
		for (m in searchRespectHash){
			if (!searchRespectHash.hasOwnProperty(m)) continue;
			if (this.NewObjects[m]){
				this.layer.addLayer(this.NewObjects[m]);
				this.MarkerAddEvents(this.NewObjects[m]);
				markersAlreadyAdded[m] = this.NewObjects[m];
				delete this.NewObjects[m];
			}
			
			if (this.objects[m]){
				markersAlreadyAdded[m] = this.objects[m];
				delete this.objects[m];
			}
		}
		for (m in this.objects){
			if (!this.objects.hasOwnProperty(m)) continue;
			
			Utils.Event.removeAll(this.objects[m].marker);
			this.layer.removeLayer(this.objects[m]);
			this.NewObjects[m] = this.objects[m];
			delete this.objects[m];
		}
		for (m in markersAlreadyAdded){
			if (!markersAlreadyAdded.hasOwnProperty(m)) continue;
			
			this.objects[m] = markersAlreadyAdded[m];
			delete markersAlreadyAdded[m];
		}
	} else {
		for (m in this.NewObjects){
			if (!this.NewObjects.hasOwnProperty(m)) continue;
			if (!CheckMask(cams[m].mask, mask)) continue;
			
			this.layer.addLayer(this.NewObjects[m]);
			this.MarkerAddEvents(this.NewObjects[m]);
			this.objects[m] = this.NewObjects[m];
			markersAlreadyAdded[m] = true;
			delete this.NewObjects[m];
		}
		
		for (m in this.objects){
			if (!this.objects.hasOwnProperty(m) || markersAlreadyAdded[m]) continue;
			if (CheckMask(cams[m].mask, mask)) continue;
			
			Utils.Event.removeAll(this.objects[m].marker);
			this.layer.removeLayer(this.objects[m]);
			this.NewObjects[m] = this.objects[m];
			delete this.objects[m];
		}
	}
	
	markersAlreadyAdded = m = null;
}


L.NeoMarker = L.Class.extend({
	isNeoMarker: true,
	point: null,
	map: null,
	pane: null,
	marker: null,
	
	hint_start: 0,
	
	opts: {
		id: '',
		title: '',
		img: 'images/front_map/camera_black_new.png',
		raphael: null,
		clickable: true,
		draggable: false,
		zIndexOffset: 0
	},

	initialize: function (latlng, opts) {
		$.extend(true, this, opts || this.opts);
		this.point = latlng;
	},

	onAdd: function (map) {
		this._map = map;
		this.pane = this._map._panes.markerPane;
		
		this._create();
		this._repos();
	},
	onRemove: function (map) {
		this._remove();
	},


	_create: function(){
		/*var pos = this._map.latLngToLayerPoint(this.point).round();
		var cr = this.opts.raphael.circle(pos.x, pos.y, 16).attr({fill: "#fff", "fill-opacity": 0.9, stroke: "#A8A8A8", "stroke-width": 1});
		this.opts.raphael.image('images/front_map/icon_cam_blue.png', pos.x-10, pos.y-6, 23, 12);
		var elattrs = [{cy: pos.y-5, fill: "#f90", "fill-opacity": 1}, {cy: pos.y, fill: "#fff", "fill-opacity": 0.9}],
			now = 1;
		cr.click(function () {
			cr.stop().animate(elattrs[+(now = !now)], 500);
		});*/
		this.marker = $('<div/>', {'class' : "neomarker", 'style':'background-image:url('+this.img+')'})[0];
		this.pane.appendChild(this.marker);
	},
	_remove: function(){
		this.pane.removeChild(this.marker);
		this.marker = this._map = null;
	},
	_repos: function(){
		var pos = this._map.latLngToLayerPoint(this.point);
		L.DomUtil.setPosition(this.marker, pos);

		this.marker.style.zIndex = pos.y + this.zIndexOffset;
	},
	
	TouchStart: function(evt){
		this.hint_start = (new Date()).getTime();
		var pos = mousePageXY(evt);
		object_hint.style.bottom = GlobalParamsVM.Height() - pos.y + 35 + "px";
		object_hint.style.left = Math.max(pos.x - 55, 1) + "px";
		object_hint.querySelector('#hint_text').innerHTML = cams[this.id].name;
		object_hint.classList.add('cam');
	},
	TouchEnd: function(evt){
		this.MarkerOut(evt);
		if((new Date()).getTime() - this.hint_start > 700) return false;
	},
	MarkerClick: function(evt){
		mediaContainerManager.open(this.id);
	},
	MarkerOver: function(evt){
		var pos = mousePageXY(evt);
		object_hint.querySelector('#hint_text').innerHTML = cams[this.id].name;
		object_hint.classList.add('cam');
	},
	MarkerMove: function(evt){
		var pos = mousePageXY(evt);
		object_hint.style.bottom = GlobalParamsVM.Height() - pos.y + 20 + "px";
		object_hint.style.left = Math.max(pos.x - 15, 1) + "px";
	},
	MarkerOut: function(evt){
		if(object_hint.classList.contains('cam')) {object_hint.classList.remove('cam');}
		object_hint.style.bottom = "auto";
		object_hint.style.left = "auto";
	}
});
