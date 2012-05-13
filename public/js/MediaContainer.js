function MediaContainerManager(multiview){
	this.multiview = multiview || false;
	this.layer = document.getElementById('cam_layer');
	this.mc = {};
	this.mcsToDel = {};
	this.closeTimeoutHash = {};
	this.maxZ = 0;
	this.selectedId;
	this.allowControl = Server.allowControl;
}
MediaContainerManager.prototype.add_ = function(id){
	var newid = id || Math.floor(Math.random()*101);
	if(this.mc[newid]) return newid;
	this.mc[newid] = new MediaContainer(newid, this);
	this.layer.appendChild(this.mc[newid].DOM);
	return newid;
};
MediaContainerManager.prototype.remove = function(id){
	if(!this.mc[id]) return;
	var mc = this.mc[id];
	this.layer.removeChild(mc.DOM);
	mc.destroy();
	for (var prop in mc){
		if (!mc.hasOwnProperty(prop)) continue;
		delete mc[prop];
	}
	delete this.mc[id];
};
MediaContainerManager.prototype.removeMCs = function(){
	for (var m in this.mcsToDel){
		if (!this.mcsToDel.hasOwnProperty(m)) continue;
		console.log('removeMC '+m);
		this.remove(m);
		delete this.mcsToDel[m];
	}
};
MediaContainerManager.prototype.show_ = function(id){
	if(!this.mc[id]) return;
	this.mc[id].disp();
	if(this.allowControl) this.mc[id].addControl();
};
MediaContainerManager.prototype.hide_ = function(id){
	if(!this.mc[id]) return;
	this.mc[id].dispOff();
};
MediaContainerManager.prototype.open = function(id){
	var newid = id;

	if (this.mc[id]){
		if (this.mcsToDel[id]) delete this.mcsToDel[id];
		if (this.mc[id].open) this.select(newid);
		else {
			if (!this.multiview) this.closeAll();
			this.show_(id);
		}
	} else {
		if (!this.multiview){
			this.closeAll();
		}
		newid = this.add_(id);
		this.show_(newid);
		this.select(newid);
	}
	return newid;
};
MediaContainerManager.prototype.close = function(id){
	if(!this.mc[id]) return;
	this.hide_(id);
	this.mcsToDel[id] = 1;
	window.setTimeout(this.removeMCs.neoBind(this), 5000);
};
MediaContainerManager.prototype.closeAll = function(){
	for (var id in this.mc){
		if (!this.mc.hasOwnProperty(id)) continue;
		if (this.mc[id].open) this.close(id);
	}
};
MediaContainerManager.prototype.select = function(id){
	if(!this.mc[id]) return;
	if(this.selectedId != id){
		this.mc[id].DOM.style.zIndex = ++this.maxZ;
		this.selectedId = id;
	}
};
MediaContainerManager.prototype.setControl = function(val){
	this.allowControl = val;
	for (var id in this.mc){
		if (!this.mc.hasOwnProperty(id)) continue;
		if(this.allowControl) this.mc[id].addControl();
	}
};
MediaContainerManager.prototype.openedNum = function(){
	var num = 0;
	for (var id in this.mc){
		if (!this.mc.hasOwnProperty(id)) continue;
		if(this.allowControl) this.mc[id].addControl();
	}
	return num;
};

function cE(type, opt){
	var e = $(type, opt)[0]; e['neoAppend'] = neoAppend; e['neoHTML'] = neoHTML;
	return e;
}
function neoAppend(elem){
	this.appendChild(elem);
	return this;
}
function neoHTML(val){
	this.innerHTML = val;
	return this;
}

function MediaContainer(id, manager){
	this.id = id;
	this.idDom = 'mc'+this.id;
	this.manager = manager;
	this.cam = cams[id];
	this.ElemEvents = [];
	this.ElemEventsExternal = [];

	this.DOM = cE('<div />', {'id' : this.idDom , 'class' : "cam_container", 'style' : "z-index:1"});
		this.addEvent(this.DOM, ET.mdown, function(){this.select(arguments[arguments.length-2])}.neoBind(this.manager, [this.id]), true);
	this.Ruling  = cE('<div />', {'class' : "ruling"});
		this.Joystick  = cE('<div />', {'class' : "joystick"})
						.neoAppend(this.addEvent(cE('<div />', {'class' : "jup"}), 'click', function(){this.TurnCam(1,0,0)}.neoBind(this)))
						.neoAppend(this.addEvent(cE('<div />', {'class' : "jright"}), 'click', function(){this.TurnCam(0,1,0)}.neoBind(this)))
						.neoAppend(this.addEvent(cE('<div />', {'class' : "jdown"}), 'click', function(){this.TurnCam(-1,0,0)}.neoBind(this)))
						.neoAppend(this.addEvent(cE('<div />', {'class' : "jleft"}), 'click', function(){this.TurnCam(0,-1,0)}.neoBind(this)))
						.neoAppend(this.addEvent(cE('<div />', {'class' : "jhome"}), 'click', function(){this.HomeCam()}.neoBind(this)));
		this.Zoomer = cE('<div />', {'class' : "zoomer"})
					 .neoAppend(this.addEvent(cE('<div />', {'class' : "zplus"}), 'click', function(){this.TurnCam(0,0,1)}.neoBind(this)))
					 .neoAppend(this.addEvent(cE('<div />', {'class' : "zminus"}), 'click', function(){this.TurnCam(0,0,-1)}.neoBind(this)));
		this.Ruling.neoAppend(this.Joystick).neoAppend(this.Zoomer);
	
	this.Toolbar = cE('<div />', {'class' : "cam_toolbar"});
		this.drag_cam = cE('<div />', {'class' : "drag_cam"});
		this.control_cam = cE('<div />', {'class' : "b control_cam"}).neoAppend(cE('<div />'));
		this.addToMatrixCam = cE('<div />', {'class' : "b addToMatrix_cam"}).neoAppend(cE('<div />'));
			this.addEvent(this.addToMatrixCam, 'click', function(){this.addToMatrix();}.neoBind(this), false);
		this.close_cam = cE('<div />', {'class' : "b close_cam"}).neoAppend(cE('<div />'));
			this.addEvent(this.close_cam, 'click', function(){this.manager.close(this.id)}.neoBind(this), false);
		this.Toolbar.neoAppend(this.drag_cam).neoAppend(this.control_cam).neoAppend(this.addToMatrixCam).neoAppend(this.close_cam);
	
	this.PlayContainer = cE('<div />', {'class' : "player_container"})
		.neoAppend(this.playerLoading = cE('<div />', {'class' : "player_container_loading"}))
		.neoAppend(this.playerError = cE('<div />', {'class' : "player_container_error"}))
		.neoAppend(this.camCurtain = cE('<div />', {'class' : "cam_curtain"}))
		.neoAppend(
			this.minMatrixControl = cE('<div />', {'class' : "min_matrix_control"})
				.neoAppend(cE('<div />', {'class' : "name"}).neoHTML(this.cam.name))
				.neoAppend(this.addEvent(cE('<div />', {'class' : "b homeInMatrix_cam"}).neoAppend(cE('<div />')), 'click', function(){this.HomeCam();}.neoBind(this)))
				.neoAppend(this.addEvent(cE('<div />', {'class' : "b maxMatrix_cam"}).neoAppend(cE('<div />')), 'click', function(){this.maxMatrix();}.neoBind(this)))
				.neoAppend(this.addEvent(cE('<div />', {'class' : "b remFromMatrix_cam"}).neoAppend(cE('<div />')), 'click', function(){this.addToMatrix();}.neoBind(this)))
				.neoAppend(this.addEvent(cE('<div />', {'class' : "b closeFromMatrix_cam"}).neoAppend(cE('<div />')), 'click', function(){this.addToMatrix(true);}.neoBind(this)))
		)
		.neoAppend(this.addEvent(cE('<div />', {'class' : "roc jup"}), 'click', function(){this.TurnCam(1,0,0)}.neoBind(this)))
		.neoAppend(this.addEvent(cE('<div />', {'class' : "roc jright"}), 'click',function(){this.TurnCam(0,1,0)}.neoBind(this)))
		.neoAppend(this.addEvent(cE('<div />', {'class' : "roc jdown"}), 'click', function(){this.TurnCam(-1,0,0)}.neoBind(this)))
		.neoAppend(this.addEvent(cE('<div />', {'class' : "roc jleft"}), 'click', function(){this.TurnCam(0,-1,0)}.neoBind(this)));
		
	this.ControlPanel = cE('<div />', {'class' : "control_panel"})
		.neoAppend(this.archive_cam = cE('<div />', {'class' : "b archive_cam"}).neoAppend(cE('<div />')),  this.addEvent(this.archive_cam, 'click', function(){this.SwithPlayArchive()}.neoBind(this), false))
		.neoAppend(this.linked_cam = cE('<div />', {'class' : "b linked_cam"}).neoAppend(cE('<div />')), this.addEvent(this.linked_cam, 'click', function(){this.ToggleLinked()}.neoBind(this), false))
		.neoAppend(
			this.origsize_cam = cE('<div />', {'class' : "b origsize_cam"}).neoAppend(cE('<div />')), 
			this.addEvent(this.origsize_cam, 'click', function(){this.HideLinked(); this.resize(this.origWidth, this.origHeight, true);}.neoBind(this), false)
		)
		.neoAppend(
			this.fitpage_cam = cE('<div />', {'class' : "b fitpage_cam"}).neoAppend(cE('<div />')),
			this.addEvent(this.fitpage_cam, 'click', function(){this.HideLinked(); this.resize(Utils.getClientWidth(), Utils.getClientHeight(), true);}.neoBind(this), false)
		)
		.neoAppend(this.expander_cam = cE('<div />', {'class' : "b expander_cam"}).neoAppend(cE('<div />')));
	
	this.LinkedPanelFringe = cE('<div />', {'class' : "linked_fringe fringe gradientBack"});
	this.LinkedPanel = cE('<div />', {'class' : "linked_panel inner_bord", 'data-bind' : "template: {name:'CamListTemplate', afterRender: AfterTemplateRender}"}); this.LinkedPanelFringe.neoAppend(this.LinkedPanel);
		this.LinkedCamList = new CamListVM(this.cam.relations);
		this.LinkedCamListCheckForRelations();
		this.LinkedCamList.containerH.subscribe(this.LinkedCamListHeight.neoBind(this));
		ko.applyBindings(this.LinkedCamList, this.LinkedPanel);
	
	this.Signature = cE('<div />', {'class' : "signature"})
		this.cam_name = cE('<div />', {'class' : "cam_name"});
		this.cam_addr = cE('<div />', {'class' : "cam_addr"});
		this.cam_diff = cE('<div />', {'class' : "cam_diff"});
		this.Signature.neoAppend(this.cam_name).neoAppend(this.cam_addr).neoAppend(this.cam_diff);
	this.Over = cE('<div />', {'class' : "ContainerOver"});
	
	this.DOM.neoAppend(this.Ruling).neoAppend(this.Toolbar).neoAppend(this.PlayContainer).neoAppend(this.LinkedPanelFringe).neoAppend(this.ControlPanel).neoAppend(this.Signature).neoAppend(this.Over);
	
	this.player = null;
	
	this.PosX = 100; this.PosY = 50;
	this.origWidth = this.cam.urls && Number(this.cam.urls.resolution["image width"]) || 640;
	this.origHeight = this.cam.urls && Number(this.cam.urls.resolution["image height"]) || 480;
	this.aspect = this.origWidth/this.origHeight;
	this.Width; this.Height;
	this.minWidth = this.minHeight = 120;
	this.wWrap = 4+2; this.hWrap = 35+34+25+4+2;
	this.maxWidth = Utils.getDocumentWidth()-this.wWrap; this.maxHeight = Utils.getDocumentHeight()-this.hWrap;
	
	this.docW = Utils.getDocumentWidth(), this.docH = Utils.getDocumentHeight();
	this.addEventExternal(window, 'resize', function(evt){
		var newW = Utils.getDocumentWidth()
		  , newH = Utils.getDocumentHeight()
		  , dx = newW-this.docW
		  , dy = newH-this.docH;
		this.docW = newW, this.docH = newH;
		this.maxWidth = newW-this.wWrap; this.maxHeight = newH-this.hWrap;
		this.resize(this.Width, this.Height, true, dx, dy);
	}.neoBind(this), false);
	
	this.LastMousePos;
	this.open = false;
	
	this.DOM.style.left = this.PosX + 'px';
	this.DOM.style.top = this.PosY + 'px';
	
	this.ToolbarBind = this.ToolbarDown.neoBind(this);
	this.MoveBind = this.Move.neoBind(this);
	this.MoveOffBind = this.MoveOff.neoBind(this);
	this.WheelZoomBind = this.WheelZoom.neoBind(this);
	
	this.ExpanderBind = this.ExpanderDown.neoBind(this);
	this.ExpanderMoveBind = this.ExpanderMove.neoBind(this);
	this.ExpanderMoveOffBind = this.ExpanderMoveOff.neoBind(this);
	
	if(Browser.name == 'FIREFOX'){this.addEvent(this.PlayContainer, 'DOMMouseScroll', this.WheelZoomBind, true);
	}else{this.addEvent(this.PlayContainer, 'mousewheel', this.WheelZoomBind, true);}
	
	this.addEvent(this.drag_cam, ET.mdown, this.ToolbarBind, false);
	this.addEvent(this.expander_cam, ET.mdown, this.ExpanderBind, false);
	
	this.addEventExternal(document, 'touchmove', function(){return false;}, true);
	
	this.setCamData();
	if (this.cam.urls) {
		this.resize(this.origWidth, this.origHeight, true);
		window.setTimeout(function(){this.DOM.classList.add('transition');}.neoBind(this),1500)
	}
	this.clickControl = function(e){
		if(this.controlOpened) this.closeControl();
		else this.openControl();
		return false;
	}.neoBind(this);

}
MediaContainer.prototype.addEvent = function(elem, type, fn, capture){
	//elem.bind(type, fn);
	Utils.Event.add(elem, type, fn, (capture || false));
	if (this.ElemEvents.indexOf(elem) < 0) this.ElemEvents.push(elem);
	return elem;
};
MediaContainer.prototype.addEventExternal = function(elem, type, fn, capture){
	var cap = capture || false;
	//elem.bind(type, fn);
	Utils.Event.add(elem, type, fn, cap);
	this.ElemEventsExternal.push({elem:elem, type:type, fn:fn, cap:cap});
	return elem;
};
MediaContainer.prototype.removeEventExternal = function(elem, type, fn, capture){
	var cap = capture || false;
	//elem.unbind(type, fn);
	Utils.Event.remove(elem, type, fn, cap);
	for (var e=0, elen=this.ElemEventsExternal.length, eee; e<elen; e++){
		eee = this.ElemEventsExternal[e];
		if (eee.elem === elem && eee.type == type && eee.fn === fn && eee.cap == cap){
			this.ElemEventsExternal.splice(e,1);
			break;
		}
	}
	return elem;
};
MediaContainer.prototype.clearEvents = function(){
	var Ev = Utils.Event,
		numberOfRemoved = 0,
		e = 0, elen, eee;
	for (elen=this.ElemEvents.length; e<elen; e++){
		numberOfRemoved += Ev.removeAll(this.ElemEvents[e]);
	}
	for (e=0, elen=this.ElemEventsExternal.length; e<elen; e++){
		eee = this.ElemEventsExternal[e];
		Utils.Event.remove(eee.elem, eee.type, eee.fn, eee.cap);
		numberOfRemoved += 1;
	}
	this.ElemEvents = [];
	this.ElemEventsExternal = [];
	return numberOfRemoved; 
};
MediaContainer.prototype.addControl = function(){
	if(!this.cam.fixed && !this.controlAdded){
		this.addEvent(this.control_cam, 'click', this.clickControl, false);
		this.DOM.classList.add('control');
		this.controlAdded = true;
	}
};

MediaContainer.prototype.removeControl = function(){
	if(this.controlAdded){
		Utils.Event.removeAll(this.control_cam);
		this.DOM.classList.remove('control');
		this.controlAdded = false;
		this.closeControl(true);
	}
};

MediaContainer.prototype.openControl = function(){
	if(!this.controlOpened){
		this.DOM.classList.add('open');
		this.control_cam.classList.add('open');
		this.controlOpened = true;
        if (Browser.support.flash && !Server.forceMJPEG) return;
		if (!this.cam.urls.mjpg || this.cam.urls.mjpg.length==0) return;
		if(this.switchTimeout){
            window.clearTimeout(this.switchTimeout);
            this.switchTimeout=null;
        } else {
            this.switchTimeout = window.setTimeout(function(){
                this.switchTimeout=null;
                this.SwithPlayTo('mjpeg');
            }.neoBind(this), 1000);
        }
	}
};
MediaContainer.prototype.closeControl = function(justClose){
	if(this.controlOpened){
		this.DOM.classList.remove('open');
		this.control_cam.classList.remove('open');
		this.controlOpened = false;
        if (Browser.support.flash && !Server.forceMJPEG) return;
		if (!this.cam.urls.mjpg || this.cam.urls.mjpg.length==0) return;
		if(this.switchTimeout) {
            window.clearTimeout(this.switchTimeout);
            this.switchTimeout=null;
        } else if(!justClose) {
            this.switchTimeout = window.setTimeout(function(){
                this.switchTimeout=null;
                this.SwithPlayTo();
            }.neoBind(this), 1000);
        }
	}
};

MediaContainer.prototype.ToolbarDown = function(e){
	this.LastMousePos = mousePageXY(e);
	if(!e.touches){
		this.offsetY = e.layerY || e.offsetY;
		this.offsetX = e.layerX || e.offsetX;
	}
	this.DOM.classList.add('moving');
	this.addEventExternal(document, ET.mmove, this.MoveBind, false);
	this.addEventExternal(document, ET.mup, this.MoveOffBind, false);
	
	//if(e.stopPropagation) e.stopPropagation();
	//if(e.preventDefault) e.preventDefault();
};

MediaContainer.prototype.Move = function(e){
	var NewMousePos = mousePageXY(e);
	this.PosX += NewMousePos.x - this.LastMousePos.x;
	if(this.offsetY && NewMousePos.y<this.offsetY){
		this.PosY = 1;
	}else{
		this.PosY += NewMousePos.y - this.LastMousePos.y;
	}
	this.DOM.style.left = this.PosX + 'px';

	if (this.PosY < 1){
		this.PosY = 1; NewMousePos.y = 1;
	}
	this.DOM.style.top = this.PosY + 'px';
	
	this.LastMousePos = NewMousePos;
	if(e.stopPropagation) e.stopPropagation();
	if(e.preventDefault) e.preventDefault();
};

MediaContainer.prototype.MoveOff = function(e){
	this.removeEventExternal(document, ET.mmove, this.MoveBind, false);
	this.removeEventExternal(document, ET.mup, this.MoveOffBind, false);
	this.DOM.classList.remove('moving');
	if(e.stopPropagation) e.stopPropagation();
	if(e.preventDefault) e.preventDefault();
};

MediaContainer.prototype.ExpanderDown = function(e){
	this.DOM.classList.add('expanding');
	this.LastMousePos = mousePageXY(e);
	//this.Width = this.PlayContainer.clientWidth; this.Height = this.PlayContainer.clientHeight; //clientHeight возвращает уже округленное значение, что недопустимо
	this.addEventExternal(document, ET.mmove, this.ExpanderMoveBind, false);
	this.addEventExternal(document, ET.mup, this.ExpanderMoveOffBind, false);
	
	//if(e.stopPropagation) e.stopPropagation();
	//if(e.preventDefault) e.preventDefault();
};

MediaContainer.prototype.ExpanderMove = function(e){
	var NewMousePos = mousePageXY(e)
	  , deltaX = NewMousePos.x - this.LastMousePos.x
	  , deltaY = NewMousePos.y - this.LastMousePos.y
	  , newWidth
	  , newHeight;
	if (Math.abs(deltaX) >= Math.abs(deltaY)*this.aspect) {
		newWidth = this.Width + deltaX;
		newHeight = this.Height + deltaX/this.aspect;
	} else {
		newWidth = this.Width + deltaY*this.aspect;
		newHeight = this.Height + deltaY;		
	}
	
	if(this.resize(newWidth, newHeight)){
		this.LastMousePos = NewMousePos;
	}
	
	if(e.stopPropagation) e.stopPropagation();
	if(e.preventDefault) e.preventDefault();
};

MediaContainer.prototype.ExpanderMoveOff = function(e){
	this.resize(this.Height*this.aspect, this.Height);
	this.DOM.classList.remove('expanding');
	this.removeEventExternal(document, ET.mmove, this.ExpanderMoveBind, false);
	this.removeEventExternal(document, ET.mup, this.ExpanderMoveOffBind, false);
	if(e.stopPropagation) e.stopPropagation();
	if(e.preventDefault) e.preventDefault();
};
MediaContainer.prototype.resize = function(w, h, adaptForLimitations, mW, mH){
	if (this.inMatrix && !this.inMatrixMax || !w || !h) return false;
	
	var maxW = mW || this.maxWidth, maxH = mH || this.maxHeight;
	if (w >= this.minWidth && w <= maxW && h >= this.minHeight && h <= maxH) {
		this.Width = w; this.Height = h;
		this.PlayContainer.style.width = /*this.Signature.style.width =*/ this.Width + 'px';
		this.PlayContainer.style.height = this.Height + 'px';
		this.repos();
		
		if (this.LinkedPanelFringe.classList.contains('show')){
			this.LinkedCamListSetSize();
		}
		return true;
	}else if (adaptForLimitations) {
		var newWidth, newHeight;
		if (w < this.minWidth) {newWidth = this.minWidth; newHeight = newWidth/this.aspect}
		else if (w > maxW) {newWidth = maxW; newHeight = newWidth/this.aspect}
		
		if (h < this.minHeight) {newHeight = this.minHeight; newWidth = newHeight*this.aspect}
		else if (h > maxH && (!newHeight || newHeight > maxH)) {newHeight = maxH; newWidth = newHeight*this.aspect}

		
		this.Width = newWidth, this.Height = newHeight;
		this.PlayContainer.style.width = /*this.Signature.style.width =*/ this.Width + 'px';
		this.PlayContainer.style.height = this.Height + 'px';
		if (this.LinkedPanelFringe.classList.contains('show')){
			this.LinkedCamListSetSize();
		}
		this.repos();
		return true;
	}
	return false;
};
MediaContainer.prototype.repos = function(dx, dy, absx, absy){
	if(absx) {
		this.PosX = absx; this.DOM.style.left = this.PosX+'px';
	} else if (dx) {
		this.PosX += dx; this.DOM.style.left = this.PosX+'px';
	} else if (this.PosX > Utils.getDocumentWidth()-this.Width){
		this.PosX = Math.max(0, Utils.getDocumentWidth()-this.Width-this.wWrap+1); this.DOM.style.left = this.PosX+'px';
	}
	if(absy) {
		this.PosY = absy; this.DOM.style.top = this.PosY+'px';
	} else if (dy){
		this.PosY += dy; this.DOM.style.top = this.PosY+'px';
	} else if (this.PosY > Utils.getDocumentHeight()-this.Height-this.hWrap){
		this.PosY = Math.max(0, Utils.getDocumentHeight()-this.Height-this.hWrap); this.DOM.style.top = this.PosY+'px';
	}
};
MediaContainer.prototype.disp = function(){
	if (!this.open){
		this.DOM.classList.add('show');
		this.open = true;
		if(this.cam.urls){
			this.Play();
		}else{
			$.when(this.loadUrls()).done(function(){this.Play()}.neoBind(this));
		}
	}
};
MediaContainer.prototype.dispOff = function(){
	if (this.open){
		this.RemovePlayer();
		if(this.controlOpened) this.closeControl();
		this.HideLinked();
		this.DOM.classList.remove('show');
		this.open = false;
	}
};
MediaContainer.prototype.destroy = function(){
	this.dispOff();
	this.clearEvents();
};

MediaContainer.prototype.addToMatrix = function(andClose){
	
	if (!this.inMatrix){
		this.HideLinked();
		this.closeControl();
		if (this.playingArchive) this.SwithPlayArchive();
		this.DOM.classList.add('inMatrix');
		this.wWrap = 0; this.hWrap = 0;
		this.resize(180, 135);
		MatrixVM.addmc(this);
		this.inMatrix = !this.inMatrix;
	}else{
		this.inMatrix = this.inMatrixMax = false;
		if (andClose) this.manager.close(this.id);
		this.DOM.classList.remove('inMatrix'); this.DOM.classList.remove('mMax');
		MatrixVM.delmc(this);
		this.wWrap = 4+2; this.hWrap = 35+34+25+4+2;
		this.repos(null, null, 100, 50);
		this.resize(this.origWidth, this.origHeight, true);
	}
	
};
MediaContainer.prototype.maxMatrix = function(){
	
	if (!this.inMatrixMax){
		this.DOM.classList.add('mMax');
		this.minMatrixControl.querySelector('.name').innerHTML = this.cam.name + '<br/>' + this.cam_addr.innerHTML;
		this.inMatrixMax = true;
		MatrixVM.addmcMax(this);
	}else{
		this.DOM.classList.remove('mMax');
		this.minMatrixControl.querySelector('.name').innerHTML = this.cam.name;
		this.resize(180, 135);
		this.inMatrixMax = false;
		MatrixVM.delmcMax(this);
		
	}
};

/*MediaContainer.prototype.changeCam = function(newId){
	if (newId && cams[newId]) {
		this.id = cams[newId];
		this.idDom = 'mc'+this.id;
		this.cam = cams[newId];
	}
};*/
MediaContainer.prototype.setCamData = function() {
	this.drag_cam.innerHTML = this.cam.type;

	this.cam_name.innerHTML = this.cam.name;
	this.cam_addr.innerHTML = this.cam.postalAddress || this.cam.address || this.cam.constructionAddress || "";
	var span = "<span style='color: #BFBFBF;'>", spane = "</span>";

	this.cam_diff.innerHTML = 
	  (this.cam.functional ? span+Server.messages['index.cam.functional'] + ": "+ spane + this.cam.functional + "<br/>" : "") +
	  (this.cam.startDate ? span+Server.messages['index.cam.startDate'] + ": "+ spane + this.cam.startDate + "<br/>" : "") +
	  (this.cam.endDate ? span+Server.messages['index.cam.endDate'] + ": "+ spane + this.cam.endDate + "<br/>" : "") +
	  (this.cam.primeContractor ? span+Server.messages['index.cam.primeContractor'] + ": "+ spane + this.cam.primeContractor + "<br/>" : "") +
	  (this.cam.technicalCustomer ? span+Server.messages['index.cam.technicalCustomer'] + ": "+ spane + this.cam.technicalCustomer : "");
};
MediaContainer.prototype.loadUrls = function(){
	this.PlayContainer.classList.add('loading');
	return $.ajax({
	  url: Server.paths.getVideoUrl+'?id='+this.id,
	  cache: false,
	  success: function(json) {
		if (json.error){
			this.PlayContainer.classList.add('error');
			this.playerError.innerHTML = json.error;
			return;
		}
		this.cam.urls = json.url;
		this.origWidth = Number(this.cam.urls.resolution["image width"]) || this.origWidth;
		this.origHeight = Number(this.cam.urls.resolution["image height"]) || this.origHeight;

		if(Server.customerId != 'mostelecom' && this.cam.hasArchive && this.cam.urls.archive) {
			this.archive_cam.style.display = 'block';
		}
	  }.neoBind(this),
	  error: function(json) {
		Utils.debug('Ошибка getIstreamVideoUrl: ' + json.status + ' ('+json.statusText+')');
		this.PlayContainer.classList.add('error');
		this.playerError.innerHTML = 'Ошибка получения видеопотока';
	  }.neoBind(this),
	  complete: function(json) {
		this.PlayContainer.classList.remove('loading');
		this.aspect = this.origWidth/this.origHeight; 	if(console) console.log('camera '+this.id+' aspect: '+this.aspect);
		this.resize(this.origWidth, this.origHeight, true);
		window.setTimeout(function(){this.DOM.classList.add('transition');}.neoBind(this),1500)
	  }.neoBind(this)
	});
};

MediaContainer.prototype.Play = function(forceType, forceUrl){
	var type = forceType || GlobalParams.mediaFormat;
	var path = (this.playingArchive && this.cam.urls.archive ? this.cam.urls.archive : this.cam.urls.istream);
	if(type=='mjpeg') path = this.cam.urls.mjpg;
	if(forceUrl) path = forceUrl;
	this.PlayContainer.classList.remove('error');
	
	playingFormat = type;
	if(type=='video5') this.PlayVideo5(path, this.cam.urls.snapshot);
	else if(type=='flash') this.PlayFlash(path, this.cam.urls.snapshot);
	else if(type=='mjpeg') this.PlayMJPEG(path);
	this.playingUrl = path;
}
MediaContainer.prototype.PlayFlash = function(url, snapshot){
	if (this.player && this.player.id){swfobject.removeSWF(this.player.id);}
	this.player = null;
	var streamingArray = /([^\/]+)\/(.*)/.exec(url);
	if(!streamingArray){
		this.PlayContainer.classList.add('error');
		this.playerError.innerHTML = 'Ошибка адреса видеопотока';
		console.log('Ошибка адреса видеопотока: "'+url+'"');
		return false;
	}
	this.player = document.createElement(Server.flashPlayer.instance == 'flow' ? 'a' : 'div');
    this.player.id = this.idDom+'_player';
	this.PlayContainer.insertBefore(this.player, this.camCurtain);
	
	var w,h;
    w = '100%';
    h = '100%';
    var streamer = 'rtmp://'+streamingArray[1];
    var file = streamingArray[2];
    var params, attributes, flashvars, swf;
	
    switch (Server.flashPlayer.instance) {
	case "uppod":
		//uppodInit = function(playerID){if(console) console.log(playerID+" inited");};
		//uppodOnLoad = function(playerID){if(console) console.log(playerID+" loaded");};
		uppodStartsReport = function(playerID){
			if(GlobalParams.MAX_VIDEO_PLAYBACK_TIME>0){
				window.setTimeout(function(){
					if(console) console.log(playerID+" paused by maxVideoPlaybackTime");
					uppodSend(playerID, 'pause');
				}, GlobalParams.MAX_VIDEO_PLAYBACK_TIME*1000);
			}
		};

		var flashvars = {
			"uid":this.player.id,
			"comment":this.cam.name,
			"st": (this.playingArchive ? "uppod/styles/video81-1974.txt" : "uppod/styles/video81-999.txt"),
			"file":streamer+"/"+file,//"rtmp://172.16.1.219:554/qwe4",//"rtmp://85.30.244.9:1935/mos/severniy/h264"
			"debug" : "1"
		};
		var params = {
			bgcolor:"#000000",
			wmode:"opaque",
			allowFullScreen:"true",
			allowScriptAccess:"always"
		};
		attributes = {id:this.player.id, name:this.player.id};
		new swfobject.embedSWF("uppod/uppod.swf", this.player.id, ""+w, ""+h, "10.0.0", false, flashvars, params);
		break;
    case "jw":
		this.jpl = null;
		var flashLoaded = function (e) {
			// e.ref is a reference to the Flash object. We'll pass it to jwplayer() so the API knows where the player is.
			this.jpl = jwplayer(e.ref);
			// Add event listeners
			if(GlobalParams.MAX_VIDEO_PLAYBACK_TIME>0){
				this.jpl.onReady(function() {if(console) console.log('JWPlayer is ready'); this.jpl.play();}.neoBind(this));
				this.jpl.onPlay(function() {
					if(console) console.log('JWPlayer play');
					window.setTimeout(function(){this.jpl.stop()}.neoBind(this), GlobalParams.MAX_VIDEO_PLAYBACK_TIME*1000)
				}.neoBind(this));
			}
		}.neoBind(this);
	    params = {
            bgcolor:"#000000",
            allowFullScreen:"true",
            allowScriptAccess:"always",
            wmode:"opaque"
        };
	    attributes = {id:this.player.id, name:this.player.id};
        flashvars = {
            file: file,
            streamer: streamer,
            bufferlength: (this.playingArchive ? Server.flashPlayer.bufferLength : 0),
            autostart: true//,
			//"controlbar.position": "none"//,image: snapshot
        };
        swf = "jw-5.8/player.swf";
	    swfobject.embedSWF(swf, this.player.id, ""+w, ""+h,
                           "10.0.0", false, flashvars, params, attributes, flashLoaded);
        break;
    case "flow":
    default:
        this.fpl = flowplayer(this.player.id, {src: "flowplayer/flowplayer-3.2.8.swf", wmode: 'opaque'},
                   {
					   buffering : false, //Specifies whether the rotating buffering animation must be shown or not. Set this to false and the animation will not be shown.
                       //log: { level: 'debug', filter: 'org.flowplayer.rtmp.*' },
					   debug : false,
					   
					   
                       onStart: function() {
							if(GlobalParams.MAX_VIDEO_PLAYBACK_TIME>0){
								window.setTimeout(function(){this.fpl.stop()}.neoBind(this), GlobalParams.MAX_VIDEO_PLAYBACK_TIME*1000);
							}
                       },
                       onFinish: function() {
                           if(console) console.log("onFinish");
                       },

                       onPause: function() {
                           if(console) console.log("onPause");
                       },

                       onResume: function() {
                           if(console) console.log("onResume");
                       },
                       /*canvas: {
                           background: '#000000 url('+snapshot+') 100% 100% center no-repeat',
                           backgroundGradient: 'none'
                       },*/
                       clip: {
                           url: file,
                           live: true,
                           provider: 'rtmp',
                           autoPlay: true,
                           bufferLength: Server.flashPlayer.bufferLength,
                           autoBuffering: false
                       },
                       plugins: {
							rtmp: {
								url: 'flowplayer/flowplayer.rtmp-3.2.8.swf',
								netConnectionUrl: streamer
							},
							controls: null
                       }
                   });

        break;
    }
	this.player = this.PlayContainer.querySelector('#'+this.idDom+'_player');
};

MediaContainer.prototype.PlayVideo5 = function(url, snapshot){
	if (!this.player){
		this.player = document.createElement('video');
        this.player.id = this.idDom+'_player';
		this.player.style.position = 'relative';
		this.player.controls = true;
		this.player.autoplay = true;
        this.player.setAttribute('poster', snapshot);
		this.PlayContainer.insertBefore(this.player, this.camCurtain);
		this.source = document.createElement('source');
		this.player.onplay = function(e) {
			if(GlobalParams.MAX_VIDEO_PLAYBACK_TIME>0){
				window.setTimeout(function(){this.player.pause()}, GlobalParams.MAX_VIDEO_PLAYBACK_TIME*1000);
			}
		};
		this.player.appendChild(this.source);
	}
	try {
		this.source.src = "http://"+url+".m3u";
		this.source.onerror = function onerr(e) {
			//Utils.printObject(e);
			window.setTimeout(function(){
				//this.SwithPlayTo('video5');
			}.neoBind(this), 30000);
			
		}.neoBind(this);
		this.source.type= 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
	}catch(e){alert(88);}

};
MediaContainer.prototype.PlayMJPEG = function(url){
	if (!this.player){
		this.player = document.createElement('img'); this.player.id = this.idDom+'_player';
		this.player.style.position = 'relative';
		this.player.controls = 'controls';
		this.PlayContainer.insertBefore(this.player, this.camCurtain);
	}
	this.player.src = 'http://'+url;
};
MediaContainer.prototype.SwithPlayTo = function(type) {
	this.RemovePlayer();
	this.Play(type);
};
MediaContainer.prototype.SwithPlayArchive = function(){
	this.removeControl();
	this.playingArchive = !this.playingArchive;
	this.archive_cam.classList.toggle('pushed');
	this.Play();
};
MediaContainer.prototype.RemovePlayer = function() {
	if (this.player){
		if (playingFormat == 'flash'){
			if (Server.flashPlayer.instance == 'uppod') {
				//uppodSend(this.player.id, 'stop');
				if (this.player && this.player.id){swfobject.removeSWF(this.player.id);}
			} else if(this.fpl){
				this.fpl.close();
				this.fpl.unload();
				this.fpl = null;
				this.player.innerHTML = ''; //Hack for IE
			} else if(this.jpl){
				this.jpl.stop();
				this.jpl = null;
			}
		}else if(playingFormat == 'flash'){
			this.player.stop();
		}else {
			this.player.src = Server.resourcesPath + '/images/primitive.gif';
		}

		try{
			if(this.player.parentNode) this.PlayContainer.removeChild(this.player);
		}catch(e){
			for (var id in e){
				if (!e.hasOwnProperty(id)) continue;
				if(console) console.log(e[id]+'');
			}
		}
		this.player = null;
	}
};
MediaContainer.prototype.WheelZoom = function(event){
	if (!this.controlAdded) return;
	if (!event) event = window.event;
	var delta = 0;
	// normalize the delta
	if (event.wheelDelta) delta = event.wheelDelta / 60;// IE and Opera
	else if (event.detail) delta = -event.detail / 2; // W3C

	var sign = (delta >= 0 ? 1 : -1); //if(console) console.log(sign);
	this.TurnCam(0,0,sign);
};
MediaContainer.prototype.TurnCam = function(tilt, pan, zoom) {
	if(this.cam.apiType=='AXIS'){
		return $.ajax({
		  url: Server.paths.getPosition+'?id='+this.id,
		  cache: false,
		  success: function(pos) {
			if (pos.zoom <= 1 && zoom < 0) return;
					
			var newZoom = 1*pos.zoom + zoom*Math.max(150, (zoom < 0 ? pos.zoom/2 : pos.zoom)); 
			if (newZoom <1) newZoom = 1;

			var newPan = 1*pos.pan+pan*10/(Math.max(1, Math.log(newZoom)/Math.log(20)));
				newTilt = 1*pos.tilt+tilt*10/(Math.max(1, Math.log(newZoom)/Math.log(10)));
				
			$.ajax({
				url: Server.paths.setPosition+'?id='+this.id+'&tilt='+newTilt+'&pan='+newPan+'&zoom='+newZoom,
				cache: false,
				success: function(pos) {},
				error: function(json) {
					Utils.debug('Ошибка установки позиции камеры: ' + json.status + ' ('+json.statusText+')');
				}.neoBind(this)
			});
			pos = newZoom = newPan = newTilt = null;
		  }.neoBind(this),
		  error: function(json) {
			Utils.debug('Ошибка получения позиции камеры: ' + json.status + ' ('+json.statusText+')');
		  }.neoBind(this)
		});
	}else if(this.cam.apiType=='CISCO' || this.cam.apiType=='CISCO_VSM' || this.cam.apiType=='ECHD_CISCO_VSM'){
		var command = 'Z2';0
		if (zoom==-1) command = 'W2';
		else if (tilt==1) command = 'K1';
		else if (tilt==-1) command = 'J1';
		else if (pan==1) command = 'L1'; //Right
		else if (pan==-1) command = 'H1'; //Left
		$.ajax({
			url: Server.paths.setCiscoPosition+'?id='+this.id+'&command='+command,
			cache: false,
			success: function(json) {
				if (json.result!='ok') if(console) Utils.debug('Ошибка setCiscoPosition: ' + json.result);
			},
			error: function(json) {
				Utils.debug('Ошибка setCiscoPosition: ' + json.status + ' ('+json.statusText+')');
			}.neoBind(this)
		});
	}
};
MediaContainer.prototype.HomeCam = function() {
	if(this.cam.apiType=='AXIS'){
		$.ajax({
			url: Server.paths.toHomePosition+'?id='+this.id,
			cache: false,
			success: function(json) {},
			error: function(json) {
				Utils.debug('Ошибка установки позиции камеры в домашнее положение: ' + json.status + ' ('+json.statusText+')');
			}.neoBind(this)
		});
	}
};
MediaContainer.prototype.ToggleLinked = function() {
	if(this.linked_cam.classList.contains('pushed')) {
		this.HideLinked();
	} else {
		this.ShowLinked();
	}
};
MediaContainer.prototype.ShowLinked = function() {
	this.LinkedCamListCheckForRelations();

	this.linked_cam.classList.add('pushed');
	this.LinkedCamList.updateCamsByCamsHash(this.cam.relations);
	
	this.LinkedCamListSetSize();
	this.LinkedPanelFringe.classList.add('show');
};
MediaContainer.prototype.HideLinked = function() {
	this.linked_cam.classList.remove('pushed');
	this.LinkedPanelFringe.classList.remove('show');
};
MediaContainer.prototype.LinkedCamListSetSize = function() {
	var maxH = this.PlayContainer.offsetHeight - 2;
	this.LinkedCamList.maxH(maxH);
	this.LinkedCamList.checkForScroll();
	this.LinkedCamListHeight(this.LinkedCamList.containerH());
	this.LinkedCamListPos();
};
MediaContainer.prototype.LinkedCamListHeight = function(camListH) {
	this.LinkedPanelFringe.style.height = camListH + 2 + 'px';
};
MediaContainer.prototype.LinkedCamListPos = function() {
	this.LinkedPanelFringe.style.top = this.PlayContainer.offsetHeight + this.PlayContainer.offsetTop - this.LinkedPanelFringe.offsetHeight + 'px';
};
MediaContainer.prototype.LinkedCamListCheckForRelations = function() {
	if (Utils.isObjectEmpty(this.cam.relations)){
		this.archive_cam.style.right = '100px';
		this.linked_cam.style.display = 'none';
	} else {
		this.linked_cam.style.display = 'block';
		this.archive_cam.style.right = '133px';
	}
};
MediaContainer.prototype.addLinkedCam = function(cam) {
	this.cam.relations[cam.id] = cam;
};



/**
 * MATRIX
 */
var MatrixVM;
function MakeMatrixVM() {
	MatrixVM = {
		// Data
		allowed: ko.computed({
			read: function(){
				return GlobalParamsVM.USE_PRESET_OPTION();
			},
			owner: MatrixVM
		}),
		active: ko.observable(true),
		mcs: ko.observableArray([]),
		mcsMax: ko.observableArray([]),
		
		maxSize: ko.computed({
			read: function(){
				return {w: GlobalParamsVM.Width()-(SearchInVM.open() ? 362 : 0), h:GlobalParamsVM.Height()};
			},
			owner: MatrixVM
		}).extend({ throttle: 500 }),
		
		checkForActive: function(newVal){
			if (!newVal){
				this.delmcAll();
			}
		},
		
		// Behaviors
		toggleActive: function(){
			var newBool = !this.active();
			this.active(newBool);
		},
		addmc: function(mc){
			this.mcs.push(mc);
		},
		addmcMax: function(mc){
			this.mcsMax.push(mc);
		},
		delmc: function(mc){
			this.mcs.remove(mc);
			this.delmcMax(mc);
		},
		delmcAll: function(){
			var mcs = this.mcs();
			this.mcs([]);
			for (var m=0, mlen=mcs.length; m<mlen; m++){
				mcs[m].addToMatrix(true);
			}
			mcs = m = null;
		},
		delmcMax: function(mc){
			this.mcsMax.remove(mc);
		}
	};
	MatrixVM.allowed.subscribe(MatrixVM.checkForActive.neoBind(MatrixVM));
	MatrixVM.active.subscribe(MatrixVM.checkForActive.neoBind(MatrixVM));
	MatrixVM.repos = ko.computed({
		read: function() {
			var mcs = this.mcs(),
				mcsMax = this.mcsMax(),
				maxLength = mcsMax.length,
				minLength = mcs.length - maxLength,
				maxW = this.maxSize().w,
				maxH = this.maxSize().h,
				wWrapper = 4+2,	hWrapper = 4+2,
				smallWrap = wWrapper + 14,
				largeWrap = wWrapper + 14,
				smallCellW = 200,
				smallOffsetBottom = 0,
				smallLines = 0;
				
			//Генерируем нижние полосы маленьких пресетов
			if (minLength > 0){
				var smallW = smallCellW*minLength;
				if (smallW > maxW){
					smallW = Math.floor(maxW/smallCellW)*smallCellW;
				}
				var smallOffsetLeft = (maxW-smallW)/2,
					smallCols = smallW/smallCellW,
					smallLine;
				smallLines = Math.ceil((smallCellW*minLength)/smallW)
				for (var m=0, mlen=mcs.length, smallM=0; m<mlen; m++){
					mc = mcs[m];
					if (mc.inMatrixMax) continue;
					smallLine = Math.floor(smallM/smallCols);
					mc.repos(null, null, smallOffsetLeft+10+(smallM-smallCols*smallLine)*smallCellW, maxH-smallOffsetBottom-(162*(smallLine+1)));
					smallM++;
				}
			}
			
			//Генерируем большие пресеты
			if (maxLength > 0){
				var largeMaxH = maxH - smallOffsetBottom - 162*smallLines - 14,
					largeW = 0,
					largeCellW = maxW/maxLength - largeWrap*maxLength;
					largeBigestH = 0;
				for (var m=0; m<maxLength; m++){
					mc = mcsMax[m];
					mc.resize(largeCellW+1, largeMaxH-largeWrap+1, true, largeCellW, largeMaxH-largeWrap);
					largeW += mc.Width;
					largeBigestH = Math.max(largeBigestH, mc.Height);
				}
				var largeOffsetLeft = (maxW - largeW - largeWrap*(maxLength))/2 + largeWrap/2,
				    largeOffsetTop = largeMaxH - largeBigestH - 13;
				for (var m=0; m<maxLength; m++){
					mc = mcsMax[m];
					mc.repos(null, null, largeOffsetLeft, largeOffsetTop);
					largeOffsetLeft += mc.Width + largeWrap;
				}
				
			}
			
			mcs = mcsMax = m = mlen = null;
			return true;
		},
		write: function (value) {
        },
		owner: MatrixVM
	})/*.extend({ throttle: 10 })*/;

	//ko.applyBindings(MatrixVM, document.getElementById('cam_layer'));
}


var Players = {};
/**
 * Player.
 * @interface
 */
function Player(){}
Player.prototype.init = function() {};
Player.prototype.play = function() {};
Player.prototype.pause = function() {};
Player.prototype.stop = function() {};

/**
 * @constructor
 * @implements {Player}
 */
Players.JW = function (container) {
	this.instance = null;
	this.init(container);
};
Players.JW.prototype.init = function() {
	//STB.helper.register(ADB);
	params = {
		bgcolor:"#000000",
		allowFullScreen:"true",
		allowScriptAccess:"always",
		wmode:"opaque"
	};
	attributes = {id:"player", name:"player"};
	flashvars = {

		file: file,
		streamer: streamer,
		bufferlength: Server.flashPlayer.bufferLength,
		autostart: true/*,
		image: snapshot*/
	};
	swf = "jw-5.8/player.swf";
	swfobject.embedSWF(swf, "player", ""+w, ""+h,
					   "10.0.0", false, flashvars, params, attributes, this.flashLoaded);	
};

Players.JW.prototype.flashLoad = function(e) {
	//e.ref is a reference to the Flash object. We'll pass it to jwplayer() so the API knows where the player is.
	this.instance = jwplayer(e.ref);
	
	
 // Add event listeners
 //jwplayer(e.ref).onReady(function() { alert('Player is ready'); });
 //jwplayer(e.ref).onPlay(function() { alert('Player is playing'); });

 // Interact with the player
 //jwplayer(e.ref).play();
};

Players.JW.prototype.play = function() {
	this.instance.play();
};
Players.JW.prototype.pause = function() {
	this.instance.pause();
};
Players.JW.prototype.stop = function() {
	this.instance.stop();
};
Players.JW.prototype.seek = function(position) {
	this.instance.seek(position);
};

