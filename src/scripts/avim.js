/*
 *  AVIM for Chrome based on avim.js by Hieu Tran Dang
 * 
 *	Copyright (C) 2011-2014 Nguyen Kim Kha <nkimkha (at) gmail (dot) com>
 * 
 * My changes is published by GPLv3.
 *
 * Changes:
 * 	- Make it work inside Chrome Extension
 * 	- Remove unused codes for other browsers (Firefox, IE,...)
 * 	- Add API for setting from popup.html
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
 
(function(window){
	var extension = chrome.extension;
	var document = window.document;
	var sendRequest = extension.sendMessage;
	var AVIMObj = '';
	
	var AVIMGlobalConfig = {
			method: 0, //Default input method: 0=AUTO, 1=TELEX, 2=VNI, 3=VIQR, 4=VIQR*
			onOff: 1, //Starting status: 0=Off, 1=On
			ckSpell: 1, //Spell Check: 0=Off, 1=On
			oldAccent: 1, //0: New way (oa`, oe`, uy`), 1: The good old day (o`a, o`e, u`y)
			useCookie: 0, //Cookies: 0=Off, 1=On
			exclude: ["email"] //IDs of the fields you DON'T want to let users type Vietnamese in
		};

	//Set to true the methods which you want to be included in the AUTO method
	var AVIMAutoConfig = {
		telex: true,
		vni: true,
		viqr: false,
		viqrStar: false
	};

	function AVIM()	{
		this.attached = [];
		this.changed = false;
		this.agt = navigator.userAgent.toLowerCase();
		this.alphabet = "QWERTYUIOPASDFGHJKLZXCVBNM\ ";
		this.support = true;
		this.ver = 0;
		this.specialChange = false;
		this.kl = 0;
		this.skey = [97,226,259,101,234,105,111,244,417,117,432,121,65,194,258,69,202,73,79,212,416,85,431,89];
		this.fID = document.getElementsByTagName("iframe");
		this.range = null;
		this.whit = false;
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
	
		this.support = true;
		this.spellerr = (AVIMGlobalConfig.ckSpell == 1) ? ckspell : nospell;
	
	}

	function fcc(x) {
		return String.fromCharCode(x);
	}
	
	function getSF() {
		var sf = [], x;
		for(x = 0; x < AVIMObj.skey.length; x++) {
			sf[sf.length] = fcc(AVIMObj.skey[x]);
		}
		return sf;
	}
	
	function nospell(w, k) {
		return false;
	}
	
	function ckspell(w, k) {
		w = unV(w);
		var exc = "UOU,IEU".split(','), z, next = true, noE = "UU,UOU,UOI,IEU,AO,IA,AI,AY,AU,AO".split(','), noBE = "YEU";
		var check = true, noM = "UE,UYE,IU,EU,UY".split(','), noMT = "AY,AU".split(','), noT = "UA", t = -1, notV2 = "IAO";
		var uw = upperCase(w), tw = uw, update = false, gi = "IO", noAOEW = "OE,OO,AO,EO,IA,AI".split(','), noAOE = "OA", test, a, b;
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
	
	function mozGetText(obj) {
		var v, pos, w = "", g = 1;
		v = (obj.data) ? obj.data : ( (obj.value) ? obj.value : obj.innerText );
		if(v.length <= 0) {
			return false;
		}
		if(!obj.data) {
			if(!obj.setSelectionRange) {
				return false;
			}
			pos = obj.selectionStart;
		} else {
			pos = obj.pos;
		}
		if(obj.selectionStart != obj.selectionEnd) {
			return ["", pos];
		}
		while(1) {
			if(pos - g < 0) {
				break;
			} else if(notWord(v.substr(pos - g, 1))) {
				if(v.substr(pos - g, 1) == "\\") {
					w = v.substr(pos - g, 1) + w;
				}
				break;
			} else {
				w = v.substr(pos - g, 1) + w;
			}
			g++;
		}
		return [w, pos];
	}
	
	function start(obj, key) {
		var w = "", method = AVIMGlobalConfig.method, dockspell = AVIMGlobalConfig.ckSpell, uni, uni2 = false, uni3 = false, uni4 = false;
		AVIMObj.oc=obj;
		var telex = "D,A,E,O,W,W".split(','), vni = "9,6,6,6,7,8".split(','), viqr = "D,^,^,^,+,(".split(','), viqr2 = "D,^,^,^,*,(".split(','), a, noNormC;
		if(method === 0) {
			var arr = [], check = [AVIMAutoConfig.telex, AVIMAutoConfig.vni, AVIMAutoConfig.viqr, AVIMAutoConfig.viqrStar];
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
		} else if(method == 1) {
			uni = telex;
			AVIMObj.D2 = "DAWEO";
		}
		else if(method == 2) {
			uni = vni;
			AVIMObj.D2 = "6789";
		}
		else if(method == 3) {
			uni = viqr;
			AVIMObj.D2 = "D^+(";
		}
		else if(method == 4) {
			uni = viqr2;
			AVIMObj.D2 = "D^*(";
		}
	
		key = fcc(key.which);
		w = mozGetText(obj);
		if(!w || obj.sel) {
			return;
		}
		if(AVIMObj.D2.indexOf(upperCase(key)) >= 0) {
			noNormC = true;
		} else {
			noNormC = false;
		}
		main(w[0], key, w[1], uni, noNormC);
		if(!dockspell) {
			w = mozGetText(obj);
		}
		if(w && uni2 && !AVIMObj.changed) {
			main(w[0], key, w[1], uni2, noNormC);
		}
		if(!dockspell) {
			w = mozGetText(obj);
		}
		if(w && uni3 && !AVIMObj.changed) {
			main(w[0], key, w[1], uni3, noNormC);
		}
		if(!dockspell) {
			w = mozGetText(obj);
		}
		if(w && uni4 && !AVIMObj.changed) {
			main(w[0], key, w[1], uni4, noNormC);
		}
	
		if(AVIMObj.D2.indexOf(upperCase(key)) >= 0) {
			w = mozGetText(obj);
			if(!w) {
				return;
			}
			normC(w[0], key, w[1]);
		}
	}
	
	function findC(w, k, sf) {
		var method = AVIMGlobalConfig.method;
		if(((method == 3) || (method == 4)) && (w.substr(w.length - 1, 1) == "\\")) {
			return [1, k.charCodeAt(0)];
		}
		var str = "", res, cc = "", pc = "", tE = "", vowA = [], s = "ÂĂÊÔƠƯêâăơôư", c = 0, dn = false, uw = upperCase(w), tv, g;
		var DAWEOFA = upperCase(AVIMObj.aA.join() + AVIMObj.eA.join() + AVIMObj.mocA.join() + AVIMObj.trangA.join() + AVIMObj.oA.join() + AVIMObj.english), h, uc;
		for(g = 0; g < sf.length; g++) {
			if(notNumber(sf[g])) {
				str += sf[g];
			} else {
				str += fcc(sf[g]);
			}
		}
		var uk = upperCase(k), uni_array = repSign(k), w2 = upperCase(unV2(unV(w))), dont = "ƯA,ƯU".split(',');
		if (AVIMObj.DAWEO.indexOf(uk) >= 0) {
			if(uk == AVIMObj.moc) {
				if((w2.indexOf("UU") >= 0) && (AVIMObj.tw5 != dont[1])) {
					if(w2.indexOf("UU") == (w.length - 2)) {
						res=2;
					} else {
						return false;
					}
				} else if(w2.indexOf("UOU") >= 0) {
					if(w2.indexOf("UOU") == (w.length-3)) {
						res=2;
					} else {
						return false;
					}
				}
			}
			if(!res) {
				for(g = 1; g <= w.length; g++) {
					cc = w.substr(w.length - g, 1);
					pc = upperCase(w.substr(w.length - g - 1, 1));
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
						if(((uk == AVIMObj.moc) && (unV(uc) == "U") && (upperCase(unV(w.substr(w.length - g + 1, 1))) == "A")) || ((uk == AVIMObj.trang) && (unV(uc) == 'A') && (unV(pc) == 'U'))) {
							if(unV(uc) == "U") {
								tv=1;
							} else {
								tv=2;
							}
							var ccc = upperCase(w.substr(w.length - g - tv, 1));
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
						if(!AVIMObj.whit || (uw.indexOf("Ư") < 0) || (uw.indexOf("W") < 0)) {
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
		if((uk != AVIMObj.Z) && (AVIMObj.DAWEO.indexOf(uk) < 0)) {
			var tEC = retKC(uk);
			for(g = 0;g < tEC.length; g++) {
				tE += fcc(tEC[g]);
			}
		}
		for(g = 1; g <= w.length; g++) {
			if(AVIMObj.DAWEO.indexOf(uk) < 0) {
				cc = upperCase(w.substr(w.length - g, 1));
				pc = upperCase(w.substr(w.length - g - 1, 1));
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
					for(h = 0; h < uni_array.length; h++) if(uni_array[h] == w.charCodeAt(w.length - g)) {
						if(AVIMObj.spellerr(w, k)) {
							return false;
						}
						return [g, tEC[h % 24]];
					}
					for(h = 0; h < tEC.length; h++) {
						if(tEC[h] == w.charCodeAt(w.length - g)) {
							return [g, fcc(AVIMObj.skey[h])];
						}
					}
				}
			}
		}
		if((uk != AVIMObj.Z) && (typeof(res) != 'object')) {
			if(AVIMObj.spellerr(w, k)) {
				return false;
			}
		}
		if(AVIMObj.DAWEO.indexOf(uk) < 0) {
			for(g = 1; g <= w.length; g++) {
				if((uk != AVIMObj.Z) && (s.indexOf(w.substr(w.length - g, 1)) >= 0)) {
					return g;
				} else if(tE.indexOf(w.substr(w.length - g, 1)) >= 0) {
					for(h = 0; h < tEC.length; h++) {
						if(w.substr(w.length - g, 1).charCodeAt(0) == tEC[h]) {
							return [g, fcc(AVIMObj.skey[h])];
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
			if(w.substr(w.length - 1) == " ") {
				v = 3;
			}
			var ttt = upperCase(w.substr(w.length - v, 2));
			if((AVIMGlobalConfig.oldAccent === 0) && ((ttt == "UY") || (ttt == "OA") || (ttt == "OE"))) {
				return vowA[0];
			}
			var c2 = 0, fdconsonant, sc = "BCD" + fcc(272) + "GHKLMNPQRSTVX", dc = "CH,GI,KH,NGH,GH,NG,NH,PH,QU,TH,TR".split(',');
			for(h = 1; h <= w.length; h++) {
				fdconsonant=false;
				for(g = 0; g < dc.length; g++) {
					if(upperCase(w.substr(w.length - h - dc[g].length + 1, dc[g].length)).indexOf(dc[g])>=0) {
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
					if(sc.indexOf(upperCase(w.substr(w.length - h, 1))) >= 0) {
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
			replaceBy = fcc(c);
			wfix = upperCase(unV(fcc(c)));
			AVIMObj.changed = true;
		} else {
			replaceBy = c;
			if((upperCase(c) == "O") && AVIMObj.whit) {
				bb=true;
			}
		}
		if(!o.data) {
			var savePos = o.selectionStart, sst = o.scrollTop;
			r = "";
			if ((upperCase(o.value.substr(pos - 1, 1)) == 'U') && (pos < savePos - 1) && (upperCase(o.value.substr(pos - 2, 1)) != 'Q')) {
				if((wfix == "Ơ") || bb) {
					if (o.value.substr(pos-1,1) == 'u') {
						r = fcc(432);
					} else {
						r = fcc(431);
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
						r = fcc(432);
					} else {
						r = fcc(431);
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
		if(AVIMObj.whit) {
			AVIMObj.whit=false;
		}
	}
	
	function tr(k, w, by, sf, i) {
		var r, pos = findC(w, k, sf), g;
		if(pos) {
			if(pos[1]) {
				return replaceChar(AVIMObj.oc, i-pos[0], pos[1]);
			} else {
				var c, pC = w.substr(w.length - pos, 1), cmp;
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
	
	function main(w, k, i, a, noNormC) {
		var uk = upperCase(k), bya = [AVIMObj.db1, AVIMObj.ab1, AVIMObj.eb1, AVIMObj.ob1, AVIMObj.mocb1, AVIMObj.trangb1], got = false, t = "d,D,a,A,a,A,o,O,u,U,e,E,o,O".split(",");
		var sfa = [AVIMObj.ds1, AVIMObj.as1, AVIMObj.es1, AVIMObj.os1, AVIMObj.mocs1, AVIMObj.trangs1], by = [], sf = [], method = AVIMGlobalConfig.method, h, g;
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
			var ret = sr(w,k,i);
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
				for(g = 0; g < AVIMObj.skey.length; g++) {
					by[by.length] = AVIMObj.skey[g];
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
			AVIMObj.whit = true;
		}
		if(!got) {
			if(noNormC) {
				return;
			} else {
				return normC(w, k, i);
			}
		}
		return DAWEOZ(k, w, by, sf, i, uk);
	}
	
	function DAWEOZ(k, w, by, sf, i, uk) {
		if((AVIMObj.DAWEO.indexOf(uk) >= 0) || (AVIMObj.Z.indexOf(uk) >= 0)) {
			return tr(k, w, by, sf, i);
		}
	}
	
	function normC(w, k, i) {
		var uk = upperCase(k), u = repSign(null), fS, c, j, h;
		if(k.charCodeAt(0) == 32) {
			return;
		}
		for(j = 1; j <= w.length; j++) {
			for(h = 0; h < u.length; h++) {
				if(u[h] == w.charCodeAt(w.length - j)) {
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
					c = AVIMObj.skey[h % 24];
					if((AVIMObj.alphabet.indexOf(uk) < 0) && (AVIMObj.D2.indexOf(uk) < 0)) {
						return w;
					}
					w = unV(w);
					// TODO: NEW CODE
					return;
					// TODO: OLD CODE
					//if(!space && !AVIMObj.changed) {
					//	w += k;
					//}
				
					//var sp = AVIMObj.oc.selectionStart, pos = sp;
					//if(!AVIMObj.changed) {
					//	var sst = AVIMObj.oc.scrollTop;
					//	pos += k.length;
					//	if(!AVIMObj.oc.data) {
					//		AVIMObj.oc.value = AVIMObj.oc.value.substr(0, sp) + k + AVIMObj.oc.value.substr(AVIMObj.oc.selectionEnd);
					//		AVIMObj.changed = true;
					//		AVIMObj.oc.scrollTop = sst;
					//	} else {
					//		AVIMObj.oc.insertData(AVIMObj.oc.pos, k);
					//		AVIMObj.oc.pos++;
					//		AVIMObj.range.setEnd(AVIMObj.oc, AVIMObj.oc.pos);
					//		AVIMObj.specialChange = true;
					//	}
					//}
					//if(!AVIMObj.oc.data) {
					//	AVIMObj.oc.setSelectionRange(pos, pos);
					//}
					//if(!ckspell(w, fS)) {
					//	replaceChar(AVIMObj.oc, i - j, c);
					//	if(!AVIMObj.oc.data) {
					//		var a = [AVIMObj.D];
					//		main(w, fS, pos, a, false);
					//	} else {
					//		var ww = mozGetText(AVIMObj.oc), a = [AVIMObj.D];
					//		main(ww[0], fS, ww[1], a, false);
					//	}
					//}
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
	
	function ifMoz(e) {
		// Init code for editable iframes and divs
		var code = e.which, avim = AVIMObj.AVIM, cwi = e.target.parentNode.wi;
		if(typeof(avim) == "undefined") avim = AVIMObj;
		if(typeof(cwi) == "undefined") cwi = e.target.parentNode.parentNode.wi;
		if(typeof(cwi) == "undefined") cwi = window;
		if(e.ctrlKey || (e.altKey && (code != 92) && (code != 126))) return;
	
		// get current caret and its node
		var sel = cwi.getSelection();
		var range = sel.getRangeAt(0);
		var node = range.endContainer, newPos;
	
		avim.sk = fcc(code);
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
		newPos = node.data.length - avim.saveStr.length + avim.kl;
	
		// Set caret back to node
		range.setStart(node, newPos);
		range.setEnd(node, newPos);
		sel.removeAllRanges();
		sel.addRange(range);
	
		avim.kl = 0;
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
	
	function unV(w) {
		var u = repSign(null), b, a;
		for(a = 1; a <= w.length; a++) {
			for(b = 0; b < u.length; b++) {
				if(u[b] == w.charCodeAt(w.length - a)) {
					w = w.substr(0, w.length - a) + fcc(AVIMObj.skey[b % 24]) + w.substr(w.length - a + 1);
				}
			}
		}
		return w;
	}
	
	function unV2(w) {
		var a, b;
		for(a = 1; a <= w.length; a++) {
			for(b = 0; b < AVIMObj.skey.length; b++) {
				if(AVIMObj.skey[b] == w.charCodeAt(w.length - a)) {
					w = w.substr(0, w.length - a) + AVIMObj.skey2[b] + w.substr(w.length - a + 1);
				}
			}
		}
		return w;
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
	
	function sr(w, k, i) {
		var sf = getSF(), pos = findC(w, k, sf);
		if(pos) {
			if(pos[1]) {
				replaceChar(AVIMObj.oc, i-pos[0], pos[1]);
			} else {
				var c = retUni(w, k, pos);
				replaceChar(AVIMObj.oc, i-pos, c);
			}
		}
		return false;
	}
	
	function retUni(w, k, pos) {
		var u = retKC(upperCase(k)), uC, lC, c = w.charCodeAt(w.length - pos), a, t = fcc(c);
		for(a = 0; a < AVIMObj.skey.length; a++) {
			if(AVIMObj.skey[a] == c) {
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
	
	/*function ifInit(w) {
		var sel = w.getSelection();
		AVIMObj.range = sel ? sel.getRangeAt(0) : document.createRange();
	}/**/
	
	/*function FKeyPress() {
		var obj = findFrame();
		AVIMObj.sk = fcc(obj.event.keyCode);
		if(checkCode(obj.event.keyCode) || (obj.event.ctrlKey && (obj.event.keyCode != 92) && (obj.event.keyCode != 126))) {
			return;
		}
		start(obj, AVIMObj.sk);
	}/**/
	
	function checkCode(code) {
		if(((AVIMGlobalConfig.onOff === 0) || ((code < 45) && (code != 42) && (code != 32) && (code != 39) && (code != 40) && (code != 43)) || (code == 145) || (code == 255))) {
			return true;
		}
	}
	
	function notWord(w) {
		var str = "\ \r\n#,\\;.:-_()<>+-*/=?!\"$%{}[]\'~|^\@\&\t" + fcc(160);
		return (str.indexOf(w) >= 0);
	}
	
	function notNumber(w) {
		if (isNaN(w) || (w == 'e')) {
			return true;
		} else {
			return false;
		}
	}
	
	function upperCase(w) {
		w = w.toUpperCase();
		var str = "êôơâăưếốớấắứềồờầằừễỗỡẫẵữệộợậặự", rep="ÊÔƠÂĂƯẾỐỚẤẮỨỀỒỜẦẰỪỄỖỠẪẴỮỆỘỢẶỰ", z, io;
		for(z = 0; z < w.length; z++) {
			io = str.indexOf(w.substr(z, 1));
			if(io >= 0) {
				w = w.substr(0, z) + rep.substr(io, 1) + w.substr(z + 1);
			}
		}
		return w;
	}
	
	function findIgnore(el) {
		var va = AVIMGlobalConfig.exclude, i;
		for(i = 0; i < va.length; i++) {
			if((va[i].length > 0) && (el.name == va[i] || el.id == va[i])) {
				return true;
			}
		}
		return false;
	}
	
	function findFrame() {
		var g;
		for(g = 0; g < AVIMObj.fID.length; g++) {
			if(findIgnore(AVIMObj.fID[g])) return;
			AVIMObj.frame = AVIMObj.fID[g];
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
		if((el.type != 'textarea') && (el.type != 'text')) {
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
		}
	}

	function _keyUpHandler(e) {
		var code = e.which;
	
		// Press Ctrl twice to off/on AVIM
		if (code == 17) {
			if (AVIMObj.isPressCtrl) {
				AVIMObj.isPressCtrl = false;
				sendRequest({'turn_avim':'onOff'}, configAVIM);
			} else {
				AVIMObj.isPressCtrl = true;
			}
		} else {
			AVIMObj.isPressCtrl = false;
		}
	}

	function _keyDownHandler(e) {
		var key;
		if(e == "iframe") {
			AVIMObj.frame = findFrame();
			key = AVIMObj.frame.event.keyCode;
		} else {
			key = e.which;
		}
	}
	
	function keyUpHandler(e) {
		_keyUpHandler(e);
	}

	function keyDownHandler(e) {
		_keyDownHandler(e);
	}

	function keyPressHandler(evt) {
		var a = _keyPressHandler(evt);
		if (a === false) {
			evt.preventDefault();
		}
	}
	
	function attachEvt(obj, evt, handle, capture) {
		obj.addEventListener(evt, handle, capture);
	}

	function removeEvt(obj, evt, handle, capture) {
		obj.removeEventListener(evt, handle, capture);
	}
	
	function AVIMInit(AVIM, isAttach) {
		if(AVIM.support) {
			AVIM.fID = document.getElementsByTagName("iframe");
			for(AVIM.g = 0; AVIM.g < AVIM.fID.length; AVIM.g++) {
				if(findIgnore(AVIM.fID[AVIM.g])) {
					continue;
				}
				var iframedit;
				try {
					AVIM.wi = AVIM.fID[AVIM.g].contentWindow;
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
			}
		}
	}

	function AVIMAJAXFix(counter) {
		if (isNaN(parseInt(counter))) {
			counter = 0;
		} else {
			counter = parseInt(counter);
		}
		AVIMInit(AVIMObj, true);
		counter++;
		if (counter < 100) {
			setTimeout(function(){AVIMAJAXFix(counter);}, 100);
		}
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

})(window);
