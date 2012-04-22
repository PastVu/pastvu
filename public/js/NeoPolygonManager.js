function PolygonManager(map, opt_opts) {
	this.layer = opt_opts.layer;
	this.mask = opt_opts.mask;
	this.objects = new Array();
	this.NewObjects = new Array();
	this.CurrZoom = map.getZoom();
	this.refreshTimeout = null;

	this.refreshBind = this.refresh.neoBind(this);

	this.winw = Utils.getDocumentWidth();
	this.winh = Utils.getDocumentHeight();

	//Events
	map.on('zoomstart', function(){window.clearTimeout(this.refreshTimeout);}, this);
	map.on('moveend', this.onMapMoveEnd, this);
};

function Poly(){
	this.object;
	this.event;
	this.handler;
}

PolygonManager.prototype.checkIDinPoly = function(id){
	for (var i=0; i<this.objects.length; i++) if(this.objects[i].object.id==id) return true;
	return false;
};
PolygonManager.prototype.addPolyAtWork = function(object, event, handler){
	if (!this.checkIDinPoly(object.id)) this.addPoly(object, event, handler);
};

PolygonManager.prototype.addPoly = function(object, event, handler){
	var poly_struct = new Poly();
	poly_struct.object = object;
	poly_struct.event = event;
	poly_struct.handler = handler;
	this.NewObjects.push(poly_struct);
	this.layer.addLayer(object);
	if(Browser.name == 'MSIE' && Browser.versionN < 9 && G_vmlCanvasManager && G_vmlCanvasManager.initElement) G_vmlCanvasManager.initElement(object.canvas);
};
PolygonManager.prototype.onMapMoveEnd = function(){
	var pos = true;
	if (this.CurrZoom != map.getZoom()){ //При изменении масштаба
		NeedToRedraw = CulcBoundOnMove(true);
		this.CurrZoom = map.getZoom();
		window.clearTimeout(this.refreshTimeout); this.refreshTimeout = window.setTimeout(this.refreshBind, 500);
		return;
	/*}else if (this.winw != Utils.getDocumentWidth() || this.winh != Utils.getDocumentHeight()){ //При ресайзе окна
		this.ReposObjects();
		this.winw = Utils.getDocumentWidth(); this.winh = Utils.getDocumentHeight();
		return;*/
	}else{
		NeedToRedraw = CulcBoundOnMove();
	}
	if(NeedToRedraw){
		this.refresh(pos);
	}
};
PolygonManager.prototype.onMaskChanged = function(andRedraw){
	this.updateObjects();
	if(andRedraw)this.RedrawObjects();
};
PolygonManager.prototype.refresh = function(pos){
	this.updateObjects();
	this.RedrawObjects(pos);
	this.show();
};
PolygonManager.prototype.getOptMaxZoom_ = function(opt_maxZoom) {
	return opt_maxZoom != undefined ? opt_maxZoom : this.maxZoom;
};
PolygonManager.prototype.CB = function(x1, y1, x2, y2, x, y){
	return (Math.abs(x1-x)+Math.abs(x2-x))==Math.abs(x1-x2) && (Math.abs(y1-y)+Math.abs(y2-y))==Math.abs(y1-y2)
};
PolygonManager.prototype.ReposObjects = function(){
	for(var i=0; i<this.objects.length; i++){
		if ((this.objects[i].object.isNeoLine  || this.objects[i].object.isNeoField)){this.objects[i].object.position_canvas();}
	}
};
PolygonManager.prototype.RedrawObjects = function(pos){
	for(var i=0; i<this.objects.length; i++){
		if ((this.objects[i].object.isNeoLine  || this.objects[i].object.isNeoField)){this.objects[i].object.draw(pos);}
	}
};
PolygonManager.prototype.hide = function(){
	for(var i=0; i<this.objects.length; i++){
		if ((this.objects[i].object.isNeoLine  || this.objects[i].object.isNeoField)){this.objects[i].object.hide();}
	}
};
PolygonManager.prototype.show = function(){
	for(var i=0; i<this.objects.length; i++){
		if ((this.objects[i].object.isNeoLine  || this.objects[i].object.isNeoField)){this.objects[i].object.show();}
	}
};

PolygonManager.prototype.getObjectsByMask = function(mask){
	var result = {visible:[], invisible:[]};
	for(var i=0; i<this.NewObjects.length; i++){
		if(CheckMask(this.NewObjects[i].object.mask, mask)) result.invisible.push(this.NewObjects[i].object);
	}
	
	for(var i=0; i<this.objects.length; i++){
		if(CheckMask(this.objects[i].object.mask, mask)) result.visible.push(this.objects[i].object);
	}
	
	return result;
};
PolygonManager.prototype.updateObjects = function(){
	/*this.mask = CutMask(GetCurrMask());*/
	this.mask = mask;
	for(var i=0; i<this.NewObjects.length; i++){
		if(this.NewObjects[i].object.zooms.indexOf(this.CurrZoom)>=0 &&
		   this.NewObjects[i].object.BoundFull.intersects(CalcBound, false) && CheckMask(this.NewObjects[i].object.mask, this.mask)){
			this.NewObjects[i].object.canvas.style.display = 'block';
			this.NewObjects[i].object.canvas.style.visibility = 'inherit';
			this.objects.push(this.NewObjects.splice(i, 1)[0]); i--;
			/*if (this.NewObjects[i].event && this.NewObjects[i].handler){
				ModeManager.GetMode('Hand').GetEventManager().addListener( this.NewObjects[i].object, this.NewObjects[i].event, this.NewObjects[i].handler);
			}*/
		}
	}
	
	for(var i=0; i<this.objects.length; i++){
		if(this.objects[i].object.zooms.indexOf(this.CurrZoom)>=0 &&
		   this.objects[i].object.BoundFull.intersects(CalcBound, false) && CheckMask(this.objects[i].object.mask, this.mask)){
		}else{
			this.objects[i].object.canvas.style.display = 'none';
			this.NewObjects.push(this.objects.splice(i, 1)[0]); i--;
			/*if (this.objects[i].event){
				ModeManager.GetMode('Hand').GetEventManager().removeListener(this.objects[i].object, this.objects[i].event);
			}*/
		}
	}
};