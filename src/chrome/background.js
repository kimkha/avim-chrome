var DEFAULT_PREFS = {
	method: '0',
	onOff: '1',
	ckSpell: '1',
	oldAccent: '1'
};

function getPrefs(callback) {
	chrome.storage.local.get(DEFAULT_PREFS, function(items) {
		var prefs = {
			'method': parseInt(items.method, 10),
			'onOff': parseInt(items.onOff, 10),
			'ckSpell': parseInt(items.ckSpell, 10),
			'oldAccent': parseInt(items.oldAccent, 10)
		};

		callback(prefs);
	});
}

function turnAvim(callback) {
	getPrefs(function(prefs) {
		chrome.storage.local.set({
			onOff: prefs.onOff == 1 ? '0' : '1'
		}, function() {
			getPrefs(function(newPrefs) {
				updateAllTabs(newPrefs);
				callback();
			});
		});
	});
}

function updateAllTabs(prefs) {
	chrome.tabs.query({}, function(tabs) {
		for (var i = 0; i < tabs.length; i++) {
			chrome.tabs.sendMessage(tabs[i].id, prefs, function() {
				void chrome.runtime.lastError;
			});
		}
	});

	updateIcon(prefs);
}

function updateIcon(prefs) {
	var txt = {};
	var bg = {};

	if (prefs.onOff == 1) {
		txt.text = "on";
		bg.color = [0, 255, 0, 255];
	} else {
		txt.text = "off";
		bg.color = [255, 0, 0, 255];
	}

	chrome.action.setBadgeText(txt);
	chrome.action.setBadgeBackgroundColor(bg);
}

function savePrefs(request, callback) {
	var toSave = {};

	if (typeof request.method != 'undefined') {
		toSave.method = String(request.method);
	}
	if (typeof request.onOff != 'undefined') {
		toSave.onOff = String(request.onOff);
	}
	if (typeof request.ckSpell != 'undefined') {
		toSave.ckSpell = String(request.ckSpell);
	}
	if (typeof request.oldAccent != 'undefined') {
		toSave.oldAccent = String(request.oldAccent);
	}

	chrome.storage.local.set(toSave, function() {
		getPrefs(function(prefs) {
			updateAllTabs(prefs);
			callback();
		});
	});
}

function processRequest(request, sender, sendResponse) {
	if (request.get_prefs) {
		getPrefs(sendResponse);
		return true;
	}

	if (request.save_prefs) {
		savePrefs(request, sendResponse);
		return true;
	}

	if (request.turn_avim) {
		turnAvim(sendResponse);
		return true;
	}
}

function genericOnClick() {
	alert("demo");
}

function createMenus() {
	var parentId = chrome.contextMenus.create({"title" : "AVIM", "contexts" : ["selection"]});
	var demo = chrome.contextMenus.create({"title" : "AVIM Demo", "contexts" : ["selection"], "parentId": parentId, "onclick": genericOnClick});
}

chrome.runtime.onMessage.addListener(processRequest);

getPrefs(updateIcon);
