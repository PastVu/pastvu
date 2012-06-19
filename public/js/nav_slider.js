define(['jquery', 'Utils', 'EventTypes'], function ($, Utils, ET) {
	function navigationSlider(slider, map){
		this.map = map;
		this.DOMPanel = slider;
		this.DOMSliderInner = $('<div/>',  {'class': 'inner_bord'})[0];
		this.DOMSlider = $('<div/>',  {'id':'nav_slider', 'class': 'fringe'}).append(this.DOMSliderInner)[0];
		this.DOMPanel.appendChild(this.DOMSlider);
		
		Utils.Event.add(this.DOMPanel, 'mousewheel', this.OnWheel.neoBind(this), false);
		Utils.Event.add(this.DOMPanel, 'DOMMouseScroll', this.OnWheel.neoBind(this), false);
		
		this.DomDashsArray = [];
		
		this.map.on('zoomend', this.onChangeZoom, this);
		
		this.DOMh = 12;
		this.offset = 0;
		this.usefulH = 171;
		this.sliderOnZoom = 0;
		
		this.SnatchBind = this.Snatch.neoBind(this);
		this.SnatchOffBind = this.SnatchOff.neoBind(this);
		this.SnatchOffByWindowOutBind = this.SnatchOffByWindowOut.neoBind(this);
		this.dashOverBind = this.dashOver.neoBind(this);
		this.dashClickBind = this.dashClick.neoBind(this);
		
		this.zoomChangeTimeout = null;
		
		Utils.Event.add(this.DOMPanel, ET.mdown, this.SnatchBind, false);
		
		//if(Browser.support.touch) Utils.Event.add(this.DOMPanel, 'touchstart', this.SnatchBind, false);
		
		this.recalcZooms();
	}
	navigationSlider.prototype.recalcZooms = function(){
		this.numZooms = this.map.getMaxZoom() - this.map.getMinZoom() + 1;
		this.step = this.usefulH/this.numZooms;

		for(var z=this.numZooms-1; z>=0; z--){
			this.DomDashsArray[z] = document.createElement('div');
			this.DomDashsArray[z].id = 'd'+z;
			this.DomDashsArray[z].style.height = this.step+'px';
			this.DomDashsArray[z].classList.add('dash');
			this.DOMPanel.insertBefore(this.DomDashsArray[z], this.DOMSlider);
			Utils.Event.add(this.DomDashsArray[z], 'click', this.dashClick.neoBind(this, [z]), true);
		}
		
		this.sliderOnZoom = this.map.getZoom();
		this.pos();
	};
	navigationSlider.prototype.dashClick = function(event, zoom){
		window.clearTimeout(this.zoomChangeTimeout);
		this.map.setZoom(zoom);
	};
	navigationSlider.prototype.dashOver = function(obj){
		window.clearTimeout(this.zoomChangeTimeout);
		var newZoom = Number(obj.target.id.substr(1));
		this.sliderOnZoom = newZoom;
		this.zoomChangeTimeout = window.setTimeout(function(){
			this.map.setZoom(newZoom);
		}, 750);
		this.pos();
	};
	navigationSlider.prototype.onChangeZoom = function(obj){
		this.sliderOnZoom = this.map.getZoom();
		this.pos();
	};
	navigationSlider.prototype.pos = function(){
		this.DOMSlider.style.bottom = this.step*this.sliderOnZoom-this.offset + 'px';
		this.DOMSliderInner.innerHTML = this.sliderOnZoom;
	};
	navigationSlider.prototype.Snatch = function(e){
		for(var z=0; z<this.numZooms; z++){
			Utils.Event.add(this.DomDashsArray[z], 'mouseover', this.dashOverBind, false);
			/*if(Browser.support.touch){
				Utils.Event.add(this.DomDashsArray[z], 'touchmove', function(){alert(9)}, false);
			}*/
		}
		Utils.Event.add(document.body, ET.mup, this.SnatchOffBind, false);
		Utils.Event.add(document.body, 'mouseout', this.SnatchOffByWindowOutBind, false);
		this.DOMPanel.classList.add('sliding');
		
		/*if(Browser.support.touch){
			Utils.Event.add(this.DOMPanel, 'touchmove', this.SnatchTouchMoveBind, false);
			Utils.Event.add(document.body, 'touchend', this.SnatchOffBind, false);
		}*/
		if(e.stopPropagation) e.stopPropagation();
		if(e.preventDefault) e.preventDefault();
		return false;
	};
	navigationSlider.prototype.SnatchOff = function(evt){
		this.DOMPanel.classList.remove('sliding');
		Utils.Event.remove(document.body, ET.mup, this.SnatchOffBind, false);
		Utils.Event.remove(document.body, 'mouseout', this.SnatchOffByWindowOutBind, false);
		for(var z=0; z<this.numZooms; z++){
			Utils.Event.remove(this.DomDashsArray[z], 'mouseover', this.dashOverBind, false);
		}
		/*if(Browser.support.touch){
			Utils.Event.remove(this.DOMPanel, 'touchmove', this.SnatchTouchMoveBind, false);
			Utils.Event.remove(document.body, 'touchend', this.SnatchOffBind, false);
		}*/
	};
	navigationSlider.prototype.SnatchOffByWindowOut = function(evt){
		var pos = mousePageXY(evt);
		
		if(pos.x<=0 || pos.x>=Utils.getClientWidth() ||
		   pos.y<=0 || pos.y>=Utils.getClientHeight()){
		   this.SnatchOff(evt);
		}
		pos = null;
	};
	navigationSlider.prototype.OnWheel = function (e){
		var dir, newZoom;
		if (e.type=='DOMMouseScroll') dir = -1*e.detail;
		else dir = e.wheelDelta;
		if (dir>0) dir = 'up';
		else dir = 'down';
		
		newZoom = Math.max(0, Math.min(this.sliderOnZoom + (dir == 'up' ? 1 : -1), 18));
		if (newZoom == this.sliderOnZoom) return false;
		
		window.clearTimeout(this.zoomChangeTimeout);
		this.sliderOnZoom = newZoom;
		this.zoomChangeTimeout = window.setTimeout(function(){
			this.map.setZoom(newZoom);
		}, 750);
		this.pos();
		return false;
	};
	navigationSlider.prototype.togglePin = function(){
		document.querySelector('#nav_panel').classList.toggle('pin');
	};
	
	return navigationSlider;
});