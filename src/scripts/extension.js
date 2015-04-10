
var extension = chrome.extension;
var document = window.document;
var sendRequest = extension.sendMessage;

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

