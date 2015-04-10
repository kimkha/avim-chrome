
var extension = chrome.extension;
var document = window.document;
var sendRequest = extension.sendMessage;

var inputTypes = ["textarea", "text", "search", "tel"];

function findFrame() {
	for(var i = 0; i < AVIMObj.fID.length; i++) {
		if(findIgnore(AVIMObj.fID[i])) return;
		AVIMObj.frame = AVIMObj.fID[i];
		if(typeof(AVIMObj.frame) != "undefined") {
			try {
				if (AVIMObj.frame.contentWindow.document && AVIMObj.frame.contentWindow.event) {
					return AVIMObj.frame.contentWindow;
				}
			} catch(e) {
				if (AVIMObj.frame.document && AVIMObj.frame.event) {
					return AVIMObj.frame;
				}
			}
		}
	}
}

function _keyPressHandler(e) {
	if(!AVIMObj.support) {
		return;
	}

	var el = e.target, code = e.which;
	if(e.ctrlKey) {
		return;
	}
	if(e.altKey && (code != 92) && (code != 126)) {
		return;
	}
	if(inputTypes.indexOf(el.type) < 0) {// Not contains in list of input types
		if (el.isContentEditable) {
			ifMoz(e);
		}
		return;
	}
	if (checkCode(code)) {
		return;
	}
	AVIMObj.sk = fcc(code);
	if(findIgnore(el)) {
		return;
	}
	start(el, e);
	if(AVIMObj.changed) {
		AVIMObj.changed = false;
		e.preventDefault();
		return false;
	}
	return;
}

function _keyUpHandler(evt) {
	var code = evt.which;

	// Press Ctrl twice to off/on AVIM
	if (code == 17) {
		if (AVIMObj.isPressCtrl) {
			AVIMObj.isPressCtrl = false;
			sendRequest({'turn_avim':'onOff'}, configAVIM);
		} else {
			AVIMObj.isPressCtrl = true;
			// Must press twice in 300ms
			setTimeout(function(){
				AVIMObj.isPressCtrl = false;
			}, 300);
		}
	} else {
		AVIMObj.isPressCtrl = false;
	}
}

function _keyDownHandler(evt) {
	var key;
	if(evt == "iframe") {
		AVIMObj.frame = findFrame();
		key = AVIMObj.frame.event.keyCode;
	} else {
		key = evt.which;
	}
}

function keyUpHandler(evt) {
	_keyUpHandler(evt);
	console.log("keyUpHandler");
}

function keyDownHandler(evt) {
	_keyDownHandler(evt);
	console.log("keyDownHandler");
}

function keyPressHandler(evt) {
	var success = _keyPressHandler(evt);
	if (success === false) {
		evt.preventDefault();
	}
	console.log("keyPressHandler");
}

function attachEvt(obj, evt, handle, capture) {
	obj.addEventListener(evt, handle, capture);
}

function removeEvt(obj, evt, handle, capture) {
	obj.removeEventListener(evt, handle, capture);
}

function removeOldAVIM() {
	removeEvt(document, "mouseup", AVIMAJAXFix, false);
	removeEvt(document, "keydown", keyDownHandler, true);
	removeEvt(document, "keypress", keyPressHandler, true);
	removeEvt(document, "keyup", keyUpHandler, true);
	AVIMInit(AVIMObj, false);
	AVIMObj = null;
	//delete AVIMObj;
}

function newAVIMInit() {
	if (typeof AVIMObj != "undefined" && AVIMObj) {
		removeOldAVIM();
	}
	AVIMObj = new AVIM();
	AVIMAJAXFix();
	attachEvt(document, "mouseup", AVIMAJAXFix, false);
	attachEvt(document, "keydown", keyDownHandler, true);
	attachEvt(document, "keyup", keyUpHandler, true);
	attachEvt(document, "keypress", keyPressHandler, true);
}

function configAVIM(data) {
	if (data) {
		AVIMGlobalConfig.method = data.method;
		AVIMGlobalConfig.onOff = data.onOff;
		AVIMGlobalConfig.ckSpell = data.ckSpell;
		AVIMGlobalConfig.oldAccent = data.oldAccent;
	}

	newAVIMInit();
}

sendRequest({'get_prefs':'all'}, configAVIM);

extension.onMessage.addListener(function(request, sender, sendResponse){
	configAVIM(request);
});

