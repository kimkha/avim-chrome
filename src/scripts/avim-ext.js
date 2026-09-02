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

let AVIMObj = null;

let method = 0; //Default input method: 0=AUTO, 1=TELEX, 2=VNI, 3=VIQR, 4=VIQR*
let onOff = 1; //Starting status: 0=Off, 1=On
let checkSpell = 1; //Spell Check: 0=Off, 1=On
let oldAccent = 1; //0: New way (oa`, oe`, uy`), 1: The good old day (o`a, o`e, u`y)

// Kept on globalThis, not in a lexical binding: the page and the test harness override them after load
globalThis.exclude = ["email"]; //IDs of the fields you DON'T want to let users type Vietnamese in
//Set to true the methods which you want to be included in the AUTO method, in METHOD_KEYS order
globalThis.AVIMAutoConfig = [
	true,//telex
	true,//vni
	false,//viqr
	false//viqrStar
];

/**
 * Private variables (Only use in AVIM Object)
 */
const $_alphabet = "QWERTYUIOPASDFGHJKLZXCVBNM ";
const $_skey = [97,226,259,101,234,105,111,244,417,117,432,121,65,194,258,69,202,73,79,212,416,85,431,89]; // a,â,ă,e,ê,i,o,ô,ơ,u,ư,y,A,Â,Ă,E,Ê,I,O,Ô,Ơ,U,Ư,Y
let _range = null; // Range object, maybe from Document.createRange()
let _whit = false; // Set while a moc key is in flight, so a following o can also horn a bare u

/**
 * Per-keystroke state plus the substitution tables. `xxxs1`/`xxxb1` are search/replace pairs read
 * by index, so the two rows of a pair must stay aligned.
 */
class AVIM {
	constructor() {
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
		this.skey2 = "a,a,a,e,e,i,o,o,o,u,u,y,A,A,A,E,E,I,O,O,O,U,U,Y".split(',');

		this.spellerr = checkSpell === 1 ? ckspell : nospell;
	}
}

function fromCharCode(x) {
	return String.fromCharCode(x);
}

function getSF() {
	return $_skey.map((code) => fromCharCode(code));
}

function nospell() {
	return false;
}

const NON_VIET_LETTERS = "FJZW1234567890";

function ckspell(word, k) {
	const exc = ["UOU", "IEU"];
	const noE = ["UU", "UOU", "UOI", "IEU", "AO", "IA", "AI", "AY", "AU", "AO"];
	const noBE = "YEU";
	const noM = ["UE", "UYE", "IU", "EU", "UY"];
	const noMT = ["AY", "AU"];
	const noT = "UA";
	const notV2 = "IAO";
	const gi = "IO";
	const noAOEW = ["OE", "OO", "AO", "EO", "IA", "AI"];
	const noAOE = "OA";
	const notViet = ["AA", "AE", "EE", "OU", "YY", "YI", "IY", "EY", "EA", "EI", "II", "IO", "YO", "YA", "OOO"];
	const vSConsonant = ["B", "C", "D", "G", "H", "K", "L", "M", "N", "P", "Q", "R", "S", "T", "V", "X"];
	const vDConsonant = ["CH", "GI", "KH", "NGH", "GH", "NG", "NH", "PH", "QU", "TH", "TR"];
	const vDConsonantE = ["CH", "NG", "NH"];
	const sConsonant = ["C", "P", "T", "CH"];
	const vSConsonantE = ["C", "M", "N", "P", "T"];
	const noNHE = ["O", "U", "IE", "Ô", "Ơ", "Ư", "IÊ", "Ă", "Â", "UYE", "UYÊ", "UO", "ƯƠ", "ƯO", "UƠ", "UA", "ƯA", "OĂ", "OE", "OÊ"];
	const oMoc = ["UU", "UOU"];

	const uw = upperCase(unV(word));
	const uk = upperCase(k);
	let uw2 = unV2(uw);
	let tw = uw;
	// Stays latched once cleared: a single hit disables the check for the rest of the word.
	let check = true;
	let leadConsonant = "";
	let update = false;
	// Loop invariant: an allowed cluster anywhere in the word waives the notViet check entirely
	const hasAllowedCluster = exc.some((allowed) => uw2.includes(allowed));

	if (AVIMObj.FRX.includes(uk) && sConsonant.some((consonant) => uw.endsWith(consonant))) {
		return true;
	}
	for (let a = 0; a < uw.length; a++) {
		if (NON_VIET_LETTERS.includes(uw.charAt(a))) {
			return true;
		}
		if (hasAllowedCluster) {
			continue;
		}
		for (const pair of notViet) {
			if (!uw2.startsWith(pair, a)) {
				continue;
			}
			if (!gi.includes(pair) || (a <= 0) || (uw2.charAt(a - 1) !== "G")) {
				return true;
			}
		}
	}
	for (const consonant of vDConsonant) {
		if (tw.startsWith(consonant)) {
			tw = tw.slice(consonant.length);
			update = true;
			leadConsonant = consonant;
			break;
		}
	}
	if (!update) {
		for (const consonant of vSConsonant) {
			if (tw.startsWith(consonant)) {
				tw = tw.slice(1);
				break;
			}
		}
	}
	update = false;
	const twE = tw;
	for (const consonant of vDConsonantE) {
		if (tw.endsWith(consonant)) {
			tw = tw.slice(0, tw.length - consonant.length);
			if (consonant === "NH") {
				if (noNHE.includes(tw)) {
					return true;
				}
				if ((uk === AVIMObj.trang) && ((tw === "OA") || (tw === "A"))) {
					return true;
				}
			}
			update = true;
			break;
		}
	}
	if (!update) {
		for (const consonant of vSConsonantE) {
			if (tw.endsWith(consonant)) {
				tw = tw.slice(0, tw.length - 1);
				break;
			}
		}
	}
	if (tw) {
		if (vDConsonant.some((consonant) => tw.includes(consonant))) {
			return true;
		}
		if (vSConsonant.some((consonant) => tw.includes(consonant))) {
			return true;
		}
	}
	const firstVowel = tw.charAt(0);
	if ((leadConsonant === "NGH") && ["A", "O", "U", "Y"].includes(firstVowel)) {
		return true;
	}
	if ((leadConsonant === "NG") && ["E", "I", "Y"].includes(firstVowel)) {
		return true;
	}
	uw2 = unV2(tw);
	if (uw2 === notV2) {
		return true;
	}
	if ((tw !== twE) && noE.includes(uw2)) {
		return true;
	}
	if ((tw !== uw) && (uw2 === noBE)) {
		return true;
	}
	if ((uk !== AVIMObj.moc) && oMoc.includes(tw)) {
		return true;
	}
	// Deliberately > 0, not >= 0: a word-initial UYE is legal, an inner one is not.
	if ((uw2.indexOf("UYE") > 0) && (uk === "E")) {
		check = false;
	}
	if (AVIMObj.them.includes(uk) && check) {
		if (noAOEW.some((pair) => uw2.includes(pair))) {
			return true;
		}
		if ((uk !== AVIMObj.trang) && (uw2 === noAOE)) {
			return true;
		}
		if ((uk === AVIMObj.trang) && (AVIMObj.trang !== "W") && (uw2 === noT)) {
			return true;
		}
		if ((uk === AVIMObj.moc) && noM.includes(uw2)) {
			return true;
		}
		if (((uk === AVIMObj.moc) || (uk === AVIMObj.trang)) && noMT.includes(uw2)) {
			return true;
		}
	}
	AVIMObj.tw5 = tw;
	// A leading đ/Đ does not count toward the syllable length limit.
	const startsWithD = (uw2.charCodeAt(0) === 272) || (uw2.charCodeAt(0) === 273);
	return startsWithD ? uw2.length > 4 : uw2.length > 3;
}

function getEditorObject(ele) {
	// Falls back to innerText only when both data and value are empty, not merely absent
	const value = ele.data || ele.value || ele.innerText;
	if (!ele.data) {
		if (!ele.setSelectionRange) {
			return false;
		}
		return { v: value, s: ele.selectionStart, e: ele.selectionEnd };
	}
	return { v: value, s: ele.pos, e: ele.pos };
}

/** The word immediately before the caret, plus the caret offset. */
function mozGetText(editor) {
	if (!editor) {
		return false;
	}
	const value = editor.v;
	if (value.length <= 0) {
		return false;
	}
	const pos = editor.s;
	if (pos !== editor.e) {
		return ["", pos];
	}
	let word = "";
	for (let at = pos - 1; at >= 0; at--) {
		const char = value.charAt(at);
		if (notWord(char)) {
			// VIQR escapes the following key with a backslash, so that backslash is part of the word
			if (char === "\\") {
				word = char + word;
			}
			break;
		}
		word = char + word;
	}
	return [word, pos];
}

/** Per-method modifier keys, in the order [D, A, E, O, moc, trang]. Index 0 is TELEX (method 1). */
const METHOD_KEYS = [
	{ keys: ["D", "A", "E", "O", "W", "W"], d2: "DAWEO" },
	{ keys: ["9", "6", "6", "6", "7", "8"], d2: "6789" },
	{ keys: ["D", "^", "^", "^", "+", "("], d2: "D^+(" },
	{ keys: ["D", "^", "^", "^", "*", "("], d2: "D^*(" }
];

function start(obj, key) {
	AVIMObj.oc = obj;
	let variants;
	if (method === 0) {
		AVIMObj.D2 = METHOD_KEYS.map((entry, index) => (AVIMAutoConfig[index] ? entry.d2 : "")).join();
		variants = METHOD_KEYS.filter((entry, index) => AVIMAutoConfig[index]).map((entry) => entry.keys);
		if (variants.length === 0) {
			return;
		}
	} else {
		const entry = METHOD_KEYS[method - 1];
		if (!entry) {
			return;
		}
		AVIMObj.D2 = entry.d2;
		variants = [entry.keys];
	}

	const char = fromCharCode(key.which);
	let word = mozGetText(getEditorObject(obj));
	if (!word || obj.sel) {
		return;
	}
	const noNormC = AVIMObj.D2.includes(upperCase(char));
	main(word[0], char, word[1], variants[0], noNormC);
	for (const variant of variants.slice(1)) {
		// With spell check off the word must be re-read, because the previous variant may have edited it
		if (!checkSpell) {
			word = mozGetText(getEditorObject(obj));
		}
		if (word && !AVIMObj.changed) {
			main(word[0], char, word[1], variant, noNormC);
		}
	}

	if (AVIMObj.D2.includes(upperCase(char))) {
		word = mozGetText(getEditorObject(obj));
		if (word) {
			normC(word[0], char, word[1]);
		}
	}
}

const DOUBLE_CONSONANTS = ["CH", "GI", "KH", "NGH", "GH", "NG", "NH", "PH", "QU", "TH", "TR"];
const SINGLE_CONSONANTS = "BCDĐGHKLMNPQRSTVX";
const MODIFIED_VOWELS = "ÂĂÊÔƠƯêâăơôư";

/** Which character of `word` the key applies to: an offset from the end, or [offset, replacement]. */
function findC(word, k, sf) {
	// A trailing backslash is the VIQR escape: the key goes in literally
	if (((method === 3) || (method === 4)) && word.endsWith("\\")) {
		return [1, k.charCodeAt(0)];
	}
	const str = sf.map((entry) => (notNumber(entry) ? entry : fromCharCode(entry))).join("");
	const dont = ["ƯA", "ƯU"];
	const uw = upperCase(word);
	const uk = upperCase(k);
	const uniArray = repSign(k);
	const w2 = upperCase(unV2(unV(word)));
	const accentedBases = upperCase(
		AVIMObj.aA.join() + AVIMObj.eA.join() + AVIMObj.mocA.join() +
		AVIMObj.trangA.join() + AVIMObj.oA.join() + AVIMObj.english
	);
	const vowelsFromEnd = [];
	let res;
	let vowelCount = 0;

	if (AVIMObj.DAWEO.includes(uk)) {
		if (uk === AVIMObj.moc) {
			if (w2.includes("UU") && (AVIMObj.tw5 !== dont[1])) {
				if (w2.indexOf("UU") !== (word.length - 2)) {
					return false;
				}
				res = 2;
			} else if (w2.includes("UOU")) {
				if (w2.indexOf("UOU") !== (word.length - 3)) {
					return false;
				}
				res = 2;
			}
		}
		if (!res) {
			for (let g = 1; g <= word.length; g++) {
				const cc = word.charAt(word.length - g);
				const pc = upperCase(word.charAt(word.length - g - 1));
				const uc = upperCase(cc);
				if (dont.includes(AVIMObj.tw5) && (AVIMObj.tw5 === unV(pc + uc))) {
					continue;
				}
				if (str.includes(uc)) {
					// ua + moc and ua + trang both put the mark on the other vowel of the pair
					const shiftFromU = (uk === AVIMObj.moc) && (unV(uc) === "U") &&
						(upperCase(unV(word.charAt(word.length - g + 1))) === "A");
					const shiftFromA = (uk === AVIMObj.trang) && (unV(uc) === "A") && (unV(pc) === "U");
					if (shiftFromU || shiftFromA) {
						const tv = unV(uc) === "U" ? 1 : 2;
						// qu is a consonant cluster, so its u never takes the mark
						if (upperCase(word.charAt(word.length - g - tv)) !== "Q") {
							res = g + tv - 1;
						} else if (uk === AVIMObj.trang) {
							res = g;
						} else if (AVIMObj.moc !== AVIMObj.trang) {
							return false;
						}
					} else {
						res = g;
					}
					if (!_whit || !uw.includes("Ư") || !uw.includes("W")) {
						break;
					}
				} else if (accentedBases.includes(uc)) {
					if (uk === AVIMObj.D) {
						if (cc === "đ") {
							res = [g, "d"];
						} else if (cc === "Đ") {
							res = [g, "D"];
						}
					} else {
						res = DAWEOF(cc, uk, g);
					}
					if (res) {
						break;
					}
				}
			}
		}
	}

	let toneCodes = [];
	let toneChars = "";
	if ((uk !== AVIMObj.Z) && !AVIMObj.DAWEO.includes(uk)) {
		toneCodes = retKC(uk);
		toneChars = toneCodes.map((code) => fromCharCode(code)).join("");
	}
	if (!AVIMObj.DAWEO.includes(uk)) {
		for (let g = 1; g <= word.length; g++) {
			const cc = upperCase(word.charAt(word.length - g));
			const pc = upperCase(word.charAt(word.length - g - 1));
			if (str.includes(cc)) {
				const isQu = (cc === "U") && (pc === "Q");
				const isGi = (cc === "I") && (pc === "G") && (vowelCount > 0);
				if (!isQu && !isGi) {
					vowelCount++;
					vowelsFromEnd.push(g);
				}
			} else if (uk !== AVIMObj.Z) {
				const code = word.charCodeAt(word.length - g);
				const accentedAt = uniArray.indexOf(code);
				if (accentedAt >= 0) {
					if (AVIMObj.spellerr(word, k)) {
						return false;
					}
					return [g, toneCodes[accentedAt % 24]];
				}
				const baseAt = toneCodes.indexOf(code);
				if (baseAt >= 0) {
					return [g, fromCharCode($_skey[baseAt])];
				}
			}
		}
	}
	if ((uk !== AVIMObj.Z) && (typeof res !== "object") && AVIMObj.spellerr(word, k)) {
		return false;
	}
	if (!AVIMObj.DAWEO.includes(uk)) {
		for (let g = 1; g <= word.length; g++) {
			const char = word.charAt(word.length - g);
			if ((uk !== AVIMObj.Z) && MODIFIED_VOWELS.includes(char)) {
				return g;
			}
			if (toneChars.includes(char)) {
				const at = toneCodes.indexOf(word.charCodeAt(word.length - g));
				if (at >= 0) {
					return [g, fromCharCode($_skey[at])];
				}
			}
		}
	}
	if (res) {
		return res;
	}
	if ((vowelCount === 1) || (uk === AVIMObj.Z)) {
		return vowelsFromEnd[0];
	}
	if (vowelCount === 2) {
		return pickFromVowelPair(word, vowelsFromEnd);
	}
	if (vowelCount === 3) {
		return vowelsFromEnd[1];
	}
	return false;
}

/** With two vowels the mark goes on the first unless the syllable has a full consonant onset. */
function pickFromVowelPair(word, vowelsFromEnd) {
	const at = word.length - (word.endsWith(" ") ? 3 : 2);
	const pair = upperCase(word.slice(at, at + 2));
	if ((oldAccent === 0) && ["UY", "OA", "OE"].includes(pair)) {
		return vowelsFromEnd[0];
	}
	let consonants = 0;
	for (let h = 1; h <= word.length; h++) {
		let foundDouble = false;
		for (const consonant of DOUBLE_CONSONANTS) {
			const dcAt = word.length - h - consonant.length + 1;
			if ((dcAt >= 0) && upperCase(word.slice(dcAt, dcAt + consonant.length)).includes(consonant)) {
				consonants++;
				foundDouble = true;
				h += consonant === "NGH" ? 2 : 1;
			}
		}
		if (!foundDouble) {
			if (!SINGLE_CONSONANTS.includes(upperCase(word.charAt(word.length - h)))) {
				break;
			}
			consonants++;
		}
	}
	return (consonants === 1) || (consonants === 2) ? vowelsFromEnd[0] : vowelsFromEnd[1];
}

function replaceChar(o, pos, c) {
	const isCode = !notNumber(c);
	const wfix = isCode ? upperCase(unV(fromCharCode(c))) : "";
	let replaceBy = isCode ? fromCharCode(c) : c;
	// TELEX types ơ as "ow", so an o keyed right after a bare u turns that u into ư as well
	let addsHorn = false;
	if (isCode) {
		AVIMObj.changed = true;
	} else if ((upperCase(c) === "O") && _whit) {
		addsHorn = true;
	}
	if (!o.data) {
		const savePos = o.selectionStart;
		const scrollTop = o.scrollTop;
		let hornedU = "";
		if ((upperCase(o.value.charAt(pos - 1)) === "U") && (pos < savePos - 1) && (upperCase(o.value.charAt(pos - 2)) !== "Q")) {
			if ((wfix === "Ơ") || addsHorn) {
				hornedU = fromCharCode(o.value.charAt(pos - 1) === "u" ? 432 : 431);
			}
			if (addsHorn) {
				AVIMObj.changed = true;
				replaceBy = c === "o" ? "ơ" : "Ơ";
			}
		}
		o.value = o.value.slice(0, pos) + replaceBy + o.value.slice(pos + 1);
		if (hornedU) {
			o.value = o.value.slice(0, pos - 1) + hornedU + o.value.slice(pos);
		}
		o.setSelectionRange(savePos, savePos);
		o.scrollTop = scrollTop;
	} else {
		let hornedU = "";
		if ((upperCase(o.data.charAt(pos - 1)) === "U") && (pos < o.pos - 1)) {
			if ((wfix === "Ơ") || addsHorn) {
				hornedU = fromCharCode(o.data.charAt(pos - 1) === "u" ? 432 : 431);
			}
			if (addsHorn) {
				AVIMObj.changed = true;
				replaceBy = c === "o" ? "ơ" : "Ơ";
			}
		}
		o.deleteData(pos, 1);
		o.insertData(pos, replaceBy);
		if (hornedU) {
			o.deleteData(pos - 1, 1);
			o.insertData(pos - 1, hornedU);
		}
	}
	_whit = false;
}

function tr(k, word, by, sf, i) {
	const pos = findC(word, k, sf);
	if (!pos) {
		return false;
	}
	if (pos[1]) {
		return replaceChar(AVIMObj.oc, i - pos[0], pos[1]);
	}
	const target = word.charAt(word.length - pos);
	for (const [g, entry] of sf.entries()) {
		const matches = notNumber(entry) ? (target === entry) : (target.charCodeAt(0) === entry);
		if (matches) {
			return replaceChar(AVIMObj.oc, i - pos, notNumber(by[g]) ? by[g].charCodeAt(0) : by[g]);
		}
	}
	return false;
}

/**
 * The key each method uses for every role the engine asks about. `moc` and `trang` share the
 * same key in TELEX, which several branches rely on.
 */
const METHOD_TABLES = {
	telex: {
		SFJRX: "SFJRX", DAWEO: "DAWEO", FRX: "FRX", them: "AOEW",
		S: "S", F: "F", J: "J", R: "R", X: "X", Z: "Z", D: "D",
		moc: "W", trang: "W", A: "A", E: "E", O: "O"
	},
	vni: {
		SFJRX: "12534", DAWEO: "6789", FRX: "234", them: "678",
		S: "1", F: "2", J: "5", R: "3", X: "4", Z: "0", D: "9",
		moc: "7", trang: "8", A: "^", E: "^", O: "^"
	},
	viqr: {
		SFJRX: "'`.?~", DAWEO: "^+(D", FRX: "`?~", them: "^+(",
		S: "'", F: "`", J: ".", R: "?", X: "~", Z: "-", D: "D",
		moc: "+", trang: "(", A: "^", E: "^", O: "^"
	},
	viqrStar: {
		SFJRX: "'`.?~", DAWEO: "^*(D", FRX: "`?~", them: "^*(",
		S: "'", F: "`", J: ".", R: "?", X: "~", Z: "-", D: "D",
		moc: "*", trang: "(", A: "^", E: "^", O: "^"
	}
};

/** Base letters the Z key restores, paired with the accented forms repSign() lists. */
const Z_EXTRA_BASES = ["d", "D", "a", "A", "a", "A", "o", "O", "u", "U", "e", "E", "o", "O"];

/** VIQR is checked before TELEX because both use D as their đ key. */
function methodTableFor(keys) {
	if ((method === 2) || ((method === 0) && (keys[0] === "9"))) {
		return METHOD_TABLES.vni;
	}
	if ((method === 3) || ((method === 0) && (keys[4] === "+"))) {
		return METHOD_TABLES.viqr;
	}
	if ((method === 4) || ((method === 0) && (keys[4] === "*"))) {
		return METHOD_TABLES.viqrStar;
	}
	if ((method === 1) || ((method === 0) && (keys[0] === "D"))) {
		return METHOD_TABLES.telex;
	}
	return null;
}

function main(word, k, i, a, noNormC) {
	const uk = upperCase(k);
	const table = methodTableFor(a);
	if (table) {
		Object.assign(AVIMObj, table);
	}
	const bya = [AVIMObj.db1, AVIMObj.ab1, AVIMObj.eb1, AVIMObj.ob1, AVIMObj.mocb1, AVIMObj.trangb1];
	const sfa = [AVIMObj.ds1, AVIMObj.as1, AVIMObj.es1, AVIMObj.os1, AVIMObj.mocs1, AVIMObj.trangs1];
	let by = [];
	let sf = [];
	let got = false;

	if (AVIMObj.SFJRX.includes(uk)) {
		const ret = sr(word, k, i);
		got = true;
		if (ret) {
			return ret;
		}
	} else if (uk === AVIMObj.Z) {
		sf = repSign(null);
		for (const [h, upper] of [...AVIMObj.english].entries()) {
			sf.push(AVIMObj.lowen.charCodeAt(h), upper.charCodeAt(0));
		}
		// repSign() lists all five tone rows in $_skey order, so the base row repeats five times
		for (let row = 0; row < 5; row++) {
			by.push(...$_skey);
		}
		by.push(...Z_EXTRA_BASES);
		got = true;
	} else {
		for (const [h, keyChar] of a.entries()) {
			if (keyChar === uk) {
				got = true;
				by = by.concat(bya[h]);
				sf = sf.concat(sfa[h]);
			}
		}
	}
	if (uk === AVIMObj.moc) {
		_whit = true;
	}
	if (!got) {
		return noNormC ? undefined : normC(word, k, i);
	}
	return DAWEOZ(k, word, by, sf, i, uk);
}

function DAWEOZ(k, word, by, sf, i, uk) {
	if (AVIMObj.DAWEO.includes(uk) || AVIMObj.Z.includes(uk)) {
		return tr(k, word, by, sf, i);
	}
	return undefined;
}

/** repSign() emits 24 code points per tone, in SFJRX order, so the row index picks the tone key. */
function toneKeyForRow(row) {
	return [AVIMObj.S, AVIMObj.F, AVIMObj.J, AVIMObj.R, AVIMObj.X][Math.floor(row / 24)];
}

/** Moves an already-typed tone mark onto the vowel a newly typed modifier key just created. */
function normC(word, k, i) {
	const uk = upperCase(k);
	const accented = repSign(null);
	if (k.charCodeAt(0) === 32) {
		return undefined;
	}
	let current = word;
	// current grows by one once the keystroke is inserted, which extends this loop by one round
	for (let j = 1; j <= current.length; j++) {
		for (const [h, code] of accented.entries()) {
			if (code !== current.charCodeAt(current.length - j)) {
				continue;
			}
			if (!$_alphabet.includes(uk) && !AVIMObj.D2.includes(uk)) {
				return current;
			}
			const toneKey = toneKeyForRow(h);
			const base = $_skey[h % 24];
			current = unV(current);
			if (!AVIMObj.changed) {
				current += k;
			}
			const editor = AVIMObj.oc;
			const start = editor.selectionStart;
			let pos = start;
			if (!AVIMObj.changed) {
				pos += k.length;
				if (!editor.data) {
					const scrollTop = editor.scrollTop;
					editor.value = editor.value.slice(0, start) + k + editor.value.slice(editor.selectionEnd);
					AVIMObj.changed = true;
					editor.scrollTop = scrollTop;
				} else {
					editor.insertData(editor.pos, k);
					editor.pos++;
					_range.setEnd(editor, editor.pos);
					AVIMObj.specialChange = true;
				}
			}
			if (!editor.data) {
				editor.setSelectionRange(pos, pos);
			}
			if (!ckspell(current, toneKey)) {
				replaceChar(editor, i - j, base);
				if (!editor.data) {
					main(current, toneKey, pos, [AVIMObj.D], false);
				} else {
					const reread = mozGetText(getEditorObject(editor));
					main(reread[0], toneKey, reread[1], [AVIMObj.D], false);
				}
			}
		}
	}
	return undefined;
}

/** Strips the modifier a key would add back off an already-modified vowel, toggling it. */
function DAWEOF(cc, k, g) {
	// Every matching row is scanned, not just the first: moc and trang share a key in TELEX
	const rows = [
		[AVIMObj.A, AVIMObj.aA, AVIMObj.arA],
		[AVIMObj.moc, AVIMObj.mocA, AVIMObj.mocrA],
		[AVIMObj.trang, AVIMObj.trangA, AVIMObj.arA],
		[AVIMObj.E, AVIMObj.eA, AVIMObj.erA],
		[AVIMObj.O, AVIMObj.oA, AVIMObj.orA]
	];
	let replacement;
	for (const [keyChar, modified, plain] of rows) {
		if (keyChar !== k) {
			continue;
		}
		const at = modified.indexOf(cc);
		if (at >= 0) {
			replacement = plain[at];
		}
	}
	return replacement ? [g, replacement] : false;
}

/** Accented code points per tone, in $_skey order. Callers only read these, never mutate. */
const TONE_CODES = {
	S: [225,7845,7855,233,7871,237,243,7889,7899,250,7913,253,193,7844,7854,201,7870,205,211,7888,7898,218,7912,221],
	F: [224,7847,7857,232,7873,236,242,7891,7901,249,7915,7923,192,7846,7856,200,7872,204,210,7890,7900,217,7914,7922],
	J: [7841,7853,7863,7865,7879,7883,7885,7897,7907,7909,7921,7925,7840,7852,7862,7864,7878,7882,7884,7896,7906,7908,7920,7924],
	R: [7843,7849,7859,7867,7875,7881,7887,7893,7903,7911,7917,7927,7842,7848,7858,7866,7874,7880,7886,7892,7902,7910,7916,7926],
	X: [227,7851,7861,7869,7877,297,245,7895,7905,361,7919,7929,195,7850,7860,7868,7876,296,213,7894,7904,360,7918,7928]
};

function retKC(k) {
	const tone = ["S", "F", "J", "R", "X"].find((name) => k === AVIMObj[name]);
	return tone ? TONE_CODES[tone] : [];
}

function unV(word) {
	const u = repSign(null);
	let result = word;
	for (let a = 1; a <= result.length; a++) {
		const at = result.length - a;
		for (const [b, code] of u.entries()) {
			if (code === result.charCodeAt(at)) {
				result = result.slice(0, at) + fromCharCode($_skey[b % 24]) + result.slice(at + 1);
			}
		}
	}
	return result;
}

function unV2(word) {
	let result = word;
	for (let a = 1; a <= result.length; a++) {
		const at = result.length - a;
		for (const [b, code] of $_skey.entries()) {
			if (code === result.charCodeAt(at)) {
				result = result.slice(0, at) + AVIMObj.skey2[b] + result.slice(at + 1);
			}
		}
	}
	return result;
}

/** Every accented code point except the ones carrying tone `k`; pass null to get all of them. */
function repSign(k) {
	const codes = [];
	for (const toneKey of AVIMObj.SFJRX) {
		if ((k === null) || (toneKey !== upperCase(k))) {
			codes.push(...retKC(toneKey));
		}
	}
	return codes;
}

function sr(word, k, i) {
	const pos = findC(word, k, getSF());
	if (pos) {
		if (pos[1]) {
			replaceChar(AVIMObj.oc, i - pos[0], pos[1]);
		} else {
			replaceChar(AVIMObj.oc, i - pos, retUni(word, k, pos));
		}
	}
	return false;
}

/** The accented code point for the vowel at `pos`, matching the case of the vowel already there. */
function retUni(word, k, pos) {
	const toneCodes = retKC(upperCase(k));
	const code = word.charCodeAt(word.length - pos);
	const at = $_skey.indexOf(code);
	if (at < 0) {
		return undefined;
	}
	// $_skey holds the 12 lower case vowels first, then the same 12 in upper case
	const lowerAt = at < 12 ? at : at - 12;
	const char = fromCharCode(code);
	return char === upperCase(char) ? toneCodes[lowerAt + 12] : toneCodes[lowerAt];
}

/** A stand-in for an <input>: replaceChar and normC read .scrollTop and .setSelectionRange. */
function createTextEditor(value) {
	return {
		value,
		selectionStart: value.length,
		selectionEnd: value.length,
		scrollTop: 0,
		setSelectionRange(start, end) {
			this.selectionStart = start;
			this.selectionEnd = end;
		}
	};
}

/** The outermost editable ancestor: where an editor with its own model listens, and it survives
 * that editor re-rendering the text node out from under us between two dispatches. */
function editingHost(node) {
	let element = node.parentNode;
	let host = element;
	while (element && element.isContentEditable) {
		host = element;
		element = element.parentNode;
	}
	return host;
}

/** Fires beforeinput on the editable. False when a listener claimed the edit for its own model. */
function emitBeforeInput(host, inputType, data) {
	return host.dispatchEvent(new InputEvent("beforeinput", {
		inputType,
		data,
		bubbles: true,
		cancelable: true,
		composed: true
	}));
}

/**
 * Editors that re-render from their own model revert a DOM edit they never saw (Slate, so Discord).
 * Ones with a MutationObserver reconciler keep it (Lexical, Quill, ProseMirror) and mangle a
 * synthetic beforeinput instead, so the channel has to be chosen per host. Nothing in the DOM says
 * which is which; the only honest signal is watching one edit get reverted, which costs the first
 * conversion in a host and nothing after it.
 */
const revertingHosts = new WeakSet();
const pendingEdits = new WeakMap();

/**
 * Reverting is not enough to earn the announcement: CKEditor reverts too, but reads
 * getTargetRanges() unconditionally, so it drops the insertion and throws on the deletes. Whether an
 * editor survives a range-less beforeinput cannot be probed, so this is an allowlist, keyed on the
 * attributes slate-react needs in the DOM to map it back to its own model.
 */
function isSlateEditor(host) {
	if (typeof host.hasAttribute !== "function") {
		return false;
	}
	return host.hasAttribute("data-slate-editor") || (host.querySelector("[data-slate-string]") !== null);
}

function noteEditOutcome(host, before) {
	const pending = pendingEdits.get(host);
	if (!pending || before.startsWith(pending.wrote)) {
		return;
	}
	if (before.startsWith(pending.was) && isSlateEditor(host)) {
		revertingHosts.add(host);
	}
	pendingEdits.delete(host);
}

/**
 * Rewrites the text before the caret to `after`, from the first changed character on.
 *
 * A reverting host is told in backspaces plus one insertion, because a synthetic InputEvent carries
 * no getTargetRanges() and such an editor would otherwise apply the change at a stale caret.
 * Everyone else gets the edit itself, through execCommand, which fires input but not beforeinput.
 */
function replaceBeforeCaret(host, sel, range, node, before, after, caret) {
	let head = 0;
	while ((head < before.length) && (head < after.length) && (before.charAt(head) === after.charAt(head))) {
		head++;
	}
	const replacement = after.slice(head);

	if (revertingHosts.has(host)) {
		let claimed = false;
		for (let left = caret - head; left > 0; left--) {
			claimed = !emitBeforeInput(host, "deleteContentBackward", null) || claimed;
		}
		if (replacement) {
			claimed = !emitBeforeInput(host, "insertText", replacement) || claimed;
		}
		if (claimed) {
			return;
		}
	}

	range.setStart(node, head);
	range.setEnd(node, caret);
	sel.removeAllRanges();
	sel.addRange(range);
	const doc = node.ownerDocument ?? document;
	if (!doc.execCommand("insertText", false, replacement)) {
		// Silent, so a reverting host discards it; still better than losing the keystroke
		node.deleteData(head, caret - head);
		node.insertData(head, replacement);
		range.setStart(node, after.length);
		range.setEnd(node, after.length);
		sel.removeAllRanges();
		sel.addRange(range);
	}
	pendingEdits.set(host, { was: before, wrote: after });
}

/**
 * Handles a keypress inside a contenteditable or a designMode iframe, where there is no .value.
 * Editing the text node directly fires no events, so editors that re-render from their own model
 * (Slate, Draft, ProseMirror; Discord's message box is Slate) drop the diacritics (#30).
 */
function ifMoz(e) {
	const code = e.which;
	const avim = AVIMObj.AVIM ?? AVIMObj;
	const parent = e.target.parentNode;
	const cwi = parent.wi ?? parent.parentNode.wi ?? window;
	if (e.ctrlKey || (e.altKey && (code !== 92) && (code !== 126))) {
		return;
	}

	const sel = cwi.getSelection();
	const range = sel ? sel.getRangeAt(0) : document.createRange();
	_range = range;
	const node = range.endContainer;

	avim.sk = fromCharCode(code);
	if (checkCode(code) || !range.startOffset || (typeof node.data === "undefined")) {
		return;
	}
	// The keystroke replaces a non-empty selection, so there is no word in front of it to transform
	if (range.startOffset !== range.endOffset) {
		return;
	}

	const caret = range.endOffset;
	// Text after the caret is left out, so the engine sees the caret as the end of the value
	const before = node.data.slice(0, caret);
	const host = editingHost(node);
	noteEditOutcome(host, before);

	const editor = createTextEditor(before);
	start(editor, e);
	if (!avim.changed) {
		return;
	}
	avim.changed = false;
	e.preventDefault();
	replaceBeforeCaret(host, sel, range, node, before, editor.value, caret);
}

/** Punctuation below code 45 that still starts or continues a word. */
const TYPABLE_LOW_CODES = [32, 39, 40, 42, 43];

function checkCode(code) {
	if (onOff === 0) {
		return true;
	}
	if ((code < 45) && !TYPABLE_LOW_CODES.includes(code)) {
		return true;
	}
	return (code === 145) || (code === 255);
}

const NOT_WORD_CHARS = " \r\n#,\\;.:-_()<>+-*/=?!\"$%{}[]'~|^@&\t\u00a0";

function notWord(word) {
	return NOT_WORD_CHARS.includes(word);
}

function notNumber(word) {
	return isNaN(word) || (word === "e");
}

const LOWER_VIET = "êôơâăưếốớấắứềồờầằừễỗỡẫẵữệộợậặự";
const UPPER_VIET = "ÊÔƠÂĂƯẾỐỚẤẮỨỀỒỜẦẰỪỄỖỠẪẴỮỆỘỢẬẶỰ";

function upperCase(word) {
	return [...word.toUpperCase()]
		.map((char) => {
			const at = LOWER_VIET.indexOf(char);
			return at >= 0 ? UPPER_VIET.charAt(at) : char;
		})
		.join("");
}


/* ---- Chrome extension glue: prefs, event wiring, iframe scan ---- */
const extension = chrome.runtime;
const sendRequest = extension.sendMessage;

const INPUT_TYPES = ["textarea", "text", "search", "tel"];

/** Attaches the contenteditable handler to every designMode iframe on the page. */
function AVIMInit(avim) {
	for (const frame of document.getElementsByTagName("iframe")) {
		if (findIgnore(frame)) {
			continue;
		}
		try {
			const frameWindow = frame.contentWindow;
			const iframedit = frameWindow.document;
			iframedit.wi = frameWindow;
			if (upperCase(iframedit.designMode) === "ON") {
				iframedit.AVIM = avim;
				iframedit.addEventListener("keypress", ifMoz, false);
			}
		} catch (e) {
			// A cross-origin iframe throws on contentWindow.document; there is nothing to attach to
		}
	}
}

function findIgnore(el) {
	return exclude.some((entry) => (entry.length > 0) && ((el.name === entry) || (el.id === entry)));
}

function keyPressHandler(e) {
	const el = e.target;
	const code = e.which;
	if (e.ctrlKey) {
		return;
	}
	if (e.altKey && (code !== 92) && (code !== 126)) {
		return;
	}
	if (!INPUT_TYPES.includes(el.type)) {
		if (el.isContentEditable) {
			ifMoz(e);
		}
		return;
	}
	if (checkCode(code)) {
		return;
	}
	AVIMObj.sk = fromCharCode(code);
	if (findIgnore(el) || el.readOnly) {
		return;
	}
	start(el, e);
	if (AVIMObj.changed) {
		AVIMObj.changed = false;
		e.preventDefault();
	}
}

const CTRL_KEY_CODE = 17;
const DOUBLE_TAP_MS = 300;

let isPressCtrl = false;

/** Tapping Ctrl twice within 300ms toggles AVIM off and on. */
function keyUpHandler(evt) {
	if (evt.which !== CTRL_KEY_CODE) {
		isPressCtrl = false;
		return;
	}
	if (isPressCtrl) {
		isPressCtrl = false;
		sendRequest({ turn_avim: "onOff" }, configAVIM);
		return;
	}
	isPressCtrl = true;
	setTimeout(() => {
		isPressCtrl = false;
	}, DOUBLE_TAP_MS);
}

let ajaxCounter = 0;

/** Rescans for iframes every 100ms for the first 100 rounds, to catch ones added after load. */
function AVIMAJAXFix() {
	AVIMInit(AVIMObj);
	ajaxCounter++;
	if (ajaxCounter < 100) {
		setTimeout(AVIMAJAXFix, 100);
	}
}

function removeOldAVIM() {
	document.removeEventListener("mouseup", AVIMAJAXFix, false);
	document.removeEventListener("keypress", keyPressHandler, true);
	document.removeEventListener("keyup", keyUpHandler, true);

	AVIMInit(AVIMObj);
	AVIMObj = null;
}

function newAVIMInit() {
	if (AVIMObj) {
		removeOldAVIM();
	}

	AVIMObj = new AVIM();
	AVIMAJAXFix();

	document.addEventListener("mouseup", AVIMAJAXFix, false);
	document.addEventListener("keyup", keyUpHandler, true);
	document.addEventListener("keypress", keyPressHandler, true);
}

/** The single entry point the background service worker uses to push prefs into a content script. */
function configAVIM(data) {
	if (data) {
		method = data.method;
		onOff = data.onOff;
		checkSpell = data.ckSpell;
		oldAccent = data.oldAccent;
	}

	newAVIMInit();
}

sendRequest({ get_prefs: "all" }, configAVIM);

extension.onMessage.addListener(configAVIM);

