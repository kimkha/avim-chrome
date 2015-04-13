(function(window){
	function setAVIMConfig(key, value) {
		var obj = {'save_prefs':'all'};
		if (key == 'method') {
			obj = {'save_prefs':'all', 'method' : value, 'onOff' : 1};
		}
		if (key == 'onOff') {
			obj = {'save_prefs':'all', 'onOff' : value};
		}
		chrome.extension.sendMessage(obj, function(response){
			window.location.reload();
		});
	}
	
	function getI18n(message) {
		return chrome.i18n.getMessage(message);
	}
	
	function loadText() {
		var keys = ["Sel", "Auto", "Telex", "Vni", "Viqr", "ViqrStar", "Off", "Tips", "TipsCtrl", "Demo", "DemoCopy"];
		for (var k in keys) {
			$g("txt" + keys[k]).innerHTML = getI18n("extPopup" + keys[k]);
		}
	}
	
	function hightlightDemo() {
		$g("inputDemo").focus();
		$g("inputDemo").select();
	}

	function $g(id) {
		return document.getElementById(id);
	}
	
	function init() {
		loadText();
		
		var offEle = $g("off");
		var autoEle = $g("auto");
		var telexEle = $g("telex");
		var vniEle = $g("vni");
		var viqrEle = $g("viqr");
		var viqrStarEle = $g("viqrStar");
		
		chrome.extension.sendMessage({'get_prefs':'all'}, function(response){
			if (response.onOff === 0) {
				offEle.checked = true;
			} else {
				if (response.method === 0) {
					autoEle.checked = true;
				}
				if (response.method === 1) {
					telexEle.checked = true;
				}
				if (response.method === 2) {
					vniEle.checked = true;
				}
				if (response.method === 3) {
					viqrEle.checked = true;
				}
				if (response.method === 4) {
					viqrStarEle.checked = true;
				}
			}
		});
		
		offEle.addEventListener("click", function(){setAVIMConfig('onOff', 0);});
		autoEle.addEventListener("click", function(){setAVIMConfig('method', 0);});
		telexEle.addEventListener("click", function(){setAVIMConfig('method', 1);});
		vniEle.addEventListener("click", function(){setAVIMConfig('method', 2);});
		viqrEle.addEventListener("click", function(){setAVIMConfig('method', 3);});
		viqrStarEle.addEventListener("click", function(){setAVIMConfig('method', 4);});
		
		$g("demoCopy").addEventListener("click", hightlightDemo);
	}
	
//	window.onload = init;
	init();
})(window);
