
var extension = chrome.extension;
var document = window.document;
var sendRequest = extension.sendMessage;
var allFrames = [];

var inputTypes = ["textarea", "text", "search", "tel"];

function AVIMInit(AVIM, isAttach) {
	allFrames = document.getElementsByTagName("iframe");
	for(AVIM.g = 0; AVIM.g < allFrames.length; AVIM.g++) {
		if(findIgnore(allFrames[AVIM.g])) {
			continue;
		}
		var iframedit;
		try {
			AVIM.wi = allFrames[AVIM.g].contentWindow;
			iframedit = AVIM.wi.document;
			iframedit.wi = AVIM.wi;
			if(iframedit && (upperCase(iframedit.designMode) == "ON")) {
				iframedit.AVIM = AVIM;
				if (isAttach) {
					attachEvt(iframedit, "keypress", ifMoz, false);
					attachEvt(iframedit, "keydown", keyDownHandler, false);
				} else {
					attachEvt(iframedit, "keypress", ifMoz, false);
					attachEvt(iframedit, "keydown", keyDownHandler, false);
				}
			}
		} catch(e) {}
	}/**/
}

function findIgnore(el) {
	var va = exclude, i;
	for(i = 0; i < va.length; i++) {
		if((va[i].length > 0) && (el.name == va[i] || el.id == va[i])) {
			return true;
		}
	}
	return false;
}

function findFrame() {
	for(var i = 0; i < allFrames.length; i++) {
		if(findIgnore(allFrames[i])) return;
		AVIMObj.frame = allFrames[i];
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
	AVIMObj.sk = fromCharCode(code);
	if(findIgnore(el) || el.readOnly) {
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

var isPressCtrl = false;
function _keyUpHandler(evt) {
	var code = evt.which;

	// Press Ctrl twice to off/on AVIM
	if (code == 17) {
		if (isPressCtrl) {
			isPressCtrl = false;
			sendRequest({'turn_avim':'onOff'}, configAVIM);
		} else {
			isPressCtrl = true;
			// Must press twice in 300ms
			setTimeout(function(){
				isPressCtrl = false;
			}, 300);
		}
	} else {
		isPressCtrl = false;
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

var ajaxCounter = 0;
function AVIMAJAXFix() {
	if (isNaN(parseInt(ajaxCounter))) {
		ajaxCounter = 0;
	} else {
		ajaxCounter = parseInt(ajaxCounter);
	}
	AVIMInit(AVIMObj, true);
	ajaxCounter++;
	if (ajaxCounter < 100) {
		setTimeout(AVIMAJAXFix, 100);
	}
}

function removeOldAVIM() {
	// Untrigger event
	removeEvt(document, "mouseup", AVIMAJAXFix, false);
	removeEvt(document, "keydown", keyDownHandler, true);
	removeEvt(document, "keypress", keyPressHandler, true);
	removeEvt(document, "keyup", keyUpHandler, true);
	
	// Remove AVIM
	AVIMInit(AVIMObj, false);
	AVIMObj = null;
	//delete AVIMObj;
}

function newAVIMInit() {
	if (typeof AVIMObj != "undefined" && AVIMObj) {
		removeOldAVIM();
	}
	
	allFrames = document.getElementsByTagName("iframe");
	AVIMObj = new AVIM();
	AVIMAJAXFix();
	
	// Trigger event
	attachEvt(document, "mouseup", AVIMAJAXFix, false);
	attachEvt(document, "keydown", keyDownHandler, true);
	attachEvt(document, "keyup", keyUpHandler, true);
	attachEvt(document, "keypress", keyPressHandler, true);
}

function configAVIM(data) {
	if (data) {
		method = data.method;
		onOff = data.onOff;
		checkSpell = data.ckSpell;
		oldAccent = data.oldAccent;
	}

	newAVIMInit();
}

sendRequest({'get_prefs':'all'}, configAVIM);

extension.onMessage.addListener(function(request, sender, sendResponse){
	configAVIM(request);
});

