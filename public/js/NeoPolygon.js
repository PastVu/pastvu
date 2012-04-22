function FieldPoints(x,y,type,color, GLc, Sina, Cosa, xDirection, yDirection, angle, xTrackDirectionDelta, yTrackDirectionDelta){
	this.x = x;
	this.y = y;
	this.borderType = type;
	this.borderColor = color;
	this.GLc = GLc;
	this.Sina = Sina;
	this.Cosa = Cosa;
	this.xDirection = xDirection;
	this.yDirection = yDirection;
	this.angle = angle;
	this.xTrackDirectionDelta = xTrackDirectionDelta;
	this.yTrackDirectionDelta = yTrackDirectionDelta;
}
function Area(field, area){
	this._proto_ = field;
	this.points = area;
	this.visibleNow = true;
	
	this.BoundFull;
	this.BoundVisible;
	
	this.PivotPointsOfTrack = new Array();
	this.DashPointsOfTrack = new Array();
}
Area.prototype.reduceInsiders = function(previousValue, currentValue, index, array){  
	return previousValue + Number(currentValue.inside);  
};
Area.prototype.pointsAudit = function(){
	delete this.VisibleVertexSubarea;
	this.VisibleVertexSubarea = new Array();
	this.VVTMP = new Array();
	this.visibleNow = false;
	
	//Если текущий отрезок меньше заданной погрешности, отбрасываем его
	this.VVTMP.push({point:this.points[0], inside: false, entrance: false, onborder: false});
	
	//Используем Simplify.js или getLonLatDistance
	var simplified = simplify(this.points, FieldUnimportantDelta)
	for(var u=1;u<simplified.length;u++){
		this.VVTMP.push({point:simplified[u], inside: false, entrance: false, onborder: false});
	}
	simplified = null;
	/*for(var u=1;u<this.points.length;u++){
		if (getLonLatDistance(this.VVTMP[this.VVTMP.length-1].point, this.points[u]) <= FieldUnimportantDelta) continue;
		this.VVTMP.push({point:this.points[u], inside: false, entrance: false, onborder: false});
	}*/
	//console.log(this.VVTMP.length)
	
	//Проверяем что данная Area вообще касается сцены
	if(!CalcBound.intersects(this.BoundFull)){
		return;
	}
	
	
	/**
	 * Реализация Weiler–Atherton clipping algorithm
	 */
	//Переменная для содержания результатов пересечания
	var ItersectResult;
	//Копия упорядоченного объекта, содержащего упорядоченные точки краев сцены. Копия сделана для того чтобы каждая Area могла вставлять в него результаты пересечений с полигоном
	var CalcBoundPointsCopy = {left:[], top:[], right:[], bottom:[]}, indexesOfEntrance = [];
	for (var cp=0; cp<CalcBoundPoints.left.length; cp++) CalcBoundPointsCopy.left.push(CalcBoundPoints.left[cp]);
	for (var cp=0; cp<CalcBoundPoints.top.length; cp++) CalcBoundPointsCopy.top.push(CalcBoundPoints.top[cp]);
	for (var cp=0; cp<CalcBoundPoints.right.length; cp++) CalcBoundPointsCopy.right.push(CalcBoundPoints.right[cp]);
	for (var cp=0; cp<CalcBoundPoints.bottom.length; cp++) CalcBoundPointsCopy.bottom.push(CalcBoundPoints.bottom[cp]);
	try{
	
	for (var Point=0; Point<this.VVTMP.length; Point++){
		if(CalcBound.contains(this.VVTMP[Point].point)){
			this.VVTMP[Point].inside = true;
		
			if(Point>0 && !this.VVTMP[Point-1].inside){
				ItersectResult = this._proto_.LineBoundItersect(CalcBound, this.VVTMP[Point-1].point.lng, this.VVTMP[Point].point.lng, this.VVTMP[Point-1].point.lat, this.VVTMP[Point].point.lat);
				if(ItersectResult.length==1) {
					indexesOfEntrance.push(Point);
					this.VVTMP.splice(Point, 0, {point:ItersectResult[0], inside: true, entrance: true, onborder: true});
					CalcBoundPointsInsertIntersect(ItersectResult[0], CalcBoundPointsCopy);
					Point++;
				}
			}
		}else if(Point>0){
			ItersectResult = this._proto_.LineBoundItersect(CalcBound,this.VVTMP[Point-1].point.lng,this.VVTMP[Point].point.lng,this.VVTMP[Point-1].point.lat,this.VVTMP[Point].point.lat);
			if(ItersectResult.length==1){
				this.VVTMP.splice(Point, 0, {point:ItersectResult[0], inside: true, entrance: false, onborder: true});
				CalcBoundPointsInsertIntersect(ItersectResult[0], CalcBoundPointsCopy);
			}else if(ItersectResult.length==2){
				if(Utils.getDistance(this.VVTMP[Point-1].point.lng, ItersectResult[0].lng, this.VVTMP[Point-1].point.lat, ItersectResult[0].lat) <= Utils.getDistance(this.VVTMP[Point-1].point.lng, ItersectResult[1].lng, this.VVTMP[Point-1].point.lat, ItersectResult[1].lat)){
					this.VVTMP.splice(Point, 0, {point:ItersectResult[0], inside: true, entrance: true, onborder: true}); this.VVTMP.splice(Point+1, 0, {point:ItersectResult[1], inside: true, entrance: false, onborder: true});
				}else{
					this.VVTMP.splice(Point, 0, {point:ItersectResult[1], inside: true, entrance: true, onborder: true}); this.VVTMP.splice(Point+1, 0, {point:ItersectResult[0], inside: true, entrance: false, onborder: true});
				}
				indexesOfEntrance.push(Point);
				CalcBoundPointsInsertIntersect(ItersectResult[0], CalcBoundPointsCopy);
				CalcBoundPointsInsertIntersect(ItersectResult[1], CalcBoundPointsCopy);
			}
			Point+=ItersectResult.length;
		}
	}
	
	var insideNumber = this.VVTMP.reduce(this.reduceInsiders,0);
	
	if(insideNumber==this.VVTMP.length){ //Полигон полностью вписывается в сцену
		this.VisibleVertexSubarea.push(this.VVTMP.map(function(val){
			return val.point;
		}));
		
	}else if(insideNumber==0){ //Либо сцена полностью вписывается в полигон, либо полигон не касается сцены
	
		//Проверяем на полное вхождение сцены внутрь полигона, путем проверки вхождения одного из углов сцены в полигон
		if(this.BoundFull.contains(CalcBound) && this.containsLatLng([CalcBoundPoints.left[0]], this.VVTMP)){
			this.VisibleVertexSubarea[0] = new Array();
			for (var c in CalcBoundPoints){
				if(!c || !CalcBoundPoints.hasOwnProperty(c)) continue;
				this.VisibleVertexSubarea[0].push(CalcBoundPoints[c][0]);
			}
			console.log('B ia A');
		}
		
	}else{ //Полигон пересекается со сценой
		var CalcBoundPointsSortedArr = [];
		for (var cp=1; cp<CalcBoundPointsCopy.left.length; cp++) CalcBoundPointsSortedArr.push(CalcBoundPointsCopy.left[cp]);
		for (var cp=1; cp<CalcBoundPointsCopy.top.length; cp++) CalcBoundPointsSortedArr.push(CalcBoundPointsCopy.top[cp]);
		for (var cp=1; cp<CalcBoundPointsCopy.right.length; cp++) CalcBoundPointsSortedArr.push(CalcBoundPointsCopy.right[cp]);
		for (var cp=1; cp<CalcBoundPointsCopy.bottom.length; cp++) CalcBoundPointsSortedArr.push(CalcBoundPointsCopy.bottom[cp]);
		
		
		if(this.VVTMP[0].inside && !this.VVTMP[0].entrance){
			for (var Point=0; Point<this.VVTMP.length; Point++){
				if(this.VVTMP[Point].onborder){
					var shift = this.VVTMP.length-indexesOfEntrance[indexesOfEntrance.length-1];
					var ggg = this.VVTMP.splice(indexesOfEntrance[indexesOfEntrance.length-1], shift+1);
					this.VVTMP = ggg.concat(this.VVTMP); //this.VVTMP = this.VVTMP.concat(this.VVTMP.splice(0,Point+1));
					indexesOfEntrance.pop();
					for (var e=0; e<indexesOfEntrance.length; e++){
						indexesOfEntrance[e] += shift;
					}
					indexesOfEntrance.splice(0,0,0);
					break;
				}
			}
		}
		
		var lastSubareaMainEntrance;
		function Iteration(e, VVTMP){
			var EntranceCurrArr = [VVTMP[indexesOfEntrance[e]].point];
				
			for (var Point=indexesOfEntrance[e]+1; Point<VVTMP.length; Point++){
				EntranceCurrArr.push(VVTMP[Point].point);
				if(VVTMP[Point].onborder){
					var withdrawn = false;
					CalcBoundLoop:
					for (var cp=0; cp<CalcBoundPointsSortedArr.length; cp++){
						if(withdrawn){
							EntranceCurrArr.push(CalcBoundPointsSortedArr[cp]);
							for (var eNext=e+1; eNext<indexesOfEntrance.length; eNext++){
								if(indexesOfEntrance[eNext] && CalcBoundPointsSortedArr[cp].equals(VVTMP[indexesOfEntrance[eNext]].point)){
									EntranceCurrArr = EntranceCurrArr.concat(Iteration(eNext, VVTMP));
									break CalcBoundLoop;
								}
							}
							if(CalcBoundPointsSortedArr[cp].equals(lastSubareaMainEntrance)){
								break;
							}
							if(cp==CalcBoundPointsSortedArr.length-1){
								cp=-1;
							}
						}else if(CalcBoundPointsSortedArr[cp].equals(VVTMP[Point].point)){
							withdrawn = true;
						}
					}
					break;
				}
			}
			indexesOfEntrance.splice(e,1);;
			return EntranceCurrArr;
		}
		
		while(indexesOfEntrance.length>0){
			lastSubareaMainEntrance = this.VVTMP[indexesOfEntrance[0]].point;
			this.VisibleVertexSubarea.push(Iteration(0, this.VVTMP));
		}
	}

	delete this.VVTMP;

	if(this.VisibleVertexSubarea.length>0) this.visibleNow = true;
	
	}catch(e){
		alert(e);
	}
}
Area.prototype.getBound = function(type){
	var coords;
	if(type == 'visible'){
		coords = new Array();
		for(var vvs=0; vvs<this.VisibleVertexSubarea.length; vvs++){
			for(var u=0;u<this.VisibleVertexSubarea[vvs].length;u++){
				coords.push(this.VisibleVertexSubarea[vvs][u]);
			}
		}
	}else{
		coords = this.points;
	}
	
	var bound = new L.LatLngBounds(new L.LatLng(coords[0].lat, coords[0].lng), new L.LatLng(coords[0].lat, coords[0].lng));
	for (var k=0;k<coords.length;k++){
		bound._northEast.lat = Math.max(bound._northEast.lat, coords[k].lat);
		bound._southWest.lat = Math.min(bound._southWest.lat, coords[k].lat);
		
		if ((coords[k].lng>0 && bound._northEast.lng>0 && coords[k].lng>bound._northEast.lng) ||
			(coords[k].lng<0 && bound._northEast.lng>0) ||
			(coords[k].lng<0 && bound._northEast.lng<0 && coords[k].lng>bound._northEast.lng)){bound._northEast.lng = coords[k].lng;}
		
		if ((coords[k].lng>0 && bound._southWest.lng>0 && coords[k].lng<bound._southWest.lng) ||
			(coords[k].lng>0 && bound._southWest.lng<0) ||
			(coords[k].lng<0 && bound._southWest.lng<0 && coords[k].lng<bound._northEast.lng)){bound._southWest.lng = coords[k].lng;}		
	}
	
	if (type == 'visible') this.BoundVisible = bound;
	else if (type == 'all') this.BoundFull = bound;
	coords = null;
	return bound;
};

Area.prototype.draw = function(){
	for(var vvs=0; vvs<this.VisibleVertexSubarea.length; vvs++){
		this.drawVisibleVertex(this.VisibleVertexSubarea[vvs]);
	}
}

Area.prototype.drawVisibleVertex = function(VisibleVertex){
	this.TrackInitValues();
	var context = this._proto_.canvas.getContext('2d');
	var xPrevPoin,yPrevPoin,xPoint,yPoint,
		GLa,GLb,GLc,Sina,Cosa,angle,
		xDirection,yDirection,xTrackDirectionDelta,yTrackDirectionDelta,
		xTrackCurrPoint,yTrackCurrPoint,
		x11,x12,x21,x22,y11,y12,y21,y22,A1,B1,C1,A2,B2,C2,InterX,InterY,
		SegCorr,left_dist,CURc,xCurrPoint,yCurrPoint,CurDash, CurEmpty;
	
	for(var u=0;u<VisibleVertex.length;u++){
		xPoint = this._proto_.map.latLngToContainerPoint(VisibleVertex[u]).x - this._proto_.TopLeftCanvas.x;
		yPoint = this._proto_.map.latLngToContainerPoint(VisibleVertex[u]).y - this._proto_.TopLeftCanvas.y;
		if (u==0){
			this.PivotPointsOfTrack.push(new FieldPoints(xPoint,yPoint, 'moveTo'));	
			if (this._proto_.borderType=="dashed"){
				this.DashPointsOfTrack.push(new FieldPoints(xPoint,yPoint, 'moveTo'));
			}
			xPrevPoin = xPoint; yPrevPoin = yPoint; continue;
		}
		GLa = yPrevPoin - yPoint; // adjacent cathetus
		GLb = xPrevPoin - xPoint; // opposite cathetus
		GLc = Math.sqrt(Math.pow(GLa,2) + Math.pow(GLb,2)); 	// hypotenuse
		Sina = Math.abs(GLb/GLc); //angle: Math.asin(Sina)*180/Math.PI
		Cosa = Math.abs(GLa/GLc); 
		if (xPoint>xPrevPoin) xDirection = 1; else xDirection = -1;
		if (yPoint>yPrevPoin) yDirection = 1; else yDirection = -1;
		if (xPoint==xPrevPoin){xDirection = 0;}
		if (yPoint==yPrevPoin){yDirection = 0;}
		xTrackDirectionDelta=1; yTrackDirectionDelta=1;	
			  if (xDirection > 0 && yDirection>0){xTrackDirectionDelta = -1; yTrackDirectionDelta = 1;
		}else if (xDirection > 0 && yDirection<0){xTrackDirectionDelta = 1; yTrackDirectionDelta = 1;
		}else if (xDirection < 0 && yDirection<0){xTrackDirectionDelta = 1; yTrackDirectionDelta = -1;
		}else if (xDirection < 0 && yDirection>0){xTrackDirectionDelta = -1; yTrackDirectionDelta = -1;}
		if (yDirection == 0){
			xTrackDirectionDelta=0;
			if(xDirection<0){yTrackDirectionDelta = -1;}
		}
		if (xDirection == 0){
			yTrackDirectionDelta=0;
			if(yDirection>0){xTrackDirectionDelta = -1;}
		}
		angle = 0;
		if (xDirection<0 && yDirection<0) {
			angle = Math.PI + Math.PI/2 - Math.asin(Sina);}
		if (xDirection>0 && yDirection<0) {
			angle = Math.asin(Sina) - Math.PI/2; }
		if (xDirection>0 && yDirection>0) {
			angle = 2*Math.PI + Math.PI/2 - Math.asin(Sina);}
		if (xDirection<0 && yDirection>0) {
			angle = Math.asin(Sina) + Math.PI/2;}
		if (yDirection == 0){
			if(xDirection>0){angle = 0;}
			else{angle = Math.PI;}
		}
		if (xDirection == 0){
			if(yDirection>0){angle = Math.PI/2;}
			else{angle = -Math.PI/2;}
		}	
		
		xTrackCurrPoint = xPoint; yTrackCurrPoint = yPoint;	
		var LType = (u==0 ? 'moveTo': 'lineTo');
		var TrGLc = Math.sqrt(Math.pow(this.PivotPointsOfTrack[this.PivotPointsOfTrack.length-1].x - xTrackCurrPoint,2)+
							  Math.pow(this.PivotPointsOfTrack[this.PivotPointsOfTrack.length-1].y - yTrackCurrPoint,2));
		this.PivotPointsOfTrack[this.PivotPointsOfTrack.length]	= new FieldPoints(xTrackCurrPoint, yTrackCurrPoint, LType, this._proto_.borderColor, TrGLc, Sina, Cosa,xDirection, yDirection, angle, xTrackDirectionDelta, yTrackDirectionDelta);
		if (this._proto_.borderType=='solid'){						
		}else if (this._proto_.borderType=='dashed'){
			VisibleVertex.length==1 ? SegCorr=0 : SegCorr=1;
			while(SegCorr>=0){
			with (this.PivotPointsOfTrack[this.PivotPointsOfTrack.length-1-SegCorr]){
				if (type=='moveTo'){
					this.DashPointsOfTrack[this.DashPointsOfTrack.length] = new FieldPoints(x,y, 'moveTo', this.CURdash_color, GLc, Sina, Cosa,xDirection, yDirection, angle);
					if (u<VisibleVertex.length-1) {break;}else{SegCorr--;continue;}									
				}
				
				left_dist = GLc; CURc = 0;																		
				xCurrPoint = this.PivotPointsOfTrack[this.PivotPointsOfTrack.length-2-SegCorr].x, 
				yCurrPoint = this.PivotPointsOfTrack[this.PivotPointsOfTrack.length-2-SegCorr].y;
				while (left_dist>0){
				CurDash=0; CurEmpty=0;
				if(this.Empty_RemainOnNext==0){
					this.CURdash_color = this._proto_.dashcolors_[this.CURdash_pos];
					if (this.Dash_RemainOnNext>0){
						CurDash = this.Dash_RemainOnNext; this.Dash_RemainOnNext = 0;							
					}else{
						CurDash = this._proto_.dasharray_[this.CURdash_pos];																
					}
					if (left_dist-CurDash>=0){
						CURc = CurDash; 
						this.CURdash_pos++; 
						if(this.CURdash_pos>=this._proto_.dasharray_.length){this.CURdash_pos = 0;}
					}else{CURc = left_dist; this.Dash_RemainOnNext = CurDash - left_dist;}							
					left_dist -= CURc;
					xCurrPoint += CURc*Sina*xDirection;
					yCurrPoint += CURc*Cosa*yDirection;
					this.DashPointsOfTrack[this.DashPointsOfTrack.length] = new FieldPoints(xCurrPoint, yCurrPoint, 'lineTo', this.CURdash_color, CURc, Sina, Cosa, xDirection, yDirection, angle);
					if(this._proto_.dashoffset==0 && left_dist>0){
						this.DashPointsOfTrack[this.DashPointsOfTrack.length] = new FieldPoints(xCurrPoint, yCurrPoint, 'moveTo', this.CURdash_color, CURc, Sina, Cosa, xDirection, yDirection, angle);
						continue;
					}							
				}
				if(left_dist==0){continue;}
					if (this.Empty_RemainOnNext>0){
						CurEmpty = this.Empty_RemainOnNext; this.Empty_RemainOnNext = 0;
					}else{ CurEmpty = this._proto_.dashoffset;}
					if (left_dist-CurEmpty>0){CURc = CurEmpty;}else{CURc = left_dist; this.Empty_RemainOnNext = CurEmpty - left_dist;}
					left_dist -= CURc;						
					xCurrPoint += CURc*Sina*xDirection;
					yCurrPoint += CURc*Cosa*yDirection;
					this.DashPointsOfTrack[this.DashPointsOfTrack.length] = new FieldPoints(xCurrPoint, yCurrPoint, 'moveTo', this.CURdash_color, CURc, Sina, Cosa,xDirection, yDirection, angle);
				}
			}
			if(u<VisibleVertex.length-1){break;}else{SegCorr--;}
			}
		}
		xPrevPoin = xPoint; yPrevPoin = yPoint;
	}
	
	var SignRealWidth, TextPos, FullWordTruncated, SignaturX, SignaturY, ShiftX, ShiftY, CurrSignature, Segment;
	try{
	
	
	/*if (this._proto_.doShadow){
		context.shadowColor = '#4B7DB8';
		context.shadowOffsetX = 4;
		context.shadowOffsetY = 3;
		context.shadowBlur = 7;
		var hsl, rgb;
	}*/
	
	//Создаём область
	context.beginPath();
	for (Segment=0; Segment<this.PivotPointsOfTrack.length; Segment++){
		if (this.PivotPointsOfTrack[Segment].borderType=='moveTo')context.moveTo(this.PivotPointsOfTrack[Segment].x, this.PivotPointsOfTrack[Segment].y);	
		else context.lineTo(this.PivotPointsOfTrack[Segment].x, this.PivotPointsOfTrack[Segment].y);	
	}
	
	 //Заливаем область
	context.save();
	context.globalAlpha = this._proto_.opacity; if(this._proto_.doShadow){context.globalAlpha = Math.min(this._proto_.opacity+0.2, 1);}
	if (this.CrossCountry){
		this.gradient = context.createLinearGradient(0, 0, 0, this._proto_.ContentHeight);
		var WBase = this._proto_.CrossWidth/this._proto_.ContentHeight, OBase = this._proto_.CrossOffset/this._proto_.ContentHeight;
		for (var i=0; i<=1-WBase; i+=WBase+OBase){
			this.gradient.addColorStop(i, 'transparent');
			this.gradient.addColorStop(i, this._proto_.color);
			this.gradient.addColorStop(i + WBase, this._proto_.color);
			this.gradient.addColorStop(i + WBase, 'transparent');
		}
		WBase = null; OBase = null;
		context.fillStyle = this.gradient;
		if(this._proto_.CrossAngle!=0){
			if (this._proto_.CrossAngle>0)context.translate(this._proto_.ContentWidth,0); //else context.translate(-this._proto_.ContentWidth/2,this._proto_.ContentHeight/2);
			context.rotate(this._proto_.CrossAngle);
		}
	}else{
		context.fillStyle = this._proto_.color;
	}
	context.fill();
	context.restore();
	
	//Обводим область
	context.lineJoin = 'round';
	context.lineCap = 'butt';
	context.lineWidth = ''+this._proto_.borderWeight;
	context.globalAlpha = this._proto_.borderOpacity;
	if (this._proto_.borderType=='solid' && this._proto_.borderWeight>0){
		context.strokeStyle = ''+this._proto_.borderColor;
		if (this._proto_.doShadow){
			hsl = Utils.rgb2hsl((context.strokeStyle).substring(1,7)); hsl.l = Math.min(hsl.l+0.2, 1); hsl.s += Math.min(hsl.s+0.2, 1);
			rgb = Utils.hslToRgb(hsl.h, hsl.s, hsl.l);
			context.strokeStyle = 'rgb('+Math.round(rgb.r)+', '+Math.round(rgb.g)+', '+Math.round(rgb.b)+')';
		}
		context.stroke();
	}else if (this._proto_.borderType=='dashed' && this._proto_.borderWeight>0){
		context.beginPath(); context.strokeStyle = ''+this.DashPointsOfTrack[1].borderColor;	
		context.moveTo(this.DashPointsOfTrack[0].x, this.DashPointsOfTrack[0].y);
		for (Segment=1; Segment<this.DashPointsOfTrack.length-1; Segment++){									 
			if (this.DashPointsOfTrack[Segment].type=='moveTo'){
				context.stroke(); context.closePath();
				context.beginPath(); context.strokeStyle = ''+this._proto_.borderColor;
				if (this._proto_.doShadow){
					hsl = Utils.rgb2hsl((context.strokeStyle).substring(1,7)); hsl.l = Math.min(hsl.l+0.2, 1); hsl.s += Math.min(hsl.s+0.2, 1);
					rgb = Utils.hslToRgb(hsl.h, hsl.s, hsl.l);
					context.strokeStyle = 'rgb('+Math.round(rgb.r)+', '+Math.round(rgb.g)+', '+Math.round(rgb.b)+')';
				}
				context.moveTo(this.DashPointsOfTrack[Segment].x, this.DashPointsOfTrack[Segment].y);
			}else{
				context.lineTo(this.DashPointsOfTrack[Segment].x, this.DashPointsOfTrack[Segment].y);
			}
		}
		context.stroke();context.closePath();			
	}
	}catch(e){console.log(e)} 
};

Area.prototype.TrackInitValues = function(){
	if (this.borderType=='dashed'){
	  try{for (var pa=0;pa<this.DashPointsOfTrack.length; pa++){delete this.DashPointsOfTrack[pa];}}catch(e){}
	  delete this.DashPointsOfTrack;
	  this.DashPointsOfTrack = new Array();
	}
	try{for (var pa=0;pa<this.PivotPointsOfTrack.length; pa++){delete this.PivotPointsOfTrack[pa];}}catch(e){}
	delete this.PivotPointsOfTrack;
	this.PivotPointsOfTrack = new Array(); 	  
	this.CURdash_pos = 0;
	this.CURdash_color = '#fff';		
	this.Dash_RemainOnNext = 0;
	this.Empty_RemainOnNext = 0;
};

Area.prototype.getSquare = function(){
  if (this.PivotPointsOfTrack==null || this.PivotPointsOfTrack.length<3)return 0;
  var S=0;
  for (var i=0; i<this.PivotPointsOfTrack.length-1;i++) S+=0.5*(this.PivotPointsOfTrack[i].x+this.PivotPointsOfTrack[i+1].x)*(this.PivotPointsOfTrack[i+1].y-this.PivotPointsOfTrack[i].y);
  //return Math.abs(S);
  return S;
}

Area.prototype.getLonLatSquare = function(){
  if (this.points==null || this.points.length<3) return 0;
  var S=0;
  for (var i=0; i<this.points.length-1;i++) S+=0.5*(this.points[i].lng+this.points[i+1].lng)*(this.points[i+1].lat-this.points[i].lat);
  //return Math.abs(S);
  return S;
};

Area.prototype.containsLatLng = function(latlngArr, PoligonArr){
	var lls = new Array(), ll;
	for (ll=0; ll<latlngArr.length; ll++){
		lls.push({c1:latlngArr[ll], c2:new L.LatLng(latlngArr[ll].lat, this._proto_.map.getBounds()._northEast.lng+1), cross:0}); //Прибавляем 1 к правой координате чтобы избежать ошибки округления
	}
	
	var poly = PoligonArr || this.points;
	if(poly[0].point){
		for (var p=1, plen=poly.length; p<plen; p++){
			for (ll=0; ll<lls.length; ll++){
				var res = this._proto_.LinesItersect(lls[ll].c1.lng, lls[ll].c2.lng, lls[ll].c1.lat, lls[ll].c2.lat, poly[p-1].point.lng, poly[p].point.lng, poly[p-1].point.lat, poly[p].point.lat);
				if(res){
					lls[ll].cross++;
				}
			}
		}
	}else{
		for (var p=1, plen=poly.length; p<plen; p++){
			for (ll=0; ll<lls.length; ll++){
				var res = this._proto_.LinesItersect(lls[ll].c1.lng, lls[ll].c2.lng, lls[ll].c1.lat, lls[ll].c2.lat, poly[p-1].lng, poly[p].lng, poly[p-1].lat, poly[p].lat);
				if(res){
					lls[ll].cross++;
				}
			}
		}
	}
	
	for (ll=0; ll<lls.length; ll++){
		if(lls[ll].cross % 2 == 0) return false;
	}
	
	return true;
};

Area.prototype.containsLatLngOld = function(latlng){
	if (this.PivotPointsOfTrack==null || this.PivotPointsOfTrack.length<3)return false;
	var j = this.PivotPointsOfTrack.length - 1, c = 0, Point = this._proto_.map.latLngToContainerPoint(latlng);
	if (Point.x>=this.TopLeftCanvas.x+this.CanvasAmendment && Point.x<=this.BottomRightCanvas.x-this.CanvasAmendment &&
		Point.y>=this.TopLeftCanvas.y+this.CanvasAmendment && Point.y<=this.BottomRightCanvas.y-this.CanvasAmendment){
		Point.x -=  this.TopLeftCanvas.x; Point.y -=  this.TopLeftCanvas.y;
		for (var i=0; i<this.PivotPointsOfTrack.length; i++){
			if(
			   ((this.PivotPointsOfTrack[i].y<=Point.y && Point.y<this.PivotPointsOfTrack[j].y) ||
				(this.PivotPointsOfTrack[j].y<=Point.y && Point.y<this.PivotPointsOfTrack[i].y))&&
			   Point.x>
			   (this.PivotPointsOfTrack[j].x-this.PivotPointsOfTrack[i].x)*(Point.y-this.PivotPointsOfTrack[i].y)/(this.PivotPointsOfTrack[j].y-this.PivotPointsOfTrack[i].y)+this.PivotPointsOfTrack[i].x){
				c = !c
			}
			j = i;
		}
	}
	Point = null; j = null;
	return c;
};



//Определяем неразличимую разницу в координатах при текущем масштабе
var FieldUnimportantDelta = 0;
var ZoomForFieldUnimportantDelta = 10;
var OrigBound, CalcBound, CalcBoundPoints;
function CulcBoundOnMove(force){
	if (force || !CalcBound || !CalcBound.contains(map.getBounds())){
		OrigBound = map.getBounds();
		CalcBound = OrigBound.pad(0.5);
		var sW = CalcBound._southWest, nE = CalcBound._northEast;
		CalcBoundPoints = {
			left: [
				new L.LatLng(sW.lat, sW.lng),
				new L.LatLng(nE.lat, sW.lng)
			],
			top: [
				new L.LatLng(nE.lat, sW.lng),
				new L.LatLng(nE.lat, nE.lng)
			],
			right: [
				new L.LatLng(nE.lat, nE.lng),
				new L.LatLng(sW.lat, nE.lng)
			],
			bottom: [
				new L.LatLng(sW.lat, nE.lng),
				new L.LatLng(sW.lat, sW.lng)
			]
		};
		sW = nE = null;
		return true;
	}else {return false;}
}
function CalcBoundPointsInsertIntersect(latlng, CalcBoundPointsCopy){
	var BoundPoints = CalcBoundPointsCopy || CalcBoundPoints;
	
	if(latlng.lng == CalcBound._southWest.lng){
		for (var CBPC=1; CBPC<BoundPoints.left.length; CBPC++){
			if(BoundPoints.left[CBPC-1].lat< latlng.lat &&  latlng.lat< BoundPoints.left[CBPC].lat){
				BoundPoints.left.splice(CBPC, 0, latlng); return BoundPoints;
			}
		}
	}
	
	if(latlng.lng == CalcBound._northEast.lng){
		for (var CBPC=1; CBPC<BoundPoints.right.length; CBPC++){
			if(BoundPoints.right[CBPC].lat< latlng.lat &&  latlng.lat< BoundPoints.right[CBPC-1].lat){
				BoundPoints.right.splice(CBPC, 0, latlng); return BoundPoints;
			}
		}
	}
	
	if(latlng.lat == CalcBound._northEast.lat){
		for (var CBPC=1; CBPC<BoundPoints.top.length; CBPC++){
			if(BoundPoints.top[CBPC-1].lng< latlng.lng &&  latlng.lng< BoundPoints.top[CBPC].lng){
				BoundPoints.top.splice(CBPC, 0, latlng); return BoundPoints;
			}
		}
	}
	
	if(latlng.lat == CalcBound._southWest.lat){
		for (var CBPC=1; CBPC<BoundPoints.bottom.length; CBPC++){
			if(BoundPoints.bottom[CBPC].lng< latlng.lng &&  latlng.lng< BoundPoints.bottom[CBPC-1].lng){
				BoundPoints.bottom.splice(CBPC, 0, latlng); return BoundPoints;
			}
		}
	}
}
function getLonLatDistance (c1, c2){
	return Math.sqrt( Math.pow(c1.lng-c2.lng,2) + Math.pow(c1.lat-c2.lat,2) );
}


L.NeoField = L.Class.extend({

		isNeoField : true,
		points:null,
		id:null,
		map:null,
		canvas:null,
		
		initialize: function(points, options){
			//~~~~~~~~~~~~~~~~
			//Field Params	
			this.isNeoField = true;
			this.points = points;
			this.id = options.id;
			this.zooms = options.zooms || (function(){var zooms = []; for(var zl=1; zl<19; zl++) zooms.push(zl); return zooms;})();
			this.mask = options.mask || [];
			this.color = options.color || "#fff";
			this.opacity = options.opacity || 0.5;
			this.borderColor = options.borderColor || this.color;
			this.borderWeight = options.borderWeight || 0;    
			this.borderType = options.borderType || 'solid';  
			this.borderOpacity = options.borderOpacity || 1.0;
			this.dasharray_= options.dasharray || [10];
			this.dashoffset = options.dashoffset || 0;
			this.dashcolors_ = new Array;
			for (var da=0;da<this.dasharray_.length; da++){
			  var ColonPos = (''+this.dasharray_[da]).indexOf(':');
			  if (ColonPos>0){
				  if (ColonPos<this.dasharray_[da].length-1){this.dashcolors_[da] = this.dasharray_[da].substr(ColonPos+1);}
				  this.dasharray_[da] = 1*this.dasharray_[da].substring(0,ColonPos);		  
			  }else{ this.dashcolors_[da] = this.borderColor;}
			}
			this.Level = options.level || 0;
			this.hint = options.hint || '';


			this.CrossCountry = options.CrossCountry || false;
			this.CrossWidth = options.CrossWidth || 1;
			this.CrossOffset = options.CrossOffset || 1;
			this.CrossAngle = options.CrossAngle || 0; if (Math.abs(this.CrossAngle)>Math.PI/2) this.CrossAngle = 0;
			

			this.ContentWidth; this.ContentHeight;

			this.UpCanvasOffset = this.borderWeight;
			this.DwCanvasOffset = this.borderWeight;
			this.CanvasAmendment = this.borderWeight*6;
			this.doShadow = options.doShadow;
			//~~~~~~~~~~~~~~~~
			//Global Params
			this.map = map;
			this.canvas;
			//~~~~~~~~~~~~~~~~
			//Canvas Size
			this.delta_ = 5;
			this.BoundFull;
			this.BoundVisible;
			this.TopLeftCanvas;
			this.BottomRightCanvas;
			
			var canvas = document.createElement("canvas");
			canvas.id = this.id;
			canvas.style.display = 'block';
			canvas.style.visibility = 'hidden'; //IE8 hack
			canvas.style.position = "absolute";
			canvas.style.border = "0px dashed #F00";
			canvas.style.webkitUserSelect= "none";
			this.canvas = canvas;
			
			this.Areas = new Array();
			this.visibleAreasCount = 0;
			
			this.pointsOrdering();
			this.pointsAreasDemarcation();
			this.pointsCulcEdge();
			CulcBoundOnMove(true); //TODO start where?
			this.CulcOnZoomChange(); //TODO start where?
		},
		onAdd: function (map) {
			this._map = map;
			
			map.getPanes().overlayPane.appendChild(this.canvas);
			map.on('viewreset', this.hide, this);
			this.draw();
		},
		onRemove: function (map) {
			this.canvas.parentNode.removeChild(this.canvas);

			map.off('viewreset', this.draw, this);

			this._map = null;
		},
		destroy:function(){
			this.remove();
		},
		remove:function(px){
			this.canvas.parentNode.removeChild(this.canvas);
		},
		draw:function(pos){
			this.pointsAudit();
			if (this.visibleAreasCount<1){this.canvas.style.display="none"; return;}
			this.canvas.style.display="";

			if (pos!==false) this.position_canvas();
			this.resize_canvas();
			this.draw_canvas();
			return this.canvas;
		},
		hide:function(){
			if(this.hidden) return;
			this.canvas.style.visibility = 'hidden';
			this.hidden = true;
		},
		show:function(){
			if(!this.hidden) return;
			this.canvas.style.visibility = 'inherit';
			this.hidden = false;
		},
		getBound: function(type){
			var bound, bound2;
			for (var a=0, alen=this.Areas.length; a<alen; a++){
				if(type=='visible' && !this.Areas[a].visibleNow) continue;
				bound2 = this.Areas[a].getBound(type);
				if(bound){
					bound._southWest.lng = Math.min(bound._southWest.lng, bound2._southWest.lng);
					bound._northEast.lng = Math.max(bound._northEast.lng, bound2._northEast.lng);
					
					bound._northEast.lat = Math.max(bound._northEast.lat, bound2._northEast.lat);
					bound._southWest.lat = Math.min(bound._southWest.lat, bound2._southWest.lat);
				}else{
					bound = bound2;
				}
			}
			bound2 = null;
			
			return bound;
		},//9150306474
		position_canvas: function(){
			this.TopLeftCanvas = this.map.latLngToContainerPoint(new L.LatLng(this.BoundVisible._northEast.lat, this.BoundVisible._southWest.lng));
			this.BottomRightCanvas = this.map.latLngToContainerPoint(new L.LatLng(this.BoundVisible._southWest.lat, this.BoundVisible._northEast.lng));
			var xDelta = this.map.containerPointToLayerPoint(this.TopLeftCanvas).x-this.TopLeftCanvas.x;
			var yDelta = this.map.containerPointToLayerPoint(this.TopLeftCanvas).y-this.TopLeftCanvas.y;
			
			
			this.canvas.style.marginLeft = xDelta + 'px';
			this.canvas.style.marginTop = yDelta + 'px';
			this.canvas.style.left = this.TopLeftCanvas.x-this.CanvasAmendment+"px";
			this.canvas.style.top = this.TopLeftCanvas.y-this.CanvasAmendment+"px";
		},
		resize_canvas: function(){
			this.ContentWidth = Math.abs(this.TopLeftCanvas.x - this.BottomRightCanvas.x);
			this.ContentHeight = Math.abs(this.TopLeftCanvas.y - this.BottomRightCanvas.y);
			//this.TopLeftCanvas.x -= this.delta_; this.TopLeftCanvas.y -= this.delta_;
			//this.BottomRightCanvas.x += this.delta_; this.BottomRightCanvas.y += this.delta_;
			this.canvas.style.width = this.CanvasAmendment*2 + this.BottomRightCanvas.x - this.TopLeftCanvas.x + "px";
			this.canvas.style.height = this.CanvasAmendment*2 + this.BottomRightCanvas.y - this.TopLeftCanvas.y + "px";
			this.canvas.setAttribute('width', this.CanvasAmendment*2 + this.BottomRightCanvas.x - this.TopLeftCanvas.x + '');
			this.canvas.setAttribute('height', this.CanvasAmendment*2 + this.BottomRightCanvas.y - this.TopLeftCanvas.y + '');
		},
		draw_canvas: function(){
			if (!this.canvas.getContext)return;
			this.canvas.getContext('2d').translate(this.CanvasAmendment,this.CanvasAmendment);
			for (var a=0, alen=this.Areas.length; a<alen; a++){
				this.Areas[a].draw();
			}
			this.canvas.getContext('2d').translate(-this.CanvasAmendment,-this.CanvasAmendment); //IE8 hack
		},
		pointsOrdering: function(){
			var usingLine, currLine,
				lineObj, resultArray = [];//this.points;
			for (var p=0, plen=this.points.length; p<plen; p++){
				currLine = this.points[p].line
				if (usingLine != currLine){
					if (lineObj) resultArray.push(lineObj);
					lineObj = {line: currLine, points: new Array()}
					usingLine = currLine;
				}else{
					
				}
				lineObj.points.push(this.points[p].points);
			}
			if (lineObj) resultArray.push(lineObj);
			
			
			this.points = new Array();
			var linePoint, pointA, pointZ;
			
			//Направляем первую линию в одну сторону со второй
			pointZ = resultArray[0].points[resultArray[0].points.length-1];
			if(resultArray.length>0
			   && pointZ.lng != resultArray[1].points[0].lng && pointZ.lat != resultArray[1].points[0].lat
			   && pointZ.lng != resultArray[1].points[resultArray[1].points.length-1].lng && pointZ.lat != resultArray[1].points[resultArray[1].points.length-1].lat)
				{
					resultArray[0].points.reverse();
			}
			
			for (var r=0, rlen=resultArray.length; r<rlen; r++){
				lineObj = resultArray[r];
				linePoint = lineObj.points;
				if (this.points.length != 0){
					pointA = linePoint[0]; pointZ = linePoint[linePoint.length-1];
					
					if (r<rlen-1 && //Если отрезок не последний
						pointA.lng != this.points[this.points.length-1].lng && pointA.lat != this.points[this.points.length-1].lat && //Если отрезок не стыкован с концом прошлого отрезка
						pointZ.lng != this.points[this.points.length-1].lng && pointZ.lat != this.points[this.points.length-1].lat &&
						pointZ.lng != resultArray[r+1].points[0].lng && pointZ.lat != resultArray[r+1].points[0].lat && //Если конец отрезка не стыкован с началом следующего
						pointZ.lng != resultArray[r+1].points[resultArray[r+1].points.length-1].lng && pointZ.lat != resultArray[r+1].points[resultArray[r+1].points.length-1].lat  //Если конец отрезка не стыкован с концом следующего
						)
						{
						linePoint.reverse();
					}else if (pointZ.lng == this.points[this.points.length-1].lng && pointZ.lat == this.points[this.points.length-1].lat){
						linePoint.reverse();
					}
					pointA = linePoint[0];
					if (pointA.lng == this.points[this.points.length-1].lng && pointA.lat == this.points[this.points.length-1].lat){
						linePoint.shift();
					}
				}
				for (var p=0, plen=linePoint.length; p<plen; p++){
					linePoint[p].key = linePoint[p].lng+'-'+linePoint[p].lat;
					this.points.push(linePoint[p]);
				}
			}
					
		},
		pointsAreasDemarcation: function(){
			//this.Areas.push(new Array());
			var areaHash = {}, areaStart = 0, currArea, ca, caLen, //a, area = 0, areaLen = this.Areas[area].length-1,
				pid, p, plen = this.points.length,
				obj_yes = {yes: 0x1};
				
			for (p=1; p<plen; ++p){
				pid = this.points[p].key;
				if(typeof areaHash[pid] !== 'undefined'){ //Binary indiactor: if(areaHash[pid] & obj_yes.yes){
					currArea = this.points.splice(areaHash[pid], p-areaHash[pid]+1); caLen = currArea.length;
					p = areaHash[pid]-1; plen = this.points.length;
					for (ca=0; ca<caLen; ca++){
						delete areaHash[currArea[ca].key];
					}
					this.Areas.push(new Area(this, currArea));
				}else{
					areaHash[pid] = p;//0x1;
				}
			}
			if (plen>0){
				this.Areas.push(new Area(this, this.points.splice(0, plen)));
			}
			
			//Выстраиваем массив точек каждой области по часовой стрелки. Для определения направления определяем знак площади.
			for (var a=0, alen=this.Areas.length; a<alen; a++){
				if(this.Areas[a].getLonLatSquare()>0) this.Areas[a].points.reverse();
			}
			areaHash = areaStart = pid = p = plen = obj_yes = null;
		},
		pointsCulcEdge: function(){
			this.BoundFull = this.getBound('all');
			
		},
		CulcOnZoomChange: function(){
		//*!!!! map.latLngToContainerPoint(new OpenLayers.LonLat(map.getBounds().left, map.getBounds().top)) = 0,0 */
			//Math.abs(map.getLonLatFromLayerPx(OpenLayers.Projection.transform(new OpenLayers.Pixel(0, 1), map.projection, map.displayProjection)).lng - map.getLonLatFromLayerPx(OpenLayers.Projection.transform(new OpenLayers.Pixel(1, 1), map.projection, map.displayProjection)).lng);
			FieldUnimportantDelta = Math.abs(map.layerPointToLatLng(new L.Point(0, 1)).lng - map.layerPointToLatLng(new L.Point(1, 1)).lng);
			ZoomForFieldUnimportantDelta = map.getZoom();
		},
		getSquare: function(){
			var TotalSquare = 0;
			for (var a=0, alen=this.Areas.length; a<alen; a++){
				TotalSquare += this.Areas[a].getSquare();
			}
			return TotalSquare;
		},
		pointsAudit: function(){
			if (ZoomForFieldUnimportantDelta!=map.getZoom()) this.CulcOnZoomChange();

			this.visibleAreasCount = 0;
			for (var a=0, alen=this.Areas.length; a<alen; a++){
				this.Areas[a].pointsAudit();
				if(this.Areas[a].visibleNow) this.visibleAreasCount++;
			}
			if(this.visibleAreasCount) this.BoundVisible = this.getBound('visible');
		},
		LinesItersect: function(x11,x12,y11,y12, x21,x22,y21,y22){
			if (x11<0) x11+=this._proto_.map.getBounds()._northEast.lng;
			if (x12<0) x12+=this._proto_.map.getBounds()._northEast.lng;
			var ua, ub, result;
			
			ua = ((x22-x21)*(y11-y21) - (y22-y21)*(x11-x21))/((y22-y21)*(x12-x11) - (x22-x21)*(y12-y11));
			ub = ((x12-x11)*(y11-y21) - (y12-y11)*(x11-x21))/((y22-y21)*(x12-x11) - (x22-x21)*(y12-y11));			
			if (ua >=0 && ua<=1 && ub>=0 && ub<=1){
				result = new L.LatLng(y11 + ua*(y12-y11), x11 + ua*(x12-x11));
			}
			
			return result;
		},
		LineBoundItersect: function(Bound, x11,x12,y11,y12){
			var RetArr = new Array();
			
			var leftInt = this.LinesItersect(x11,x12,y11,y12, Bound._southWest.lng, Bound._southWest.lng, Bound._southWest.lat, Bound._northEast.lat);
			if(leftInt) RetArr.push(leftInt);
			
			var topInt = this.LinesItersect(x11,x12,y11,y12, Bound._southWest.lng, Bound._northEast.lng, Bound._northEast.lat, Bound._northEast.lat);
			if(topInt) RetArr.push(topInt);

			var rightInt = this.LinesItersect(x11,x12,y11,y12, Bound._northEast.lng, Bound._northEast.lng, Bound._southWest.lat, Bound._northEast.lat);
			if(rightInt) RetArr.push(rightInt);
				
			var bottomInt = this.LinesItersect(x11,x12,y11,y12, Bound._southWest.lng, Bound._northEast.lng, Bound._southWest.lat, Bound._southWest.lat);
			if(bottomInt) RetArr.push(bottomInt);
			
			return RetArr;
		},
		
		moveTo:function(px){
		},
		isDrawn:function(){
		},
		onScreen:function(){
		},
		inflate:function(inflate){
		},
		setOpacity:function(opacity){},
		setUrl:function(url){},
		display:function(display){/*alert(9);*/},
		CLASS_NAME:"L.NeoField"
});

/**
 * Simplify.js использует алгоритм Дугласа-Пекера
 */
(function(q){function p(l,i,c,g,a){var d=0,h,b,e;for(h=g+1;h<a;h+=1){b=l[h];var f=l[g],m=l[a],n=f.lng,f=f.lat,j=m.lng-n,k=m.lat-f,o=void 0;if(0!==j||0!==k)o=((b.lng-n)*j+(b.lat-f)*k)/(j*j+k*k),1<o?(n=m.lng,f=m.lat):0<o&&(n+=j*o,f+=k*o);j=b.lng-n;k=b.lat-f;b=j*j+k*k;b>d&&(e=h,d=b)}d>c&&(i[e]=1,p(l,i,c,g,e),p(l,i,c,e,a))}("undefined"!==typeof exports?exports:q).simplify=function(l,i){var i="undefined"!==typeof i?i:1,c=i*i,g=l,a=g[0],d=[a],h=g.length,b,e;for(b=1;b<h;b+=1){e=g[b];var f=e.lng-a.lng,m=
e.lat-a.lat;f*f+m*m>c&&(d.push(e),a=e)}a!==e&&d.push(e);g=d;a=g.length;d=new ("undefined"!==typeof Uint8Array?Uint8Array:Array)(a);h=[];d[0]=d[a-1]=1;p(g,d,c,0,a-1);for(c=0;c<a;c+=1)d[c]&&h.push(g[c]);return h}})(this);