/*
 *  AVIM for Chrome based on avim.js by Hieu Tran Dang
 * 
 *	Copyright (C) 2011-2015 Nguyen Kim Kha <nkimkha (at) gmail (dot) com>
 * 
 * My changes is published by GPLv3.
 *
 * Changes:
 * 	- Make it work inside Chrome Extension
 * 	- Remove unused codes for other browsers (Firefox, IE,...)
 * 	- Add API for setting from popup.html
 *  - Refactor
 */

/*
 *  AVIM JavaScript Vietnamese Input Method Source File dated 28-07-2008
 *
 *	Copyright (C) 2004-2008 Hieu Tran Dang <lt2hieu2004 (at) users (dot) sf (dot) net>
 *	Website:	http://noname00.com/hieu
 *
 *	You are allowed to use this software in any way you want providing:
 *		1. You must retain this copyright notice at all time
 *		2. You must not claim that you or any other third party is the author
 *		   of this software in any way.
 */

var AVIMObj = '';

var method = 0, //Default input method: 0=AUTO, 1=TELEX, 2=VNI, 3=VIQR, 4=VIQR*
	  onOff = 1, //Starting status: 0=Off, 1=On
	  checkSpell = 1, //Spell Check: 0=Off, 1=On
	  oldAccent = 1, //0: New way (oa`, oe`, uy`), 1: The good old day (o`a, o`e, u`y)
	  useCookie = 0, //Cookies: 0=Off, 1=On
	  exclude = ["email"]; //IDs of the fields you DON'T want to let users type Vietnamese in

//Set to true the methods which you want to be included in the AUTO method
var AVIMAutoConfig = [
	true,//telex
	true,//vni
	false,//viqr
	false//viqrStar
];

/**
 * Private variables (Only use in AVIM Object)
 */
var $_alphabet = "QWERTYUIOPASDFGHJKLZXCVBNM ";
var $_skey = [97,226,259,101,234,105,111,244,417,117,432,121,65,194,258,69,202,73,79,212,416,85,431,89]; // a,â,ă,e,ê,i,o,ô,ơ,u,ư,y,A,Â,Ă,E,Ê,I,O,Ô,Ơ,U,Ư,Y
var _range = null; // Range object, maybe from Document.createRange()
var _whit = false; // Unknown

/**
 * Start new object
 */
function AVIM()	{
	this.changed = false;
	this.specialChange = false;
	this.db1 = [273,272];
	this.ds1 = ['d','D'];
	this.os1 = "o,O,ơ,Ơ,ó,Ó,ò,Ò,ọ,Ọ,ỏ,Ỏ,õ,Õ,ớ,Ớ,ờ,Ờ,ợ,Ợ,ở,Ở,ỡ,Ỡ".split(",");
	this.ob1 = "ô,Ô,ô,Ô,ố,Ố,ồ,Ồ,ộ,Ộ,ổ,Ổ,ỗ,Ỗ,ố,Ố,ồ,Ồ,ộ,Ộ,ổ,Ổ,ỗ,Ỗ".split(",");
	this.mocs1 = "o,O,ô,Ô,u,U,ó,Ó,ò,Ò,ọ,Ọ,ỏ,Ỏ,õ,Õ,ú,Ú,ù,Ù,ụ,Ụ,ủ,Ủ,ũ,Ũ,ố,Ố,ồ,Ồ,ộ,Ộ,ổ,Ổ,ỗ,Ỗ".split(",");
	this.mocb1 = "ơ,Ơ,ơ,Ơ,ư,Ư,ớ,Ớ,ờ,Ờ,ợ,Ợ,ở,Ở,ỡ,Ỡ,ứ,Ứ,ừ,Ừ,ự,Ự,ử,Ử,ữ,Ữ,ớ,Ớ,ờ,Ờ,ợ,Ợ,ở,Ở,ỡ,Ỡ".split(",");
	this.trangs1 = "a,A,â,Â,á,Á,à,À,ạ,Ạ,ả,Ả,ã,Ã,ấ,Ấ,ầ,Ầ,ậ,Ậ,ẩ,Ẩ,ẫ,Ẫ".split(",");
	this.trangb1 = "ă,Ă,ă,Ă,ắ,Ắ,ằ,Ằ,ặ,Ặ,ẳ,Ẳ,ẵ,Ẵ,ắ,Ắ,ằ,Ằ,ặ,Ặ,ẳ,Ẳ,ẵ,Ẵ".split(",");
	this.as1 = "a,A,ă,Ă,á,Á,à,À,ạ,Ạ,ả,Ả,ã,Ã,ắ,Ắ,ằ,Ằ,ặ,Ặ,ẳ,Ẳ,ẵ,Ẵ,ế,Ế,ề,Ề,ệ,Ệ,ể,Ể,ễ,Ễ".split(",");
	this.ab1 = "â,Â,â,Â,ấ,Ấ,ầ,Ầ,ậ,Ậ,ẩ,Ẩ,ẫ,Ẫ,ấ,Ấ,ầ,Ầ,ậ,Ậ,ẩ,Ẩ,ẫ,Ẫ,é,É,è,È,ẹ,Ẹ,ẻ,Ẻ,ẽ,Ẽ".split(",");
	this.es1 = "e,E,é,É,è,È,ẹ,Ẹ,ẻ,Ẻ,ẽ,Ẽ".split(",");
	this.eb1 = "ê,Ê,ế,Ế,ề,Ề,ệ,Ệ,ể,Ể,ễ,Ễ".split(",");
	this.english = "ĐÂĂƠƯÊÔ";
	this.lowen = "đâăơưêô";
	this.arA = "á,à,ả,ã,ạ,a,Á,À,Ả,Ã,Ạ,A".split(',');
	this.mocrA = "ó,ò,ỏ,õ,ọ,o,ú,ù,ủ,ũ,ụ,u,Ó,Ò,Ỏ,Õ,Ọ,O,Ú,Ù,Ủ,Ũ,Ụ,U".split(',');
	this.erA = "é,è,ẻ,ẽ,ẹ,e,É,È,Ẻ,Ẽ,Ẹ,E".split(',');
	this.orA = "ó,ò,ỏ,õ,ọ,o,Ó,Ò,Ỏ,Õ,Ọ,O".split(',');
	this.aA = "ấ,ầ,ẩ,ẫ,ậ,â,Ấ,Ầ,Ẩ,Ẫ,Ậ,Â".split(',');
	this.oA = "ố,ồ,ổ,ỗ,ộ,ô,Ố,Ồ,Ổ,Ỗ,Ộ,Ô".split(',');
	this.mocA = "ớ,ờ,ở,ỡ,ợ,ơ,ứ,ừ,ử,ữ,ự,ư,Ớ,Ờ,Ở,Ỡ,Ợ,Ơ,Ứ,Ừ,Ử,Ữ,Ự,Ư".split(',');
	this.trangA = "ắ,ằ,ẳ,ẵ,ặ,ă,Ắ,Ằ,Ẳ,Ẵ,Ặ,Ă".split(',');
	this.eA = "ế,ề,ể,ễ,ệ,ê,Ế,Ề,Ể,Ễ,Ệ,Ê".split(',');
	this.oA = "ố,ồ,ổ,ỗ,ộ,ô,Ố,Ồ,Ổ,Ỗ,Ộ,Ô".split(',');
	this.skey2 = "a,a,a,e,e,i,o,o,o,u,u,y,A,A,A,E,E,I,O,O,O,U,U,Y".split(',');

	this.spellerr = (checkSpell == 1) ? ckspell : nospell;

}

function fromCharCode(x) {
	return String.fromCharCode(x);
}

function getSF() {
	var sf = [], x;
	for(x = 0; x < $_skey.length; x++) {
		sf[sf.length] = fromCharCode($_skey[x]);
	}
	return sf;
}

function nospell(word, k) {
	return false;
}

function ckspell(word, k) {
	word = unV(word);
	var exc = "UOU,IEU".split(','), z, next = true, noE = "UU,UOU,UOI,IEU,AO,IA,AI,AY,AU,AO".split(','), noBE = "YEU";
	var check = true, noM = "UE,UYE,IU,EU,UY".split(','), noMT = "AY,AU".split(','), noT = "UA", t = -1, notV2 = "IAO";
	var uw = upperCase(word), tw = uw, update = false, gi = "IO", noAOEW = "OE,OO,AO,EO,IA,AI".split(','), noAOE = "OA", test, a, b;
	var notViet = "AA,AE,EE,OU,YY,YI,IY,EY,EA,EI,II,IO,YO,YA,OOO".split(','), uk = upperCase(k), twE, uw2 = unV2(uw);
	var vSConsonant = "B,C,D,G,H,K,L,M,N,P,Q,R,S,T,V,X".split(','), vDConsonant = "CH,GI,KH,NGH,GH,NG,NH,PH,QU,TH,TR".split(',');
	var vDConsonantE = "CH,NG,NH".split(','),sConsonant = "C,P,T,CH".split(','),vSConsonantE = "C,M,N,P,T".split(',');
	var noNHE = "O,U,IE,Ô,Ơ,Ư,IÊ,Ă,Â,UYE,UYÊ,UO,ƯƠ,ƯO,UƠ,UA,ƯA,OĂ,OE,OÊ".split(','),oMoc = "UU,UOU".split(',');
	if(AVIMObj.FRX.indexOf(uk) >= 0) {
		for(a = 0; a < sConsonant.length; a++) {
			if(uw.substr(uw.length - sConsonant[a].length, sConsonant[a].length) == sConsonant[a]) {
				return true;
			}
		}
	}
	for(a = 0; a < uw.length; a++) {
		if("FJZW1234567890".indexOf(uw.substr(a, 1)) >= 0) {
			return true;
		}
		for(b = 0; b < notViet.length; b++) {
			if(uw2.substr(a, notViet[b].length) == notViet[b]) {
				for(z = 0; z < exc.length; z++) {
					if(uw2.indexOf(exc[z]) >= 0) {
						next=false;
					}
				}
				if(next && ((gi.indexOf(notViet[b]) < 0) || (a <= 0) || (uw2.substr(a - 1, 1) != 'G'))) {
					return true;
				}
			}
		}
	}
	for(b = 0; b < vDConsonant.length; b++) {
		if(tw.indexOf(vDConsonant[b]) === 0) {
			tw = tw.substr(vDConsonant[b].length);
			update = true;
			t = b;
			break;
		}
	}
	if(!update) {
		for(b = 0; b < vSConsonant.length; b++) {
			if(tw.indexOf(vSConsonant[b]) === 0) {
				tw=tw.substr(1);
				break;
			}
		}
	}
	update=false;
	twE=tw;
	for(b = 0; b < vDConsonantE.length; b++) {
		if(tw.substr(tw.length - vDConsonantE[b].length) == vDConsonantE[b]) {
			tw = tw.substr(0, tw.length - vDConsonantE[b].length);
			if(b == 2){
				for(z = 0; z < noNHE.length; z++) {
					if(tw == noNHE[z]) {
						return true;
					}
				}
				if((uk == AVIMObj.trang) && ((tw == "OA") || (tw == "A"))) {
					return true;
				}
			}
			update = true;
			break;
		}
	}
	if(!update) {
		for(b = 0; b < vSConsonantE.length; b++) {
			if(tw.substr(tw.length - 1) == vSConsonantE[b]) {
				tw = tw.substr(0, tw.length - 1);
				break;
			}
		}
	}
	if(tw) {
		for(a = 0; a < vDConsonant.length; a++) {
			for(b = 0; b < tw.length; b++) {
				if(tw.substr(b, vDConsonant[a].length) == vDConsonant[a]) {
					return true;
				}
			}
		}
		for(a = 0; a < vSConsonant.length; a++) {
			if(tw.indexOf(vSConsonant[a]) >= 0) {
				return true;
			}
		}
	}
	test = tw.substr(0, 1);
	if((t == 3) && ((test == "A") || (test == "O") || (test == "U") || (test == "Y"))) {
		return true;
	}
	if((t == 5) && ((test == "E") || (test == "I") || (test == "Y"))) {
		return true;
	}
	uw2 = unV2(tw);
	if(uw2 == notV2) {
		return true;
	}
	if(tw != twE) {
		for(z = 0; z < noE.length; z++) {
			if(uw2 == noE[z]) {
				return true;
			}
		}
	}
	if((tw != uw) && (uw2 == noBE)) {
		return true;
	}
	if(uk != AVIMObj.moc) {
		for(z = 0; z < oMoc.length; z++) {
			if(tw == oMoc[z]) return true;
		}
	}
	if((uw2.indexOf('UYE')>0) && (uk == 'E')) {
		check=false;
	}
	if((AVIMObj.them.indexOf(uk) >= 0) && check) {
		for(a = 0; a < noAOEW.length; a++) {
			if(uw2.indexOf(noAOEW[a]) >= 0) {
				return true;
			}
		}
		if(uk != AVIMObj.trang) {
			if(uw2 == noAOE) {
				return true;
			}
		}
		if((uk == AVIMObj.trang) && (AVIMObj.trang != 'W')) {
			if(uw2 == noT) {
				return true;
			}
		}
		if(uk == AVIMObj.moc) {
			for(a = 0; a < noM.length; a++) {
				if(uw2 == noM[a]) {
					return true;
				}
			}
		}
		if((uk == AVIMObj.moc) || (uk == AVIMObj.trang)) {
			for(a = 0; a < noMT.length; a++) {
				if(uw2 == noMT[a]) {
					return true;
				}
			}
		}
	}
	AVIMObj.tw5 = tw;
	if((uw2.charCodeAt(0) == 272) || (uw2.charCodeAt(0) == 273)) {
		if(uw2.length > 4) {
			return true;
		}
	} else if(uw2.length > 3) {
		return true;
	}
	return false;
}

function getEditorObject(ele) {
	var value, start, end;
	value = (ele.data) ? ele.data : ( (ele.value) ? ele.value : ele.innerText );
	if(!ele.data) {
		if(!ele.setSelectionRange) {
			return false;
		}
		start = ele.selectionStart;
		end = ele.selectionEnd;
	} else {
		start = ele.pos;
		end = ele.pos;
	}
	return {
		"v": value, // value
		"s": start, // start selection
		"e": end // end selection
	};
}

function mozGetText(editor) {
	if (!editor) {
		return false;
	}
	var v, pos, word = "", g = 1;
	v = editor.v;
	if(v.length <= 0) {
		return false;
	}
	pos = editor.s;
	if(pos != editor.e) {
		return ["", pos];
	}
	while(1) {
		if(pos - g < 0) {
			break;
		} else if(notWord(v.substr(pos - g, 1))) {
			if(v.substr(pos - g, 1) == "\\") {
				word = v.substr(pos - g, 1) + word;
			}
			break;
		} else {
			word = v.substr(pos - g, 1) + word;
		}
		g++;
	}
	return [word, pos];
}

function start(obj, key) {
	var word = "", dockspell = checkSpell, uni, uni2 = false, uni3 = false, uni4 = false;
	AVIMObj.oc=obj;
	var telex = "D,A,E,O,W,W".split(','), vni = "9,6,6,6,7,8".split(','), viqr = "D,^,^,^,+,(".split(','), viqr2 = "D,^,^,^,*,(".split(','), a, noNormC;
	if(method === 0) { // AUTO Method
		var arr = [], check = AVIMAutoConfig;
		var value1 = [telex, vni, viqr, viqr2], uniA = [uni, uni2, uni3, uni4], D2A = ["DAWEO", "6789", "D^+(", "D^*("];
		for(a = 0; a < check.length; a++) {
			if(check[a]) {
				arr[arr.length] = value1[a];
			} else {
				D2A[a] = "";
			}
		}
		for(a = 0; a < arr.length; a++) {
			uniA[a] = arr[a];
		}
		uni = uniA[0];
		uni2 = uniA[1];
		uni3 = uniA[2];
		uni4 = uniA[3];
		AVIMObj.D2 = D2A.join();
		if(!uni) {
			return;
		}
	} else if(method == 1) { // TELEX Method
		uni = telex;
		AVIMObj.D2 = "DAWEO";
	}
	else if(method == 2) { // VNI Method
		uni = vni;
		AVIMObj.D2 = "6789";
	}
	else if(method == 3) { // VIQR Method
		uni = viqr;
		AVIMObj.D2 = "D^+(";
	}
	else if(method == 4) { // VIQR2 Method
		uni = viqr2;
		AVIMObj.D2 = "D^*(";
	}

	key = fromCharCode(key.which);
	word = mozGetText(getEditorObject(obj));
	if(!word || obj.sel) {
		return;
	}
	if(AVIMObj.D2.indexOf(upperCase(key)) >= 0) {
		noNormC = true;
	} else {
		noNormC = false;
	}
	main(word[0], key, word[1], uni, noNormC);
	if(!dockspell) {
		word = mozGetText(getEditorObject(obj));
	}
	if(word && uni2 && !AVIMObj.changed) {
		main(word[0], key, word[1], uni2, noNormC);
	}
	if(!dockspell) {
		word = mozGetText(getEditorObject(obj));
	}
	if(word && uni3 && !AVIMObj.changed) {
		main(word[0], key, word[1], uni3, noNormC);
	}
	if(!dockspell) {
		word = mozGetText(getEditorObject(obj));
	}
	if(word && uni4 && !AVIMObj.changed) {
		main(word[0], key, word[1], uni4, noNormC);
	}

	if(AVIMObj.D2.indexOf(upperCase(key)) >= 0) {
		word = mozGetText(getEditorObject(obj));
		if(!word) {
			return;
		}
		normC(word[0], key, word[1]);
	}
}

function findC(word, k, sf) {
	if(((method == 3) || (method == 4)) && (word.substr(word.length - 1, 1) == "\\")) {
		return [1, k.charCodeAt(0)];
	}
	var str = "", res, cc = "", pc = "", tE = "", vowA = [], s = "ÂĂÊÔƠƯêâăơôư", c = 0, dn = false, uw = upperCase(word), tv, g;
	var DAWEOFA = upperCase(AVIMObj.aA.join() + AVIMObj.eA.join() + AVIMObj.mocA.join() + AVIMObj.trangA.join() + AVIMObj.oA.join() + AVIMObj.english), h, uc;
	for(g = 0; g < sf.length; g++) {
		if(notNumber(sf[g])) {
			str += sf[g];
		} else {
			str += fromCharCode(sf[g]);
		}
	}
	var uk = upperCase(k), uni_array = repSign(k), w2 = upperCase(unV2(unV(word))), dont = "ƯA,ƯU".split(',');
	if (AVIMObj.DAWEO.indexOf(uk) >= 0) {
		if(uk == AVIMObj.moc) {
			if((w2.indexOf("UU") >= 0) && (AVIMObj.tw5 != dont[1])) {
				if(w2.indexOf("UU") == (word.length - 2)) {
					res=2;
				} else {
					return false;
				}
			} else if(w2.indexOf("UOU") >= 0) {
				if(w2.indexOf("UOU") == (word.length-3)) {
					res=2;
				} else {
					return false;
				}
			}
		}
		if(!res) {
			for(g = 1; g <= word.length; g++) {
				cc = word.substr(word.length - g, 1);
				pc = upperCase(word.substr(word.length - g - 1, 1));
				uc = upperCase(cc);
				for(h = 0; h < dont.length; h++) {
					if((AVIMObj.tw5 == dont[h]) && (AVIMObj.tw5 == unV(pc + uc))) {
						dn = true;
					}
				}
				if(dn) {
					dn = false;
					continue;
				}
				if(str.indexOf(uc) >= 0) {
					if(((uk == AVIMObj.moc) && (unV(uc) == "U") && (upperCase(unV(word.substr(word.length - g + 1, 1))) == "A")) || ((uk == AVIMObj.trang) && (unV(uc) == 'A') && (unV(pc) == 'U'))) {
						if(unV(uc) == "U") {
							tv=1;
						} else {
							tv=2;
						}
						var ccc = upperCase(word.substr(word.length - g - tv, 1));
						if(ccc != "Q") {
							res = g + tv - 1;
						} else if(uk == AVIMObj.trang) {
							res = g;
						} else if(AVIMObj.moc != AVIMObj.trang) {
							return false;
						}
					} else {
						res = g;
					}
					if(!_whit || (uw.indexOf("Ư") < 0) || (uw.indexOf("W") < 0)) {
						break;
					}
				} else if(DAWEOFA.indexOf(uc) >= 0) {
					if(uk == AVIMObj.D) {
						if(cc == "đ") {
							res = [g, 'd'];
						} else if(cc == "Đ") {
							res = [g, 'D'];
						}
					} else {
						res = DAWEOF(cc, uk, g);
					}
					if(res) break;
				}
			}
		}
	}
	
	var tEC;
	if((uk != AVIMObj.Z) && (AVIMObj.DAWEO.indexOf(uk) < 0)) {
		tEC = retKC(uk);
		for(g = 0;g < tEC.length; g++) {
			tE += fromCharCode(tEC[g]);
		}
	}
	for(g = 1; g <= word.length; g++) {
		if(AVIMObj.DAWEO.indexOf(uk) < 0) {
			cc = upperCase(word.substr(word.length - g, 1));
			pc = upperCase(word.substr(word.length - g - 1, 1));
			if(str.indexOf(cc) >= 0) {
				if(cc == 'U') {
					if(pc != 'Q') {
						c++;
						vowA[vowA.length] = g;
					}
				} else if(cc == 'I') {
					if((pc != 'G') || (c <= 0)) {
						c++;
						vowA[vowA.length] = g;
					}
				} else {
					c++;
					vowA[vowA.length] = g;
				}
			} else if(uk != AVIMObj.Z) {
				for(h = 0; h < uni_array.length; h++) if(uni_array[h] == word.charCodeAt(word.length - g)) {
					if(AVIMObj.spellerr(word, k)) {
						return false;
					}
					return [g, tEC[h % 24]];
				}
				for(h = 0; h < tEC.length; h++) {
					if(tEC[h] == word.charCodeAt(word.length - g)) {
						return [g, fromCharCode($_skey[h])];
					}
				}
			}
		}
	}
	if((uk != AVIMObj.Z) && (typeof(res) != 'object')) {
		if(AVIMObj.spellerr(word, k)) {
			return false;
		}
	}
	if(AVIMObj.DAWEO.indexOf(uk) < 0) {
		for(g = 1; g <= word.length; g++) {
			if((uk != AVIMObj.Z) && (s.indexOf(word.substr(word.length - g, 1)) >= 0)) {
				return g;
			} else if(tE.indexOf(word.substr(word.length - g, 1)) >= 0) {
				for(h = 0; h < tEC.length; h++) {
					if(word.substr(word.length - g, 1).charCodeAt(0) == tEC[h]) {
						return [g, fromCharCode($_skey[h])];
					}
				}
			}
		}
	}
	if(res) {
		return res;
	}
	if((c == 1) || (uk == AVIMObj.Z)) {
		return vowA[0];
	} else if(c == 2) {
		var v = 2;
		if(word.substr(word.length - 1) == " ") {
			v = 3;
		}
		var ttt = upperCase(word.substr(word.length - v, 2));
		if((oldAccent === 0) && ((ttt == "UY") || (ttt == "OA") || (ttt == "OE"))) {
			return vowA[0];
		}
		var c2 = 0, fdconsonant, sc = "BCD" + fromCharCode(272) + "GHKLMNPQRSTVX", dc = "CH,GI,KH,NGH,GH,NG,NH,PH,QU,TH,TR".split(',');
		for(h = 1; h <= word.length; h++) {
			fdconsonant=false;
			for(g = 0; g < dc.length; g++) {
				if(upperCase(word.substr(word.length - h - dc[g].length + 1, dc[g].length)).indexOf(dc[g])>=0) {
					c2++;
					fdconsonant = true;
					if(dc[g] != 'NGH') {
						h++;
					} else {
						h+=2;
					}
				}
			}
			if(!fdconsonant) {
				if(sc.indexOf(upperCase(word.substr(word.length - h, 1))) >= 0) {
					c2++;
				} else { 
					break;
				}
			}
		}
		if((c2 == 1) || (c2 == 2)) {
			return vowA[0];
		} else {
			return vowA[1];
		}
	} else if(c == 3) {
		return vowA[1];
	} else return false;
}

function replaceChar(o, pos, c) {
	var bb = false;
	var replaceBy, wfix, r;
	if(!notNumber(c)) {
		replaceBy = fromCharCode(c);
		wfix = upperCase(unV(fromCharCode(c)));
		AVIMObj.changed = true;
	} else {
		replaceBy = c;
		if((upperCase(c) == "O") && _whit) {
			bb=true;
		}
	}
	if(!o.data) {
		var savePos = o.selectionStart, sst = o.scrollTop;
		r = "";
		if ((upperCase(o.value.substr(pos - 1, 1)) == 'U') && (pos < savePos - 1) && (upperCase(o.value.substr(pos - 2, 1)) != 'Q')) {
			if((wfix == "Ơ") || bb) {
				if (o.value.substr(pos-1,1) == 'u') {
					r = fromCharCode(432);
				} else {
					r = fromCharCode(431);
				}
			}
			if(bb) {
				AVIMObj.changed = true;
				if(c == "o") {
					replaceBy = "ơ";
				} else {
					replaceBy = "Ơ";
				}
			}
		}
		o.value = o.value.substr(0, pos) + replaceBy + o.value.substr(pos + 1);
		if(r) o.value = o.value.substr(0, pos - 1) + r + o.value.substr(pos);
		o.setSelectionRange(savePos, savePos);
		o.scrollTop = sst;
	} else {
		r = "";
		if ((upperCase(o.data.substr(pos - 1, 1)) == 'U') && (pos < o.pos - 1)) {
			if((wfix == "Ơ") || bb) {
				if (o.data.substr(pos - 1, 1) == 'u') {
					r = fromCharCode(432);
				} else {
					r = fromCharCode(431);
				}
			}
			if(bb) {
				AVIMObj.changed = true;
				if(c == "o") {
					replaceBy = "ơ";
				} else {
					replaceBy = "Ơ";
				}
			}
		}
		o.deleteData(pos, 1);
		o.insertData(pos, replaceBy);
		if(r) {
			o.deleteData(pos - 1, 1);
			o.insertData(pos - 1, r);
		}
	}
	if(_whit) {
		_whit=false;
	}
}

function tr(k, word, by, sf, i) {
	var r, pos = findC(word, k, sf), g;
	if(pos) {
		if(pos[1]) {
			return replaceChar(AVIMObj.oc, i-pos[0], pos[1]);
		} else {
			var c, pC = word.substr(word.length - pos, 1), cmp;
			r = sf;
			for(g = 0; g < r.length; g++) {
				if(notNumber(r[g]) || (r[g] == "e")) {
					cmp = pC;
				} else {
					cmp = pC.charCodeAt(0);
				}
				if(cmp == r[g]) {
					if(!notNumber(by[g])) {
						c = by[g];
					} else {
						c = by[g].charCodeAt(0);
					}
				
					return replaceChar(AVIMObj.oc, i - pos, c);
				}
			}
		}
	}
	return false;
}

function main(word, k, i, a, noNormC) {
	var uk = upperCase(k), bya = [AVIMObj.db1, AVIMObj.ab1, AVIMObj.eb1, AVIMObj.ob1, AVIMObj.mocb1, AVIMObj.trangb1], got = false, t = "d,D,a,A,a,A,o,O,u,U,e,E,o,O".split(",");
	var sfa = [AVIMObj.ds1, AVIMObj.as1, AVIMObj.es1, AVIMObj.os1, AVIMObj.mocs1, AVIMObj.trangs1], by = [], sf = [], h, g;
	if((method == 2) || ((method === 0) && (a[0] == "9"))) {
		AVIMObj.DAWEO = "6789";
		AVIMObj.SFJRX = "12534";
		AVIMObj.S = "1";
		AVIMObj.F = "2";
		AVIMObj.J = "5";
		AVIMObj.R = "3";
		AVIMObj.X = "4";
		AVIMObj.Z = "0";
		AVIMObj.D = "9";
		AVIMObj.FRX = "234";
		AVIMObj.AEO = "6";
		AVIMObj.moc = "7";
		AVIMObj.trang = "8";
		AVIMObj.them = "678";
		AVIMObj.A = "^";
		AVIMObj.E = "^";
		AVIMObj.O = "^";
	} else if((method == 3) || ((method === 0) && (a[4] == "+"))) {
		AVIMObj.DAWEO = "^+(D";
		AVIMObj.SFJRX = "'`.?~";
		AVIMObj.S = "'";
		AVIMObj.F = "`";
		AVIMObj.J = ".";
		AVIMObj.R = "?";
		AVIMObj.X = "~";
		AVIMObj.Z = "-";
		AVIMObj.D = "D";
		AVIMObj.FRX = "`?~";
		AVIMObj.AEO = "^";
		AVIMObj.moc = "+";
		AVIMObj.trang = "(";
		AVIMObj.them = "^+(";
		AVIMObj.A = "^";
		AVIMObj.E = "^";
		AVIMObj.O = "^";
	} else if((method == 4) || ((method === 0) && (a[4] == "*"))) {
		AVIMObj.DAWEO = "^*(D";
		AVIMObj.SFJRX = "'`.?~";
		AVIMObj.S = "'";
		AVIMObj.F = "`";
		AVIMObj.J = ".";
		AVIMObj.R = "?";
		AVIMObj.X = "~";
		AVIMObj.Z = "-";
		AVIMObj.D = "D";
		AVIMObj.FRX = "`?~";
		AVIMObj.AEO = "^";
		AVIMObj.moc = "*";
		AVIMObj.trang = "(";
		AVIMObj.them = "^*(";
		AVIMObj.A = "^";
		AVIMObj.E = "^";
		AVIMObj.O = "^";
	} else if((method == 1) || ((method === 0) && (a[0] == "D"))) {
		AVIMObj.SFJRX = "SFJRX";
		AVIMObj.DAWEO = "DAWEO";
		AVIMObj.D = 'D';
		AVIMObj.S = 'S';
		AVIMObj.F = 'F';
		AVIMObj.J = 'J';
		AVIMObj.R = 'R';
		AVIMObj.X = 'X';
		AVIMObj.Z = 'Z';
		AVIMObj.FRX = "FRX";
		AVIMObj.them = "AOEW";
		AVIMObj.trang = "W";
		AVIMObj.moc = "W";
		AVIMObj.A = "A";
		AVIMObj.E = "E";
		AVIMObj.O = "O";
	}
	if(AVIMObj.SFJRX.indexOf(uk) >= 0) {
		var ret = sr(word,k,i);
		got=true;
		if(ret) {
			return ret;
		}
	} else if(uk == AVIMObj.Z) {
		sf = repSign(null);
		for(h = 0; h < AVIMObj.english.length; h++) {
			sf[sf.length] = AVIMObj.lowen.charCodeAt(h);
			sf[sf.length] = AVIMObj.english.charCodeAt(h);
		}
		for(h = 0; h < 5; h++) {
			for(g = 0; g < $_skey.length; g++) {
				by[by.length] = $_skey[g];
			}
		}
		for(h = 0; h < t.length; h++) {
			by[by.length] = t[h];
		}
		got = true;
	} else {
		for(h = 0; h < a.length; h++) {
			if(a[h] == uk) {
				got = true;
				by = by.concat(bya[h]);
				sf = sf.concat(sfa[h]);
			}
		}
	}
	if(uk == AVIMObj.moc) {
		_whit = true;
	}
	if(!got) {
		if(noNormC) {
			return;
		} else {
			return normC(word, k, i);
		}
	}
	return DAWEOZ(k, word, by, sf, i, uk);
}

function DAWEOZ(k, word, by, sf, i, uk) {
	if((AVIMObj.DAWEO.indexOf(uk) >= 0) || (AVIMObj.Z.indexOf(uk) >= 0)) {
		return tr(k, word, by, sf, i);
	}
}

function normC(word, k, i) {
	var uk = upperCase(k), u = repSign(null), fS, c, j, h;
	if(k.charCodeAt(0) == 32) {
		return;
	}
	for(j = 1; j <= word.length; j++) {
		for(h = 0; h < u.length; h++) {
			if(u[h] == word.charCodeAt(word.length - j)) {
				if(h <= 23) {
					fS = AVIMObj.S;
				} else if(h <= 47) {
					fS = AVIMObj.F;
				} else if(h <= 71) {
					fS = AVIMObj.J;
				} else if(h <= 95) {
					fS = AVIMObj.R;
				} else {
					fS = AVIMObj.X;
				}
				c = $_skey[h % 24];
				if(($_alphabet.indexOf(uk) < 0) && (AVIMObj.D2.indexOf(uk) < 0)) {
					return word;
				}
				word = unV(word);
				// TODO: NEW CODE
				//return;
				// TODO: OLD CODE
				if(!AVIMObj.changed) {
					word += k;
				}
			
				var sp = AVIMObj.oc.selectionStart, pos = sp;
				if(!AVIMObj.changed) {
					var sst = AVIMObj.oc.scrollTop;
					pos += k.length;
					if(!AVIMObj.oc.data) {
						AVIMObj.oc.value = AVIMObj.oc.value.substr(0, sp) + k + AVIMObj.oc.value.substr(AVIMObj.oc.selectionEnd);
						AVIMObj.changed = true;
						AVIMObj.oc.scrollTop = sst;
					} else {
						AVIMObj.oc.insertData(AVIMObj.oc.pos, k);
						AVIMObj.oc.pos++;
						_range.setEnd(AVIMObj.oc, AVIMObj.oc.pos);
						AVIMObj.specialChange = true;
					}
				}
				if(!AVIMObj.oc.data) {
					AVIMObj.oc.setSelectionRange(pos, pos);
				}
				if(!ckspell(word, fS)) {
					replaceChar(AVIMObj.oc, i - j, c);
					var a = [AVIMObj.D];
					if(!AVIMObj.oc.data) {
						main(word, fS, pos, a, false);
					} else {
						var ww = mozGetText(getEditorObject(AVIMObj.oc));
						main(ww[0], fS, ww[1], a, false);
					}
				}
			}
		}
	}
}

function DAWEOF(cc, k, g) {
	var ret = [g], kA = [AVIMObj.A, AVIMObj.moc, AVIMObj.trang, AVIMObj.E, AVIMObj.O], z, a;
	var ccA = [AVIMObj.aA, AVIMObj.mocA, AVIMObj.trangA, AVIMObj.eA, AVIMObj.oA], ccrA = [AVIMObj.arA, AVIMObj.mocrA, AVIMObj.arA, AVIMObj.erA, AVIMObj.orA];
	for(a = 0; a < kA.length; a++) {
		if(k == kA[a]) {
			for(z = 0; z < ccA[a].length; z++) {
				if(cc == ccA[a][z]) {
					ret[1] = ccrA[a][z];
				}
			}
		}
	}
	if(ret[1]) {
		return ret;
	} else {
		return false;
	}
}

function retKC(k) {
	if(k == AVIMObj.S) {
		return [225,7845,7855,233,7871,237,243,7889,7899,250,7913,253,193,7844,7854,201,7870,205,211,7888,7898,218,7912,221];
	}
	if(k == AVIMObj.F) {
		return [224,7847,7857,232,7873,236,242,7891,7901,249,7915,7923,192,7846,7856,200,7872,204,210,7890,7900,217,7914,7922];
	}
	if(k == AVIMObj.J) {
		return [7841,7853,7863,7865,7879,7883,7885,7897,7907,7909,7921,7925,7840,7852,7862,7864,7878,7882,7884,7896,7906,7908,7920,7924];
	}
	if(k == AVIMObj.R) {
		return [7843,7849,7859,7867,7875,7881,7887,7893,7903,7911,7917,7927,7842,7848,7858,7866,7874,7880,7886,7892,7902,7910,7916,7926];
	}
	if(k == AVIMObj.X) {
		return [227,7851,7861,7869,7877,297,245,7895,7905,361,7919,7929,195,7850,7860,7868,7876,296,213,7894,7904,360,7918,7928];
	}
}

function unV(word) {
	var u = repSign(null), b, a;
	for(a = 1; a <= word.length; a++) {
		for(b = 0; b < u.length; b++) {
			if(u[b] == word.charCodeAt(word.length - a)) {
				word = word.substr(0, word.length - a) + fromCharCode($_skey[b % 24]) + word.substr(word.length - a + 1);
			}
		}
	}
	return word;
}

function unV2(word) {
	var a, b;
	for(a = 1; a <= word.length; a++) {
		for(b = 0; b < $_skey.length; b++) {
			if($_skey[b] == word.charCodeAt(word.length - a)) {
				word = word.substr(0, word.length - a) + AVIMObj.skey2[b] + word.substr(word.length - a + 1);
			}
		}
	}
	return word;
}

function repSign(k) {
	var t = [], u = [], a, b;
	for(a = 0; a < 5; a++) {
		if((k === null)||(AVIMObj.SFJRX.substr(a, 1) != upperCase(k))) {
			t = retKC(AVIMObj.SFJRX.substr(a, 1));
			for(b = 0; b < t.length; b++) u[u.length] = t[b];
		}
	}
	return u;
}

function sr(word, k, i) {
	var sf = getSF(), pos = findC(word, k, sf);
	if(pos) {
		if(pos[1]) {
			replaceChar(AVIMObj.oc, i-pos[0], pos[1]);
		} else {
			var c = retUni(word, k, pos);
			replaceChar(AVIMObj.oc, i-pos, c);
		}
	}
	return false;
}

function retUni(word, k, pos) {
	var u = retKC(upperCase(k)), uC, lC, c = word.charCodeAt(word.length - pos), a, t = fromCharCode(c);
	for(a = 0; a < $_skey.length; a++) {
		if($_skey[a] == c) {
			if(a < 12) {
				lC=a;
				uC=a+12;
			} else {
				lC = a - 12;
				uC=a;
			}
			if(t != upperCase(t)) {
				return u[lC];
			}
			return u[uC];
		}
	}
}

/*function ifInit(word) {
	var sel = word.getSelection();
	_range = sel ? sel.getRangeAt(0) : document.createRange();
}/**/

function ifMoz(e) {
	// Init code for editable iframes and divs
	var code = e.which, avim = AVIMObj.AVIM, cwi = e.target.parentNode.wi;
	if(typeof(avim) == "undefined") avim = AVIMObj;
	if(typeof(cwi) == "undefined") cwi = e.target.parentNode.parentNode.wi;
	if(typeof(cwi) == "undefined") cwi = window;
	if(e.ctrlKey || (e.altKey && (code != 92) && (code != 126))) return;

	// get current caret and its node
	var sel = cwi.getSelection();
	var range = sel ? sel.getRangeAt(0) : document.createRange();
	_range = range;
	var node = range.endContainer, newPos;

	avim.sk = fromCharCode(code);
	avim.saveStr = "";
	if(checkCode(code) || !range.startOffset || (typeof(node.data) == 'undefined')) return;
	node.sel = false;

	if(node.data) {
		avim.saveStr = node.data.substr(range.endOffset);
		if(range.startOffset != range.endOffset) {
			node.sel=true;
		}
		node.deleteData(range.startOffset, node.data.length);
	}

	if(!node.data) {
		range.setStart(node, 0);
		range.setEnd(node, range.endOffset);
		sel.removeAllRanges();
		sel.addRange(range);
		return;
	}

	node.value = node.data;
	node.pos = node.data.length;
	node.which=code;
	start(node, e);
	node.insertData(node.data.length, avim.saveStr);
	newPos = node.data.length - avim.saveStr.length;

	// Set caret back to node
	range.setStart(node, newPos);
	range.setEnd(node, newPos);
	sel.removeAllRanges();
	sel.addRange(range);

	if(avim.specialChange) {
		avim.specialChange = false;
		avim.changed = false;
		node.deleteData(node.pos - 1, 1);
	}
	if(avim.changed) {
		avim.changed = false;
		e.preventDefault();
	}
}

function checkCode(code) {
	if(((onOff === 0) || ((code < 45) && (code != 42) && (code != 32) && (code != 39) && (code != 40) && (code != 43)) || (code == 145) || (code == 255))) {
		return true;
	}
}

function notWord(word) {
	var str = " \r\n#,\\;.:-_()<>+-*/=?!\"$%{}[]\'~|^@&\t" + fromCharCode(160);
	return (str.indexOf(word) >= 0);
}

function notNumber(word) {
	if (isNaN(word) || (word == 'e')) {
		return true;
	} else {
		return false;
	}
}

function upperCase(word) {
	word = word.toUpperCase();
	var str = "êôơâăưếốớấắứềồờầằừễỗỡẫẵữệộợậặự", rep="ÊÔƠÂĂƯẾỐỚẤẮỨỀỒỜẦẰỪỄỖỠẪẴỮỆỘỢẶỰ", io;
	for(var i = 0; i < word.length; i++) {
		io = str.indexOf(word.substr(i, 1));
		if(io >= 0) {
			word = word.substr(0, i) + rep.substr(io, 1) + word.substr(i + 1);
		}
	}
	return word;
}

