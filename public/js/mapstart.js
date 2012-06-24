window.getCookie = function (name) {
	var matches = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"));
	return matches ? decodeURIComponent(matches[1]) : undefined;
};
window.setCookie = function (name, value, props) {
	props = props || {};
	var exp = props.expires;
	if (typeof exp == "number" && exp) {
		var d = new Date();
		d.setTime(d.getTime() + exp*1000);
		exp = props.expires = d;
	}
	if(exp && exp.toUTCString) { props.expires = exp.toUTCString(); }

	value = encodeURIComponent(value);
	var updatedCookie = name + "=" + value;
	for(var propName in props){
		updatedCookie += "; " + propName;
		var propValue = props[propName];
		if(propValue !== true){ updatedCookie += "=" + propValue; }
	}
	document.cookie = updatedCookie;
};

!function (){
	document.head || (document.head = document.getElementsByTagName('head')[0]);
	
	function start() {
		var s = document.createElement('script');
		s.setAttribute('type', 'text/javascript');
		s.setAttribute('data-main', 'js/appAMD');
		s.setAttribute('src', '/js/require.min.js');
		document.head.appendChild(s);
	}
	if (!getCookie('oldmosload')){
		var loadImg = new Image();
		loadImg.onabort = loadImg.onerror = function (evt){start();}
		loadImg.onload = function (evt){
			var loading_pics = document.getElementById('loading_pics');
			setCookie('oldmosload', new Date().toUTCString());
			
			loading_pics.style.backgroundImage = 'url(/images/loading/Loading1.jpg)';
			document.getElementById('main_loader').classList.add('visi');
			loading_pics.classList.add('finish');
			loadImg = null;
			
			start();
		}
		loadImg.src = '/images/loading/Loading1.jpg';
	}else {
		start();
	}
}();